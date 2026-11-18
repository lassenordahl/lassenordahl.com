// The post page markup, shared by the site (blog/index.js) and the /admin
// preview so the preview is the real thing. scripts/generate-posts.js renders
// the same markup at build time for direct loads; keep the two in step.

export function formatDate(dateString) {
  // Parse date components to avoid timezone issues
  const [year, month, day] = String(dateString || "").split("-").map(Number);
  if (!year || !month || !day) return "";
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}

export function postDetailHtml(post, contentHtml = "") {
  return `
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

      <div class="post-content">${contentHtml}</div>
    </div>
  `;
}
