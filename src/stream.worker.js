import { pack, unpack } from 'msgpackr';

let socket = null;
let visible = true;
let rawClock = false;
let rawCube = false;
let latestState = null;
let stateDirty = false;
let reconnectTimer = null;
let lastGeometryFrame = -1;
const requestedTerms = new Set();

self.onmessage = (event) => {
  const msg = event.data;
  if (msg.t === 'connect') connect();
  if (msg.t === 'visibility') {
    visible = Boolean(msg.visible);
    send({ t: 'visibility', visible });
  }
  if (msg.t === 'rawSub') {
    rawClock = Boolean(msg.clock);
    rawCube = Boolean(msg.cube);
    send({ t: 'rawSub', clock: rawClock, cube: rawCube });
  }
  if (msg.t === 'control') send(msg);
};

function connect() {
  clearTimeout(reconnectTimer);
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  socket = new WebSocket(`${proto}//${location.host}/lambda-backend/ws`);
  socket.binaryType = 'arraybuffer';
  socket.onopen = () => {
    requestedTerms.clear();
    postMessage({ t: 'status', connected: true, viewers: 0 });
    send({ t: 'hello', visible, rawClock, rawCube });
  };
  socket.onclose = () => {
    postMessage({ t: 'status', connected: false, viewers: 0 });
    reconnectTimer = setTimeout(connect, visible ? 1500 : 5000);
  };
  socket.onerror = () => socket?.close();
  socket.onmessage = (event) => {
    let msg;
    try {
      msg = unpack(new Uint8Array(event.data));
    } catch {
      return;
    }
    if (msg.t === 'state') {
      latestState = msg;
      stateDirty = true;
      ensureTerm(msg.clock?.termId);
      ensureTerm(msg.cube?.termId);
      return;
    }
    if (msg.t === 'term') {
      requestedTerms.delete(msg.id);
      const segments = msg.segments instanceof Float32Array ? msg.segments : Float32Array.from(msg.segments || []);
      postMessage({ t: 'term', id: msg.id, segments }, [segments.buffer]);
      return;
    }
    if (msg.t === 'geometry') {
      if (msg.frame === lastGeometryFrame) return;
      lastGeometryFrame = msg.frame;
      const converted = convertGeometry(msg);
      postMessage(converted, [converted.vertices.buffer, converted.edges.buffer]);
      return;
    }
    if (msg.t === 'raw') postMessage(msg);
  };
}

function ensureTerm(id) {
  if (id == null || requestedTerms.has(id)) return;
  requestedTerms.add(id);
  send({ t: 'needTerm', id });
}

function send(obj) {
  if (socket?.readyState !== WebSocket.OPEN) return;
  socket.send(pack(obj));
}

function convertGeometry(msg) {
  const scale = BigInt(msg.scale);
  const idToIndex = new Map();
  const vertices = new Float32Array(msg.vertices.length * 3);
  for (let i = 0; i < msg.vertices.length; i++) {
    const v = msg.vertices[i];
    idToIndex.set(v.id, i);
    for (let axis = 0; axis < 3; axis++) vertices[i * 3 + axis] = ratio(BigInt(v.coords[axis]), scale);
  }
  const edges = new Uint16Array(msg.edges.length * 2);
  for (let i = 0; i < msg.edges.length; i++) {
    edges[i * 2] = idToIndex.get(msg.edges[i][0]) ?? 0;
    edges[i * 2 + 1] = idToIndex.get(msg.edges[i][1]) ?? 0;
  }
  return {
    t: 'geometry',
    frame: msg.frame,
    vertexCount: msg.vertices.length,
    edgeCount: msg.edges.length,
    vertices,
    edges
  };
}

function ratio(n, d) {
  if (n === 0n) return 0;
  const negative = n < 0n;
  if (negative) n = -n;
  const bits = d.toString(2).length;
  const shift = Math.max(0, bits - 50);
  const s = BigInt(shift);
  const value = Number(n >> s) / Number(d >> s);
  return negative ? -value : value;
}

setInterval(() => {
  if (!stateDirty || !latestState) return;
  stateDirty = false;
  const state = latestState;
  latestState = null;
  postMessage(state);
}, 33);
