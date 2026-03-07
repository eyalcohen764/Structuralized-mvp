const DEFAULT_EXTENSION_ID = "hkknllffnpnbhcjbolepkkhppjapjief";
const STORAGE_KEY = "session_ext_id_v1";

/** Extension ID - from localStorage (user-set) or default. Use getExtensionId() at runtime. */
export const EXTENSION_ID = DEFAULT_EXTENSION_ID;

export function getExtensionId(): string {
  if (typeof localStorage === "undefined") return DEFAULT_EXTENSION_ID;
  const stored = localStorage.getItem(STORAGE_KEY)?.trim();
  return stored || DEFAULT_EXTENSION_ID;
}

export function setExtensionId(id: string): void {
  localStorage.setItem(STORAGE_KEY, id.trim());
}

/** Auto-detect extension ID via postMessage (content script responds). Returns null if not found within timeout. */
export function getExtensionIdAuto(timeoutMs = 500): Promise<string | null> {
  return new Promise((resolve) => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "SESSION_BLOCKS_ID" && typeof e.data.id === "string") {
        window.removeEventListener("message", handler);
        clearTimeout(timer);
        resolve(e.data.id);
      }
    };
    window.addEventListener("message", handler);
    window.postMessage({ type: "SESSION_BLOCKS_GET_ID" }, "*");
    const timer = setTimeout(() => {
      window.removeEventListener("message", handler);
      resolve(null);
    }, timeoutMs);
  });
}

/** Get extension ID: try auto-detect first, then localStorage, then default. Saves auto-detected ID to localStorage. */
export async function getExtensionIdAsync(): Promise<string> {
  const auto = await getExtensionIdAuto();
  if (auto) {
    setExtensionId(auto);
    return auto;
  }
  return getExtensionId();
}
