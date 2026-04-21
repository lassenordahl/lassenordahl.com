import "./style.css";
import "./display-system.css";
import "./text.css";
import { mountPreview, BULLETS, BULLET_KEYS } from "./display-preview";

const IS_LOCAL = location.hostname === "localhost" || location.hostname === "127.0.0.1";
const API_BASE = IS_LOCAL
  ? "http://localhost:8787"
  : "https://lassenordahl-api.lasseanordahl.workers.dev";

const preview = mountPreview(document.getElementById("preview"), {
  color: [255, 255, 255],
});

const input = document.getElementById("text-input");
const sendBtn = document.getElementById("send-btn");
const status = document.getElementById("status");
const colorInput = document.getElementById("badge-color");
const colorResetBtn = document.getElementById("color-reset");
const bulletPicker = document.getElementById("bullet-picker");

// null = no bullet, just plain text. Otherwise a key from bullets.txt.
let selectedBullet = null;
let colorOverride = null; // [r,g,b] or null to use the file's color

let statusTimer = null;
function setStatus(msg, ttlMs = 2400) {
  status.textContent = msg;
  if (statusTimer) clearTimeout(statusTimer);
  if (ttlMs > 0) statusTimer = setTimeout(() => (status.textContent = ""), ttlMs);
}

function rgbToHex([r, g, b]) {
  const h = (n) => n.toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}
function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function effectiveColor() {
  if (colorOverride) return colorOverride;
  if (selectedBullet && BULLETS[selectedBullet]?.color) return BULLETS[selectedBullet].color;
  return [255, 255, 255];
}

function buildSegments() {
  const message = input.value || "";
  const segments = [];
  if (selectedBullet && BULLETS[selectedBullet]) {
    segments.push({ kind: "bullet", line: selectedBullet, color: effectiveColor() });
    if (message) segments.push({ kind: "text", value: ` ${message} ` });
  } else if (message) {
    segments.push({ kind: "text", value: message });
  }
  return segments;
}

function refreshPreview() {
  const segments = buildSegments();
  if (segments.length === 0) preview.setText("");
  else preview.setSegments(segments);
}

function syncColorInput() {
  colorInput.value = rgbToHex(effectiveColor());
}

function renderBulletPicker() {
  bulletPicker.innerHTML = "";

  const noneBtn = document.createElement("button");
  noneBtn.type = "button";
  noneBtn.className = "bullet-chip";
  noneBtn.textContent = "none";
  noneBtn.addEventListener("click", () => selectBullet(null));
  bulletPicker.appendChild(noneBtn);

  for (const key of BULLET_KEYS) {
    const b = BULLETS[key];
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "bullet-chip";
    btn.dataset.key = key;

    const dot = document.createElement("span");
    dot.className = "bullet-chip-dot";
    dot.style.background = b.color ? rgbToHex(b.color) : "#ffffff";
    btn.appendChild(dot);

    const label = document.createElement("span");
    label.textContent = key;
    btn.appendChild(label);

    btn.addEventListener("click", () => selectBullet(key));
    bulletPicker.appendChild(btn);
  }
  highlightSelected();
}

function highlightSelected() {
  for (const chip of bulletPicker.querySelectorAll(".bullet-chip")) {
    const isSelected = (chip.dataset.key || null) === selectedBullet
      || (!chip.dataset.key && selectedBullet === null);
    chip.classList.toggle("selected", isSelected);
  }
}

function selectBullet(key) {
  selectedBullet = key;
  colorOverride = null;
  highlightSelected();
  syncColorInput();
  refreshPreview();
}

// ── init ─────────────────────────────────────────────────────────────────────
renderBulletPicker();
selectBullet(BULLET_KEYS[0] || null);

(async function loadCurrent() {
  try {
    const res = await fetch(`${API_BASE}/display`);
    const data = await res.json();
    if (data && typeof data.text === "string") input.value = data.text;
    refreshPreview();
  } catch (e) {
    console.error(e);
    refreshPreview();
  }
})();

input.addEventListener("input", refreshPreview);
colorInput.addEventListener("input", () => {
  colorOverride = hexToRgb(colorInput.value);
  refreshPreview();
});
colorResetBtn.addEventListener("click", () => {
  colorOverride = null;
  syncColorInput();
  refreshPreview();
});

async function send() {
  const segments = buildSegments();
  const text = segments
    .map((s) => (s.kind === "bullet" ? s.line : s.value))
    .join("")
    .trim();
  sendBtn.disabled = true;
  setStatus("sending…", 0);
  try {
    const res = await fetch(`${API_BASE}/display`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, segments }),
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
