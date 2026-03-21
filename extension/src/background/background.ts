import {
  ALARM_NAME,
  REMIND_ALARM_NAME,
  APP_ORIGIN_KEY,
  STORAGE_KEY,
  REPORT_PREFIX,
  LATEST_REPORT_KEY,
  resolveSettings,
  type BlockSettings,
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

async function setState(state: SessionRuntimeState) {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}
async function getState(): Promise<SessionRuntimeState> {
  const res = await chrome.storage.local.get(STORAGE_KEY);
  return (res[STORAGE_KEY] as SessionRuntimeState) ?? { status: "idle" };
}

const NOTIF_CLEAR_ALARM_PREFIX = "clear_notif_";

function msFromMinutes(min: number) {
  return Math.max(1, Math.floor(min)) * 60_000;
}
function now() {
  return Date.now();
}
function newRunId() {
  return crypto.randomUUID();
}

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

function isRestrictedUrl(url: string): boolean {
  return (
    url.startsWith("chrome://") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("https://chrome.google.com/webstore")
  );
}

type AwaitingFeedbackState = Extract<
  SessionRuntimeState,
  { status: "awaiting_feedback" }
>;
type FeedbackModalPayload = Extract<
  Msg,
  { type: "SHOW_FEEDBACK_MODAL" }
>["payload"];

/** Same fields as alarm-driven modal — keeps Snooze visible after tab/window switches */
function feedbackModalPayloadFromAwaitingState(
  s: AwaitingFeedbackState,
  options?: { nextTitleOverride?: string },
): FeedbackModalPayload {
  const { endedBlock, resolvedSettings, snoozeCount, plan, nextIndex } = s;
  const endedBlockType = endedBlock.type;

  const snoozeMax =
    endedBlockType === "break"
      ? (resolvedSettings.returnMaxCount ?? 0)
      : (resolvedSettings.endMaxCount ?? 0);
  const maxSnoozeMinutes =
    endedBlockType === "break"
      ? (resolvedSettings.returnSnoozeMaxMinutes ?? 10)
      : (resolvedSettings.endSnoozeMaxMinutes ?? 15);

  return {
    endedTitle: s.endedBlockTitle,
    nextTitle: options?.nextTitleOverride ?? s.nextBlockTitle,
    nextNeedsTopic: s.nextBlockNeedsTopic,
    isFinal: nextIndex >= plan.blocks.length,
    runId: s.runId,
    inputRequired:
      endedBlockType === "break"
        ? (resolvedSettings.breakInputRequired ?? false)
        : (resolvedSettings.inputRequired ?? false),
    snoozeMax,
    maxSnoozeMinutes,
    snoozeCount,
    endedBlockType,
  };
}

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

async function openWebReportPage(runId: string) {
  const { [APP_ORIGIN_KEY]: origin } = await chrome.storage.local.get(APP_ORIGIN_KEY);
  const base = (origin as string) || "http://localhost:5173";
  const url = `${base}/report?runId=${encodeURIComponent(runId)}`;
  await chrome.tabs.create({ url });
}

function titleForBlock(index: number, total: number, b: { type: string; topic?: string }) {
  const base = `Block ${index + 1}/${total}`;
  if (b.type === "work") return `${base} · Work${b.topic ? `: ${b.topic}` : ""}`;
  if (b.type === "break") return `${base} · Break`;
  return `${base} · Dynamic${b.topic ? `: ${b.topic}` : ""}`;
}

function ensureReport(plan: SessionPlan, runId: string): SessionReport {
  return {
    runId,
    planId: plan.planId,
    startedAt: now(),
    blocks: [],
    globalSettings: plan.globalSettings,
  };
}

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

function computeSessionEndsAt(
  currentBlockEndsAt: number,
  currentIndex: number,
  plan: SessionPlan,
): number {
  const remainingBlocksMs = plan.blocks
    .slice(currentIndex + 1)
    .reduce((sum, b) => sum + b.minutes * 60_000, 0);
  return currentBlockEndsAt + remainingBlocksMs;
}

function scheduleRemindAlarm(plan: SessionPlan, currentIndex: number): void {
  const resolved = resolveSettings(plan, currentIndex);
  const blockType = plan.blocks[currentIndex].type;
  const announceEvery =
    blockType === "break"
      ? (resolved.breakAnnounceEveryMinutes ?? 0)
      : (resolved.workAnnounceEveryMinutes ?? 0);
  if (announceEvery > 0) {
    chrome.alarms.create(REMIND_ALARM_NAME, { periodInMinutes: announceEvery });
  }
}

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
  scheduleRemindAlarm(plan, currentIndex);

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
}

// ─── Alarm handler ────────────────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name.startsWith(NOTIF_CLEAR_ALARM_PREFIX)) {
    const notifId = alarm.name.slice(NOTIF_CLEAR_ALARM_PREFIX.length);
    await chrome.notifications.clear(notifId);
    return;
  }

  if (alarm.name === REMIND_ALARM_NAME) {
    const s = await getState();
    if (s.status !== "running") {
      await chrome.alarms.clear(REMIND_ALARM_NAME);
      return;
    }
    const sessionEndsAt = computeSessionEndsAt(
      s.currentBlockEndsAt,
      s.currentIndex,
      s.plan,
    );
    await notifyActiveTab({ type: "SPEAK_TIME_UPDATE", payload: { sessionEndsAt } });
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
        payload: feedbackModalPayloadFromAwaitingState(awaiting),
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
      payload: feedbackModalPayloadFromAwaitingState(awaiting),
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
            payload: feedbackModalPayloadFromAwaitingState(startPromptState, {
              nextTitleOverride: `Choose focus for: ${firstTitle}`,
            }),
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
      await chrome.alarms.clear(REMIND_ALARM_NAME);

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
      scheduleRemindAlarm(s.plan, s.currentIndex);

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
      await chrome.alarms.clear(REMIND_ALARM_NAME);

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
      scheduleRemindAlarm(s.plan, endedBlockIndex);

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

async function showFeedbackOnActiveTab(tabId: number) {
  const s = await getState();
  if (s.status !== "awaiting_feedback") return;

  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab?.url || isRestrictedUrl(tab.url)) return;

  const msg: Msg = {
    type: "SHOW_FEEDBACK_MODAL",
    payload: feedbackModalPayloadFromAwaitingState(s),
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
