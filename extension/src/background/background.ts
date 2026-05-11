/**
 * background.ts — MV3 service worker that drives the session state machine: schedules Chrome alarms, routes messages between the website, popup, and content script, and persists completed SessionReports to chrome.storage.local.
 */
import {
  ALARM_NAME,
  APP_ORIGIN_KEY,
  STORAGE_KEY,
  REPORT_PREFIX,
  LATEST_REPORT_KEY,
  TA_ALARM_PREFIX,
  PRE_END_THRESHOLDS,
  resolveSettings,
  type BlockSettings,
  type BlockType,
  type Msg,
  type PauseRecord,
  type PendingSnooze,
  type SnoozeRecord,
  type SessionPlan,
  type SessionRuntimeState,
  type SessionReport,
  type ReportBlock,
  type StartSessionExternalMsg,
} from "../shared";

/** Persists the current session state to chrome.storage.local. */
async function setState(state: SessionRuntimeState) {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}
/** Reads the current session state from chrome.storage.local; returns idle if not set. */
async function getState(): Promise<SessionRuntimeState> {
  const res = await chrome.storage.local.get(STORAGE_KEY);
  return (res[STORAGE_KEY] as SessionRuntimeState) ?? { status: "idle" };
}

const NOTIF_CLEAR_ALARM_PREFIX = "clear_notif_";

/** Converts minutes to milliseconds, with a minimum of one minute. */
function msFromMinutes(min: number) {
  return Math.max(1, Math.floor(min)) * 60_000;
}
/** Returns the current time as epoch milliseconds. */
function now() {
  return Date.now();
}
/** Generates a unique UUID run ID for each new session. */
function newRunId() {
  return crypto.randomUUID();
}

/** Sends a message to a tab; if the content script is not yet loaded, injects it first then sends. */
async function sendOrInject(tabId: number, msg: Msg) {
  try {
    await chrome.tabs.sendMessage(tabId, msg);
    return;
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
    await chrome.tabs.sendMessage(tabId, msg);
  }
}

/** Creates a Chrome notification that auto-clears after ttlMs milliseconds. */
async function createEphemeralNotification(
  title: string,
  message: string,
  ttlMs = 60_000
) {
  const id = crypto.randomUUID();
  await chrome.notifications.create(id, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icon.png"),
    title,
    message,
  });
  chrome.alarms.create(NOTIF_CLEAR_ALARM_PREFIX + id, { when: now() + ttlMs });
  return id;
}

/** Returns true for URLs where content script injection is forbidden (chrome://, Web Store, etc.). */
function isRestrictedUrl(url: string): boolean {
  return (
    url.startsWith("chrome://") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("https://chrome.google.com/webstore")
  );
}

/** Sends a message to the active tab of the current window; falls back to a Chrome notification if the tab is restricted or unavailable. */
async function notifyActiveTab(msg: Msg, fallbackTitle: string, fallbackBody: string) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id) {
    await createEphemeralNotification(fallbackTitle, fallbackBody, 60_000);
    return;
  }

  const url = tab.url ?? "";
  if (isRestrictedUrl(url)) {
    await createEphemeralNotification(fallbackTitle, fallbackBody, 60_000);
    return;
  }

  try {
    await sendOrInject(tab.id, msg);
  } catch {
    await createEphemeralNotification(fallbackTitle, fallbackBody, 60_000);
  }
}

/** Broadcast feedback modal to active tab of EVERY window so it follows the user */
async function notifyAllWindowsFeedbackModal(
  msg: Extract<Msg, { type: "SHOW_FEEDBACK_MODAL" }>,
  fallbackTitle: string,
  fallbackBody: string
) {
  const windows = await chrome.windows.getAll({ populate: true });
  let anySent = false;

  for (const win of windows) {
    const activeTab = win.tabs?.find((t) => t.active && t.id);
    if (!activeTab?.id) continue;

    const url = activeTab.url ?? "";
    if (isRestrictedUrl(url)) continue;

    try {
      await sendOrInject(activeTab.id, msg);
      anySent = true;
    } catch {
      // skip this tab
    }
  }

  if (!anySent) {
    await createEphemeralNotification(fallbackTitle, fallbackBody, 60_000);
  }
}

