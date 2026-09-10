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
- `createRingBuffer`, `findTriggerIndex`, `triggerWindow` — acquisition/trigger helpers.
- `sampleSignal`, `fftReal`, `magnitudeSpectrum`, `dominantFrequency` — dependency-free DSP helpers.
- `hannWindow`, `normalizeSpectrum`, `nextPowerOfTwo` — spectrum support.

## High-resolution rendering

There are two high-resolution paths.

`HighResCanvas` is for a live display that should render at more backing pixels than the screen normally requires. Its `resolutionScale` multiplies the device pixel ratio while the scene continues to draw in CSS/logical pixels. The runtime caps the final DPR with `maxDpr` to avoid accidental giant allocations.

`createHighResCanvas` / `renderHighRes` are for off-screen or export-quality rendering. A project requests a logical width, height and scale; the helper returns a canvas whose backing store can reach high pixel counts while the drawing callback still uses logical coordinates. `resolveHighResSize` clamps safely against `maxDimension` and `maxPixels`, and `highResBlob` converts the result to an image blob when the browser supports it.

## Oscilloscope model

`Oscilloscope` accepts one or more continuous sample functions. It samples a moving time window, searches the primary channel for a rising/falling threshold crossing, aligns that crossing to the requested pre-trigger position, then draws all channels against the same acquired window. The display supports persistence, multiple channels, graticule, glow, scanlines and high-DPI rendering.

For a project that already owns sampled data, use `createRingBuffer`, `findTriggerIndex`, `triggerWindow` and `drawOscilloscope` directly. `drawXYScope` provides phase-space/Lissajous rendering from X and Y sample arrays.

## Runtime behavior

The runtime owns `requestAnimationFrame`, high-DPI scaling, resize observation, tab visibility and viewport visibility. Hidden/paused surfaces truly stop scheduling RAF work. `resolutionScale` controls supersampling independently of logical scene coordinates. `persistence` controls temporal frame decay, giving oscilloscope/phosphor-style trails without a separate frame-history buffer.

A scene is any object with a `render(frame)` function. The frame contains `ctx`, CSS-pixel `width`/`height`, `pixelWidth`/`pixelHeight`, effective `dpr`, `time`, `dt`, `frame`, smoothed `fps`, `reducedMotion`, and the runtime itself. Optional `init`, `resize`, and `destroy` hooks are supported.

## Rules for future projects

1. Keep simulation/math state outside the renderer. Renderers consume state; they should not own project logic.
2. Use logical/CSS pixels inside scene code. The runtime handles DPR and supersampling transforms.
3. Prefer one runtime per independent display surface.
4. Use persistence for temporal trails, not repeated DOM/canvas allocation.
5. Respect the runtime's pause/visibility lifecycle instead of starting independent RAF loops.
6. Use `LambdaSurface` instead of copying LambdaDisplay internals into projects.
7. Use `Oscilloscope` for instrument behavior; use `drawWave` for ordinary plots.
8. Keep FFT sizes bounded and power-of-two for live displays.
9. Use `resolveHighResSize` before large off-screen renders; do not assume every browser accepts arbitrary canvas dimensions.
10. Keep the library monochrome by default; projects may layer their own visual treatment later.
