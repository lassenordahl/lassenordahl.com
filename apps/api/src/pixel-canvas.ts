import { DurableObject } from "cloudflare:workers";

const WIDTH = 16;
const HEIGHT = 7;
const PIXEL_COUNT = WIDTH * HEIGHT;

type Pixel = [number, number, number];

type ClientMsg =
  | { type: "paint"; x: number; y: number; r: number; g: number; b: number }
  | { type: "clear" };

type ServerMsg =
  | { type: "snapshot"; pixels: Pixel[] }
  | { type: "paint"; x: number; y: number; r: number; g: number; b: number }
  | { type: "clear" };

const blankPixels = (): Pixel[] =>
  Array.from({ length: PIXEL_COUNT }, () => [0, 0, 0] as Pixel);

export class PixelCanvas extends DurableObject {
  private pixels: Pixel[] = blankPixels();
  private hydrated = false;

  private async hydrate() {
    if (this.hydrated) return;
    const stored = await this.ctx.storage.get<Pixel[]>("pixels");
    if (stored && stored.length === PIXEL_COUNT) this.pixels = stored;
    this.hydrated = true;
  }

  private broadcast(msg: ServerMsg) {
    const data = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(data);
      } catch {}
    }
  }

  private async applyPaint(x: number, y: number, r: number, g: number, b: number) {
    if (!Number.isInteger(x) || !Number.isInteger(y)) return;
    if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) return;
    const rr = Math.max(0, Math.min(255, r | 0));
    const gg = Math.max(0, Math.min(255, g | 0));
    const bb = Math.max(0, Math.min(255, b | 0));
    this.pixels[y * WIDTH + x] = [rr, gg, bb];
    this.broadcast({ type: "paint", x, y, r: rr, g: gg, b: bb });
    await this.ctx.storage.put("pixels", this.pixels);
  }

  private async applyClear() {
    this.pixels = blankPixels();
    this.broadcast({ type: "clear" });
    await this.ctx.storage.put("pixels", this.pixels);
  }

  async fetch(req: Request): Promise<Response> {
    await this.hydrate();
    const url = new URL(req.url);

    if (url.pathname.endsWith("/ws")) {
      if (req.headers.get("Upgrade") !== "websocket") {
        return new Response("expected websocket upgrade", { status: 426 });
      }
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
      this.ctx.acceptWebSocket(server);
      server.send(JSON.stringify({ type: "snapshot", pixels: this.pixels } satisfies ServerMsg));
      return new Response(null, { status: 101, webSocket: client });
    }

    if (req.method === "GET") {
      return Response.json({ pixels: this.pixels });
    }

    if (req.method === "POST") {
      const body = (await req.json()) as { x: number; y: number; r: number; g: number; b: number };
      await this.applyPaint(body.x, body.y, body.r, body.g, body.b);
      return Response.json({ ok: true });
    }

    if (req.method === "DELETE") {
      await this.applyClear();
      return Response.json({ ok: true });
    }

    return new Response("method not allowed", { status: 405 });
  }

  async webSocketMessage(_ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== "string") return;
    await this.hydrate();
    let msg: ClientMsg;
    try {
      msg = JSON.parse(message) as ClientMsg;
    } catch {
      return;
    }
    if (msg.type === "paint") {
      await this.applyPaint(msg.x, msg.y, msg.r, msg.g, msg.b);
    } else if (msg.type === "clear") {
      await this.applyClear();
    }
  }

  async webSocketClose(ws: WebSocket, code: number) {
    try {
      ws.close(code, "closing");
    } catch {}
  }
}
