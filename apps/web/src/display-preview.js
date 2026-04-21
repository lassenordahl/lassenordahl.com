// Web-side simulation of what the Pico renders for scrolling content.
// Font + scroll math ported from packages/pico/display.py so the preview
// matches the device pixel-for-pixel. Supports MTA-style colored bullets
// with white letters embedded via a two-layer per-column format.

import bulletsText from "./bullets.txt";
import { parseBullets } from "./bullets.js";

export const BULLETS = parseBullets(bulletsText);
export const BULLET_KEYS = Object.keys(BULLETS);

export const WIDTH = 16;
export const HEIGHT = 7;
const FONT_Y_OFFSET = 1;
const WHITE = [255, 255, 255];
const TRANSPARENT = [0, 0, 0];

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

// 9×7 filled ellipse — wider than the display is tall so the 4-col letter has
// room to breathe inside the colored ring on both sides.
//   . . # # # # # . .   col0: rows 2-4   → 0b0011100 = 28
//   . # # # # # # # .   col1: rows 1-5   → 0b0111110 = 62
//   # # # # # # # # #   cols 2-6: all    → 0b1111111 = 127
//   # # # # # # # # #
//   # # # # # # # # #
//   . # # # # # # # .   col7: rows 1-5   → 62
//   . . # # # # # . .   col8: rows 2-4   → 28
const BULLET_BG_COLS = [28, 62, 127, 127, 127, 127, 127, 62, 28];
const BULLET_WIDTH = BULLET_BG_COLS.length;
const LETTER_START_COL = 3;

// Build the foreground overlay (the letter in white) column-by-column for a
// 4-wide FONT glyph, placed at cols 3-6 of the 9-wide bullet so the ring is
// uninterrupted on the top/bottom (col3..col6 rows 0 and 6) and the letter
// has colored buffer cols on either side.
function bulletOverlayCols(glyph) {
  const overlay = new Array(BULLET_WIDTH).fill(0);
  for (let i = 0; i < Math.min(glyph.length, 4); i++) {
    overlay[LETTER_START_COL + i] = glyph[i] << FONT_Y_OFFSET;
  }
  return overlay;
}

/**
 * Turn a list of segments into columns ready to scroll. Each column is:
 *   { bgBits, bgColor, fgBits, fgColor }
 * Render order: fg overrides bg per pixel. Text segments put the text into
 * the fg layer (bg=0) so they look identical to the old renderer. Bullets
 * put the colored circle into bg and the white letter into fg.
 */
function segmentsToColumns(segments, defaultColor) {
  const cols = [];
  for (const seg of segments) {
    if (!seg) continue;
    if (seg.kind === "bullet") {
      const letter = (seg.line || "").toUpperCase();
      const hand = BULLETS[letter];
      // Prefer hand-drawn bullet from bullets.txt. Segment color overrides
      // the file's color if set; otherwise fall back to file color or white.
      if (hand) {
        const bg = seg.color || hand.color || WHITE;
        for (let i = 0; i < hand.bgCols.length; i++) {
          cols.push({
            bgBits: hand.bgCols[i],
            bgColor: bg,
            fgBits: hand.fgCols[i],
            fgColor: WHITE,
          });
        }
      } else {
        // Fallback: 9×7 ellipse + font overlay (for unknown keys).
        const bg = seg.color || WHITE;
        const glyph = Array.isArray(seg.glyph) && seg.glyph.length > 0
          ? seg.glyph
          : FONT[letter] || FALLBACK;
        const overlay = bulletOverlayCols(glyph);
        for (let i = 0; i < BULLET_WIDTH; i++) {
          cols.push({
            bgBits: BULLET_BG_COLS[i],
            bgColor: bg,
            fgBits: overlay[i],
            fgColor: WHITE,
          });
        }
      }
    } else if (seg.kind === "text") {
      const text = String(seg.value ?? "");
      for (const ch of text) {
        const key = ch === "m" ? "m" : ch.toUpperCase();
        const glyph = FONT[key] || FALLBACK;
        for (const g of glyph) {
          cols.push({
            bgBits: 0,
            bgColor: TRANSPARENT,
            fgBits: g << FONT_Y_OFFSET,
            fgColor: defaultColor,
          });
        }
        cols.push({ bgBits: 0, bgColor: TRANSPARENT, fgBits: 0, fgColor: defaultColor });
      }
    }
  }
  return cols;
}

/**
 * Attach a live scrolling preview to the given container.
 *
 * Returns { setText, setSegments, stop } — call stop() to dispose. The
 * container is emptied and populated with a WIDTH×HEIGHT grid that scrolls
 * at the same ~80ms/column cadence as the Pico's main loop.
 */
export function mountPreview(container, opts = {}) {
  const { color = WHITE, stepMs = 80 } = opts;

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
  let defaultColor = color;
  let raf = null;
  let lastStep = 0;

  const hex = ([r, g, b]) => `rgb(${r},${g},${b})`;
  const OFF = "#000";

  function renderFrame() {
    const n = cols.length;
    for (let i = 0; i < cells.length; i++) cells[i].style.background = OFF;
    if (n === 0) return;
    for (let x = 0; x < WIDTH; x++) {
      const col = cols[(offset + x) % n];
      for (let row = 0; row < HEIGHT; row++) {
        const mask = 1 << row;
        if (col.fgBits & mask) {
          cells[row * WIDTH + x].style.background = hex(col.fgColor);
        } else if (col.bgBits & mask) {
          cells[row * WIDTH + x].style.background = hex(col.bgColor);
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

  function setSegments(segments) {
    cols = segmentsToColumns(segments || [], defaultColor);
    offset = 0;
    renderFrame();
  }

  function setText(text) {
    setSegments([{ kind: "text", value: text || "" }]);
  }

  return {
    setText,
    setSegments,
    stop() {
      if (raf != null) cancelAnimationFrame(raf);
      raf = null;
    },
  };
}
