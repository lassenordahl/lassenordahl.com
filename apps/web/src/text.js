import "./style.css";
import "./display-system.css";
import "./text.css";
import { mountPreview } from "./display-preview";

const IS_LOCAL = location.hostname === "localhost" || location.hostname === "127.0.0.1";
const API_BASE = IS_LOCAL
  ? "http://localhost:8787"
  : "https://lassenordahl-api.lasseanordahl.workers.dev";

const preview = mountPreview(document.getElementById("preview"), {
  color: [0, 200, 255],
});

const input = document.getElementById("text-input");
const sendBtn = document.getElementById("send-btn");
const status = document.getElementById("status");

let statusTimer = null;
function setStatus(msg, ttlMs = 2400) {
  status.textContent = msg;
  if (statusTimer) clearTimeout(statusTimer);
  if (ttlMs > 0) statusTimer = setTimeout(() => (status.textContent = ""), ttlMs);
}

// Hydrate preview with whatever is currently on the display.
(async function loadCurrent() {
  try {
    const res = await fetch(`${API_BASE}/display`);
    const data = await res.json();
    if (data && typeof data.text === "string") {
      input.value = data.text;
      preview.setText(data.text);
    }
  } catch (e) {
    console.error(e);
  }
})();

input.addEventListener("input", () => {
  preview.setText(input.value);
});

async function send() {
  const text = input.value;
  sendBtn.disabled = true;
  setStatus("sending…", 0);
  try {
    const res = await fetch(`${API_BASE}/display`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    setStatus("sent — will show next text cycle");
  } catch (e) {
    console.error(e);
    setStatus("send failed");
  } finally {
    sendBtn.disabled = false;
  }
}

sendBtn.addEventListener("click", send);
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    send();
  }
});
