(() => {
'use strict';

const DEFAULT_BACKEND='https://lambda.scenicrouteservers.com';
const qs=new URLSearchParams(location.search);
const BACKEND=(qs.get('backend')||DEFAULT_BACKEND).replace(/\/$/,'');
const $=id=>document.getElementById(id);
const statusEl=$('connectionStatus'),clockValue=$('clockValue'),clockSource=$('clockSource');
const clockBeta=$('clockBeta'),clockRate=$('clockRate'),clockNodes=$('clockNodes');
const cubeFrame=$('frameValue'),cubeVertices=$('vertexValue'),cubeEdges=$('edgeValue'),cubePhase=$('phaseValue'),cubeBeta=$('betaValue'),cubeRate=$('rateValue'),cubeNodes=$('nodesValue');
const clockRaw=$('clockRaw'),cubeRaw=$('cubeRaw'),cubeCanvas=$('cubeCanvas'),clockCanvas=$('clockLambda'),cubeLambda=$('cubeLambda');
const pauseBtn=$('toggle'),resetBtn=$('reset');
let source=null,paused=false,lastState=null,lastCubeFrame=-999,cubeData=null,cubeDirty=true;

function prep(canvas){
  const r=canvas.getBoundingClientRect(),dpr=Math.min(2,Math.max(1,devicePixelRatio||1));
  const w=Math.max(2,Math.round(r.width*dpr)),h=Math.max(2,Math.round(r.height*dpr));
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
  const c=canvas.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,r.width,r.height);c.strokeStyle='#fff';c.fillStyle='#fff';c.lineCap='round';c.lineJoin='round';return{c,w:r.width,h:r.height};
}

function drawWire(canvas,wire){
  const{c,w,h}=prep(canvas);if(!wire)return;
  c.globalAlpha=.66;c.lineWidth=.8;
  for(const s of wire.segments||[]){const[x1,y1,x2,y2,k]=s;c.globalAlpha=k===0?.5:k===1?.72:.38;c.lineWidth=k===1?1.05:.72;c.beginPath();c.moveTo(8+x1*(w-16),6+y1*(h-12));c.lineTo(8+x2*(w-16),6+y2*(h-12));c.stroke();}
  const stack=wire.stack||[];if(stack.length){const base=h*.9,usable=h*.07;c.globalAlpha=.42;c.lineWidth=.8;for(let i=0;i<stack.length;i++){const x=8+i*(Math.max(1,w-16)/Math.max(1,stack.length-1));c.beginPath();c.moveTo(x,base);c.lineTo(x,base+usable*(stack[i]==='upd' ? .45 : 1));c.stroke();}}
  c.globalAlpha=1;
}

function bits(n){n=n<0n?-n:n;return n===0n?1:n.toString(2).length;}
function ratio(nText,dText){let n=BigInt(nText),d=BigInt(dText);if(n===0n)return 0;const neg=n<0n;if(neg)n=-n;const shift=Math.max(0,bits(d)-50),s=BigInt(shift);const v=Number(n>>s)/Number(d>>s);return neg?-v:v;}
function prepareGeometry(g){if(!g)return null;const vertices=new Map();for(const v of g.vertices)vertices.set(v.id,v.coords.map(x=>ratio(x,g.scale)));return{vertices,edges:g.edges};}
function project(v,w,h){const[x,y,z]=v,dist=4.6,k=Math.min(w,h)*1.06/(z+dist);return{x:w/2+x*k,y:h/2-y*k,z};}
function drawCube(){
  const{c,w,h}=prep(cubeCanvas);if(!cubeData)return;
  const lines=[];for(const[a,b]of cubeData.edges){const va=cubeData.vertices.get(a),vb=cubeData.vertices.get(b);if(va&&vb)lines.push([project(va,w,h),project(vb,w,h)]);}lines.sort((a,b)=>(a[0].z+a[1].z)-(b[0].z+b[1].z));
  for(const[a,b]of lines){const k=Math.max(0,Math.min(1,((a.z+b.z)/2+2)/4));c.globalAlpha=.45+.45*k;c.lineWidth=1.1+1.1*k;c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();}
  for(const v of cubeData.vertices.values()){const p=project(v,w,h);c.globalAlpha=.9;c.beginPath();c.arc(p.x,p.y,2.1,0,Math.PI*2);c.fill();}c.globalAlpha=1;
}

function formatRaw(label,r){
  if(!r)return label+'\n<no reducer state>';
  const lines=[label,'','CONTROL TERM',r.term?.text||'<none>','',`CONTROL ENV [${(r.env||[]).map(x=>'#'+x).join(' ')}]`,'','STACK (top last)'];
  if(r.stack?.length)for(const x of r.stack)lines.push(`${x.kind.toUpperCase()} #${x.cell}`);else lines.push('<empty>');
  lines.push('','REACHABLE CELLS');for(const c of r.cells||[])lines.push(`#${c.id} ${c.state} env=[${(c.env||[]).map(x=>'#'+x).join(' ')}]`);
  if(r.term?.truncated)lines.push('','[raw term clipped by transport budget; evaluator itself is not clipped]');
  return lines.join('\n');
}

function applyState(s){
  lastState=s;statusEl.textContent=`ONLINE • ${BACKEND} • ${s.clients} viewer${s.clients===1?'':'s'}`;statusEl.dataset.state='online';
  clockValue.textContent=s.clock.time;clockSource.textContent='America/Chicago • VPS raw lambda';clockBeta.textContent=Number(s.clock.beta||0).toLocaleString();clockRate.textContent=Math.round(s.clock.rate||0).toLocaleString()+' β/s';clockNodes.textContent=Number(s.clock.wire?.nodes||0).toLocaleString();drawWire(clockCanvas,s.clock.wire);
  cubeFrame.textContent=String(Math.max(0,s.cube.frame));cubePhase.textContent=s.cube.phase;cubeBeta.textContent=Number(s.cube.beta||0).toLocaleString();cubeRate.textContent=Math.round(s.cube.rate||0).toLocaleString()+' β/s';cubeNodes.textContent=Number(s.cube.wire?.nodes||0).toLocaleString();drawWire(cubeLambda,s.cube.wire);
  if(s.cube.geometry&&s.cube.frame!==lastCubeFrame){lastCubeFrame=s.cube.frame;cubeData=prepareGeometry(s.cube.geometry);cubeVertices.textContent=String(s.cube.geometry.vertices.length);cubeEdges.textContent=String(s.cube.geometry.edges.length);cubeDirty=true;}
}

function connect(){
  if(source)source.close();statusEl.textContent='CONNECTING • '+BACKEND;statusEl.dataset.state='connecting';
  source=new EventSource(BACKEND+'/events');
  source.addEventListener('state',e=>{if(!paused)applyState(JSON.parse(e.data));});
  source.addEventListener('raw',e=>{if(paused)return;const r=JSON.parse(e.data);clockRaw.textContent=formatRaw('RAW CLOCK REDUCER',r.clock);cubeRaw.textContent=formatRaw('RAW CUBE REDUCER',r.cube);});
  source.onerror=()=>{statusEl.textContent='BACKEND OFFLINE • showing local clock only';statusEl.dataset.state='offline';};
}

function localClock(){if(lastState||paused)return;clockValue.textContent=new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date());clockSource.textContent='local fallback • lambda backend disconnected';}
setInterval(localClock,250);localClock();

pauseBtn.addEventListener('click',()=>{paused=!paused;if(paused){source?.close();source=null;pauseBtn.textContent='Resume stream';statusEl.textContent='PAUSED • evaluator sleeps when no viewers';}else{pauseBtn.textContent='Pause stream';lastState=null;connect();}});
resetBtn.addEventListener('click',async()=>{try{await fetch(BACKEND+'/control',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'resetCube'})});}catch{statusEl.textContent='RESET FAILED • backend unreachable';}});

function paint(){if(cubeDirty){drawCube();cubeDirty=false;}requestAnimationFrame(paint);}window.addEventListener('resize',()=>{cubeDirty=true;if(lastState){drawWire(clockCanvas,lastState.clock.wire);drawWire(cubeLambda,lastState.cube.wire);}});connect();requestAnimationFrame(paint);
})();
