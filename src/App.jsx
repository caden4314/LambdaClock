import { createSignal, onCleanup, onMount } from 'solid-js';
import { LambdaVisualizer } from './visualizer.js';

export default function App() {
  let stageHost;
  let clockRawDetails;
  let cubeRawDetails;
  const [connected, setConnected] = createSignal(false);
  const [viewerCount, setViewerCount] = createSignal(0);
  const [clock, setClock] = createSignal({ time: '--:--:--', beta: 0, rate: 0, nodes: 0 });
  const [cube, setCube] = createSignal({ frame: 0, phase: 'starting', beta: 0, rate: 0, nodes: 0, vertices: 0, edges: 0 });
  const [clockRaw, setClockRaw] = createSignal('Raw clock reducer is idle. Open this panel to subscribe.');
  const [cubeRaw, setCubeRaw] = createSignal('Raw cube reducer is idle. Open this panel to subscribe.');

  let worker;
  let viz;

  const updateRawSubscription = () => {
    worker?.postMessage({
      t: 'rawSub',
      clock: Boolean(clockRawDetails?.open),
      cube: Boolean(cubeRawDetails?.open)
    });
  };

  onMount(async () => {
    viz = new LambdaVisualizer(stageHost);
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
        setClock({
          time: msg.clock.time,
          beta: msg.clock.beta,
          rate: msg.clock.rate,
          nodes: msg.clock.nodes
        });
        setCube((prev) => ({
          ...prev,
          frame: msg.cube.frame,
          phase: msg.cube.phase,
          beta: msg.cube.beta,
          rate: msg.cube.rate,
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
        setCube((prev) => ({ ...prev, frame: msg.frame, vertices: msg.vertexCount, edges: msg.edgeCount }));
        return;
      }
      if (msg.t === 'raw') {
        const text = formatRaw(msg.payload);
        if (msg.target === 'clock') setClockRaw(text);
        else setCubeRaw(text);
      }
    };
    worker.postMessage({ t: 'connect' });
    document.addEventListener('visibilitychange', () => worker?.postMessage({ t: 'visibility', visible: !document.hidden }));
  });

  onCleanup(() => {
    worker?.terminate();
    viz?.destroy();
  });

  const resetCube = () => worker?.postMessage({ t: 'control', action: 'resetCube' });

  return (
    <main>
      <header>
        <div class="eyebrow">PURE LAMBDA MACHINE</div>
        <h1>Clock + Cube</h1>
        <p>uncapped VPS β-reduction · raw live control terms · GPU visualization</p>
      </header>

      <div class="statusbar">
        <span class={connected() ? 'online' : 'offline'}>{connected() ? 'ONLINE' : 'CONNECTING'}</span>
        <span>{viewerCount()} viewer{viewerCount() === 1 ? '' : 's'}</span>
        <button onClick={resetCube}>Reset cube</button>
      </div>

      <section class="clock-panel">
        <div class="section-label">RAW LAMBDA CLOCK</div>
        <div class="clock-value">{clock().time}</div>
        <div class="stats">
          <Stat label="β reductions" value={fmt(clock().beta)} />
          <Stat label="β rate" value={`${fmt(Math.round(clock().rate))} /s`} />
          <Stat label="control nodes" value={fmt(clock().nodes)} />
          <Stat label="time source" value="America/Chicago" />
        </div>
      </section>

      <section class="visual-panel">
        <div ref={stageHost} class="visual-stage" aria-label="Live lambda clock, rotating cube, and raw cube lambda display" />
      </section>

      <section class="cube-stats">
        <div class="section-label">PURE LAMBDA CUBE</div>
        <div class="stats">
          <Stat label="frame" value={fmt(cube().frame)} />
          <Stat label="phase" value={cube().phase} />
          <Stat label="β reductions" value={fmt(cube().beta)} />
          <Stat label="β rate" value={`${fmt(Math.round(cube().rate))} /s`} />
          <Stat label="control nodes" value={fmt(cube().nodes)} />
          <Stat label="vertices" value={fmt(cube().vertices)} />
          <Stat label="edges" value={fmt(cube().edges)} />
          <Stat label="geometry" value="exact rationals" />
        </div>
      </section>

      <section class="raw-grid">
        <details ref={clockRawDetails} onToggle={updateRawSubscription}>
          <summary>Raw clock reducer state</summary>
          <pre>{clockRaw()}</pre>
        </details>
        <details ref={cubeRawDetails} onToggle={updateRawSubscription}>
          <summary>Raw cube reducer state</summary>
          <pre>{cubeRaw()}</pre>
        </details>
      </section>

      <footer>
        The reducer runs on the VPS. This browser retains only the newest state, newest cube geometry, and a bounded term-geometry cache.
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

function formatRaw(payload) {
  if (!payload) return '<no reducer state>';
  const lines = [
    `CONTROL TERM #${payload.termId}`,
    payload.text || '<none>',
    '',
    `ENV [${(payload.env || []).map((x) => `#${x}`).join(' ')}]`,
    '',
    'STACK (top last)'
  ];
  for (const frame of payload.stack || []) lines.push(`${String(frame.kind).toUpperCase()} #${frame.cell}`);
  if (!payload.stack?.length) lines.push('<empty>');
  lines.push('', 'REACHABLE CELLS');
  for (const cell of payload.cells || []) lines.push(`#${cell.id} ${cell.state} env=[${(cell.env || []).map((x) => `#${x}`).join(' ')}]`);
  if (payload.truncated) lines.push('', '[display window clipped; evaluator state itself is not clipped]');
  return lines.join('\n');
}
