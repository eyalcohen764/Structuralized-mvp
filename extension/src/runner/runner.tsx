import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  STORAGE_KEY,
  APP_ORIGIN_KEY,
  DEFAULT_APP_ORIGIN,
  type SessionRuntimeState,
  type SessionPlan,
} from "../shared";

function formatTime(ts: number) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDateTime(ts: number) {
  const d = new Date(ts);
  return d.toLocaleString([], {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(ms: number) {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function titleForBlock(
  index: number,
  total: number,
  b: { type: string; topic?: string },
) {
  const base = `Block ${index + 1}/${total}`;
  if (b.type === "work")
    return `${base} · Work${b.topic ? `: ${b.topic}` : ""}`;
  if (b.type === "break") return `${base} · Break`;
  return `${base} · Dynamic${b.topic ? `: ${b.topic}` : ""}`;
}

async function getAppOrigin(): Promise<string> {
  const res = await chrome.storage.local.get(APP_ORIGIN_KEY);
  return (res[APP_ORIGIN_KEY] as string) || DEFAULT_APP_ORIGIN;
}

async function openOrFocusUrl(url: string) {
  const tabs = await chrome.tabs.query({});
  const existing = tabs.find((t) => (t.url ?? "").startsWith(url));
  if (existing?.id) {
    await chrome.tabs.update(existing.id, { active: true, url });
    return;
  }
  await chrome.tabs.create({ url });
}

const cardStyle: React.CSSProperties = {
  border: "1px solid rgba(0,0,0,0.12)",
  borderRadius: 14,
  padding: 12,
  background: "white",
  boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
};

const btnBase: React.CSSProperties = {
  flex: 1,
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.2)",
  fontWeight: 800,
  cursor: "pointer",
  fontSize: 13,
};

function App() {
  const [state, setState] = useState<SessionRuntimeState>({
    status: "idle",
  } as any);
  const [origin, setOrigin] = useState<string>(DEFAULT_APP_ORIGIN);
  const [showPauseForm, setShowPauseForm] = useState(false);
  const [pauseReason, setPauseReason] = useState("");
  const [showStopConfirm, setShowStopConfirm] = useState(false);
  const [reflection, setReflection] = useState("");
  const [topic, setTopic] = useState("");
  const [feedbackError, setFeedbackError] = useState("");

  useEffect(() => {
    (async () => {
      setOrigin(await getAppOrigin());
      const res = await chrome.storage.local.get(STORAGE_KEY);
      setState(
        (res[STORAGE_KEY] as SessionRuntimeState) ??
          ({ status: "idle" } as any),
      );
    })();

    const onChanged: Parameters<
      typeof chrome.storage.onChanged.addListener
    >[0] = (changes, area) => {
      if (area === "local" && changes[STORAGE_KEY]) {
        setState(
          (changes[STORAGE_KEY].newValue as SessionRuntimeState) ??
            ({ status: "idle" } as any),
        );
      }
      if (area === "local" && changes[APP_ORIGIN_KEY]) {
        setOrigin(
          (changes[APP_ORIGIN_KEY].newValue as string) || DEFAULT_APP_ORIGIN,
        );
      }
    };

    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, []);

  const runningInfo = useMemo(() => {
    if (state.status !== "running") return null;

    const plan = (state as any).plan as SessionPlan;
    const idx = (state as any).currentIndex as number;
    const block = plan.blocks[idx];

    return {
      title: titleForBlock(idx, plan.blocks.length, block),
      startedAt: (state as any).currentBlockStartedAt as number,
      endsAt: (state as any).currentBlockEndsAt as number,
      runId: (state as any).runId as string,
    };
  }, [state]);

  const pausedInfo = useMemo(() => {
    if (state.status !== "paused") return null;

    const plan = (state as any).plan as SessionPlan;
    const idx = (state as any).currentIndex as number;
    const block = plan.blocks[idx];

    return {
      title: titleForBlock(idx, plan.blocks.length, block),
      remainingMs: (state as any).remainingMs as number,
    };
  }, [state]);

  const awaitingInfo = useMemo(() => {
    if (state.status !== "awaiting_feedback") return null;

    const endedTitle = (state as any).endedBlockTitle as string | undefined;
    const nextTitle = (state as any).nextBlockTitle as string | undefined;
    const needsTopic = Boolean((state as any).nextBlockNeedsTopic);
    const runId = (state as any).runId as string | undefined;
    const isStartPrompt = endedTitle === "Session starting";
    const isFinal = nextTitle === "Session complete ✅" || nextTitle === "Session stopped";
    const shouldAskTopic = isStartPrompt ? true : !isFinal && needsTopic;

    return {
      endedTitle: endedTitle ?? "",
      nextTitle: nextTitle ?? "",
      needsTopic,
      runId: runId ?? "",
      isStartPrompt,
      isFinal,
      shouldAskTopic,
    };
  }, [state]);

  // Reset feedback form when new block awaits
  useEffect(() => {
    if (awaitingInfo) {
      setReflection("");
      setTopic("");
      setFeedbackError("");
    }
  }, [awaitingInfo?.endedTitle, awaitingInfo?.runId]);

  const completedInfo = useMemo(() => {
    if (state.status !== "completed") return null;

    const runId = (state as any).runId as string | undefined;
    const reportEndedAt = (state as any).report?.endedAt as number | undefined;
    const reportStartedAt = (state as any).report?.startedAt as
      | number
      | undefined;
    const totalBlocks = (state as any).report?.blocks?.length as
      | number
      | undefined;
    const endedEarly = Boolean((state as any).report?.endedEarly);

    return { runId, reportStartedAt, reportEndedAt, totalBlocks, endedEarly };
  }, [state]);

  const openPlanner = async () => {
    const base = origin || DEFAULT_APP_ORIGIN;
    await openOrFocusUrl(`${base}/`);
  };

  const openReport = async () => {
    const base = origin || DEFAULT_APP_ORIGIN;
    const runId = (state as any).runId as string | undefined;
    if (!runId) return;
    await openOrFocusUrl(`${base}/report?runId=${encodeURIComponent(runId)}`);
  };

  const handlePauseClick = () => {
    setShowPauseForm(true);
    setPauseReason("");
  };

  const handlePauseSubmit = async () => {
    await chrome.runtime.sendMessage({
      type: "PAUSE_SESSION",
      payload: { reason: pauseReason },
    });
    setShowPauseForm(false);
    setPauseReason("");
  };

  const handlePauseCancel = () => {
    setShowPauseForm(false);
    setPauseReason("");
  };

  const handleResume = async () => {
    await chrome.runtime.sendMessage({ type: "RESUME_SESSION" });
  };

  const handleStopClick = () => {
    setShowPauseForm(false);
    setShowStopConfirm(true);
  };

  const handleStopConfirm = async () => {
    await chrome.runtime.sendMessage({ type: "STOP_SESSION" });
    setShowStopConfirm(false);
  };

  const handleStopCancel = () => {
    setShowStopConfirm(false);
  };

  const handleSubmitFeedback = async () => {
    if (!awaitingInfo) return;
    setFeedbackError("");

    const r = reflection.trim();
    const t = topic.trim();

    if (awaitingInfo.isStartPrompt) {
      if (!t) {
        setFeedbackError("Please enter a focus to start the dynamic block.");
        return;
      }
    } else {
      if (!r) {
        setFeedbackError("Please enter a reflection to continue.");
        return;
      }
      if (awaitingInfo.shouldAskTopic && !t) {
        setFeedbackError("Please enter a focus for the next dynamic block.");
        return;
      }
    }

    const res = await chrome.runtime.sendMessage({
      type: "SUBMIT_BLOCK_FEEDBACK",
      payload: {
        reflection: awaitingInfo.isStartPrompt ? "" : r,
        nextTopic: t || undefined,
      },
    });

    if (res?.ok === false) {
      setFeedbackError(res.error ?? "Something went wrong");
      return;
    }

    if (awaitingInfo.isFinal && awaitingInfo.runId) {
      await chrome.runtime.sendMessage({
        type: "OPEN_REPORT",
        payload: { runId: awaitingInfo.runId },
      });
    }
  };

  return (
    <div
      style={{
        width: state.status === "awaiting_feedback" ? 400 : 340,
        padding: 14,
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div style={{ fontWeight: 900, fontSize: 16 }}>Session State</div>
        <button
          onClick={openPlanner}
          style={{
            fontSize: 12,
            padding: "6px 10px",
            borderRadius: 999,
            border: "1px solid rgba(0,0,0,0.15)",
            background: "white",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          Open planner
        </button>
      </div>

      <div style={{ height: 10 }} />

      {state.status === "idle" && (
        <div style={{ opacity: 0.85, fontSize: 13 }}>
          No active session. Start one from your planner page.
        </div>
      )}

      {runningInfo && (
        <div style={cardStyle}>
          {showStopConfirm ? (
            <>
              <div style={{ fontWeight: 800, marginBottom: 6, color: "#c00" }}>Stop session?</div>
              <div style={{ fontSize: 13, opacity: 0.75, marginBottom: 12 }}>
                This will end the session immediately. No reflection will be recorded.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={handleStopConfirm}
                  style={{ ...btnBase, background: "#c00", color: "white", border: "none" }}
                >
                  Yes, Stop
                </button>
                <button
                  onClick={handleStopCancel}
                  style={{ ...btnBase, background: "#f5f5f5", color: "#555" }}
                >
                  Cancel
                </button>
              </div>
            </>
          ) : showPauseForm ? (
            <>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>
                Why are you pausing?
              </div>
              <textarea
                autoFocus
                value={pauseReason}
                onChange={(e) => setPauseReason(e.target.value)}
                placeholder="Reason for pausing..."
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  minHeight: 72,
                  padding: 8,
                  fontSize: 13,
                  borderRadius: 8,
                  border: "1px solid rgba(0,0,0,0.2)",
                  resize: "vertical",
                  fontFamily: "inherit",
                }}
              />
              <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                <button
                  onClick={handlePauseSubmit}
                  style={{ ...btnBase, background: "#111", color: "white" }}
                >
                  Confirm Pause
                </button>
                <button
                  onClick={handlePauseCancel}
                  style={{ ...btnBase, background: "#f5f5f5", color: "#555" }}
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 800 }}>{runningInfo.title}</div>

              <div style={{ marginTop: 8, fontSize: 13, opacity: 0.8 }}>
                <div>
                  <b>Started:</b> {formatDateTime(runningInfo.startedAt)}
                </div>
                <div style={{ marginTop: 4 }}>
                  <b>Ends:</b> {formatTime(runningInfo.endsAt)}
                </div>
              </div>

              <div style={{ marginTop: 10, fontSize: 12, opacity: 0.65 }}>
                You can switch tabs — the overlay modal will still appear.
              </div>

              <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                <button
                  onClick={handlePauseClick}
                  style={{ ...btnBase, background: "#f5f5f5", color: "#111" }}
                >
                  Pause
                </button>
                <button
                  onClick={handleStopClick}
                  style={{
                    ...btnBase,
                    background: "#fff0f0",
                    color: "#c00",
                    border: "1px solid rgba(200,0,0,0.25)",
                  }}
                >
                  Stop Session
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {pausedInfo && (
        <div style={{ ...cardStyle, background: "#fffbf0" }}>
          {showStopConfirm ? (
            <>
              <div style={{ fontWeight: 800, marginBottom: 6, color: "#c00" }}>Stop session?</div>
              <div style={{ fontSize: 13, opacity: 0.75, marginBottom: 12 }}>
                This will end the session immediately. No reflection will be recorded.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={handleStopConfirm}
                  style={{ ...btnBase, background: "#c00", color: "white", border: "none" }}
                >
                  Yes, Stop
                </button>
                <button
                  onClick={handleStopCancel}
                  style={{ ...btnBase, background: "#f5f5f5", color: "#555" }}
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
          <>
          <div style={{ fontWeight: 900, fontSize: 15 }}>Session Paused ⏸</div>

          <div style={{ marginTop: 6, fontSize: 13, opacity: 0.75 }}>
            {pausedInfo.title}
          </div>

          <div style={{ marginTop: 4, fontSize: 12, opacity: 0.6 }}>
            Remaining: {formatDuration(pausedInfo.remainingMs)}
          </div>

          <div style={{ marginTop: 8, fontSize: 12, opacity: 0.65 }}>
            All work content is hidden. No undocumented work possible.
          </div>

          <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
            <button
              onClick={handleResume}
              style={{ ...btnBase, background: "#111", color: "white" }}
            >
              Resume
            </button>
            <button
              onClick={handleStopClick}
              style={{
                ...btnBase,
                background: "#fff0f0",
                color: "#c00",
                border: "1px solid rgba(200,0,0,0.25)",
              }}
            >
              Stop Session
            </button>
          </div>
          </>
          )}
        </div>
      )}

      {awaitingInfo && (
        <div
          style={{
            ...cardStyle,
            width: "100%",
            minWidth: 320,
            maxWidth: 420,
          }}
        >
          <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 8 }}>
            {awaitingInfo.isStartPrompt
              ? "Before we begin"
              : awaitingInfo.isFinal
                ? "Final block finished"
                : "Block finished"}
          </div>
          <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 10 }}>
            <div>
              <b>Just ended:</b> {awaitingInfo.endedTitle}
            </div>
            <div style={{ marginTop: 4 }}>
              <b>{awaitingInfo.isFinal ? "Status:" : "Next:"}</b> {awaitingInfo.nextTitle}
            </div>
          </div>

          {!awaitingInfo.isStartPrompt && (
            <>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Quick reflection</div>
              <textarea
                value={reflection}
                onChange={(e) => setReflection(e.target.value)}
                placeholder="Describe the main things you actually did in practice during this block..."
                rows={3}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  borderRadius: 12,
                  border: "1px solid rgba(0,0,0,0.2)",
                  padding: 10,
                  fontSize: 13,
                  resize: "vertical",
                  fontFamily: "inherit",
                  marginBottom: 10,
                }}
              />
            </>
          )}

          {awaitingInfo.shouldAskTopic && (
            <>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>
                {awaitingInfo.isStartPrompt
                  ? "What is the focus of this first block?"
                  : "Dynamic focus for the next block"}
              </div>
              <input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder={
                  awaitingInfo.isStartPrompt
                    ? "What are you focusing on now?"
                    : "What are you focusing on next?"
                }
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  borderRadius: 12,
                  border: "1px solid rgba(0,0,0,0.2)",
                  padding: 10,
                  fontSize: 13,
                  fontFamily: "inherit",
                  marginBottom: 10,
                }}
              />
            </>
          )}

          {feedbackError && (
            <div style={{ color: "#b00020", fontSize: 12, marginBottom: 8 }}>
              {feedbackError}
            </div>
          )}

          <button
            onClick={handleSubmitFeedback}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(0,0,0,0.2)",
              background: "#111",
              color: "white",
              fontWeight: 800,
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            {awaitingInfo.isStartPrompt
              ? "Start"
              : awaitingInfo.isFinal
                ? "Complete"
                : "Continue"}
          </button>
        </div>
      )}

      {completedInfo && (
        <div style={cardStyle}>
          <div style={{ fontWeight: 900 }}>
            {completedInfo.endedEarly
              ? "Session stopped 🛑"
              : "Session complete ✅"}
          </div>

          <div style={{ marginTop: 8, fontSize: 13, opacity: 0.85 }}>
            {completedInfo.reportStartedAt && (
              <div>
                <b>Started:</b> {formatDateTime(completedInfo.reportStartedAt)}
              </div>
            )}
            {completedInfo.reportEndedAt && (
              <div style={{ marginTop: 4 }}>
                <b>Ended:</b> {formatDateTime(completedInfo.reportEndedAt)}
              </div>
            )}
            {typeof completedInfo.totalBlocks === "number" && (
              <div style={{ marginTop: 4 }}>
                <b>Blocks:</b> {completedInfo.totalBlocks}
              </div>
            )}
          </div>

          <button
            onClick={openReport}
            style={{
              marginTop: 12,
              width: "100%",
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(0,0,0,0.2)",
              background: "#111",
              color: "white",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            View report
          </button>
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
