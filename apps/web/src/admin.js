// lassenordahl.com/admin: write and edit blog posts in the browser.
//
// Talks to the API worker's /admin endpoints (apps/api/src/blog-admin.ts) with
// a bearer token kept in localStorage. Edits autosave as a private draft (KV);
// "publish" commits apps/web/content/blog/<slug>.md to master, and the normal
// GitHub Actions deploy takes it live in a minute or two.

import "./style.css";
import "./app.css";
import "./admin.css";
import { marked } from "marked";
import { createIcons, icons } from "lucide";
import { DEFAULT_AUTHOR } from "./blog/posts.js";
import { formatDate, postDetailHtml } from "./blog/post-template.js";
import { mountBlogCanvases, unmountBlogCanvases } from "./blog/canvases.js";

const IS_LOCAL = location.hostname === "localhost" || location.hostname === "127.0.0.1";
const API_BASE = IS_LOCAL
  ? "http://localhost:8787"
  : "https://lassenordahl-api.lasseanordahl.workers.dev";
const TOKEN_KEY = "blogAdminToken";
const AUTOSAVE_MS = 1200;
const KNOWN_FIELDS = ["title", "date", "icon", "thumbnail", "originalUrl", "isOwnProject", "hasAuthor", "hidden"];
const SUGGESTED_ICONS = [
  "pen-line", "printer", "hammer", "target", "boom-box", "chef-hat", "cooking-pot", "croissant",
  "camera", "code", "train-front", "palette", "book-open", "sparkles", "plane", "music", "gamepad-2",
];

const $ = (id) => document.getElementById(id);

// ── Token + API ─────────────────────────────────────────────────────────────

let memoryToken = "";
function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || memoryToken;
  } catch {
    return memoryToken;
  }
}
function setToken(token) {
  memoryToken = token;
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function api(path, { method = "GET", json, body, contentType } = {}) {
  const headers = { Authorization: `Bearer ${getToken()}` };
  if (json !== undefined) headers["Content-Type"] = "application/json";
  else if (contentType) headers["Content-Type"] = contentType;
  let res;
  try {
    res = await fetch(`${API_BASE}/admin${path}`, {
      method,
      headers,
      body: json !== undefined ? JSON.stringify(json) : body,
    });
  } catch {
    throw new ApiError("can't reach the API, check your connection", 0, null);
  }
  let data = null;
  try {
    data = await res.json();
  } catch {}
  if (res.status === 401) {
    setToken("");
    showLogin("That token was rejected. Sign in again.");
    throw new ApiError("unauthorized", 401, data);
  }
  if (!res.ok || data?.ok === false) {
    throw new ApiError(data?.error || `request failed (${res.status})`, res.status, data);
  }
  return data;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function slugify(text) {
  return String(text)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
}

const SLUG_RE = /^[a-z0-9][a-z0-9.-]*$/;
const isValidSlug = (s) => SLUG_RE.test(s) && !s.includes("..") && s.length <= 100;

function timeAgo(ms) {
  if (!ms) return "";
  const diff = Date.now() - ms;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)} h ago`;
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function clock(ms = Date.now()) {
  return new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function lucideName(name) {
  return String(name)
    .split("-")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v === true ? "" : v);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function setStatus(node, text, kind = "") {
  node.classList.toggle("is-error", kind === "error");
  node.classList.toggle("is-good", kind === "good");
  if (text instanceof Node) node.replaceChildren(text);
  else node.textContent = text || "";
}

// ── Views ───────────────────────────────────────────────────────────────────

const views = { login: $("view-login"), list: $("view-list"), edit: $("view-edit") };

function showView(name) {
  for (const [key, node] of Object.entries(views)) node.hidden = key !== name;
  document.title = `${name === "edit" ? "editor" : name === "list" ? "posts" : "admin"} - lasse's website`;
}

function showLogin(message = "") {
  stopEditor();
  showView("login");
  setStatus($("login-status"), message, message ? "error" : "");
  $("token-input").focus();
}

