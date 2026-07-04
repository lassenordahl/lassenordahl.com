---
name: cockroach-design
description: Context for the "Cockroach Labs Design" blog post — a speculative brand redesign using cellular-automata canvases. Use when iterating on the post's copy, adding/tuning Three.js blog-canvas sketches (SmoothLife and future CA sims), or working the shared shader palette. Load before touching apps/web/src/blog/sketches/, canvases.js, or content/blog/cockroach-labs-design.md.
---

# Cockroach Labs Design

## The idea
The post `apps/web/content/blog/cockroach-labs-design.md` is a **speculative brand redesign** for Cockroach Labs' marketing site. Lasse worked on the growth team there and always felt the flat solid-color canvases didn't _feel_ like CockroachDB. The thesis: **cellular automata** (inspired by Arsiliath's web compute-shader CA posts) are the right visual metaphor because CockroachDB is about **iterative, organic growth that resizes to fit any need** — so the visuals should grow and self-organize too.

Tone of the writing: personal, a little wistful (he didn't build it while there and regrets not shipping without asking). Keep that voice — first person, understated, no marketing-speak.

## The brand palette (load-bearing)
Blue → purple → violet → pink → magenta → teal. Every sketch reads as a set because they share this exact ramp.

| Hex | Role |
|-----|------|
| `#0037A5` | deep blue (t=0) |
| `#6933FF` | purple |
| `#8D42FF` | violet |
| `#EC4899` | pink |
| `#FF70FF` | magenta |
| `#00FCED` | teal (t=1) |

It lives in **two** places that must stay in sync:
- The `.palette` swatches (inline HTML) in the markdown post.
- `GLSL.palette` in `apps/web/src/blog/sketches/kit.js` (the `palette(float t)` function).
Change one, change both.

## How the canvas system works
Markdown drops a placeholder: `<div class="blog-canvas" data-sketch="smoothlife"></div>`.

- **`apps/web/src/blog/canvases.js`** — the engine/manager. Owns renderer, resize, animation loop, teardown. **Don't change this to add a sketch.**
- **`apps/web/src/blog/sketches/index.js`** — the registry. One line per sketch keyed by `data-sketch`.
- **`apps/web/src/blog/sketches/kit.js`** — shared substrate: `FULLSCREEN_VERT`, `createStage`, `createPingPong`, and `GLSL` chunks (`noise`, `palette`, `bicubic`).
- **`apps/web/src/blog/sketches/spinning-cube.js`** — minimal template (mesh + `update(elapsed)`).
- **`apps/web/src/blog/sketches/smoothlife.js`** — the reference CA example (ping-pong shader sim owning its own render loop).

### Adding a sketch
1. Write `sketches/my-sketch.js` exporting a factory `({ THREE, scene, camera, renderer, sizes }) => …`. Return either a bare `update(elapsed)` fn (manager renders) or `{ update?, render?, dispose? }` (you own multi-pass rendering — needed for CA sims).
2. Add one import + line to `SKETCHES` in `index.js`.
3. Drop `<div class="blog-canvas" data-sketch="my-sketch">` in the post.
Build on `kit.js` — only write what's actually new (the shader rule + wiring).

## Cellular automata notes
- **SmoothLife** (Rafler 2011) is the current sketch: a continuous-domain generalization of Conway's Life. Scalar field `f ∈ [0,1]` in a float render target; each step samples an inner disk (`m`) + outer annulus (`n`), feeds them through linearized birth/death intervals, and euler-integrates toward the target. That continuity is what makes it read as smooth, fluid organisms holding mid-tones instead of snapping to 0/1 — "more organic gradients than translated 2D meshes viewed at an angle," per the post.
- Load-bearing constants in `SIM_FRAG`: `ra = 3 * ri` (outer = 3× inner radius), birth/survival windows (`b1,b2,d1,d2`), `alphaN` (interval softness). `uDt` is the main time knob — lower = slower/smoother. It warms up at `dt=0.15` for 30 steps so first paint is already organized, then drops to `LIVE_DT = 0.05`.
- World is **toroidal** (`RepeatWrapping`) so the neighborhood wraps at edges.
- Sim runs high-res (`720×540`) then **bicubic-upscales** on display so there are no visible texels; display gamma (`pow(v,0.7)`) spreads mid-tones and fades to black where empty.

Good candidates for future sketches in this same brand language: reaction-diffusion (Gray-Scott), Lenia (SmoothLife's successor, more creature-like), or a growth/aggregation sim (DLA) — all self-organizing, all can run through `GLSL.palette` to stay on-brand.

## How Lasse likes to iterate
- Visuals should feel **subtle and organic**, not loud — the CA is a texture/mood, not a logo.
- Everything routes through the shared palette so the set reads as one design language.
- Prefer small, self-contained sketches on top of `kit.js` over touching the manager.
- When tuning a sim, the fastest knobs are `uDt`, the birth/death windows, and the seed noise scale — mention what you changed and why.
