// Parser for bullets.txt — hand-drawn 7×7 MTA-style badges.
//
// Each block: one header line (`<key>` or `<key> color=#rrggbb`) followed
// by exactly 7 rows of 7 chars from `.#*`. Returns a map:
//   { [key]: { color: [r,g,b] | null, bgCols: number[7], fgCols: number[7] } }
// bgCols/fgCols are column-major bitmasks (bit0 = top row), matching the
// existing `{bgBits, bgColor, fgBits, fgColor}` render format.

export const BULLET_WIDTH = 7;
export const BULLET_HEIGHT = 7;

const PIXEL_RE = /^[.#*]{7}$/;

function hexToRgb(hex) {
  const clean = hex.replace("#", "").trim();
  if (clean.length !== 3 && clean.length !== 6) return null;
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return null;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function buildBullet(rows, color) {
  const bgCols = new Array(BULLET_WIDTH).fill(0);
  const fgCols = new Array(BULLET_WIDTH).fill(0);
  for (let col = 0; col < BULLET_WIDTH; col++) {
    for (let row = 0; row < BULLET_HEIGHT; row++) {
      const ch = rows[row][col];
      if (ch === "#") bgCols[col] |= 1 << row;
      else if (ch === "*") fgCols[col] |= 1 << row;
    }
  }
  return { color, bgCols, fgCols };
}

export function parseBullets(text) {
  const bullets = {};
  let headerKey = null;
  let headerColor = null;
  let rows = [];

  const flush = () => {
    if (headerKey && rows.length === BULLET_HEIGHT) {
      bullets[headerKey] = buildBullet(rows, headerColor);
    }
    headerKey = null;
    headerColor = null;
    rows = [];
  };

  for (const rawLine of text.split("\n")) {
    const line = rawLine.replace(/\s+$/, "");
    if (!line.trim()) {
      flush();
      continue;
    }
    // Comment: a `#` followed by a space/nothing, not a pixel row.
    if (/^#(\s|$)/.test(line)) continue;

    if (PIXEL_RE.test(line.trim())) {
      if (!headerKey) continue; // stray pixel row with no header — skip
      rows.push(line.trim());
      if (rows.length === BULLET_HEIGHT) flush();
      continue;
    }

    // Header line — key optionally followed by `color=#rrggbb`.
    flush();
    const m = line.trim().match(/^(\S+)(?:\s+color=(\S+))?\s*$/);
    if (!m) continue;
    headerKey = m[1].toUpperCase();
    headerColor = m[2] ? hexToRgb(m[2]) : null;
  }
  flush();
  return bullets;
}
