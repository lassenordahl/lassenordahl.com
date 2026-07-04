---
title: Cockroach Labs Design
date: 2026-06-28
---

When I was at Cockroach working on the growth team, I remember having a few conversations with the head of brand design about updating the marketing website. Personally I felt that the canvases of solid color we were doing didn't really _feel_ like something CockroachDB would represent.

I felt pretty inspired by Arsiliaths twitter posts on using web compute shaders to simulate cellular automata. This felt like something subtle that would match the feeling of what CockraochDB was supposed to do, iteratively grow and resize to fit any need.

Anyway, fast forward 2-3 years and I don't work there anymore, but I do regret not going ahead and making it without asking. This is meant to be a redesign path for what I would have wanted there.

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



<div class="blog-canvas" data-sketch="lenia"></div>

We can even take it fully volumetric. Apply the same rule running in three dimensions, one organism growing inside a cube, raymarched.

<div class="blog-canvas" data-sketch="volume-cell"></div>
