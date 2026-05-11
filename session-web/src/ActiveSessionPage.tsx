/**
 * ActiveSessionPage.tsx — Displayed during an active session; polls the extension state every 4 seconds and renders the appropriate UI for running, paused, or awaiting-feedback states.
 */
import { useEffect, useState } from "react";
import { Box, Typography, Chip } from "@mui/material";
import PauseCircleIcon from "@mui/icons-material/PauseCircle";
import PlayCircleIcon from "@mui/icons-material/PlayCircle";
import { getSessionState } from "./extensionState";

interface Props {
  onSessionEnded: () => void;
}

export default function ActiveSessionPage({ onSessionEnded }: Props) {
  const [status, setStatus] = useState<"running" | "paused" | "awaiting_feedback" | null>(null);

  useEffect(() => {
    const check = async () => {
      const s = await getSessionState();
      if (s === "idle" || s === "completed" || s === null) {
        onSessionEnded();
      } else {
        setStatus(s as "running" | "paused" | "awaiting_feedback");
      }
    };

    check();
    const interval = setInterval(check, 4000);
    return () => clearInterval(interval);
  }, [onSessionEnded]);

  const isPaused = status === "paused";

  return (
    <Box sx={{ py: 6, textAlign: "center" }}>
      <Box sx={{ display: "flex", justifyContent: "center", mb: 2, color: isPaused ? "warning.main" : "success.main" }}>
        {isPaused
          ? <PauseCircleIcon sx={{ fontSize: 56 }} />
          : <PlayCircleIcon sx={{ fontSize: 56 }} />
        }
      </Box>

      <Chip
        label={isPaused ? "Session Paused" : "Session Running"}
        color={isPaused ? "warning" : "success"}
        sx={{ mb: 2, fontWeight: 700, fontSize: "0.95rem", px: 1 }}
      />

      <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
        {isPaused ? "Session is paused" : "Active session in progress"}
      </Typography>
      <Typography color="text.secondary">
        {isPaused
          ? "Use the extension popup to resume or stop the session."
          : "The planner will be restored when the session ends."}
      </Typography>
    </Box>
  );
}
