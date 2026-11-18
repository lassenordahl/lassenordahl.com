// Blog admin API, behind lassenordahl.com/admin.
//
// Posts live in GitHub as apps/web/content/blog/<slug>.md. This worker is the
// only thing holding a GitHub token: the admin page talks to these endpoints
// with a bearer ADMIN_TOKEN, and "publish" becomes a commit to master, which
// the existing GitHub Actions workflow deploys like any other push.
//
// Drafts never touch the repo (it is public). They are autosaved to KV under
// blog-draft:<slug> until you publish or discard them.
//
//   GET    /admin/session            check the token, return repo info
//   GET    /admin/posts              every post in the repo + every draft
//   GET    /admin/posts/:slug        published version (if any) + draft (if any)
//   PUT    /admin/drafts/:slug       autosave a draft
//   DELETE /admin/drafts/:slug       discard a draft
//   POST   /admin/posts/:slug        publish: validate, commit, clear the draft
//   DELETE /admin/posts/:slug        delete the post from the repo
//   POST   /admin/images             upload an image (-> R2, WebP) for a post
//   GET    /admin/deploys/:commit    status of the deploy run for a commit
//
// Secrets (wrangler secret put): ADMIN_TOKEN, GITHUB_TOKEN (fine-grained,
// this repo only: Contents read/write, Actions read).

import { Hono } from "hono";
import type { Context, Next } from "hono";
import {
  isValidSlug,
  normalizeMeta,
  parsePost,
  serializePost,
  validatePost,
  type PostMeta,
} from "../../web/scripts/post-format.mjs";
import { storeImage, type AssetsEnv } from "./assets";

export type BlogAdminEnv = AssetsEnv & {
  DISPLAY_STATE: KVNamespace;
  ADMIN_TOKEN?: string;
  GITHUB_TOKEN?: string;
  GITHUB_REPO?: string; // owner/name, defaults to the site repo
  GITHUB_BRANCH?: string;
};

type AdminContext = Context<{ Bindings: BlogAdminEnv }>;

const DEFAULT_REPO = "lassenordahl/lassenordahl.com";
const DEFAULT_BRANCH = "master";
const POSTS_DIR = "apps/web/content/blog";
const DEPLOY_WORKFLOW = "deploy.yml";
const DRAFT_PREFIX = "blog-draft:";
const MAX_POST_BYTES = 512 * 1024;

const repoOf = (env: BlogAdminEnv) => env.GITHUB_REPO || DEFAULT_REPO;
const branchOf = (env: BlogAdminEnv) => env.GITHUB_BRANCH || DEFAULT_BRANCH;

type Draft = {
  slug: string;
  meta: PostMeta;
  body: string;
  baseSha: string | null; // sha of the published file this draft started from
  updatedAt: number;
};

class HttpError extends Error {
  constructor(public status: number, message: string, public extra: Record<string, unknown> = {}) {
    super(message);
  }
}

// ── Auth ──────────────────────────────────────────────────────────────────────

async function sha256(text: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
}

async function tokenMatches(given: string, expected: string): Promise<boolean> {
  // Hash first so the comparison is constant-time and length-independent.
  const [a, b] = await Promise.all([sha256(given), sha256(expected)]);
  return (crypto.subtle as any).timingSafeEqual(a, b);
}

async function requireAdmin(c: AdminContext, next: Next) {
  if (c.req.method === "OPTIONS") return next();
  const expected = c.env.ADMIN_TOKEN;
  if (!expected || expected.length < 32) {
    // Fail closed: no (or a weak) token configured means no admin at all.
    return c.json({ ok: false, error: "admin is not configured (ADMIN_TOKEN missing)" }, 503);
  }
  const header = c.req.header("authorization") ?? "";
  const given = header.replace(/^Bearer\s+/i, "").trim();
  if (!given || !(await tokenMatches(given, expected))) {
    return c.json({ ok: false, error: "unauthorized" }, 401);
  }
  if (!c.env.GITHUB_TOKEN) {
    return c.json({ ok: false, error: "GITHUB_TOKEN is not configured" }, 503);
  }
  return next();
}

// ── GitHub ────────────────────────────────────────────────────────────────────

async function github(env: BlogAdminEnv, path: string, init: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "lassenordahl-api",
  };
  if (init.body) headers["Content-Type"] = "application/json";
  return fetch(`https://api.github.com${path}`, { ...init, headers });
}

async function githubError(res: Response, what: string): Promise<HttpError> {
  let detail = "";
  try {
    detail = ((await res.json()) as any)?.message ?? "";
  } catch {}
  return new HttpError(502, `GitHub ${what} failed (${res.status}${detail ? `: ${detail}` : ""})`);
}

