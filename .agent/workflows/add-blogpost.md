---
description: How to add a new blog post to the portfolio site
---

# Adding a Blog Post

A post is one file: `apps/web/content/blog/<slug>.md`. The slug is the filename
and the URL (`/post/<slug>`). The feed index (`src/blog/posts.json`) is
generated from the frontmatter at build time, so don't edit it by hand. It's gitignored.

You can also write posts in the browser at `/admin`, which commits the file for you.

## Frontmatter

```markdown
---
title: "Post Title"                    # required
date: "YYYY-MM-DD"                     # required, sorts the feed (newest first)
icon: "pen-line"                       # optional lucide icon name
thumbnail: "/images/blog/slug.avif"    # optional, shows the post as an image card
originalUrl: "https://..."             # optional, external post ("View Original")
isOwnProject: true                     # optional, hide the domain on the External badge
hasAuthor: false                       # optional, drop the "Lasse Nordahl on <date>" byline
hidden: true                           # optional, keep the file but leave it off the site
---

Your markdown content here...
```

External-only posts (download.zip, rank-everything) are frontmatter with no body.

`pnpm --filter @lassenordahl/web build` fails if a post has a missing title or
date, a bad date, or a bad slug. `pnpm --filter @lassenordahl/web test` checks
the format (`scripts/post-format.mjs`).

## Images

Put images under `apps/web/static/images/blog/<slug>/` and reference them as
`/images/blog/<slug>/name.avif`. Images uploaded from `/admin` go to R2 and are
served from `https://assets.lassenordahl.com/`.
