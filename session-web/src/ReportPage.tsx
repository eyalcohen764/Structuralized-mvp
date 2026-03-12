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
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { Link as RouterLink } from "react-router-dom";
import { getExtensionIdAsync } from "./config";
import type { ReportBlock, SessionReport } from "../../extension/src/shared";

type BlockTimestamp = { displayStart: number; displayEnd: number };

/**
 * Computes a gapless wall-clock timeline for each block.
 *
 * Inter-block overhead (reflection typing, dynamic topic selection) is absorbed
 * into the preceding block's display end time, so no dead time appears between blocks.
 *
 * - Block 0 starts at report.startedAt (absorbs any pre-first-block overhead).
 * - Block i starts exactly where block i-1 ended (no gaps).
 * - The last block ends at report.endedAt (or its own endedAt when in-progress).
 */
function computeBlockTimestamps(
  blocks: ReportBlock[],
  report: SessionReport,
): BlockTimestamp[] {
  const result: BlockTimestamp[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const displayStart = i === 0 ? report.startedAt : result[i - 1].displayEnd;
    const displayEnd =
      i < blocks.length - 1
        ? blocks[i + 1].startedAt
        : (report.endedAt ?? blocks[i].endedAt);
    result.push({ displayStart, displayEnd });
  }

  return result;
}

function formatTime(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function runIdFromUrl(): string | null {
  const url = new URL(window.location.href);
  return url.searchParams.get("runId");
}

export default function ReportPage() {
  const runId = useMemo(() => runIdFromUrl(), []);
  const [report, setReport] = useState<SessionReport | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const blockTimestamps = useMemo<BlockTimestamp[]>(
    () => (report ? computeBlockTimestamps(report.blocks, report) : []),
    [report],
  );

  useEffect(() => {
    setErr(null);

    // If you open this in a non-Chrome env, show a nice error instead of crashing
    if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
      setErr(
        "Chrome extension messaging isn’t available here. Open this in Chrome with the extension loaded.",
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
          No report found yet. Finish a session, then click “View report”.
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
            {report.endedAt ? (
              <Chip label="Completed" color="success" />
            ) : (
              <Chip label="In progress" color="warning" />
            )}
          </Stack>

          <Divider sx={{ mb: 2 }} />

          <Stack spacing={1.5}>
            {report.blocks.map((b, i) => {
              const ts = blockTimestamps[i];
              return (
                <Paper
                  key={b.id ?? i}
                  variant="outlined"
                  sx={{ borderRadius: 3, p: 2 }}
                >
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

                  {ts && (
                    <Stack
                      direction="row"
                      alignItems="center"
                      spacing={1}
                      sx={{ mt: 0.5, mb: 1.5 }}
                    >
                      <Typography
                        sx={{
                          fontFamily: "monospace",
                          fontSize: "1.2rem",
                          fontWeight: 500,
                          color: "text.primary",
                          opacity: 0.75,
                          letterSpacing: "0.02em",
                        }}
                      >
                        {formatTime(ts.displayStart)}
                      </Typography>
                      <Typography
                        sx={{
                          color: "text.disabled",
                          fontSize: "0.8rem",
                          lineHeight: 1,
                          userSelect: "none",
                        }}
                      >
                        →
                      </Typography>
                      <Typography
                        sx={{
                          fontFamily: "monospace",
                          fontSize: "1.2rem",
                          fontWeight: 500,
                          color: "text.primary",
                          opacity: 0.75,
                          letterSpacing: "0.02em",
                        }}
                      >
                        {formatTime(ts.displayEnd)}
                      </Typography>
                    </Stack>
                  )}

                  <Divider sx={{ mb: 1 }} />

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
