import { getExtensionIdAsync } from "./config";

type SessionStatus = "idle" | "running" | "awaiting_feedback" | "completed";

export async function getSessionState(): Promise<SessionStatus | null> {
  try {
    const extId = await getExtensionIdAsync();
    const response = await chrome.runtime.sendMessage(extId, { type: "GET_STATE" });
    if (response?.ok && response.state?.status) {
      return response.state.status as SessionStatus;
    }
    return null;
  } catch {
    return null;
  }
}
