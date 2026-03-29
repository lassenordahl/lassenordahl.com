import "./style.css";
import "./tasks.css";
import { inject } from "@vercel/analytics";
import { injectSpeedInsights } from "@vercel/speed-insights";

// Initialize Vercel Analytics & Speed Insights
inject();
injectSpeedInsights();

const API_URL = "https://cmd-worker.lasseanordahl.workers.dev/tasks";
const REFRESH_INTERVAL = 5000; // 5 seconds

// Status configuration
const STATUS_CONFIG = {
  pending: {
    color: "#f5a623",
    label: "Pending",
  },
  in_progress: {
    color: "#4a90d9",
    label: "In Progress",
  },
  completed: {
    color: "#7ed321",
    label: "Completed",
  },
  failed: {
    color: "#d0021b",
    label: "Failed",
  },
};

/**
 * Calculate relative time string from a date
 */
function getRelativeTime(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) {
    return "just now";
  } else if (diffMin < 60) {
    return `${diffMin} min${diffMin === 1 ? "" : "s"} ago`;
  } else if (diffHour < 24) {
    return `${diffHour} hour${diffHour === 1 ? "" : "s"} ago`;
  } else if (diffDay < 7) {
    return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
  } else {
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });
  }
}

/**
 * Create a task card element
 */
function createTaskCard(task) {
  const statusConfig = STATUS_CONFIG[task.status] || STATUS_CONFIG.pending;

  const card = document.createElement("div");
  card.className = "task-card";
  card.dataset.status = task.status;

  card.innerHTML = `
    <div class="task-status">
      <span class="status-dot" style="background-color: ${statusConfig.color}"></span>
      <span class="status-label">${statusConfig.label}</span>
    </div>
    <div class="task-content">${escapeHtml(task.content)}</div>
    <div class="task-meta">
      ${task.target_project ? `<span class="task-project">${escapeHtml(task.target_project)}</span>` : ""}
      <span class="task-time">${getRelativeTime(task.updated_at || task.created_at)}</span>
    </div>
  `;

  return card;
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Render tasks to the DOM
 */
function renderTasks(tasks) {
  const container = document.getElementById("tasks-list");

  if (!tasks || tasks.length === 0) {
    container.innerHTML = '<div class="empty-state">No tasks found</div>';
    return;
  }

  // Sort by updated_at or created_at, most recent first
  const sortedTasks = [...tasks].sort((a, b) => {
    const dateA = new Date(a.updated_at || a.created_at);
    const dateB = new Date(b.updated_at || b.created_at);
    return dateB - dateA;
  });

  container.innerHTML = "";
  sortedTasks.forEach((task) => {
    container.appendChild(createTaskCard(task));
  });
}

/**
 * Fetch tasks from the API
 */
async function fetchTasks() {
  try {
    const response = await fetch(API_URL);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    const tasks = data.tasks || data; // Handle both {tasks: [...]} and [...] formats
    renderTasks(tasks);
  } catch (error) {
    console.error("Error fetching tasks:", error);
    const container = document.getElementById("tasks-list");
    container.innerHTML = `<div class="error-state">Failed to load tasks. Will retry...</div>`;
  }
}

/**
 * Initialize the tasks page
 */
function init() {
  // Initial fetch
  fetchTasks();

  // Set up auto-refresh
  setInterval(fetchTasks, REFRESH_INTERVAL);

  // Add pulse animation to refresh indicator
  const refreshDot = document.querySelector(".refresh-dot");
  if (refreshDot) {
    setInterval(() => {
      refreshDot.classList.add("pulse");
      setTimeout(() => refreshDot.classList.remove("pulse"), 1000);
    }, REFRESH_INTERVAL);
  }
}

// Start when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
