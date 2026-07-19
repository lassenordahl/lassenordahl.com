// Board data provider.
//
// The board is an infinite-scroll wall of images. They come from the API
// worker: `GET /assets` returns
//   { ok, count, items: [{ name, url, createdAt, width, height, bytes }, ...] }
// sorted newest-first (see apps/api/src/assets.ts). Each item's `url` already
// points at the R2 custom domain (https://assets.lassenordahl.com/<name>.webp),
// so the JSON list comes from the worker but the image bytes are served
// straight from Cloudflare's CDN. Images are uploaded from a phone shortcut to
// `POST /assets`.

// Base URL for the assets API (the worker that serves the /assets listing).
// NOTE: this is the worker, not the assets.lassenordahl.com R2 domain — that
// domain only serves object bytes, not the JSON index.
const API_BASE = "https://lassenordahl-api.lasseanordahl.workers.dev";

const PAGE_SIZE = 12;

/**
 * Fetch one page of board images. Returns an array of
 *   { id, url, width, height, createdAt }
 * (the shape the tiles render). Resolves to an empty array when there are no
 * more images — the caller uses that as the "stop loading" signal.
 *
 * `/assets` currently returns the full list in one shot, so we paginate it
 * client-side: page 0 yields the first PAGE_SIZE items, and so on until we run
 * out. (When the feed grows large enough to matter, add real pagination params
 * to the worker and pass `page` through here.)
 *
 * @param {number} page  zero-based page index
 * @returns {Promise<Array<{id:string,url:string,width:number,height:number,createdAt:number}>>}
 */
export async function fetchBoardPage(page) {
  const res = await fetch(`${API_BASE}/assets`);
  if (!res.ok) throw new Error(`/assets -> ${res.status}`);
  const { items } = await res.json();
  if (!Array.isArray(items)) return [];

  const slice = items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  return slice.map((it) => ({
    id: it.name,
    url: it.url,
    // Fall back to a square if dimensions are missing so the masonry can still
    // reserve space without producing an invalid aspect-ratio.
    width: it.width || 1,
    height: it.height || 1,
    createdAt: it.createdAt,
  }));
}

export { API_BASE, PAGE_SIZE };
