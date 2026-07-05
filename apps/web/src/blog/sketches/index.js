// Registry of blog-canvas sketches, keyed by the `data-sketch` attribute used
// in markdown: <div class="blog-canvas" data-sketch="smoothlife"></div>.
//
// This is the one place you touch to add a visualization — the manager
// (../canvases.js) never changes. To add one:
//   1. Write ./my-sketch.js exporting a factory (see spinning-cube.js for the
//      simple shape, smoothlife.js for the shader/compute shape; both build on
//      ./kit.js so you only write what's new).
//   2. Import it and add a line to SKETCHES below.
//   3. Drop the <div class="blog-canvas" data-sketch="my-sketch"> in the post.

import { spinningCube } from "./spinning-cube.js";
import { smoothlife } from "./smoothlife.js";
import { singleCell } from "./single-cell.js";
import { volumeCell } from "./volume-cell.js";
import { volumeLenia } from "./volume-lenia.js";
import { volumeTunnel } from "./volume-tunnel.js";
import { lenia } from "./lenia.js";

export const SKETCHES = {
  "spinning-cube": spinningCube,
  smoothlife,
  "single-cell": singleCell,
  lenia,
  "volume-cell": volumeCell,
  "volume-lenia": volumeLenia,
  "volume-tunnel": volumeTunnel,
};
