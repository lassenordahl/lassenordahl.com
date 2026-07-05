// Shared substrate for the *volumetric* sketches (volume-cell, volume-lenia).
//
// WebGL has no 3D render targets we can ping-pong easily, so a cube of voxels is
// flattened into a 2D **atlas**: V z-slices laid out in a TILES×TILES grid, so
// the whole volume lives in one ordinary 2D texture and reuses createPingPong
// untouched. The addressing math, the irregular seed, and the raymarched cube
// presentation are identical across every volumetric sketch — only the sim
// *rule* differs — so they live here and the sketches just supply their SIM_FRAG.
//
// See kit.js for the 2D fullscreen substrate these build alongside.

import { GLSL } from "./kit.js";

// Atlas addressing GLSL, specialized to a given V (voxels/axis) and TILES
// (slice grid; TILES*TILES must be >= V). Injected into a sketch's shaders so
// voxel<->atlas math stays in one place.
//
//   sampleVoxel   — nearest integer voxel, toroidal (the SmoothLife loop).
//   sampleVoxelN  — nearest voxel for *fractional / large* coords, toroidal;
//                   used when sampling a scaled kernel whose offsets aren't unit
//                   voxels (the Lenia loop). mod() makes the wrap robust to any
//                   magnitude, so kernel radii larger than the cube still work.
//   sampleVolume  — trilinear sample at a continuous [0,1]^3 cube position, for
//                   the raymarcher.
//   fragToVoxel   — atlas fragment uv → the integer voxel it represents.
export function volumeAtlas(V, TILES) {
  const ATLAS = V * TILES;
  return /* glsl */ `
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

    // Nearest voxel, toroidal, robust to any (fractional or out-of-range) coord.
    float sampleVoxelN(sampler2D tex, vec3 v) {
      v = mod(floor(v + 0.5), V); // round to nearest, wrap (mod handles negatives)
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
}

// Seed one soft blob in the middle of the cube. uSeedR is its base radius
// (voxels); the surface is displaced by 3D value noise so it starts irregular
// and lumpy instead of a perfect sphere — the rule then organizes from that.
// uSeed randomizes the shape on each drop. `atlas` is the volumeAtlas() chunk.
export function volumeSeedFrag(atlas) {
  return /* glsl */ `
    precision highp float;
    varying vec2 vUv;
    uniform float uSeedR;
    uniform float uSeed;
    ${atlas}

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
}

// Raymarch the volume onto the screen. Cast one ray per pixel into a rotating
// unit cube, intersect the box, march front-to-back accumulating emissive color
// through the shared palette — density glows, dense at the core and fading to
// transparent at the walls, with a white wireframe on the 12 edges so the
// organism reads as pressing against the cube. `atlas` is the volumeAtlas()
// chunk. Uniforms: uState, uAspect, uTime, uDensity.
export function volumeDisplayFrag(atlas) {
  return /* glsl */ `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D uState;
    uniform float uAspect;
    uniform float uTime;
    uniform float uDensity;
    ${atlas}
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
}
