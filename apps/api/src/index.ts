import { Hono } from "hono";
import { cors } from "hono/cors";

type Bindings = {
  DISPLAY_STATE: KVNamespace;
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
// Pixel grid is WIDTH=16, HEIGHT=7 = 112 pixels stored as flat [[r,g,b], ...] array.

const PIXEL_COUNT = 16 * 7;
const DEFAULT_PIXELS = Array.from({ length: PIXEL_COUNT }, () => [0, 0, 0]);

app.get("/pixels", async (c) => {
  const stored = await c.env.DISPLAY_STATE.get("pixels");
  if (stored) {
    return c.json({ pixels: JSON.parse(stored) });
  }
  return c.json({ pixels: DEFAULT_PIXELS });
});

// POST /pixels  body: { x: number, y: number, r: number, g: number, b: number }
// Sets a single pixel. x: 0-15, y: 0-6.
app.post("/pixels", async (c) => {
  const body = await c.req.json();
  const { x, y, r, g, b } = body;

  if (x < 0 || x > 15 || y < 0 || y > 6) {
    return c.json({ ok: false, error: "out of bounds" }, 400);
  }

  const stored = await c.env.DISPLAY_STATE.get("pixels");
  const pixels: [number, number, number][] = stored
    ? JSON.parse(stored)
    : DEFAULT_PIXELS.map((p) => [...p] as [number, number, number]);

  pixels[y * 16 + x] = [
    Math.max(0, Math.min(255, r)),
    Math.max(0, Math.min(255, g)),
    Math.max(0, Math.min(255, b)),
  ];

  await c.env.DISPLAY_STATE.put("pixels", JSON.stringify(pixels));
  return c.json({ ok: true });
});

// DELETE /pixels — clear entire grid to black
app.delete("/pixels", async (c) => {
  await c.env.DISPLAY_STATE.put("pixels", JSON.stringify(DEFAULT_PIXELS));
  return c.json({ ok: true });
});

export default app;
