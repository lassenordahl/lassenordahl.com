import "./style.css";
import "./draw.css";

const IS_LOCAL = location.hostname === "localhost" || location.hostname === "127.0.0.1";
const API_BASE = IS_LOCAL
  ? "http://localhost:8787"
  : "https://lassenordahl-api.lasseanordahl.workers.dev";
const WS_URL = IS_LOCAL
  ? "ws://localhost:8787/pixels/ws"
  : "wss://lassenordahl-api.lasseanordahl.workers.dev/pixels/ws";
const WIDTH = 16;
const HEIGHT = 7;

const PALETTE = [
  [0, 200, 255],   // cyan (default)
  [40, 80, 255],   // blue
  [60, 255, 120],  // green
  [255, 220, 0],   // yellow
  [255, 165, 0],   // orange
  [255, 60, 60],   // red
  [255, 60, 180],  // hot pink
  [180, 60, 255],  // purple
  [255, 255, 255], // white
  [0, 0, 0],       // black (erase)
];

let selectedColor = PALETTE[0];
let pixels = Array.from({ length: WIDTH * HEIGHT }, () => [0, 0, 0]);
let isMouseDown = false;
let ws = null;
let reconnectDelay = 500;

// ── Build grid ─────────────────────────────────────────────────────────────────
function buildGrid() {
  const grid = document.getElementById("pixel-grid");
  grid.innerHTML = "";
  for (let i = 0; i < WIDTH * HEIGHT; i++) {
    const cell = document.createElement("div");
    cell.className = "pixel-cell";
    cell.dataset.idx = i;

    cell.addEventListener("mousedown", () => {
      isMouseDown = true;
      paintPixel(i);
    });
    cell.addEventListener("mouseenter", () => {
      if (isMouseDown) paintPixel(i);
    });

    grid.appendChild(cell);
  }

  document.addEventListener("mouseup", () => { isMouseDown = false; });

  grid.addEventListener("touchstart", (e) => {
    e.preventDefault();
    isMouseDown = true;
    const touch = e.touches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    if (el && el.dataset.idx !== undefined) paintPixel(Number(el.dataset.idx));
  }, { passive: false });

  grid.addEventListener("touchmove", (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    if (el && el.dataset.idx !== undefined) paintPixel(Number(el.dataset.idx));
  }, { passive: false });

  grid.addEventListener("touchend", () => { isMouseDown = false; });
}

function buildPalette() {
  const palette = document.getElementById("palette");
  PALETTE.forEach((color, i) => {
    const swatch = document.createElement("button");
    const isBlack = color[0] === 0 && color[1] === 0 && color[2] === 0;
    swatch.className =
      "swatch" + (i === 0 ? " selected" : "") + (isBlack ? " is-black" : "");
    const hex = `rgb(${color[0]},${color[1]},${color[2]})`;
    swatch.style.setProperty("--swatch-color", hex);
    swatch.addEventListener("click", () => {
      document.querySelectorAll(".swatch").forEach(s => s.classList.remove("selected"));
      swatch.classList.add("selected");
      selectedColor = color;
    });
    palette.appendChild(swatch);
  });
}

// ── Local render ───────────────────────────────────────────────────────────────
function renderCell(idx) {
  const cell = document.querySelector(`[data-idx="${idx}"]`);
  if (!cell) return;
  const [r, g, b] = pixels[idx];
  cell.style.background = `rgb(${r},${g},${b})`;
}

function renderAll() {
  for (let i = 0; i < pixels.length; i++) renderCell(i);
}

// ── Paint (local + send) ───────────────────────────────────────────────────────
function paintPixel(idx) {
  const [r, g, b] = selectedColor;
  pixels[idx] = [r, g, b];
  renderCell(idx);

  const x = idx % WIDTH;
  const y = Math.floor(idx / WIDTH);
  const payload = { type: "paint", x, y, r, g, b };

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  } else {
    // Fallback if socket isn't up yet — still goes through the DO.
    fetch(`${API_BASE}/pixels`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ x, y, r, g, b }),
    }).catch(console.error);
  }
}

