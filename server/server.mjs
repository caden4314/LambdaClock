import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { pack, unpack } from 'msgpackr';
import { Machine, workflow } from '../lambda-machine.js';
import { startClock, chicagoDigits } from './clock-core.mjs';

const PORT = Number(process.env.PORT || 8789);
const STATE_MS = Number(process.env.STATE_MS || 50);
const RAW_MS = Number(process.env.RAW_MS || 300);
const COMPUTE_SLICE_MS = Number(process.env.COMPUTE_SLICE_MS || 8);
const MAX_BUFFERED = Number(process.env.MAX_BUFFERED || 2 * 1024 * 1024);
const MAX_RAW = Number(process.env.MAX_RAW || 96 * 1024);
const MAX_TERM_CACHE = Number(process.env.MAX_TERM_CACHE || 512);
const MAX_VISUAL_VARS = Number(process.env.MAX_VISUAL_VARS || 100000);

const app = Fastify({ logger: true });
await app.register(websocket);

const clients = new Set();
const termIds = new WeakMap();
const termsById = new Map();
const termStats = new Map();
let nextTermId = 1;

let cubeGen = null;
let cubeReq = null;
let cubeMachine = null;
let cubePhase = 'starting';
let cubeFrameNo = -1;
let cubeFrame = null;
let cubeBeta = 0;
let cubeSteps = 0;
let cubeRate = 0;
let cubeRateBase = 0;
let cubeRateAt = performance.now();

let clockState = startClock();
let clockClosure = clockState.machine.control;
let clockTotalBeta = 0;
let clockRate = 0;
let clockRateBase = 0;
let clockRateAt = performance.now();
let lastClockText = clockState.input.text;

function resetCube() {
  cubeGen = workflow();
  cubeReq = null;
  cubeMachine = null;
  cubePhase = 'starting';
  cubeFrameNo = -1;
  cubeFrame = null;
  cubeBeta = 0;
  cubeSteps = 0;
  cubeRate = 0;
  cubeRateBase = 0;
  cubeRateAt = performance.now();
  advanceCube();
}

function advanceCube(value) {
  for (;;) {
    const next = cubeGen.next(value);
    value = undefined;
    if (next.done) {
      cubeReq = null;
      cubeMachine = null;
      return;
    }
    const item = next.value;
    if (item.kind === 'frame') {
      cubeFrameNo++;
      cubeFrame = serializeFrame(item.decoded);
      cubePhase = item.label;
      continue;
    }
    cubeReq = item;
    cubePhase = item.label;
    cubeMachine = new Machine(item.fn, item.args);
    return;
  }
}

function stepCube() {
  if (!cubeMachine) return;
  const before = cubeMachine.beta;
  const running = cubeMachine.step();
  cubeSteps++;
  cubeBeta += cubeMachine.beta - before;
  if (!running) {
    const result = cubeMachine.control;
    cubeMachine = null;
    advanceCube(result);
  }
}

function stepClock() {
  const now = chicagoDigits();
  if (now.text !== lastClockText) {
    lastClockText = now.text;
    clockState = startClock();
    clockClosure = clockState.machine.control;
  }
  if (clockState.done) return;
  const machine = clockState.machine;
  const before = machine.beta;
  const running = machine.step();
  clockState.steps++;
  clockState.beta += machine.beta - before;
  clockTotalBeta += machine.beta - before;
  clockClosure = machine.control;
  if (!running) {
    clockState.done = true;
    clockClosure = machine.control;
  }
}

function serializeFrame(decoded) {
  return {
    scale: String(decoded.scale),
    vertices: decoded.graph.vertices.map((v) => ({ id: v.id, coords: v.coords.map(String) })),
    edges: decoded.graph.edges
  };
}

function currentCubeClosure() {
  return cubeMachine?.control || cubeReq?.fn || null;
}

function currentClockClosure() {
  return clockState.machine?.control || clockClosure || null;
}

function identifyTerm(term) {
  if (!term) return null;
  let id = termIds.get(term);
  if (!id) {
    id = nextTermId++;
    termIds.set(term, id);
  }
  if (termsById.has(id)) termsById.delete(id);
  termsById.set(id, term);
  if (!termStats.has(id)) termStats.set(id, stats(term));
  trimTermCache();
  return id;
}

function trimTermCache() {
  while (termsById.size > MAX_TERM_CACHE) {
    const oldest = termsById.keys().next().value;
    termsById.delete(oldest);
    termStats.delete(oldest);
  }
}

function stats(term) {
  let nodes = 0;
  let vars = 0;
  let lams = 0;
  let apps = 0;
  let maxDepth = 0;
  const stack = [[term, 0]];
  while (stack.length) {
    const [node, depth] = stack.pop();
    nodes++;
    maxDepth = Math.max(maxDepth, depth);
    if (node.t === 'v') vars++;
    else if (node.t === 'l') {
      lams++;
      stack.push([node.b, depth + 1]);
    } else {
      apps++;
      stack.push([node.f, depth + 1], [node.x, depth + 1]);
    }
  }
  return { nodes, vars, lams, apps, maxDepth };
}