/** Sends HIDE_FEEDBACK_MODAL to every open tab to dismiss the feedback modal everywhere. */
async function hideFeedbackModalAllTabs() {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!tab.id) continue;
    try {
      await chrome.tabs.sendMessage(tab.id, { type: "HIDE_FEEDBACK_MODAL" });
    } catch {
      // Content script not loaded (restricted page, etc.) — ignore
    }
  }
}

/** Opens a new tab to the web report page for the given runId. */
async function openWebReportPage(runId: string) {
  const { [APP_ORIGIN_KEY]: origin } = await chrome.storage.local.get(APP_ORIGIN_KEY);
  const base = (origin as string) || "http://localhost:5173";
  const url = `${base}/report?runId=${encodeURIComponent(runId)}`;
  await chrome.tabs.create({ url });
}

/** Builds the UI title string for a block, including its number, type, and topic. */
function titleForBlock(index: number, total: number, b: { type: string; topic?: string }) {
  const base = `Block ${index + 1}/${total}`;
  if (b.type === "work") return `${base} · Work${b.topic ? `: ${b.topic}` : ""}`;
  if (b.type === "break") return `${base} · Break`;
  return `${base} · Dynamic${b.topic ? `: ${b.topic}` : ""}`;
}

/** Creates an empty SessionReport at the start of a new session. */
function ensureReport(plan: SessionPlan, runId: string): SessionReport {
  return {
    runId,
    planId: plan.planId,
    startedAt: now(),
    blocks: [],
    globalSettings: plan.globalSettings,
  };
}

/** Closes all pending snoozes into SnoozeRecords with resumedAt, then merges them with prior snooze history. */
function finalizeSnoozes(
  currentSnoozes: PendingSnooze[],
  priorSnoozes: SnoozeRecord[] | undefined,
  resumedAt: number
): SnoozeRecord[] | undefined {
  const prior = priorSnoozes ?? [];
  if (currentSnoozes.length === 0 && prior.length === 0) return undefined;

  const newRecord: SnoozeRecord[] = currentSnoozes.map((ps) => ({
    snoozedAt: ps.snoozedAt,
    resumedAt,
    minutes: ps.minutes,
  }));

  const all = [...prior, ...newRecord];
  return all.length > 0 ? all : undefined;
}

// ─── Time awareness helpers ──────────────────────────────────────────────────

/** Schedules spoken time-awareness alarms (quarter-milestones and pre-end countdowns) for the given block, accounting for already-elapsed active time. */
function scheduleTimeAwarenessAlerts(
  plan: SessionPlan,
  blockIndex: number,
  activeElapsedMs: number,
): void {
  const settings = resolveSettings(plan, blockIndex);
  const volume = settings.timeAwarenessVolume ?? 70;
  if (volume === 0) return;

  const block = plan.blocks[blockIndex];
  const durationMs = msFromMinutes(block.minutes);
  const nowMs = now();
  const isBreak = block.type === "break";

  // Quarter milestones (25%, 50%, 75%) — only for blocks >= 10 min
  const quarterEnabled = isBreak ? settings.breakQuarterAlerts : settings.quarterAlerts;
  if (quarterEnabled && block.minutes >= 10) {
    for (const pct of [25, 50, 75]) {
      const milestoneMs = durationMs * (pct / 100);
      if (activeElapsedMs < milestoneMs) {
        chrome.alarms.create(`${TA_ALARM_PREFIX}q${pct}_${blockIndex}`, {
          when: nowMs + (milestoneMs - activeElapsedMs),
        });
      }
    }
  }

  // Pre-end countdowns — ring every 5 min starting from preEndFrom before end
  const preEndFrom = isBreak
    ? (settings.breakPreEndFrom ?? 0)
    : (settings.preEndFrom ?? 0);

  if (preEndFrom > 0) {
    for (const threshold of PRE_END_THRESHOLDS) {
      if (threshold > preEndFrom) continue;
      const alertAtMs = durationMs - threshold * 60_000;
      if (alertAtMs > 0 && activeElapsedMs < alertAtMs) {
        chrome.alarms.create(`${TA_ALARM_PREFIX}pre${threshold}_${blockIndex}`, {
          when: nowMs + (alertAtMs - activeElapsedMs),
        });
      }
    }
  }
}

