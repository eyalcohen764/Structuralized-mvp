import { Routes, Route } from "react-router-dom";
import ReportPage from "./ReportPage";
import BuilderPage from "./SessionBuilderPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<BuilderPage />} />
      <Route path="/report" element={<ReportPage />} />
    </Routes>
  );
}
