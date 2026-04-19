import { Hono } from "hono";
import { cors } from "hono/cors";

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
// TODO: Fetch real MTA L/G arrival times and format as scrollable text string.
// Suggested format: "L 3m  G 8m  L 12m"
// MTA feeds: https://api.mta.info (requires API key stored in Worker secret)
app.get("/trains", async (c) => {
  const stored = await c.env.DISPLAY_STATE.get("trains");
  if (stored) {
    return c.json(JSON.parse(stored));
  }
  return c.json({ text: "No trains configured" });
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

app.get("/pixels/ws", async (c) => {
  const stub = c.env.PIXEL_CANVAS.get(c.env.PIXEL_CANVAS.idFromName("main"));
  return stub.fetch(c.req.raw);
});

export default app;
