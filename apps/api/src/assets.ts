// Asset uploads — accepts an uploaded image, resizes + re-encodes it to WebP
// entirely in the Worker (jSquash / WASM), and stores it in R2. Metadata (the
// capture time + dimensions) lives on the R2 object itself, so no database is
// needed — the listing endpoint just reads the bucket.
//
// Endpoints (wired up in index.ts):
//   POST   /assets           auth'd upload; raw image body -> WebP in R2
//   GET    /assets           public JSON list, newest first
//   GET    /assets/img/:name public WebP bytes for one image
//   DELETE /assets/img/:name auth'd delete
//
// An iPhone Shortcut posts a JPEG (Shortcuts converts HEIC -> JPEG before the
// request), so we only need JPEG + PNG decoders on the way in.

import decodeJpeg, { init as initJpeg } from "@jsquash/jpeg/decode";
import decodePng, { init as initPng } from "@jsquash/png/decode";
import encodeWebp, { init as initWebp } from "@jsquash/webp/encode";
import resize, { initResize } from "@jsquash/resize";

// jSquash's resize builds `new ImageData(...)`, which the Workers runtime does
// not provide. A minimal structural polyfill is enough — jSquash only reads
// .data / .width / .height.
if (typeof (globalThis as any).ImageData === "undefined") {
  (globalThis as any).ImageData = class {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    colorSpace = "srgb";
    constructor(data: Uint8ClampedArray, width: number, height = 0) {
      this.data = data;
      this.width = width;
      this.height = height;
    }
  };
}

// Wrangler bundles these `.wasm` imports as `WebAssembly.Module` instances.
// Workers support Wasm SIMD, so we use the SIMD WebP encoder.
// @ts-expect-error - wasm import, no type decl
import WEBP_ENC_WASM from "@jsquash/webp/codec/enc/webp_enc_simd.wasm";
// @ts-expect-error
import JPEG_DEC_WASM from "@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm";
// @ts-expect-error
import PNG_DEC_WASM from "@jsquash/png/codec/pkg/squoosh_png_bg.wasm";
// @ts-expect-error
import RESIZE_WASM from "@jsquash/resize/lib/resize/pkg/squoosh_resize_bg.wasm";

// The bucket is dedicated to these images and served publicly at a custom
// domain, so objects live at the bucket root (no key prefix) for clean URLs
// like https://assets.lassenordahl.com/<name>.webp. We identify "our" objects
// by the .webp extension when listing.
const PUBLIC_BASE = "https://assets.lassenordahl.com";
const MAX_EDGE = 1600; // longest side, px — plenty for a web canvas, keeps CPU low
const WEBP_QUALITY = 80;
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB guard on the raw upload

// Each codec's WASM is instantiated at most once, and only when an upload
// actually needs it — a JPEG upload never loads the PNG decoder. Eagerly
// instantiating all four in one request was enough extra cold-start CPU to
// occasionally trip the limit.
let jpegReady: Promise<unknown> | null = null;
let pngReady: Promise<unknown> | null = null;
let webpReady: Promise<unknown> | null = null;
let resizeReady: Promise<unknown> | null = null;
const initJpegOnce = () => (jpegReady ??= initJpeg(JPEG_DEC_WASM));
const initPngOnce = () => (pngReady ??= initPng(PNG_DEC_WASM));
const initWebpOnce = () => (webpReady ??= initWebp(WEBP_ENC_WASM));
const initResizeOnce = () => (resizeReady ??= initResize(RESIZE_WASM));

type ImageDataLike = { data: Uint8ClampedArray; width: number; height: number };

async function decode(bytes: ArrayBuffer, contentType: string): Promise<ImageDataLike> {
  if (contentType.includes("png")) {
    await initPngOnce();
    return (await decodePng(bytes)) as ImageDataLike;
  }
  // Default to JPEG for image/jpeg and anything unrecognized.
  await initJpegOnce();
  return (await decodeJpeg(bytes)) as ImageDataLike;
}

function targetSize(w: number, h: number): { width: number; height: number } {
  const longest = Math.max(w, h);
  if (longest <= MAX_EDGE) return { width: w, height: h };
  const scale = MAX_EDGE / longest;
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}