/** Cancels all pending time-awareness alarms (identified by the TA_ALARM_PREFIX). */
async function clearTimeAwarenessAlarms(): Promise<void> {
  const alarms = await chrome.alarms.getAll();
  for (const a of alarms) {
    if (a.name.startsWith(TA_ALARM_PREFIX)) {
      await chrome.alarms.clear(a.name);
    }
  }
}

/** Builds the spoken alert text from an alarm name, including the current clock time. */
function buildAlertText(alarmName: string): string {
  const clockTime = new Date().toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  // Quarter milestone: ta_q25_0, ta_q50_0, ta_q75_0
  const qMatch = alarmName.match(/q(\d+)_/);
  if (qMatch) {
    return `${qMatch[1]} percent of the block complete. The time is ${clockTime}.`;
  }

  // Pre-end countdown: ta_pre30_0, ta_pre5_0, etc.
  const preMatch = alarmName.match(/pre(\d+)_/);
  if (preMatch) {
    return `${preMatch[1]} minutes remaining. The time is ${clockTime}.`;
  }

  return `Time check. The time is ${clockTime}.`;
}

/** Transitions to the running state for the given block index: persists state, creates the alarm, shows the overlay, and schedules time-awareness alerts. */
async function startBlock(
  runId: string,
  origin: string | undefined,
  plan: SessionPlan,
  currentIndex: number,
  report: SessionReport,
  snoozeCount = 0,
  currentSnoozes: PendingSnooze[] = [],
  priorSnoozes?: SnoozeRecord[]
) {
  const block = plan.blocks[currentIndex];
  const startedAt = now();
  const endsAt = startedAt + msFromMinutes(block.minutes);

  const running: SessionRuntimeState = {
    status: "running",
    runId,
    origin,
    plan,
    currentIndex,
    currentBlockStartedAt: startedAt,
    currentBlockEndsAt: endsAt,
    currentPauses: [],
    snoozeCount,
    currentSnoozes,
    priorSnoozes,
    report,
  };

  await setState(running);
  chrome.alarms.create(ALARM_NAME, { when: endsAt });

  await notifyActiveTab(
    {
      type: "SHOW_RUNNING_OVERLAY",
      payload: {
        title: titleForBlock(currentIndex, plan.blocks.length, block),
        endsAt,
      },
    },
    "Session running",
    titleForBlock(currentIndex, plan.blocks.length, block)
  );

  scheduleTimeAwarenessAlerts(plan, currentIndex, 0);
}

