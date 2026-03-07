import { useMemo, useState } from "react";
import {
  AppBar,
  Toolbar,
  Typography,
  Container,
  Paper,
  Stack,
  Button,
  IconButton,
  Divider,
  Chip,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Card,
  CardContent,
  CardActions,
  Tooltip,
  Snackbar,
  Alert,
  InputAdornment,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import { EXTENSION_ID } from "./config";

/** ===== Types (shared contract with extension) ===== */
export type BlockType = "work" | "break" | "dynamic";

export type SessionBlock = {
  id: string;
  type: BlockType;
  minutes: number; // free input
  topic?: string; // only required for work
  note?: string; // optional future field
};

export type SessionPlan = {
  planId: string;
  createdAt: number;
  blocks: SessionBlock[];
};

/** Message we will send to extension (ready for multi-block) */
export type StartSessionExternalMsg = {
  type: "START_SESSION";
  payload: {
    origin: string;
    plan: SessionPlan;
  };
};

function canTalkToExtension(): boolean {
  return typeof chrome !== "undefined" && !!chrome.runtime?.sendMessage;
}

function uid(): string {
  return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}

function prettyType(t: BlockType): string {
  if (t === "work") return "Work";
  if (t === "break") return "Break";
  return "Dynamic";
}

function typeColor(
  t: BlockType,
): "default" | "primary" | "success" | "warning" {
  if (t === "work") return "primary";
  if (t === "break") return "success";
  return "warning";
}

function clampMinutes(n: number): number {
  if (!Number.isFinite(n)) return 10;
  return Math.min(24 * 60, Math.max(1, Math.floor(n)));
}

function totalMinutes(blocks: SessionBlock[]): number {
  return blocks.reduce((sum, b) => sum + (b.minutes || 0), 0);
}

function formatTotal(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hr`;
  return `${h} hr ${m} min`;
}

const PRESET_MINUTES = [10, 15, 20, 30, 45, 60];

export default function App() {
  const [blocks, setBlocks] = useState<SessionBlock[]>([
    { id: uid(), type: "work", minutes: 25, topic: "Deep work" },
  ]);

  const [toast, setToast] = useState<{
    kind: "success" | "error";
    msg: string;
  } | null>(null);

  const total = useMemo(() => totalMinutes(blocks), [blocks]);

  function addBlock(type: BlockType) {
    const newBlock: SessionBlock = {
      id: uid(),
      type,
      minutes: 10,
      ...(type === "work" ? { topic: "" } : {}),
    };
    setBlocks((prev) => [...prev, newBlock]);
  }

  function removeBlock(id: string) {
    setBlocks((prev) => prev.filter((b) => b.id !== id));
  }

  function moveBlock(id: string, dir: "up" | "down") {
    setBlocks((prev) => {
      const idx = prev.findIndex((b) => b.id === id);
      if (idx < 0) return prev;
      const nextIdx = dir === "up" ? idx - 1 : idx + 1;
      if (nextIdx < 0 || nextIdx >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(idx, 1);
      copy.splice(nextIdx, 0, item);
      return copy;
    });
  }

  function updateBlock(id: string, patch: Partial<SessionBlock>) {
    setBlocks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    );
  }

  function validatePlan(): string | null {
    if (blocks.length === 0) return "Add at least one block.";

    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];

      if (!b.minutes || b.minutes < 1) return `Block ${i + 1} needs minutes.`;
      if (b.type === "work") {
        const topic = (b.topic ?? "").trim();
        if (!topic) return `Block ${i + 1} (Work) needs a topic.`;
      }
    }
    return null;
  }

  function buildPlan(): SessionPlan {
    return {
      planId: uid(),
      createdAt: Date.now(),
      blocks: blocks.map((b) => ({
        ...b,
        minutes: clampMinutes(b.minutes),
        topic: b.type === "work" ? (b.topic ?? "").trim() : undefined,
      })),
    };
  }

  function savePlan(plan: SessionPlan) {
    localStorage.setItem("session_plan_v1", JSON.stringify(plan));
  }

  function startSession() {
    const err = validatePlan();
    if (err) {
      setToast({ kind: "error", msg: err });
      return;
    }

    const plan = buildPlan();
    savePlan(plan);

    if (!canTalkToExtension()) {
      setToast({
        kind: "error",
        msg: "Extension messaging not available. Open in Chrome and load the extension.",
      });
      return;
    }

    const msg: StartSessionExternalMsg = {
      type: "START_SESSION",
      payload: {
        origin: window.location.origin,
        plan,
      },
    };

    // NOTE: This is ready for multi-block. If your extension still expects the old payload,
    // we’ll update the extension next to accept plan.blocks.
    chrome.runtime.sendMessage(EXTENSION_ID, msg, (res) => {
      if (chrome.runtime.lastError) {
        setToast({
          kind: "error",
          msg: chrome.runtime.lastError.message ?? "Unknown extension error",
        });
        return;
      }
      setToast({
        kind: "success",
        msg: "Session started. Extension is running.",
      });
      console.log("START_SESSION response:", res);
    });
  }

  function reset() {
    setBlocks([{ id: uid(), type: "work", minutes: 25, topic: "Deep work" }]);
    localStorage.removeItem("session_plan_v1");
    setToast({ kind: "success", msg: "Reset session builder." });
  }

  return (
    <>
      <AppBar
        position="sticky"
        elevation={0}
        sx={{
          borderBottom: "1px solid",
          borderColor: "divider",
          bgcolor: "background.paper",
        }}
      >
        <Toolbar sx={{ display: "flex", justifyContent: "space-between" }}>
          <Stack spacing={0.25}>
            <Typography
              variant="h6"
              sx={{
                fontWeight: 800,
                letterSpacing: -0.5,
                color: "text.primary",
              }}
            >
              Session Builder
            </Typography>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Design your blocks. Start when ready.
            </Typography>
          </Stack>

          <Stack direction="row" spacing={1.25} alignItems="center">
            <Chip label={`Total: ${formatTotal(total)}`} variant="outlined" />
            <Button
              startIcon={<PlayArrowIcon />}
              variant="contained"
              onClick={startSession}
              sx={{ borderRadius: 2, textTransform: "none", fontWeight: 700 }}
            >
              Start Session
            </Button>
          </Stack>
        </Toolbar>
      </AppBar>

      <Container maxWidth="md" sx={{ py: 3 }}>
        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1}
            justifyContent="space-between"
            alignItems={{ xs: "stretch", sm: "center" }}
          >
            <Typography variant="subtitle1" sx={{ fontWeight: 750 }}>
              Blocks
            </Typography>

            <Stack direction="row" spacing={1} flexWrap="wrap">
              <Button
                size="small"
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={() => addBlock("work")}
                sx={{ borderRadius: 2, textTransform: "none" }}
              >
                Add Work
              </Button>
              <Button
                size="small"
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={() => addBlock("break")}
                sx={{ borderRadius: 2, textTransform: "none" }}
              >
                Add Break
              </Button>
              <Button
                size="small"
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={() => addBlock("dynamic")}
                sx={{ borderRadius: 2, textTransform: "none" }}
              >
                Add Dynamic
              </Button>

              <Tooltip title="Reset builder">
                <IconButton onClick={reset}>
                  <RestartAltIcon />
                </IconButton>
              </Tooltip>
            </Stack>
          </Stack>

          <Divider sx={{ my: 2 }} />

          <Stack spacing={1.5}>
            {blocks.map((b, idx) => (
              <Card key={b.id} variant="outlined" sx={{ borderRadius: 3 }}>
                <CardContent sx={{ pb: 1.5 }}>
                  <Stack
                    direction="row"
                    alignItems="center"
                    spacing={1}
                    sx={{ mb: 1 }}
                  >
                    <Chip
                      label={`${idx + 1}`}
                      size="small"
                      variant="outlined"
                    />
                    <Chip
                      label={prettyType(b.type)}
                      size="small"
                      color={typeColor(b.type)}
                    />
                    <Typography
                      variant="subtitle2"
                      sx={{ fontWeight: 600, ml: 0.2 }}
                    >
                      {b.type === "work"
                        ? b.topic?.trim()
                          ? b.topic
                          : "Untitled work"
                        : b.type === "break"
                          ? "Recovery"
                          : "The topic is decided when the block actually starts"}
                    </Typography>

                    <Stack direction="row" spacing={0.5} sx={{ ml: "auto" }}>
                      <Tooltip title="Move up">
                        <span>
                          <IconButton
                            size="small"
                            onClick={() => moveBlock(b.id, "up")}
                            disabled={idx === 0}
                          >
                            <ArrowUpwardIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title="Move down">
                        <span>
                          <IconButton
                            size="small"
                            onClick={() => moveBlock(b.id, "down")}
                            disabled={idx === blocks.length - 1}
                          >
                            <ArrowDownwardIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title="Remove">
                        <span>
                          <IconButton
                            size="small"
                            onClick={() => removeBlock(b.id)}
                            disabled={blocks.length === 1}
                          >
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </Stack>
                  </Stack>

                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25}>
                    {/* Type selector */}
                    <ToggleButtonGroup
                      exclusive
                      value={b.type}
                      onChange={(_, v) => {
                        if (!v) return;
                        const next = v as BlockType;
                        // when switching to work, keep topic field; switching away clears it
                        if (next === "work")
                          updateBlock(b.id, {
                            type: next,
                            topic: b.topic ?? "",
                          });
                        else
                          updateBlock(b.id, { type: next, topic: undefined });
                      }}
                      size="small"
                      sx={{ alignSelf: "flex-start" }}
                    >
                      <ToggleButton
                        value="work"
                        sx={{ textTransform: "none", borderRadius: 2 }}
                      >
                        Work
                      </ToggleButton>
                      <ToggleButton
                        value="break"
                        sx={{ textTransform: "none", borderRadius: 2 }}
                      >
                        Break
                      </ToggleButton>
                      <ToggleButton
                        value="dynamic"
                        sx={{ textTransform: "none", borderRadius: 2 }}
                      >
                        Dynamic
                      </ToggleButton>
                    </ToggleButtonGroup>

                    {/* Minutes (free input) */}
                    <TextField
                      label="Minutes"
                      type="number"
                      value={b.minutes}
                      onChange={(e) =>
                        updateBlock(b.id, { minutes: Number(e.target.value) })
                      }
                      inputProps={{ min: 1, max: 1440, step: 1 }}
                      size="small"
                      sx={{ width: { xs: "100%", sm: 160 } }}
                      InputProps={{
                        endAdornment: (
                          <InputAdornment position="end">min</InputAdornment>
                        ),
                      }}
                      helperText="Any number (1–1440)"
                    />

                    {/* Topic (free input) only for Work */}
                    {b.type === "work" ? (
                      <TextField
                        label="Work topic"
                        placeholder="e.g., CS problem set"
                        value={b.topic ?? ""}
                        onChange={(e) =>
                          updateBlock(b.id, { topic: e.target.value })
                        }
                        size="small"
                        fullWidth
                        helperText="Required for Work blocks"
                      />
                    ) : (
                      <TextField
                        label={b.type === "break" ? "Break" : "Dynamic"}
                        value={
                          b.type === "break"
                            ? "Recovery interval"
                            : "Choose topic at runtime"
                        }
                        size="small"
                        fullWidth
                        disabled
                      />
                    )}
                  </Stack>
                </CardContent>

                {/* Preset minute chips */}
                <CardActions sx={{ pt: 0, pb: 1.5, px: 2 }}>
                  <Stack
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    flexWrap="wrap"
                    useFlexGap
                  >
                    <Typography
                      variant="caption"
                      sx={{ color: "text.secondary" }}
                    >
                      Quick minutes:
                    </Typography>
                    {PRESET_MINUTES.map((m) => (
                      <Chip
                        key={m}
                        label={`${m}`}
                        size="small"
                        variant={b.minutes === m ? "filled" : "outlined"}
                        onClick={() => updateBlock(b.id, { minutes: m })}
                        sx={{ cursor: "pointer" }}
                      />
                    ))}
                  </Stack>
                </CardActions>
              </Card>
            ))}
          </Stack>
        </Paper>
      </Container>

      <Snackbar
        open={!!toast}
        autoHideDuration={3000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        {toast ? (
          <Alert
            severity={toast.kind}
            onClose={() => setToast(null)}
            sx={{ width: "100%" }}
          >
            {toast.msg}
          </Alert>
        ) : null}
      </Snackbar>
    </>
  );
}
