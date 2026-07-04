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
import { createStage, createPingPong, GLSL } from "./kit.js";

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

// --- Shared atlas addressing (GLSL) ----------------------------------------
// Injected into both sim and display shaders so voxel<->atlas math stays in one
// place. sampleVoxel: nearest integer voxel with toroidal wrap (for the sim).
// sampleVolume: trilinear sample at a continuous [0,1] cube position (for the
// raymarcher) — bilinear within a slice via the texture's LinearFilter, manual
// mix across the two bracketing z-slices.
const ATLAS_GLSL = /* glsl */ `
  const float V = ${V.toFixed(1)};
  const float TILES = ${TILES.toFixed(1)};
  const float ATLAS = ${ATLAS.toFixed(1)};

  vec2 sliceUV(vec2 xy, float s) {
    float tx = mod(s, TILES);
    float ty = floor(s / TILES);
    return (vec2(tx, ty) * V + (xy + 0.5)) / ATLAS;
  }

  // Integer voxel, toroidal — used by the sim's neighborhood loop.
  float sampleVoxel(sampler2D tex, vec3 v) {
    v = mod(v + V, V); // wrap all three axes
    return texture2D(tex, sliceUV(v.xy, v.z)).r;
  }

  // Continuous cube position p in [0,1]^3 → trilinear scalar. For the raymarch.
  float sampleVolume(sampler2D tex, vec3 p) {
    vec3 vc = clamp(p, 0.0, 1.0) * V - 0.5;
    vec2 xy = clamp(vc.xy, vec2(0.0), vec2(V - 1.0));
    float z = clamp(vc.z, 0.0, V - 1.0);
    float z0 = floor(z);
    float fz = z - z0;
    float a = texture2D(tex, sliceUV(xy, z0)).r;
    float b = texture2D(tex, sliceUV(xy, min(z0 + 1.0, V - 1.0))).r;
    return mix(a, b, fz);
  }

  // Atlas fragment (uv in [0,1]) → the integer voxel it represents.
  vec3 fragToVoxel(vec2 uv) {
    vec2 apx = uv * ATLAS;
    vec2 tile = floor(apx / V);
    vec2 local = floor(apx - tile * V);
    float s = tile.y * TILES + tile.x;
    return vec3(local, s);
  }
`;

// Seed one soft blob in the middle of the cube. uSeedR is its base radius
// (voxels); the surface is displaced by 3D value noise so it starts irregular
// and lumpy instead of a perfect sphere — the rule then organizes from that.
// uSeed randomizes the shape on each drop.
const SEED_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uSeedR;
  uniform float uSeed;
  ${ATLAS_GLSL}

  float hash3(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float vnoise3(vec3 x) {
    vec3 i = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash3(i + vec3(0,0,0)), hash3(i + vec3(1,0,0)), f.x),
          mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x),
          mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z);
  }

  void main() {
    vec3 voxel = fragToVoxel(vUv);
    vec3 c = vec3(V, V, V) * 0.5 - 0.5;
    vec3 rel = voxel - c;
    float d = length(rel);
    vec3 dir = rel / max(d, 0.001);

    // Two scales of displacement: big lobes from the surface direction, finer
    // roughness from the voxel position. Combined into an irregular radius.
    float n = vnoise3(dir * 2.5 + uSeed);
    n += 0.5 * vnoise3(rel * 0.18 + uSeed * 1.7);
    n /= 1.5;
    float radius = uSeedR * (0.55 + 0.9 * n);

    float s = smoothstep(radius, radius - 1.5, d);
    gl_FragColor = vec4(vec3(s), 1.0);
  }
