---
title: "Frontend Engineering at Palantir: Plotlines in Three.js"
date: "2026-04-07"
thumbnail: "/images/blog/palantir-threejs.avif"
originalUrl: "https://blog.palantir.com/frontend-engineering-at-palantir-plotlines-in-three-js-c0c47f310715"
---

## About this Series

Frontend engineering at Palantir goes far beyond building standard web apps. Our engineers design interfaces for mission-critical decision-making, build operational applications that translate insight to action, and create systems that handle massive datasets — thinking not just about what the user needs, but what they need when the network is unreliable, the stakes are high, and the margin for error is zero.

This series pulls back the curtain on what that work really looks like: the technical problems we solve, the impact we have, and the approaches we take. Whether you're just curious or exploring opportunities to join us, these posts offer an authentic look at life on our Frontend teams.

In this blog post, Lasse, a frontend engineer based in NY, shares an overview of various 3D workflows engineers at Palantir work on and some unique challenges to handle performance. Stay tuned for Part 5.

Last September marked five years since Stripe started a cinematic universe of globes to render live purchase orders on their platform. GitHub threw its hat in the ring three and a half months later with their own, where they showed connection lines between the location a PR was opened and the place it merged.

As it turns out, plenty of companies have geospatial data flying around in realtime. It's often a very compelling way to show how far data is traveling over a network or how a company operates in a wider space than it's hosted. In the case of Palantir, Gotham lands in the same neighborhood. A huge focus for frontend engineers here is rendering Ontology objects with geospatial properties on an app called Gaia to visualize defense and intelligence operations. Or to put more simply, "render anything and everything".

Recently, our team has been developing a 3D implementation of Gaia. It's powered by Zodiac, a library we built using Three.js, along with a set of Foundry-based APIs that generalize rendering. In short, any "object" that exists in a Foundry Ontology with a piece of location data (point, shape, or styles) gets served up in an map rendering API in Gotham.

When I first started at Palantir last year, it was hard to gauge what 3D challenges we would face for our customers. This blog post details some workflows and performance challenges we encountered, and our approach to solving them in a browser accessible to anyone in the DOD. The examples include some over-simplifications for illustrative purposes.

## 3D Gaia

3D introduces a new dimension for users to experience geospatial data. It allows users to gain a conceptual understanding of spaces as the real world will see it. Rendering objects at altitude, resolving issues with polar distortion, and objects in space all require a visualization of space that a mercator projection can't provide.

For example, Starlink contributes to hundreds of satellite launches a year. Near misses, orbit projections, and space debris are all things in the bucket of tracking that various Gaia users would need to visualize. Often these 3D workflows require the same tooling as 2D for briefs and visualizations.

## Zodiac and Our Big Sphere

The architecture splits cleanly: the backend handles data storage, filtering, and heavier computation, while the frontend focuses on rendering. Our backend sends down simplified geometry and style information — the client doesn't need to know how the data was computed, just where to draw it and what it should look like.

With that serving layer in place (and skipping over the work to get there), we have a suite of components to place something in a location and see it. We grab generalized renderables from our API and render them on the map across every frame.

```typescript
interface EarthLineItem {
  id?: string;
  points: LatLngHeight[];
  color?: string;
}

interface LineVisualProps {
  color?: string;
  lineWidth?: number;
  opacity?: number;
  dashed?: boolean;
}
```

Using those interfaces, drawing a line is straightforward:

```typescript
<EarthLine
  points={[
    { lat: 40.7128, lng: -74.0060, height: 10_000 },
    { lat: 38.9072, lng: -77.0369, height: 10_000 },
  ]}
  color="#3b82f6"
  lineWidth={2}
/>
```

These create a building blocks by which we can explore very complex projects. High density sets of lines can be aggregated by grouped geometries, custom colors and styling can change the style of the lines, and visibility can be toggled based on time or other filters without rebuilding geometry.

The EarthLineGroup batches lines by style into single draw calls. 10,000 lines with the same styling become one GPU operation.