function buildWire(term) {
  const st = stats(term);
  const stride = Math.max(1, Math.ceil(st.vars / MAX_VISUAL_VARS));
  const leaves = [];
  const lams = [];
  const apps = [];
  let seenVars = 0;

  function walk(node, path, binders, lambdaDepth, appDepth) {
    if (node.t === 'v') {
      const keep = (seenVars++ % stride) === 0;
      if (!keep) return [];
      const index = leaves.length;
      leaves.push({ binder: binders[node.i] ?? null, appDepth });
      return [index];
    }
    if (node.t === 'l') {
      lams.push({ id: path, depth: lambdaDepth });
      return walk(node.b, `${path}b`, [path, ...binders], lambdaDepth + 1, appDepth);
    }
    const left = walk(node.f, `${path}f`, binders, lambdaDepth, appDepth + 1);
    const right = walk(node.x, `${path}x`, binders, lambdaDepth, appDepth + 1);
    if (left.length && right.length) apps.push({ depth: appDepth, left, right });
    return left.concat(right);
  }

  walk(term, 'r', [], 0, 0);
  const count = Math.max(1, leaves.length);
  for (let i = 0; i < leaves.length; i++) leaves[i].x = count === 1 ? 0.5 : i / (count - 1);

  const bindMap = new Map();
  const lambdaY = new Map();
  const maxLambda = Math.max(1, ...lams.map((x) => x.depth + 1));
  const maxApp = Math.max(1, ...leaves.map((x) => x.appDepth + 1));
  for (const l of lams) lambdaY.set(l.id, 0.03 + (l.depth / maxLambda) * 0.18);
  for (const leaf of leaves) {
    if (!leaf.binder) continue;
    if (!bindMap.has(leaf.binder)) bindMap.set(leaf.binder, []);
    bindMap.get(leaf.binder).push(leaf.x);
  }

  const segments = [];
  for (const l of lams) {
    const xs = bindMap.get(l.id) || [];
    if (xs.length) segments.push(Math.min(...xs), lambdaY.get(l.id), Math.max(...xs), lambdaY.get(l.id), 0);
  }
  for (const a of apps) {
    const ax = a.left.map((i) => leaves[i].x);
    const bx = a.right.map((i) => leaves[i].x);
    const y = 0.26 + (a.depth / maxApp) * 0.58;
    segments.push(Math.min(...ax), y, Math.min(...bx), y, 1);
  }
  for (const leaf of leaves) {
    const y1 = leaf.binder ? lambdaY.get(leaf.binder) : 0.02;
    const y2 = 0.26 + (leaf.appDepth / maxApp) * 0.58;
    segments.push(leaf.x, y1, leaf.x, Math.max(y1 + 0.01, y2), 2);
  }
  return { segments: Float32Array.from(segments), stats: st, lodStride: stride };
}

function rawTerm(term, limit = MAX_RAW) {
  let out = '';
  let truncated = false;
  const stack = [{ kind: 'node', value: term }];
  const add = (text) => {
    if (out.length + text.length > limit) {
      out += text.slice(0, Math.max(0, limit - out.length));
      truncated = true;
      return false;
    }
    out += text;
    return true;
  };
  while (stack.length && !truncated) {
    const frame = stack.pop();
    if (frame.kind === 'text') {
      add(frame.value);
      continue;
    }
    const node = frame.value;
    if (node.t === 'v') {
      add(String(node.i + 1));
      continue;
    }
    if (node.t === 'l') {
      if (!add('Î».')) break;
      stack.push({ kind: 'node', value: node.b });
      continue;
    }
    if (!add('(')) break;
    stack.push({ kind: 'text', value: ')' });
    stack.push({ kind: 'node', value: node.x });
    stack.push({ kind: 'text', value: ' ' });
    stack.push({ kind: 'node', value: node.f });
  }
  return { text: out + (truncated ? ' â€¦' : ''), truncated };
}

function reachableCells(closure, machine, limit = 256) {
  const seen = new Map();
  const queue = [];
  if (closure) queue.push(...closure.env);
  if (machine) for (const frame of machine.stack) if (frame.cell) queue.push(frame.cell);
  while (queue.length && seen.size < limit) {
    const cell = queue.shift();
    if (!cell || seen.has(cell.id)) continue;
    seen.set(cell.id, cell);
    for (const value of [cell.value, cell.closure]) if (value?.env) queue.push(...value.env);
  }
  return [...seen.values()].map((cell) => ({
    id: cell.id,
    state: cell.value ? 'VALUE' : 'THUNK',
    env: (cell.value || cell.closure)?.env?.map((x) => x.id) || []
  }));
}

function stateSnapshot() {
  const clock = currentClockClosure();
  const cube = currentCubeClosure();
  const clockTermId = identifyTerm(clock?.term);
  const cubeTermId = identifyTerm(cube?.term);
  return {
    t: 'state',
    ts: Date.now(),
    viewers: clients.size,
    clock: {
      time: lastClockText,
      beta: clockTotalBeta,
      rate: clockRate,
      termId: clockTermId,
      nodes: clockTermId ? termStats.get(clockTermId)?.nodes || 0 : 0
    },
    cube: {
      frame: Math.max(0, cubeFrameNo),
      phase: cubePhase,
      beta: cubeBeta,
      rate: cubeRate,
      steps: cubeSteps,
      termId: cubeTermId,
      nodes: cubeTermId ? termStats.get(cubeTermId)?.nodes || 0 : 0
    }
  };
}

