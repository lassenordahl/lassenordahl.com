// Single-cell SmoothLife — the same continuous cellular automaton as
// `smoothlife.js`, but seeded with one centered disk instead of a field of
// value-noise blobs. Instead of a whole ecosystem linking up into the ring /
// tendril network, you get a single organism that grows, wobbles, and
// self-organizes on its own — "one guy."
//
// Everything about the rule (SIM_FRAG), the palette display, and the ping-pong
// plumbing is identical to smoothlife.js; see that file for the full annotated
// walkthrough. What's unique here is only SEED_FRAG (a single soft disk) and a
// live "seed size" slider that drops a fresh organism into the field.

import * as THREE from "three";
import { createStage, createPingPong, GLSL } from "./kit.js";

// Simulation grid. Aspect ~matches the hero canvas. Run high-res then
// bicubic-upscale on display so a single organism stays smooth up close.
const SIM_W = 720;
const SIM_H = 540;
const ASPECT = SIM_W / SIM_H;

// Seed a single soft disk in the middle of the field. uRadius is the organism's
// starting size (uv units); the 0.03 feather keeps its edge from being a hard
// circle so the rule has a gradient to grab onto. Aspect-corrected so the seed
// is a true circle, not an ellipse, on the non-square grid.
const SEED_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uRadius;
  uniform float uAspect;
  void main() {
    float d = length((vUv - 0.5) * vec2(uAspect, 1.0));
    float s = smoothstep(uRadius, uRadius - 0.03, d);
    gl_FragColor = vec4(vec3(s), 1.0);
  }
`;

// One SmoothLife step — identical rule to smoothlife.js.
const SIM_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uState;
  uniform vec2 uResolution;
  uniform float uDt;
  uniform float uB1;      // birth window lower
  uniform float uB2;      // birth window upper
  uniform float uD1;      // survival window lower
  uniform float uD2;      // survival window upper
  uniform float uAlphaN;  // interval softness

  const float ri = 5.0;         // inner radius
  const float ra = 15.0;        // outer radius (ra = 3 * ri is load-bearing)
  const float logres = 6.0;     // logistic kernel edge softness
  #define alphaN uAlphaN
  #define b1 uB1
  #define b2 uB2
  #define d1 uD1
  #define d2 uD2

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
    vec2 px = 1.0 / uResolution;
    float m = 0.0, mW = 0.0; // inner disk: weighted sum, total weight
    float n = 0.0, nW = 0.0; // outer annulus

    for (int dy = -16; dy <= 16; dy++) {
      for (int dx = -16; dx <= 16; dx++) {
        float dist = length(vec2(float(dx), float(dy)));
        if (dist > ra + 2.0) continue; // skip the box corners (weight ~0)
        float val = texture2D(uState, vUv + vec2(float(dx), float(dy)) * px).r;
        float wi = kweight(dist, ri);
        float wa = kweight(dist, ra) - wi;
        m += val * wi; mW += wi;
        n += val * wa; nW += wa;
      }
    }
    m /= mW;
    n /= nW;

    float birth = linInterval(n, b1, b2);
    float death = linInterval(n, d1, d2);
    float alive = step(0.5, m);
    float target = mix(birth, death, alive);

    float f = texture2D(uState, vUv).r;
    float nf = clamp(f + uDt * (target - f), 0.0, 1.0);
    gl_FragColor = vec4(vec3(nf), 1.0);
  }
`;

