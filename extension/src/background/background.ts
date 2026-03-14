import {
  ALARM_NAME,
  APP_ORIGIN_KEY,
  STORAGE_KEY,
  REPORT_PREFIX,
  LATEST_REPORT_KEY,
  type Msg,
  type SessionPlan,
  type SessionRuntimeState,
  type SessionReport,
  type ReportBlock,
  type PauseRecord,
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

async function sendOrInject(tabId: number, msg: any) {
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

async function notifyActiveTab(msg: Msg, fallbackTitle: string, fallbackBody: string) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id) {
    await createEphemeralNotification(fallbackTitle, fallbackBody, 60_000);
    return;
  }

  const url = tab.url ?? "";
  const isRestricted =
    url.startsWith("chrome://") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("https://chrome.google.com/webstore");

  if (isRestricted) {
    await createEphemeralNotification(fallbackTitle, fallbackBody, 60_000);
    return;
  }

  try {
    await sendOrInject(tab.id, msg);
  } catch {
    await createEphemeralNotification(fallbackTitle, fallbackBody, 60_000);
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
  return { runId, planId: plan.planId, startedAt: now(), blocks: [] };
}

async function startBlock(
  runId: string,
  origin: string | undefined,
  plan: SessionPlan,
  currentIndex: number,
  report: SessionReport
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
    } as any,
    "Session running",
    titleForBlock(currentIndex, plan.blocks.length, block)
  );
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  // Clear ephemeral notification alarms
  if (alarm.name.startsWith(NOTIF_CLEAR_ALARM_PREFIX)) {
    const notifId = alarm.name.slice(NOTIF_CLEAR_ALARM_PREFIX.length);
    await chrome.notifications.clear(notifId);
    return;
  }

  if (alarm.name !== ALARM_NAME) return;

  const s = await getState();
  if (s.status !== "running") return;

  const { plan, currentIndex, currentBlockStartedAt, currentBlockEndsAt, currentPauses } = s;
  const endedBlock = plan.blocks[currentIndex];

  const endedTitle = titleForBlock(currentIndex, plan.blocks.length, endedBlock);

  const endedReportBlock: ReportBlock = {
    id: endedBlock.id,
    type: endedBlock.type as any,
    minutes: endedBlock.minutes,
    topic: endedBlock.topic,
    startedAt: currentBlockStartedAt,
    endedAt: currentBlockEndsAt,
    pauses: currentPauses.length > 0 ? currentPauses : undefined,
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
    };

    await setState(awaiting);

    await notifyActiveTab(
      {
        type: "SHOW_FEEDBACK_MODAL",
        payload: {
          endedTitle,
          nextTitle: "Session complete ✅",
          nextNeedsTopic: false,
          isFinal: true,
          runId: s.runId,
        },
      } as any,
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
  };

  await setState(awaiting);

  await notifyActiveTab(
    {
      type: "SHOW_FEEDBACK_MODAL",
      payload: {
        endedTitle,
        nextTitle,
        nextNeedsTopic,
        isFinal: false,
        runId: s.runId,
      },
    } as any,
    "Block finished",
    "Open a normal tab to reflect."
  );
});

/** Website -> extension */
chrome.runtime.onMessageExternal.addListener((msg: any, _sender, sendResponse) => {
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
            type: "dynamic" as any,
            minutes: 0,
            topic: undefined,
            startedAt: now(),
            endedAt: now(),
          } as any,
          endedBlockTitle: "Session starting",
          nextBlockTitle: firstTitle,
          nextBlockNeedsTopic: true,
        };

        await setState(startPromptState);

        await notifyActiveTab(
          {
            type: "SHOW_FEEDBACK_MODAL",
            payload: {
              endedTitle: "Session starting",
              nextTitle: `Choose focus for: ${firstTitle}`,
              nextNeedsTopic: true,
              isFinal: false,
              runId,
            },
          } as any,
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

    if (msg?.type === "GET_REPORT") {
      const runId = msg?.payload?.runId as string | undefined;

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

    if (msg?.type === "GET_STATE") {
      const state = await getState();
      sendResponse({ ok: true, state });
      return;
    }

    sendResponse({ ok: false, error: "Unknown external message" });
  })();

  return true;
});

