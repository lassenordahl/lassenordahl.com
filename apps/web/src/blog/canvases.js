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
// teardown. This is the seam where compute-style shader experiments plug in —
// add a new entry to SKETCHES.

import * as THREE from "three";
import { smoothlife } from "./sketches/smoothlife.js";

// --- Sketch registry -------------------------------------------------------

const SKETCHES = {
  "spinning-cube": ({ scene, camera }) => {
    camera.position.z = 4;

    const geometry = new THREE.BoxGeometry(1.6, 1.6, 1.6);
    const material = new THREE.MeshNormalMaterial();
    const cube = new THREE.Mesh(geometry, material);
    scene.add(cube);

    return (elapsed) => {
      cube.rotation.x = elapsed * 0.6;
      cube.rotation.y = elapsed * 0.8;
    };
  },
  smoothlife,
};

// --- Manager ---------------------------------------------------------------

// Active sketch instances, so we can dispose them on navigation.
let mounted = [];

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

  const clock = new THREE.Clock();
  let frameId = null;

  const tick = () => {
    const elapsed = clock.getElapsedTime();
    if (typeof update === "function") update(elapsed);
    if (customRender) customRender(elapsed);
    else renderer.render(scene, camera);
    frameId = window.requestAnimationFrame(tick);
  };
  tick();

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
      if (frameId !== null) window.cancelAnimationFrame(frameId);
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
