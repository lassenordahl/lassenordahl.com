import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parsePost, serializePost, validatePost, normalizeMeta, toIndexEntry, isValidSlug } from "./post-format.mjs";

const contentDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "content", "blog");

test("parses quoted, unquoted and boolean values", () => {
  const { meta, body } = parsePost('---\ntitle: Cockroach Labs Design\ndate: 2026-06-28\nicon: "pen-line"\nhasAuthor: false\n---\n\nHello *there*\n\n');
  assert.deepEqual(meta, { title: "Cockroach Labs Design", date: "2026-06-28", icon: "pen-line", hasAuthor: false });
  assert.equal(body, "Hello *there*");
});

test("handles CRLF files and files without frontmatter", () => {
  assert.deepEqual(parsePost('---\r\ntitle: "A"\r\ndate: "2026-01-01"\r\n---\r\n\r\nBody\r\n').meta, { title: "A", date: "2026-01-01" });
  assert.deepEqual(parsePost("just text\n"), { meta: {}, body: "just text" });
});

test("serialize -> parse round-trips awkward strings", () => {
  const meta = { title: 'He said "hi": a colon, # and a backslash \\ and émoji 🍳', date: "2026-11-08", isOwnProject: true };
  const text = serializePost(meta, "Line one\n\nLine two");
  assert.deepEqual(parsePost(text), { meta, body: "Line one\n\nLine two" });
});

test("serialize writes known fields in a fixed order and drops empties", () => {
  const text = serializePost({ icon: "x", date: "2026-01-02", title: "T", thumbnail: "", custom: "kept" }, "");
  assert.equal(text, '---\ntitle: "T"\ndate: "2026-01-02"\nicon: "x"\ncustom: "kept"\n---\n');
  assert.deepEqual(normalizeMeta({ hidden: "true", title: "  T  ", originalUrl: null }), { hidden: true, title: "T" });
});

test("validation catches the mistakes an editor can make", () => {
  assert.deepEqual(validatePost("ok-post", { title: "T", date: "2026-02-28" }), []);
  assert.match(validatePost("ok", { date: "2026-02-28" }).join(), /title is required/);
  assert.match(validatePost("ok", { title: "T", date: "2026-02-30" }).join(), /real date/);
  assert.match(validatePost("ok", { title: "T", date: "2026-02-03", thumbnail: "images/x.png" }).join(), /thumbnail/);
  for (const bad of ["", "Upper", "../etc", "a/b", "-lead", "a..b"]) assert.equal(isValidSlug(bad), false, bad);
  assert.equal(isValidSlug("www.download-zip"), true);
});

test("index entries leave out the hidden flag", () => {
  assert.deepEqual(toIndexEntry("s", { title: "T", date: "2026-01-01", hidden: false, hasAuthor: false }), { slug: "s", title: "T", date: "2026-01-01", hasAuthor: false });
});

test("every post in content/blog is valid and survives a save unchanged", () => {
  const files = fs.readdirSync(contentDir).filter((f) => f.endsWith(".md"));
  assert.ok(files.length > 0);
  for (const file of files) {
    const text = fs.readFileSync(path.join(contentDir, file), "utf-8");
    const parsed = parsePost(text);
    assert.deepEqual(validatePost(file.slice(0, -3), parsed.meta), [], file);
    const resaved = serializePost(parsed.meta, parsed.body);
    assert.deepEqual(parsePost(resaved), parsed, file);
    // Opening and re-saving a post in the admin must not rewrite the file.
    assert.equal(resaved, text.replace(/\r\n/g, "\n"), file);
  }
});
