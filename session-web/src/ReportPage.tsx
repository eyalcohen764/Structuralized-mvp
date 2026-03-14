import { useEffect, useMemo, useState } from "react";
import {
  Container,
  Paper,
  Typography,
  Stack,
  Chip,
  Alert,
  Divider,
  Button,
  Box,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { Link as RouterLink } from "react-router-dom";
import { getExtensionIdAsync } from "./config";
import type { PauseRecord, ReportBlock, SessionReport } from "../../extension/src/shared";

// ─── Planned timeline ────────────────────────────────────────────────────────

type PlannedTimestamp = { plannedStart: number; plannedEnd: number };

/**
 * Reconstructs the ideal planned timeline from the session start time and
 * each block's planned minutes. Blocks are assumed to follow each other
 * with no gaps.
 */
function computePlannedTimestamps(
  blocks: ReportBlock[],
  report: SessionReport,
): PlannedTimestamp[] {
  const result: PlannedTimestamp[] = [];
  let cursor = report.startedAt;

  for (const block of blocks) {
    const plannedStart = cursor;
    const plannedEnd = cursor + block.minutes * 60_000;
    result.push({ plannedStart, plannedEnd });
    cursor = plannedEnd;
  }

  return result;
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

function formatTime(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatMinutes(ms: number): string {
  const total = ms / 60_000;
  return `${Math.round(total * 10) / 10} min`;
}

function formatDelta(deltaMs: number): string {
  if (Math.abs(deltaMs) < 15_000) return "—";
  const sign = deltaMs > 0 ? "+" : "−";
  return `${sign}${formatMinutes(Math.abs(deltaMs))}`;
}

// ─── Pause segments ───────────────────────────────────────────────────────────

type Segment =
  | { kind: "work"; label: string; startedAt: number; endedAt: number }
  | { kind: "pause"; startedAt: number; endedAt: number };

function buildSegments(block: ReportBlock): Segment[] {
  const pauses = block.pauses ?? [];
  if (pauses.length === 0) return [];

  const segments: Segment[] = [];
  let cursor = block.startedAt;

  for (const p of pauses) {
    if (p.pausedAt > cursor) {
      segments.push({ kind: "work", label: "Work", startedAt: cursor, endedAt: p.pausedAt });
    }
    segments.push({ kind: "pause", startedAt: p.pausedAt, endedAt: p.resumedAt });
    cursor = p.resumedAt;
  }

  if (cursor < block.endedAt) {
    segments.push({ kind: "work", label: "Work", startedAt: cursor, endedAt: block.endedAt });
  }

  return segments;
}

function PauseBreakdown({ pauses, blockStartedAt, blockEndedAt }: {
  pauses: PauseRecord[];
  blockStartedAt: number;
  blockEndedAt: number;
}) {
  const segments = buildSegments({ pauses } as any as ReportBlock & { startedAt: number; endedAt: number });
  // Re-derive since we called buildSegments with a partial object above — safer to inline:
  const allSegments: Segment[] = [];
  let cursor = blockStartedAt;

  for (const p of pauses) {
    if (p.pausedAt > cursor) {
      allSegments.push({ kind: "work", label: "Work", startedAt: cursor, endedAt: p.pausedAt });
    }
    allSegments.push({ kind: "pause", startedAt: p.pausedAt, endedAt: p.resumedAt });
    cursor = p.resumedAt;
  }
  if (cursor < blockEndedAt) {
    allSegments.push({ kind: "work", label: "Work", startedAt: cursor, endedAt: blockEndedAt });
  }

  void segments; // unused, allSegments is the correct derivation

  return (
    <Stack spacing={0.5} sx={{ mt: 1 }}>
      {allSegments.map((seg, i) => (
        <Stack
          key={i}
          direction="row"
          alignItems="center"
          spacing={1.5}
          sx={{
            px: 1.5,
            py: 0.75,
            borderRadius: 2,
            background: seg.kind === "pause" ? "rgba(255,200,0,0.1)" : "rgba(0,0,0,0.03)",
            border: seg.kind === "pause"
              ? "1px solid rgba(200,150,0,0.25)"
              : "1px solid rgba(0,0,0,0.07)",
          }}
        >
          <Typography
            variant="caption"
            sx={{
              fontWeight: 700,
              color: seg.kind === "pause" ? "warning.dark" : "text.secondary",
              minWidth: 40,
            }}
          >
            {seg.kind === "pause" ? "PAUSE" : seg.label.toUpperCase()}
          </Typography>
          <Typography variant="caption" sx={{ fontFamily: "monospace", color: "text.secondary" }}>
            {formatTime(seg.startedAt)} → {formatTime(seg.endedAt)}
          </Typography>
          <Typography variant="caption" sx={{ color: "text.disabled" }}>
            ({formatMinutes(seg.endedAt - seg.startedAt)})
          </Typography>
        </Stack>
      ))}
    </Stack>
  );
}

// ─── Planned vs Actual row ────────────────────────────────────────────────────

function PlannedActualRow({ block, planned }: {
  block: ReportBlock;
  planned: PlannedTimestamp;
}) {
  const plannedMs = block.minutes * 60_000;
  const actualMs = block.endedAt - block.startedAt;
  const deltaMs = actualMs - plannedMs;

  const deltaColor =
    Math.abs(deltaMs) < 15_000
      ? "text.secondary"
      : deltaMs > 0
      ? "warning.main"
      : "info.main";

  return (
    <Stack direction="row" spacing={1} sx={{ mt: 1, mb: 0.5 }}>
      {/* Planned */}
      <Box sx={{ flex: 1 }}>
        <Typography variant="caption" sx={{ color: "text.disabled", fontWeight: 700, letterSpacing: "0.05em" }}>
          PLANNED
        </Typography>
        <Typography sx={{ fontWeight: 600, fontSize: "0.9rem" }}>
          {formatMinutes(plannedMs)}
        </Typography>
        <Typography variant="body2" sx={{ fontFamily: "monospace", color: "text.secondary", fontSize: "0.78rem" }}>
          {formatTime(planned.plannedStart)} → {formatTime(planned.plannedEnd)}
        </Typography>
      </Box>

      {/* Actual */}
      <Box sx={{ flex: 1 }}>
        <Typography variant="caption" sx={{ color: "text.disabled", fontWeight: 700, letterSpacing: "0.05em" }}>
          ACTUAL
        </Typography>
        <Typography sx={{ fontWeight: 600, fontSize: "0.9rem" }}>
          {formatMinutes(actualMs)}
        </Typography>
        <Typography variant="body2" sx={{ fontFamily: "monospace", color: "text.secondary", fontSize: "0.78rem" }}>
          {formatTime(block.startedAt)} → {formatTime(block.endedAt)}
        </Typography>
      </Box>

      {/* Delta */}
      <Box sx={{ flex: 0.6 }}>
        <Typography variant="caption" sx={{ color: "text.disabled", fontWeight: 700, letterSpacing: "0.05em" }}>
          DELTA
        </Typography>
        <Typography sx={{ fontWeight: 600, fontSize: "0.9rem", color: deltaColor }}>
          {formatDelta(deltaMs)}
        </Typography>
      </Box>
    </Stack>
  );
}

// ─── URL helper ──────────────────────────────────────────────────────────────

function runIdFromUrl(): string | null {
  const url = new URL(window.location.href);
  return url.searchParams.get("runId");
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReportPage() {
  const runId = useMemo(() => runIdFromUrl(), []);
  const [report, setReport] = useState<SessionReport | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const plannedTimestamps = useMemo<PlannedTimestamp[]>(
    () => (report ? computePlannedTimestamps(report.blocks, report) : []),
    [report],
  );

  useEffect(() => {
    setErr(null);

    if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
      setErr(
        "Chrome extension messaging isn't available here. Open this in Chrome with the extension loaded.",
      );
      return;
    }

    getExtensionIdAsync().then((extId) => {
      chrome.runtime.sendMessage(
        extId,
        { type: "GET_REPORT", payload: { runId: runId ?? undefined } },
        (res) => {
          const msg = chrome.runtime.lastError?.message;
          if (msg) {
            setErr(msg);
            return;
          }
          setReport(res?.report ?? null);
        },
      );
    });
  }, [runId]);

  return (
    <Container maxWidth="md" sx={{ py: 3 }}>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{ mb: 2 }}
      >
        <Stack>
          <Typography variant="h5" sx={{ fontWeight: 900 }}>
            Session Report
          </Typography>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {runId ? (
              <>
                Run ID: <code>{runId}</code>
              </>
            ) : (
              "Latest session"
            )}
          </Typography>
        </Stack>

        <Button
          component={RouterLink}
          to="/"
          startIcon={<ArrowBackIcon />}
          variant="outlined"
          sx={{ borderRadius: 2, textTransform: "none", fontWeight: 700 }}
        >
          Back
        </Button>
      </Stack>

      {err && <Alert severity="error">{err}</Alert>}

      {!err && !report && (
        <Alert severity="info">
          No report found yet. Finish a session, then click "View report".
        </Alert>
      )}

      {report && (
        <Paper variant="outlined" sx={{ borderRadius: 3, p: 2.5 }}>
          <Stack
            direction="row"
            spacing={1}
            sx={{ mb: 2 }}
            flexWrap="wrap"
            useFlexGap
          >
            <Chip
              label={`Blocks: ${report.blocks?.length ?? 0}`}
              variant="outlined"
            />
            {report.endedEarly ? (
              <Chip label="Ended Early" color="warning" />
            ) : report.endedAt ? (
              <Chip label="Completed" color="success" />
            ) : (
              <Chip label="In progress" color="warning" />
            )}
          </Stack>

          <Divider sx={{ mb: 2 }} />

          <Stack spacing={1.5}>
            {report.blocks.map((b, i) => {
              const planned = plannedTimestamps[i];
              return (
                <Paper
                  key={b.id ?? i}
                  variant="outlined"
                  sx={{ borderRadius: 3, p: 2 }}
                >
                  {/* Header */}
                  <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                    sx={{ mb: 0.5 }}
                  >
                    <Typography sx={{ fontWeight: 900 }}>
                      Block {i + 1} · {String(b.type).toUpperCase()}
                      {b.topic ? ` · ${b.topic}` : ""}
                    </Typography>
                    <Chip
                      label={`${b.minutes} min`}
                      size="small"
                      variant="outlined"
                    />
                  </Stack>

                  {/* Planned vs Actual */}
                  {planned && <PlannedActualRow block={b} planned={planned} />}

                  {/* Pause breakdown (only shown when block has pauses) */}
                  {b.pauses && b.pauses.length > 0 && (
                    <PauseBreakdown
                      pauses={b.pauses}
                      blockStartedAt={b.startedAt}
                      blockEndedAt={b.endedAt}
                    />
                  )}

                  <Divider sx={{ my: 1 }} />

                  <Typography
                    variant="subtitle2"
                    sx={{ fontWeight: 800, mb: 0.5 }}
                  >
                    Reflection
                  </Typography>
                  <Typography
                    sx={{ whiteSpace: "pre-wrap", color: "text.secondary" }}
                  >
                    {b.reflection ?? "(none)"}
                  </Typography>
                </Paper>
              );
            })}
          </Stack>
        </Paper>
      )}
    </Container>
  );
}
