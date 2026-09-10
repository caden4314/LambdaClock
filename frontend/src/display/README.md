# Display System

Reusable rendering infrastructure for LambdaClock projects.

## Public surface

Import from `./display/index.js`.

Core surfaces:
- `DisplayCanvas` — Solid canvas surface backed by the shared runtime.
- `HighResCanvas` — on-screen supersampled canvas with an independent resolution scale.
- `LambdaSurface` — adapter for the animated Tromp Lambda renderer.
- `Oscilloscope` — triggered multi-channel time-domain instrument display.
- `SpectrumDisplay` — FFT/Hann-window frequency-domain display.
- `createDisplayRuntime` — direct imperative runtime for custom canvases.
- `getDisplaySchedulerStats` — shared-vsync refresh/load/active-surface telemetry.

Drawing and effects:
- `drawDotMatrix` / `rasterizeDotText` — intensity-driven dot matrices and 5x7 text.
- `drawPixelGrid` — low-resolution pixel/intensity fields.
- `drawWave` / `sampleWave` — simple anti-aliased waveform traces.
- `drawOscilloscope` / `drawScopeGraticule` / `drawXYScope` — scope primitives.
- `drawFunctionPlot` / `drawVectorField` / `drawAxes` — Cartesian math displays.
- `drawGrid` / `drawPolyline` — supporting geometry.
- `withGlow`, `drawScanlines`, `drawVignette` — composable effects.
- `springStep`, `exponentialSmoothing`, `smoothstep`, `pulse` — animation helpers.
- `displayLayer` / `createScene` — independent composable scene layers.

Signal/math helpers:
- `createRingBuffer`, `findTriggerIndex`, `findTriggerAnchor`, `triggerWindow` — acquisition/trigger helpers.
- `sampleSignal`, `sampleSignalInto` — allocating and buffer-reuse signal sampling paths.
- `createFFTPlan`, `createSpectrumAnalyzer` — reusable planned FFT/spectrum pipelines.
- `fftReal`, `magnitudeSpectrum`, `dominantFrequency` — convenience DSP helpers.
- `hannWindow`, `normalizeSpectrum`, `nextPowerOfTwo` — spectrum support.

## Performance model

All ordinary display runtimes share one `requestAnimationFrame` scheduler. A page with many displays therefore has one browser-vsync callback rather than one independent RAF loop per canvas. The scheduler measures detected refresh period, total display work and active surface count.

Resize work is event-driven through `ResizeObserver`; the hot render path does not call `getBoundingClientRect()` every frame. Hidden, paused and background-tab surfaces unsubscribe from the shared scheduler and perform no frame work.

`DisplayCanvas` runs at native vsync by default. `maxFps` can impose an explicit cap when a project needs one. Adaptive resolution measures per-surface render cost plus total scheduler load and can reduce backing resolution before frame time collapses. `maxPixels`, `maxDpr`, `resolutionScale` and `minQuality` bound that behavior.

Live renderers should reuse typed buffers. The oscilloscope keeps its channel buffers and view objects, while `SpectrumDisplay` performs FFT analysis independently from presentation frames. `createFFTPlan` caches bit-reversal/twiddle tables and `createSpectrumAnalyzer` reuses all transform/output buffers. Expensive effects reduce themselves as adaptive quality falls.

## High-resolution rendering

There are two high-resolution paths.

`HighResCanvas` is for a live display that should render at more backing pixels than the screen normally requires. Its `resolutionScale` multiplies the device pixel ratio while the scene continues to draw in CSS/logical pixels. Live resolution is also bounded by a pixel budget and can adapt downward under load so supersampling does not destroy frame pacing.

`createHighResCanvas` / `renderHighRes` are for off-screen or export-quality rendering. A project requests a logical width, height and scale; the helper returns a canvas whose backing store can reach high pixel counts while the drawing callback still uses logical coordinates. `resolveHighResSize` clamps safely against `maxDimension` and `maxPixels`, and `highResBlob` converts the result to an image blob when the browser supports it.

## Oscilloscope model

`Oscilloscope` accepts one or more continuous sample functions. It samples a moving time window into reusable typed buffers, searches the primary channel for a rising/falling threshold crossing, aligns that crossing to the requested pre-trigger position, then draws all channels against the same acquired window. The display supports persistence, multiple channels, graticule, glow, scanlines and high-DPI rendering.

For a project that already owns sampled data, use `createRingBuffer`, `findTriggerIndex`, `findTriggerAnchor`, `triggerWindow` and `drawOscilloscope` directly. Typed-array trigger windows remain typed views rather than being copied into ordinary arrays. `drawXYScope` accepts a reusable buffer plus a count/start range for phase-space/Lissajous rendering.

## Runtime frame

A scene is any object with a `render(frame)` function. The frame contains `ctx`, CSS-pixel `width`/`height`, `pixelWidth`/`pixelHeight`, effective `dpr`, `time`, `dt`, `frame`, smoothed `fps`, adaptive `quality`, `reducedMotion`, the runtime, and current shared scheduler stats. Optional `init`, `resize`, and `destroy` hooks are supported.

## Rules for future projects

1. Keep simulation/math state outside the renderer. Renderers consume state; they should not own project logic.
2. Use logical/CSS pixels inside scene code. The runtime handles DPR and supersampling transforms.
3. Let displays use the shared vsync scheduler; do not start project-specific RAF loops.
4. Reuse typed arrays/objects in hot paths instead of creating arrays every frame.
5. Update heavy analysis at its mathematically useful rate, then present cached results at vsync.
6. Use persistence for temporal trails, not repeated DOM/canvas allocation.
7. Respect pause/visibility lifecycle so hidden work truly sleeps.
8. Use `LambdaSurface` instead of copying LambdaDisplay internals into projects.
9. Use `Oscilloscope` for instrument behavior; use `drawWave` for ordinary plots.
10. Keep FFT sizes bounded and power-of-two for live displays; prefer `createSpectrumAnalyzer` for repeated transforms.
11. Use `resolveHighResSize` before large off-screen renders; do not assume every browser accepts arbitrary canvas dimensions.
12. Keep the library monochrome by default; projects may layer their own visual treatment later.
