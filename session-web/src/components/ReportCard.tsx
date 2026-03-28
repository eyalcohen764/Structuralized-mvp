import { useState } from "react";
import {
  Paper,
  Stack,
  Typography,
  Chip,
  Button,
  IconButton,
  TextField,
  CircularProgress,
  InputAdornment,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import { Link as RouterLink } from "react-router-dom";
import { firestoreTimestampToDate, getDisplayName, type ReportRecord } from "../reportStorage";

export interface ReportCardProps {
  record: ReportRecord;
  onRename: (runId: string, newName: string) => Promise<void>;
  onDelete: (runId: string) => void;
}

export default function ReportCard({ record, onRename, onDelete }: ReportCardProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);

  const displayName = getDisplayName(record);

  const dateTimeLabel = firestoreTimestampToDate(record.startedAt).toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  function startEditing() {
    setEditValue(displayName);
    setEditing(true);
  }

  function handleCancel() {
    setEditing(false);
    setEditValue("");
  }

  async function handleSave() {
    const trimmed = editValue.trim();
    if (!trimmed) {
      handleCancel();
      return;
    }
    setSaving(true);
    try {
      await onRename(record.runId, trimmed);
      setEditing(false);
    } catch {
      // Parent shows error snackbar; stay in edit mode so user can retry
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      void handleSave();
    } else if (e.key === "Escape") {
      handleCancel();
    }
  }

  return (
    <Paper variant="outlined" sx={{ borderRadius: 3, p: 2 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
        {/* Left: name + metadata */}
        <Stack spacing={0.5} sx={{ flex: 1, minWidth: 0 }}>
          {editing ? (
            <TextField
              size="small"
              autoFocus
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={() => void handleSave()}
              disabled={saving}
              sx={{ maxWidth: 380 }}
              InputProps={{
                endAdornment: saving ? (
                  <InputAdornment position="end">
                    <CircularProgress size={16} />
                  </InputAdornment>
                ) : (
                  <InputAdornment position="end">
                    <IconButton size="small" onMouseDown={(e) => { e.preventDefault(); void handleSave(); }}>
                      <CheckIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                    <IconButton size="small" onMouseDown={(e) => { e.preventDefault(); handleCancel(); }}>
                      <CloseIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
          ) : (
            <Typography variant="body1" fontWeight={700} noWrap sx={{ maxWidth: 420 }}>
              {displayName}
            </Typography>
          )}

          <Typography variant="caption" color="text.secondary">
            {dateTimeLabel} · {record.blockCount} block{record.blockCount !== 1 ? "s" : ""}
          </Typography>

          <Stack direction="row" spacing={0.75} sx={{ mt: 0.25 }}>
            <Chip
              label={record.endedEarly ? "Ended Early" : "Completed"}
              color={record.endedEarly ? "warning" : "success"}
              size="small"
              variant="outlined"
            />
          </Stack>
        </Stack>

        {/* Right: action buttons */}
        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexShrink: 0 }}>
          <Button
            component={RouterLink}
            to={`/report?runId=${record.runId}`}
            size="small"
            variant="outlined"
            sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2 }}
          >
            View
          </Button>
          {!editing && (
            <IconButton size="small" onClick={startEditing} title="Rename">
              <EditIcon sx={{ fontSize: 18 }} />
            </IconButton>
          )}
          <IconButton
            size="small"
            color="error"
            onClick={() => onDelete(record.runId)}
            title="Delete"
          >
            <DeleteOutlineIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Stack>
      </Stack>
    </Paper>
  );
}