$("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const token = $("token-input").value.trim();
  if (!token) return;
  setToken(token);
  setStatus($("login-status"), "checking...");
  try {
    await api("/session");
    $("token-input").value = "";
    setStatus($("login-status"), "");
    route();
  } catch (err) {
    if (err.status !== 401) setStatus($("login-status"), err.message, "error");
  }
});

$("sign-out").addEventListener("click", () => {
  setToken("");
  location.hash = "#/";
  showLogin();
});

// ── Post list ───────────────────────────────────────────────────────────────

async function showList() {
  stopEditor();
  showView("list");
  const status = $("list-status");
  const list = $("post-list");
  setStatus(status, "loading posts...");
  let posts;
  try {
    ({ posts } = await api("/posts"));
  } catch (err) {
    if (err.status !== 401) setStatus(status, err.message, "error");
    return;
  }
  setStatus(status, "");
  allIcons = new Set(posts.map((p) => p.meta?.icon).filter(Boolean));

  posts.sort((a, b) => {
    if (!a.sha !== !b.sha) return a.sha ? 1 : -1; // never-published drafts first
    return String(b.meta?.date || "").localeCompare(String(a.meta?.date || "")) || a.slug.localeCompare(b.slug);
  });

  list.replaceChildren(
    ...posts.map((post) => {
      const meta = post.meta || {};
      const tags = [];
      if (!post.sha) tags.push(el("span", { class: "admin-tag admin-tag--draft" }, "draft, not published"));
      else if (post.draft) tags.push(el("span", { class: "admin-tag admin-tag--draft" }, "unpublished changes"));
      if (meta.hidden) tags.push(el("span", { class: "admin-tag admin-tag--hidden" }, "hidden"));
      if (meta.originalUrl) tags.push(el("span", { class: "admin-tag admin-tag--external" }, "external"));
      const edited = post.draft ? `edited ${timeAgo(post.draft.updatedAt)}` : "";
      return el(
        "li",
        {},
        el(
          "a",
          { class: "admin-post", href: `#/edit/${encodeURIComponent(post.slug)}` },
          el("span", { class: "admin-post-title" }, post.draft?.title || meta.title || post.slug),
          el("span", { class: "admin-post-date" }, formatDate(meta.date)),
          el("span", { class: "admin-post-meta" }, `/post/${post.slug}`, ...tags, edited),
        ),
      );
    }),
  );
  if (!posts.length) setStatus(status, "No posts yet.");
}

// ── Editor ──────────────────────────────────────────────────────────────────

const f = {
  title: $("f-title"),
  date: $("f-date"),
  slug: $("f-slug"),
  icon: $("f-icon"),
  thumbnail: $("f-thumbnail"),
  originalUrl: $("f-originalUrl"),
  hasAuthor: $("f-hasAuthor"),
  isOwnProject: $("f-isOwnProject"),
  hidden: $("f-hidden"),
  body: $("f-body"),
};
const editorStatus = $("editor-status");
const preview = $("preview");

let allIcons = new Set();
let ed = null; // the open post, see openEditor()
let editorGeneration = 0; // bumps on every open/close so stale async work bails

function readMeta() {
  const meta = { ...(ed?.extraMeta || {}) };
  for (const key of ["title", "date", "icon", "thumbnail", "originalUrl"]) {
    const value = f[key].value.trim();
    if (value) meta[key] = value;
  }
  if (f.isOwnProject.checked) meta.isOwnProject = true;
  if (!f.hasAuthor.checked) meta.hasAuthor = false;
  if (f.hidden.checked) meta.hidden = true;
  return meta;
}

function fillFields(meta = {}, body = "") {
  for (const key of ["title", "date", "icon", "thumbnail", "originalUrl"]) {
    f[key].value = typeof meta[key] === "string" ? meta[key] : "";
  }
  f.isOwnProject.checked = meta.isOwnProject === true;
  f.hasAuthor.checked = meta.hasAuthor !== false;
  f.hidden.checked = meta.hidden === true;
  f.body.value = body;
  const extra = {};
  for (const [k, v] of Object.entries(meta)) if (!KNOWN_FIELDS.includes(k)) extra[k] = v;
  return extra;
}

