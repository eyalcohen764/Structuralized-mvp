import { useEffect, useMemo, useRef, useState } from "react";
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
  Tooltip,
  IconButton,
  TextField,
  CircularProgress,
  Snackbar,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import SettingsIcon from "@mui/icons-material/Settings";
import EditIcon from "@mui/icons-material/Edit";
import { Link as RouterLink } from "react-router-dom";
import { getExtensionIdAsync } from "./config";
import { useAuth } from "./AuthContext";
import {
  ensureReportSaved,
  getReportRecord,
  updateReportName,
  getDisplayName,
  type ReportRecord,
} from "./reportStorage";
import {
  DEFAULT_BLOCK_SETTINGS,
  type BlockSettings,
  type BlockType,
  type ReportBlock,
  type SessionReport,
  type SnoozeRecord,
} from "../../extension/src/shared";

// ─── Planned timeline ─────────────────────────────────────────────────────────

type PlannedTimestamp = { plannedStart: number; plannedEnd: number };

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

function formatDuration(ms: number): string {
  const totalMin = Math.round(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// ─── Segment types ────────────────────────────────────────────────────────────

type Segment =
  | { kind: "work"; startedAt: number; endedAt: number }
  | { kind: "pause"; startedAt: number; endedAt: number; reason?: string };

function workLabel(block: ReportBlock): string {
  if (block.type === "break") return "BREAK";
  if (block.type === "dynamic")
    return block.topic ? block.topic.toUpperCase() : "DYNAMIC";
  return block.topic ? block.topic.toUpperCase() : "WORK";
}

function buildSegments(block: ReportBlock): Segment[] {
  const pauses = block.pauses ?? [];
  const segments: Segment[] = [];
  let cursor = block.startedAt;

  for (const p of pauses) {
    if (p.pausedAt > cursor) {
      segments.push({ kind: "work", startedAt: cursor, endedAt: p.pausedAt });
    }
    segments.push({
      kind: "pause",
      startedAt: p.pausedAt,
      endedAt: p.resumedAt,
      reason: p.reason,
    });
    cursor = p.resumedAt;
  }

  if (cursor < block.endedAt) {
    segments.push({ kind: "work", startedAt: cursor, endedAt: block.endedAt });
  }

  return segments;
}

// ─── URL helper ───────────────────────────────────────────────────────────────

function runIdFromUrl(): string | null {
  const url = new URL(window.location.href);
  return url.searchParams.get("runId");
}

// ─── Color helper ─────────────────────────────────────────────────────────────

function blockTypeColor(type: BlockType): "primary" | "success" | "warning" {
  if (type === "break") return "success";
  if (type === "dynamic") return "warning";
  return "primary";
}

// ─── SessionSummary ───────────────────────────────────────────────────────────

function SessionSummary({ report }: { report: SessionReport }) {
  const workTypes: BlockType[] = ["work", "dynamic"];

  const workPlanned = report.blocks
    .filter((b) => workTypes.includes(b.type))
    .reduce((sum, b) => sum + b.minutes * 60_000, 0);
  const workActual = report.blocks
    .filter((b) => workTypes.includes(b.type))
    .reduce((sum, b) => sum + (b.endedAt - b.startedAt), 0);

  const breakPlanned = report.blocks
    .filter((b) => b.type === "break")
    .reduce((sum, b) => sum + b.minutes * 60_000, 0);
  const breakActual = report.blocks
    .filter((b) => b.type === "break")
    .reduce((sum, b) => sum + (b.endedAt - b.startedAt), 0);

  const totalSnoozes = report.blocks.reduce(
    (sum, b) => sum + (b.snoozes?.length ?? 0),
    0,
  );

  const workDelta = workActual - workPlanned;
  const breakDelta = breakActual - breakPlanned;

  function deltaColor(delta: number): string {
    if (Math.abs(delta) < 15_000) return "text.secondary";
    return delta > 0 ? "warning.main" : "info.main";
  }

  return (
    <Paper variant="outlined" sx={{ borderRadius: 3, p: 2 }}>
      <Typography
        variant="caption"
        sx={{
          fontWeight: 800,
          color: "text.disabled",
          letterSpacing: "0.06em",
          display: "block",
          mb: 1,
        }}
      >
        SUMMARY
      </Typography>
      <Stack spacing={0.5}>
        {workPlanned > 0 && (
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <Typography
              variant="body2"
              sx={{ fontWeight: 600, minWidth: 70 }}
            >
              Work
            </Typography>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              planned {formatDuration(workPlanned)}
            </Typography>
            <Typography variant="body2" sx={{ color: "text.disabled" }}>
              ·
            </Typography>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              actual {formatDuration(workActual)}
            </Typography>
            <Typography variant="body2" sx={{ color: "text.disabled" }}>
              ·
            </Typography>
            <Typography
              variant="body2"
              sx={{ fontWeight: 600, color: deltaColor(workDelta) }}
            >
              {formatDelta(workDelta)}
            </Typography>
          </Stack>
        )}
        {breakPlanned > 0 && (
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <Typography
              variant="body2"
              sx={{ fontWeight: 600, minWidth: 70 }}
            >
              Break
            </Typography>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              planned {formatDuration(breakPlanned)}
            </Typography>
            <Typography variant="body2" sx={{ color: "text.disabled" }}>
              ·
            </Typography>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              actual {formatDuration(breakActual)}
            </Typography>
            <Typography variant="body2" sx={{ color: "text.disabled" }}>
              ·
            </Typography>
            <Typography
              variant="body2"
              sx={{ fontWeight: 600, color: deltaColor(breakDelta) }}
            >
              {formatDelta(breakDelta)}
            </Typography>
          </Stack>
        )}
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 70 }}>
            Snoozes
          </Typography>
          <Typography
            variant="body2"
            sx={{ color: totalSnoozes === 0 ? "text.disabled" : "text.secondary" }}
          >
            {totalSnoozes} total
          </Typography>
        </Stack>
      </Stack>
    </Paper>
  );
}