// ─── Alarm handler ��───────────────────���───────────────────────────────────────

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name.startsWith(NOTIF_CLEAR_ALARM_PREFIX)) {
    const notifId = alarm.name.slice(NOTIF_CLEAR_ALARM_PREFIX.length);
    await chrome.notifications.clear(notifId);
    return;
  }

  // Time awareness spoken alerts
  if (alarm.name.startsWith(TA_ALARM_PREFIX)) {
    const s = await getState();
    if (s.status !== "running") return;

    const volume = resolveSettings(s.plan, s.currentIndex).timeAwarenessVolume ?? 70;
    if (volume === 0) return;

    const text = buildAlertText(alarm.name);
    await notifyActiveTab(
      { type: "SPEAK_ALERT", payload: { text, volume } },
      "Time alert",
      text,
    );
    return;
  }

  if (alarm.name !== ALARM_NAME) return;

  const s = await getState();
  if (s.status !== "running") return;

  const {
    plan,
    currentIndex,
    currentBlockStartedAt,
    currentBlockEndsAt,
    currentPauses,
    currentSnoozes,
    priorSnoozes,
    snoozeCount,
  } = s;

  const endedBlock = plan.blocks[currentIndex];
  const endedTitle = titleForBlock(currentIndex, plan.blocks.length, endedBlock);
  const resolvedSettings: BlockSettings = resolveSettings(plan, currentIndex);

  const nowMs = now();
  const allSnoozes = finalizeSnoozes(currentSnoozes, priorSnoozes, nowMs);

  const endedReportBlock: ReportBlock = {
    id: endedBlock.id,
    type: endedBlock.type,
    minutes: endedBlock.minutes,
    topic: endedBlock.topic,
    goals: endedBlock.goals,
    startedAt: currentBlockStartedAt,
    endedAt: currentBlockEndsAt,
    pauses: currentPauses.length > 0 ? currentPauses : undefined,
    snoozes: allSnoozes,
    plannedSettings: resolvedSettings,
  };

  const report: SessionReport = {
    ...s.report,
    blocks: [...s.report.blocks, endedReportBlock],
  };

  const nextIndex = currentIndex + 1;
  const isLast = nextIndex >= plan.blocks.length;

  // Compute snooze limits for the ended block type
  const snoozeMax =
    endedBlock.type === "break"
      ? (resolvedSettings.returnMaxCount ?? 0)
      : (resolvedSettings.endMaxCount ?? 0);
  const maxSnoozeMinutes =
    endedBlock.type === "break"
      ? (resolvedSettings.returnSnoozeMaxMinutes ?? 10)
      : (resolvedSettings.endSnoozeMaxMinutes ?? 15);

  if (isLast) {
    const awaiting: SessionRuntimeState = {
      status: "awaiting_feedback",
      runId: s.runId,
      origin: s.origin,
      plan,
      nextIndex: plan.blocks.length,
      report,
      endedBlock: endedReportBlock,
      endedBlockTitle: endedTitle,
      nextBlockTitle: "Session complete ✅",
      nextBlockNeedsTopic: false,
      endedBlockIndex: currentIndex,
      snoozeCount,
      resolvedSettings,
    };

    await setState(awaiting);

    await notifyAllWindowsFeedbackModal(
      {
        type: "SHOW_FEEDBACK_MODAL",
        payload: {
          endedTitle,
          nextTitle: "Session complete ✅",
          nextNeedsTopic: false,
          isFinal: true,
          runId: s.runId,
          inputRequired: endedBlock.type === 'break'
            ? (resolvedSettings.breakInputRequired ?? false)
            : (resolvedSettings.inputRequired ?? false),
          snoozeMax,
          maxSnoozeMinutes,
          snoozeCount,
          endedBlockType: endedBlock.type,
          alertVolume: resolvedSettings.alertVolume ?? 80,
        },
      },
      "Session complete",
      "Open a normal tab to view your report."
    );

    return;
  }

  const nextBlock = plan.blocks[nextIndex];
  const nextTitle = titleForBlock(nextIndex, plan.blocks.length, nextBlock);
  const nextNeedsTopic = nextBlock.type === "dynamic" && !nextBlock.topic;

  const awaiting: SessionRuntimeState = {
    status: "awaiting_feedback",
    runId: s.runId,
    origin: s.origin,
    plan,
    nextIndex,
    report,
    endedBlock: endedReportBlock,
    endedBlockTitle: endedTitle,
    nextBlockTitle: nextTitle,
    nextBlockNeedsTopic: nextNeedsTopic,
    endedBlockIndex: currentIndex,
    snoozeCount,
    resolvedSettings,
  };

  await setState(awaiting);

  await notifyAllWindowsFeedbackModal(
    {
      type: "SHOW_FEEDBACK_MODAL",
      payload: {
        endedTitle,
        nextTitle,
        nextNeedsTopic,
        isFinal: false,
        runId: s.runId,
        inputRequired: endedBlock.type === 'break'
          ? (resolvedSettings.breakInputRequired ?? false)
          : (resolvedSettings.inputRequired ?? false),
        snoozeMax,
        maxSnoozeMinutes,
        snoozeCount,
        endedBlockType: endedBlock.type,
        alertVolume: resolvedSettings.alertVolume ?? 80,
      },
    },
    "Block finished",
    "Open a normal tab to reflect."
  );
});

