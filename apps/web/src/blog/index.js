import { marked } from "marked";
import { getSortedPosts, getPostBySlug, loadPostContent } from "./posts.js";

// Store scroll position before navigating to a post
let savedScrollPosition = 0;

// Format date for display
function formatDate(dateString) {
  // Parse date components to avoid timezone issues
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);
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

  container.innerHTML = posts.map(post => {
    if (post.thumbnail) {
      return `
        <a href="/post/${post.slug}" class="post-card post-card--thumbnail" data-slug="${post.slug}">
          <div class="post-thumbnail-container">
            <img src="${post.thumbnail}" alt="" class="post-thumbnail-glow" aria-hidden="true" />
            <img src="${post.thumbnail}" alt="${post.title}" class="post-thumbnail" />
          </div>
          <div class="post-info">
            <h3 class="post-title">${post.title}</h3>
            <span class="post-date">${formatDate(post.date)}</span>
            ${post.originalUrl ? `<span class="post-external-badge">External${post.isOwnProject ? '' : ` - ${getDomain(post.originalUrl)}`}</span>` : ""}
          </div>
        </a>
      `;
    } else {
      return `
        <a href="/post/${post.slug}" class="post-card post-card--text" data-slug="${post.slug}">
          <div class="post-info">
            <h3 class="post-title">${post.title}</h3>
            <span class="post-date">${formatDate(post.date)}</span>
            ${post.originalUrl ? `<span class="post-external-badge">External${post.isOwnProject ? '' : ` - ${getDomain(post.originalUrl)}`}</span>` : ""}
          </div>
        </a>
      `;
    }
  }).join("");
}


// Draw connectors using SVG for pixel-perfect lines
function drawConnectors() {
  const container = document.getElementById("posts-container");
  if (!container) return;

  // Remove any existing connectors
  container.querySelectorAll('.connector').forEach(el => el.remove());

  const containerRect = container.getBoundingClientRect();

  // Handle text post connectors
  drawTextConnectors(container, containerRect);

  // Handle thumbnail group connectors
  drawThumbnailConnectors(container, containerRect);
}

// Draw connectors for text posts (L-shaped first, horizontal for solo, bracket for groups)
function drawTextConnectors(container, containerRect) {
  // First text post - L-shaped from divider
  const firstTextPost = container.querySelector('.post-card--text[data-first-text="true"]');
  if (firstTextPost) {
    const rect = firstTextPost.getBoundingClientRect();
    const postInfo = firstTextPost.querySelector('.post-info');
    const infoRect = postInfo.getBoundingClientRect();

    // Calculate vertical center of the post-info
    const centerY = infoRect.top + (infoRect.height / 2) - containerRect.top;
    const topY = rect.top - containerRect.top;

    // Vertical line from top to center
    createConnector(container, {
      left: -24,
      top: topY - 24, // Connect to divider above
      width: 1,
      height: centerY - topY + 24
    });

    // Horizontal line from timeline to post
    createConnector(container, {
      left: -24,
      top: centerY,
      width: 24,
      height: 1
    });
  }

  // Solo text posts (not first, not in group)
  container.querySelectorAll('.post-card--text[data-first-text="false"][data-is-grouped="false"]').forEach(post => {
    const postInfo = post.querySelector('.post-info');
    const infoRect = postInfo.getBoundingClientRect();
    const centerY = infoRect.top + (infoRect.height / 2) - containerRect.top;

    createConnector(container, {
      left: -24,
      top: centerY,
      width: 24,
      height: 1
    });
  });

  // Grouped text posts - bracket
  container.querySelectorAll('.text-group').forEach(group => {
    const posts = group.querySelectorAll('.post-card--text');
    if (posts.length < 2) return;

    const firstPost = posts[0];
    const lastPost = posts[posts.length - 1];
    const isFirstOverall = firstPost.dataset.firstText === 'true';

    const firstInfo = firstPost.querySelector('.post-info');
    const lastInfo = lastPost.querySelector('.post-info');

    const firstInfoRect = firstInfo.getBoundingClientRect();
    const lastInfoRect = lastInfo.getBoundingClientRect();

    const firstCenterY = firstInfoRect.top + (firstInfoRect.height / 2) - containerRect.top;
    const lastCenterY = lastInfoRect.top + (lastInfoRect.height / 2) - containerRect.top;

    // If first overall, extend up to divider
    const topY = isFirstOverall
      ? (firstPost.getBoundingClientRect().top - containerRect.top - 24)
      : firstCenterY;

    // Vertical bracket line
    createConnector(container, {
      left: -24,
      top: topY,
      width: 1,
      height: lastCenterY - topY
    });

    // Horizontal lines for each post in group
    posts.forEach(post => {
      const info = post.querySelector('.post-info');
      const infoRect = info.getBoundingClientRect();
      const centerY = infoRect.top + (infoRect.height / 2) - containerRect.top;

      createConnector(container, {
        left: -24,
        top: centerY,
        width: 24,
        height: 1
      });
    });
  });
}

// Draw vertical connectors for consecutive thumbnail posts
function drawThumbnailConnectors(container, containerRect) {
  container.querySelectorAll('.thumbnail-group').forEach(group => {
    const posts = group.querySelectorAll('.post-card--thumbnail');
    if (posts.length < 2) return;

    const firstPost = posts[0];
    const lastPost = posts[posts.length - 1];

    const firstThumb = firstPost.querySelector('.post-thumbnail-container');
    const lastThumb = lastPost.querySelector('.post-thumbnail-container');

    const firstRect = firstThumb.getBoundingClientRect();
    const lastRect = lastThumb.getBoundingClientRect();

    // Vertical line 24px from left edge of thumbnails, spanning from bottom of first to top of last
    const leftPos = firstRect.left - containerRect.left + 24;
    const topY = firstRect.bottom - containerRect.top;
    const bottomY = lastRect.top - containerRect.top;

    createConnector(container, {
      left: leftPos,
      top: topY,
      width: 1,
      height: bottomY - topY
    });
  });
}

// Create a connector element
function createConnector(container, { left, top, width, height }) {
  const connector = document.createElement('div');
  connector.className = 'connector';
  connector.style.cssText = `
    position: absolute;
    left: ${left}px;
    top: ${top}px;
    width: ${width}px;
    height: ${height}px;
    background: white;
    pointer-events: none;
  `;
  container.appendChild(connector);
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

  // Update page title immediately
  document.title = `${post.title} - lasse's website`;

  // Immediately render post header (no flash of old content)
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

      <div class="post-content"></div>
    </div>
  `;

  // Load and render markdown content
  const content = await loadPostContent(slug);
  if (content) {
    const htmlContent = marked.parse(content);
    const contentContainer = container.querySelector('.post-content');
    if (contentContainer) {
      contentContainer.innerHTML = htmlContent;
    }
  }

  // Re-initialize Lucide icons after rendering
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// Show the main view (hero + feed)
function showMainView() {
  const container = document.getElementById("post-detail");
  const blogSection = document.querySelector(".blog-section");
  const heroSection = document.querySelector(".container.hero");

  // Remove post-page class when navigating back
  document.documentElement.classList.remove('is-post-page');

  if (container) container.style.display = "none";
  if (heroSection) heroSection.style.display = "flex";
  if (blogSection) blogSection.style.display = "flex";

  // Reset page title
  document.title = "lasse's website";

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
