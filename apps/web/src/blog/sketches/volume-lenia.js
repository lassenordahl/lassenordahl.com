// Volumetric Lenia — the third pass. Same raymarched cube as volume-cell.js,
// but the rule inside is 3D Lenia (ring-kernel convolution + Gaussian growth)
// instead of SmoothLife. The draw here is the *large kernel*: sampled on a fixed
// coarse grid that spans radius R, a big R deliberately undersamples the field,
// and that grainy, granular structure — the look I loved on the high-kernel 2D
// Lenia — is exactly the point.
//
// Everything volumetric (atlas addressing, the irregular 3D seed, the raymarch
// with center-falloff + wireframe edges) comes from volume-kit.js, so this reads
// as one of the cube set. What's unique is only the Lenia SIM_FRAG below.

import * as THREE from "three";
import { createStage, createPingPong } from "./kit.js";
import { volumeAtlas, volumeSeedFrag, volumeDisplayFrag } from "./volume-kit.js";

// Volume geometry. A full 48^3 cube — room for a large organism without it
// wrapping around the toroidal world and eating itself. Large *smooth* kernels
// are made affordable by pre-blurring the field (see BLUR_FRAG) rather than by
// sampling the kernel super-densely, so this stays within volume-cell's budget.
// Exported so the tunnel fly-through (volume-tunnel.js) can reuse the *exact*
// same Lenia field — identical V/TILES/atlas + blur + sim — and only swap the
// display shader for a free-flying, infinitely-tiled raymarch.
export const V = 48;
export const TILES = 7; // 7*7 = 49 >= 48
export const ATLAS = V * TILES; // 336

export const ATLAS_GLSL = volumeAtlas(V, TILES);
export const SEED_FRAG = volumeSeedFrag(ATLAS_GLSL);
const DISPLAY_FRAG = volumeDisplayFrag(ATLAS_GLSL);

// One axis of a separable 3D blur. Run three times (X, then Y, then Z) to
// low-pass the field with Gaussian sigma uSigma (voxels) before the big kernel
// samples it. This is the "mipmap trick": the kernel reads the field at points
// spaced ~uR/RES apart, so anything finer than that spacing would alias into
// grain — pre-blurring at that scale removes it, leaving smooth large-kernel
// convolutions. Cheap: 2*SB+1 taps per pass, and the needed sigma stays small
// (~uR/RES) even for large uR.
export const BLUR_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uSrc;
  uniform vec3 uAxis;    // (1,0,0) / (0,1,0) / (0,0,1)
  uniform float uSigma;  // blur sigma in voxels
  ${ATLAS_GLSL}

  void main() {
    vec3 voxel = fragToVoxel(vUv);
    float sum = 0.0, wsum = 0.0;
    for (int i = -5; i <= 5; i++) {        // SB = 5
      float fi = float(i);
      float wt = exp(-0.5 * fi * fi / max(uSigma * uSigma, 1e-4));
      sum += sampleVoxel(uSrc, voxel + uAxis * fi) * wt;
      wsum += wt;
    }
    gl_FragColor = vec4(vec3(sum / wsum), 1.0);
  }
`;

// One 3D Lenia step. Convolve the (pre-blurred) field with a Gaussian *ring*
// kernel, then nudge every voxel by a bell-shaped growth function of that
// convolution — continuous in space, time, and state, like the 2D Lenia. The
// kernel is sampled on a fixed RES-per-axis grid spanning radius uR; because the
// field it samples (uBlur) is already low-passed to that spacing, big kernels
// stay smooth instead of grainy. The cell's own value (uState) is read un-blurred
// so growth integrates against the true field.
export const SIM_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uState;
  uniform sampler2D uBlur;
  uniform float uDt;
  uniform float uR;       // kernel radius (voxels)
  uniform float uMu;      // growth center
  uniform float uSigma;   // growth width
  uniform float uKMu;     // kernel ring position (0..1)
  uniform float uKSigma;  // kernel ring width
  ${ATLAS_GLSL}

  float bell(float x, float m, float s) {
    float d = (x - m) / s;
    return exp(-0.5 * d * d);
  }

  void main() {
    vec3 voxel = fragToVoxel(vUv);
    float u = 0.0, w = 0.0;

    const float RES = 8.0;
    for (int dz = -8; dz <= 8; dz++) {
      for (int dy = -8; dy <= 8; dy++) {
        for (int dx = -8; dx <= 8; dx++) {
          vec3 g = vec3(float(dx), float(dy), float(dz)) / RES; // normalized [-1,1]
          float r = length(g);
          if (r > 1.0) continue;           // outside the kernel ball
          float k = bell(r, uKMu, uKSigma);
          float val = sampleVoxelN(uBlur, voxel + g * uR);
          u += val * k; w += k;
        }
      }
    }
    u /= w;

    float grow = 2.0 * bell(u, uMu, uSigma) - 1.0; // growth in [-1,1]
    float f = texture2D(uState, vUv).r;
    float nf = clamp(f + uDt * grow, 0.0, 1.0);
    gl_FragColor = vec4(vec3(nf), 1.0);
  }
`;

export const RES = 8.0; // must match the loop above; also drives the blur sigma

