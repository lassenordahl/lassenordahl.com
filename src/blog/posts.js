// Blog posts registry
// Posts are sorted by date (newest first) when rendered
// Content is loaded from markdown files in /content/blog/

export const posts = [
  {
    slug: "yearly-theme-2026",
    title: "Yearly Theme - Write more",
    date: "2026-01-01"
  },
  {
    slug: "yearly-theme-2025",
    title: "Yearly Theme - Make more things",
    date: "2025-01-01"
  },
  {
    slug: "yearly-theme-2024",
    title: "Yearly Theme - Follow through",
    date: "2024-01-01"
  },
  {
    slug: "yearly-theme-2023",
    title: "Yearly Theme - Do more stuff",
    date: "2023-01-01"
  },
  {
    slug: "rank-everything",
    title: "rank-everything.com",
    date: "2025-12-19",
    thumbnail: "/images/blog/rank-everything.png",
    originalUrl: "https://rank-everything.pages.dev/",
    isOwnProject: true
  },
  {
    slug: "download-zip",
    title: "download.zip",
    date: "2023-03-27",
    thumbnail: "/images/blog/download-zip.webp",
    originalUrl: "http://www.download.zip/",
    isOwnProject: true
  },
  {
    slug: "google-new-tlds",
    title: "8 new top-level domains for dads, grads and techies",
    date: "2023-05-10",
    thumbnail: "/images/blog/google-tlds.webp",
    originalUrl: "https://blog.google/products/registry/8-new-top-level-domains-for-dads-grads-tech/"
  },
  {
    slug: "nyt-computer-vision-archive",
    title: "Using Computer Vision to Create A More Accurate Digital Archive",
    date: "2021-07-21",
    thumbnail: "/images/blog/nyt-archive.webp",
    originalUrl: "https://rd.nytimes.com/projects/using-computer-vision-to-create-a-more-accurate-digital-archive/"
  },
  {
    slug: "cockroachdb-sql-in-browser",
    title: "Executing SQL queries from the browser",
    date: "2023-11-09",
    thumbnail: "/images/blog/cockroach-browser.avif",
    originalUrl: "https://www.cockroachlabs.com/blog/cockroachdb-sql-in-browser/"
  }
];

// Helper to get posts sorted by date (newest first)
export function getSortedPosts() {
  return [...posts].sort((a, b) => new Date(b.date) - new Date(a.date));
}

// Helper to get a single post by slug
export function getPostBySlug(slug) {
  return posts.find(p => p.slug === slug);
}

// Load markdown content for a post
export async function loadPostContent(slug) {
  try {
    const response = await fetch(`/content/blog/${slug}.md`);
    if (!response.ok) return null;
    const text = await response.text();
    // Strip frontmatter if present
    const contentMatch = text.match(/^---[\s\S]*?---\s*([\s\S]*)$/);
    return contentMatch ? contentMatch[1].trim() : text.trim();
  } catch {
    return null;
  }
}
