import { useEffect } from "react";
import { getSessionState } from "./extensionState";

interface Props {
  onSessionEnded: () => void;
}

export default function ActiveSessionPage({ onSessionEnded }: Props) {
  useEffect(() => {
    const check = async () => {
      const status = await getSessionState();
      if (status === "idle" || status === "completed" || status === null) {
        onSessionEnded();
      }
    };

    check();
    const interval = setInterval(check, 4000);
    return () => clearInterval(interval);
  }, [onSessionEnded]);

  return (
    <div style={{ padding: "2rem", textAlign: "center" }}>
      <h2>Active session exists</h2>
      <p>The planner will be restored when the session ends.</p>
    </div>
  );
}
