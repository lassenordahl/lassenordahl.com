// Volume Tunnel — the fly-through. Same 3D Lenia field as volume-lenia.js (the
// atlas, the seed, the pre-blur, the ring-kernel/Gaussian-growth SIM_FRAG are
// imported straight from it), but the presentation is inverted: instead of
// orbiting a single contained cube, we set a free camera loose *inside* the
// field and let it fly.
//
// The trick that makes this work is that the Lenia world is already TOROIDAL —
// it wraps at every face. So sampling it with mod() tiles it seamlessly in all
// three axes: one 48^3 cube becomes an endless lattice. Marching a camera
// through that lattice reads as flying through organic tunnels that never end.
// There is no cube wall, no wireframe, no center falloff pulling the organism
// into a core — just the field, repeated, with distance fog for depth.
//
// The camera is driven by simple uniforms (position + yaw/pitch + zoom) wired to
// sliders, plus an optional forward drift. `window.leniaCam()` logs the current
// viewpoint to the console so a nice spot can be captured and pinned as the
// default. Everything unique to this sketch is the TUNNEL_FRAG below.

import * as THREE from "three";
import { createStage, createPingPong, GLSL } from "./kit.js";
import {
  V,
  TILES,
  ATLAS,
  ATLAS_GLSL,
  SEED_FRAG,
  BLUR_FRAG,
  SIM_FRAG,
  RES,
} from "./volume-lenia.js";

// Free-flying raymarch through the infinitely-tiled toroidal field.
//
// sampleTorus is the whole idea: it samples the volume at any continuous cube
// position and wraps every axis mod V, so the 48^3 cube tiles forever. xy uses
// the hardware bilinear filter within a slice; z is lerped between two wrapped
// slices — same 2-tap scheme as volumeDisplayFrag's sampleVolume, just wrapping
// instead of clamping. (A faint seam can appear on the one wrap plane per axis
// where the atlas tiling breaks bilinear; harmless for a flythrough.)
//
// The camera basis is built from yaw/pitch; uFocal is the zoom (higher = tighter
// FoV). Rays march a fixed reach in cube units, accumulating emissive color
// through the shared palette with exp() distance fog so far tunnels fade to
// black. uDither jitters each ray's start by a per-pixel hash to break the
// slice-banding you'd otherwise see up close.
const TUNNEL_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uState;
  uniform float uAspect;
  uniform vec3 uCamPos;    // camera position, in cube units (1.0 = one cube)
  uniform float uYaw;      // look: left/right (radians)
  uniform float uPitch;    // look: up/down (radians)
  uniform float uFocal;    // zoom — higher is a tighter field of view
  uniform float uReach;    // how far the ray marches, in cube units
  uniform float uDensity;  // raymarch opacity
  uniform float uFog;      // distance fog strength (depth fade)
  uniform float uDither;   // ray-start jitter to kill slice banding
  uniform float uHalftone; // >0.5 renders the frame as a grid of dots
  uniform float uHalfCell; // halftone dot spacing, in device px (bigger = bigger dots + more gap)
  uniform float uHalfFill; // halftone max dot radius as a fraction of the cell (lower = more black space)
  uniform float uStars;    // >0.5 speckles stars into the empty background
  ${ATLAS_GLSL}
  ${GLSL.palette}

  // Continuous cube position p (any range) -> trilinear-ish scalar, toroidal.
  float sampleTorus(sampler2D tex, vec3 p) {
    vec3 vc = mod(p * V - 0.5, V);   // voxel coords, wrapped into [0, V)
    vec2 xy = vc.xy;                 // hardware bilinear within the slice
    float z = vc.z;
    float z0 = floor(z);
    float fz = z - z0;
    float a = texture2D(tex, sliceUV(xy, z0)).r;
    float b = texture2D(tex, sliceUV(xy, mod(z0 + 1.0, V))).r;
    return mix(a, b, fz);
  }

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  void main() {
    vec2 ndc = vUv * 2.0 - 1.0;
    ndc.x *= uAspect;

    // Camera basis from yaw (about Y) then pitch (about the camera's right).
    float cy = cos(uYaw), sy = sin(uYaw);
    float cp = cos(uPitch), sp = sin(uPitch);
    vec3 fwd = vec3(sy * cp, sp, -cy * cp);   // forward is -Z at yaw=pitch=0
    vec3 right = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
    vec3 up = cross(right, fwd);

    vec3 ro = uCamPos;
    vec3 rd = normalize(fwd * uFocal + ndc.x * right + ndc.y * up);

    const int STEPS = 96;
    float dt = uReach / float(STEPS);
    // Per-pixel jitter so the fixed step grid doesn't band into visible shells.
    float tt = dt * (0.5 + uDither * (hash12(gl_FragCoord.xy) - 0.5));

    vec3 acc = vec3(0.0);
    float alpha = 0.0;
    for (int i = 0; i < STEPS; i++) {
      vec3 pos = ro + rd * tt;
      float v = sampleTorus(uState, pos);
      float d = smoothstep(0.12, 0.5, v);
      if (d > 0.001) {
        vec3 em = palette(pow(clamp(v, 0.0, 1.0), 0.7));
        float fog = exp(-uFog * tt);           // far tunnels fade to black
        float a = clamp(d * uDensity * dt * fog, 0.0, 1.0);
        acc += (1.0 - alpha) * em * a;
        alpha += (1.0 - alpha) * a;
      }
      tt += dt;
      if (alpha > 0.99) break;
    }

    vec3 col = acc;

    // Halftone: reprint the frame as a regular grid of dots whose radius grows
    // with local brightness — bright tunnel walls fill their cell, dark gaps go
    // to black. Screen-space, applied last, so it stacks cleanly on top of the
    // raymarch (and on top of dithering). Color is kept per dot.
    if (uHalftone > 0.5) {
      float cellPx = uHalfCell;                    // dot spacing, in device px
      float lum = clamp(max(max(col.r, col.g), col.b), 0.0, 1.0);
      vec2 g = fract(gl_FragCoord.xy / cellPx) - 0.5;
      float dist = length(g) * 2.0;                // 0 at center → ~1.41 at corner
      float radius = sqrt(lum) * uHalfFill;        // brightness → dot radius (×gap)
      float aa = 2.0 / cellPx;                     // ~1px soft edge
      float mask = 1.0 - smoothstep(radius - aa, radius + aa, dist);
      col *= mask;
    }

    // Speckled stars in the empty background. Screen-space, added *after* the
    // halftone so they stay clean round specks instead of getting chopped into
    // the dot grid, and gated by (1 - alpha) so they only fill space the tunnel
    // didn't cover. Sparse random cells hold one jittered star each, tinted a
    // touch toward the palette so they belong to the same world.
    if (uStars > 0.5) {
      float cell = 6.0;                              // star spacing, device px
      vec2 g = gl_FragCoord.xy / cell;
      vec2 id = floor(g);
      vec2 f = fract(g) - 0.5;
      float present = step(0.95, hash12(id));        // ~5% of cells hold a star
      vec2 off = (vec2(hash12(id + 11.3), hash12(id + 71.9)) - 0.5) * 0.7;
      float d = length(f - off);
      float bright = present * smoothstep(0.55, 0.0, d)
                   * (0.4 + 0.45 * hash12(id + 3.1)); // per-star brightness
      vec3 starCol = mix(vec3(1.0), palette(hash12(id + 5.0)), 0.35);
      col += (1.0 - alpha) * bright * starCol;
    }

    gl_FragColor = vec4(col, 1.0);
  }