export function volumeLenia({ renderer, sizes }) {
  const stage = createStage(renderer);
  const targets = createPingPong(ATLAS, ATLAS, {
    wrapS: THREE.ClampToEdgeWrapping, // wrap is handled per-voxel in the sim
    wrapT: THREE.ClampToEdgeWrapping,
  });

  // Two scratch targets for the separable blur (X→Y→Z ping-pong).
  const blur = createPingPong(ATLAS, ATLAS, {
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
  });

  const seedMat = stage.shader(SEED_FRAG, {
    uSeedR: { value: 15.0 },
    uSeed: { value: Math.random() * 100.0 },
  });
  const blurMat = stage.shader(BLUR_FRAG, {
    uSrc: { value: null },
    uAxis: { value: new THREE.Vector3(1, 0, 0) },
    uSigma: { value: 1.0 },
  });
  // Pre-blurring lets the big ring kernel stay smooth, so R can be large enough
  // for a sizeable organism. The living regime is still a hunt — the strongest
  // knobs are growth μ/σ and R.
  const simMat = stage.shader(SIM_FRAG, {
    uState: { value: null },
    uBlur: { value: null },
    uDt: { value: 0.1 },
    uR: { value: 16.0 },  // large kernel → large organism (now smooth, not grain)
    uMu: { value: 0.218 },
    uSigma: { value: 0.05 },
    uKMu: { value: 0.7 },
    uKSigma: { value: 0.12 },
  });
  const displayMat = stage.shader(DISPLAY_FRAG, {
    uState: { value: null },
    uAspect: { value: 1.0 },
    uTime: { value: 0.0 },
    uDensity: { value: 14.0 },
  });
  // fwidth() in cubeEdge needs the derivatives extension under WebGL1.
  displayMat.extensions.derivatives = true;

  const AXES = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, 1),
  ];

  const step = () => {
    // Sigma ≈ half the kernel sample spacing (uR/RES) — enough to kill the
    // aliasing that would otherwise show up as grain, without over-smoothing.
    blurMat.uniforms.uSigma.value = 0.5 * (simMat.uniforms.uR.value / RES);

    // Separable 3D blur: state → X → Y → Z, ping-ponging the two scratch targets.
    let src = targets.read.texture;
    for (let a = 0; a < 3; a++) {
      blurMat.uniforms.uSrc.value = src;
      blurMat.uniforms.uAxis.value = AXES[a];
      stage.pass(blurMat, blur.write);
      blur.swap();
      src = blur.read.texture;
    }

    // Lenia step: convolve the blurred field, integrate against the true state.
    simMat.uniforms.uState.value = targets.read.texture;
    simMat.uniforms.uBlur.value = blur.read.texture;
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

  const u = simMat.uniforms;
  const controls = [
    {
      label: "seed size",
      min: 2.0, max: 20.0, step: 0.5,
      get: () => seedMat.uniforms.uSeedR.value,
      set: (v) => {
        seedMat.uniforms.uSeedR.value = v;
        reseed();
        frame = 0; // re-warm the fresh seed
      },
      info: "Radius (in voxels) of the seeded blob. Drag to drop a fresh organism.",
    },
    {
      label: "dt",
      min: 0.02, max: 0.3, step: 0.005,
      get: () => u.uDt.value, set: (v) => (u.uDt.value = v),
      info: "Time step. Lower is slower and smoother, higher is faster and more chaotic.",
    },
    {
      label: "kernel R",
      min: 4.0, max: 24.0, step: 0.5,
      get: () => u.uR.value, set: (v) => (u.uR.value = v),
      info: "Kernel radius in voxels — roughly the organism's feature size. The field is pre-blurred to match, so large R now grows a large smooth shape instead of grain. Past ~24 it starts wrapping around the cube.",
    },
    {
      label: "growth μ",
      min: 0.05, max: 0.4, step: 0.001,
      get: () => u.uMu.value, set: (v) => (u.uMu.value = v),
      info: "Growth center. The neighborhood density a voxel most wants. Near μ grows; too much or too little decays. The knob that decides who lives.",
    },
    {
      label: "growth σ",
      min: 0.005, max: 0.08, step: 0.001,
      get: () => u.uSigma.value, set: (v) => (u.uSigma.value = v),
      info: "Growth width. How forgiving the survival band around μ is. Narrow is picky and crisp; wide spreads into blobbier growth.",
    },
    {
      label: "ring μ (kμ)",
      min: 0.0, max: 0.8, step: 0.01,
      get: () => u.uKMu.value, set: (v) => (u.uKMu.value = v),
      info: "Where the kernel ring peaks, as a fraction of R. ~0.5 reads a thin shell (ring/moving structure); toward 0 the kernel fills into a solid ball, which favors cohesive blobs.",
    },
    {
      label: "ring σ (kσ)",
      min: 0.05, max: 0.3, step: 0.01,
      get: () => u.uKSigma.value, set: (v) => (u.uKSigma.value = v),
      info: "Thickness of the kernel ring. Thin is sharper and more structured; thick blurs toward a solid ball.",
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
      blur.dispose();
      stage.dispose();
    },
  };
}
