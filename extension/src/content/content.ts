import type { Msg } from "../shared";

const OVERLAY_ID = "session-ext-overlay-root";
const MODAL_ID = "session-ext-modal-root";

function ensureOverlayRoot() {
  let root = document.getElementById(OVERLAY_ID) as HTMLDivElement | null;
  if (root) return root;

  root = document.createElement("div");
  root.id = OVERLAY_ID;
  root.style.position = "fixed";
  root.style.zIndex = "2147483647";
  root.style.top = "16px";
  root.style.right = "16px";
  root.style.width = "360px";
  root.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, Arial";
  document.documentElement.appendChild(root);
  return root;
}

function clearOverlay() {
  const root = document.getElementById(OVERLAY_ID);
  if (root) root.innerHTML = "";
}

function formatTime(ts: number) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function renderRunning(title: string, endsAt: number, subtitle?: string) {
  const root = ensureOverlayRoot();
  root.innerHTML = "";

  const card = document.createElement("div");
  card.style.cssText =
    "background:white;border:1px solid rgba(0,0,0,0.15);border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,0.2);padding:12px;";

  card.innerHTML = `
    <div style="font-weight:800;margin-bottom:6px;">${title}</div>
    ${subtitle ? `<div style="font-size:13px;opacity:0.75;margin-bottom:6px;">${subtitle}</div>` : ""}
    <div style="font-size:14px;opacity:0.85;margin-bottom:10px;">
      Ends at <b>${formatTime(endsAt)}</b>
    </div>
    <div style="font-size:12px;opacity:0.65;">This will auto-hide in ~20 seconds.</div>
  `;

  const btn = document.createElement("button");
  btn.textContent = "Dismiss";
  btn.style.cssText =
    "margin-top:10px;padding:8px 10px;border-radius:10px;border:1px solid rgba(0,0,0,0.2);background:white;cursor:pointer;";
  btn.onclick = () => (root.innerHTML = "");

  card.appendChild(btn);
  root.appendChild(card);

  // ✅ auto-hide after 20s
  window.setTimeout(() => {
    const r = document.getElementById(OVERLAY_ID);
    if (r) r.innerHTML = "";
  }, 20_000);
}

function ensureModalRoot() {
  let root = document.getElementById(MODAL_ID) as HTMLDivElement | null;
  if (root) return root;

  root = document.createElement("div");
  root.id = MODAL_ID;
  root.style.position = "fixed";
  root.style.inset = "0";
  root.style.zIndex = "2147483647";
  root.style.display = "flex";
  root.style.alignItems = "center";
  root.style.justifyContent = "center";
  root.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, Arial";
  document.documentElement.appendChild(root);
  return root;
}

function closeModal() {
  const root = document.getElementById(MODAL_ID);
  if (root) root.remove();
}

