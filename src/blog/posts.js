// Blog posts registry
// Posts are sorted by date (newest first) when rendered
// Content is loaded from markdown files in /content/blog/

import postsData from './posts.json';

// Default author information
const DEFAULT_AUTHOR = {
  name: "Lasse Nordahl",
  url: "https://x.com/lassenordahl"
};

// Add author to posts (unless hasAuthor is explicitly false)
export const posts = postsData.map(post => ({
  ...post,
  author: post.hasAuthor === false ? undefined : DEFAULT_AUTHOR
}));

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
