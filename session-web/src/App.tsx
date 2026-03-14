import { useState, useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Box, CircularProgress, Typography } from "@mui/material";
import ReportPage from "./ReportPage";
import BuilderPage from "./SessionBuilderPage";
import ActiveSessionPage from "./ActiveSessionPage";
import HomePage from "./HomePage";
import LoginPage from "./LoginPage";
import RequireAuth from "./RequireAuth";
import { getSessionState } from "./extensionState";

/** Checks extension session state and routes to the active session or builder. */
function SessionGateway() {
  const [status, setStatus] = useState<"loading" | "active" | "inactive">("loading");

  useEffect(() => {
    const check = async () => {
      const s = await getSessionState();
      setStatus(s === "running" || s === "paused" || s === "awaiting_feedback" ? "active" : "inactive");
    };

    check();
    const interval = setInterval(check, 4000);
    return () => clearInterval(interval);
  }, []);

  if (status === "loading") {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "40vh", gap: 2 }}>
        <CircularProgress />
        <Typography color="text.secondary">Loading...</Typography>
      </Box>
    );
  }

  if (status === "active") {
    return <ActiveSessionPage onSessionEnded={() => setStatus("inactive")} />;
  }

  return <BuilderPage />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <HomePage />
          </RequireAuth>
        }
      />
      <Route
        path="/app"
        element={
          <RequireAuth>
            <SessionGateway />
          </RequireAuth>
        }
      />
      <Route
        path="/report"
        element={
          <RequireAuth>
            <ReportPage />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
