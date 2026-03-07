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
import { EXTENSION_ID } from "./config";

function runIdFromUrl(): string | null {
  const url = new URL(window.location.href);
  return url.searchParams.get("runId");
}

export default function ReportPage() {
  const runId = useMemo(() => runIdFromUrl(), []);
  const [report, setReport] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setErr("null");

    // If you open this in a non-Chrome env, show a nice error instead of crashing
    if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
      setErr(
        "Chrome extension messaging isn’t available here. Open this in Chrome with the extension loaded.",
      );
      return;
    }

    chrome.runtime.sendMessage(
      EXTENSION_ID,
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
            {(report.blocks ?? []).map((b: any, i: number) => (
              <Paper
                key={b.id ?? i}
                variant="outlined"
                sx={{ borderRadius: 3, p: 2 }}
              >
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                  sx={{ mb: 1 }}
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
            ))}
          </Stack>
        </Paper>
      )}
    </Container>
  );
}
