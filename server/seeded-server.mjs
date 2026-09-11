import http from 'node:http';
import {mkdir,readFile,rename,writeFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {initialDirection,normalizeSeed,seededTurn,seedHex} from '../shared/rewrite-seed.js';

const PORT=Number(process.env.PORT||8790);
const HOST=process.env.HOST||'127.0.0.1';
const RATE=Math.max(1,Number(process.env.REWRITE_RATE||1000));
const STATE_DIR=process.env.REWRITE_STATE_DIR||'/var/lib/lambda-backend';
const STATE_FILE=`${STATE_DIR}/seeded-state.json`;
const LEVEL_MAX=Math.max(256,Number(process.env.REWRITE_LEVEL_MAX||1024));
const PROMOTE=Math.max(128,Math.floor(LEVEL_MAX/2));
const SAVE_MS=5000,BROADCAST_MS=100,TICK_MS=25;
const FNV_OFFSET=0xcbf29ce484222325n,FNV_PRIME=0x100000001b3n,MASK64=0xffffffffffffffffn;

let seed=0n,epochMs=0,rateEpochMs=0,rateEpochStep=0,step=0,x=0,y=0,dir=0;
let fnv=FNV_OFFSET,bytePack=0,byteBits=0,byteCount=0;
let ones=0,zeros=0,minX=0,maxX=0,minY=0,maxY=0;
let levels=[[[0,0,0]]],pending=[],saveTimer=null;
const clients=new Set();

const nowIso=()=>new Date().toISOString();
const stateSeed=()=>seedHex(seed);
const hashHex=()=>fnv.toString(16).padStart(16,'0');
const heading=()=>['E','S','W','N'][dir];
function sameStep(a,b){return a&&b&&a[0]===b[0]}
function ensureLevel(index){while(levels.length<=index)levels.push([])}
function appendLevel(index,points){
  if(!points.length)return;
  ensureLevel(index);
  const target=levels[index];
  for(const point of points){
    if(!sameStep(target[target.length-1],point))target.push(point);
  }
  compactLevel(index);
}

function compactLevel(index){
  const source=levels[index];
  while(source.length>LEVEL_MAX){
    const count=Math.min(PROMOTE,source.length-1);
    const chunk=source.slice(0,count+1),promoted=[chunk[0]];
    for(let i=2;i<chunk.length;i+=2)promoted.push(chunk[i]);
    const last=chunk[chunk.length-1];
    if(!sameStep(promoted[promoted.length-1],last))promoted.push(last);
    source.splice(0,count);
    appendLevel(index+1,promoted);
  }
}

function appendPoint(point){appendLevel(0,[point])}

function flattenHistory(){
  const out=[];
  for(let level=levels.length-1;level>=0;level--){
    for(const point of levels[level]){
      if(!sameStep(out[out.length-1],point))out.push(point);
    }
  }
  return out;
}
function persistedState(){
  return {
    version:3,seed:stateSeed(),epochMs,rate:RATE,rateEpochMs,rateEpochStep,step,x,y,dir,
    fnv:hashHex(),bytePack,byteBits,byteCount,ones,zeros,
    bounds:{minX,maxX,minY,maxY},levels,updatedAt:nowIso()
  };
}

async function saveState(){
  const tmp=`${STATE_FILE}.tmp`;
  await mkdir(STATE_DIR,{recursive:true});
  await writeFile(tmp,JSON.stringify(persistedState()),'utf8');
  await rename(tmp,STATE_FILE);
}

function loadObject(data){
  seed=normalizeSeed(data.seed);epochMs=Number(data.epochMs)||Date.now();
  step=Number(data.step)||0;x=Number(data.x)||0;y=Number(data.y)||0;dir=Number(data.dir)&3;
  const storedRate=Math.max(1,Number(data.rate)||RATE),savedAnchor=Number(data.rateEpochMs);
  rateEpochMs=Number.isFinite(savedAnchor)&&savedAnchor>0?savedAnchor:epochMs;
  rateEpochStep=Number.isFinite(Number(data.rateEpochStep))?Number(data.rateEpochStep):0;
  if(storedRate!==RATE){rateEpochMs=Date.now();rateEpochStep=step}
  fnv=BigInt(`0x${String(data.fnv||'cbf29ce484222325').replace(/^0x/,'')}`)&MASK64;
  bytePack=Number(data.bytePack)||0;byteBits=Number(data.byteBits)||0;byteCount=Number(data.byteCount)||0;
  ones=Number(data.ones)||0;zeros=Number(data.zeros)||0;
  const b=data.bounds||{};minX=Number(b.minX)||0;maxX=Number(b.maxX)||0;minY=Number(b.minY)||0;maxY=Number(b.maxY)||0;
  levels=Array.isArray(data.levels)&&data.levels.length?data.levels:[[[0,0,0]]];
}

async function initialize(){
  try{loadObject(JSON.parse(await readFile(STATE_FILE,'utf8')))}catch{
    seed=BigInt(`0x${randomBytes(8).toString('hex')}`);epochMs=Date.now();rateEpochMs=epochMs;rateEpochStep=0;dir=initialDirection(seed);
    levels=[[[0,0,0]]];await saveState();
  }
}
function recordBit(bit){
  fnv=((fnv^BigInt(bit))*FNV_PRIME)&MASK64;
  if(bit)ones++;else zeros++;
  bytePack=((bytePack<<1)|bit)&255;byteBits++;
  if(byteBits===8){byteCount++;bytePack=0;byteBits=0}
}

function advanceOne(){
  const n=step+1;
  if(dir===0)x++;else if(dir===1)y++;else if(dir===2)x--;else y--;
  const turn=seededTurn(BigInt(n),seed),bit=turn>0?1:0;
  recordBit(bit);dir=(dir+(turn>0?1:3))&3;step=n;
  minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
  const point=[step,x,y];appendPoint(point);
  if(clients.size)pending.push(point);
}

function targetStep(){return Math.max(step,rateEpochStep+Math.floor((Date.now()-rateEpochMs)*RATE/1000))}
function advanceTowardTarget(){
  const target=targetStep(),remaining=target-step,count=Math.min(remaining,20000);
  for(let i=0;i<count;i++)advanceOne();
}

function recentBits(limit=64){
  const first=Math.max(1,step-limit+1),bits=[];
  for(let n=first;n<=step;n++)bits.push(seededTurn(BigInt(n),seed)>0?1:0);
  return bits;
}

function recentBytes(limit=16){
  const end=step-(step%8),start=Math.max(1,end-limit*8+1),bytes=[];
  let value=0,count=0;
  for(let n=start;n<=end;n++){
    value=(value<<1)|(seededTurn(BigInt(n),seed)>0?1:0);count++;
    if(count===8){bytes.push(value);value=0;count=0}
  }
  return bytes;
}
function snapshot(){
  return {
    version:3,mode:'seeded',seed:stateSeed(),epochMs,rate:RATE,
    serverTime:Date.now(),step,x,y,dir,heading:heading(),fnv64:hashHex(),
    byteCount,ones,zeros,bounds:{minX,maxX,minY,maxY},
    points:flattenHistory(),recentBits:recentBits(),recentBytes:recentBytes(),
    levels:levels.map((points,index)=>({level:index,count:points.length,stride:2**index})),
    catchingUp:targetStep()-step>RATE/2
  };
}

function liveState(points){
  return {
    seed:stateSeed(),epochMs,rate:RATE,step,x,y,dir,heading:heading(),fnv64:hashHex(),byteCount,ones,zeros,
    bounds:{minX,maxX,minY,maxY},points,recentBits:recentBits(),recentBytes:recentBytes(),serverTime:Date.now(),catchingUp:targetStep()-step>RATE/2
  };
}

function broadcast(){
  if(!clients.size){pending.length=0;return}
  const points=pending.splice(0,pending.length),payload=`event: update\ndata: ${JSON.stringify(liveState(points))}\n\n`;
  for(const res of [...clients]){
    try{res.write(payload)}catch{clients.delete(res)}
  }
}

function json(res,status,body){
  const data=JSON.stringify(body);
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Content-Length':Buffer.byteLength(data)});
  res.end(data);
}

const server=http.createServer((req,res)=>{
  const url=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`);
  if(url.pathname==='/health')return json(res,200,{ok:true,service:'lambda-seeded-rewrite',seed:stateSeed(),step,rate:RATE,clients:clients.size,catchingUp:targetStep()-step>RATE/2});
  if(url.pathname==='/seeded/snapshot')return json(res,200,snapshot());
  if(url.pathname==='/seeded/stream'){
    res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store','Connection':'keep-alive','X-Accel-Buffering':'no'});
    res.write(`event: hello\ndata: ${JSON.stringify(liveState([]))}\n\n`);clients.add(res);
    req.on('close',()=>clients.delete(res));return;
  }
  return json(res,404,{error:'not_found'});
});
await initialize();
advanceTowardTarget();
const tick=setInterval(advanceTowardTarget,TICK_MS);
const broadcaster=setInterval(broadcast,BROADCAST_MS);
saveTimer=setInterval(()=>saveState().catch(error=>console.error('[seeded] save failed',error)),SAVE_MS);

server.listen(PORT,HOST,()=>{
  console.log(`[seeded] listening on http://${HOST}:${PORT}`);
  console.log(`[seeded] seed=${stateSeed()} step=${step} rate=${RATE}/s epoch=${new Date(epochMs).toISOString()}`);
});

async function shutdown(signal){
  console.log(`[seeded] ${signal}; saving state`);
  clearInterval(tick);clearInterval(broadcaster);clearInterval(saveTimer);
  for(const res of clients){try{res.end()}catch{}}
  try{await saveState()}catch(error){console.error('[seeded] final save failed',error)}
  server.close(()=>process.exit(0));
  setTimeout(()=>process.exit(1),4000).unref();
}
process.on('SIGTERM',()=>shutdown('SIGTERM'));
process.on('SIGINT',()=>shutdown('SIGINT'));
process.on('uncaughtException',error=>{console.error(error);shutdown('uncaughtException')});
process.on('unhandledRejection',error=>console.error('[seeded] unhandled rejection',error));
