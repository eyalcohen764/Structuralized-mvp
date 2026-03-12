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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import SettingsIcon from "@mui/icons-material/Settings";
import { getExtensionId, getExtensionIdAsync, setExtensionId } from "./config";

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

const PRESET_MINUTES = [10, 15, 20, 30, 45, 60, 75, 90, 105, 120, 135, 150];

function formatPreset(m: number): string {
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
}

export default function App() {
  const [blocks, setBlocks] = useState<SessionBlock[]>([
    { id: uid(), type: "work", minutes: 25, topic: "Deep work" },
  ]);

  const [toast, setToast] = useState<{
    kind: "success" | "error";
    msg: string;
  } | null>(null);

  const [extensionDialogOpen, setExtensionDialogOpen] = useState(false);
  const [extensionIdInput, setExtensionIdInput] = useState(getExtensionId());

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

  async function startSession() {
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

    const extId = await getExtensionIdAsync();
    chrome.runtime.sendMessage(extId, msg, (_res) => {
      const errMsg = chrome.runtime.lastError?.message;
      if (errMsg) {
        const isConnectionError =
          errMsg.includes("Receiving end does not exist") ||
          errMsg.includes("Could not establish connection");
        setToast({
          kind: "error",
          msg: isConnectionError
            ? "Extension not found. Click the gear icon and paste your Extension ID from chrome://extensions"
            : errMsg,
        });
        if (isConnectionError) setExtensionDialogOpen(true);
        return;
      }
      setToast({
        kind: "success",
        msg: "Session started. Extension is running.",
      });
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
            <Button
              component="a"
              href="http://localhost:5173"
              target="_blank"
              rel="noopener noreferrer"
              variant="outlined"
              size="medium"
              sx={{
                textTransform: "none",
                fontWeight: 600,
                fontSize: "0.95rem",
                borderRadius: 2,
                px: 2,
              }}
            >
              How to use the system
            </Button>
            <Tooltip title="Extension ID (from chrome://extensions)">
              <IconButton
                onClick={() => {
                  setExtensionIdInput(getExtensionId());
                  setExtensionDialogOpen(true);
                }}
              >
                <SettingsIcon />
              </IconButton>
            </Tooltip>
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
              <Tooltip
                title="A Dynamic Block creates a structured pause in your schedule. When it begins, the system will halt and require you to define a specific 'Statement of Intent' before the timer starts."
                slotProps={{ tooltip: { sx: { fontSize: "0.85rem" } } }}
              >
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<AddIcon />}
                  onClick={() => addBlock("dynamic")}
                  sx={{ borderRadius: 2, textTransform: "none" }}
                >
                  Add Dynamic
                </Button>
              </Tooltip>

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
                    <Tooltip
                      title={
                        b.type === "dynamic"
                          ? "A Dynamic Block creates a structured pause in your schedule. When it begins, the system will halt and require you to define a specific 'Statement of Intent' before the timer starts."
                          : ""
                      }
                      disableHoverListener={b.type !== "dynamic"}
                      slotProps={{ tooltip: { sx: { fontSize: "0.85rem" } } }}
                    >
                      <Chip
                        label={prettyType(b.type)}
                        size="small"
                        color={typeColor(b.type)}
                      />
                    </Tooltip>
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
                          : " topic will be decided only when the block actually starts"}
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
                      <Tooltip
                        title="A Dynamic Block creates a structured pause in your schedule. When it begins, the system will halt and require you to define a specific 'Statement of Intent' before the timer starts."
                        slotProps={{ tooltip: { sx: { fontSize: "0.85rem" } } }}
                      >
                        <ToggleButton
                          value="dynamic"
                          sx={{ textTransform: "none", borderRadius: 2 }}
                        >
                          Dynamic
                        </ToggleButton>
                      </Tooltip>
                    </ToggleButtonGroup>

                    {/* Duration (Hours & Minutes) */}
                    <Stack
                      direction="row"
                      spacing={1}
                      sx={{ width: { xs: "100%", sm: "auto" } }}
                    >
                      <TextField
                        label="Hours"
                        type="number"
                        value={Math.floor((b.minutes || 0) / 60).toString()}
                        onChange={(e) => {
                          const newHours =
                            e.target.value === "" ? 0 : Number(e.target.value);
                          const currentMins = (b.minutes || 0) % 60;
                          updateBlock(b.id, {
                            minutes: newHours * 60 + currentMins,
                          });
                        }}
                        inputProps={{ min: 0, max: 24, step: 1 }}
                        size="small"
                        sx={{ width: { xs: "50%", sm: 110 } }}
                        InputProps={{
                          endAdornment: (
                            <InputAdornment position="end">h</InputAdornment>
                          ),
                        }}
                        helperText="0–24"
                      />
                      <TextField
                        label="Minutes"
                        type="number"
                        value={((b.minutes || 0) % 60).toString()}
                        onChange={(e) => {
                          const newMins =
                            e.target.value === "" ? 0 : Number(e.target.value);
                          const currentHours = Math.floor(
                            (b.minutes || 0) / 60,
                          );
                          updateBlock(b.id, {
                            minutes: currentHours * 60 + newMins,
                          });
                        }}
                        inputProps={{ min: 0, max: 59, step: 1 }}
                        size="small"
                        sx={{ width: { xs: "50%", sm: 110 } }}
                        InputProps={{
                          endAdornment: (
                            <InputAdornment position="end">m</InputAdornment>
                          ),
                        }}
                        helperText="0–59"
                      />
                    </Stack>

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
                      Quick timing:
                    </Typography>
                    {PRESET_MINUTES.map((m) => (
                      <Chip
                        key={m}
                        label={formatPreset(m)}
                        size="small"
                        variant={b.minutes === m ? "filled" : "outlined"}
                        onClick={() => updateBlock(b.id, { minutes: m })}
                        sx={{ cursor: "pointer", minWidth: 44 }}
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
        ) : undefined}
      </Snackbar>

      <Dialog
        open={extensionDialogOpen}
        onClose={() => setExtensionDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Extension ID</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2, color: "text.secondary" }}>
            Copy the Extension ID from chrome://extensions (click the extension,
            copy the ID under the name).
          </Typography>
          <TextField
            fullWidth
            label="Extension ID"
            value={extensionIdInput}
            onChange={(e) => setExtensionIdInput(e.target.value)}
            placeholder="e.g. abcdefghijklmnop..."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExtensionDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => {
              setExtensionId(extensionIdInput);
              setExtensionDialogOpen(false);
              setToast({ kind: "success", msg: "Extension ID saved." });
            }}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
