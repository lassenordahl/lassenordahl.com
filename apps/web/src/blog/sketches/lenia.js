// Lenia — SmoothLife's successor (Bert Chan, 2019), run as a WebGL
// fragment-shader cellular automaton. Where SmoothLife samples an inner disk +
// outer annulus and snaps through birth/death intervals, Lenia is continuous in
// space, time, and state all at once: it convolves the field with a smooth
// radial *ring* kernel, then nudges every cell by a bell-shaped growth function
// of that convolution. The result is less "boiling soup" and more distinct,
// gliding creatures that hold their shape — the natural next step after the
// single-cell SmoothLife above.
//
// State field A in [0,1] lives in a float render target. Each step:
//   u = (K * A)      convolution with a normalized Gaussian ring kernel
//   A = clamp(A + dt * G(u))   with growth G(u) = 2*exp(-(u-μ)²/2σ²) - 1
//
// Everything structural — ping-pong targets, the palette display, bicubic
// upscale — is shared with smoothlife.js / single-cell.js via kit.js. What's
// unique to Lenia is only the ring KERNEL + growth in SIM_FRAG below.

import * as THREE from "three";
import { createStage, createPingPong, GLSL } from "./kit.js";

// Simulation grid. Same aspect / high-res-then-upscale approach as the sibling
// sketches so the creatures stay smooth up close.
const SIM_W = 720;
const SIM_H = 540;

// Seed continuous value-noise blobs (not binarized) valued in [0,1], masked by a
// lower-frequency field so there's empty space between clumps for creatures to
// separate out of. Lenia likes a continuous starting field, unlike Life's 0/1.
const SEED_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uSeed;
  ${GLSL.noise}
  void main() {
    float n = vnoise(vUv * 20.0 + uSeed);
    float mask = smoothstep(0.42, 0.72, vnoise(vUv * 5.0 + uSeed * 1.3));
    gl_FragColor = vec4(vec3(n * mask), 1.0);
  }
`;

// One Lenia step. The kernel is a single Gaussian ring: over the neighborhood
// disk of radius R, each cell at normalized distance r = d/R contributes weight
// exp(-(r - kMu)² / 2·kSigma²). Peaked at kMu (~0.5) it reads the field a ring
// away, which is what gives Lenia its orbiting, self-propelling creatures. The
// growth function G maps the normalized convolution u through a bell centered at
// μ into [-1,1]: fields near μ grow, everything else decays.
const SIM_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uState;
  uniform vec2 uResolution;
  uniform float uDt;
  uniform float uR;       // kernel radius (pixels)
  uniform float uMu;      // growth center
  uniform float uSigma;   // growth width
  uniform float uKMu;     // kernel ring position (0..1)
  uniform float uKSigma;  // kernel ring width

  float bell(float x, float m, float s) {
    float d = (x - m) / s;
    return exp(-0.5 * d * d);
  }

  void main() {
    vec2 px = 1.0 / uResolution;
    float u = 0.0, w = 0.0;

    // Convolve with the ring kernel. We sample a fixed 33x33 grid that always
    // spans the kernel radius uR (step = uR/RES pixels), so the cost is constant
    // no matter how large R gets — uR just scales the sampling footprint,
    // relying on the texture's linear filtering between texels. This is what
    // lets R go well past the ±16px the loop could otherwise reach.
    const float RES = 16.0;
    for (int dy = -16; dy <= 16; dy++) {
      for (int dx = -16; dx <= 16; dx++) {
        vec2 g = vec2(float(dx), float(dy)) / RES; // normalized grid in [-1,1]
        float r = length(g);             // normalized radius
        if (r > 1.0) continue;           // outside the kernel disk
        float k = bell(r, uKMu, uKSigma);
        float val = texture2D(uState, vUv + g * uR * px).r;
        u += val * k; w += k;
      }
    }
    u /= w;

    // Growth in [-1,1]: bell of the convolution, remapped.
    float g = 2.0 * bell(u, uMu, uSigma) - 1.0;

    float a = texture2D(uState, vUv).r;
    float na = clamp(a + uDt * g, 0.0, 1.0);
    gl_FragColor = vec4(vec3(na), 1.0);
  }
`;