const currentSlug = () => f.slug.value.trim();
const snapshot = () => JSON.stringify({ slug: currentSlug(), meta: readMeta(), body: f.body.value.replace(/\s+$/, "") });

function stopEditor() {
  editorGeneration++;
  if (ed?.autosaveTimer) {
    clearTimeout(ed.autosaveTimer);
    // Leaving with unsaved edits: save them on the way out.
    if (snapshot() !== ed.savedSnapshot) saveDraft({ quiet: true, edState: ed });
  }
  if (ed?.deployTimer) clearTimeout(ed.deployTimer);
  if (ed?.sketchesOn) unmountBlogCanvases();
  ed = null;
}

async function openEditor(slug) {
  stopEditor();
  const generation = editorGeneration;
  showView("edit");
  $("editor-banner").hidden = true;
  $("view-live").hidden = true;
  $("discard-draft").hidden = true;
  $("delete-post").hidden = true;
  $("more-fields").open = false;
  setTabs("write");

  ed = {
    slug,
    isNew: true, // no published file yet
    publishedSha: null,
    publishedSnapshot: null,
    savedSnapshot: null,
    draftSlug: null, // KV key the draft lives under (new posts can rename)
    hasDraft: false,
    slugTouched: false,
    extraMeta: {},
    autosaveTimer: null,
    deployTimer: null,
    sketchesOn: false,
  };

  if (!slug) {
    ed.extraMeta = fillFields({ date: today(), icon: "pen-line" }, "");
    f.slug.value = "";
    f.slug.disabled = false;
    ed.savedSnapshot = snapshot();
    $("editor-slug").textContent = "new post";
    setStatus(editorStatus, "new post, autosaves once it has a title");
    afterLoad();
    f.title.focus();
    return;
  }

  [f.title, f.body].forEach((n) => (n.disabled = true));
  setStatus(editorStatus, "loading...");
  let data;
  try {
    data = await api(`/posts/${encodeURIComponent(slug)}`);
  } catch (err) {
    if (generation !== editorGeneration) return;
    if (err.status !== 401) setStatus(editorStatus, err.message, "error");
    return;
  } finally {
    [f.title, f.body].forEach((n) => (n.disabled = false));
  }
  if (generation !== editorGeneration) return;

  const { published, draft } = data;
  if (!published && !draft) {
    setStatus(editorStatus, `no post or draft called "${slug}"`, "error");
    return;
  }

  f.slug.value = slug;
  if (published) {
    ed.isNew = false;
    ed.publishedSha = published.sha;
    ed.extraMeta = fillFields(published.meta, published.body);
    ed.publishedSnapshot = snapshot();
  }
  f.slug.disabled = !ed.isNew; // renaming a live post would break its URL
  ed.slugTouched = true;

  if (draft) {
    ed.extraMeta = fillFields(draft.meta, draft.body);
    ed.hasDraft = true;
    ed.draftSlug = slug;
    const banner = $("editor-banner");
    const stale = published && draft.baseSha !== published.sha;
    banner.replaceChildren(
      stale
        ? `This draft (saved ${timeAgo(draft.updatedAt)}) started from an older version of the post. It changed on GitHub since. Publishing will overwrite those changes.`
        : published
          ? `Showing your unpublished changes from ${timeAgo(draft.updatedAt)}.`
          : `Draft from ${timeAgo(draft.updatedAt)}, not published yet.`,
      published ? el("button", { class: "admin-btn", type: "button", id: "banner-discard" }, "discard changes") : "",
    );
    banner.hidden = false;
    $("banner-discard")?.addEventListener("click", discardDraft);
  }

  ed.savedSnapshot = snapshot();
  $("editor-slug").textContent = `/post/${slug}`;
  if (!ed.isNew) {
    const live = $("view-live");
    live.href = `/post/${slug}`;
    live.hidden = !!readMeta().hidden;
    $("delete-post").hidden = false;
  }
  updateIdleStatus();
  afterLoad();
}

