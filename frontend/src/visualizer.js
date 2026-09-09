import { Application, Container, Graphics } from 'pixi.js';

const TERM_CACHE_LIMIT = 8;

export class LambdaVisualizer {
  constructor(host, onEvict = null) {
    this.host = host;
    this.onEvict = onEvict;
    this.app = null;
    this.cache = new Map();
    this.clockTermId = null;
    this.cubeTermId = null;
    this.vertices = null;
    this.edges = null;
    this.layers = null;
    this.resizeObserver = null;
  }

  async init() {
    const app = new Application();
    await app.init({
      background: '#000000',
      antialias: true,
      autoStart: false,
      preference: 'webgl',
      resolution: Math.min(1.5, Math.max(1, devicePixelRatio || 1)),
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
    this.resizeObserver?.disconnect();
    this.cache.clear();
    this.app?.destroy(true, { children: true });
  }

  installTerm(id, segments) {
    if (id == null) return;
    if (this.cache.has(id)) this.cache.delete(id);
    this.cache.set(id, { segments, used: performance.now() });
    while (this.cache.size > TERM_CACHE_LIMIT) {
      const oldest = this.cache.keys().next().value;
      this.cache.delete(oldest);
      this.onEvict?.(oldest);
    }
    this.draw();
  }

  setActiveTerms(clockId, cubeId) {
    this.clockTermId = clockId;
    this.cubeTermId = cubeId;
    this.touch(clockId);
    this.touch(cubeId);
    this.draw();
  }

  setCubeGeometry(vertices, edges) {
    this.vertices = vertices;
    this.edges = edges;
    this.draw();
  }

  touch(id) {
    if (!this.cache.has(id)) return;
    const value = this.cache.get(id);
    this.cache.delete(id);
    value.used = performance.now();
    this.cache.set(id, value);
  }

  resize() {
    if (!this.app) return;
    const rect = this.host.getBoundingClientRect();
    this.app.renderer.resize(Math.max(2, rect.width), Math.max(2, rect.height));
    this.draw();
  }

  draw() {
    if (!this.app || !this.layers) return;
    const w = this.app.renderer.width / this.app.renderer.resolution;
    const h = this.app.renderer.height / this.app.renderer.resolution;
    if (!w || !h) return;

    const clockRegion = { x: 14, y: 14, w: w - 28, h: h * 0.25 - 18 };
    const cubeRegion = { x: 14, y: h * 0.285, w: w - 28, h: h * 0.39 };
    const lambdaRegion = { x: 14, y: h * 0.705, w: w - 28, h: h * 0.275 - 18 };

    this.drawWire(this.layers.clock, this.cache.get(this.clockTermId)?.segments, clockRegion);
    this.drawCube(this.layers.cube, this.layers.cubePoints, cubeRegion);
    this.drawWire(this.layers.cubeLambda, this.cache.get(this.cubeTermId)?.segments, lambdaRegion);
    this.app.render();
  }

  drawWire(layers, segments, region) {
    for (const g of layers) g.clear();
    if (!segments?.length) return;
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

  drawCube(lines, points, region) {
    lines.clear();
    points.clear();
    if (!this.vertices || !this.edges) return;
    const count = this.vertices.length / 3;
    const projected = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const x = this.vertices[i * 3];
      const y = this.vertices[i * 3 + 1];
      const z = this.vertices[i * 3 + 2];
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
    lines.stroke({ color: 0xffffff, alpha: 0.82, width: 1.35, pixelLine: true });
    for (let i = 0; i < count; i++) points.circle(projected[i * 3], projected[i * 3 + 1], 2.2);
    points.fill({ color: 0xffffff, alpha: 0.92 });
  }
}