// ─── External messages (Website → Extension) ──────────────────────────────────

chrome.runtime.onMessageExternal.addListener((msg: unknown, _sender, sendResponse) => {
  (async () => {
    const m = msg as StartSessionExternalMsg;

    if (m?.type === "START_SESSION") {
      const origin = m.payload?.origin;
      const plan = m.payload?.plan;

      if (origin) await chrome.storage.local.set({ [APP_ORIGIN_KEY]: origin });

      if (!plan?.blocks?.length) {
        sendResponse({ ok: false, error: "Missing plan.blocks" });
        return;
      }

      const runId = newRunId();
      const report = ensureReport(plan, runId);

      const first = plan.blocks[0];
      const firstTitle = titleForBlock(0, plan.blocks.length, first);

      if (first.type === "dynamic" && !first.topic) {
        const startPromptState: SessionRuntimeState = {
          status: "awaiting_feedback",
          runId,
          origin,
          plan,
          nextIndex: 0,
          report,
          endedBlock: {
            id: "_start_",
            type: "dynamic",
            minutes: 0,
            topic: undefined,
            startedAt: now(),
            endedAt: now(),
          },
          endedBlockTitle: "Session starting",
          nextBlockTitle: firstTitle,
          nextBlockNeedsTopic: true,
          endedBlockIndex: -1,
          snoozeCount: 0,
          resolvedSettings: resolveSettings(plan, 0),
        };

        await setState(startPromptState);

        await notifyAllWindowsFeedbackModal(
          {
            type: "SHOW_FEEDBACK_MODAL",
            payload: {
              endedTitle: "Session starting",
              nextTitle: `Choose focus for: ${firstTitle}`,
              nextNeedsTopic: true,
              isFinal: false,
              runId,
              inputRequired: false,
              snoozeMax: 0,
              maxSnoozeMinutes: 0,
              snoozeCount: 0,
              endedBlockType: "dynamic",
              alertVolume: startPromptState.resolvedSettings.alertVolume ?? 80,
            },
          },
          "Session starting",
          "Choose a focus for your first dynamic block."
        );

        sendResponse({ ok: true, runId });
        return;
      }

      await startBlock(runId, origin, plan, 0, report);
      sendResponse({ ok: true, runId });
      return;
    }

    if ((msg as { type?: string })?.type === "GET_REPORT") {
      const payload = (msg as { payload?: { runId?: string } })?.payload;
      const runId = payload?.runId as string | undefined;

      if (runId) {
        const res = await chrome.storage.local.get(REPORT_PREFIX + runId);
        sendResponse({ ok: true, report: res[REPORT_PREFIX + runId] ?? null });
        return;
      }

      const latest = await chrome.storage.local.get(LATEST_REPORT_KEY);
      const latestRunId = latest[LATEST_REPORT_KEY] as string | undefined;

      if (!latestRunId) {
        sendResponse({ ok: true, report: null });
        return;
      }

      const res = await chrome.storage.local.get(REPORT_PREFIX + latestRunId);
      sendResponse({ ok: true, report: res[REPORT_PREFIX + latestRunId] ?? null });
      return;
    }

    if ((msg as { type?: string })?.type === "GET_STATE") {
      const state = await getState();
      sendResponse({ ok: true, state });
      return;
    }

    sendResponse({ ok: false, error: "Unknown external message" });
  })();

  return true;
});

// ─── Internal messages (Content / Popup → Background) ────────────────────────

