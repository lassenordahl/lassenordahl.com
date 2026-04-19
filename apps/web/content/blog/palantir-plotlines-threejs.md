---
title: "Frontend Engineering at Palantir: Plotlines in Three.js"
date: "2026-04-07"
thumbnail: "/images/blog/palantir-threejs.avif"
originalUrl: "https://blog.palantir.com/frontend-engineering-at-palantir-plotlines-in-three-js-c0c47f310715"
---

Frontend engineering at Palantir goes far beyond building standard web apps. This post dives into Zodiac — a custom Three.js library powering Gaia, Palantir's 3D geospatial visualization platform for defense and intelligence operations.

## Why 3D?

Mercator projections can't capture altitude, polar distortion, or space object trajectories. 3D rendering unlocks the ability to track satellites, model sensor coverage, and visualize orbital paths in a way that matches how these systems actually operate. With Starlink launching hundreds of satellites annually, tooling has to keep up.

## Architecture

The backend handles data storage, filtering, and heavy computation. The frontend focuses purely on rendering — receiving simplified geometry and styling instructions from Foundry's rendering API. Components like `EarthLine` and `EarthLineGroup` expose a clean React-style API over Three.js primitives, batching lines with matching styles into single GPU draw calls.

## Scaling to Space

Rendering tens of thousands of satellites at once uses instanced meshes — a single Zodiac object that handles all satellites in one GPU draw call. Orbit paths are computed from Two-Line Elements (TLEs), a 1960s encoding format for orbital parameters. Rather than recomputing full paths every frame, a circular buffer slides forward through time: points falling off the front get recalculated for the next block at the back, cutting SGP4 propagations by ~95%.

Lines of sight between satellite pairs check for ray-ellipsoid intersection with Earth each frame. If Earth blocks the path, the line hides via opacity rather than geometry removal.

## Time Filtering and Animation

Flight paths, ship tracks, and sensor coverage windows all have temporal data. Instead of rebuilding geometry as users scrub through time, visibility is managed in shaders: geometry builds once, and per-segment opacity buffers flip between 0 and 1 based on filter functions evaluated each frame.

For state-driven animations, callbacks receive `currentTime` and `elapsedTime` on every frame via `onPrerender` hooks. Lines can pulse while awaiting confirmation, then ease to solid color once confirmed — without touching vertex data, only material properties.

## Looking Forward

The team is working toward full Foundry rendering property support in 3D: historical sensor ranges becoming 3D volumes, projected area workflows at poles, and ground object models to solar system-spanning maps. The same visualization flexibility that exists in 2D is coming to 3D.
