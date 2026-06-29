// SmoothLife — a continuous-domain generalization of Conway's Game of Life
// (Rafler 2011), run as a WebGL fragment-shader cellular automaton.
//
// The state is a single scalar field f in [0,1] stored in a render target.
// Each step samples a neighborhood (inner disk + outer annulus), computes the
// two local averages (m = inner fill, n = outer fill), and feeds them through
// a stack of sigmoids to decide birth/death. We ping-pong between two float
// targets so each frame reads the previous state and writes the next.
//
// Returned to the canvas manager as { render, dispose } so this sketch owns
// its multi-pass render loop instead of the manager's single render call.

import * as THREE from "three";

// Simulation grid. Aspect ~matches the hero canvas (608/460). Run at high res
// so structure is fine-grained, then bicubic-upscaled on display so there are
// no visible texels. The neighborhood loop is the expensive part.
const SIM_W = 720;
const SIM_H = 540;

// Fullscreen clip-space quad — camera-independent.
const QUAD_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

// Seed the field with soft value-noise blobs (~organism scale) so structure
// has something to organize out of rather than uniform static.
const SEED_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uSeed;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    float a = hash(i), b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  void main() {
    float n = vnoise(vUv * 14.0 + uSeed);
    n += 0.5 * vnoise(vUv * 28.0 + uSeed * 1.7);
    n /= 1.5;
    float s = smoothstep(0.46, 0.62, n);
    gl_FragColor = vec4(vec3(s), 1.0);
  }