```typescript
<EarthLineGroup>
  {flights.map((flight) => (
    <EarthLine
      key={flight.id}
      points={flight.waypoints}
      color={flight.airline.color}
      lineWidth={1}
      onPick={(picked) => picked && setSelectedFlight(flight.id)}
    />
  ))}
</EarthLineGroup>
```

Under the hood of Zodiac, objects above are built via classes that implement a ZodiacObject, which abstracts managing the position on the globe with rotation, coordinates, and changes per frame. Using that, object implementation can focus entirely on properties that are relevant to the rendered object like visuals and positioning.

```typescript
interface ZodiacObject {
  // Called on initialization of the object into the scene.
  onAdd(context: ZodiacContext): void;

  // Called each frame, to allow for changes on the object.
  onRender?(context: ZodiacContext): void;
}

class EarthLine implements ZodiacObject {
  private geometry: LineGeometry;
  private material: LineMaterial;
  private mesh: Line;

  constructor(points: LatLngHeight[], color: string) {
     this.geometry = new LineGeometry();
     this.material = new LineMaterial({ color });
     this.mesh = new Line(this.geometry, this.material);

     // Convert lat/lng to Earth-fixed coordinates once.
     const ecefPositions = points.map(p => latLngToEcef(p));
     this.geometry.setPositions(ecefPositions);
  }

  onAdd(context: ZodiacContext): void {
     // Add to Earth-fixed scene — stays pinned to geography.
     context.ecefScene.add(this.mesh);
  }

  onRender(context: ZodiacContext): void {
     // Update visibility, animate, respond to time changes, etc.
  }
}
```

## Zooming out to Space

High density visualizations of satellite positions push the performance capabilities of graphics on the browser. With tens of thousands of objects circling around the globe, we used an instanced mesh to update objects on and off the map, and recompute the positions of the nearest Satellites the fastest. This instanced mesh exists under a singular Zodiac Object, but renders thousands of satellites (or any object of the same geometry) in the same draw call frame.

```typescript
class SatelliteRenderer extends ZodiacObject {
  private satellites: string[] = [];
  private currentBatch = 0;
  private batchSize = 1_000;
  private mesh: InstancedMesh;

  public onRender(time: number): void {
    const batch = this.getSatelliteBatch(this.currentBatch);
    for (const satellite of batch) {
      this.updatePosition(satellite, time);
    }
    this.currentBatch = this.nextBatch();
  }

  private updatePosition(satellite: string, time: number): void {
    const position = this.propagateSgp4Position(satellite, time);
    this.mesh.setPositionAt(satellite, position);
  }

  // Later code blocks leverage our satellite mesh to "attach" to
  // the current position and corresponding TLE used on the map.
  public getPosition(satellite: string, out: Vector3): void {
    this.mesh.getPositionAt(satellite, out);
  }
}
```

Positioning work is different in space as well. Earth-bound orbits can be propagated using Two-Line Elements (TLEs), a format dating back to the 1960s that encodes orbital parameters in two 69-character lines. The client handles basic propagation for rendering, but heavier orbital math like collision analysis, long-term predictions, maneuver planning runs server-side on Foundry compute modules.

## Lines as an Orbit Path

When you're looking at objects that have positioning as a function of time, it's often helpful to see where the object will be in T units of time. For our visualizations, we allow selected satellites to show their positioning around and on the Earth's surface to estimate their pathing. However, this ends up being expensive.

We started off calculating the path for ~2 days on selection, but every frame would cause an entirely new propagation moving forward. This worked for single use cases, but buckled with weaker hardware or multiple selected objects.

Because we're looking at a function of time, most of the propagation can be re-used. With some abstractions, we can share the orbit position across any object that needs it, and calculate new sections as time passes.

```typescript
abstract class OrbitPath extends ZodiacObject {
  private geometry: LineGeometry;
  private material: LineMaterial;
  protected points: CircularBuffer<TrackPoint>;
  protected timePerPoint: number;

  public onRender(time: number): void {
    if (this.needsFullRecompute(time)) {
      this.computeFullOrbit(time);
      return;
    }
    this.advanceQueue(time);
  }

  private advanceQueue(time: number): void {
    while (this.points.head().timestamp < time) {
      const point = this.points.shift();
      point.timestamp = this.lastTimestamp() + this.timePerPoint;
      point.position = this.propagatePosition(point.timestamp);
      this.points.push(point);
    }
  }
}
```

