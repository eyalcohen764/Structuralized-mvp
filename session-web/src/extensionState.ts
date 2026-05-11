/**
 * extensionState.ts — Thin helper that sends a GET_STATE message to the extension and returns the current session status string; used by SessionGateway to poll the extension every 4 seconds.
 */
import { getExtensionIdAsync } from "./config";

type SessionStatus = "idle" | "running" | "paused" | "awaiting_feedback" | "completed";

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