`;

// One SmoothLife step. Rafler "SmoothTimestepRules": linearized birth/death
// intervals, hard alive/dead split on the inner disk, and euler integration
// toward the transition target — this is what makes the field evolve as smooth,
// fluid organisms that hold mid-tones (instead of snapping to 0/1).
const SIM_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uState;
  uniform vec2 uResolution;
  uniform float uDt;

  const float ri = 5.0;         // inner radius
  const float ra = 15.0;        // outer radius (ra = 3 * ri is load-bearing)
  const float logres = 6.0;     // logistic kernel edge softness
  const float b1 = 0.254;       // birth window lower
  const float b2 = 0.312;       // birth window upper
  const float d1 = 0.340;       // survival window lower
  const float d2 = 0.518;       // survival window upper
  const float alphaN = 0.028;   // interval softness

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

// Map the continuous state through the Cockroach Labs design-system palette
// (blue -> purple -> violet -> pink -> magenta -> teal), fading to black where
// the field is empty.
const DISPLAY_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uState;
  uniform vec2 uResolution;

  // Catmull-Rom bicubic upscaling — smooth, no bilinear diamond artifacts.
  vec4 cubic(float v) {
    vec4 n = vec4(1.0, 2.0, 3.0, 4.0) - v;
    vec4 s = n * n * n;
    float x = s.x;
    float y = s.y - 4.0 * s.x;
    float z = s.z - 4.0 * s.y + 6.0 * s.x;
    float w = 6.0 - x - y - z;
    return vec4(x, y, z, w) * (1.0 / 6.0);
  }
  float textureBicubic(sampler2D tex, vec2 uv, vec2 texSize) {
    vec2 invSize = 1.0 / texSize;
    uv = uv * texSize - 0.5;
    vec2 fxy = fract(uv);
    uv -= fxy;
    vec4 xc = cubic(fxy.x);
    vec4 yc = cubic(fxy.y);
    vec4 c = uv.xxyy + vec2(-0.5, 1.5).xyxy;
    vec4 s = vec4(xc.xz + xc.yw, yc.xz + yc.yw);
    vec4 offset = c + vec4(xc.yw, yc.yw) / s;
    offset *= invSize.xxyy;
    float s0 = texture2D(tex, offset.xz).r;
    float s1 = texture2D(tex, offset.yz).r;
    float s2 = texture2D(tex, offset.xw).r;
    float s3 = texture2D(tex, offset.yw).r;
    float sx = s.x / (s.x + s.y);
    float sy = s.z / (s.z + s.w);
    return mix(mix(s3, s2, sx), mix(s1, s0, sx), sy);
  }

  vec3 palette(float t) {
    vec3 c0 = vec3(0.000, 0.216, 0.647); // #0037A5
    vec3 c1 = vec3(0.412, 0.200, 1.000); // #6933FF
    vec3 c2 = vec3(0.553, 0.259, 1.000); // #8D42FF
    vec3 c3 = vec3(0.925, 0.282, 0.600); // #EC4899
    vec3 c4 = vec3(1.000, 0.439, 1.000); // #FF70FF
    vec3 c5 = vec3(0.000, 0.988, 0.929); // #00FCED
    t = clamp(t, 0.0, 1.0) * 5.0;
    if (t < 1.0) return mix(c0, c1, t);
    if (t < 2.0) return mix(c1, c2, t - 1.0);
    if (t < 3.0) return mix(c2, c3, t - 2.0);
    if (t < 4.0) return mix(c3, c4, t - 3.0);
    return mix(c4, c5, t - 4.0);
  }
  void main() {
    float v = textureBicubic(uState, vUv, uResolution);
    v = pow(clamp(v, 0.0, 1.0), 0.7); // gamma — spread the mid-tones
    vec3 col = palette(v) * smoothstep(0.0, 0.22, v);
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function smoothlife({ renderer }) {
  const rtOpts = {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.RepeatWrapping, // toroidal world
    wrapT: THREE.RepeatWrapping,
    depthBuffer: false,
    stencilBuffer: false,
  };
  let rtA = new THREE.WebGLRenderTarget(SIM_W, SIM_H, rtOpts);
  let rtB = new THREE.WebGLRenderTarget(SIM_W, SIM_H, rtOpts);

  const scene = new THREE.Scene();
  const cam = new THREE.Camera();
  const geometry = new THREE.PlaneGeometry(2, 2);
  const quad = new THREE.Mesh(geometry, null);
  scene.add(quad);

  const seedMat = new THREE.ShaderMaterial({
    vertexShader: QUAD_VERT,
    fragmentShader: SEED_FRAG,
    uniforms: { uSeed: { value: Math.random() * 1000.0 } },
  });
  // Slow evolution. dt is the main "time" knob — lower is slower & smoother.
  const LIVE_DT = 0.05;
  const simMat = new THREE.ShaderMaterial({
    vertexShader: QUAD_VERT,
    fragmentShader: SIM_FRAG,
    uniforms: {
      uState: { value: null },
      uResolution: { value: new THREE.Vector2(SIM_W, SIM_H) },
      uDt: { value: LIVE_DT },
    },
  });
  const displayMat = new THREE.ShaderMaterial({
    vertexShader: QUAD_VERT,
    fragmentShader: DISPLAY_FRAG,
    uniforms: {
      uState: { value: null },
      uResolution: { value: new THREE.Vector2(SIM_W, SIM_H) },
    },
  });

  const pass = (material, target) => {
    quad.material = material;
    renderer.setRenderTarget(target);
    renderer.render(scene, cam);
  };

  // Seed the initial state into rtA.
  pass(seedMat, rtA);
  let cur = rtA;
  let next = rtB;

  const step = () => {
    simMat.uniforms.uState.value = cur.texture;
    pass(simMat, next);
    const tmp = cur;
    cur = next;
    next = tmp;
  };

  // Warm up at a faster dt so the field is already organized on first paint,
  // then drop to the slow live dt.
  simMat.uniforms.uDt.value = 0.15;
  for (let i = 0; i < 30; i++) step();
  simMat.uniforms.uDt.value = LIVE_DT;

  return {
    render() {
      step();

      // Draw the current state to the screen through the palette.
      displayMat.uniforms.uState.value = cur.texture;
      quad.material = displayMat;
      renderer.setRenderTarget(null);
      renderer.render(scene, cam);
    },
    dispose() {
      rtA.dispose();
      rtB.dispose();
      geometry.dispose();
      seedMat.dispose();
      simMat.dispose();
      displayMat.dispose();
    },
  };
}
