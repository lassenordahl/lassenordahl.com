// Volumetric SmoothLife — a *true 3D* cellular automaton confined to a cube,
// raymarched onto the screen. Where smoothlife.js / single-cell.js run a scalar
// field f(x,y) on a flat texture, this runs f(x,y,z) inside a fixed cube: one
// organism growing in three dimensions.
//
// WebGL has no 3D render targets we can ping-pong easily, so the volume is
// flattened into a 2D **atlas**: V z-slices laid out in a TILES×TILES grid, so
// the whole cube lives in one ordinary 2D texture and reuses createPingPong
// untouched. Addressing helpers below convert (x,y,z) voxel coords ↔ atlas uv.
//
// This is the heavy, experimental one:
//   - Cost scales with the CUBE of the kernel radius, so the volume (V) is kept
//     small and the neighborhood tight.
//   - The sim is THROTTLED — it steps a few times a second, not every frame —
//     while the raymarch renders every frame. Slow organisms don't need fast
//     stepping, and this is what keeps it interactive.
//   - 3D SmoothLife params do NOT match the 2D ones (neighborhood fill stats
//     differ in 3D), so the defaults are a starting guess — use the sliders to
//     hunt for the living regime.

import * as THREE from "three";
import { createStage, createPingPong } from "./kit.js";
import { volumeAtlas, volumeSeedFrag, volumeDisplayFrag } from "./volume-kit.js";

// Volume geometry. V voxels per axis; slices tiled TILES×TILES into the atlas.
// TILES must satisfy TILES*TILES >= V. Atlas is (V*TILES) square.
const V = 48;
const TILES = 7; // 7*7 = 49 >= 48
const ATLAS = V * TILES; // 336

// 3D neighborhood kernel, in voxel units. ra = 3*ri (load-bearing, as in 2D).
// R is the loop half-width — must cover ra. Kept small: the loop runs R^3 times
// per voxel, so this is THE cost knob.
const RI = 1.5;
const RA = 4.5;
const R = 6;

// Shared atlas addressing + irregular seed + raymarched cube presentation.
const ATLAS_GLSL = volumeAtlas(V, TILES);
const SEED_FRAG = volumeSeedFrag(ATLAS_GLSL);

// One 3D SmoothLife step. Same linearized birth/death machinery as the 2D
// sketch, but the neighborhood is a solid inner sphere (m) + outer shell (n).
const SIM_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uState;
  uniform float uDt;
  uniform float uB1;
  uniform float uB2;
  uniform float uD1;
  uniform float uD2;
  uniform float uAlphaN;
  ${ATLAS_GLSL}

  const float ri = ${RI.toFixed(2)};
  const float ra = ${RA.toFixed(2)};
  const float logres = 4.0;
  #define alphaN uAlphaN

  float linStep(float x, float x0) {
    return clamp((x - x0) / alphaN + 0.5, 0.0, 1.0);
  }
  float linInterval(float x, float a, float b) {
    return linStep(x, a) * (1.0 - linStep(x, b));
  }
  float kweight(float dist, float radius) {
    return 1.0 / (1.0 + exp(logres * (dist - radius)));
  }

  void main() {
    vec3 voxel = fragToVoxel(vUv);
    float m = 0.0, mW = 0.0; // inner sphere
    float n = 0.0, nW = 0.0; // outer shell

    for (int dz = -${R}; dz <= ${R}; dz++) {
      for (int dy = -${R}; dy <= ${R}; dy++) {
        for (int dx = -${R}; dx <= ${R}; dx++) {
          vec3 o = vec3(float(dx), float(dy), float(dz));
          float dist = length(o);
          if (dist > ra + 1.5) continue; // outside the shell — skip
          float val = sampleVoxel(uState, voxel + o);
          float wi = kweight(dist, ri);
          float wa = kweight(dist, ra) - wi;
          m += val * wi; mW += wi;
          n += val * wa; nW += wa;
        }
      }
    }
    m /= mW;
    n /= nW;

    float birth = linInterval(n, uB1, uB2);
    float death = linInterval(n, uD1, uD2);
    float alive = step(0.5, m);
    float target = mix(birth, death, alive);

    float f = texture2D(uState, vUv).r;
    float nf = clamp(f + uDt * (target - f), 0.0, 1.0);
    gl_FragColor = vec4(vec3(nf), 1.0);
  }