// ── WebSocket ──────────────────────────────────────────────────────────────────
function connectWS() {
  ws = new WebSocket(WS_URL);

  ws.addEventListener("open", () => {
    reconnectDelay = 500;
  });

  ws.addEventListener("message", (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    if (msg.type === "snapshot") {
      pixels = msg.pixels;
      renderAll();
      if (Array.isArray(msg.saves)) renderSaves(msg.saves);
    } else if (msg.type === "paint") {
      pixels[msg.y * WIDTH + msg.x] = [msg.r, msg.g, msg.b];
      renderCell(msg.y * WIDTH + msg.x);
    } else if (msg.type === "clear") {
      pixels = Array.from({ length: WIDTH * HEIGHT }, () => [0, 0, 0]);
      renderAll();
    } else if (msg.type === "replace" && Array.isArray(msg.pixels)) {
      pixels = msg.pixels;
      renderAll();
    } else if (msg.type === "saved" && msg.save) {
      prependSave(msg.save);
    } else if (msg.type === "save_deleted" && msg.id) {
      removeSaveFromDom(msg.id);
    }
  });

  ws.addEventListener("close", () => {
    setTimeout(connectWS, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 10000);
  });

  ws.addEventListener("error", () => {
    try { ws.close(); } catch {}
  });
}

// ── Clear ──────────────────────────────────────────────────────────────────────
document.getElementById("clear-btn").addEventListener("click", () => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "clear" }));
  } else {
    fetch(`${API_BASE}/pixels`, { method: "DELETE" }).catch(console.error);
  }
});

// ── Saves ──────────────────────────────────────────────────────────────────────
const saveBtn = document.getElementById("save-btn");
const savesList = document.getElementById("saves-list");
const savesEmpty = document.getElementById("saves-empty");

function formatTimestamp(ms) {
  const d = new Date(ms);
  const date = d.toLocaleDateString([], { month: "short", day: "numeric" });
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `${date} · ${time}`;
}

function renderSaveItem(save) {
  const item = document.createElement("button");
  item.className = "save-item";
  item.type = "button";
  item.dataset.id = save.id;
  item.title = "restore this drawing";

  const grid = document.createElement("div");
  grid.className = "save-grid";
  for (let i = 0; i < WIDTH * HEIGHT; i++) {
    const cell = document.createElement("div");
    cell.className = "pixel-cell";
    const [r, g, b] = save.pixels[i] || [0, 0, 0];
    cell.style.background = `rgb(${r},${g},${b})`;
    grid.appendChild(cell);
  }

  const time = document.createElement("div");
  time.className = "save-time";
  time.textContent = formatTimestamp(save.createdAt);

  item.appendChild(grid);
  item.appendChild(time);
  item.addEventListener("click", () => {
    const deleted = registerClick(save.id);
    if (!deleted) restoreSave(save.id);
  });
  return item;
}

const RAPID_CLICK_WINDOW_MS = 1200;
const RAPID_CLICK_THRESHOLD = 4;
const clickState = new Map();

function registerClick(id) {
  let state = clickState.get(id);
  if (!state) {
    state = { count: 0, timer: null };
    clickState.set(id, state);
  }
  state.count += 1;
  if (state.timer) clearTimeout(state.timer);
  if (state.count >= RAPID_CLICK_THRESHOLD) {
    clickState.delete(id);
    deleteSave(id);
    return true;
  }
  state.timer = setTimeout(() => clickState.delete(id), RAPID_CLICK_WINDOW_MS);
  return false;
}

function restoreSave(id) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "restore", id }));
  } else {
    fetch(`${API_BASE}/pixels/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(console.error);
  }
}

function deleteSave(id) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "delete_save", id }));
  } else {
    fetch(`${API_BASE}/pixels/saves`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(console.error);
  }
}

function removeSaveFromDom(id) {
  const el = savesList.querySelector(`[data-id="${id}"]`);
  if (el) el.remove();
  updateEmptyState();
}

function updateEmptyState() {
  if (savesList.children.length === 0) savesEmpty.classList.remove("hidden");
  else savesEmpty.classList.add("hidden");
}

function renderSaves(saves) {
  savesList.innerHTML = "";
  saves.forEach((s) => savesList.appendChild(renderSaveItem(s)));
  updateEmptyState();
}

function prependSave(save) {
  if (savesList.querySelector(`[data-id="${save.id}"]`)) return;
  savesList.prepend(renderSaveItem(save));
  updateEmptyState();
}

saveBtn.addEventListener("click", async () => {
  saveBtn.disabled = true;
  try {
    const res = await fetch(`${API_BASE}/pixels/saves`, { method: "POST" });
    const data = await res.json();
    if (data && data.save) prependSave(data.save);
  } catch (e) {
    console.error(e);
  } finally {
    saveBtn.disabled = false;
  }
});

async function loadSaves() {
  try {
    const res = await fetch(`${API_BASE}/pixels/saves`);
    const data = await res.json();
    if (data && Array.isArray(data.saves)) renderSaves(data.saves);
    else updateEmptyState();
  } catch (e) {
    console.error(e);
    updateEmptyState();
  }
}

// ── Init ───────────────────────────────────────────────────────────────────────
buildGrid();
buildPalette();
updateEmptyState();
loadSaves();
connectWS();