// ─── SettingsPopover ──────────────────────────────────────────────────────────

function SettingsTooltipContent({ settings }: { settings: BlockSettings }) {
  const workReflection = settings.inputRequired ?? DEFAULT_BLOCK_SETTINGS.inputRequired;
  const breakReflection = settings.breakInputRequired ?? DEFAULT_BLOCK_SETTINGS.breakInputRequired;
  const endMax = settings.endMaxCount ?? 0;
  const endMin = settings.endSnoozeMaxMinutes ?? 0;
  const returnMax = settings.returnMaxCount ?? 0;
  const returnMin = settings.returnSnoozeMaxMinutes ?? 0;

  return (
    <Stack spacing={0.25} sx={{ p: 0.5 }}>
      <Typography variant="caption">
        Reflection (Work/Dynamic): {workReflection ? "Yes" : "No"}
      </Typography>
      <Typography variant="caption">
        Reflection (Break): {breakReflection ? "Yes" : "No"}
      </Typography>
      <Typography variant="caption">
        Work snoozes:{" "}
        {endMax > 0 ? `${endMax} max, ${endMin} min each` : "Disabled"}
      </Typography>
      <Typography variant="caption">
        Break snoozes:{" "}
        {returnMax > 0 ? `${returnMax} max, ${returnMin} min each` : "Disabled"}
      </Typography>
    </Stack>
  );
}

function SettingsPopover({ settings }: { settings: BlockSettings }) {
  return (
    <Tooltip
      title={<SettingsTooltipContent settings={settings} />}
      placement="left"
    >
      <IconButton size="small">
        <SettingsIcon sx={{ fontSize: 15 }} />
      </IconButton>
    </Tooltip>
  );
}

// ─── Block card ───────────────────────────────────────────────────────────────

