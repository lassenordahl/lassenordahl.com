// Three.js canvases embedded inside blog posts.
//
// Markdown posts can drop a placeholder anywhere in their content:
//   <div class="blog-canvas" data-sketch="spinning-cube"></div>
//
// After the post renders, `mountBlogCanvases(container)` scans for those
// placeholders, spins up a Three.js sketch for each, and tracks them so they
// can be torn down when navigating away (`unmountBlogCanvases()`).
//
// Each sketch is a small factory: it receives a shared rendering context and
// returns either an `update(elapsed)` callback (simple sketches that let the
// manager render) or an object `{ update?, render?, dispose? }` for sketches
// that need to own their render loop (e.g. ping-pong framebuffer sims). The
// manager owns renderer creation, resize handling, the animation loop, and
// teardown. This file is the engine and shouldn't need to change as sketches
// are added — the registry and shared helpers live in ./sketches/.

import * as THREE from "three";
import { SKETCHES } from "./sketches/index.js";

// --- Manager ---------------------------------------------------------------

// Active sketch instances, so we can dispose them on navigation.
let mounted = [];

// Build a dense slider panel from a sketch's `controls` descriptor (see
// smoothlife.js). Each control is { label, min, max, step, get(), set(v), info }.
// Three aligned columns: label + lucide (i) tooltip · native range · live value.
// Inserted directly after the canvas host so it sits underneath the canvas.
// Returns the panel element.
function buildControls(host, controls) {
  const panel = document.createElement("div");
  panel.className = "bc-panel";

  // Track each row so presets can push new values back into the sliders.
  const rows = [];

  controls.forEach((c) => {
    const label = document.createElement("div");
    label.className = "bc-label";
    const name = document.createElement("span");
    name.textContent = c.label;
    label.appendChild(name);
    if (c.info) {
      // lucide converts the <i data-lucide> into an <svg>; tooltip is a sibling.
      const wrap = document.createElement("span");
      wrap.className = "bc-info-wrap";
      const icon = document.createElement("i");
      icon.setAttribute("data-lucide", "info");
      icon.className = "bc-info";
      const tip = document.createElement("span");
      tip.className = "bc-tip";
      tip.textContent = c.info;
      wrap.append(icon, tip);
      label.appendChild(wrap);
    }

    const input = document.createElement("input");
    input.type = "range";
    input.min = c.min;
    input.max = c.max;
    input.step = c.step;
    input.value = c.get();

    const val = document.createElement("span");
    val.className = "bc-val";
    const fmt = (v) => Number(v).toFixed(String(c.step).includes(".") ? 3 : 0);
    val.textContent = fmt(c.get());

    input.addEventListener("input", () => {
      const v = parseFloat(input.value);
      c.set(v);
      val.textContent = fmt(v);
    });

    panel.append(label, input, val);
    rows.push({ c, input, val, fmt });
  });

  host.insertAdjacentElement("afterend", panel);

  // Pull each slider back in line with its control's current value — called
  // after a preset applies, so the sliders reflect the new state.
  const sync = () => {
    rows.forEach(({ c, input, val, fmt }) => {
      const v = c.get();
      input.value = v;
      val.textContent = fmt(v);
    });
  };

  return { panel, sync };
}

// A row of effect-toggle buttons — like presets, but each is an independent
// on/off that stays lit (white) while active, and several can be on at once.
// Used for stackable post-process shader effects (dithering, halftone, …). Each
// toggle is { label, get(): bool, set(on: bool) }; clicking flips it and repaints
// the button. Add more toggles to a sketch's `toggles` array to grow the row.
function buildToggles(host, toggles) {
  const bar = document.createElement("div");
  bar.className = "bc-toggles";

  toggles.forEach((t) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "bc-toggle";
    btn.textContent = t.label;
    const paint = () => btn.classList.toggle("is-on", !!t.get());
    paint();
    btn.addEventListener("click", () => {
      t.set(!t.get());
      paint();
    });
    bar.appendChild(btn);
  });

  host.insertAdjacentElement("afterend", bar);
  return bar;
}

