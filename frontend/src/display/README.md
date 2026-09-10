# Display System

Reusable rendering infrastructure for LambdaClock projects.

## Public surface

Import from `./display/index.js`.

- `DisplayCanvas` — Solid canvas surface backed by the shared runtime.
- `LambdaSurface` — adapter for the animated Tromp Lambda renderer.
- `createDisplayRuntime` — direct imperative runtime for custom canvases.
- `createScene` / `displayLayer` — composable scene and layer helpers.
- `drawDotMatrix` — intensity-driven circular or square dot matrix.
- `rasterizeDotText` / `scrollDotRaster` — 5×7 alphanumeric dot-matrix text.
- `drawPixelGrid` — low-resolution pixel/intensity field.
- `drawWave` / `sampleWave` — anti-aliased waveform traces.
- `drawGrid` / `drawPolyline` — supporting geometry.
- `withGlow`, `drawScanlines`, `drawVignette` — composable effects.
- `springStep`, `exponentialSmoothing`, `smoothstep`, `pulse` — animation helpers.

## Runtime behavior

The runtime owns `requestAnimationFrame`, high-DPI scaling, resize observation, tab visibility and viewport visibility. Paused, background-tab and off-screen surfaces sleep instead of continuing empty RAF loops. `persistence` controls temporal frame decay, giving oscilloscope/phosphor-style trails without keeping a separate history buffer.

A scene is any object with a `render(frame)` function. The frame contains `ctx`, CSS-pixel `width`/`height`, `dpr`, `time`, `dt`, `frame`, smoothed `fps`, `reducedMotion`, and the runtime itself. Optional `init`, `resize`, and `destroy` hooks are supported.

`createScene()` can combine multiple `displayLayer()` values. Layers may independently control enable state, alpha and canvas blend mode and may supply their own lifecycle hooks.

## Rules for future projects

1. Keep simulation/math state outside the renderer. Renderers consume state; they should not own project logic.
2. Use CSS pixels inside scene code. The runtime handles DPR transforms.
3. Prefer one runtime per independent display surface.
4. Use persistence for temporal trails, not repeated DOM/canvas allocation.
5. Respect the runtime's pause/visibility lifecycle instead of starting independent RAF loops.
6. Use `LambdaSurface` instead of copying LambdaDisplay internals into projects.
7. Use scene layers for independent grids, traces, particles, labels and effects instead of one monolithic renderer.
8. Keep the library monochrome by default; projects may layer their own visual treatment later.
