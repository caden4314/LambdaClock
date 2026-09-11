import {createSignal,onCleanup,onMount} from 'solid-js';
import {initialDirection,normalizeSeed,seededTurn,seedHex} from '../../shared/rewrite-seed.js';

const TAU=Math.PI*2;
const RATE=210;
const LEVEL_MAX=1024;
const PROMOTE=512;
const FNV_OFFSET=0xcbf29ce484222325n;
const FNV_PRIME=0x100000001b3n;
const MASK64=0xffffffffffffffffn;

function freshSeed(){
  const words=new Uint32Array(2);
  globalThis.crypto?.getRandomValues?.(words);
  if(!words[0]&&!words[1]){words[0]=(Date.now()/0x100000000)>>>0;words[1]=Date.now()>>>0}
  return (BigInt(words[0])<<32n)|BigInt(words[1]);
}

function entropy(ones,zeros){
  const total=ones+zeros;if(!total)return 0;
  const p=ones/total;if(p<=0||p>=1)return 0;
  return -p*Math.log2(p)-(1-p)*Math.log2(1-p);
}

function heading(dir){return ['E','S','W','N'][dir&3]}
function sameStep(a,b){return a&&b&&a[0]===b[0]}
function makeLevels(){return [[[0,0,0]]]}
function ensureLevel(levels,index){while(levels.length<=index)levels.push([])}
function compactLevel(levels,index){
  let changed=false;const source=levels[index];
  while(source.length>LEVEL_MAX){
    const count=Math.min(PROMOTE,source.length-1),chunk=source.slice(0,count+1),promoted=[chunk[0]];
    for(let i=2;i<chunk.length;i+=2)promoted.push(chunk[i]);
    const last=chunk[chunk.length-1];if(!sameStep(promoted[promoted.length-1],last))promoted.push(last);
    source.splice(0,count);ensureLevel(levels,index+1);const next=levels[index+1];
    for(const point of promoted)if(!sameStep(next[next.length-1],point))next.push(point);
    changed=true;if(compactLevel(levels,index+1))changed=true;
  }
  return changed;
}

function addLodPoint(engine,point){
  engine.levels[0].push(point);
  return compactLevel(engine.levels,0);
}

function flattenLevels(levels){
  const out=[];
  for(let level=levels.length-1;level>=0;level--){
    for(const point of levels[level])if(!sameStep(out[out.length-1],point))out.push(point);
  }
  return out;
}

function pathFromPoints(points){
  const path=new Path2D();if(!points.length)return path;
  path.moveTo(points[0][1],points[0][2]);
  for(let i=1;i<points.length;i++)path.lineTo(points[i][1],points[i][2]);
  return path;
}
function makeEngine(mode,seed){
  const normalized=normalizeSeed(seed),path=new Path2D();path.moveTo(0,0);
  return {
    mode,seed:normalized,epochMs:mode==='live'?Date.now():0,rate:RATE,status:mode==='live'?'live':'connecting',
    step:0,x:0,y:0,dir:initialDirection(normalized),fnv:FNV_OFFSET,bytePack:0,byteBits:0,byteCount:0,
    ones:0,zeros:0,minX:0,maxX:0,minY:0,maxY:0,path,pathLastStep:0,
    levels:makeLevels(),recent:[],sparks:[],bitTrail:[],byteTrail:[],acc:0,
    camera:{scale:9,ox:0,oy:0,ready:false},serverTime:0,catchingUp:false
  };
}

function rebuildPath(engine,points){
  engine.path=pathFromPoints(points);engine.pathLastStep=points.length?points[points.length-1][0]:0;
  engine.recent=[];
  const tail=points.slice(-141);
  for(let i=1;i<tail.length;i++)engine.recent.push([tail[i-1][1],tail[i-1][2],tail[i][1],tail[i][2]]);
}

function addRecent(engine,px,py,x,y,turn=0){
  engine.recent.push([px,py,x,y]);if(engine.recent.length>140)engine.recent.shift();
  if(engine.step%7===0)engine.sparks.push({x,y,side:turn>=0?1:-1,age:0});
}

function updateBounds(engine,x,y){
  engine.minX=Math.min(engine.minX,x);engine.maxX=Math.max(engine.maxX,x);
  engine.minY=Math.min(engine.minY,y);engine.maxY=Math.max(engine.maxY,y);
}
function dispatchByte(engine,byte){
  const EventCtor=globalThis.CustomEvent;
  if(!EventCtor||!globalThis.dispatchEvent)return;
  globalThis.dispatchEvent(new EventCtor('lambda:rewrite-byte',{detail:{
    mode:engine.mode,seed:seedHex(engine.seed),byte,index:String(engine.byteCount),turns:String(engine.step),fnv64:engine.fnv.toString(16).padStart(16,'0')
  }}));
}