function rawPayload(target) {
  const isClock = target === 'clock';
  const closure = isClock ? currentClockClosure() : currentCubeClosure();
  const machine = isClock ? (clockState.done ? null : clockState.machine) : cubeMachine;
  if (!closure) return null;
  return {
    termId: identifyTerm(closure.term),
    ...rawTerm(closure.term),
    env: closure.env.map((cell) => cell.id),
    stack: machine?.stack?.slice(-256).map((frame) => ({ kind: frame.k, cell: frame.cell.id })) || [],
    cells: reachableCells(closure, machine)
  };
}

function send(client, message, force = false) {
  if (client.socket.readyState !== 1) return false;
  if (!force && client.socket.bufferedAmount > MAX_BUFFERED) return false;
  client.socket.send(pack(message), { binary: true });
  return true;
}

function sendGeometry(client) {
  if (!cubeFrame || client.lastGeometryFrame === cubeFrameNo) return;
  if (send(client, { t: 'geometry', frame: cubeFrameNo, ...cubeFrame })) client.lastGeometryFrame = cubeFrameNo;
}

app.get('/health', async () => ({
  ok: true,
  revision: process.env.LAMBDA_REVISION || 'dev',
  transport: 'fastify-websocket-msgpack-v1',
  viewers: clients.size,
  cubeFrame: Math.max(0, cubeFrameNo),
  clock: lastClockText,
  termCache: termsById.size,
  memory: process.memoryUsage().rss
}));

app.get('/ws', { websocket: true }, (socket) => {
  const client = {
    socket,
    visible: true,
    rawClock: false,
    rawCube: false,
    lastStateAt: 0,
    lastRawAt: 0,
    lastGeometryFrame: -1
  };
  clients.add(client);

  socket.on('message', (data) => {
    let message;
    try {
      message = unpack(data);
    } catch {
      return;
    }
    if (message.t === 'hello') {
      client.visible = message.visible !== false;
      client.rawClock = Boolean(message.rawClock);
      client.rawCube = Boolean(message.rawCube);
      send(client, stateSnapshot(), true);
      sendGeometry(client);
      return;
    }
    if (message.t === 'visibility') {
      client.visible = Boolean(message.visible);
      return;
    }
    if (message.t === 'rawSub') {
      client.rawClock = Boolean(message.clock);
      client.rawCube = Boolean(message.cube);
      return;
    }
    if (message.t === 'needTerm') {
      const term = termsById.get(Number(message.id));
      if (!term) return;
      const wire = buildWire(term);
      send(client, { t: 'term', id: Number(message.id), segments: wire.segments, lodStride: wire.lodStride }, true);
      return;
    }
    if (message.t === 'control' && message.action === 'resetCube') resetCube();
  });

  socket.on('close', () => clients.delete(client));
  socket.on('error', () => clients.delete(client));
});

resetCube();

function activeViewerCount() {
  let count = 0;
  for (const client of clients) if (client.visible) count++;
  return count;
}

function compute() {
  if (activeViewerCount() > 0) {
    const end = performance.now() + COMPUTE_SLICE_MS;
    while (performance.now() < end) {
      stepClock();
      for (let i = 0; i < 10; i++) stepCube();
    }
  } else {
    stepClock();
  }

  const now = performance.now();
  if (now - cubeRateAt >= 500) {
    cubeRate = (cubeBeta - cubeRateBase) * 1000 / (now - cubeRateAt);
    cubeRateBase = cubeBeta;
    cubeRateAt = now;
  }
  if (now - clockRateAt >= 500) {
    clockRate = (clockTotalBeta - clockRateBase) * 1000 / (now - clockRateAt);
    clockRateBase = clockTotalBeta;
    clockRateAt = now;
  }
  setImmediate(compute);
}
compute();

setInterval(() => {
  const now = performance.now();
  let snapshot = null;
  for (const client of clients) {
    const cadence = client.visible ? STATE_MS : 1000;
    if (now - client.lastStateAt < cadence) continue;
    if (!snapshot) snapshot = stateSnapshot();
    if (send(client, snapshot)) client.lastStateAt = now;
    sendGeometry(client);
  }
}, Math.min(STATE_MS, 50));

setInterval(() => {
  const now = performance.now();
  for (const client of clients) {
    if (!client.visible || now - client.lastRawAt < RAW_MS) continue;
    let sent = false;
    if (client.rawClock) sent = send(client, { t: 'raw', target: 'clock', payload: rawPayload('clock') }) || sent;
    if (client.rawCube) sent = send(client, { t: 'raw', target: 'cube', payload: rawPayload('cube') }) || sent;
    if (sent) client.lastRawAt = now;
  }
}, Math.min(RAW_MS, 100));

await app.listen({ port: PORT, host: '127.0.0.1' });
