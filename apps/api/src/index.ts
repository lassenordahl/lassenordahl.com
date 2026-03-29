import { Hono } from "hono";
import { cors } from "hono/cors";

type Bindings = {
  DB: D1Database;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use("*", cors({ origin: ["https://lassenordahl.com", "http://localhost:8080"] }));

// Display state — Pico polls this to know what to show
app.get("/display", async (c) => {
  // TODO: fetch current display state from D1
  return c.json({ mode: "idle", data: null });
});

app.post("/display", async (c) => {
  const body = await c.req.json();
  // TODO: persist display state to D1
  return c.json({ ok: true });
});

export default app;
