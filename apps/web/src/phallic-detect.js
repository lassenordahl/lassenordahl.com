// ── Phallic shape detector ────────────────────────────────────────────────────
// Subset-match a small bank of hand-authored templates (plus their rotations)
// against the lit-pixel silhouette of the canvas. A template matches at a
// position when every '#' cell is lit AND the template's bounding box isn't
// drowned in extra lit '.' cells — keeps the signal-to-noise high so random
// crosses / Ts don't trip it.

const BASE_TEMPLATES_ASCII = [
  // minimal vertical — shaft + wide base + two balls
  `
.#.
.#.
.#.
###
#.#
`,
  `
.#.
.#.
.#.
#.#
`,
  `
..#..
..#..
..#..
##.##
##.##`,

];

function parse(ascii) {
  const rows = ascii.split("\n").map((r) => r.trimEnd()).filter((r) => r.length);
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const grid = [];
  for (let y = 0; y < h; y++) {
    const row = new Array(w).fill(0);
    for (let x = 0; x < rows[y].length; x++) {
      row[x] = rows[y][x] === "#" ? 1 : 0;
    }
    grid.push(row);
  }
  return grid;
}

// 90° clockwise: new[x][h-1-y] = old[y][x]
function rotate90(grid) {
  const h = grid.length;
  const w = grid[0].length;
  const out = Array.from({ length: w }, () => new Array(h).fill(0));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      out[x][h - 1 - y] = grid[y][x];
    }
  }
  return out;
}

function expandRotations(baseGrids) {
  const seen = new Set();
  const out = [];
  for (const base of baseGrids) {
    let g = base;
    for (let i = 0; i < 4; i++) {
      const key = g.map((r) => r.join("")).join("/");
      if (!seen.has(key)) {
        seen.add(key);
        out.push(g);
      }
      g = rotate90(g);
    }
  }
  return out;
}

const TEMPLATES = expandRotations(BASE_TEMPLATES_ASCII.map(parse));

function buildLitGrid(pixels, width, height) {
  const grid = Array.from({ length: height }, () => new Array(width).fill(0));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = pixels[y * width + x];
      if (!p) continue;
      grid[y][x] = (p[0] + p[1] + p[2]) > 30 ? 1 : 0;
    }
  }
  return grid;
}

export function detectPhallic(pixels, width = 16, height = 7) {
  const grid = buildLitGrid(pixels, width, height);
  for (const t of TEMPLATES) {
    const th = t.length;
    const tw = t[0].length;
    if (th > height || tw > width) continue;
    for (let py = 0; py <= height - th; py++) {
      for (let px = 0; px <= width - tw; px++) {
        let allOn = true;
        let offCells = 0;
        let extraLit = 0;
        for (let y = 0; y < th && allOn; y++) {
          for (let x = 0; x < tw; x++) {
            const cell = t[y][x];
            const lit = grid[py + y][px + x];
            if (cell === 1) {
              if (!lit) { allOn = false; break; }
            } else {
              offCells++;
              if (lit) extraLit++;
            }
          }
        }
        if (allOn && (offCells === 0 || extraLit / offCells < 0.4)) {
          return true;
        }
      }
    }
  }
  return false;
}
