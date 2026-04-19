import "./style.css";
import "./draw.css";
import { detectPhallic } from "./phallic-detect";

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
    swatch.className = "swatch" + (i === 0 ? " selected" : "");
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
  updateAlert();
}

function updateAlert() {
  const page = document.querySelector(".draw-page");
  if (!page) return;
  page.classList.toggle("alert", detectPhallic(pixels, WIDTH, HEIGHT));
}

// ── Paint (local + send) ───────────────────────────────────────────────────────
function paintPixel(idx) {
  const [r, g, b] = selectedColor;
  pixels[idx] = [r, g, b];
  renderCell(idx);
  updateAlert();

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
    } else if (msg.type === "paint") {
      pixels[msg.y * WIDTH + msg.x] = [msg.r, msg.g, msg.b];
      renderCell(msg.y * WIDTH + msg.x);
      updateAlert();
    } else if (msg.type === "clear") {
      pixels = Array.from({ length: WIDTH * HEIGHT }, () => [0, 0, 0]);
      renderAll();
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

// ── Init ───────────────────────────────────────────────────────────────────────
buildGrid();
buildPalette();
connectWS();
