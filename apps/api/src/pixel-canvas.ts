import { DurableObject } from "cloudflare:workers";

const WIDTH = 16;
const HEIGHT = 7;
const PIXEL_COUNT = WIDTH * HEIGHT;
const MAX_SAVES = 50;

type Pixel = [number, number, number];
type Save = { id: string; createdAt: number; pixels: Pixel[] };

type ClientMsg =
  | { type: "paint"; x: number; y: number; r: number; g: number; b: number }
  | { type: "clear" }
  | { type: "restore"; id: string }
  | { type: "delete_save"; id: string };

type ServerMsg =
  | { type: "snapshot"; pixels: Pixel[]; saves: Save[] }
  | { type: "paint"; x: number; y: number; r: number; g: number; b: number }
  | { type: "clear" }
  | { type: "replace"; pixels: Pixel[] }
  | { type: "saved"; save: Save }
  | { type: "save_deleted"; id: string };

const blankPixels = (): Pixel[] =>
  Array.from({ length: PIXEL_COUNT }, () => [0, 0, 0] as Pixel);

export class PixelCanvas extends DurableObject {
  private pixels: Pixel[] = blankPixels();
  private saves: Save[] = [];
  private hydrated = false;

  private async hydrate() {
    if (this.hydrated) return;
    const stored = await this.ctx.storage.get<Pixel[]>("pixels");
    if (stored && stored.length === PIXEL_COUNT) this.pixels = stored;
    const storedSaves = await this.ctx.storage.get<Save[]>("saves");
    if (Array.isArray(storedSaves)) this.saves = storedSaves;
    this.hydrated = true;
  }

  private async applySave(): Promise<Save> {
    const save: Save = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: Date.now(),
      pixels: this.pixels.map((p) => [p[0], p[1], p[2]] as Pixel),
    };
    this.saves.unshift(save);
    if (this.saves.length > MAX_SAVES) this.saves.length = MAX_SAVES;
    await this.ctx.storage.put("saves", this.saves);
    this.broadcast({ type: "saved", save });
    return save;
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

  private async applyRestore(id: string): Promise<boolean> {
    const save = this.saves.find((s) => s.id === id);
    if (!save || save.pixels.length !== PIXEL_COUNT) return false;
    this.pixels = save.pixels.map((p) => [p[0], p[1], p[2]] as Pixel);
    this.broadcast({ type: "replace", pixels: this.pixels });
    await this.ctx.storage.put("pixels", this.pixels);
    return true;
  }

  private async applyDeleteSave(id: string): Promise<boolean> {
    const idx = this.saves.findIndex((s) => s.id === id);
    if (idx === -1) return false;
    this.saves.splice(idx, 1);
    await this.ctx.storage.put("saves", this.saves);
    this.broadcast({ type: "save_deleted", id });
    return true;
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
      server.send(JSON.stringify({ type: "snapshot", pixels: this.pixels, saves: this.saves } satisfies ServerMsg));
      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname.endsWith("/saves")) {
      if (req.method === "GET") {
        return Response.json({ saves: this.saves });
      }
      if (req.method === "POST") {
        const save = await this.applySave();
        return Response.json({ ok: true, save });
      }
      if (req.method === "DELETE") {
        const body = (await req.json().catch(() => ({}))) as { id?: string };
        if (!body.id) return Response.json({ ok: false, error: "missing id" }, { status: 400 });
        const ok = await this.applyDeleteSave(body.id);
        if (!ok) return Response.json({ ok: false, error: "not found" }, { status: 404 });
        return Response.json({ ok: true });
      }
      return new Response("method not allowed", { status: 405 });
    }

    if (url.pathname.endsWith("/restore") && req.method === "POST") {
      const body = (await req.json()) as { id?: string };
      if (!body.id) return Response.json({ ok: false, error: "missing id" }, { status: 400 });
      const ok = await this.applyRestore(body.id);
      if (!ok) return Response.json({ ok: false, error: "not found" }, { status: 404 });
      return Response.json({ ok: true });
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
    } else if (msg.type === "restore") {
      await this.applyRestore(msg.id);
    } else if (msg.type === "delete_save") {
      await this.applyDeleteSave(msg.id);
    }
  }

  async webSocketClose(ws: WebSocket, code: number) {
    try {
      ws.close(code, "closing");
    } catch {}
  }
}