/** Decode -> (optionally) downscale -> encode WebP. Returns the WebP bytes + dims. */
async function toWebp(
  bytes: ArrayBuffer,
  contentType: string,
): Promise<{ webp: ArrayBuffer; width: number; height: number }> {
  let image = await decode(bytes, contentType);
  const { width, height } = targetSize(image.width, image.height);
  if (width !== image.width || height !== image.height) {
    await initResizeOnce();
    // 'triangle' is the cheapest kernel — plenty for downscaling to a web canvas
    // and far less CPU than the default lanczos3.
    image = (await resize(image as any, { width, height, method: "triangle" })) as ImageDataLike;
  }
  await initWebpOnce();
  const webp = await encodeWebp(image as any, { quality: WEBP_QUALITY });
  return { webp, width: image.width, height: image.height };
}

function isAuthed(req: Request, token: string | undefined): boolean {
  if (!token) return false; // fail closed if the secret isn't configured
  const header = req.headers.get("authorization") ?? "";
  const bearer = header.replace(/^Bearer\s+/i, "").trim();
  return bearer.length > 0 && bearer === token;
}

function randomId(): string {
  return crypto.randomUUID().slice(0, 8);
}

export type AssetsEnv = {
  ASSETS: R2Bucket;
  ASSETS_TOKEN?: string;
  ASSETS_PUBLIC_BASE?: string; // overrides PUBLIC_BASE (e.g. for local dev)
};

/** Public CDN URL for an object — served straight from R2 via the custom
 *  domain, so image loads never invoke this Worker. */
function publicUrl(env: AssetsEnv, name: string): string {
  const base = (env.ASSETS_PUBLIC_BASE || PUBLIC_BASE).replace(/\/$/, "");
  return `${base}/${name}`;
}

/** POST /assets — auth'd. Body is the raw image bytes. */
export async function handleUpload(req: Request, env: AssetsEnv): Promise<Response> {
  if (!isAuthed(req, env.ASSETS_TOKEN)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const contentType = req.headers.get("content-type") ?? "image/jpeg";
  const bytes = await req.arrayBuffer();
  if (bytes.byteLength === 0) {
    return Response.json({ ok: false, error: "empty body" }, { status: 400 });
  }
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    return Response.json({ ok: false, error: "too large" }, { status: 413 });
  }

  let out: { webp: ArrayBuffer; width: number; height: number };
  try {
    out = await toWebp(bytes, contentType);
  } catch (e: any) {
    console.log("assets encode err:", e?.stack || e);
    return Response.json({ ok: false, error: "could not decode image" }, { status: 422 });
  }

  const createdAt = Date.now();
  // Zero-padded timestamp keeps keys lexically sorted by time.
  const name = `${String(createdAt).padStart(15, "0")}-${randomId()}.webp`;
  await env.ASSETS.put(name, out.webp, {
    httpMetadata: { contentType: "image/webp", cacheControl: "public, max-age=31536000, immutable" },
    customMetadata: {
      createdAt: String(createdAt),
      width: String(out.width),
      height: String(out.height),
    },
  });

  return Response.json({
    ok: true,
    name,
    url: publicUrl(env, name),
    createdAt,
    width: out.width,
    height: out.height,
    bytes: out.webp.byteLength,
  });
}

/** GET /assets — public listing, newest first. */
export async function handleList(env: AssetsEnv): Promise<Response> {
  const listed = await env.ASSETS.list({ include: ["customMetadata"] });
  const items = listed.objects
    .filter((o) => o.key.endsWith(".webp"))
    .map((o) => {
      const name = o.key;
      const createdAt = Number(o.customMetadata?.createdAt) || o.uploaded.getTime();
      return {
        name,
        url: publicUrl(env, name),
        createdAt,
        width: Number(o.customMetadata?.width) || null,
        height: Number(o.customMetadata?.height) || null,
        bytes: o.size,
      };
    })
    .sort((a, b) => b.createdAt - a.createdAt);
  return Response.json({ ok: true, count: items.length, items });
}

/** GET /assets/img/:name — public WebP bytes. Fallback path; production reads
 *  go straight to the R2 custom domain and never invoke this Worker. */
export async function handleImage(name: string, env: AssetsEnv): Promise<Response> {
  if (!/^[\w.\-]+\.webp$/.test(name)) {
    return new Response("bad name", { status: 400 });
  }
  const obj = await env.ASSETS.get(name);
  if (!obj) return new Response("not found", { status: 404 });
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  return new Response(obj.body, { headers });
}

/** DELETE /assets/img/:name — auth'd. */
export async function handleDelete(req: Request, name: string, env: AssetsEnv): Promise<Response> {
  if (!isAuthed(req, env.ASSETS_TOKEN)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!/^[\w.\-]+\.webp$/.test(name)) {
    return Response.json({ ok: false, error: "bad name" }, { status: 400 });
  }
  await env.ASSETS.delete(name);
  return Response.json({ ok: true });
}