function afterLoad() {
  $("discard-draft").hidden = !ed.hasDraft;
  updateIconPreview();
  renderPreview();
}

function updateIdleStatus() {
  if (!ed) return;
  if (ed.isNew) setStatus(editorStatus, ed.hasDraft ? "draft, not published" : "new post");
  else if (ed.hasDraft) setStatus(editorStatus, "draft has unpublished changes");
  else setStatus(editorStatus, "published, no changes");
}

// Autosave ───────────────────────────────────────────────────────────────────

function onEdit() {
  if (!ed) return;
  if (ed.isNew && !ed.slugTouched) f.slug.value = slugify(f.title.value);
  $("editor-slug").textContent = currentSlug() ? `/post/${currentSlug()}` : "new post";
  schedulePreview();
  clearTimeout(ed.autosaveTimer);
  if (snapshot() === ed.savedSnapshot) return;
  setStatus(editorStatus, "editing...");
  ed.autosaveTimer = setTimeout(() => saveDraft(), AUTOSAVE_MS);
}

async function saveDraft({ quiet = false, edState = ed } = {}) {
  const state = edState;
  if (!state) return;
  clearTimeout(state.autosaveTimer);
  state.autosaveTimer = null;
  const slug = currentSlug();
  const snap = snapshot();
  if (snap === state.savedSnapshot) return;

  if (!isValidSlug(slug)) {
    if (!quiet) setStatus(editorStatus, slug ? "slug: use lowercase letters, numbers, dots and dashes" : "add a title to start saving", slug ? "error" : "");
    return;
  }

  try {
    if (state.publishedSnapshot && snap === state.publishedSnapshot) {
      // Edited back to exactly what's live: the draft is no longer needed.
      if (state.hasDraft) await api(`/drafts/${encodeURIComponent(state.draftSlug)}`, { method: "DELETE" });
      state.hasDraft = false;
      state.draftSlug = null;
    } else {
      await api(`/drafts/${encodeURIComponent(slug)}`, {
        method: "PUT",
        json: { meta: readMeta(), body: f.body.value, sha: state.publishedSha },
      });
      // A new post whose slug changed leaves its old draft behind; drop it.
      if (state.draftSlug && state.draftSlug !== slug) {
        api(`/drafts/${encodeURIComponent(state.draftSlug)}`, { method: "DELETE" }).catch(() => {});
      }
      state.hasDraft = true;
      state.draftSlug = slug;
      if (state.isNew && state === ed) history.replaceState(null, "", `#/edit/${encodeURIComponent(slug)}`);
    }
    state.savedSnapshot = snap;
    if (state !== ed) return;
    $("discard-draft").hidden = !state.hasDraft;
    if (snapshot() === snap) {
      setStatus(editorStatus, state.hasDraft ? `draft saved ${clock()}` : "published, no changes");
    }
  } catch (err) {
    if (state === ed && err.status !== 401) setStatus(editorStatus, `couldn't save draft: ${err.message}`, "error");
  }
}

async function discardDraft() {
  if (!ed?.hasDraft) return;
  const msg = ed.isNew ? "Delete this unpublished draft?" : "Throw away your unpublished changes and go back to the live version?";
  if (!confirm(msg)) return;
  const { draftSlug, isNew, slug } = ed;
  clearTimeout(ed.autosaveTimer);
  try {
    await api(`/drafts/${encodeURIComponent(draftSlug)}`, { method: "DELETE" });
  } catch (err) {
    setStatus(editorStatus, err.message, "error");
    return;
  }
  ed.savedSnapshot = snapshot(); // nothing left to autosave on the way out
  if (isNew) location.hash = "#/";
  else openEditor(slug);
}

// Publish ────────────────────────────────────────────────────────────────────