The queue slides forward through time. When a point falls off the front, we recalculate it for the next block at the back. With the old approach, our map would need to perform thousands of SGP4 propagations per second. With the queue, we can drop 95% of calculations made for each selected object.

This ends up allowing many more orbit paths to render at once. Seated next to our satellite mesh, we can listen for TLE updates as users scrub through time to ensure we're using the correctly propagated element.

## Lines of Sight

It's also helpful to show a line of sight between sets of satellites and terrestrial objects. Often satellites work in systems, and visualizing "links" between them is useful. Certain configurations of satellites will only render pairing lines when they don't have the Earth between them.

With the same Satellite helper objects from before, it is now easier to translate a similar connection line.

```typescript
class SatelliteConnectionLine extends ZodiacObject {
  private geometry: LineGeometry;
  private material: LineMaterial;

  constructor(
    private primarySatellite: string,
    private secondarySatellite: string,
    private getPosition: (id: string) => Vector3
  ) {}

  public onRender(): void {
    const posA = this.getPosition(this.primarySatellite);
    const posB = this.getPosition(this.secondarySatellite);

    const visible = this.hasLineOfSight(posA, posB);

    if (visible) {
      this.geometry.setPositions([posA, posB]);
    }
    this.material.opacity = visible ? 1.0 : 0.0;
  }
}
```

Each frame, we grab the current positions from a shared context and check line of sight. It's a ray-ellipsoid intersection test: If the ray between two satellites intersects Earth, we hide the line.

## Sensor Visualizations, with Angles

The last lines we drew for satellite work involved sensor visualizations. Visualizing satellite capabilities involved a more complex set of lines. We created a 3D polygon that matches the movement of the satellite, and has various specs to match the orientation, sizing, and capabilities. Often more "complex" shapes are an aggregation of multiple primitive shapes. In the case of sensors, we constructed a frame of lines and some opaque planes to show that coverage area.

Since the satellite orbits the earth, our earth swath should match where the sensor could scan across its entire orbit. The correct path for this is an aggregation of the satellites position, earths rotation, aim at the earth, and any properties of sensor rotation. After combining that into a single object, the result was a track more aligned with the sensor "capability" rather than an approximate flyover.

Often, the fastest workflow for this was brainstorming steps in a notebook, and then passing off the math to an LLM with some tests.

After calculating the max width, building polygons between the raycasted points, and propagating, you're left with a relatively accurate representation of what a satellite could see. The satellite would then match closer to the path as the timestamps changed.

Visualizations are based on completely notational sensor specs.

## Back on Earth

Gotham as a platform builds many abstractions for common patterns and data shapes. As our 3D library increases in complexity, it needs to pick up APIs that match Foundry data sources and already render in our 2D scenes.

This can involve a suite of temporal and property-based data, but the cost of render changes is heavier due to rendering large sets of lines in parent collections. This led to a few different implementation approaches to ensure our globe felt fast.

## Time Filterable Lines

Lines often have temporal data attached. A flight path has departure and arrival times, a ship track has observation windows, and sensor coverage has visibility periods. When users scrub through time, lines need to appear and disappear accordingly.

An initial approach could involve culling and rebuilding the geometry every frame. With thousands of lines at 60fps, the client would have a lot of churn reallocating arrays. Instead, we opted to attach a simple filter function, some time-filterable middleware, and a shader to manage the visibility states more efficiently. For Foundry data that natively has temporal interfaces applied, the client can automatically configure these per line.

```typescript
// Most commonly a range function coming from Foundry.
type TimeFilter = (time: number) => boolean;

interface TimeFilterableLine {
  points: LatLngHeight[];
  isVisibleAt?: TimeFilter;
}

const flightPath: TimeFilterableLine = {
  points: waypoints,
  isVisibleAt: (time) => departureTime < time && time < arrivalTime,
};
```

