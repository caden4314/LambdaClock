import { Application, Container, Graphics } from 'pixi.js';

const TERM_CACHE_LIMIT = 6;
const CUBE_TWEEN_MS = 180;

export class LambdaVisualizer {
  constructor(host, onEvict = null) {
    this.host = host;
    this.onEvict = onEvict;
    this.app = null;
    this.cache = new Map();
    this.clockTermId = null;
    this.cubeTermId = null;
    this.edges = null;
    this.layers = null;
    this.resizeObserver = null;

    this.displayVertices = null;
    this.fromVertices = null;
    this.targetVertices = null;
    this.tweenStart = 0;
    this.raf = 0;
  }

  async init() {
    const app = new Application();
    await app.init({
      background: '#000000',
      antialias: true,
      autoStart: false,
      preference: 'webgl',
      resolution: Math.min(1.35, Math.max(1, devicePixelRatio || 1)),
      autoDensity: true
    });

    this.app = app;
    app.canvas.className = 'pixi-canvas';
    this.host.appendChild(app.canvas);

    const clock = [new Graphics(), new Graphics(), new Graphics()];
    const cube = new Graphics();
    const cubePoints = new Graphics();
    const cubeLambda = [new Graphics(), new Graphics(), new Graphics()];
    const root = new Container();

    for (const layer of clock) root.addChild(layer);
    root.addChild(cube, cubePoints);
    for (const layer of cubeLambda) root.addChild(layer);

    app.stage.addChild(root);
    this.layers = { clock, cube, cubePoints, cubeLambda };

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.host);
    this.resize();
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.resizeObserver?.disconnect();
    this.cache.clear();
    this.app?.destroy(true, { children: true });
  }

  installTerm(id, segments) {
    if (id == null) return;
    if (this.cache.has(id)) this.cache.delete(id);
    this.cache.set(id, { segments });

    while (this.cache.size > TERM_CACHE_LIMIT) {
      const oldest = this.cache.keys().next().value;
      this.cache.delete(oldest);
      this.onEvict?.(oldest);
    }

    if (id === this.clockTermId || id === this.cubeTermId) this.drawStatic();
  }

  setActiveTerms(clockId, cubeId) {
    const changed = clockId !== this.clockTermId || cubeId !== this.cubeTermId;
    this.clockTermId = clockId;
    this.cubeTermId = cubeId;
    this.touch(clockId);
    this.touch(cubeId);
    if (changed) this.drawStatic();
  }

  setCubeGeometry(vertices, edges) {
    if (!vertices?.length) return;
    const now = performance.now();
    this.advanceInterpolation(now);

    if (!this.displayVertices || this.displayVertices.length !== vertices.length) {
      this.displayVertices = new Float32Array(vertices);
      this.fromVertices = new Float32Array(vertices);
      this.targetVertices = new Float32Array(vertices);
      this.edges = edges;
      this.drawStatic();
      return;
    }

    this.fromVertices.set(this.displayVertices);
    this.targetVertices = new Float32Array(vertices);
    this.edges = edges;
    this.tweenStart = now;
    this.scheduleAnimation();
  }

  touch(id) {
    if (!this.cache.has(id)) return;
    const value = this.cache.get(id);
    this.cache.delete(id);
    this.cache.set(id, value);
  }

  resize() {
    if (!this.app) return;
    const rect = this.host.getBoundingClientRect();
    this.app.renderer.resize(Math.max(2, rect.width), Math.max(2, rect.height));
    this.drawStatic();
  }

  regions() {
    const w = this.app.renderer.width / this.app.renderer.resolution;
    const h = this.app.renderer.height / this.app.renderer.resolution;
    return {
      clock: { x: 14, y: 14, w: w - 28, h: h * 0.22 - 14 },
      cube: { x: 14, y: h * 0.27, w: w - 28, h: h * 0.47 },
      cubeLambda: { x: 14, y: h * 0.79, w: w - 28, h: h * 0.18 }
    };
  }

  drawStatic() {
    if (!this.app || !this.layers) return;
    const r = this.regions();
    this.drawWire(this.layers.clock, this.cache.get(this.clockTermId)?.segments, r.clock);
    this.drawWire(this.layers.cubeLambda, this.cache.get(this.cubeTermId)?.segments, r.cubeLambda);
    this.drawCube(this.layers.cube, this.layers.cubePoints, r.cube, this.displayVertices);
    this.app.render();
  }

  scheduleAnimation() {
    if (this.raf) return;
    const frame = (now) => {
      this.raf = 0;
      const active = this.advanceInterpolation(now);
      if (this.app && this.layers) {
        const r = this.regions();
        this.drawCube(this.layers.cube, this.layers.cubePoints, r.cube, this.displayVertices);
        this.app.render();
      }
      if (active) this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  advanceInterpolation(now) {
    if (!this.displayVertices || !this.fromVertices || !this.targetVertices) return false;
    if (!this.tweenStart) return false;

    const raw = Math.min(1, Math.max(0, (now - this.tweenStart) / CUBE_TWEEN_MS));
    const t = raw < 0.5 ? 4 * raw * raw * raw : 1 - Math.pow(-2 * raw + 2, 3) / 2;

    for (let i = 0; i < this.displayVertices.length; i++) {
      this.displayVertices[i] = this.fromVertices[i] + (this.targetVertices[i] - this.fromVertices[i]) * t;
    }

    if (raw >= 1) {
      this.displayVertices.set(this.targetVertices);
      this.tweenStart = 0;
      return false;
    }
    return true;
  }

  drawWire(layers, segments, region) {
    for (const g of layers) g.clear();
    if (!segments?.length || region.h <= 0) return;

    for (let i = 0; i + 4 < segments.length; i += 5) {
      const x1 = region.x + segments[i] * region.w;
      const y1 = region.y + segments[i + 1] * region.h;
      const x2 = region.x + segments[i + 2] * region.w;
      const y2 = region.y + segments[i + 3] * region.h;
      const kind = Math.max(0, Math.min(2, segments[i + 4] | 0));
      layers[kind].moveTo(x1, y1).lineTo(x2, y2);
    }

    layers[0].stroke({ color: 0xffffff, alpha: 0.48, width: 1, pixelLine: true });
    layers[1].stroke({ color: 0xffffff, alpha: 0.78, width: 1, pixelLine: true });
    layers[2].stroke({ color: 0xffffff, alpha: 0.34, width: 1, pixelLine: true });
  }

  drawCube(lines, points, region, vertices) {
    lines.clear();
    points.clear();
    if (!vertices || !this.edges) return;

    const count = vertices.length / 3;
    const projected = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const x = vertices[i * 3];
      const y = vertices[i * 3 + 1];
      const z = vertices[i * 3 + 2];
      const distance = 4.6;
      const scale = Math.min(region.w, region.h) * 1.08 / (z + distance);
      projected[i * 3] = region.x + region.w / 2 + x * scale;
      projected[i * 3 + 1] = region.y + region.h / 2 - y * scale;
      projected[i * 3 + 2] = z;
    }

    for (let i = 0; i + 1 < this.edges.length; i += 2) {
      const a = this.edges[i] * 3;
      const b = this.edges[i + 1] * 3;
      lines.moveTo(projected[a], projected[a + 1]).lineTo(projected[b], projected[b + 1]);
    }

    lines.stroke({ color: 0xffffff, alpha: 0.84, width: 1.35, pixelLine: true });
    for (let i = 0; i < count; i++) points.circle(projected[i * 3], projected[i * 3 + 1], 2.1);
    points.fill({ color: 0xffffff, alpha: 0.92 });
  }
}