chrome.runtime.onMessage.addListener((msg: unknown, _sender, sendResponse) => {
  (async () => {
    const m = msg as Msg;

    if (m?.type === "OPEN_REPORT") {
      const runId = String((m as { payload?: { runId?: unknown } }).payload?.runId ?? "").trim();
      if (!runId) {
        sendResponse({ ok: false, error: "Missing runId" });
        return;
      }
      await openWebReportPage(runId);
      sendResponse({ ok: true });
      return;
    }

    if (m?.type === "PAUSE_SESSION") {
      const s = await getState();
      if (s.status !== "running") {
        sendResponse({ ok: false, error: "Not running" });
        return;
      }

      await chrome.alarms.clear(ALARM_NAME);
      await clearTimeAwarenessAlarms();

      const pausedAt = now();
      const remainingMs = Math.max(0, s.currentBlockEndsAt - pausedAt);
      const pauseReason = String((m as { payload?: { reason?: unknown } }).payload?.reason ?? "").trim() || undefined;

      const paused: SessionRuntimeState = {
        status: "paused",
        runId: s.runId,
        origin: s.origin,
        plan: s.plan,
        currentIndex: s.currentIndex,
        currentBlockStartedAt: s.currentBlockStartedAt,
        pausedAt,
        remainingMs,
        pauseReason,
        currentPauses: s.currentPauses,
        snoozeCount: s.snoozeCount,
        currentSnoozes: s.currentSnoozes,
        priorSnoozes: s.priorSnoozes,
        report: s.report,
      };

      await setState(paused);
      sendResponse({ ok: true });
      return;
    }

    if (m?.type === "RESUME_SESSION") {
      const s = await getState();
      if (s.status !== "paused") {
        sendResponse({ ok: false, error: "Not paused" });
        return;
      }

      const resumedAt = now();
      const newEndsAt = resumedAt + s.remainingMs;
      const closedPause: PauseRecord = { pausedAt: s.pausedAt, resumedAt, reason: s.pauseReason };
      const newPauses: PauseRecord[] = [...s.currentPauses, closedPause];

      const running: SessionRuntimeState = {
        status: "running",
        runId: s.runId,
        origin: s.origin,
        plan: s.plan,
        currentIndex: s.currentIndex,
        currentBlockStartedAt: s.currentBlockStartedAt,
        currentBlockEndsAt: newEndsAt,
        currentPauses: newPauses,
        snoozeCount: s.snoozeCount,
        currentSnoozes: s.currentSnoozes,
        priorSnoozes: s.priorSnoozes,
        report: s.report,
      };

      await setState(running);
      chrome.alarms.create(ALARM_NAME, { when: newEndsAt });

      const block = s.plan.blocks[s.currentIndex];
      await notifyActiveTab(
        {
          type: "SHOW_RUNNING_OVERLAY",
          payload: {
            title: titleForBlock(s.currentIndex, s.plan.blocks.length, block),
            endsAt: newEndsAt,
          },
        },
        "Session resumed",
        titleForBlock(s.currentIndex, s.plan.blocks.length, block)
      );

      // Reschedule time awareness alerts with correct active elapsed time
      const totalPauseDuration = newPauses.reduce(
        (sum, p) => sum + (p.resumedAt - p.pausedAt), 0,
      );
      const activeElapsed = resumedAt - s.currentBlockStartedAt - totalPauseDuration;
      scheduleTimeAwarenessAlerts(s.plan, s.currentIndex, activeElapsed);

      sendResponse({ ok: true });
      return;
    }

    if (m?.type === "STOP_SESSION") {
      const s = await getState();
      if (s.status !== "running" && s.status !== "paused") {
        sendResponse({ ok: false, error: "Not running or paused" });
        return;
      }

      await chrome.alarms.clear(ALARM_NAME);
      await clearTimeAwarenessAlarms();

      const stoppedAt = now();
      let currentPauses: PauseRecord[];

      if (s.status === "paused") {
        currentPauses = [
          ...s.currentPauses,
          { pausedAt: s.pausedAt, resumedAt: stoppedAt, reason: s.pauseReason },
        ];
      } else {
        currentPauses = s.currentPauses;
      }

      // Finalize any pending snooze
      const allSnoozes = finalizeSnoozes(s.currentSnoozes, s.priorSnoozes, stoppedAt);

      const block = s.plan.blocks[s.currentIndex];

      const endedReportBlock: ReportBlock = {
        id: block.id,
        type: block.type,
        minutes: block.minutes,
        topic: block.topic,
        goals: block.goals,
        startedAt: s.currentBlockStartedAt,
        endedAt: stoppedAt,
        pauses: currentPauses.length > 0 ? currentPauses : undefined,
        snoozes: allSnoozes,
        plannedSettings: resolveSettings(s.plan, s.currentIndex),
      };

      const report: SessionReport = {
        ...s.report,
        blocks: [...s.report.blocks, endedReportBlock],
      };

      const finalReport: SessionReport = {
        ...report,
        endedAt: stoppedAt,
        endedEarly: true,
      };

      await chrome.storage.local.set({
        [REPORT_PREFIX + s.runId]: finalReport,
        [LATEST_REPORT_KEY]: s.runId,
      });

      await setState({
        status: "completed",
        runId: s.runId,
        origin: s.origin,
        plan: s.plan,
        report: finalReport,
      });
      await hideFeedbackModalAllTabs();

      sendResponse({ ok: true });
      return;
    }

    if (m?.type === "SNOOZE_BLOCK") {
      const s = await getState();
      if (s.status !== "awaiting_feedback") {
        sendResponse({ ok: false, error: "Not awaiting feedback" });
        return;
      }

      const minutes = Number((m as { payload?: { minutes?: unknown } }).payload?.minutes ?? 0);
      const { resolvedSettings, snoozeCount, endedBlock, endedBlockIndex } = s;

      const snoozeMax =
        endedBlock.type === "break"
          ? (resolvedSettings.returnMaxCount ?? 0)
          : (resolvedSettings.endMaxCount ?? 0);
      const maxSnoozeMinutes =
        endedBlock.type === "break"
          ? (resolvedSettings.returnSnoozeMaxMinutes ?? 10)
          : (resolvedSettings.endSnoozeMaxMinutes ?? 15);

      if (!Number.isFinite(minutes) || minutes < 1 || minutes > maxSnoozeMinutes) {
        sendResponse({ ok: false, error: `Snooze minutes must be 1–${maxSnoozeMinutes}` });
        return;
      }

      if (snoozeCount >= snoozeMax) {
        sendResponse({ ok: false, error: "Snooze limit reached" });
        return;
      }

      const nowMs = now();
      const endsAt = nowMs + minutes * 60_000;
      const pendingSnooze: PendingSnooze = { snoozedAt: nowMs, minutes };

      // Pop endedBlock from report.blocks (it was added when alarm fired)
      const reportWithoutEnded: SessionReport = {
        ...s.report,
        blocks: s.report.blocks.slice(0, -1),
      };

      const running: SessionRuntimeState = {
        status: "running",
        runId: s.runId,
        origin: s.origin,
        plan: s.plan,
        currentIndex: endedBlockIndex,
        currentBlockStartedAt: endedBlock.startedAt,
        currentBlockEndsAt: endsAt,
        currentPauses: [],
        snoozeCount: snoozeCount + 1,
        currentSnoozes: [pendingSnooze],
        priorSnoozes: endedBlock.snoozes,
        report: reportWithoutEnded,
      };

      await setState(running);
      chrome.alarms.create(ALARM_NAME, { when: endsAt });
      await hideFeedbackModalAllTabs(); // closes modal + stops audio on every tab

      const block = s.plan.blocks[endedBlockIndex];
      await notifyActiveTab(
        {
          type: "SHOW_RUNNING_OVERLAY",
          payload: {
            title: titleForBlock(endedBlockIndex, s.plan.blocks.length, block),
            endsAt,
          },
        },
        "Snooze active",
        titleForBlock(endedBlockIndex, s.plan.blocks.length, block)
      );

      // Schedule time awareness for the snooze period (most won't apply for short snoozes)
      scheduleTimeAwarenessAlerts(s.plan, endedBlockIndex, 0);

      sendResponse({ ok: true });
      return;
    }

    if (m?.type === "SUBMIT_BLOCK_FEEDBACK") {
      const s = await getState();
      if (s.status !== "awaiting_feedback") {
        sendResponse({ ok: false, error: "Not awaiting feedback" });
        return;
      }

      const reflection = String((m as { payload?: { reflection?: unknown } }).payload?.reflection ?? "").trim();
      const nextTopic = String((m as { payload?: { nextTopic?: unknown } }).payload?.nextTopic ?? "").trim();

      const isStartPrompt = s.endedBlock?.id === "_start_";
      const { resolvedSettings } = s;

      const reflectionRequired = s.endedBlock.type === 'break'
        ? (resolvedSettings.breakInputRequired ?? false)
        : (resolvedSettings.inputRequired ?? false);
      if (!isStartPrompt && reflectionRequired && !reflection) {
        sendResponse({ ok: false, error: "Reflection required" });
        return;
      }

      if (s.nextBlockNeedsTopic && !nextTopic) {
        sendResponse({ ok: false, error: "Next topic required" });
        return;
      }

      let blocks = [...s.report.blocks];
      if (!isStartPrompt && blocks.length > 0) {
        blocks[blocks.length - 1] = { ...blocks[blocks.length - 1], reflection };
      }

      const nextIndex = s.nextIndex;
      const plan = s.plan;
      const isFinalBlock = nextIndex >= plan.blocks.length;

      if (isFinalBlock) {
        const finalReport: SessionReport = {
          ...s.report,
          blocks,
          endedAt: now(),
        };
        await chrome.storage.local.set({
          [REPORT_PREFIX + s.runId]: finalReport,
          [LATEST_REPORT_KEY]: s.runId,
        });
        await setState({
          status: "completed",
          runId: s.runId,
          origin: s.origin,
          plan,
          report: finalReport,
        });
        await hideFeedbackModalAllTabs();
        sendResponse({ ok: true });
        return;
      }

      let planWithTopic = plan;
      if (s.nextBlockNeedsTopic) {
        planWithTopic = {
          ...plan,
          blocks: plan.blocks.map((b, i) =>
            i === nextIndex ? { ...b, topic: nextTopic } : b
          ),
        };
      }

      const report: SessionReport = { ...s.report, blocks };

      await startBlock(s.runId, s.origin, planWithTopic, nextIndex, report);
      await hideFeedbackModalAllTabs();
      sendResponse({ ok: true });
      return;
    }

    sendResponse({ ok: false, error: "Unknown message" });
  })();

  return true;
});

