import {Show,createSignal,onCleanup,onMount} from 'solid-js';
import AuthKeyConsole from './AuthKeyConsole.jsx';
import {initialDirection,makeSeededTurnCursor,normalizeSeed,seededTurn,seedHex} from '../../shared/rewrite-seed.js';

const TAU=Math.PI*2;
const RATE=1000;
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
function makeEngine(mode,seed){
  const normalized=normalizeSeed(seed);
  return {
    mode,seed:normalized,epochMs:mode==='live'?Date.now():0,rate:RATE,status:mode==='live'?'live':'connecting',
    step:0,x:0,y:0,dir:initialDirection(normalized),fnv:FNV_OFFSET,bytePack:0,byteBits:0,byteCount:0,
    ones:0,zeros:0,minX:0,maxX:0,minY:0,maxY:0,recent:[],sparks:[],bitTrail:[],byteTrail:[],acc:0,
    camera:{scale:9,ox:0,oy:0,ready:false},serverTime:0,catchingUp:false,
    baseImage:null,previewImage:null,liveInk:null,baseStep:0,displayStep:0,
    rendering:false,renderId:0,renderTarget:0,renderProgress:0,renderStartedAt:0,lastRenderMs:0,
    pendingRender:[],reframeQueued:false,resizePending:false,workerFailed:false,frameMs:0
  };
}

function disposeImage(image){try{image?.close?.()}catch{}}
function makeRaster(w,h,dpr){
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(w*dpr));canvas.height=Math.max(1,Math.round(h*dpr));return canvas;
}
function setupWorldStroke(ctx,camera,dpr,alpha=.55){
  const far=Math.max(0,Math.min(1,(1.15-camera.scale)/1.08));
  ctx.setTransform(dpr*camera.scale,0,0,dpr*camera.scale,dpr*camera.ox,dpr*camera.oy);
  ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle=`rgba(255,255,255,${alpha-.20*far})`;
  ctx.lineWidth=(.86+.22*(1-far))/camera.scale;
}
function resetLiveInk(engine,w,h,dpr,camera){engine.liveInk=makeRaster(w,h,dpr);engine.inkDpr=dpr;engine.inkCamera={...camera}}
function strokePoints(engine,startX,startY,points){
  if(!engine.liveInk||!points.length)return;
  const ctx=engine.liveInk.getContext('2d');setupWorldStroke(ctx,engine.inkCamera,engine.inkDpr,.58);
  ctx.beginPath();ctx.moveTo(startX,startY);for(const point of points)ctx.lineTo(Number(point[1]),Number(point[2]));ctx.stroke();
}

