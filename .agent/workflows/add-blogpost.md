---
description: How to add a new blog post to the portfolio site
---

# Adding a Blog Post

## Quick Steps

1. **Get the screenshot** from the user (dropped in repo root)
2. **Rename/move it** to `/static/images/blog/<slug>.png`
3. **Add entry** to `/src/blog/posts.js`
4. **Optionally create** `/content/blog/<slug>.md` for content posts

## Posts Registry (`/src/blog/posts.js`)

Add a new entry to the `posts` array:

```javascript
{
  slug: "my-post",              // URL-friendly slug
  title: "Post Title",          // Display title
  date: "YYYY-MM-DD",           // Publication date
  thumbnail: "/images/blog/my-post.png",
  originalUrl: "https://...",   // External URL (shows "External" badge)
  isOwnProject: true            // Optional: hide domain from badge
}
```

**Sorting**: Posts auto-sort by date (newest first).

## Post Types

1. **External-only** (like download.zip, rank-everything): Just metadata in posts.js, links to external URL
2. **Content posts**: Also create a markdown file in `/content/blog/<slug>.md`

## Markdown Content Files

Create `/content/blog/<slug>.md` with frontmatter:

```markdown
---
title: "Post Title"
date: "YYYY-MM-DD"
thumbnail: "/images/blog/slug.png"
originalUrl: "https://..."
---

Your markdown content here...
```

## Screenshot Processing

```bash
# Find and move the screenshot
for f in Screen*; do cp "$f" static/images/blog/<slug>.png; done
rm Screen*.png
```

Note: `sips` webp conversion may not work on all macOS versions. PNG is acceptable.
