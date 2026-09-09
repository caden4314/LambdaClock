import { createSignal, onCleanup, onMount } from 'solid-js';
import { LambdaVisualizer } from './visualizer.js';

export default function App() {
  let stageHost;
  const [connected, setConnected] = createSignal(false);
  const [viewerCount, setViewerCount] = createSignal(0);
  const [clock, setClock] = createSignal({ time: '--:--:--', beta: 0, nodes: 0 });
  const [cube, setCube] = createSignal({ frame: 0, phase: 'starting', beta: 0, nodes: 0, vertices: 0, edges: 0 });

  let worker;
  let viz;
  let visibilityHandler;

  onMount(async () => {
    viz = new LambdaVisualizer(stageHost, (id) => worker?.postMessage({ t: 'termEvicted', id }));
    await viz.init();

    worker = new Worker(new URL('./stream.worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (event) => {
      const msg = event.data;

      if (msg.t === 'status') {
        setConnected(msg.connected);
        setViewerCount(msg.viewers || 0);
        return;
      }

      if (msg.t === 'state') {
        setConnected(true);
        setViewerCount(msg.viewers || 0);
        setClock({ time: msg.clock.time, beta: msg.clock.beta, nodes: msg.clock.nodes });
        setCube((prev) => ({
          ...prev,
          frame: msg.cube.frame,
          phase: msg.cube.phase,
          beta: msg.cube.beta,
          nodes: msg.cube.nodes
        }));
        viz.setActiveTerms(msg.clock.termId, msg.cube.termId);
        return;
      }

      if (msg.t === 'term') {
        viz.installTerm(msg.id, msg.segments);
        return;
      }

      if (msg.t === 'geometry') {
        viz.setCubeGeometry(msg.vertices, msg.edges);
        setCube((prev) => ({
          ...prev,
          frame: msg.frame,
          vertices: msg.vertexCount,
          edges: msg.edgeCount
        }));
      }
    };

    worker.postMessage({ t: 'connect' });
    visibilityHandler = () => worker?.postMessage({ t: 'visibility', visible: !document.hidden });
    document.addEventListener('visibilitychange', visibilityHandler);
  });

  onCleanup(() => {
    if (visibilityHandler) document.removeEventListener('visibilitychange', visibilityHandler);
    worker?.terminate();
    viz?.destroy();
  });

  const resetCube = () => worker?.postMessage({ t: 'control', action: 'resetCube' });

  return (
    <main>
      <header>
        <div class="eyebrow">LAMBDA DISPLAY</div>
        <h1>Clock + Cube</h1>
        <p>lambda-based math · smooth browser animation</p>
      </header>

      <div class="statusbar">
        <span class={connected() ? 'online' : 'offline'}>{connected() ? 'ONLINE' : 'CONNECTING'}</span>
        <span>{viewerCount()} viewer{viewerCount() === 1 ? '' : 's'}</span>
        <button onClick={resetCube}>Reset cube</button>
      </div>

      <section class="clock-panel">
        <div class="section-label">LAMBDA CLOCK</div>
        <div class="clock-value">{clock().time}</div>
        <div class="clock-note">The time state is lambda-computed; the display transition is rendered normally.</div>
        <div class="stats compact-stats">
          <Stat label="β reductions" value={fmt(clock().beta)} />
          <Stat label="lambda nodes" value={fmt(clock().nodes)} />
          <Stat label="time source" value="America/Chicago" />
          <Stat label="display" value="Tromp-style" />
        </div>
      </section>

      <section class="visual-panel">
        <div ref={stageHost} class="visual-stage" aria-label="Tromp-style lambda clock, smooth cube, and cube lambda diagram" />
      </section>

      <section class="cube-stats">
        <div class="section-label">LAMBDA CUBE</div>
        <div class="stats">
          <Stat label="frame" value={fmt(cube().frame)} />
          <Stat label="phase" value={cube().phase} />
          <Stat label="vertices" value={fmt(cube().vertices)} />
          <Stat label="edges" value={fmt(cube().edges)} />
          <Stat label="β reductions" value={fmt(cube().beta)} />
          <Stat label="lambda nodes" value={fmt(cube().nodes)} />
          <Stat label="math" value="lambda + rationals" />
          <Stat label="motion" value="60 FPS interpolation" />
        </div>
      </section>

      <footer>
        Lambda calculus determines the meaningful clock/cube states. Normal GPU rendering handles interpolation, timing, and pixels so the animation stays smooth.
      </footer>
    </main>
  );
}

function Stat(props) {
  return <div class="stat"><span>{props.label}</span><strong>{props.value}</strong></div>;
}

function fmt(value) {
  return Number(value || 0).toLocaleString();
}
