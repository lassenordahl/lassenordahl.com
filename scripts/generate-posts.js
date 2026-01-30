#!/usr/bin/env node

/**
 * Static post page generator
 *
 * Runs after webpack build to generate static HTML for each blog post.
 * This improves SEO by serving pre-rendered content to crawlers.
 */

const fs = require('fs');
const path = require('path');
const { marked } = require('marked');

// Posts data (mirrored from src/blog/posts.js)
const AUTHOR = {
  name: "Lasse Nordahl",
  url: "https://x.com/lassenordahl"
};

const posts = [
  {
    slug: "egg-tarts",
    title: "Egg Tarts",
    date: "2026-01-11",
    icon: "pen-line",
    author: AUTHOR
  },
  {
    slug: "yearly-theme-2026",
    title: "Yearly Theme - Write more",
    date: "2026-01-01",
    icon: "pen-line",
    author: AUTHOR
  },
  {
    slug: "yearly-theme-2025",
    title: "Yearly Theme - Make more things",
    date: "2025-01-01",
    icon: "hammer",
    author: AUTHOR
  },
  {
    slug: "yearly-theme-2024",
    title: "Yearly Theme - Follow through",
    date: "2024-01-01",
    icon: "target",
    author: AUTHOR
  },
  {
    slug: "yearly-theme-2023",
    title: "Yearly Theme - Do more random stuff",
    date: "2023-01-01",
    icon: "boom-box",
    author: AUTHOR
  },
  {
    slug: "rank-everything",
    title: "rank-everything.com",
    date: "2025-12-19",
    thumbnail: "/images/blog/rank-everything.avif",
    originalUrl: "https://www.rank-everything.com/",
    isOwnProject: true,
    author: AUTHOR
  },
  {
    slug: "download-zip",
    title: "download.zip",
    date: "2023-03-27",
    thumbnail: "/images/blog/download-zip.webp",
    originalUrl: "http://www.download.zip/",
    isOwnProject: true,
    author: AUTHOR
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
    originalUrl: "https://rd.nytimes.com/projects/using-computer-vision-to-create-a-more-accurate-digital-archive/",
    author: AUTHOR
  },
  {
    slug: "cockroachdb-sql-in-browser",
    title: "Executing SQL queries from the browser",
    date: "2023-11-09",
    thumbnail: "/images/blog/cockroach-browser.avif",
    originalUrl: "https://www.cockroachlabs.com/blog/cockroachdb-sql-in-browser/",
    author: AUTHOR
  }
];

const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const contentDir = path.join(rootDir, 'content', 'blog');

function formatDate(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}

function loadMarkdown(slug) {
  const filePath = path.join(contentDir, `${slug}.md`);
  try {
    const text = fs.readFileSync(filePath, 'utf-8');
    // Strip frontmatter if present
    const contentMatch = text.match(/^---[\s\S]*?---\s*([\s\S]*)$/);
    return contentMatch ? contentMatch[1].trim() : text.trim();
  } catch (err) {
    console.warn(`Warning: Could not load ${slug}.md`);
    return '';
  }
}

function generatePostHtml(post, baseHtml) {
  const content = loadMarkdown(post.slug);
  const htmlContent = content ? marked.parse(content) : '';

  // Generate the post detail HTML
  const postDetailHtml = `
    <div class="post-detail-content">
      <a href="/" class="back-link">&larr; Back</a>

      ${post.thumbnail ? `
        <div class="post-detail-thumbnail-container">
          <img src="${post.thumbnail}" alt="" class="post-detail-thumbnail-glow" aria-hidden="true" />
          <img src="${post.thumbnail}" alt="${post.title}" class="post-detail-thumbnail" />
        </div>
      ` : ""}

      <h1 class="post-detail-title">${post.title}</h1>
      ${post.author ? `
        <div class="post-author">
          <a href="${post.author.url}" target="_blank" rel="noopener noreferrer">${post.author.name}</a> on ${formatDate(post.date)}
        </div>
      ` : `
        <span class="post-detail-date">${formatDate(post.date)}</span>
      `}

      ${post.originalUrl ? `
        <a href="${post.originalUrl}" target="_blank" rel="noopener noreferrer" class="post-original-link">
          View Original &rarr;
        </a>
      ` : ""}

      <div class="post-divider"></div>

      <div class="post-content">
        ${htmlContent}
      </div>
    </div>
  `;

  let html = baseHtml;

  // Update the title
  html = html.replace(
    /<title>.*?<\/title>/,
    `<title>${post.title} - lasse's website</title>`
  );

  // Add Open Graph meta tags after the title
  const ogTags = `
    <meta property="og:title" content="${post.title}" />
    <meta property="og:type" content="article" />
    <meta property="og:url" content="https://lassenordahl.com/post/${post.slug}" />
    ${post.thumbnail ? `<meta property="og:image" content="https://lassenordahl.com${post.thumbnail}" />` : ''}
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${post.title}" />
    ${post.thumbnail ? `<meta name="twitter:image" content="https://lassenordahl.com${post.thumbnail}" />` : ''}
  `;
  html = html.replace('</title>', `</title>${ogTags}`);

  // Add is-post-page class to html element
  html = html.replace('<html lang="en">', '<html lang="en" class="is-post-page">');

  // Insert pre-rendered content into post-detail div
  html = html.replace(
    /<div id="post-detail" class="post-detail"><\/div>/,
    `<div id="post-detail" class="post-detail">${postDetailHtml}</div>`
  );

  return html;
}

function main() {
  console.log('Generating static post pages...');

  // Read the base HTML template (generated by webpack)
  const baseHtmlPath = path.join(publicDir, 'index.html');
  if (!fs.existsSync(baseHtmlPath)) {
    console.error('Error: public/index.html not found. Run webpack build first.');
    process.exit(1);
  }
  const baseHtml = fs.readFileSync(baseHtmlPath, 'utf-8');

  // Generate a page for each post
  for (const post of posts) {
    const postDir = path.join(publicDir, 'post', post.slug);
    fs.mkdirSync(postDir, { recursive: true });

    const postHtml = generatePostHtml(post, baseHtml);
    const outputPath = path.join(postDir, 'index.html');
    fs.writeFileSync(outputPath, postHtml);

    console.log(`  Generated: /post/${post.slug}/index.html`);
  }

  console.log(`Done! Generated ${posts.length} post pages.`);
}

main();