function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function decodeBase64(b64: string): string {
  const binary = atob(b64.replace(/\s/g, ""));
  return new TextDecoder().decode(Uint8Array.from(binary, (ch) => ch.charCodeAt(0)));
}

const postPath = (slug: string) => `${POSTS_DIR}/${slug}.md`;

/** Every post file with its text, in one GraphQL round trip. */
async function listRepoPosts(env: BlogAdminEnv) {
  const [owner, name] = repoOf(env).split("/");
  const query = `query($owner: String!, $name: String!, $expr: String!) {
    repository(owner: $owner, name: $name) {
      object(expression: $expr) {
        ... on Tree { entries { name oid object { ... on Blob { text } } } }
      }
    }
  }`;
  const res = await github(env, "/graphql", {
    method: "POST",
    body: JSON.stringify({ query, variables: { owner, name, expr: `${branchOf(env)}:${POSTS_DIR}` } }),
  });
  if (!res.ok) throw await githubError(res, "post listing");
  const json = (await res.json()) as any;
  if (json.errors?.length) throw new HttpError(502, `GitHub post listing failed: ${json.errors[0].message}`);
  const entries: any[] = json.data?.repository?.object?.entries ?? [];
  return entries
    .filter((e) => typeof e.name === "string" && e.name.endsWith(".md"))
    .map((e) => {
      const slug = e.name.slice(0, -3);
      const { meta } = parsePost(e.object?.text ?? "");
      return { slug, sha: e.oid as string, meta };
    });
}

async function getRepoPost(env: BlogAdminEnv, slug: string) {
  const res = await github(
    env,
    `/repos/${repoOf(env)}/contents/${postPath(slug)}?ref=${encodeURIComponent(branchOf(env))}`,
  );
  if (res.status === 404) return null;
  if (!res.ok) throw await githubError(res, "post read");
  const file = (await res.json()) as any;
  const { meta, body } = parsePost(decodeBase64(file.content ?? ""));
  return { sha: file.sha as string, meta, body };
}

// ── Drafts (KV) ───────────────────────────────────────────────────────────────

async function getDraft(env: BlogAdminEnv, slug: string): Promise<Draft | null> {
  return env.DISPLAY_STATE.get<Draft>(DRAFT_PREFIX + slug, "json");
}

