// Board — an infinite-scroll wall of images below the Notes feed.
//
// Layout: a responsive column masonry. The number of columns adapts to the
// available width (down to a single column on phones, with comfortable side
// margins from the section padding). Items are placed round-robin in timestamp
// order — tile i goes to column (i % columnCount) — so the newest images sit
// across the top row and every column runs newest -> oldest as you scroll down.
// On one column that's simply a straight newest-first sequence.
//
// Loading: each image gets a fixed-aspect placeholder (from its known w/h) so
// nothing shifts as it loads. The real `src` is only set once the tile nears the
// viewport (IntersectionObserver with a generous rootMargin as a preload buffer),
// so we never pull an image from the CDN until you're about to scroll to it.

import { fetchBoardPage } from "./data.js";

// Target column width in px; column count is derived from the container so the
// gutters stay even. MIN 1 means phones collapse to a single column. Tune here.
const TARGET_COLUMN_WIDTH = 280;
const MIN_COLUMNS = 1;
const MAX_COLUMNS = 3;

// Start loading an image when it's within this much of the viewport. Larger =
// smoother (loads earlier), at the cost of a bit more eager fetching.
const PRELOAD_MARGIN = "600px";

let grid; // .board-grid element
let sentinel; // .board-sentinel element
let columnEls = []; // current column elements, left -> right
let tiles = []; // every tile in timestamp (newest-first) order
let page = 0;
let loading = false;
let done = false;

let imageObserver; // lazy-loads tiles as they approach the viewport
let sentinelObserver; // triggers loading the next page

/** Decide how many columns fit the current grid width. */
function columnCount() {
  const width = grid.clientWidth || TARGET_COLUMN_WIDTH;
  const n = Math.round(width / TARGET_COLUMN_WIDTH);
  return Math.max(MIN_COLUMNS, Math.min(MAX_COLUMNS, n));
}

/** (Re)build the empty column elements. Clears any existing tiles from the DOM
 *  (the tiles themselves stay referenced in `tiles` for re-distribution). */
function buildColumns(count) {
  grid.innerHTML = "";
  columnEls = [];
  for (let i = 0; i < count; i++) {
    const el = document.createElement("div");
    el.className = "board-column";
    grid.appendChild(el);
    columnEls.push(el);
  }
}

/** Format a createdAt (ms) like the Notes app: "Jul 18, 2026 · 2:34 PM". */
function formatStamp(ms) {
  if (!ms) return "";
  const d = new Date(ms);
  const date = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${date} · ${time}`;
}

/** Build one image tile (placeholder now, real src loaded lazily). */
function makeTile(item) {
  const tile = document.createElement("figure");
  tile.className = "board-tile";

  // The frame reserves the exact image box so nothing jumps on load. The caption
  // lives outside the ratio box so it doesn't distort the image.
  const frame = document.createElement("div");
  frame.className = "board-frame";
  frame.style.aspectRatio = `${item.width} / ${item.height}`;

  const img = document.createElement("img");
  img.className = "board-img";
  img.alt = ""; // decorative wall; screenshots have no meaningful alt
  img.loading = "lazy"; // browser-level backstop for our observer
  img.decoding = "async";
  img.dataset.src = item.url; // real src parked here until the tile is near view
  img.addEventListener("load", () => tile.classList.add("is-loaded"));
  frame.appendChild(img);
  tile.appendChild(frame);

  if (item.createdAt) {
    const cap = document.createElement("figcaption");
    cap.className = "board-caption";
    cap.textContent = formatStamp(item.createdAt);
    tile.appendChild(cap);
  }
  return tile;
}

/** Append a page of items, continuing the round-robin sequence across columns
 *  so timestamp order is preserved as new pages load. */
function placeItems(items) {
  const n = columnEls.length;
  for (const item of items) {
    const tile = makeTile(item);
    // `tiles.length` is this tile's global index -> its column is index % n.
    // Since each column fills top-to-bottom, that keeps every column ordered
    // newest -> oldest and the top row as the newest items.
    columnEls[tiles.length % n].appendChild(tile);
    tiles.push(tile);
    imageObserver.observe(tile);
  }
}

/** Swap data-src -> src once a tile approaches the viewport. */
function onTileVisible(entries) {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    const tile = entry.target;
    const img = tile.querySelector(".board-img");
    if (img && img.dataset.src) {
      img.src = img.dataset.src;
      delete img.dataset.src;
    }
    imageObserver.unobserve(tile);
  }
}

/** Load the next page and lay it out. */
async function loadNextPage() {
  if (loading || done) return;
  loading = true;
  grid.classList.add("is-loading");
  try {
    const items = await fetchBoardPage(page);
    if (!items.length) {
      done = true;
      teardownSentinel();
      return;
    }
    placeItems(items);
    page += 1;
  } catch (err) {
    // Non-fatal: leave what we have, let the sentinel retry on next scroll.
    console.error("board: failed to load page", page, err);
  } finally {
    loading = false;
    grid.classList.remove("is-loading");
  }
}

function teardownSentinel() {
  if (sentinel && sentinelObserver) sentinelObserver.unobserve(sentinel);
}

/** Rebuild the columns for the current width and re-distribute every tile in
 *  timestamp order. No-op when the column count hasn't changed. */
function relayout() {
  const desired = columnCount();
  if (desired === columnEls.length) return;
  buildColumns(desired);
  tiles.forEach((tile, i) => columnEls[i % desired].appendChild(tile));
}

/** Entry point — call once on the main page. */
export function initBoard() {
  grid = document.getElementById("board-grid");
  sentinel = document.getElementById("board-sentinel");
  if (!grid || !sentinel) return;

  imageObserver = new IntersectionObserver(onTileVisible, {
    rootMargin: PRELOAD_MARGIN,
  });

  sentinelObserver = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) loadNextPage();
    },
    { rootMargin: PRELOAD_MARGIN }
  );

  buildColumns(columnCount());
  sentinelObserver.observe(sentinel);

  // Debounced relayout on resize (column count may change).
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(relayout, 150);
  });

  // Kick off the first page immediately so the wall isn't empty on arrival.
  loadNextPage();

  // Wire the "scroll to board" chevron at the bottom of the Notes feed.
  const toBoard = document.getElementById("scroll-to-board");
  if (toBoard) {
    toBoard.addEventListener("click", () => {
      document
        .getElementById("board-section")
        ?.scrollIntoView({ behavior: "smooth" });
    });
  }
}