async function publish() {
  if (!ed) return;
  const state = ed;
  clearTimeout(state.autosaveTimer);
  const slug = currentSlug();
  const meta = readMeta();
  const problems = [];
  if (!meta.title) problems.push("add a title");
  if (!meta.date) problems.push("add a date");
  if (!isValidSlug(slug)) problems.push("fix the slug (lowercase letters, numbers, dots, dashes)");
  if (problems.length) {
    setStatus(editorStatus, problems.join(", "), "error");
    return;
  }
  const verb = state.isNew ? "Publish" : "Publish changes to";
  if (!confirm(`${verb} "${meta.title}"?${meta.hidden ? " (hidden)" : ""}\n\nIt goes live at /post/${slug} in a minute or two.`)) return;

  const button = $("publish");
  button.disabled = true;
  setStatus(editorStatus, "publishing...");
  try {
    const res = await api(`/posts/${encodeURIComponent(slug)}`, {
      method: "POST",
      json: { meta, body: f.body.value, sha: state.publishedSha },
    });
    if (state.draftSlug && state.draftSlug !== slug) {
      api(`/drafts/${encodeURIComponent(state.draftSlug)}`, { method: "DELETE" }).catch(() => {});
    }
    if (state !== ed) return;
    state.isNew = false;
    state.slug = slug;
    state.publishedSha = res.sha;
    state.hasDraft = false;
    state.draftSlug = null;
    state.publishedSnapshot = state.savedSnapshot = snapshot();
    f.slug.disabled = true;
    history.replaceState(null, "", `#/edit/${encodeURIComponent(slug)}`);
    $("editor-banner").hidden = true;
    $("discard-draft").hidden = true;
    $("delete-post").hidden = false;
    const live = $("view-live");
    live.href = `/post/${slug}`;
    live.hidden = !!meta.hidden;
    watchDeploy(state, res.commit);
  } catch (err) {
    if (err.status !== 401) setStatus(editorStatus, err.message, "error");
    // Keep the work safe as a draft whatever went wrong.
    if (state === ed) saveDraft({ quiet: true });
  } finally {
    button.disabled = false;
  }
}

function watchDeploy(state, commit) {
  const started = Date.now();
  const commitLink = commit?.url ? el("a", { href: commit.url, target: "_blank", rel: "noopener" }, "commit") : null;
  const show = (text, kind, link) => {
    if (state !== ed) return;
    setStatus(editorStatus, el("span", {}, text, link ? " (" : "", link || "", link ? ")" : ""), kind);
  };
  show("published, waiting for deploy...", "", commitLink);
  if (!commit?.sha) return;

  const poll = async () => {
    if (state !== ed) return;
    let run;
    try {
      run = await api(`/deploys/${commit.sha}`);
    } catch {
      run = { status: "unknown" };
    }
    const runLink = run.url ? el("a", { href: run.url, target: "_blank", rel: "noopener" }, "deploy log") : commitLink;
    if (run.status === "completed") {
      if (run.conclusion === "success") show("published and live", "good", runLink);
      else if (run.conclusion === "cancelled") show("published (a newer deploy replaced this one)", "good", runLink);
      else show(`published, but the deploy ${run.conclusion}`, "error", runLink);
      return;
    }
    if (Date.now() - started > 10 * 60_000) {
      show("published, deploy is taking a while", "", runLink);
      return;
    }
    show(run.status === "in_progress" ? "published, deploying..." : "published, deploy queued...", "", runLink);
    state.deployTimer = setTimeout(poll, 5000);
  };
  state.deployTimer = setTimeout(poll, 4000);
}

async function deletePost() {
  if (!ed || ed.isNew) return;
  const title = f.title.value.trim() || ed.slug;
  if (!confirm(`Delete "${title}"? It comes off the site and out of the repo (git history keeps a copy).`)) return;
  try {
    await api(`/posts/${encodeURIComponent(ed.slug)}`, { method: "DELETE", json: { sha: ed.publishedSha } });
    ed.savedSnapshot = snapshot();
    location.hash = "#/";
  } catch (err) {
    if (err.status !== 401) setStatus(editorStatus, err.message, "error");
  }
}

