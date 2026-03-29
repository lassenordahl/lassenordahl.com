import { Hono } from "hono";
import { cors } from "hono/cors";

type Bindings = {
  DISPLAY_STATE: KVNamespace;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use("*", cors({ origin: ["https://lassenordahl.com", "http://localhost:8080"] }));

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

export default app;