// Palette display — identical to smoothlife.js.
const DISPLAY_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uState;
  uniform vec2 uResolution;
  ${GLSL.bicubic}
  ${GLSL.palette}
  void main() {
    float v = textureBicubic(uState, vUv, uResolution);
    v = pow(clamp(v, 0.0, 1.0), 0.7); // gamma — spread the mid-tones
    vec3 col = palette(v) * smoothstep(0.0, 0.22, v);
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function singleCell({ renderer }) {
  const stage = createStage(renderer);
  // Toroidal world — wrap the neighborhood sampling at the edges.
  const targets = createPingPong(SIM_W, SIM_H, {
    wrapS: THREE.RepeatWrapping,
    wrapT: THREE.RepeatWrapping,
  });

  const resolution = new THREE.Vector2(SIM_W, SIM_H);
  const seedMat = stage.shader(SEED_FRAG, {
    uRadius: { value: 0.05 },
    uAspect: { value: ASPECT },
  });
  const LIVE_DT = 0.06;
  const simMat = stage.shader(SIM_FRAG, {
    uState: { value: null },
    uResolution: { value: resolution },
    uDt: { value: LIVE_DT },
    uB1: { value: 0.254 },
    uB2: { value: 0.312 },
    uD1: { value: 0.340 },
    uD2: { value: 0.518 },
    uAlphaN: { value: 0.028 },
  });
  const displayMat = stage.shader(DISPLAY_FRAG, {
    uState: { value: null },
    uResolution: { value: resolution },
  });

  const step = () => {
    simMat.uniforms.uState.value = targets.read.texture;
    stage.pass(simMat, targets.write);
    targets.swap();
  };

  // Drop a fresh single organism into the field: paint the seed disk into the
  // read target, then a few warm-up steps so it reads as a living cell rather
  // than a flat circle on first paint.
  const reseed = () => {
    stage.pass(seedMat, targets.read);
    const dt = simMat.uniforms.uDt.value;
    simMat.uniforms.uDt.value = 0.15;
    for (let i = 0; i < 8; i++) step();
    simMat.uniforms.uDt.value = dt;
  };
  reseed();

  const u = simMat.uniforms;
  const controls = [
    {
      label: "seed size",
      min: 0.03, max: 0.3, step: 0.005,
      get: () => seedMat.uniforms.uRadius.value,
      set: (v) => {
        seedMat.uniforms.uRadius.value = v;
        reseed(); // re-drop a fresh single organism at the new size
      },
      info: "Starting radius of the single seeded organism. Drag to drop a fresh cell — small seeds may die out, larger ones split or grow.",
    },
    {
      label: "dt",
      min: 0.01, max: 0.3, step: 0.005,
      get: () => u.uDt.value, set: (v) => (u.uDt.value = v),
      info: "Time step. The main speed knob — lower is slower and smoother, higher is faster and more chaotic.",
    },
    {
      label: "birth ↓ (b1)",
      min: 0.0, max: 0.5, step: 0.001,
      get: () => u.uB1.value, set: (v) => (u.uB1.value = v),
      info: "Birth window lower bound. A dead cell comes alive when its outer-neighborhood fill rises above this.",
    },
    {
      label: "birth ↑ (b2)",
      min: 0.0, max: 0.5, step: 0.001,
      get: () => u.uB2.value, set: (v) => (u.uB2.value = v),
      info: "Birth window upper bound. Above this it's too crowded to be born. Narrow b1–b2 keeps the cell from spawning new blobs around itself.",
    },
    {
      label: "survive ↓ (d1)",
      min: 0.0, max: 0.7, step: 0.001,
      get: () => u.uD1.value, set: (v) => (u.uD1.value = v),
      info: "Survival floor. Raise it to kill thin, lonely edges so the cell stays compact instead of throwing out tendrils.",
    },
    {
      label: "survive ↑ (d2)",
      min: 0.0, max: 0.9, step: 0.001,
      get: () => u.uD2.value, set: (v) => (u.uD2.value = v),
      info: "Over-crowding ceiling. A live cell whose outer fill exceeds this dies. Raise it to fatten the cell; too high and it freezes.",
    },
    {
      label: "softness (αN)",
      min: 0.005, max: 0.1, step: 0.001,
      get: () => u.uAlphaN.value, set: (v) => (u.uAlphaN.value = v),
      info: "Interval softness. How gradual the birth/death thresholds are. Higher is softer and blobbier; lower is crisp and thready.",
    },
  ];

  return {
    controls,
    render() {
      step();
      displayMat.uniforms.uState.value = targets.read.texture;
      stage.pass(displayMat, null);
    },
    dispose() {
      targets.dispose();
      stage.dispose();
    },
  };
}