// Preview ────────────────────────────────────────────────────────────────────

let previewTimer = null;
function schedulePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(renderPreview, 150);
}

function renderPreview() {
  if (!ed) return;
  const meta = readMeta();
  const body = f.body.value;
  const post = {
    ...meta,
    title: meta.title || "Untitled",
    author: meta.hasAuthor === false ? undefined : DEFAULT_AUTHOR,
  };
  const content = body.trim()
    ? marked.parse(body)
    : `<p class="preview-empty">${meta.originalUrl ? "External post, no body needed." : "Nothing written yet."}</p>`;
  const hasSketches = body.includes("blog-canvas");
  $("run-sketches").hidden = !hasSketches;
  if (ed.sketchesOn) unmountBlogCanvases();
  preview.innerHTML = postDetailHtml(post, content);
  if (ed.sketchesOn && hasSketches) mountBlogCanvases(preview.querySelector(".post-content"));
  $("run-sketches").textContent = ed.sketchesOn ? "stop sketches" : "run sketches";
}

$("run-sketches").addEventListener("click", () => {
  if (!ed) return;
  ed.sketchesOn = !ed.sketchesOn;
  if (!ed.sketchesOn) unmountBlogCanvases();
  renderPreview();
});

// Links in the preview open in a new tab instead of leaving the editor.
preview.addEventListener("click", (e) => {
  const link = e.target.closest("a");
  if (!link) return;
  e.preventDefault();
  if (link.classList.contains("back-link")) return;
  window.open(link.href, "_blank", "noopener");
});

function updateIconPreview() {
  const name = f.icon.value.trim();
  const holder = $("icon-preview");
  if (name && icons[lucideName(name)]) {
    holder.innerHTML = `<i data-lucide="${name}"></i>`;
    createIcons({ icons, root: holder });
  } else {
    holder.textContent = name ? "(unknown icon)" : "";
  }
  const options = [...new Set([...allIcons, ...SUGGESTED_ICONS])].filter((n) => icons[lucideName(n)]);
  $("icon-options").replaceChildren(...options.map((n) => el("option", { value: n })));
}

// Images ─────────────────────────────────────────────────────────────────────

// The worker decodes JPEG and PNG. Anything else (HEIC, WebP, GIF), and very
// large files, get re-encoded to JPEG in the browser first.
async function prepareImage(file) {
  const direct = /^image\/(jpeg|png)$/.test(file.type) && file.size < 15 * 1024 * 1024;
  if (direct) return { blob: file, type: file.type };
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) throw new Error(`can't read ${file.name || "that image"} in this browser`);
  const scale = Math.min(1, 3200 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
  if (!blob) throw new Error("couldn't convert that image");
  return { blob, type: "image/jpeg" };
}

async function uploadImage(file) {
  const { blob, type } = await prepareImage(file);
  const res = await api("/images", { method: "POST", body: blob, contentType: type });
  return res.url;
}

function insertAtCursor(text) {
  const { selectionStart: start, selectionEnd: end, value } = f.body;
  const before = value.slice(0, start);
  const pad = before && !before.endsWith("\n") ? "\n\n" : "";
  f.body.setRangeText(pad + text + "\n", start, end, "end");
  f.body.focus();
  onEdit();
}

async function uploadIntoBody(files) {
  for (const file of files) {
    if (!file.type.startsWith("image/")) continue;
    const marker = `![uploading ${file.name || "image"}...]()`;
    insertAtCursor(marker);
    try {
      const url = await uploadImage(file);
      f.body.value = f.body.value.replace(marker, `![](${url})`);
    } catch (err) {
      f.body.value = f.body.value.replace(marker + "\n", "").replace(marker, "");
      if (err.status !== 401) setStatus(editorStatus, `image upload failed: ${err.message}`, "error");
    }
    onEdit();
  }
}