function renderFeedbackModal(
  endedTitle: string,
  nextTitle: string,
  nextNeedsTopic: boolean,
  isFinal: boolean,
  runId: string,
) {
  clearOverlay();

  // ✅ Dynamic-first start prompt: we don't want reflection; we want topic + Start
  const isStartPrompt = endedTitle === "Session starting";

  const root = ensureModalRoot();
  root.innerHTML = "";

  const backdrop = document.createElement("div");
  backdrop.style.cssText =
    "position:absolute;inset:0;background:rgba(0,0,0,0.45);";

  const panel = document.createElement("div");
  panel.style.cssText =
    "position:relative;width:min(560px,92vw);background:#fff;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,0.35);padding:18px;";

  panel.innerHTML = `
    <div style="font-weight:900;font-size:18px;margin-bottom:6px;">
      ${
        isStartPrompt
          ? "Before we begin"
          : isFinal
            ? "Final block finished"
            : "Block finished"
      }
    </div>
    <div style="font-size:14px;opacity:0.85;margin-bottom:14px;">
      <div><b>${isStartPrompt ? "Starting:" : "Just ended:"}</b> ${endedTitle}</div>
      <div style="margin-top:4px;"><b>${isFinal ? "Status:" : "Next:"}</b> ${nextTitle}</div>
    </div>
  `;

  // error label (instead of silently returning)
  const error = document.createElement("div");
  error.style.cssText =
    "margin-top:10px;color:#b00020;font-size:13px;display:none;";
  error.textContent = "";
  const setError = (msg: string) => {
    error.textContent = msg;
    error.style.display = msg ? "block" : "none";
  };

  // Reflection section (hidden for start prompt)
  const reflection = document.createElement("textarea");
  reflection.rows = 4;
  reflection.placeholder =
    "Describe the main things you actually did in practice during this block, briefly explain: which of the goals you achieved for this block? or what distracted you?";
  reflection.style.cssText =
    "width:100%;border-radius:12px;border:1px solid rgba(0,0,0,0.2);padding:10px;font-size:14px;resize:vertical;";

  if (!isStartPrompt) {
    const reflectionLabel = document.createElement("div");
    reflectionLabel.style.cssText = "font-weight:700;margin-bottom:6px;";
    reflectionLabel.textContent = "Quick reflection";
    panel.appendChild(reflectionLabel);
    panel.appendChild(reflection);
  }

  // Dynamic topic input
  let topicInput: HTMLInputElement | null = null;

  // ✅ If start prompt: always show topic input (because we only trigger this for dynamic-first)
  // ✅ If between blocks: show topic input only if nextNeedsTopic
  const shouldAskTopic = isStartPrompt ? true : !isFinal && nextNeedsTopic;

  if (shouldAskTopic) {
    const label = document.createElement("div");
    label.style.cssText = "margin-top:12px;font-weight:700;margin-bottom:6px;";
    label.textContent = isStartPrompt
      ? "What is the focus of this first block?"
      : "Dynamic focus for the next block";
    panel.appendChild(label);

    topicInput = document.createElement("input");
    topicInput.placeholder = isStartPrompt
      ? "What are you focusing on now?"
      : "What are you focusing on next?";
    topicInput.style.cssText =
      "width:100%;border-radius:12px;border:1px solid rgba(0,0,0,0.2);padding:10px;font-size:14px;";
    panel.appendChild(topicInput);
  }

  panel.appendChild(error);

  const row = document.createElement("div");
  row.style.cssText =
    "display:flex;gap:10px;justify-content:flex-end;margin-top:14px;";

  const cancel = document.createElement("button");
  cancel.textContent = "Not now";
  cancel.style.cssText =
    "padding:10px 12px;border-radius:12px;border:1px solid rgba(0,0,0,0.2);background:white;cursor:pointer;";
  cancel.onclick = () => closeModal();

  const submit = document.createElement("button");
  submit.textContent = isStartPrompt
    ? "Start"
    : isFinal
      ? "Complete"
      : "Continue";
  submit.style.cssText =
    "padding:10px 12px;border-radius:12px;border:1px solid rgba(0,0,0,0.2);background:#111;color:white;cursor:pointer;font-weight:800;";

  submit.onclick = async () => {
    setError("");

    const r = reflection.value.trim();
    const t = topicInput ? topicInput.value.trim() : "";

    // Validation:
    // - Start prompt: only require topic
    // - Normal: require reflection; and require topic if nextNeedsTopic
    if (isStartPrompt) {
      if (!t) {
        setError("Please enter a focus to start the dynamic block.");
        return;
      }
    } else {
      if (!r) {
        setError("Please enter a reflection to continue.");
        return;
      }
      if (!isFinal && nextNeedsTopic && !t) {
        setError("Please enter a focus for the next dynamic block.");
        return;
      }
    }

    await chrome.runtime.sendMessage({
      type: "SUBMIT_BLOCK_FEEDBACK",
      payload: {
        reflection: isStartPrompt ? "" : r,
        nextTopic: t || undefined,
      },
    });

    // ✅ final -> open report
    if (isFinal) {
      await chrome.runtime.sendMessage({
        type: "OPEN_REPORT",
        payload: { runId },
      });
    }

    closeModal();
  };

  row.appendChild(cancel);
  row.appendChild(submit);

  panel.appendChild(row);

  root.appendChild(backdrop);
  root.appendChild(panel);

  // nicety: focus the first field
  if (isStartPrompt && topicInput) topicInput.focus();
  else if (!isStartPrompt) reflection.focus();
}

chrome.runtime.onMessage.addListener((msg: Msg) => {
  if (msg.type === "SHOW_RUNNING_OVERLAY") {
    renderRunning(msg.payload.title, msg.payload.endsAt, msg.payload.subtitle);
    return;
  }

  if (msg.type === "SHOW_FEEDBACK_MODAL") {
    renderFeedbackModal(
      msg.payload.endedTitle,
      msg.payload.nextTitle,
      msg.payload.nextNeedsTopic,
      msg.payload.isFinal,
      msg.payload.runId,
    );
    return;
  }
});
