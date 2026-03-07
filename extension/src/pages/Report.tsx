import { useEffect, useState } from "react";

export default function Report() {
  const [report, setReport] = useState<any>(null);

  useEffect(() => {
    chrome.runtime.sendMessage({ type: "GET_REPORT" }, (res) => {
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError.message);
        return;
      }
      setReport(res.report);
    });
  }, []);

  if (!report) return <div>Loading...</div>;

  return (
    <div>
      <h1>Report</h1>
      <p>Block: {report.block}</p>
      <p>Reflection: {report.reflection}</p>
    </div>
  );
}