`;

// Latest-mounted tunnel instance, so window.leniaCam() reports a live viewpoint
// even if several are on the page. Set at construction; last one wins.
let activeCam = null;

export function volumeTunnel({ renderer, sizes }) {
  const stage = createStage(renderer);
  const targets = createPingPong(ATLAS, ATLAS, {
    wrapS: THREE.ClampToEdgeWrapping, // wrap is handled per-voxel in the sim
    wrapT: THREE.ClampToEdgeWrapping,
  });
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
  const simMat = stage.shader(SIM_FRAG, {
    uState: { value: null },
    uBlur: { value: null },
    uDt: { value: 0.1 },
    uR: { value: 16.0 },
    uMu: { value: 0.218 },
    uSigma: { value: 0.05 },
    uKMu: { value: 0.7 },
    uKSigma: { value: 0.12 },
  });

  // Camera defaults: sitting just outside one cube, looking straight in. Capture
  // a better spot with window.leniaCam() and paste the numbers back here.
  const displayMat = stage.shader(TUNNEL_FRAG, {
    uState: { value: null },
    uAspect: { value: 1.0 },
    uCamPos: { value: new THREE.Vector3(-0.5, 0.0, 1.2) },
    uYaw: { value: 0.0 },
    uPitch: { value: 0.0 },
    uFocal: { value: 1.6 },
    uReach: { value: 1.8 },
    uDensity: { value: 18.0 },
    uFog: { value: 0.6 },
    uDither: { value: 0.0 },   // toggled on via the effect bar (sets 0.7)
    uHalftone: { value: 1.0 }, // on by default; toggled via the effect bar
    uHalfCell: { value: 7.5 },  // dot spacing (px) — bigger dots + more gap
    uHalfFill: { value: 0.72 }, // max dot radius vs cell — lower = more black
    uStars: { value: 1.0 },    // on by default; toggled via the effect bar
  });

  const AXES = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, 1),
  ];

  const step = () => {
    blurMat.uniforms.uSigma.value = 0.5 * (simMat.uniforms.uR.value / RES);
    let src = targets.read.texture;
    for (let a = 0; a < 3; a++) {
      blurMat.uniforms.uSrc.value = src;
      blurMat.uniforms.uAxis.value = AXES[a];
      stage.pass(blurMat, blur.write);
      blur.swap();
      src = blur.read.texture;
    }
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

  let frame = 0;
  const WARMUP = 30;
  const SIM_EVERY = 3;

  // Forward drift: the camera glides along its own look direction. Accumulated
  // separately from the slider base so the sliders stay a clean "home" while the
  // drift carries you through the tunnel. leniaCam() reports base + drift, i.e.
  // where you actually are, so a good frame can be pinned as a new default.
  const driftOffset = new THREE.Vector3(0, 0, 0);
  let uDrift = 0.06;
  let lastElapsed = 0;
  const forward = new THREE.Vector3();

  const d = displayMat.uniforms;

  // window.leniaCam() — run in the console to print the current viewpoint.
  activeCam = () => {
    const p = d.uCamPos.value; // this holds base+drift during render
    const out = {
      camX: +p.x.toFixed(3),
      camY: +p.y.toFixed(3),
      camZ: +p.z.toFixed(3),
      yaw: +d.uYaw.value.toFixed(3),
      pitch: +d.uPitch.value.toFixed(3),
      focal: +d.uFocal.value.toFixed(3),
      reach: +d.uReach.value.toFixed(3),
    };
    console.log(
      `[leniaCam] camX:${out.camX} camY:${out.camY} camZ:${out.camZ} ` +
        `yaw:${out.yaw} pitch:${out.pitch} focal:${out.focal} reach:${out.reach}`
    );
    return out;
  };
  if (typeof window !== "undefined") window.leniaCam = () => activeCam();

  // Slider "home" position, kept apart from driftOffset. Controls write here.
  const base = new THREE.Vector3(
    d.uCamPos.value.x,
    d.uCamPos.value.y,
    d.uCamPos.value.z
  );

  // Dithering is split in two: the toggle button gates it on/off, the slider
  // sets the grain amount. Keeping them separate means the slider tunes strength
  // while the button flips the effect, with no fight between the two — the shader
  // uniform is just amount × gate. Dithering starts on; halftone starts off.
  let ditherOn = true;
  let ditherAmt = 1.0;
  const applyDither = () => (d.uDither.value = ditherOn ? ditherAmt : 0.0);
  applyDither();

  // Stack-ranked by how often you'll reach for them: fly the camera first, then
  // shape the look (zoom/reach/drift/density/fog/dither), then a couple of the
  // strongest sim knobs to reshape the tunnels themselves.
  const controls = [
    {
      label: "cam X",
      min: -3.0, max: 3.0, step: 0.01,
      get: () => base.x, set: (v) => (base.x = v),
      info: "Camera position along X, in cube units (1.0 = one full cube). The field tiles forever, so any value flies to a new stretch of tunnel.",
    },
    {
      label: "cam Y",
      min: -3.0, max: 3.0, step: 0.01,
      get: () => base.y, set: (v) => (base.y = v),
      info: "Camera position along Y (up/down through the lattice).",
    },
    {
      label: "cam Z",
      min: -3.0, max: 3.0, step: 0.01,
      get: () => base.z, set: (v) => (base.z = v),
      info: "Camera position along Z (forward/back). Combine with drift to keep gliding.",
    },
    {
      label: "yaw",
      min: -3.14159, max: 3.14159, step: 0.01,
      get: () => d.uYaw.value, set: (v) => (d.uYaw.value = v),
      info: "Look left/right. Drift follows wherever you're looking.",
    },
    {
      label: "pitch",
      min: -1.5, max: 1.5, step: 0.01,
      get: () => d.uPitch.value, set: (v) => (d.uPitch.value = v),
      info: "Look up/down.",
    },
    {
      label: "zoom",
      min: 0.8, max: 3.5, step: 0.01,
      get: () => d.uFocal.value, set: (v) => (d.uFocal.value = v),
      info: "Field of view. Higher zooms in (narrower FoV) so you sit closer to the walls; lower is wide-angle.",
    },
    {
      label: "reach",
      min: 1.0, max: 8.0, step: 0.05,
      get: () => d.uReach.value, set: (v) => (d.uReach.value = v),
      info: "How far the ray marches, in cube units — how deep down the tunnel you can see before it's cut off. Longer costs more.",
    },
    {
      label: "drift",
      min: 0.0, max: 0.4, step: 0.005,
      get: () => uDrift, set: (v) => (uDrift = v),
      info: "Auto forward speed. The camera glides along your look direction; 0 to hold still and let the organism move instead.",
    },
    {
      label: "density",
      min: 5.0, max: 120.0, step: 1.0,
      get: () => d.uDensity.value, set: (v) => (d.uDensity.value = v),
      info: "Raymarch opacity — how solid the tunnel walls look. Purely visual.",
    },
    {
      label: "fog",
      min: 0.0, max: 2.0, step: 0.02,
      get: () => d.uFog.value, set: (v) => (d.uFog.value = v),
      info: "Distance fade. Higher pulls the far tunnels into black for depth; 0 shows everything flat.",
    },
    {
      label: "dot size",
      min: 3.0, max: 28.0, step: 0.5,
      get: () => d.uHalfCell.value, set: (v) => (d.uHalfCell.value = v),
      info: "Halftone dot spacing, in pixels (needs the HALFTONE button). Bigger spreads the grid out into larger, chunkier dots with more black between them.",
    },
    {
      label: "dot fill",
      min: 0.2, max: 1.0, step: 0.01,
      get: () => d.uHalfFill.value, set: (v) => (d.uHalfFill.value = v),
      info: "How much of each halftone cell a full-brightness dot fills. Lower leaves more black space around every dot; 1.0 lets the brightest dots touch their neighbors.",
    },
    {
      label: "dither amt",
      min: 0.0, max: 4.0, step: 0.05,
      get: () => ditherAmt, set: (v) => { ditherAmt = v; applyDither(); },
      info: "Grain amount for the dithering effect (gated by the DITHERING button). Per-pixel ray jitter that dissolves the flat banding of the fixed march grid. 1.0 spreads the jitter across one full march step (clean anti-band); past that it spills into neighboring steps for a coarser, noisier grain. Raise it as you get closer.",
    },
    {
      label: "dt",
      min: 0.02, max: 0.3, step: 0.005,
      get: () => simMat.uniforms.uDt.value,
      set: (v) => (simMat.uniforms.uDt.value = v),
      info: "Sim time step. Lower is slower and smoother, higher is faster and more chaotic.",
    },
    {
      label: "kernel R",
      min: 4.0, max: 24.0, step: 0.5,
      get: () => simMat.uniforms.uR.value,
      set: (v) => (simMat.uniforms.uR.value = v),
      info: "Feature size of the organism, in voxels — the scale of the tunnels themselves. Bigger R, wider tunnels.",
    },
    {
      label: "growth μ",
      min: 0.05, max: 0.4, step: 0.001,
      get: () => simMat.uniforms.uMu.value,
      set: (v) => (simMat.uniforms.uMu.value = v),
      info: "Growth center — the neighborhood density a voxel most wants. The knob that decides who lives; retune after big R changes.",
    },
  ];

  // Stackable post-process effects, shown as the lit toggle bar above the
  // sliders. Multi-select: flip on both to stack them. Add more here as we build
  // more screen-space shaders.
  const toggles = [
    {
      label: "dithering",
      get: () => ditherOn,
      set: (on) => { ditherOn = on; applyDither(); },
    },
    {
      label: "halftone",
      get: () => d.uHalftone.value > 0.5,
      set: (on) => (d.uHalftone.value = on ? 1.0 : 0.0),
    },
    {
      label: "stars",
      get: () => d.uStars.value > 0.5,
      set: (on) => (d.uStars.value = on ? 1.0 : 0.0),
    },
  ];

  return {
    controls,
    toggles,
    render(elapsed) {
      frame++;
      if (frame <= WARMUP || frame % SIM_EVERY === 0) step();

      // Advance the drift along the current look direction.
      const delta = Math.min(elapsed - lastElapsed, 0.1); // clamp tab-switch jumps
      lastElapsed = elapsed;
      if (uDrift > 0) {
        const cp = Math.cos(d.uPitch.value);
        forward.set(
          Math.sin(d.uYaw.value) * cp,
          Math.sin(d.uPitch.value),
          -Math.cos(d.uYaw.value) * cp
        );
        driftOffset.addScaledVector(forward, uDrift * delta);
      }
      d.uCamPos.value.copy(base).add(driftOffset);

      d.uState.value = targets.read.texture;
      d.uAspect.value = (sizes.width || 1) / (sizes.height || 1);
      stage.pass(displayMat, null);
    },
    dispose() {
      if (typeof window !== "undefined" && activeCam) {
        // Only clear the global if it still points at this instance.
        activeCam = null;
        window.leniaCam = () => console.warn("[leniaCam] no tunnel canvas mounted");
      }
      targets.dispose();
      blur.dispose();
      stage.dispose();
    },
  };
}
