// Web-side simulation of what the Pico renders for scrolling text.
// Font + scroll math ported from packages/pico/display.py so the preview
// matches the device pixel-for-pixel.

export const WIDTH = 16;
export const HEIGHT = 7;
const FONT_Y_OFFSET = 1;

const FONT = {
  " ": [0, 0, 0],
  A: [30, 5, 5, 30],
  B: [31, 21, 21, 10],
  C: [14, 17, 17, 10],
  D: [31, 17, 17, 14],
  E: [31, 21, 21, 17],
  F: [31, 5, 5, 1],
  G: [14, 17, 21, 28],
  H: [31, 4, 4, 31],
  I: [17, 31, 17, 0],
  J: [16, 17, 17, 15],
  K: [31, 4, 10, 17],
  L: [31, 16, 16, 16],
  M: [31, 2, 4, 2, 31],
  N: [31, 2, 4, 31],
  O: [14, 17, 17, 14],
  P: [31, 5, 5, 2],
  Q: [14, 17, 25, 30],
  R: [31, 13, 5, 18],
  S: [18, 21, 21, 9],
  T: [1, 1, 31, 1, 1],
  U: [15, 16, 16, 15],
  V: [7, 24, 24, 7],
  W: [3, 12, 16, 12, 3],
  X: [17, 10, 4, 10, 17],
  Y: [3, 4, 24, 4, 3],
  Z: [25, 21, 19, 17],
  0: [14, 17, 17, 14],
  1: [18, 31, 16, 0],
  2: [25, 21, 21, 18],
  3: [17, 21, 21, 11],
  4: [6, 5, 31, 4],
  5: [23, 21, 21, 9],
  6: [14, 21, 21, 8],
  7: [1, 25, 5, 3],
  8: [10, 21, 21, 10],
  9: [2, 21, 21, 14],
  "!": [0, 29, 0],
  ".": [0, 24, 0],
  ",": [0, 24, 8],
  "-": [4, 4, 4],
  ":": [0, 10, 0],
  m: [28, 4, 28, 4, 28],
};

const FALLBACK = [31, 0, 31];

export function textToColumns(text) {
  const cols = [];
  for (const chRaw of String(text)) {
    const ch = chRaw === "m" ? "m" : chRaw.toUpperCase();
    const glyph = FONT[ch] || FALLBACK;
    for (const c of glyph) cols.push(c);
    cols.push(0); // 1-pixel gap
  }
  return cols;
}

/**
 * Attach a live scrolling-text preview to the given container.
 * Returns { setText, setColor, stop } — call stop() to dispose.
 *
 * The container will be emptied and populated with a WIDTH×HEIGHT grid that
 * scrolls at the same ~80ms/column cadence as the Pico's main loop.
 */
export function mountPreview(container, opts = {}) {
  const { color = [0, 200, 255], stepMs = 80 } = opts;

  container.classList.add("display-preview");
  container.innerHTML = "";
  const cells = [];
  for (let i = 0; i < WIDTH * HEIGHT; i++) {
    const cell = document.createElement("div");
    cell.className = "pixel-cell";
    container.appendChild(cell);
    cells.push(cell);
  }

  let cols = [];
  let offset = 0;
  let currentColor = color;
  let raf = null;
  let lastStep = 0;

  const hex = ([r, g, b]) => `rgb(${r},${g},${b})`;
  const off = "#000";

  function renderFrame() {
    const n = cols.length;
    for (let i = 0; i < cells.length; i++) cells[i].style.background = off;
    if (n === 0) return;
    const lit = hex(currentColor);
    for (let x = 0; x < WIDTH; x++) {
      const colBits = cols[(offset + x) % n];
      for (let row = 0; row < 5; row++) {
        if (colBits & (1 << row)) {
          const idx = (row + FONT_Y_OFFSET) * WIDTH + x;
          cells[idx].style.background = lit;
        }
      }
    }
  }

  function tick(now) {
    if (!lastStep) lastStep = now;
    if (now - lastStep >= stepMs) {
      const n = cols.length;
      if (n > 0) offset = (offset + 1) % n;
      renderFrame();
      lastStep = now;
    }
    raf = requestAnimationFrame(tick);
  }

  raf = requestAnimationFrame(tick);

  return {
    setText(text) {
      cols = textToColumns(text || "");
      offset = 0;
      renderFrame();
    },
    setColor(rgb) {
      currentColor = rgb;
      renderFrame();
    },
    stop() {
      if (raf != null) cancelAnimationFrame(raf);
      raf = null;
    },
  };
}
