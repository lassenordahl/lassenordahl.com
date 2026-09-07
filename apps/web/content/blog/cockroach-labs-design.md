---
title: Cockroach Labs Design
date: 2026-06-28
---

When I was at Cockroach working on the growth team, I remember having a few conversations with the head of brand design about updating the marketing website. Personally I felt that the canvases of solid color we were doing didn't really _feel_ like something CockroachDB would represent.

I felt pretty inspired by Arsiliaths twitter posts on using web compute shaders to simulate cellular automata. This felt like something subtle that would match the feeling of what CockroachDB was supposed to do, iteratively grow and resize to fit any need.

Anyway, fast forward 2-3 years and I don't work there anymore, but I do regret not going ahead and making it without asking.

<div class="palette-logo">
  <img class="palette-logo-bug" src="/images/blog/cockroach-labs/logo-bug.svg" alt="" />
  <span class="palette-logo-word">Cockroach Labs</span>
</div>

<div class="palette">
  <div class="palette-swatch"><div class="palette-chip" style="background:#0037A5"></div><span class="palette-hex" style="color:#0037A5">#0037A5</span></div>
  <div class="palette-swatch"><div class="palette-chip" style="background:#6933FF"></div><span class="palette-hex" style="color:#6933FF">#6933FF</span></div>
  <div class="palette-swatch"><div class="palette-chip" style="background:#8D42FF"></div><span class="palette-hex" style="color:#8D42FF">#8D42FF</span></div>
  <div class="palette-swatch"><div class="palette-chip" style="background:#EC4899"></div><span class="palette-hex" style="color:#EC4899">#EC4899</span></div>
  <div class="palette-swatch"><div class="palette-chip" style="background:#FF70FF"></div><span class="palette-hex" style="color:#FF70FF">#FF70FF</span></div>
  <div class="palette-swatch"><div class="palette-chip" style="background:#00FCED"></div><span class="palette-hex" style="color:#00FCED">#00FCED</span></div>
</div>

For example, smoothlife can provide some more organic gradients than the general translated 2D meshes viewed at an angle.

<div class="blog-canvas" data-sketch="smoothlife"></div>

We can also seed it with various starting sizes of a fragment, but provided the same settings we'll eventually stabilize on the same view.

<div class="blog-canvas" data-sketch="single-cell"></div>

Lenia shaders apply additional smoothing, and was discovered as recently as 2018. This results in less chains, and more organic individual rings.

<div class="blog-canvas" data-sketch="lenia"></div>

We can even build this in the context of a volume, with 3D voxels. Just the same rule running in three dimensions, one organism growing inside a cube via raymarching.

<div class="blog-canvas" data-sketch="volume-cell"></div>

Upping a Kernel feature size results in larger connective blocks within the cube.

<div class="blog-canvas" data-sketch="volume-lenia"></div>

What's neat is you can just drop the camera in the center of this, add some more noise, and move forward in perpetuity to get a little bit of a space feel. Very Osmosis Jones.

<div class="blog-canvas" data-sketch="volume-tunnel"></div>