`;

// Raymarched cube presentation — shared across the volumetric sketches.
const DISPLAY_FRAG = volumeDisplayFrag(ATLAS_GLSL);

export function volumeCell({ renderer, sizes }) {
  const stage = createStage(renderer);
  const targets = createPingPong(ATLAS, ATLAS, {
    wrapS: THREE.ClampToEdgeWrapping, // wrap is handled per-voxel in the sim
    wrapT: THREE.ClampToEdgeWrapping,
  });

  const seedMat = stage.shader(SEED_FRAG, {
    uSeedR: { value: 4.0 },
    uSeed: { value: Math.random() * 100.0 },
  });
  const simMat = stage.shader(SIM_FRAG, {
    uState: { value: null },
    uDt: { value: 0.140 },
    uB1: { value: 0.169 },
    uB2: { value: 0.270 },
    uD1: { value: 0.188 },
    uD2: { value: 0.614 },
    uAlphaN: { value: 0.080 },
  });
  const displayMat = stage.shader(DISPLAY_FRAG, {
    uState: { value: null },
    uAspect: { value: 1.0 },
    uTime: { value: 0.0 },
    uDensity: { value: 8.0 },
  });
  // fwidth() in cubeEdge needs the derivatives extension under WebGL1.
  displayMat.extensions.derivatives = true;

  const step = () => {
    simMat.uniforms.uState.value = targets.read.texture;
    stage.pass(simMat, targets.write);
    targets.swap();
  };

  const reseed = () => {
    seedMat.uniforms.uSeed.value = Math.random() * 100.0;
    stage.pass(seedMat, targets.read);
  };
  reseed();

  // Throttle the (expensive) sim: step every frame for a short warm-up so it's
  // organized quickly, then only every SIM_EVERY frames to stay interactive.
  let frame = 0;
  const WARMUP = 30;
  const SIM_EVERY = 3;

  // Saved presets — full snapshots of the sim + display state that read as a
  // distinct "creature". Applying one sets every uniform and re-drops the seed;
  // the manager re-syncs the sliders afterward. Add more here as we find them.
  const applyPreset = (p) => {
    seedMat.uniforms.uSeedR.value = p.seedR;
    simMat.uniforms.uDt.value = p.dt;
    simMat.uniforms.uB1.value = p.b1;
    simMat.uniforms.uB2.value = p.b2;
    simMat.uniforms.uD1.value = p.d1;
    simMat.uniforms.uD2.value = p.d2;
    simMat.uniforms.uAlphaN.value = p.alphaN;
    displayMat.uniforms.uDensity.value = p.density;
    reseed();
    frame = 0; // re-warm the fresh seed
  };

  const PRESETS = [
    {
      label: "boids",
      seedR: 15.0, dt: 0.14,
      b1: 0.209, b2: 0.238, d1: 0.188, d2: 0.482, alphaN: 0.08,
      density: 34.0,
    },
  ];

  const u = simMat.uniforms;
  const controls = [
    {
      label: "seed size",
      min: 2.0, max: 18.0, step: 0.5,
      get: () => seedMat.uniforms.uSeedR.value,
      set: (v) => {
        seedMat.uniforms.uSeedR.value = v;
        reseed();
        frame = 0; // re-warm the fresh seed
      },
      info: "Radius (in voxels) of the single seeded sphere. Drag to drop a fresh organism.",
    },
    {
      label: "dt",
      min: 0.02, max: 0.3, step: 0.005,
      get: () => u.uDt.value, set: (v) => (u.uDt.value = v),
      info: "Time step. Lower is slower and smoother, higher is faster and more chaotic.",
    },
    {
      label: "birth ↓ (b1)",
      min: 0.0, max: 0.5, step: 0.001,
      get: () => u.uB1.value, set: (v) => (u.uB1.value = v),
      info: "Birth window lower bound (3D). Neighborhood fill stats differ from 2D — expect to retune.",
    },
    {
      label: "birth ↑ (b2)",
      min: 0.0, max: 0.5, step: 0.001,
      get: () => u.uB2.value, set: (v) => (u.uB2.value = v),
      info: "Birth window upper bound.",
    },
    {
      label: "survive ↓ (d1)",
      min: 0.0, max: 0.7, step: 0.001,
      get: () => u.uD1.value, set: (v) => (u.uD1.value = v),
      info: "Survival floor. Raise to kill thin, lonely structure; lower so the organism holds together.",
    },
    {
      label: "survive ↑ (d2)",
      min: 0.0, max: 0.9, step: 0.001,
      get: () => u.uD2.value, set: (v) => (u.uD2.value = v),
      info: "Over-crowding ceiling. Raise to fatten; too high and the volume freezes solid.",
    },
    {
      label: "softness (αN)",
      min: 0.005, max: 0.1, step: 0.001,
      get: () => u.uAlphaN.value, set: (v) => (u.uAlphaN.value = v),
      info: "Interval softness. Higher is blobbier and more gradient; lower is crisp.",
    },
    {
      label: "density",
      min: 5.0, max: 120.0, step: 1.0,
      get: () => displayMat.uniforms.uDensity.value,
      set: (v) => (displayMat.uniforms.uDensity.value = v),
      info: "Raymarch opacity — how solid the volume looks. Purely visual; doesn't affect the sim.",
    },
  ];

  return {
    controls,
    presets: PRESETS.map((p) => ({ label: p.label, apply: () => applyPreset(p) })),
    render(elapsed) {
      frame++;
      if (frame <= WARMUP || frame % SIM_EVERY === 0) step();

      displayMat.uniforms.uState.value = targets.read.texture;
      displayMat.uniforms.uTime.value = elapsed;
      displayMat.uniforms.uAspect.value =
        (sizes.width || 1) / (sizes.height || 1);
      stage.pass(displayMat, null);
    },
    dispose() {
      targets.dispose();
      stage.dispose();
    },
  };
}