function recordLiveBit(engine,bit){
  engine.fnv=((engine.fnv^BigInt(bit))*FNV_PRIME)&MASK64;if(bit)engine.ones++;else engine.zeros++;
  engine.bitTrail.push(bit);if(engine.bitTrail.length>64)engine.bitTrail.shift();
  engine.bytePack=((engine.bytePack<<1)|bit)&255;engine.byteBits++;
  if(engine.byteBits===8){
    const out=engine.bytePack;engine.byteCount++;engine.byteTrail.push(out);if(engine.byteTrail.length>16)engine.byteTrail.shift();
    engine.bytePack=0;engine.byteBits=0;dispatchByte(engine,out);
  }
}

function advanceLive(engine){
  const px=engine.x,py=engine.y;
  if(engine.dir===0)engine.x++;else if(engine.dir===1)engine.y++;else if(engine.dir===2)engine.x--;else engine.y--;
  engine.step++;const turn=seededTurn(BigInt(engine.step),engine.seed),bit=turn>0?1:0;
  recordLiveBit(engine,bit);engine.dir=(engine.dir+(turn>0?1:3))&3;updateBounds(engine,engine.x,engine.y);
  const point=[engine.step,engine.x,engine.y],compacted=addLodPoint(engine,point);
  if(compacted)rebuildPath(engine,flattenLevels(engine.levels));else{engine.path.lineTo(engine.x,engine.y);engine.pathLastStep=engine.step}
  addRecent(engine,px,py,engine.x,engine.y,turn);
}
function parseHash(value){try{return BigInt(`0x${String(value||'0').replace(/^0x/,'')}`)&MASK64}catch{return 0n}}
function applySnapshot(engine,data){
  engine.seed=normalizeSeed(data.seed);engine.epochMs=Number(data.epochMs)||0;engine.rate=Number(data.rate)||RATE;
  engine.step=Number(data.step)||0;engine.x=Number(data.x)||0;engine.y=Number(data.y)||0;engine.dir=Number(data.dir)&3;
  engine.fnv=parseHash(data.fnv64);engine.byteCount=Number(data.byteCount)||0;engine.ones=Number(data.ones)||0;engine.zeros=Number(data.zeros)||0;
  const b=data.bounds||{};engine.minX=Number(b.minX)||0;engine.maxX=Number(b.maxX)||0;engine.minY=Number(b.minY)||0;engine.maxY=Number(b.maxY)||0;
  engine.bitTrail=Array.isArray(data.recentBits)?data.recentBits.slice(-64):[];engine.byteTrail=Array.isArray(data.recentBytes)?data.recentBytes.slice(-16):[];
  rebuildPath(engine,Array.isArray(data.points)?data.points:[]);engine.serverTime=Number(data.serverTime)||Date.now();
  engine.catchingUp=!!data.catchingUp;engine.status=engine.catchingUp?'catching up':'24/7';
}

function emitSeededBytes(engine,data,previousCount){
  const next=Number(data.byteCount)||0,diff=Math.max(0,next-previousCount),bytes=Array.isArray(data.recentBytes)?data.recentBytes:[];
  if(!diff||!bytes.length)return;const take=Math.min(diff,bytes.length),start=bytes.length-take;
  for(let i=start;i<bytes.length;i++){
    const E=globalThis.CustomEvent;if(!E||!globalThis.dispatchEvent)break;
    globalThis.dispatchEvent(new E('lambda:rewrite-byte',{detail:{mode:'seeded',seed:seedHex(engine.seed),byte:bytes[i],index:String(next-(bytes.length-1-i)),turns:String(data.step),fnv64:String(data.fnv64)}}));
  }
}

