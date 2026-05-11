/**
 * ArchivePage.tsx — Lists saved session reports from Firestore with search/filter, inline rename, delete confirmation, and expand-to-preview; uses ReportCard for each entry.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  InputAdornment,
  Paper,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import SearchIcon from "@mui/icons-material/Search";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { Link as RouterLink } from "react-router-dom";
import { useAuth } from "./AuthContext";
import {
  deleteReport,
  firestoreTimestampToDate,
  getDisplayName,
  listReports,
  updateReportName,
  type ReportRecord,
} from "./reportStorage";
import ReportCard from "./components/ReportCard";

type FilterOption = "all" | "completed" | "ended_early";

const FILTER_OPTIONS: { value: FilterOption; label: string }[] = [
  { value: "all", label: "All" },
  { value: "completed", label: "Completed" },
  { value: "ended_early", label: "Ended Early" },
];

export default function ArchivePage() {
  const { user } = useAuth();

  const [records, setRecords] = useState<ReportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterOption>("all");

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [snack, setSnack] = useState<{ msg: string; severity: "success" | "error" } | null>(null);

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // ─── Load reports ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    listReports(user.uid)
      .then(setRecords)
      .catch((e: unknown) => setFetchError(String(e)))
      .finally(() => setLoading(false));
  }, [user]);

  // ─── Filter + group (derived) ────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const searchLower = search.toLowerCase();
    return records.filter((r) => {
      const matchesFilter =
        filter === "all" ||
        (filter === "completed" && !r.endedEarly) ||
        (filter === "ended_early" && r.endedEarly);
      const matchesSearch = getDisplayName(r).toLowerCase().includes(searchLower);
      return matchesFilter && matchesSearch;
    });
  }, [records, filter, search]);

  /** Groups sorted newest-first (Firestore already sorted by startedAt desc). */
  const groups = useMemo<Array<[string, ReportRecord[]]>>(() => {
    const map = new Map<string, ReportRecord[]>();
    for (const r of filtered) {
      const key = firestoreTimestampToDate(r.startedAt).toLocaleString([], {
        month: "long",
        year: "numeric",
      });
      const existing = map.get(key);
      if (existing) {
        existing.push(r);
      } else {
        map.set(key, [r]);
      }
    }
    return Array.from(map.entries());
  }, [filtered]);

  // ─── Handlers ────────────────────────────────────────────────────────────────

  function toggleGroup(key: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  async function handleRename(runId: string, newName: string): Promise<void> {
    try {
      await updateReportName(user!.uid, runId, newName);
      setRecords((prev) =>
        prev.map((r) => (r.runId === runId ? { ...r, name: newName } : r)),
      );
      setSnack({ msg: "Name updated", severity: "success" });
    } catch (e: unknown) {
      setSnack({ msg: "Failed to rename. Try again.", severity: "error" });
      throw e;
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteReport(user!.uid, deleteTarget);
      setRecords((prev) => prev.filter((r) => r.runId !== deleteTarget));
      setSnack({ msg: "Report deleted", severity: "success" });
    } catch {
      setSnack({ msg: "Failed to delete. Try again.", severity: "error" });
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <Container maxWidth="md" sx={{ py: 3 }}>
      {/* Header */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 900, letterSpacing: -0.5 }}>
          Session Archive
        </Typography>
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

      {/* Search + filter */}
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1.5}
        alignItems={{ sm: "center" }}
        sx={{ mb: 3 }}
      >
        <TextField
          size="small"
          placeholder="Search sessions..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ flex: 1 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ fontSize: 18, color: "text.disabled" }} />
              </InputAdornment>
            ),
          }}
        />
        <Stack direction="row" spacing={0.75}>
          {FILTER_OPTIONS.map(({ value, label }) => (
            <Chip
              key={value}
              label={label}
              size="small"
              variant={filter === value ? "filled" : "outlined"}
              color={filter === value ? "primary" : "default"}
              onClick={() => setFilter(value)}
              sx={{ cursor: "pointer", fontWeight: filter === value ? 700 : 400 }}
            />
          ))}
        </Stack>
      </Stack>

      {/* Loading */}
      {loading && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress />
        </Box>
      )}

      {/* Fetch error */}
      {!loading && fetchError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Failed to load reports: {fetchError}
        </Alert>
      )}

      {/* Empty state — no reports at all */}
      {!loading && !fetchError && records.length === 0 && (
        <Paper
          variant="outlined"
          sx={{ borderRadius: 3, p: 5, textAlign: "center" }}
        >
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No sessions yet
          </Typography>
          <Typography variant="body2" color="text.disabled">
            Complete a session and it will appear here.
          </Typography>
        </Paper>
      )}

      {/* Empty filtered state */}
      {!loading && !fetchError && records.length > 0 && filtered.length === 0 && (
        <Typography color="text.secondary" sx={{ textAlign: "center", mt: 4 }}>
          No sessions match your search.
        </Typography>
      )}

      {/* Groups */}
      {!loading && !fetchError && groups.length > 0 && (
        <Stack spacing={3}>
          {groups.map(([monthKey, groupRecords]) => {
            const collapsed = collapsedGroups.has(monthKey);
            return (
              <Box key={monthKey}>
                {/* Group header */}
                <Stack
                  direction="row"
                  alignItems="center"
                  spacing={0.75}
                  onClick={() => toggleGroup(monthKey)}
                  sx={{ cursor: "pointer", mb: collapsed ? 0 : 1.5, userSelect: "none" }}
                >
                  {collapsed ? (
                    <ChevronRightIcon sx={{ fontSize: 18, color: "text.disabled" }} />
                  ) : (
                    <ExpandMoreIcon sx={{ fontSize: 18, color: "text.disabled" }} />
                  )}
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 800,
                      color: "text.disabled",
                      letterSpacing: "0.06em",
                    }}
                  >
                    {monthKey.toUpperCase()}
                  </Typography>
                  <Chip
                    label={groupRecords.length}
                    size="small"
                    variant="outlined"
                    sx={{ height: 18, fontSize: "0.7rem", fontWeight: 700 }}
                  />
                </Stack>

                {/* Group content */}
                <Collapse in={!collapsed}>
                  <Stack spacing={1.5}>
                    {groupRecords.map((r) => (
                      <ReportCard
                        key={r.runId}
                        record={r}
                        onRename={handleRename}
                        onDelete={(runId) => setDeleteTarget(runId)}
                      />
                    ))}
                  </Stack>
                </Collapse>
              </Box>
            );
          })}
        </Stack>
      )}

      {/* Delete confirmation dialog */}
      <Dialog
        open={deleteTarget !== null}
        onClose={() => { if (!deleting) setDeleteTarget(null); }}
      >
        <DialogTitle>Delete Session Report?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will permanently remove the report from your archive. The underlying session data stored in Cloudinary will not be deleted.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setDeleteTarget(null)}
            disabled={deleting}
            sx={{ textTransform: "none" }}
          >
            Cancel
          </Button>
          <Button
            onClick={() => void handleDeleteConfirm()}
            color="error"
            variant="contained"
            disabled={deleting}
            startIcon={deleting ? <CircularProgress size={16} color="inherit" /> : undefined}
            sx={{ textTransform: "none", fontWeight: 700 }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snack !== null}
        autoHideDuration={3500}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          severity={snack?.severity}
          onClose={() => setSnack(null)}
          sx={{ width: "100%" }}
        >
          {snack?.msg}
        </Alert>
      </Snackbar>
    </Container>
  );
}