/** Content / Popup -> background */
chrome.runtime.onMessage.addListener((msg: any, _sender, sendResponse) => {
  (async () => {
    if (msg?.type === "OPEN_REPORT") {
      const runId = String(msg.payload?.runId ?? "").trim();
      if (!runId) {
        sendResponse({ ok: false, error: "Missing runId" });
        return;
      }
      await openWebReportPage(runId);
      sendResponse({ ok: true });
      return;
    }

    if (msg?.type === "PAUSE_SESSION") {
      const s = await getState();
      if (s.status !== "running") {
        sendResponse({ ok: false, error: "Not running" });
        return;
      }

      await chrome.alarms.clear(ALARM_NAME);

      const pausedAt = now();
      const remainingMs = Math.max(0, s.currentBlockEndsAt - pausedAt);

      const paused: SessionRuntimeState = {
        status: "paused",
        runId: s.runId,
        origin: s.origin,
        plan: s.plan,
        currentIndex: s.currentIndex,
        currentBlockStartedAt: s.currentBlockStartedAt,
        pausedAt,
        remainingMs,
        currentPauses: s.currentPauses,
        report: s.report,
      };

      await setState(paused);
      sendResponse({ ok: true });
      return;
    }

    if (msg?.type === "RESUME_SESSION") {
      const s = await getState();
      if (s.status !== "paused") {
        sendResponse({ ok: false, error: "Not paused" });
        return;
      }

      const resumedAt = now();
      const newEndsAt = resumedAt + s.remainingMs;
      const closedPause: PauseRecord = { pausedAt: s.pausedAt, resumedAt };
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
        } as any,
        "Session resumed",
        titleForBlock(s.currentIndex, s.plan.blocks.length, block)
      );

      sendResponse({ ok: true });
      return;
    }

    if (msg?.type === "STOP_SESSION") {
      const s = await getState();
      if (s.status !== "running" && s.status !== "paused") {
        sendResponse({ ok: false, error: "Not running or paused" });
        return;
      }

      await chrome.alarms.clear(ALARM_NAME);

      const stoppedAt = now();
      let currentPauses: PauseRecord[];

      if (s.status === "paused") {
        // Close the open pause at stop time
        currentPauses = [...s.currentPauses, { pausedAt: s.pausedAt, resumedAt: stoppedAt }];
      } else {
        currentPauses = s.currentPauses;
      }

      const block = s.plan.blocks[s.currentIndex];
      const endedTitle = titleForBlock(s.currentIndex, s.plan.blocks.length, block);

      const endedReportBlock: ReportBlock = {
        id: block.id,
        type: block.type as any,
        minutes: block.minutes,
        topic: block.topic,
        startedAt: s.currentBlockStartedAt,
        endedAt: stoppedAt,
        pauses: currentPauses.length > 0 ? currentPauses : undefined,
      };

      const report: SessionReport = {
        ...s.report,
        blocks: [...s.report.blocks, endedReportBlock],
      };

      const awaiting: SessionRuntimeState = {
        status: "awaiting_feedback",
        runId: s.runId,
        origin: s.origin,
        plan: s.plan,
        nextIndex: s.plan.blocks.length, // marks as past-end so submit flow saves the report
        report,
        endedBlock: endedReportBlock,
        endedBlockTitle: endedTitle,
        nextBlockTitle: "Session stopped",
        nextBlockNeedsTopic: false,
        isStopped: true,
      };

      await setState(awaiting);

      await notifyActiveTab(
        {
          type: "SHOW_FEEDBACK_MODAL",
          payload: {
            endedTitle,
            nextTitle: "Session stopped",
            nextNeedsTopic: false,
            isFinal: true,
            runId: s.runId,
          },
        } as any,
        "Session stopped",
        "Open a normal tab to write your reflection."
      );

      sendResponse({ ok: true });
      return;
    }

    if (msg?.type === "SUBMIT_BLOCK_FEEDBACK") {
      const s = await getState();
      if (s.status !== "awaiting_feedback") {
        sendResponse({ ok: false, error: "Not awaiting feedback" });
        return;
      }

      const reflection = String(msg.payload?.reflection ?? "").trim();
      const nextTopic = String(msg.payload?.nextTopic ?? "").trim();

      const isStartPrompt = (s as any).endedBlock?.id === "_start_";

      if (!isStartPrompt && !reflection) {
        sendResponse({ ok: false, error: "Reflection required" });
        return;
      }

      if ((s as any).nextBlockNeedsTopic && !nextTopic) {
        sendResponse({ ok: false, error: "Next topic required" });
        return;
      }

      let blocks = [...(s as any).report.blocks] as any[];
      if (!isStartPrompt && blocks.length > 0) {
        blocks[blocks.length - 1] = { ...blocks[blocks.length - 1], reflection };
      }

      const nextIndex = (s as any).nextIndex as number;
      const plan = (s as any).plan as SessionPlan;
      const isStopped = Boolean((s as any).isStopped);
      const isFinalBlock = nextIndex >= plan.blocks.length;

      if (isFinalBlock) {
        const finalReport: SessionReport = {
          ...(s as any).report,
          blocks,
          endedAt: now(),
          ...(isStopped && { endedEarly: true }),
        };
        await chrome.storage.local.set({
          [REPORT_PREFIX + (s as any).runId]: finalReport,
          [LATEST_REPORT_KEY]: (s as any).runId,
        });
        await setState({
          status: "completed",
          runId: (s as any).runId,
          origin: (s as any).origin,
          plan,
          report: finalReport,
        } as any);
        sendResponse({ ok: true });
        return;
      }

      let planWithTopic = plan;
      if ((s as any).nextBlockNeedsTopic) {
        planWithTopic = {
          ...plan,
          blocks: plan.blocks.map((b, i) =>
            i === nextIndex ? { ...b, topic: nextTopic } : b
          ),
        };
      }

      const report: SessionReport = { ...(s as any).report, blocks };

      await startBlock((s as any).runId, (s as any).origin, planWithTopic, nextIndex, report);
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