function addRecent(engine,px,py,x,y,turn=0){
  engine.recent.push([px,py,x,y]);if(engine.recent.length>360)engine.recent.shift();
  if(engine.step%23===0){engine.sparks.push({x,y,side:turn>=0?1:-1,age:0});if(engine.sparks.length>36)engine.sparks.shift()}
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

function advanceLive(engine,out){
  const px=engine.x,py=engine.y;
  if(engine.dir===0)engine.x++;else if(engine.dir===1)engine.y++;else if(engine.dir===2)engine.x--;else engine.y--;
  engine.step++;const turn=seededTurn(BigInt(engine.step),engine.seed),bit=turn>0?1:0;
  recordLiveBit(engine,bit);engine.dir=(engine.dir+(turn>0?1:3))&3;updateBounds(engine,engine.x,engine.y);
  out.push([engine.step,engine.x,engine.y]);addRecent(engine,px,py,engine.x,engine.y,turn);
}

function parseHash(value){try{return BigInt(`0x${String(value||'0').replace(/^0x/,'')}`)&MASK64}catch{return 0n}}
function applySnapshot(engine,data){
  engine.seed=normalizeSeed(data.seed);engine.epochMs=Number(data.epochMs)||0;engine.rate=Number(data.rate)||RATE;
  engine.step=Number(data.step)||0;engine.x=Number(data.x)||0;engine.y=Number(data.y)||0;engine.dir=Number(data.dir)&3;
  engine.fnv=parseHash(data.fnv64);engine.byteCount=Number(data.byteCount)||0;engine.ones=Number(data.ones)||0;engine.zeros=Number(data.zeros)||0;
  const b=data.bounds||{};engine.minX=Number(b.minX)||0;engine.maxX=Number(b.maxX)||0;engine.minY=Number(b.minY)||0;engine.maxY=Number(b.maxY)||0;
  engine.bitTrail=Array.isArray(data.recentBits)?data.recentBits.slice(-64):[];engine.byteTrail=Array.isArray(data.recentBytes)?data.recentBytes.slice(-16):[];
  engine.serverTime=Number(data.serverTime)||Date.now();
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
  const previousBytes=engine.byteCount,points=Array.isArray(data.points)?data.points:[],oldX=engine.x,oldY=engine.y,oldStep=engine.step;
  const fresh=points.filter(point=>Number(point[0])>oldStep);
  if(fresh.length&&Number(fresh[0][0])!==oldStep+1){engine.status='resyncing';return false}
  for(let i=1;i<fresh.length;i++)if(Number(fresh[i][0])!==Number(fresh[i-1][0])+1){engine.status='resyncing';return false}
  if(fresh.length){
    strokePoints(engine,oldX,oldY,fresh);
    if(engine.rendering)for(const point of fresh)if(Number(point[0])>engine.renderTarget)engine.pendingRender.push(point);
    let px=oldX,py=oldY;for(const point of fresh){const x=Number(point[1]),y=Number(point[2]);addRecent(engine,px,py,x,y,0);px=x;py=y}
    engine.displayStep=Number(fresh[fresh.length-1][0]);
  }
  if(Number(data.step)>engine.displayStep&&Number(data.step)>oldStep){engine.status='resyncing';return false}
  emitSeededBytes(engine,data,previousBytes);
  engine.step=Number(data.step)||engine.step;engine.x=Number(data.x)||0;engine.y=Number(data.y)||0;engine.dir=Number(data.dir)&3;
  engine.fnv=parseHash(data.fnv64);engine.byteCount=Number(data.byteCount)||0;engine.ones=Number(data.ones)||0;engine.zeros=Number(data.zeros)||0;
  const b=data.bounds||{};engine.minX=Number(b.minX)||engine.minX;engine.maxX=Number(b.maxX)||engine.maxX;engine.minY=Number(b.minY)||engine.minY;engine.maxY=Number(b.maxY)||engine.maxY;
  engine.bitTrail=Array.isArray(data.recentBits)?data.recentBits.slice(-64):engine.bitTrail;engine.byteTrail=Array.isArray(data.recentBytes)?data.recentBytes.slice(-16):engine.byteTrail;
  engine.serverTime=Number(data.serverTime)||Date.now();engine.catchingUp=!!data.catchingUp;engine.status=engine.catchingUp?'catching up':'24/7';return true;
}

function targetCamera(engine,w,h){
  const spanX=Math.max(1,engine.maxX-engine.minX),spanY=Math.max(1,engine.maxY-engine.minY);
  const narrow=w<560,portrait=h>w*1.1,padX=narrow?.10:.16,padY=portrait?.11:.16;
  const scale=Math.min(11,w*(1-padX*2)/spanX,h*(1-padY*2)/spanY);
  return {scale,ox:w*.5-(engine.minX+engine.maxX)*.5*scale,oy:h*.5-(engine.minY+engine.maxY)*.5*scale,ready:true};
}
function cameraNeedsReframe(engine,w,h){
  const c=engine.camera;if(!c.ready)return true;
  const l=c.ox+engine.minX*c.scale,r=c.ox+engine.maxX*c.scale,t=c.oy+engine.minY*c.scale,b=c.oy+engine.maxY*c.scale;
  const mx=Math.max(22,w*.065),my=Math.max(22,h*.065);
  return l<mx||r>w-mx||t<my||b>h-my||engine.resizePending;
}
function screenPoint(camera,x,y){return [camera.ox+x*camera.scale,camera.oy+y*camera.scale]}
function groupedBits(bits){const text=(bits||[]).join('');return text.replace(/(.{8})/g,'$1 ').trim()}
function hexBytes(bytes){return (bytes||[]).map(v=>Number(v).toString(16).padStart(2,'0').toUpperCase()).join(' ')}
function buildPreview(engine,points,w,h,dpr,camera){
  const raster=makeRaster(w,h,dpr),ctx=raster.getContext('2d');setupWorldStroke(ctx,camera,dpr,.26);
  if(points.length){ctx.beginPath();ctx.moveTo(Number(points[0][1]),Number(points[0][2]));for(let i=1;i<points.length;i++)ctx.lineTo(Number(points[i][1]),Number(points[i][2]));ctx.stroke()}
  engine.previewImage=raster;
}
function drawRaster(ctx,engine,w,h){
  const image=engine.baseImage||engine.previewImage;if(image)ctx.drawImage(image,0,0,image.width,image.height,0,0,w,h);
  if(engine.liveInk)ctx.drawImage(engine.liveInk,0,0,engine.liveInk.width,engine.liveInk.height,0,0,w,h);
}

function drawOrigin(ctx,camera){
  const [x,y]=screenPoint(camera,0,0);if(x<-20||y<-20||x>ctx.canvas.width||y>ctx.canvas.height)return;
  ctx.save();ctx.strokeStyle='rgba(255,255,255,.10)';ctx.lineWidth=.7;ctx.beginPath();ctx.arc(x,y,4.5,0,TAU);ctx.stroke();ctx.restore();
}
function drawRecent(ctx,engine,camera){
  if(engine.recent.length<1)return;ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
  const keep=camera.scale<.35?96:camera.scale<.8?160:engine.recent.length,start=Math.max(0,engine.recent.length-keep);
  for(let i=start;i<engine.recent.length;i++){
    const p=engine.recent[i],q=(i-start+1)/Math.max(1,engine.recent.length-start),[ax,ay]=screenPoint(camera,p[0],p[1]),[bx,by]=screenPoint(camera,p[2],p[3]);
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
  const narrow=w<560,compact=w<820,total=engine.ones+engine.zeros,p=total?engine.ones/total:0,e=entropy(engine.ones,engine.zeros);
  const mono='ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',x=narrow?12:18,line=narrow?15:16;
  const bits=groupedBits(engine.bitTrail).slice(compact?-39:-72),bytes=hexBytes(engine.byteTrail).split(' ').slice(compact?-8:-16).join(' ');
  const rows=narrow?4:7,panelH=rows*line+18,y=h-panelH+5;
  const shade=ctx.createLinearGradient(0,y-18,0,h);shade.addColorStop(0,'rgba(0,0,0,0)');shade.addColorStop(.22,'rgba(0,0,0,.58)');shade.addColorStop(1,'rgba(0,0,0,.88)');
  ctx.fillStyle=shade;ctx.fillRect(0,y-18,w,h-y+18);ctx.save();ctx.textAlign='left';ctx.font=`${narrow?8.5:compact?9:10}px ${mono}`;
  const label=(name,row)=>{ctx.fillStyle='rgba(255,255,255,.28)';ctx.fillText(name,x,y+line*row)};
  const value=(text,row,alpha=.54)=>{ctx.fillStyle=`rgba(255,255,255,${alpha})`;ctx.fillText(text,x+(narrow?64:90),y+line*row)};
  if(narrow){
    label('MODE',0);value(`${engine.mode==='seeded'?'SEEDED 24/7':'LIVE'}  •  ${engine.rate.toLocaleString()} /s`,0,.68);
    label('SEED',1);value(seedHex(engine.seed),1,.50);
    label('STEP',2);value(`${engine.step.toLocaleString()}  •  ${heading(engine.dir)}  •  AGE ${ageText(engine)}`,2,.58);
    label('DATA',3);value(`H ${e.toFixed(4)}  •  ${(p*100).toFixed(1)}% 1s  •  ${engine.byteCount.toLocaleString()} B`,3,.46);
  }else{
    label('MODE',0);value(engine.mode==='seeded'?`SEEDED 24/7  ${engine.status.toUpperCase()}  •  ${engine.rate.toLocaleString()} /s`:`LIVE / FRESH SEED  •  ${engine.rate.toLocaleString()} /s`,0,.64);
    label('SEED',1);value(seedHex(engine.seed),1);label('TURN STREAM',2);value(bits||'—',2);label('OUTPUT BUS',3);value(bytes||'—',3);
    label('CHECKPOINT',4);value(`${engine.step.toLocaleString()} / 0x${engine.fnv.toString(16).padStart(16,'0')}`,4,.59);
    label('ANALYSIS',5);value(`H ${e.toFixed(4)}   1s ${(p*100).toFixed(2)}%   AGE ${ageText(engine)}`,5,.46);
    ctx.fillStyle='rgba(255,255,255,.18)';ctx.font=`${compact?8:9}px ${mono}`;ctx.fillText('SHARED VISUAL MODEL  •  AUTH KEY ANCHOR SOURCE',x,y+line*6);
  }
  ctx.restore();
}
function drawStatus(ctx,engine,w,h){
  if(w<620)return;ctx.save();ctx.fillStyle='rgba(255,255,255,.42)';ctx.font=`${Math.max(10,Math.min(13,w/65))}px ui-monospace, monospace`;ctx.textAlign='right';
  const state=engine.mode==='seeded'?`${engine.status} • shared world`:'fresh seed • local';
  ctx.fillText(`${engine.step.toLocaleString()} turns  •  ${engine.rate.toLocaleString()}/s  •  ${state}`,w-18,h-16);ctx.restore();
}
export default function RewriteComputer(){
  let canvas,observer,frame,worker=null,source=null,last=0,dpr=1,w=1,h=1,connectSeq=0,refreshing=false,buffer=[],renderSerial=0,debugAt=0;
  let engine=makeEngine('seeded',0n);
  const [mode,setMode]=createSignal('seeded'),[seedLabel,setSeedLabel]=createSignal('connecting…'),[statusLabel,setStatusLabel]=createSignal('connecting'),[keysOpen,setKeysOpen]=createSignal(false);
  const setUi=()=>{setSeedLabel(seedHex(engine.seed));setStatusLabel(engine.status)};
  const cancelRender=()=>{if(!engine.rendering)return;worker?.postMessage({type:'cancel',id:++renderSerial});engine.rendering=false;engine.pendingRender=[]};
  const resize=()=>{
    if(!canvas)return;const rect=canvas.getBoundingClientRect();w=Math.max(1,rect.width);h=Math.max(1,rect.height);dpr=Math.min(globalThis.devicePixelRatio||1,w<600?2:2.75);
    canvas.width=Math.max(1,Math.round(w*dpr));canvas.height=Math.max(1,Math.round(h*dpr));if(engine.camera.ready)engine.resizePending=true;
  };
  const disconnect=()=>{connectSeq++;source?.close();source=null;cancelRender();buffer=[];refreshing=false;disposeImage(engine.baseImage)};

  const acceptExact=(image,job,head)=>{
    if(job.id!==engine.renderId){disposeImage(image);return}
    if(Math.abs(job.width-w)>1||Math.abs(job.height-h)>1||Math.abs(job.dpr-dpr)>.01){disposeImage(image);engine.rendering=false;engine.resizePending=true;requestExact('reframing');return}
    disposeImage(engine.baseImage);engine.baseImage=image;engine.previewImage=null;engine.baseStep=job.step;engine.camera={...job.camera,ready:true};
    resetLiveInk(engine,w,h,dpr,engine.camera);
    const replay=engine.pendingRender.filter(point=>Number(point[0])>job.step);strokePoints(engine,head.x,head.y,replay);
    engine.displayStep=replay.length?Number(replay[replay.length-1][0]):job.step;engine.pendingRender=[];engine.rendering=false;engine.renderProgress=100;
    engine.resizePending=false;engine.lastRenderMs=performance.now()-engine.renderStartedAt;engine.status=engine.mode==='seeded'?'24/7':'live';setUi();
    if(engine.reframeQueued||cameraNeedsReframe(engine,w,h)){engine.reframeQueued=false;queueMicrotask(()=>requestExact('reframing'))}
  };

  const fallbackRender=async job=>{
    const raster=makeRaster(job.width,job.height,job.dpr),ctx=raster.getContext('2d'),cursor=makeSeededTurnCursor(job.seed,1);
    let x=0,y=0,dir=initialDirection(job.seed),done=0;setupWorldStroke(ctx,job.camera,job.dpr,.56);
    while(done<job.step&&job.id===engine.renderId){
      const end=Math.min(job.step,done+12000);ctx.beginPath();ctx.moveTo(x,y);
      for(;done<end;done++){if(dir===0)x++;else if(dir===1)y++;else if(dir===2)x--;else y--;const turn=cursor.next();dir=(dir+(turn>0?1:3))&3;ctx.lineTo(x,y)}ctx.stroke();
      engine.renderProgress=job.step?Math.floor(done*100/job.step):100;engine.status=`exact ${engine.renderProgress}%`;setStatusLabel(engine.status);
      await new Promise(resolve=>requestAnimationFrame(resolve));
    }
    if(job.id===engine.renderId)acceptExact(raster,job,{x,y,dir});
  };
  const requestExact=(reason='exact')=>{
    if(!canvas||engine.step<1)return;if(engine.rendering){engine.reframeQueued=true;return}
    const camera=targetCamera(engine,w,h),id=++renderSerial,job={type:'render',id,seed:seedHex(engine.seed),step:engine.step,width:w,height:h,dpr,camera};
    engine.rendering=true;engine.renderId=id;engine.renderTarget=engine.step;engine.renderProgress=0;engine.renderStartedAt=performance.now();engine.pendingRender=[];engine.reframeQueued=false;
    engine.status=`${reason} 0%`;setStatusLabel(engine.status);engine.currentRenderJob=job;
    if(worker&&!engine.workerFailed)worker.postMessage(job);else fallbackRender(job);
  };
  const maybeReframe=()=>{if(engine.step>0&&cameraNeedsReframe(engine,w,h))requestExact('reframing exact')};

  const refreshSeeded=async seq=>{
    if(seq!==connectSeq||mode()!=='seeded'||refreshing)return;refreshing=true;cancelRender();
    try{
      const response=await fetch('/lambda-backend/seeded/snapshot',{cache:'no-store'});if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const data=await response.json();if(seq!==connectSeq)return;applySnapshot(engine,data);engine.camera=targetCamera(engine,w,h);engine.displayStep=engine.step;
      resetLiveInk(engine,w,h,dpr,engine.camera);buildPreview(engine,Array.isArray(data.points)?data.points:[],w,h,dpr,engine.camera);requestExact('restoring exact');
      const queued=buffer.splice(0);for(const update of queued)if(!applySeededUpdate(engine,update)){queueMicrotask(()=>refreshSeeded(seq));break}setUi();
    }catch(error){if(seq===connectSeq){engine.status='offline / retrying';setStatusLabel(engine.status);console.warn('[rewrite seeded]',error)}}finally{if(seq===connectSeq)refreshing=false}
  };

  const activateSeeded=()=>{
    disconnect();setMode('seeded');engine=makeEngine('seeded',0n);engine.status='connecting';setSeedLabel('connecting…');setStatusLabel('connecting');
    const seq=connectSeq;refreshing=true;source=new EventSource('/lambda-backend/seeded/stream');
    source.addEventListener('update',event=>{
      if(seq!==connectSeq)return;try{const data=JSON.parse(event.data);if(refreshing)buffer.push(data);else if(!applySeededUpdate(engine,data))refreshSeeded(seq);else{setUi();maybeReframe()}}catch(error){console.warn('[rewrite stream]',error)}
    });
    source.addEventListener('hello',event=>{
      if(seq!==connectSeq)return;try{const data=JSON.parse(event.data);if(!refreshing&&Number(data.step)>engine.displayStep+1)refreshSeeded(seq)}catch{}
    });
    source.onerror=()=>{if(seq===connectSeq){engine.status='reconnecting';setStatusLabel(engine.status)}};
    refreshing=false;refreshSeeded(seq);
  };
  const activateLive=()=>{
    disconnect();setMode('live');engine=makeEngine('live',freshSeed());engine.camera=targetCamera(engine,w,h);resetLiveInk(engine,w,h,dpr,engine.camera);engine.displayStep=0;setUi();
  };
  const copyCheckpoint=()=>{
    const text=`rewrite-${engine.mode} seed=${seedHex(engine.seed)} turns=${engine.step} bytes=${engine.byteCount} fnv64=${engine.fnv.toString(16).padStart(16,'0')} pos=${engine.x},${engine.y} heading=${heading(engine.dir)}${engine.mode==='seeded'?` epoch=${new Date(engine.epochMs).toISOString()}`:''}`;
    globalThis.navigator?.clipboard?.writeText?.(text).catch?.(()=>{});
  };
  const publishDebug=now=>{
    if(now<debugAt)return;debugAt=now+500;globalThis.__rewriteDebug={mode:engine.mode,step:engine.step,displayStep:engine.displayStep,baseStep:engine.baseStep,rate:engine.rate,rendering:engine.rendering,progress:engine.renderProgress,lastRenderMs:Math.round(engine.lastRenderMs),frameMs:Number(engine.frameMs.toFixed(2)),seed:seedHex(engine.seed),camera:{...engine.camera},worker:!!worker&&!engine.workerFailed};
  };

  const draw=now=>{
    const raw=last?Math.min(.08,(now-last)/1000):0;last=now;engine.frameMs=engine.frameMs?engine.frameMs*.92+raw*1000*.08:raw*1000;
    if(engine.mode==='live'){
      const sx=engine.x,sy=engine.y,points=[];engine.acc+=raw*RATE;let guard=0;
      while(engine.acc>=1&&guard++<180){advanceLive(engine,points);engine.acc-=1}
      if(points.length){strokePoints(engine,sx,sy,points);engine.displayStep=engine.step;if(engine.rendering)for(const point of points)if(Number(point[0])>engine.renderTarget)engine.pendingRender.push(point)}
    }
    maybeReframe();const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    drawRaster(ctx,engine,w,h);const camera=engine.camera;drawOrigin(ctx,camera);drawRecent(ctx,engine,camera);drawSparks(ctx,engine,camera,raw);drawHead(ctx,engine,camera,now/1000);drawReadout(ctx,engine,w,h);drawStatus(ctx,engine,w,h);publishDebug(now);
    frame=requestAnimationFrame(draw);
  };
  onMount(()=>{
    resize();observer=new ResizeObserver(resize);observer.observe(canvas);
    try{
      worker=new Worker(new URL('./rewriteRaster.worker.js',import.meta.url),{type:'module'});
      worker.onmessage=event=>{const msg=event.data||{};if(msg.id!==engine.renderId){disposeImage(msg.bitmap);return}
        if(msg.type==='progress'){engine.renderProgress=msg.progress;engine.status=`exact ${msg.progress}%`;setStatusLabel(engine.status);return}
        if(msg.type==='rendered'){acceptExact(msg.bitmap,engine.currentRenderJob,{x:msg.x,y:msg.y,dir:msg.dir});return}
        if(msg.type==='error'){console.warn('[rewrite worker]',msg.message);engine.workerFailed=true;engine.rendering=false;fallbackRender(engine.currentRenderJob)}
      };
      worker.onerror=error=>{console.warn('[rewrite worker error]',error);engine.workerFailed=true;if(engine.rendering){engine.rendering=false;fallbackRender(engine.currentRenderJob)}};
    }catch(error){console.warn('[rewrite worker unavailable]',error);engine.workerFailed=true}
    activateSeeded();frame=requestAnimationFrame(draw);
  });
  onCleanup(()=>{disconnect();cancelAnimationFrame(frame);observer?.disconnect();worker?.terminate();disposeImage(engine.baseImage);delete globalThis.__rewriteDebug});

  return <div class="rewrite-shell">
    <canvas ref={canvas} class="math-canvas rewrite-canvas" aria-label="Seeded and live recursive rewrite computer" onPointerDown={copyCheckpoint}/>
    <div class="rewrite-modebar" onPointerDown={event=>event.stopPropagation()}>
      <button type="button" class={mode()==='seeded'?'active':''} onClick={activateSeeded}>SEEDED 24/7</button>
      <button type="button" class={mode()==='live'?'active':''} onClick={activateLive}>LIVE</button>
      {mode()==='live'&&<button type="button" class="rewrite-new" onClick={activateLive}>NEW SEED</button>}
      <button type="button" class={keysOpen()?'active rewrite-keys':''} onClick={()=>setKeysOpen(value=>!value)}>KEYS</button>
      <span class="rewrite-seed"><b>{mode()==='seeded'?'WORLD':'SEED'}</b> {seedLabel()}</span>
      <span class="rewrite-link">{statusLabel()}</span>
    </div>
    <Show when={keysOpen()}><AuthKeyConsole onClose={()=>setKeysOpen(false)}/></Show>
  </div>;
}
