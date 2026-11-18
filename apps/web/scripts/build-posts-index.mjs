#!/usr/bin/env node

// Builds src/blog/posts.json from the frontmatter of content/blog/*.md.
//
// Runs before webpack (dev and build). posts.json is generated and gitignored:
// the Markdown files are the source of truth, so a new post is one new file.
// A post with bad frontmatter fails the build instead of shipping a broken feed.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parsePost, validatePost, toIndexEntry } from "./post-format.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contentDir = path.join(rootDir, "content", "blog");
const outPath = path.join(rootDir, "src", "blog", "posts.json");

const posts = [];
const problems = [];
let hidden = 0;

for (const file of fs.readdirSync(contentDir).sort()) {
  if (!file.endsWith(".md")) continue;
  const slug = file.slice(0, -3);
  const { meta } = parsePost(fs.readFileSync(path.join(contentDir, file), "utf-8"));
  const errors = validatePost(slug, meta);
  if (errors.length) {
    problems.push(`  content/blog/${file}: ${errors.join("; ")}`);
    continue;
  }
  if (meta.hidden) {
    hidden++;
    continue;
  }
  posts.push(toIndexEntry(slug, meta));
}

if (problems.length) {
  console.error(`Invalid blog posts:\n${problems.join("\n")}`);
  process.exit(1);
}

// Newest first, slug as a tiebreak, so the output is stable.
posts.sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));

const json = `${JSON.stringify(posts, null, 2)}\n`;
const previous = fs.existsSync(outPath) ? fs.readFileSync(outPath, "utf-8") : "";
if (json !== previous) fs.writeFileSync(outPath, json);
console.log(`posts index: ${posts.length} posts${hidden ? `, ${hidden} hidden` : ""} -> src/blog/posts.json`);