function BlockCard({
  block,
  index,
  planned,
  isLastStopped,
}: {
  block: ReportBlock;
  index: number;
  planned: PlannedTimestamp | undefined;
  isLastStopped: boolean;
}) {
  const color = blockTypeColor(block.type);

  const plannedMs = block.minutes * 60_000;
  const actualMs = block.endedAt - block.startedAt;
  const deltaMs = actualMs - plannedMs;
  const deltaColor =
    Math.abs(deltaMs) < 15_000
      ? "text.secondary"
      : deltaMs > 0
        ? "warning.main"
        : "info.main";

  const snoozeMax =
    block.type === "break"
      ? (block.plannedSettings?.returnMaxCount ?? 0)
      : (block.plannedSettings?.endMaxCount ?? 0);

  const inputRequired =
    block.type === "break"
      ? (block.plannedSettings?.breakInputRequired ?? false)
      : (block.plannedSettings?.inputRequired ?? false);

  const hasTimeline = (block.pauses?.length ?? 0) > 0;
  const hasSnoozes = (block.snoozes?.length ?? 0) > 0;
  const hasGoals = !!block.goals;
  const hasReflection = inputRequired || !!block.reflection;

  const label = workLabel(block);
  const segments = hasTimeline ? buildSegments(block) : [];

  return (
    <Paper
      variant="outlined"
      sx={{
        borderRadius: 3,
        borderLeft: "4px solid",
        borderLeftColor: `${color}.main`,
        p: 2,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="flex-start"
        sx={{ mb: 1 }}
      >
        <Stack spacing={0.25}>
          <Stack direction="row" alignItems="center" spacing={0.75}>
            <Chip
              label={block.type.toUpperCase()}
              size="small"
              color={color}
            />
            <Typography variant="body2" sx={{ fontWeight: 600, color: "text.secondary" }}>
              Block {index + 1}
            </Typography>
          </Stack>
          {block.topic && (
            <Typography sx={{ fontWeight: 700, fontSize: "0.95rem" }}>
              {block.topic}
            </Typography>
          )}
        </Stack>
        <Stack direction="row" alignItems="center" spacing={0.5}>
          <Typography variant="body2" sx={{ color: "text.secondary", fontWeight: 600 }}>
            {block.minutes} min planned
          </Typography>
          {isLastStopped && (
            <Chip label="🛑 stopped" color="warning" size="small" />
          )}
          {block.plannedSettings && (
            <SettingsPopover settings={block.plannedSettings} />
          )}
        </Stack>
      </Stack>

      <Divider sx={{ mb: 1 }} />

      {/* Timing */}
      <Stack spacing={0.4}>
        {planned && (
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <Typography
              variant="caption"
              sx={{
                color: "text.disabled",
                fontWeight: 700,
                letterSpacing: "0.05em",
                minWidth: 56,
              }}
            >
              PLANNED
            </Typography>
            <Typography
              variant="body2"
              sx={{ fontFamily: "monospace", color: "text.secondary", fontSize: "0.78rem" }}
            >
              {formatTime(planned.plannedStart)} → {formatTime(planned.plannedEnd)}
            </Typography>
          </Stack>
        )}
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <Typography
            variant="caption"
            sx={{
              color: "text.disabled",
              fontWeight: 700,
              letterSpacing: "0.05em",
              minWidth: 56,
            }}
          >
            ACTUAL
          </Typography>
          <Typography
            variant="body2"
            sx={{ fontFamily: "monospace", color: "text.secondary", fontSize: "0.78rem" }}
          >
            {formatTime(block.startedAt)} → {formatTime(block.endedAt)}
          </Typography>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {formatMinutes(actualMs)}
          </Typography>
          <Typography
            variant="body2"
            sx={{ fontWeight: 600, color: deltaColor }}
          >
            {formatDelta(deltaMs)}
          </Typography>
        </Stack>
      </Stack>

      {/* Timeline */}
      {hasTimeline && (
        <>
          <Divider sx={{ my: 1 }} />
          <Typography
            variant="caption"
            sx={{
              fontWeight: 800,
              color: "text.disabled",
              letterSpacing: "0.06em",
              display: "block",
              mb: 0.5,
            }}
          >
            TIMELINE
          </Typography>
          <Stack spacing={0.5}>
            {segments.map((seg, i) => (
              <Stack key={i} spacing={0.25}>
                <Stack
                  direction="row"
                  alignItems="center"
                  spacing={1.5}
                  sx={{
                    px: 1.5,
                    py: 0.6,
                    borderRadius: 2,
                    background:
                      seg.kind === "pause"
                        ? "rgba(255,200,0,0.1)"
                        : "rgba(0,0,0,0.03)",
                    border:
                      seg.kind === "pause"
                        ? "1px solid rgba(200,150,0,0.25)"
                        : "1px solid rgba(0,0,0,0.07)",
                  }}
                >
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 700,
                      color:
                        seg.kind === "pause" ? "warning.dark" : "text.secondary",
                      minWidth: 40,
                    }}
                  >
                    {seg.kind === "pause" ? "⏸ PAUSE" : `▶ ${label}`}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{ fontFamily: "monospace", color: "text.secondary" }}
                  >
                    {formatTime(seg.startedAt)}–{formatTime(seg.endedAt)}
                  </Typography>
                  <Typography variant="caption" sx={{ color: "text.disabled" }}>
                    {formatMinutes(seg.endedAt - seg.startedAt)}
                  </Typography>
                </Stack>
                {seg.kind === "pause" && seg.reason && (
                  <Typography
                    variant="caption"
                    sx={{
                      color: "warning.dark",
                      pl: "52px",
                      fontStyle: "italic",
                    }}
                  >
                    "{seg.reason}"
                  </Typography>
                )}
              </Stack>
            ))}
          </Stack>
        </>
      )}

      {/* Snoozes */}
      {hasSnoozes && (
        <>
          <Divider sx={{ my: 1 }} />
          <Typography
            variant="caption"
            sx={{
              fontWeight: 800,
              color: "text.disabled",
              letterSpacing: "0.06em",
              display: "block",
              mb: 0.5,
            }}
          >
            SNOOZES
          </Typography>
          <Stack spacing={0.5}>
            {(block.snoozes as SnoozeRecord[]).map((s, i) => (
              <Stack
                key={i}
                direction="row"
                alignItems="center"
                spacing={1.5}
                sx={{
                  px: 1.5,
                  py: 0.6,
                  borderRadius: 2,
                  background: "rgba(25,118,210,0.06)",
                  border: "1px solid rgba(25,118,210,0.2)",
                }}
              >
                <Typography
                  variant="caption"
                  sx={{ fontWeight: 700, color: "info.dark", minWidth: 64 }}
                >
                  ⏰ SNOOZE {i + 1}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{ fontFamily: "monospace", color: "text.secondary" }}
                >
                  {formatTime(s.snoozedAt)}–{formatTime(s.resumedAt)}
                </Typography>
                <Typography variant="caption" sx={{ color: "text.disabled" }}>
                  {s.minutes} min
                </Typography>
              </Stack>
            ))}
            <Typography variant="caption" sx={{ color: "text.disabled", pl: 0.5 }}>
              Used {block.snoozes!.length} of {snoozeMax} allowed snooze
              {snoozeMax !== 1 ? "s" : ""}
            </Typography>
          </Stack>
        </>
      )}

      {/* Goals */}
      {hasGoals && (
        <>
          <Divider sx={{ my: 1 }} />
          <Typography
            variant="caption"
            sx={{
              fontWeight: 800,
              color: "text.disabled",
              letterSpacing: "0.06em",
              display: "block",
              mb: 0.5,
            }}
          >
            GOALS
          </Typography>
          <Typography
            sx={{
              whiteSpace: "pre-wrap",
              color: "text.secondary",
              fontSize: "0.9rem",
            }}
          >
            {block.goals}
          </Typography>
        </>
      )}

      {/* Reflection */}
      {hasReflection && (
        <>
          <Divider sx={{ my: 1 }} />
          <Typography
            variant="caption"
            sx={{
              fontWeight: 800,
              color: "text.disabled",
              letterSpacing: "0.06em",
              display: "block",
              mb: 0.5,
            }}
          >
            REFLECTION
          </Typography>
          <Typography
            sx={{
              whiteSpace: "pre-wrap",
              color: block.reflection ? "text.secondary" : "text.disabled",
              fontStyle: block.reflection ? "normal" : "italic",
              fontSize: "0.9rem",
            }}
          >
            {block.reflection ?? "(skipped)"}
          </Typography>
        </>
      )}
    </Paper>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReportPage() {
  const runId = useMemo(() => runIdFromUrl(), []);
  const { user } = useAuth();
  const [report, setReport] = useState<SessionReport | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const savedRef = useRef<Set<string>>(new Set());

  // ── Rename state ──
  const [record, setRecord] = useState<ReportRecord | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [snack, setSnack] = useState<{ msg: string; severity: "success" | "error" } | null>(null);

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

  // Save report to Cloudinary + Firestore once loaded (idempotent), then load record for rename
  useEffect(() => {
    if (!report || !user || savedRef.current.has(report.runId)) return;
    savedRef.current.add(report.runId);
    ensureReportSaved(user.uid, report)
      .then(() => getReportRecord(user.uid, report.runId))
      .then((rec) => { if (rec) setRecord(rec); })
      .catch((e: unknown) => {
        console.error("[ReportPage] Failed to save/load report:", e);
      });
  }, [report, user]);

  function handleStartEditName() {
    if (!record) return;
    setEditNameValue(getDisplayName(record));
    setEditingName(true);
  }

  function handleCancelEditName() {
    setEditingName(false);
    setEditNameValue("");
  }

  async function handleSaveName() {
    const trimmed = editNameValue.trim();
    if (!trimmed || !user || !record) {
      handleCancelEditName();
      return;
    }
    setSavingName(true);
    try {
      await updateReportName(user.uid, record.runId, trimmed);
      setRecord((prev) => (prev ? { ...prev, name: trimmed } : prev));
      setSnack({ msg: "Name updated", severity: "success" });
      setEditingName(false);
    } catch {
      setSnack({ msg: "Failed to rename. Try again.", severity: "error" });
    } finally {
      setSavingName(false);
    }
  }

  function handleNameKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      void handleSaveName();
    } else if (e.key === "Escape") {
      handleCancelEditName();
    }
  }

  const statusLabel = report
    ? report.endedEarly
      ? "Ended early"
      : report.endedAt
        ? "Completed"
        : "In progress"
    : "";

  return (
    <Container maxWidth="md" sx={{ py: 3 }}>
      {/* Header */}
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="flex-start"
        sx={{ mb: 2.5 }}
      >
        <Stack spacing={0.25}>
          {editingName ? (
            <Stack direction="row" alignItems="center" spacing={0.75}>
              <TextField
                size="small"
                autoFocus
                value={editNameValue}
                onChange={(e) => setEditNameValue(e.target.value)}
                onKeyDown={handleNameKeyDown}
                onBlur={() => void handleSaveName()}
                disabled={savingName}
                sx={{ "& input": { fontWeight: 700, fontSize: "1.1rem" } }}
              />
              {savingName && <CircularProgress size={18} />}
            </Stack>
          ) : (
            <Stack direction="row" alignItems="center" spacing={0.5}>
              <Typography variant="h5" sx={{ fontWeight: 900, letterSpacing: -0.5 }}>
                {record ? getDisplayName(record) : "Session Report"}
              </Typography>
              <IconButton
                size="small"
                onClick={handleStartEditName}
                disabled={!record}
                title="Rename report"
              >
                <EditIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Stack>
          )}
          {report && (
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              {statusLabel} · {report.blocks.length} blocks
              {report.startedAt && report.endedAt
                ? ` · ${formatTime(report.startedAt)} – ${formatTime(report.endedAt)}`
                : ""}
            </Typography>
          )}
          {!report && (
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              {runId ? (
                <>
                  Run ID: <code>{runId}</code>
                </>
              ) : (
                "Latest session"
              )}
            </Typography>
          )}
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
        <>
          <SessionSummary report={report} />

          <Box sx={{ mt: 2 }} />

          <Stack spacing={1.5}>
            {report.blocks.map((b, i) => (
              <BlockCard
                key={b.id ?? i}
                block={b}
                index={i}
                planned={plannedTimestamps[i]}
                isLastStopped={
                  !!report.endedEarly && i === report.blocks.length - 1
                }
              />
            ))}
          </Stack>
        </>
      )}

      <Snackbar
        open={snack !== null}
        autoHideDuration={3500}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity={snack?.severity} onClose={() => setSnack(null)} sx={{ width: "100%" }}>
          {snack?.msg}
        </Alert>
      </Snackbar>
    </Container>
  );
}