async function listDrafts(env: BlogAdminEnv) {
  const out: { slug: string; title: string; updatedAt: number; baseSha: string | null }[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.DISPLAY_STATE.list<{ title?: string; updatedAt?: number; baseSha?: string | null }>({
      prefix: DRAFT_PREFIX,
      cursor,
    });
    for (const key of page.keys) {
      out.push({
        slug: key.name.slice(DRAFT_PREFIX.length),
        title: key.metadata?.title ?? "",
        updatedAt: key.metadata?.updatedAt ?? 0,
        baseSha: key.metadata?.baseSha ?? null,
      });
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return out;
}

// ── Request helpers ───────────────────────────────────────────────────────────

function slugParam(c: AdminContext): string {
  const slug = c.req.param("slug") ?? "";
  if (!isValidSlug(slug)) throw new HttpError(400, "invalid slug: use lowercase letters, numbers, dots and dashes");
  return slug;
}

async function readPostBody(c: AdminContext) {
  const raw = await c.req.text();
  if (raw.length > MAX_POST_BYTES) throw new HttpError(413, "post is too large");
  let json: any;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new HttpError(400, "expected a JSON body");
  }
  const meta = normalizeMeta(json?.meta && typeof json.meta === "object" ? json.meta : {});
  const body = typeof json?.body === "string" ? json.body : "";
  const sha = typeof json?.sha === "string" && json.sha ? json.sha : null;
  return { meta, body, sha };
}

// ── Routes ────────────────────────────────────────────────────────────────────

export const blogAdmin = new Hono<{ Bindings: BlogAdminEnv }>();

blogAdmin.use("*", requireAdmin);

blogAdmin.onError((err, c) => {
  if (err instanceof HttpError) {
    return c.json({ ok: false, error: err.message, ...err.extra }, err.status as any);
  }
  console.log("blog admin error:", (err as any)?.stack || err);
  return c.json({ ok: false, error: "internal error" }, 500);
});

blogAdmin.get("/session", (c) => c.json({ ok: true, repo: repoOf(c.env), branch: branchOf(c.env) }));

blogAdmin.get("/posts", async (c) => {
  const [posts, drafts] = await Promise.all([listRepoPosts(c.env), listDrafts(c.env)]);
  const draftBySlug = new Map(drafts.map((d) => [d.slug, d]));
  const published = posts.map((p) => {
    const draft = draftBySlug.get(p.slug);
    draftBySlug.delete(p.slug);
    return {
      slug: p.slug,
      sha: p.sha,
      meta: p.meta,
      draft: draft ? { updatedAt: draft.updatedAt, title: draft.title, stale: draft.baseSha !== p.sha } : null,
    };
  });
  // Drafts with no published file yet: brand-new posts.
  const unpublished = [...draftBySlug.values()].map((d) => ({
    slug: d.slug,
    sha: null,
    meta: { title: d.title },
    draft: { updatedAt: d.updatedAt, title: d.title, stale: false },
  }));
  return c.json({ ok: true, posts: [...unpublished, ...published] });
});

blogAdmin.get("/posts/:slug", async (c) => {
  const slug = slugParam(c);
  const [published, draft] = await Promise.all([getRepoPost(c.env, slug), getDraft(c.env, slug)]);
  return c.json({ ok: true, slug, published, draft });
});

blogAdmin.put("/drafts/:slug", async (c) => {
  const slug = slugParam(c);
  const { meta, body, sha } = await readPostBody(c);
  const draft: Draft = { slug, meta, body, baseSha: sha, updatedAt: Date.now() };
  await c.env.DISPLAY_STATE.put(DRAFT_PREFIX + slug, JSON.stringify(draft), {
    metadata: { title: String(meta.title ?? "").slice(0, 200), updatedAt: draft.updatedAt, baseSha: sha },
  });
  return c.json({ ok: true, updatedAt: draft.updatedAt });
});

blogAdmin.delete("/drafts/:slug", async (c) => {
  const slug = slugParam(c);
  await c.env.DISPLAY_STATE.delete(DRAFT_PREFIX + slug);
  return c.json({ ok: true });
});

blogAdmin.post("/posts/:slug", async (c) => {
  const slug = slugParam(c);
  const { meta, body, sha } = await readPostBody(c);
  const errors = validatePost(slug, meta);
  if (errors.length) throw new HttpError(422, errors.join("; "), { errors });

  const title = String(meta.title);
  const res = await github(c.env, `/repos/${repoOf(c.env)}/contents/${postPath(slug)}`, {
    method: "PUT",
    body: JSON.stringify({
      message: `${sha ? "Update" : "Publish"} post "${title}"\n\nFrom lassenordahl.com/admin`,
      content: encodeBase64(serializePost(meta, body)),
      branch: branchOf(c.env),
      ...(sha ? { sha } : {}),
    }),
  });
  // 409: the file changed since it was opened. 422 without a sha: it already exists.
  if (res.status === 409 || (res.status === 422 && !sha)) {
    throw new HttpError(409, sha
      ? "this post changed on GitHub since you opened it; reload to get the latest version (your draft is kept)"
      : `a post with the slug "${slug}" already exists`, { conflict: true });
  }
  if (!res.ok) throw await githubError(res, "commit");
  const out = (await res.json()) as any;
  await c.env.DISPLAY_STATE.delete(DRAFT_PREFIX + slug);
  return c.json({
    ok: true,
    slug,
    sha: out.content?.sha,
    commit: { sha: out.commit?.sha, url: out.commit?.html_url },
  });
});

blogAdmin.delete("/posts/:slug", async (c) => {
  const slug = slugParam(c);
  const { sha } = await readPostBody(c);
  if (!sha) throw new HttpError(400, "sha is required to delete a post");
  const res = await github(c.env, `/repos/${repoOf(c.env)}/contents/${postPath(slug)}`, {
    method: "DELETE",
    body: JSON.stringify({
      message: `Delete post "${slug}"\n\nFrom lassenordahl.com/admin`,
      sha,
      branch: branchOf(c.env),
    }),
  });
  if (res.status === 409) throw new HttpError(409, "this post changed on GitHub since you opened it; reload first", { conflict: true });
  if (res.status === 404) throw new HttpError(404, "post not found");
  if (!res.ok) throw await githubError(res, "delete");
  const out = (await res.json()) as any;
  await c.env.DISPLAY_STATE.delete(DRAFT_PREFIX + slug);
  return c.json({ ok: true, commit: { sha: out.commit?.sha, url: out.commit?.html_url } });
});

blogAdmin.post("/images", (c) => storeImage(c.req.raw, c.env));

blogAdmin.get("/deploys/:commit", async (c) => {
  const commit = c.req.param("commit");
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new HttpError(400, "invalid commit sha");
  const res = await github(
    c.env,
    `/repos/${repoOf(c.env)}/actions/workflows/${DEPLOY_WORKFLOW}/runs?head_sha=${commit}&per_page=1`,
  );
  if (!res.ok) throw await githubError(res, "deploy status");
  const run = ((await res.json()) as any).workflow_runs?.[0];
  if (!run) return c.json({ ok: true, status: "pending", conclusion: null, url: null });
  return c.json({ ok: true, status: run.status, conclusion: run.conclusion, url: run.html_url });
});