function applySeededUpdate(engine,data){
  const previousBytes=engine.byteCount,points=Array.isArray(data.points)?data.points:[];
  let px=engine.x,py=engine.y;
  for(const point of points){
    const s=Number(point[0]);if(s<=engine.pathLastStep)continue;
    if(s>engine.pathLastStep+1){engine.status='resyncing';return false}
    const x=Number(point[1]),y=Number(point[2]),turn=seededTurn(BigInt(s),engine.seed);
    engine.path.lineTo(x,y);engine.pathLastStep=s;addRecent(engine,px,py,x,y,turn);px=x;py=y;
  }
  if(Number(data.step)>engine.pathLastStep){engine.status='resyncing';return false}
  emitSeededBytes(engine,data,previousBytes);
  engine.step=Number(data.step)||engine.step;engine.x=Number(data.x)||0;engine.y=Number(data.y)||0;engine.dir=Number(data.dir)&3;
  engine.fnv=parseHash(data.fnv64);engine.byteCount=Number(data.byteCount)||0;engine.ones=Number(data.ones)||0;engine.zeros=Number(data.zeros)||0;
  const b=data.bounds||{};engine.minX=Number(b.minX)||engine.minX;engine.maxX=Number(b.maxX)||engine.maxX;engine.minY=Number(b.minY)||engine.minY;engine.maxY=Number(b.maxY)||engine.maxY;
  engine.bitTrail=Array.isArray(data.recentBits)?data.recentBits.slice(-64):engine.bitTrail;engine.byteTrail=Array.isArray(data.recentBytes)?data.recentBytes.slice(-16):engine.byteTrail;
  engine.serverTime=Number(data.serverTime)||Date.now();engine.catchingUp=!!data.catchingUp;engine.status=engine.catchingUp?'catching up':'24/7';return true;
}

function targetCamera(engine,w,h){
  const spanX=Math.max(1,engine.maxX-engine.minX),spanY=Math.max(1,engine.maxY-engine.minY),pad=.18;
  const scale=Math.min(10,w*(1-pad*2)/spanX,h*(1-pad*2)/spanY);
  return {scale,ox:w*.5-(engine.minX+engine.maxX)*.5*scale,oy:h*.5-(engine.minY+engine.maxY)*.5*scale};
}

function updateCamera(engine,w,h,dt){
  const target=targetCamera(engine,w,h),camera=engine.camera;
  if(!camera.ready){Object.assign(camera,target,{ready:true});return camera}
  const k=1-Math.exp(-Math.max(.001,dt)*4.6);
  camera.scale+=(target.scale-camera.scale)*k;camera.ox+=(target.ox-camera.ox)*k;camera.oy+=(target.oy-camera.oy)*k;
  return camera;
}

function screenPoint(camera,x,y){return [camera.ox+x*camera.scale,camera.oy+y*camera.scale]}
function groupedBits(bits){const text=(bits||[]).join('');return text.replace(/(.{8})/g,'$1 ').trim()}
function hexBytes(bytes){return (bytes||[]).map(v=>Number(v).toString(16).padStart(2,'0').toUpperCase()).join(' ')}
function drawPath(ctx,engine,camera){
  ctx.save();ctx.translate(camera.ox,camera.oy);ctx.scale(camera.scale,camera.scale);
  ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='rgba(255,255,255,.46)';
  ctx.lineWidth=Math.max(.72,Math.min(1.18,camera.scale*.11))/camera.scale;ctx.stroke(engine.path);ctx.restore();
}

function drawRecent(ctx,engine,camera){
  if(engine.recent.length<1)return;ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
  for(let i=0;i<engine.recent.length;i++){
    const p=engine.recent[i],q=(i+1)/engine.recent.length,[ax,ay]=screenPoint(camera,p[0],p[1]),[bx,by]=screenPoint(camera,p[2],p[3]);
    ctx.strokeStyle=`rgba(255,255,255,${.04+.78*q*q})`;ctx.lineWidth=.7+1.25*q;
    ctx.shadowColor=`rgba(255,255,255,${.08+.38*q})`;ctx.shadowBlur=2+8*q;
    ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(bx,by);ctx.stroke();
  }
  ctx.restore();
}

function drawSparks(ctx,engine,camera,dt){
  for(let i=engine.sparks.length-1;i>=0;i--){
    const p=engine.sparks[i];p.age+=dt;if(p.age>.52){engine.sparks.splice(i,1);continue}
    const fade=1-p.age/.52,[sx,sy]=screenPoint(camera,p.x,p.y),drift=p.side*p.age*15;
    ctx.fillStyle=`rgba(255,255,255,${fade*.27})`;ctx.beginPath();ctx.arc(sx+drift,sy-p.age*8,.5+fade*1.35,0,TAU);ctx.fill();
  }
}

