// Shared toolkit for blog-canvas sketches.
//
// Most visualizations here are fragment-shader experiments that draw a
// fullscreen quad — often ping-ponging between float render targets to run a
// GPU simulation. That setup is identical every time, so it lives here instead
// of being re-derived per sketch. A new visualization should only have to write
// the part that's actually new (its shaders + wiring); everything below is the
// stable substrate it builds on.
//
// See `smoothlife.js` for a full worked example that uses all of these.

import * as THREE from "three";

// Fullscreen clip-space quad vertex shader. Camera-independent: it ignores the
// projection and just passes uv through. Shared by every shader sketch.
export const FULLSCREEN_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

// Reusable GLSL function chunks. These are function definitions only (no
// precision / varying / uniform lines), so a fragment shader declares its own
// header, drops the chunks in, then defines main():
//
//   const FRAG = `
//     precision highp float;
//     varying vec2 vUv;
//     ${GLSL.palette}
//     void main() { gl_FragColor = vec4(palette(vUv.x), 1.0); }
//   `;
export const GLSL = {
  // hash + value noise → vnoise(vec2) in [0,1]. For seeding fields with soft
  // blobs instead of uniform static.
  noise: /* glsl */ `
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
  `,

  // The Cockroach Labs design-system palette as palette(t), t in [0,1]:
  // blue -> purple -> violet -> pink -> magenta -> teal. The through-line color
  // language for these sketches; use it so they read as a set.
  palette: /* glsl */ `
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
  `,

  // Catmull-Rom bicubic sampling of the red channel:
  // textureBicubic(tex, uv, texSize). Smooth upscaling of a low-res sim texture
  // with no bilinear diamond artifacts.
  bicubic: /* glsl */ `
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
  `,
};

// A fullscreen-quad render stage. Owns a scene / camera / quad mesh and a
// `pass()` that renders a material into a target (or the screen when target is
// null). `shader()` builds a ShaderMaterial already wired to FULLSCREEN_VERT and
// tracks it for disposal. Call `dispose()` in your sketch's dispose().
export function createStage(renderer) {
  const scene = new THREE.Scene();
  const cam = new THREE.Camera();
  const geometry = new THREE.PlaneGeometry(2, 2);
  const quad = new THREE.Mesh(geometry, null);
  scene.add(quad);

  const materials = new Set();

  function shader(fragmentShader, uniforms = {}) {
    const material = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERT,
      fragmentShader,
      uniforms,
    });
    materials.add(material);
    return material;
  }

  function pass(material, target = null) {
    quad.material = material;
    renderer.setRenderTarget(target);
    renderer.render(scene, cam);
  }

  function dispose() {
    geometry.dispose();
    materials.forEach((m) => m.dispose());
    materials.clear();
  }

  return { scene, cam, quad, shader, pass, dispose };
}

// A ping-pong pair of float render targets for GPU simulations: read the
// previous state, write the next, then `swap()`. Defaults are half-float linear
// targets with no depth/stencil; pass `overrides` for e.g. RepeatWrapping to
// make the world toroidal. Call `dispose()` in your sketch's dispose().
export function createPingPong(width, height, overrides = {}) {
  const opts = {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
    stencilBuffer: false,
    ...overrides,
  };
  let read = new THREE.WebGLRenderTarget(width, height, opts);
  let write = new THREE.WebGLRenderTarget(width, height, opts);
  return {
    get read() {
      return read;
    },
    get write() {
      return write;
    },
    swap() {
      const tmp = read;
      read = write;
      write = tmp;
    },
    dispose() {
      read.dispose();
      write.dispose();
    },
  };
}