// A row of preset buttons rendered above the slider panel. Each preset is
// { label, apply() }; clicking it applies the preset then re-syncs the sliders.
function buildPresets(host, presets, sync) {
  const bar = document.createElement("div");
  bar.className = "bc-presets";

  presets.forEach((p) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "bc-preset";
    btn.textContent = p.label;
    btn.addEventListener("click", () => {
      p.apply();
      if (sync) sync();
    });
    bar.appendChild(btn);
  });

  // Insert directly after the host so it sits above the slider panel.
  host.insertAdjacentElement("afterend", bar);
  return bar;
}

function createSketch(host) {
  const name = host.dataset.sketch || "spinning-cube";
  const factory = SKETCHES[name];
  if (!factory) {
    console.warn(`[blog-canvas] unknown sketch "${name}"`);
    return null;
  }

  // Build the canvas inside the host placeholder.
  const canvas = document.createElement("canvas");
  canvas.className = "blog-canvas-gl";
  host.appendChild(canvas);

  const sizes = {
    width: host.clientWidth || 1,
    height: host.clientHeight || 1,
  };

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    50,
    sizes.width / sizes.height,
    0.1,
    100
  );
  scene.add(camera);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setClearColor(0x000000, 1);
  renderer.setSize(sizes.width, sizes.height, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // A sketch may return a bare update fn, or an object that takes over
  // rendering / disposal for multi-pass work.
  const api = factory({ THREE, scene, camera, renderer, sizes }) || {};
  const isFn = typeof api === "function";
  const update = isFn ? api : api.update;
  const customRender = isFn ? null : api.render;
  const customDispose = isFn ? null : api.dispose;

  // Optional live-tuning slider panel, if the sketch exposes `controls`.
  const controlsApi =
    !isFn && api.controls ? buildControls(host, api.controls) : null;
  // Optional effect-toggle bar, if the sketch exposes `toggles`. Built before
  // presets so the stack reads presets · toggles · sliders, top to bottom.
  const togglesBar =
    !isFn && api.toggles ? buildToggles(host, api.toggles) : null;
  // Optional preset buttons, if the sketch exposes `presets`. Inserted after the
  // panel build so it lands between the canvas and the sliders.
  const presetsBar =
    !isFn && api.presets
      ? buildPresets(host, api.presets, controlsApi && controlsApi.sync)
      : null;

  const clock = new THREE.Clock();
  let frameId = null;

  const tick = () => {
    const elapsed = clock.getElapsedTime();
    if (typeof update === "function") update(elapsed);
    if (customRender) customRender(elapsed);
    else renderer.render(scene, camera);
    frameId = window.requestAnimationFrame(tick);
  };
  const start = () => {
    if (frameId === null) frameId = window.requestAnimationFrame(tick);
  };
  const stop = () => {
    if (frameId !== null) {
      window.cancelAnimationFrame(frameId);
      frameId = null;
    }
  };

  // Pause the render loop entirely while the canvas is scrolled out of view —
  // no GPU work happens for off-screen sketches. Fires immediately on observe
  // with the initial intersection state, so `start()` below is just a fallback.
  const visibility = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) start();
      else stop();
    }
  });
  visibility.observe(host);
  start();

  // Keep the drawing buffer in sync with the (responsive) host size.
  const resizeObserver = new ResizeObserver(() => {
    const width = host.clientWidth || 1;
    const height = host.clientHeight || 1;
    sizes.width = width;
    sizes.height = height;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  });
  resizeObserver.observe(host);

  return {
    dispose() {
      stop();
      visibility.disconnect();
      resizeObserver.disconnect();
      if (customDispose) customDispose();
      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          const materials = Array.isArray(obj.material)
            ? obj.material
            : [obj.material];
          materials.forEach((m) => m.dispose());
        }
      });
      renderer.dispose();
      if (presetsBar) presetsBar.remove();
      if (togglesBar) togglesBar.remove();
      if (controlsApi) controlsApi.panel.remove();
      canvas.remove();
    },
  };
}

// Mount every <div class="blog-canvas"> found within `container`.
export function mountBlogCanvases(container) {
  if (!container) return;
  unmountBlogCanvases();
  container.querySelectorAll(".blog-canvas").forEach((host) => {
    const sketch = createSketch(host);
    if (sketch) mounted.push(sketch);
  });
}

// Tear down all active sketches (call before leaving a post).
export function unmountBlogCanvases() {
  mounted.forEach((sketch) => sketch.dispose());
  mounted = [];
}