function drawHead(ctx,engine,camera,t){
  const [hx,hy]=screenPoint(camera,engine.x,engine.y),pulse=.5+.5*Math.sin(t*10),r=6+2*pulse;
  ctx.save();ctx.shadowColor='rgba(255,255,255,.9)';ctx.shadowBlur=9+9*pulse;ctx.fillStyle='#fff';
  ctx.beginPath();ctx.arc(hx,hy,1.5+.72*pulse,0,TAU);ctx.fill();ctx.shadowBlur=0;
  ctx.strokeStyle=`rgba(255,255,255,${.15+.2*pulse})`;ctx.lineWidth=.8;ctx.beginPath();ctx.arc(hx,hy,r,0,TAU);ctx.stroke();ctx.restore();
}
function ageText(engine){
  if(!engine.epochMs)return 'starting';
  const seconds=Math.max(0,Math.floor((Date.now()-engine.epochMs)/1000)),days=Math.floor(seconds/86400),hours=Math.floor(seconds%86400/3600),mins=Math.floor(seconds%3600/60);
  if(days)return `${days}d ${String(hours).padStart(2,'0')}h`;
  return `${String(hours).padStart(2,'0')}:${String(mins).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
}

function drawReadout(ctx,engine,w,h){
  const compact=w<760,bits=groupedBits(engine.bitTrail).slice(compact?-39:-72),bytes=hexBytes(engine.byteTrail).split(' ').slice(compact?-8:-16).join(' ');
  const total=engine.ones+engine.zeros,p=total?engine.ones/total:0,e=entropy(engine.ones,engine.zeros),mono='ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  const x=18,y=h-(compact?104:112),line=16;ctx.save();ctx.textAlign='left';ctx.font=`${compact?9:10}px ${mono}`;
  const label=(name,row)=>{ctx.fillStyle='rgba(255,255,255,.30)';ctx.fillText(name,x,y+line*row)};
  label('MODE',0);ctx.fillStyle='rgba(255,255,255,.62)';ctx.fillText(engine.mode==='seeded'?`SEEDED 24/7  ${engine.status.toUpperCase()}`:'LIVE / FRESH SEED',x+90,y);
  label('SEED',1);ctx.fillStyle='rgba(255,255,255,.54)';ctx.fillText(seedHex(engine.seed),x+90,y+line);
  label('TURN STREAM',2);ctx.fillStyle='rgba(255,255,255,.54)';ctx.fillText(bits||'—',x+90,y+line*2);
  label('OUTPUT BUS',3);ctx.fillStyle='rgba(255,255,255,.54)';ctx.fillText(bytes||'—',x+90,y+line*3);
  label('CHECKPOINT',4);ctx.fillStyle='rgba(255,255,255,.59)';ctx.fillText(`${engine.step} / 0x${engine.fnv.toString(16).padStart(16,'0')}`,x+90,y+line*4);
  label('ANALYSIS',5);ctx.fillStyle='rgba(255,255,255,.46)';ctx.fillText(`H ${e.toFixed(4)}   1s ${(p*100).toFixed(2)}%   AGE ${ageText(engine)}`,x+90,y+line*5);
  ctx.fillStyle='rgba(255,255,255,.20)';ctx.font=`${compact?8:9}px ${mono}`;ctx.fillText('CLICK CANVAS TO COPY CHECKPOINT  •  FNV64 NON-CRYPTO',x,y+line*6);ctx.restore();
}

function drawStatus(ctx,engine,w,h){
  ctx.save();ctx.fillStyle='rgba(255,255,255,.46)';ctx.font=`${Math.max(10,Math.min(13,w/65))}px ui-monospace, monospace`;ctx.textAlign='right';
  const state=engine.mode==='seeded'?`${engine.status} • shared world`:'fresh seed • local';
  ctx.fillText(`${engine.step} turns  •  ${state}`,w-18,h-16);ctx.restore();
}
export default function RewriteComputer(){
  let canvas,observer,frame,last=0,dpr=1,w=1,h=1,source=null,refreshTimer=null,connectSeq=0,refreshing=false,buffer=[];
  let engine=makeEngine('seeded',0n);
  const [mode,setMode]=createSignal('seeded'),[seedLabel,setSeedLabel]=createSignal('connecting…'),[statusLabel,setStatusLabel]=createSignal('connecting');

  const resize=()=>{
    if(!canvas)return;const rect=canvas.getBoundingClientRect();w=Math.max(1,rect.width);h=Math.max(1,rect.height);dpr=Math.min(globalThis.devicePixelRatio||1,2.5);
    canvas.width=Math.max(1,Math.round(w*dpr));canvas.height=Math.max(1,Math.round(h*dpr));engine.camera.ready=false;
  };
  const disconnect=()=>{connectSeq++;source?.close();source=null;if(refreshTimer)clearInterval(refreshTimer);refreshTimer=null;buffer=[];refreshing=false};

  const setUi=()=>{setSeedLabel(seedHex(engine.seed));setStatusLabel(engine.status)};
  const refreshSeeded=async seq=>{
    if(seq!==connectSeq||mode()!=='seeded'||refreshing)return;refreshing=true;
    try{
      const response=await fetch('/lambda-backend/seeded/snapshot',{cache:'no-store'});if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const data=await response.json();if(seq!==connectSeq)return;applySnapshot(engine,data);
      const queued=buffer.splice(0);for(const update of queued)if(!applySeededUpdate(engine,update))break;setUi();
    }catch(error){if(seq===connectSeq){engine.status='offline / retrying';setStatusLabel(engine.status);console.warn('[rewrite seeded]',error)}}finally{if(seq===connectSeq)refreshing=false}
  };

  const activateSeeded=()=>{
    disconnect();setMode('seeded');engine=makeEngine('seeded',0n);engine.status='connecting';setSeedLabel('connecting…');setStatusLabel('connecting');engine.camera.ready=false;
    const seq=connectSeq;refreshing=true;source=new EventSource('/lambda-backend/seeded/stream');
    source.addEventListener('update',event=>{
      if(seq!==connectSeq)return;try{const data=JSON.parse(event.data);if(refreshing)buffer.push(data);else if(!applySeededUpdate(engine,data))refreshSeeded(seq);setUi()}catch(error){console.warn('[rewrite stream]',error)}
    });
    source.addEventListener('hello',event=>{
      if(seq!==connectSeq)return;try{const data=JSON.parse(event.data);if(!refreshing&&Number(data.step)>engine.pathLastStep)refreshSeeded(seq);engine.status='24/7';setStatusLabel(engine.status)}catch{}
    });
    source.onerror=()=>{if(seq===connectSeq){engine.status='reconnecting';setStatusLabel(engine.status)}};
    refreshing=false;refreshSeeded(seq);refreshTimer=setInterval(()=>refreshSeeded(seq),30000);
  };

  const activateLive=()=>{
    disconnect();setMode('live');engine=makeEngine('live',freshSeed());engine.camera.ready=false;setUi();
  };

  const copyCheckpoint=()=>{
    const text=`rewrite-${engine.mode} seed=${seedHex(engine.seed)} turns=${engine.step} bytes=${engine.byteCount} fnv64=${engine.fnv.toString(16).padStart(16,'0')} pos=${engine.x},${engine.y} heading=${heading(engine.dir)}${engine.mode==='seeded'?` epoch=${new Date(engine.epochMs).toISOString()}`:''}`;
    globalThis.navigator?.clipboard?.writeText?.(text).catch?.(()=>{});
  };

  const draw=now=>{
    const dt=last?Math.min(.08,(now-last)/1000):0;last=now;
    if(engine.mode==='live'){
      engine.acc+=dt*RATE;let guard=0;while(engine.acc>=1&&guard++<48){advanceLive(engine);engine.acc-=1}
    }
    const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
    const camera=updateCamera(engine,w,h,dt);drawPath(ctx,engine,camera);drawRecent(ctx,engine,camera);drawSparks(ctx,engine,camera,dt);drawHead(ctx,engine,camera,now/1000);drawReadout(ctx,engine,w,h);drawStatus(ctx,engine,w,h);
    frame=requestAnimationFrame(draw);
  };

  onMount(()=>{resize();observer=new ResizeObserver(resize);observer.observe(canvas);activateSeeded();frame=requestAnimationFrame(draw)});
  onCleanup(()=>{disconnect();cancelAnimationFrame(frame);observer?.disconnect()});

  return <div class="rewrite-shell">
    <canvas ref={canvas} class="math-canvas rewrite-canvas" aria-label="Seeded and live recursive rewrite computer" onPointerDown={copyCheckpoint}/>
    <div class="rewrite-modebar" onPointerDown={event=>event.stopPropagation()}>
      <button type="button" class={mode()==='seeded'?'active':''} onClick={activateSeeded}>SEEDED 24/7</button>
      <button type="button" class={mode()==='live'?'active':''} onClick={activateLive}>LIVE</button>
      {mode()==='live'&&<button type="button" class="rewrite-new" onClick={activateLive}>NEW SEED</button>}
      <span class="rewrite-seed"><b>{mode()==='seeded'?'WORLD':'SEED'}</b> {seedLabel()}</span>
      <span class="rewrite-link">{statusLabel()}</span>
    </div>
  </div>;
}
