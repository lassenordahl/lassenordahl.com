import "./style.css";
import "./display-system.css";
import "./trains.css";
import { mountPreview } from "./display-preview";

const IS_LOCAL = location.hostname === "localhost" || location.hostname === "127.0.0.1";
const API_BASE = IS_LOCAL
  ? "http://localhost:8787"
  : "https://lassenordahl-api.lasseanordahl.workers.dev";

const preview = mountPreview(document.getElementById("preview"), {
  color: [255, 165, 0],
});
const previewNote = document.getElementById("preview-note");

const addressInput = document.getElementById("address-input");
const feedList = document.getElementById("feed-list");
const addFeedBtn = document.getElementById("add-feed-btn");
const saveBtn = document.getElementById("save-btn");
const status = document.getElementById("status");

const DEFAULT_CONFIG = {
  address: "240 Meeker Ave, Brooklyn",
  feeds: [
    { line: "L", stopIds: ["L08N", "L08S"] },
    { line: "G", stopIds: ["G29N", "G29S"] },
  ],
};

let statusTimer = null;
function setStatus(msg, ttlMs = 2400) {
  status.textContent = msg;
  if (statusTimer) clearTimeout(statusTimer);
  if (ttlMs > 0) statusTimer = setTimeout(() => (status.textContent = ""), ttlMs);
}

function renderFeeds(feeds) {
  feedList.innerHTML = "";
  feeds.forEach((feed, idx) => {
    const row = document.createElement("div");
    row.className = "trains-feed";

    const line = document.createElement("input");
    line.className = "trains-feed-line";
    line.type = "text";
    line.maxLength = 2;
    line.value = feed.line || "";
    line.placeholder = "L";

    const stops = document.createElement("input");
    stops.className = "trains-feed-stops";
    stops.type = "text";
    stops.value = (feed.stopIds || []).join(", ");
    stops.placeholder = "L08N, L08S";

    const remove = document.createElement("button");
    remove.className = "trains-feed-remove";
    remove.textContent = "×";
    remove.title = "remove feed";
    remove.addEventListener("click", () => {
      row.remove();
    });

    row.appendChild(line);
    row.appendChild(stops);
    row.appendChild(remove);
    feedList.appendChild(row);
  });
}

function readFeedsFromDom() {
  const rows = [...feedList.querySelectorAll(".trains-feed")];
  return rows
    .map((row) => {
      const line = row.querySelector(".trains-feed-line").value.trim().toUpperCase();
      const stopsRaw = row.querySelector(".trains-feed-stops").value;
      const stopIds = stopsRaw
        .split(/[\s,]+/)
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
      return { line, stopIds };
    })
    .filter((f) => f.line && f.stopIds.length > 0);
}

addFeedBtn.addEventListener("click", () => {
  const current = readFeedsFromDom();
  current.push({ line: "", stopIds: [] });
  renderFeeds(current);
});

async function loadConfig() {
  try {
    const res = await fetch(`${API_BASE}/trains/config`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const config = data.config || DEFAULT_CONFIG;
    addressInput.value = config.address || "";
    renderFeeds(config.feeds || []);
  } catch (e) {
    console.error(e);
    addressInput.value = DEFAULT_CONFIG.address;
    renderFeeds(DEFAULT_CONFIG.feeds);
  }
}

async function loadCurrentTrainsText() {
  try {
    const res = await fetch(`${API_BASE}/trains`);
    const data = await res.json();
    if (data && typeof data.text === "string" && data.text.length > 0) {
      preview.setText(data.text);
      previewNote.textContent = `current: ${data.text}`;
    } else {
      previewNote.textContent = "no arrivals right now";
    }
  } catch (e) {
    console.error(e);
    previewNote.textContent = "couldn't load arrivals";
  }
}

async function save() {
  const config = {
    address: addressInput.value.trim(),
    feeds: readFeedsFromDom(),
  };
  saveBtn.disabled = true;
  setStatus("saving…", 0);
  try {
    const res = await fetch(`${API_BASE}/trains/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    setStatus("saved — refreshing preview");
    await loadCurrentTrainsText();
  } catch (e) {
    console.error(e);
    setStatus("save failed");
  } finally {
    saveBtn.disabled = false;
  }
}

saveBtn.addEventListener("click", save);

loadConfig();
loadCurrentTrainsText();
