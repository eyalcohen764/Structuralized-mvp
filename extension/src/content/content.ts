import type { BlockType, Msg } from "../shared";

const OVERLAY_ID = "session-ext-overlay-root";
const MODAL_ID = "session-ext-modal-root";

/** Always light theme - prevents inheriting dark styles from the page */
const LIGHT = {
  bg: "#fff",
  text: "#111",
  textMuted: "rgba(0,0,0,0.75)",
  border: "rgba(0,0,0,0.2)",
};

// ─── Audio state ──────────────────────────────────────────────────────────────

let audioState: { ctx: AudioContext; gain: GainNode } | null = null;
// Monotonically-increasing counter. Each stopAudio() call bumps it so that any
// in-flight startAudio() that started before the stop knows it is stale and
// must not call source.start() — prevents two AudioContexts from playing at once.
let audioGeneration = 0;

function stopAudio() {
  audioGeneration++;
  if (audioState) {
    try { audioState.ctx.close(); } catch { /* ignore */ }
    audioState = null;
  }
}

async function startAudio(volume: number): Promise<void> {
  // Capture the generation at call time. If stopAudio() is called while we
  // are awaiting fetch/decode, our generation will be stale and we bail out.
  const myGen = audioGeneration;
  try {
    const ctx = new AudioContext();
    await ctx.resume();
    if (myGen !== audioGeneration) { try { ctx.close(); } catch {} return; }

    const url = chrome.runtime.getURL("audio/remembering-these-places_E_minor.wav");
    const arrayBuf = await fetch(url).then((r) => r.arrayBuffer());
    if (myGen !== audioGeneration) { try { ctx.close(); } catch {} return; }

    const audioBuffer = await ctx.decodeAudioData(arrayBuf);
    if (myGen !== audioGeneration) { try { ctx.close(); } catch {} return; }

    const gain = ctx.createGain();
    const pct = volume / 100;
    gain.gain.value = pct * pct; // quadratic curve for perceptual linearity

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.loop = true;
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start(0);

    audioState = { ctx, gain };
  } catch {
    // Autoplay blocked or context closed — fail silently
  }
}

// ─── Overlay helpers ──────────────────────────────────────────────────────────

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
  root.style.colorScheme = "light";
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
  card.style.cssText = `background:${LIGHT.bg};color:${LIGHT.text};border:1px solid ${LIGHT.border};border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,0.2);padding:12px;`;

  card.innerHTML = `
    <div style="font-weight:800;margin-bottom:6px;color:${LIGHT.text}">${title}</div>
    ${subtitle ? `<div style="font-size:13px;color:${LIGHT.textMuted};margin-bottom:6px">${subtitle}</div>` : ""}
    <div style="font-size:14px;color:${LIGHT.textMuted};margin-bottom:10px">
      Ends at <b style="color:${LIGHT.text}">${formatTime(endsAt)}</b>
    </div>
    <div style="font-size:12px;color:${LIGHT.textMuted}">This will auto-hide in ~20 seconds.</div>
  `;

  const btn = document.createElement("button");
  btn.textContent = "Dismiss";
  btn.style.cssText = `margin-top:10px;padding:8px 10px;border-radius:10px;border:1px solid ${LIGHT.border};background:${LIGHT.bg};color:${LIGHT.text};cursor:pointer;`;
  btn.onclick = () => (root.innerHTML = "");

  card.appendChild(btn);
  root.appendChild(card);

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
  root.style.colorScheme = "light";
  document.documentElement.appendChild(root);
  return root;
}

function closeModal() {
  stopAudio();
  const root = document.getElementById(MODAL_ID);
  if (root) root.remove();
}