// Palette display — identical language to the sibling sketches so the set reads
// as one design. Bicubic upscale, gamma-spread mid-tones, fade to black where
// the field is empty.
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

export function lenia({ renderer }) {
  const stage = createStage(renderer);
  // Toroidal world — wrap the kernel sampling at the edges.
  const targets = createPingPong(SIM_W, SIM_H, {
    wrapS: THREE.RepeatWrapping,
    wrapT: THREE.RepeatWrapping,
  });

  const resolution = new THREE.Vector2(SIM_W, SIM_H);
  const seedMat = stage.shader(SEED_FRAG, {
    uSeed: { value: Math.random() * 1000.0 },
  });
  // Lenia's canonical time step is dt = 1/T with T ~ 10. Lower is slower and
  // smoother; the main speed knob.
  const LIVE_DT = 0.1;
  const simMat = stage.shader(SIM_FRAG, {
    uState: { value: null },
    uResolution: { value: resolution },
    uDt: { value: LIVE_DT },
    uR: { value: 112.0 },
    uMu: { value: 0.15 },
    uSigma: { value: 0.017 },
    uKMu: { value: 0.6 },
    uKSigma: { value: 0.15 },
  });
  const displayMat = stage.shader(DISPLAY_FRAG, {
    uState: { value: null },
    uResolution: { value: resolution },
  });

  // Seed the initial state into the read target.
  stage.pass(seedMat, targets.read);

  const step = () => {
    simMat.uniforms.uState.value = targets.read.texture;
    stage.pass(simMat, targets.write);
    targets.swap();
  };

  // Warm up so the soup has already condensed into creatures on first paint.
  for (let i = 0; i < 60; i++) step();

  // Re-drop a fresh soup (used by the reseed control).
  const reseed = () => {
    seedMat.uniforms.uSeed.value = Math.random() * 1000.0;
    stage.pass(seedMat, targets.read);
    for (let i = 0; i < 60; i++) step();
  };

  const u = simMat.uniforms;
  const controls = [
    {
      label: "dt",
      min: 0.02, max: 0.3, step: 0.005,
      get: () => u.uDt.value, set: (v) => (u.uDt.value = v),
      info: "Time step. The main speed knob — lower is slower and smoother, higher is faster and more chaotic.",
    },
    {
      label: "kernel R",
      min: 6.0, max: 128.0, step: 0.5,
      get: () => u.uR.value, set: (v) => (u.uR.value = v),
      info: "Kernel radius in pixels — the reach of each cell's neighborhood. Bigger R makes larger, slower creatures. Sampled at a fixed resolution, so cost stays flat as R grows (very large R will undersample fine detail).",
    },
    {
      label: "growth μ",
      min: 0.05, max: 0.4, step: 0.001,
      get: () => u.uMu.value, set: (v) => (u.uMu.value = v),
      info: "Growth center. The neighborhood density a cell most wants. Fields near μ grow; too much or too little decays. The knob that decides who lives.",
    },
    {
      label: "growth σ",
      min: 0.005, max: 0.06, step: 0.001,
      get: () => u.uSigma.value, set: (v) => (u.uSigma.value = v),
      info: "Growth width. How forgiving the survival band around μ is. Narrow σ gives crisp, picky creatures; wide σ spreads into blobbier growth.",
    },
    {
      label: "ring μ (kμ)",
      min: 0.2, max: 0.8, step: 0.01,
      get: () => u.uKMu.value, set: (v) => (u.uKMu.value = v),
      info: "Where the kernel ring peaks, as a fraction of R. ~0.5 reads a ring out from each cell — the source of Lenia's orbiting, gliding motion.",
    },
    {
      label: "ring σ (kσ)",
      min: 0.05, max: 0.3, step: 0.01,
      get: () => u.uKSigma.value, set: (v) => (u.uKSigma.value = v),
      info: "Thickness of the kernel ring. Thin rings make sharper, more structured creatures; thick rings blur toward a solid disk.",
    },
    {
      label: "reseed",
      min: 0, max: 1, step: 1,
      get: () => 0,
      set: () => reseed(),
      info: "Drop a fresh random soup and let it condense into creatures again.",
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
