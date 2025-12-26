import { marked } from "marked";
import { getSortedPosts, getPostBySlug, loadPostContent } from "./posts.js";

// Store scroll position before navigating to a post
let savedScrollPosition = 0;

// Format date for display
function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}

// Extract domain from URL
function getDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace('www.', '');
  } catch {
    return '';
  }
}

// Render the blog feed (list of posts)
function renderFeed() {
  const posts = getSortedPosts();
  const container = document.getElementById("posts-container");

  if (!container) return;

  container.innerHTML = posts.map(post => `
    <a href="/post/${post.slug}" class="post-card" data-slug="${post.slug}">
      ${post.thumbnail ? `
        <div class="post-thumbnail-container">
          <img src="${post.thumbnail}" alt="" class="post-thumbnail-glow" aria-hidden="true" />
          <img src="${post.thumbnail}" alt="${post.title}" class="post-thumbnail" />
        </div>
      ` : ""}
      <div class="post-info">
        <h3 class="post-title">${post.title}</h3>
        <span class="post-date">${formatDate(post.date)}</span>
        ${post.originalUrl ? `<span class="post-external-badge">External${post.isOwnProject ? '' : ` - ${getDomain(post.originalUrl)}`}</span>` : ""}
      </div>
    </a>
  `).join("");
}

// Render a single post
async function renderPost(slug) {
  const post = getPostBySlug(slug);
  const container = document.getElementById("post-detail");
  const blogSection = document.querySelector(".blog-section");
  const heroSection = document.querySelector(".container.hero");

  if (!post || !container) return;

  // Hide hero and blog feed, show post detail
  if (heroSection) heroSection.style.display = "none";
  if (blogSection) blogSection.style.display = "none";
  container.style.display = "block";

  // Scroll to top
  window.scrollTo(0, 0);

  // Load content from markdown file
  const content = await loadPostContent(slug);
  const htmlContent = content ? marked.parse(content) : '';

  container.innerHTML = `
    <div class="post-detail-content">
      <a href="/" class="back-link">&larr; Back</a>

      ${post.thumbnail ? `
        <div class="post-detail-thumbnail-container">
          <img src="${post.thumbnail}" alt="" class="post-detail-thumbnail-glow" aria-hidden="true" />
          <img src="${post.thumbnail}" alt="${post.title}" class="post-detail-thumbnail" />
        </div>
      ` : ""}

      <h1 class="post-detail-title">${post.title}</h1>
      <span class="post-detail-date">${formatDate(post.date)}</span>

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
}

// Show the main view (hero + feed)
function showMainView() {
  const container = document.getElementById("post-detail");
  const blogSection = document.querySelector(".blog-section");
  const heroSection = document.querySelector(".container.hero");

  if (container) container.style.display = "none";
  if (heroSection) heroSection.style.display = "flex";
  if (blogSection) blogSection.style.display = "flex";

  // Restore scroll position
  window.scrollTo(0, savedScrollPosition);
}

// Handle routing
async function handleRoute() {
  const path = window.location.pathname;

  if (path.startsWith("/post/")) {
    const slug = path.replace("/post/", "");
    await renderPost(slug);
  } else {
    showMainView();
  }
}

// Initialize the blog
export function initBlog() {
  // Render the feed
  renderFeed();

  // Set latest post date
  const posts = getSortedPosts();
  if (posts.length > 0) {
    const latestDateEl = document.getElementById("latest-post-date");
    if (latestDateEl) {
      latestDateEl.textContent = `Latest: ${formatDate(posts[0].date)}`;
    }
  }

  // Handle initial route
  handleRoute();

  // Listen for popstate (back/forward button)
  window.addEventListener("popstate", handleRoute);

  // Handle link clicks
  document.addEventListener("click", (e) => {
    const postCard = e.target.closest(".post-card");
    const backLink = e.target.closest(".back-link");

    if (postCard) {
      e.preventDefault();
      savedScrollPosition = window.scrollY;
      const slug = postCard.dataset.slug;
      window.history.pushState({}, "", `/post/${slug}`);
      handleRoute();
    } else if (backLink) {
      e.preventDefault();
      window.history.pushState({}, "", "/");
      handleRoute();
    }
  });
}
