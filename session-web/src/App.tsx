import { useState, useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import { Box, CircularProgress, Typography } from "@mui/material";
import ReportPage from "./ReportPage";
import BuilderPage from "./SessionBuilderPage";
import ActiveSessionPage from "./ActiveSessionPage";
import { getSessionState } from "./extensionState";

function HomePage() {
  const [status, setStatus] = useState<"loading" | "active" | "inactive">("loading");

  useEffect(() => {
    const check = async () => {
      const s = await getSessionState();
      setStatus(s === "running" || s === "awaiting_feedback" ? "active" : "inactive");
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
      <Route path="/" element={<HomePage />} />
      <Route path="/report" element={<ReportPage />} />
    </Routes>
  );
}
