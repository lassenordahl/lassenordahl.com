import "./style.css";
import "./draw.css";

const API_BASE = "https://lassenordahl-api.lasseanordahl.workers.dev";
const WIDTH = 16;
const HEIGHT = 7;

const PALETTE = [
  [0, 200, 255],   // cyan (default)
  [255, 60, 60],   // red
  [60, 255, 120],  // green
  [255, 165, 0],   // orange
  [180, 60, 255],  // purple
  [255, 255, 255], // white
  [0, 0, 0],       // black (erase)
];

let selectedColor = PALETTE[0];
let pixels = Array.from({ length: WIDTH * HEIGHT }, () => [0, 0, 0]);
let isMouseDown = false;
let pollInterval = null;

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

  // Touch support
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
    // Black swatch uses white outline so it's visible
    if (color[0] === 0 && color[1] === 0 && color[2] === 0) {
      swatch.style.setProperty("--swatch-color", "rgba(255,255,255,0.3)");
    }
    swatch.addEventListener("click", () => {
      document.querySelectorAll(".swatch").forEach(s => s.classList.remove("selected"));
      swatch.classList.add("selected");
      selectedColor = color;
    });
    palette.appendChild(swatch);
  });
}

// ── Pixel ops ──────────────────────────────────────────────────────────────────
function paintPixel(idx) {
  const [r, g, b] = selectedColor;
  pixels[idx] = [r, g, b];
  renderCell(idx);

  const x = idx % WIDTH;
  const y = Math.floor(idx / WIDTH);
  fetch(`${API_BASE}/pixels`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ x, y, r, g, b }),
  }).catch(console.error);
}

function renderCell(idx) {
  const cell = document.querySelector(`[data-idx="${idx}"]`);
  if (!cell) return;
  const [r, g, b] = pixels[idx];
  cell.style.background = `rgb(${r},${g},${b})`;
}

function renderAll() {
  for (let i = 0; i < pixels.length; i++) {
    renderCell(i);
  }
}

// ── Poll API ───────────────────────────────────────────────────────────────────
async function fetchPixels() {
  try {
    const res = await fetch(`${API_BASE}/pixels`);
    const data = await res.json();
    if (data.pixels) {
      pixels = data.pixels;
      renderAll();
    }
  } catch (e) {
    console.error("fetch pixels:", e);
  }
}

// ── Clear ──────────────────────────────────────────────────────────────────────
document.getElementById("clear-btn").addEventListener("click", async () => {
  await fetch(`${API_BASE}/pixels`, { method: "DELETE" });
  await fetchPixels();
});

// ── Init ───────────────────────────────────────────────────────────────────────
buildGrid();
buildPalette();
fetchPixels();
pollInterval = setInterval(fetchPixels, 2000);
