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

function App() {
  const [state, setState] = useState<SessionRuntimeState>({
    status: "idle",
  } as any);
  const [origin, setOrigin] = useState<string>(DEFAULT_APP_ORIGIN);

  // Load origin + state on open, and subscribe to storage changes
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

  const awaitingInfo = useMemo(() => {
    if (state.status !== "awaiting_feedback") return null;

    const endedTitle = (state as any).endedBlockTitle as string | undefined;
    const nextTitle = (state as any).nextBlockTitle as string | undefined;
    const needsTopic = Boolean((state as any).nextBlockNeedsTopic);

    return { endedTitle, nextTitle, needsTopic };
  }, [state]);

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

    return { runId, reportStartedAt, reportEndedAt, totalBlocks };
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

  return (
    <div
      style={{
        width: 340,
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
        <div style={{ fontWeight: 900, fontSize: 16 }}>Session Extension</div>
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
        <div
          style={{
            border: "1px solid rgba(0,0,0,0.12)",
            borderRadius: 14,
            padding: 12,
            background: "white",
            boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
          }}
        >
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
        </div>
      )}

      {awaitingInfo && (
        <div
          style={{
            border: "1px solid rgba(0,0,0,0.12)",
            borderRadius: 14,
            padding: 12,
            background: "white",
            boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
          }}
        >
          <div style={{ fontWeight: 800 }}>Waiting for your input</div>
          <div style={{ marginTop: 8, fontSize: 13, opacity: 0.85 }}>
            {awaitingInfo.endedTitle && (
              <div>
                <b>Just ended:</b> {awaitingInfo.endedTitle}
              </div>
            )}
            {awaitingInfo.nextTitle && (
              <div style={{ marginTop: 4 }}>
                <b>Next:</b> {awaitingInfo.nextTitle}
                {awaitingInfo.needsTopic ? " (needs focus)" : ""}
              </div>
            )}
          </div>
          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.65 }}>
            If you don’t see the modal, click into any normal webpage tab.
          </div>
        </div>
      )}

      {completedInfo && (
        <div
          style={{
            border: "1px solid rgba(0,0,0,0.12)",
            borderRadius: 14,
            padding: 12,
            background: "white",
            boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
          }}
        >
          <div style={{ fontWeight: 900 }}>Session complete ✅</div>

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
