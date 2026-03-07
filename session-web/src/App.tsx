import { useState, useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import ReportPage from "./ReportPage";
import BuilderPage from "./SessionBuilderPage";
import ActiveSessionPage from "./ActiveSessionPage";
import { getSessionState } from "./extensionState";

function HomePage() {
  const [status, setStatus] = useState<"loading" | "active" | "inactive">("loading");

  useEffect(() => {
    getSessionState().then((s) => {
      setStatus(s === "running" || s === "awaiting_feedback" ? "active" : "inactive");
    });
  }, []);

  if (status === "loading") return null;

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