The geometry gets built once. When time changes, we evaluate each filter and update visibility without touching the vertex data. The filters can run every frame, but we only touch the GPU buffer when visibility actually changes:

```typescript
class TimeFilterableLineCollection {
  private geometry: TimeFilterableGeometry;
  private material: TimeFilterableMaterial; // Includes opacity shader.
  private filters: Map<number, TimeFilter> = new Map();
  private visibility: Map<number, boolean> = new Map();

  applyFilters(time: number): void {
    for (const [index, filter] of this.filters) {
      const isVisible = filter(time);
      const wasVisible = this.visibility.get(index) ?? true;

      if (isVisible !== wasVisible) {
        this.geometry.setVisibility(index, isVisible);
        this.visibility.set(index, isVisible);
      }
    }
  }
}

// A custom shader reads opacity and discards invisible fragments.
const fragmentShader = `
  if (opacity < 0.01) discard;  // Gone, not rendered
  gl_FragColor.a *= opacity;
`;
```

When visibility does change, we update a per-segment opacity buffer on the GPU. Each line maps to a range of segments, and we can flip their opacity between 0 and 1:

```typescript
// The geometry stores an opacity value per line in a GPU buffer.
class TimeFilterableGeometry {
  private opacities: Float32Array;

  setVisibility(lineIndex: number, visible: boolean): void {
    this.opacities[lineIndex] = visible ? 1.0 : 0.0;
    this.opacityBuffer.needsUpdate = true;
  }
}
```

## Animated Lines

My favorite iteration cycles across the last year involved exposing APIs to the underlying Gaia map to manipulate the Three.JS objects. We ran across a similar suite of problems with animations. Similar to the lines of sight in space, there are lots of scenarios where users could see different visual variations in their workflow.

In one of our use cases, realtime animations to provide transition states were important for customers keeping a top-level domain awareness of a situation. When managing a high number of units on their map, traditional visualizations using the map became more effective than cards, tables, and toasts.

The API we landed on passes a callback that receives the current time and time since animation start. You return whatever style properties should change:

```typescript
const pulseCallback = (currentTime: number, elapsedTime: number) => {
  const progress = (elapsedTime % 2000) / 2000;
  const pulse = Math.sin(progress * Math.PI * 2) * 0.5 + 0.5;
  return { color: baseColor.clone().lerp(targetColor, pulse) };
};

<AnimatedEarthLine
  points={flightPath}
  animationCallback={pulseCallback}
/>;
```

The callback runs on every frame via an onPrerender hook synced to the 3D render loop. Only material properties update, no geometry rebuilds.

For state-driven animations, the callback can derive its behavior from React state. A line representing a tasking might pulse while awaiting confirmation, then ease to a solid color once confirmed:

```typescript
const animationCallback = useCallback(
  (currentTime: number) => {
    if (phase === "awaiting") {
      return { color: createPulsingColor(baseColor, white, currentTime, 1000) };
    }
    return { color: confirmedColor };
  },
  [phase]
);
```

This keeps the 3D rendering decoupled from UI state while still letting state changes drive visual transitions. Users can take advantage of color changes, flashing, opacity updates, and directional dash changes. Focusing these animations on the underlying visual change, and allowing the platform to leverage property mapping to states keeps the 3D team focused on the underlying implementation without needing to decipher specific workflows.

## Down The Line

Ultimately 3D has many challenges to work through, and we're always iterating on the APIs to hit the right mix of user-friendliness, integration with the broader platform, and performance. These types of features often require monitoring and multiple passes to get right, which is more fun as we onboard new datasources and workflows from our customers.

Looking forward, we're excited about Foundry's support for rendering properties in 3D. Historical visuals of a sensor range in 2D can now land as a volume or point-cloud, and workflows in projected areas like the poles are more readily available. We'll continue on support across all types of data sources the platform has with the goal of users choosing the most effective visualization for their needs. This could be anywhere from object models on the ground to maps spanning the solar system.

Looking back, I'm considering what education has impacted me the most across my work. Given the geospatial focus work that Palantir has, it's unsurprising my middle-school geometry class returns the most dividends week to week.
