// Blog post file format — the single place that knows how a post is stored.
//
// A post is one Markdown file, apps/web/content/blog/<slug>.md, with a small
// frontmatter block on top:
//
//   ---
//   title: "Vodka Pasta"
//   date: "2026-05-23"
//   icon: "pen-line"
//   ---
//
//   Body markdown...
//
// The slug is the filename. Everything the site needs to list a post lives in
// the frontmatter, so adding a post is adding one file. Used by:
//   - scripts/build-posts-index.mjs (build: content/blog/*.md -> posts.json)
//   - apps/api admin endpoints (parse posts for the editor, validate and
//     serialize them before committing to GitHub)
// Keep it dependency-free so both can import it.

// Known fields, in the order they're written back out.
export const FIELDS = [
  { key: "title", type: "string", required: true },
  { key: "date", type: "string", required: true }, // YYYY-MM-DD
  { key: "icon", type: "string" }, // lucide icon name
  { key: "thumbnail", type: "string" }, // image URL or /images/... path
  { key: "originalUrl", type: "string" }, // set = external post ("View Original")
  { key: "isOwnProject", type: "boolean" }, // hide the domain on the External badge
  { key: "hasAuthor", type: "boolean" }, // false = no "Lasse Nordahl on <date>" byline
  { key: "hidden", type: "boolean" }, // true = in the repo, but not on the site
];

const FIELD_BY_KEY = Object.fromEntries(FIELDS.map((f) => [f.key, f]));

export const SLUG_RE = /^[a-z0-9][a-z0-9.-]*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidSlug(slug) {
  return typeof slug === "string" && slug.length <= 100 && SLUG_RE.test(slug) && !slug.includes("..");
}

function parseValue(raw) {
  const v = raw.trim();
  if (v.startsWith('"')) {
    try {
      return JSON.parse(v);
    } catch {
      return v.slice(1, v.endsWith('"') ? -1 : undefined);
    }
  }
  if (v.startsWith("'") && v.endsWith("'") && v.length >= 2) {
    return v.slice(1, -1).replace(/''/g, "'");
  }
  if (v === "true") return true;
  if (v === "false") return false;
  return v;
}

/** Split a post file into { meta, body }. Files without frontmatter get meta {}. */
export function parsePost(text) {
  const src = String(text).replace(/^﻿/, "").replace(/\r\n/g, "\n");
  const match = src.match(/^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)([\s\S]*)$/);
  if (!match) return { meta: {}, body: src.trim() };

  const meta = {};
  for (const line of match[1].split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    if (!key) continue;
    let value = parseValue(line.slice(idx + 1));
    const field = FIELD_BY_KEY[key];
    // Unquoted YAML like `date: 2026-06-28` is still a string to us.
    if (field?.type === "string" && typeof value !== "string") value = String(value);
    meta[key] = value;
  }
  return { meta, body: match[2].replace(/^\n+/, "").replace(/\s+$/, "") };
}

function serializeValue(value) {
  if (typeof value === "boolean") return String(value);
  // JSON strings are valid YAML double-quoted scalars.
  return JSON.stringify(String(value));
}

/** Drop empty strings / nulls and coerce known fields to their types. */
export function normalizeMeta(meta) {
  const out = {};
  for (const [key, value] of Object.entries(meta || {})) {
    if (value === undefined || value === null) continue;
    const field = FIELD_BY_KEY[key];
    if (field?.type === "boolean") {
      if (typeof value === "boolean") out[key] = value;
      else if (value === "true" || value === "false") out[key] = value === "true";
      continue;
    }
    const str = typeof value === "string" ? value.trim() : String(value);
    if (str === "") continue;
    out[key] = str;
  }
  return out;
}

/** Turn { meta, body } back into file text. Known fields first, in FIELDS order. */
export function serializePost(meta, body) {
  const clean = normalizeMeta(meta);
  const keys = [
    ...FIELDS.map((f) => f.key).filter((k) => k in clean),
    ...Object.keys(clean).filter((k) => !(k in FIELD_BY_KEY)),
  ];
  const lines = keys.map((k) => `${k}: ${serializeValue(clean[k])}`);
  const text = String(body ?? "").replace(/\r\n/g, "\n").replace(/\s+$/, "");
  return `---\n${lines.join("\n")}\n---\n${text ? `\n${text}\n` : ""}`;
}

/** Returns a list of human-readable problems; empty means the post is valid. */
export function validatePost(slug, meta) {
  const errors = [];
  if (!isValidSlug(slug)) {
    errors.push(`slug "${slug}" must be lowercase letters, numbers, dots and dashes`);
  }
  for (const field of FIELDS) {
    const value = meta?.[field.key];
    if (value === undefined || value === "") {
      if (field.required) errors.push(`${field.key} is required`);
      continue;
    }
    if (typeof value !== field.type) errors.push(`${field.key} must be a ${field.type}`);
  }
  if (typeof meta?.date === "string" && meta.date) {
    const [y, m, d] = meta.date.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    const real = DATE_RE.test(meta.date) && dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
    if (!real) errors.push(`date "${meta.date}" must be a real date in YYYY-MM-DD form`);
  }
  for (const key of ["thumbnail", "originalUrl"]) {
    const value = meta?.[key];
    if (typeof value === "string" && value && !/^(https?:\/\/|\/)/.test(value)) {
      errors.push(`${key} must start with http(s):// or /`);
    }
  }
  return errors;
}

/** The entry the site's feed + static page generator read (src/blog/posts.json). */
export function toIndexEntry(slug, meta) {
  const entry = { slug };
  for (const field of FIELDS) {
    if (field.key === "hidden") continue;
    if (meta[field.key] !== undefined) entry[field.key] = meta[field.key];
  }
  return entry;
}