chrome.runtime.onInstalled.addListener(async () => {
  await setState({ status: "idle" });
});

/** Re-shows the feedback modal on a newly activated tab if the session is currently awaiting feedback. */
async function showFeedbackOnActiveTab(tabId: number) {
  const s = await getState();
  if (s.status !== "awaiting_feedback") return;

  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab?.url || isRestrictedUrl(tab.url)) return;

  const endedBlockType = s.endedBlock.type;
  const snoozeMax =
    endedBlockType === "break"
      ? (s.resolvedSettings.returnMaxCount ?? 0)
      : (s.resolvedSettings.endMaxCount ?? 0);
  const maxSnoozeMinutes =
    endedBlockType === "break"
      ? (s.resolvedSettings.returnSnoozeMaxMinutes ?? 10)
      : (s.resolvedSettings.endSnoozeMaxMinutes ?? 15);

  const msg: Msg = {
    type: "SHOW_FEEDBACK_MODAL",
    payload: {
      endedTitle: s.endedBlockTitle,
      nextTitle: s.nextBlockTitle,
      nextNeedsTopic: s.nextBlockNeedsTopic,
      isFinal: s.nextIndex >= s.plan.blocks.length,
      runId: s.runId,
      inputRequired: s.resolvedSettings.inputRequired ?? false,
      snoozeMax,
      maxSnoozeMinutes,
      snoozeCount: s.snoozeCount,
      endedBlockType,
      alertVolume: s.resolvedSettings.alertVolume ?? 80,
    },
  };

  try {
    await sendOrInject(tabId, msg);
  } catch {
    // tab may not support content scripts
  }
}

chrome.tabs.onActivated.addListener((info) => {
  showFeedbackOnActiveTab(info.tabId);
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  const [tab] = await chrome.tabs.query({ active: true, windowId });
  if (tab?.id) {
    showFeedbackOnActiveTab(tab.id);
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  if (!tab.active) return;
  showFeedbackOnActiveTab(tabId);
});