function renderFeedbackModal(
  endedTitle: string,
  nextTitle: string,
  nextNeedsTopic: boolean,
  isFinal: boolean,
  runId: string,
  inputRequired: boolean,
  snoozeMax: number,
  maxSnoozeMinutes: number,
  snoozeCount: number,
  endedBlockType: BlockType,
  alertVolume: number,
) {
  clearOverlay();
  stopAudio(); // clean up any prior audio before re-rendering

  const isStartPrompt = endedTitle === "Session starting";
  const snoozesLeft = snoozeMax - snoozeCount;
  const canSnooze = snoozeMax > 0 && !isStartPrompt && snoozesLeft > 0;

  const root = ensureModalRoot();
  root.innerHTML = "";

  const backdrop = document.createElement("div");
  backdrop.style.cssText =
    "position:absolute;inset:0;background:rgba(0,0,0,0.45);";

  const panel = document.createElement("div");
  panel.style.cssText = `position:relative;width:min(560px,92vw);background:${LIGHT.bg};color:${LIGHT.text};border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,0.35);padding:18px;`;

  panel.innerHTML = `
    <div style="font-weight:900;font-size:18px;margin-bottom:6px;color:${LIGHT.text}">
      ${
        isStartPrompt
          ? "Before we begin"
          : isFinal
            ? "Final block finished"
            : "Block finished"
      }
    </div>
    <div style="font-size:14px;color:${LIGHT.textMuted};margin-bottom:14px">
      <div><b style="color:${LIGHT.text}">${isStartPrompt ? "Starting:" : "Just ended:"}</b> ${endedTitle}</div>
      <div style="margin-top:4px"><b style="color:${LIGHT.text}">${isFinal ? "Status:" : "Next:"}</b> ${nextTitle}</div>
    </div>
  `;

  // Error label
  const error = document.createElement("div");
  error.style.cssText = "margin-top:10px;color:#b00020;font-size:13px;display:none;";
  const setError = (msg: string) => {
    error.textContent = msg;
    error.style.display = msg ? "block" : "none";
  };

  // Reflection section (hidden for start prompt)
  const reflection = document.createElement("textarea");
  reflection.rows = 4;
  reflection.placeholder =
    "Describe the main things you actually did in practice during this block, briefly explain: which of the goals you achieved for this block? or what distracted you?";
  reflection.style.cssText = `width:100%;border-radius:12px;border:1px solid ${LIGHT.border};padding:10px;font-size:14px;resize:vertical;background:${LIGHT.bg};color:${LIGHT.text};box-sizing:border-box;`;

  if (!isStartPrompt) {
    const reflectionLabel = document.createElement("div");
    reflectionLabel.style.cssText = `font-weight:700;margin-bottom:6px;color:${LIGHT.text}`;
    reflectionLabel.textContent = inputRequired ? "Quick reflection (required)" : "Quick reflection";
    panel.appendChild(reflectionLabel);
    panel.appendChild(reflection);
  }

  // Dynamic topic input
  let topicInput: HTMLInputElement | null = null;
  const shouldAskTopic = isStartPrompt ? true : !isFinal && nextNeedsTopic;

  if (shouldAskTopic) {
    const label = document.createElement("div");
    label.style.cssText = `margin-top:12px;font-weight:700;margin-bottom:6px;color:${LIGHT.text}`;
    label.textContent = isStartPrompt
      ? "What is the focus of this first block?"
      : "Dynamic focus for the next block";
    panel.appendChild(label);

    topicInput = document.createElement("input");
    topicInput.placeholder = isStartPrompt
      ? "What are you focusing on now?"
      : "What are you focusing on next?";
    topicInput.style.cssText = `width:100%;border-radius:12px;border:1px solid ${LIGHT.border};padding:10px;font-size:14px;background:${LIGHT.bg};color:${LIGHT.text};box-sizing:border-box;`;
    panel.appendChild(topicInput);
  }

  panel.appendChild(error);

  // Volume slider (only when audio plays, i.e. not start prompt)
  let volSlider: HTMLInputElement | null = null;
  if (!isStartPrompt) {
    const volRow = document.createElement("div");
    volRow.style.cssText = `display:flex;align-items:center;gap:8px;margin-top:14px;padding:8px 10px;border-radius:10px;border:1px solid ${LIGHT.border};background:rgba(0,0,0,0.03);`;

    const volIcon = document.createElement("span");
    volIcon.textContent = "🔊";
    volIcon.style.cssText = "font-size:14px;flex-shrink:0;";

    volSlider = document.createElement("input");
    volSlider.type = "range";
    volSlider.min = "0";
    volSlider.max = "100";
    volSlider.step = "5";
    volSlider.value = String(alertVolume);
    volSlider.style.cssText = "flex:1;cursor:pointer;accent-color:#111;";

    const volLabel = document.createElement("span");
    volLabel.textContent = `${alertVolume}%`;
    volLabel.style.cssText = `font-size:12px;color:${LIGHT.textMuted};min-width:32px;text-align:right;flex-shrink:0;`;

    volSlider.oninput = () => {
      const pct = Number(volSlider!.value) / 100;
      // Quadratic curve: matches human perception of loudness (linear feels like "minor effect")
      const gain = pct * pct;
      if (audioState) {
        audioState.gain.gain.setValueAtTime(gain, audioState.ctx.currentTime);
      }
      volLabel.textContent = `${volSlider!.value}%`;
    };

    volRow.appendChild(volIcon);
    volRow.appendChild(volSlider);
    volRow.appendChild(volLabel);
    panel.appendChild(volRow);
  }

  const row = document.createElement("div");
  row.style.cssText = "display:flex;gap:10px;justify-content:flex-end;margin-top:14px;align-items:center;flex-wrap:wrap;";

  // Submit button
  const submit = document.createElement("button");
  submit.textContent = isStartPrompt ? "Start" : isFinal ? "Complete" : "Continue";

  const submitDisabled = !isStartPrompt && inputRequired;
  submit.disabled = submitDisabled;
  submit.style.cssText = `padding:10px 12px;border-radius:12px;border:1px solid rgba(0,0,0,0.2);background:#111;color:#fff;cursor:${submitDisabled ? "not-allowed" : "pointer"};font-weight:800;opacity:${submitDisabled ? "0.5" : "1"};`;

  if (!isStartPrompt && inputRequired) {
    reflection.addEventListener("input", () => {
      const hasText = reflection.value.trim().length > 0;
      submit.disabled = !hasText;
      submit.style.opacity = hasText ? "1" : "0.5";
      submit.style.cursor = hasText ? "pointer" : "not-allowed";
    });
  }

  submit.onclick = async () => {
    setError("");

    const r = reflection.value.trim();
    const t = topicInput ? topicInput.value.trim() : "";

    if (isStartPrompt) {
      if (!t) {
        setError("Please enter a focus to start the dynamic block.");
        return;
      }
    } else {
      if (inputRequired && !r) {
        setError("Please enter a reflection to continue.");
        return;
      }
      if (!isFinal && nextNeedsTopic && !t) {
        setError("Please enter a focus for the next dynamic block.");
        return;
      }
    }

    stopAudio(); // Stop immediately — don't wait for async ops
    try {
      await chrome.runtime.sendMessage({
        type: "SUBMIT_BLOCK_FEEDBACK",
        payload: {
          reflection: isStartPrompt ? "" : r,
          nextTopic: t || undefined,
        },
      });
      if (isFinal) {
        await chrome.runtime.sendMessage({
          type: "OPEN_REPORT",
          payload: { runId },
        });
      }
    } catch { /* service worker may have restarted */ }
    closeModal();
  };

  // Snooze button + inline form
  if (canSnooze) {
    const snoozeLabel =
      endedBlockType === "break"
        ? `Extend Break (${snoozesLeft} left)`
        : `Snooze (${snoozesLeft} left)`;

    const snoozeBtn = document.createElement("button");
    snoozeBtn.textContent = snoozeLabel;
    snoozeBtn.style.cssText = `padding:10px 12px;border-radius:12px;border:1px solid ${LIGHT.border};background:${LIGHT.bg};color:${LIGHT.text};cursor:pointer;font-weight:700;`;

    // Snooze inline form (hidden initially)
    const snoozeForm = document.createElement("div");
    snoozeForm.style.cssText = `margin-top:12px;padding:12px;border-radius:12px;border:1px solid ${LIGHT.border};background:rgba(0,0,0,0.03);display:none;`;

    const snoozeFormLabel = document.createElement("div");
    snoozeFormLabel.style.cssText = `font-weight:700;margin-bottom:8px;font-size:14px;color:${LIGHT.text}`;
    snoozeFormLabel.textContent = `Snooze for how many minutes? (1–${maxSnoozeMinutes})`;

    const snoozeInput = document.createElement("input");
    snoozeInput.type = "number";
    snoozeInput.min = "1";
    snoozeInput.max = String(maxSnoozeMinutes);
    snoozeInput.value = String(Math.min(5, maxSnoozeMinutes));
    snoozeInput.style.cssText = `width:100%;border-radius:10px;border:1px solid ${LIGHT.border};padding:8px;font-size:14px;background:${LIGHT.bg};color:${LIGHT.text};box-sizing:border-box;`;

    const snoozeError = document.createElement("div");
    snoozeError.style.cssText = "color:#b00020;font-size:12px;margin-top:4px;display:none;";

    const snoozeFormRow = document.createElement("div");
    snoozeFormRow.style.cssText = "display:flex;gap:8px;margin-top:8px;";

    const snoozeConfirm = document.createElement("button");
    snoozeConfirm.textContent = "Confirm";
    snoozeConfirm.style.cssText = `padding:8px 14px;border-radius:10px;border:none;background:#111;color:#fff;cursor:pointer;font-weight:700;`;

    const snoozeCancel = document.createElement("button");
    snoozeCancel.textContent = "Cancel";
    snoozeCancel.style.cssText = `padding:8px 14px;border-radius:10px;border:1px solid ${LIGHT.border};background:${LIGHT.bg};color:${LIGHT.text};cursor:pointer;`;

    snoozeCancel.onclick = () => {
      snoozeForm.style.display = "none";
      snoozeBtn.style.display = "inline-block";
    };

    snoozeConfirm.onclick = async () => {
      const mins = Number(snoozeInput.value);
      if (!Number.isFinite(mins) || mins < 1 || mins > maxSnoozeMinutes) {
        snoozeError.textContent = `Please enter a value between 1 and ${maxSnoozeMinutes}.`;
        snoozeError.style.display = "block";
        return;
      }
      snoozeError.style.display = "none";

      stopAudio(); // Stop immediately — don't wait for async ops
      try {
        await chrome.runtime.sendMessage({
          type: "SNOOZE_BLOCK",
          payload: { minutes: mins },
        });
      } catch { /* service worker may have restarted */ }
      closeModal();
    };

    snoozeFormRow.appendChild(snoozeConfirm);
    snoozeFormRow.appendChild(snoozeCancel);

    snoozeForm.appendChild(snoozeFormLabel);
    snoozeForm.appendChild(snoozeInput);
    snoozeForm.appendChild(snoozeError);
    snoozeForm.appendChild(snoozeFormRow);

    snoozeBtn.onclick = () => {
      snoozeForm.style.display = "block";
      snoozeBtn.style.display = "none";
    };

    row.insertBefore(snoozeBtn, row.firstChild);
    panel.appendChild(snoozeForm);
  }

  row.appendChild(submit);
  panel.appendChild(row);

  root.appendChild(backdrop);
  root.appendChild(panel);

  if (isStartPrompt && topicInput) topicInput.focus();
  else if (!isStartPrompt) reflection.focus();

  // Start audio loop (not for start prompts)
  if (!isStartPrompt && alertVolume > 0) {
    startAudio(alertVolume).then(() => {
      // Sync gain to current slider value in case user moved it while audio was loading
      if (audioState && volSlider) {
        const pct = Number(volSlider.value) / 100;
        audioState.gain.gain.setValueAtTime(pct * pct, audioState.ctx.currentTime);
      }
    });
  }
}

// Auto-detect: page can request extension ID via postMessage (for session-web)
window.addEventListener("message", (e) => {
  if (e.data?.type === "SESSION_BLOCKS_GET_ID") {
    window.postMessage(
      { type: "SESSION_BLOCKS_ID", id: chrome.runtime.id },
      "*",
    );
  }
});

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
      msg.payload.inputRequired,
      msg.payload.snoozeMax,
      msg.payload.maxSnoozeMinutes,
      msg.payload.snoozeCount,
      msg.payload.endedBlockType,
      msg.payload.alertVolume,
    );
    return;
  }

  if (msg.type === "HIDE_FEEDBACK_MODAL") {
    closeModal();
    return;
  }
});