`;

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

// Raymarch the volume onto the screen. Cast one ray per pixel into a rotating
// unit cube, intersect the box, march front-to-back accumulating emissive color
// through the shared palette. No lighting — density glows, like the 2D sketches.
const DISPLAY_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uState;
  uniform float uAspect;
  uniform float uTime;
  uniform float uDensity;
  ${ATLAS_GLSL}
  ${GLSL.palette}

  mat3 rotY(float a) {
    float c = cos(a), s = sin(a);
    return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c);
  }
  mat3 rotX(float a) {
    float c = cos(a), s = sin(a);
    return mat3(1.0, 0.0, 0.0, 0.0, c, -s, 0.0, s, c);
  }

  // Wireframe edge factor for a point on the cube surface [-0.5,0.5]^3. An edge
  // is where two coordinates are simultaneously at a wall (|coord| ~ 0.5), i.e.
  // the two smallest wall-distances are both ~0. thick is the line half-width
  // in world units — same for all 12 edges.
  float cubeEdge(vec3 p, float thick) {
    vec3 e = 0.5 - abs(p);                  // distance to the nearest wall per axis
    float e1 = min(min(e.x, e.y), e.z);     // smallest (the face we're on)
    float e3 = max(max(e.x, e.y), e.z);     // largest
    float e2 = e.x + e.y + e.z - e1 - e3;   // middle → small only along an edge
    // Anti-alias against the line's screen-space footprint so the thin edge
    // stays crisp without shimmering, whatever angle it's viewed at.
    float aa = fwidth(e2);
    return 1.0 - smoothstep(thick - aa, thick + aa, e2);
  }

  void main() {
    vec2 ndc = vUv * 2.0 - 1.0;
    ndc.x *= uAspect;

    mat3 rot = rotY(uTime * 0.25) * rotX(0.5);
    vec3 ro = rot * vec3(0.0, 0.0, 1.9);
    vec3 rd = rot * normalize(vec3(ndc, -1.6));

    // Intersect the cube [-0.5, 0.5]^3 (slab method).
    vec3 inv = 1.0 / rd;
    vec3 t0 = (vec3(-0.5) - ro) * inv;
    vec3 t1 = (vec3(0.5) - ro) * inv;
    vec3 tmin = min(t0, t1), tmax = max(t0, t1);
    float tN = max(max(tmin.x, tmin.y), tmin.z);
    float tF = min(min(tmax.x, tmax.y), tmax.z);

    vec3 acc = vec3(0.0);
    float alpha = 0.0;
    if (tF > max(tN, 0.0)) {
      const int STEPS = 80;
      float dt = (tF - tN) / float(STEPS);
      float tt = tN + dt * 0.5;
      for (int i = 0; i < STEPS; i++) {
        vec3 pos = ro + rd * tt;          // in [-0.5, 0.5]
        float v = sampleVolume(uState, pos + 0.5);
        float d = smoothstep(0.12, 0.5, v);
        if (d > 0.001) {
          // Radial falloff: dense at the cube center, fading transparent toward
          // the edges so the organism reads as a glowing core, not a hard box.
          // pow() steepens it — edges drop off harder, core stays full.
          float rr = length(pos) / 0.8660254;   // 0 at center → 1 at a corner
          float falloff = pow(smoothstep(1.0, 0.15, rr), 1.8);
          vec3 em = palette(pow(clamp(v, 0.0, 1.0), 0.7));
          float a = clamp(d * uDensity * falloff * dt, 0.0, 1.0);
          acc += (1.0 - alpha) * em * a;
          alpha += (1.0 - alpha) * a;
        }
        tt += dt;
        if (alpha > 0.99) break;
      }

      // White wireframe edges. The volume glows *inside* the cube, so it's nice
      // to see it press against the walls: back edges show through by whatever
      // opacity the volume didn't fill (1-alpha), front edges sit on top.
      const float THICK = 0.003;
      float ef = cubeEdge(ro + rd * tN, THICK); // entry point (front edges)
      float eb = cubeEdge(ro + rd * tF, THICK); // exit point (back edges)
      acc += (1.0 - alpha) * vec3(eb);          // back edges behind the volume
      acc = mix(acc, vec3(1.0), ef);            // front edges over everything
    }
    gl_FragColor = vec4(acc, 1.0);
  }
`;

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
