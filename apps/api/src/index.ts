import { Hono } from "hono";
import { cors } from "hono/cors";
import { getTrainsText, DEFAULT_TRAINS_CONFIG, type TrainsConfig } from "./trains";

export { PixelCanvas } from "./pixel-canvas";

type Bindings = {
  DISPLAY_STATE: KVNamespace;
  PIXEL_CANVAS: DurableObjectNamespace;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use("*", cors({
  origin: (origin) => {
    const allowed = [
      "https://lassenordahl.com",
      "https://lassenordahl-web.pages.dev",
      "http://localhost:8080",
    ];
    if (!origin) return allowed[0];
    if (allowed.includes(origin)) return origin;
    // Allow Cloudflare Pages branch preview URLs
    if (origin.endsWith(".lassenordahl-web.pages.dev")) return origin;
    return allowed[0];
  },
}));

// ── Text mode ──────────────────────────────────────────────────────────────────
app.get("/display", async (c) => {
  const stored = await c.env.DISPLAY_STATE.get("state");
  if (stored) {
    return c.json(JSON.parse(stored));
  }
  return c.json({ mode: "text", text: "Hello World" });
});

app.post("/display", async (c) => {
  const body = await c.req.json();
  const state = { mode: "text", text: body.text ?? "" };
  await c.env.DISPLAY_STATE.put("state", JSON.stringify(state));
  return c.json({ ok: true });
});

// ── Trains mode ────────────────────────────────────────────────────────────────
// Config (address + feeds) is user-editable at lassenordahl.com/trains and
// stored in KV. KV-cached arrivals for 60s to avoid hammering MTA feeds.
async function loadTrainsConfig(kv: KVNamespace): Promise<TrainsConfig> {
  const raw = await kv.get("trains_config");
  if (!raw) return DEFAULT_TRAINS_CONFIG;
  try {
    const parsed = JSON.parse(raw) as TrainsConfig;
    if (parsed && Array.isArray(parsed.feeds)) return parsed;
  } catch {}
  return DEFAULT_TRAINS_CONFIG;
}

app.get("/trains", async (c) => {
  const cached = await c.env.DISPLAY_STATE.get("trains");
  if (cached) return c.json(JSON.parse(cached));
  try {
    const config = await loadTrainsConfig(c.env.DISPLAY_STATE);
    const text = await getTrainsText(config);
    const state = { text };
    c.executionCtx.waitUntil(
      c.env.DISPLAY_STATE.put("trains", JSON.stringify(state), { expirationTtl: 60 })
    );
    return c.json(state);
  } catch (e: any) {
    console.log("trains err:", e);
    return c.json({ text: "TRAINS ERR" }, 200);
  }
});

app.get("/trains/config", async (c) => {
  const config = await loadTrainsConfig(c.env.DISPLAY_STATE);
  return c.json({ config });
});

app.post("/trains/config", async (c) => {
  const body = (await c.req.json().catch(() => null)) as TrainsConfig | null;
  if (!body || !Array.isArray(body.feeds)) {
    return c.json({ ok: false, error: "invalid config" }, 400);
  }
  const sanitized: TrainsConfig = {
    address: typeof body.address === "string" ? body.address.slice(0, 200) : "",
    feeds: body.feeds
      .filter((f) => f && typeof f.line === "string" && Array.isArray(f.stopIds))
      .map((f) => ({
        line: f.line.toUpperCase().slice(0, 2),
        stopIds: f.stopIds
          .filter((s) => typeof s === "string")
          .map((s) => s.toUpperCase().slice(0, 8)),
      }))
      .filter((f) => f.line.length > 0 && f.stopIds.length > 0),
  };
  await c.env.DISPLAY_STATE.put("trains_config", JSON.stringify(sanitized));
  // Invalidate cached arrivals so the new config shows up on the next poll.
  await c.env.DISPLAY_STATE.delete("trains");
  return c.json({ ok: true, config: sanitized });
});

// ── Pixels mode ────────────────────────────────────────────────────────────────
// State lives in the PixelCanvas Durable Object — single instance keyed by "main".
// HTTP GET/POST/DELETE /pixels → DO fetch. WebSocket at /pixels/ws for real-time
// broadcast; HTTP POST still works for non-WS clients (e.g. Pico if we ever write
// from it). The DO serializes writes so fast drags no longer clobber each other.
app.all("/pixels", async (c) => {
  const stub = c.env.PIXEL_CANVAS.get(c.env.PIXEL_CANVAS.idFromName("main"));
  return stub.fetch(c.req.raw);
});

app.all("/pixels/saves", async (c) => {
  const stub = c.env.PIXEL_CANVAS.get(c.env.PIXEL_CANVAS.idFromName("main"));
  return stub.fetch(c.req.raw);
});

app.all("/pixels/restore", async (c) => {
  const stub = c.env.PIXEL_CANVAS.get(c.env.PIXEL_CANVAS.idFromName("main"));
  return stub.fetch(c.req.raw);
});

app.get("/pixels/ws", async (c) => {
  const stub = c.env.PIXEL_CANVAS.get(c.env.PIXEL_CANVAS.idFromName("main"));
  return stub.fetch(c.req.raw);
});

export default app;