let pickerTarget = "body";
const picker = $("file-picker");
$("insert-image").addEventListener("click", () => {
  pickerTarget = "body";
  picker.multiple = true;
  picker.click();
});
$("thumb-upload").addEventListener("click", (e) => {
  e.preventDefault();
  pickerTarget = "thumbnail";
  picker.multiple = false;
  picker.click();
});
picker.addEventListener("change", async () => {
  const files = [...picker.files];
  picker.value = "";
  if (!files.length) return;
  if (pickerTarget === "thumbnail") {
    setStatus(editorStatus, "uploading thumbnail...");
    try {
      f.thumbnail.value = await uploadImage(files[0]);
      setStatus(editorStatus, "thumbnail uploaded");
      onEdit();
    } catch (err) {
      if (err.status !== 401) setStatus(editorStatus, `upload failed: ${err.message}`, "error");
    }
  } else {
    uploadIntoBody(files);
  }
});

f.body.addEventListener("paste", (e) => {
  const files = [...(e.clipboardData?.files || [])].filter((file) => file.type.startsWith("image/"));
  if (!files.length) return;
  e.preventDefault();
  uploadIntoBody(files);
});
f.body.addEventListener("dragover", (e) => {
  if ([...(e.dataTransfer?.items || [])].some((i) => i.kind === "file")) {
    e.preventDefault();
    f.body.classList.add("is-dropping");
  }
});
f.body.addEventListener("dragleave", () => f.body.classList.remove("is-dropping"));
f.body.addEventListener("drop", (e) => {
  f.body.classList.remove("is-dropping");
  const files = [...(e.dataTransfer?.files || [])];
  if (!files.length) return;
  e.preventDefault();
  const pos = f.body.selectionStart;
  f.body.setSelectionRange(pos, pos);
  uploadIntoBody(files);
});

// Wiring ─────────────────────────────────────────────────────────────────────

for (const key of ["title", "date", "icon", "thumbnail", "originalUrl", "body"]) {
  f[key].addEventListener("input", onEdit);
}
for (const key of ["hasAuthor", "isOwnProject", "hidden"]) {
  f[key].addEventListener("change", onEdit);
}
f.icon.addEventListener("input", updateIconPreview);
f.slug.addEventListener("input", () => {
  if (!ed) return;
  ed.slugTouched = f.slug.value.trim() !== "";
  onEdit();
});
f.slug.addEventListener("blur", () => {
  if (!ed?.isNew) return;
  const clean = slugify(f.slug.value.replace(/\./g, "-dot-")).replace(/-dot-/g, ".");
  if (clean !== f.slug.value) {
    f.slug.value = clean;
    onEdit();
  }
});

$("publish").addEventListener("click", publish);
$("discard-draft").addEventListener("click", discardDraft);
$("delete-post").addEventListener("click", deletePost);

function setTabs(active) {
  document.querySelector(".editor-panes").dataset.active = active;
  document.querySelectorAll(".editor-tab").forEach((tab) => {
    tab.setAttribute("aria-selected", String(tab.dataset.tab === active));
  });
  if (active === "preview") renderPreview();
}
document.querySelectorAll(".editor-tab").forEach((tab) => {
  tab.addEventListener("click", () => setTabs(tab.dataset.tab));
});

document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s" && ed) {
    e.preventDefault();
    if (snapshot() === ed.savedSnapshot) updateIdleStatus();
    else saveDraft();
  }
});

window.addEventListener("beforeunload", (e) => {
  if (ed && snapshot() !== ed.savedSnapshot) {
    saveDraft({ quiet: true });
    e.preventDefault();
    e.returnValue = "";
  }
});

// ── Routing ─────────────────────────────────────────────────────────────────

function route() {
  if (!getToken()) {
    showLogin();
    return;
  }
  const hash = location.hash.replace(/^#/, "") || "/";
  if (hash === "/new") openEditor(null);
  else if (hash.startsWith("/edit/")) openEditor(decodeURIComponent(hash.slice("/edit/".length)));
  else showList();
}

window.addEventListener("hashchange", route);
route();
