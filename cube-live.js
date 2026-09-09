import {Machine,workflow} from './lambda-machine.js';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const ease=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;

function termStats(root){
  let vars=0,lamsN=0,appsN=0,nodes=0,maxDepth=0;const stack=[[root,0]];
  while(stack.length){const [t,d]=stack.pop();nodes++;maxDepth=Math.max(maxDepth,d);if(t.t==='v')vars++;else if(t.t==='l'){lamsN++;stack.push([t.b,d+1]);}else{appsN++;stack.push([t.x,d+1],[t.f,d+1]);}}
  return {vars,lams:lamsN,apps:appsN,nodes,maxDepth};
}
function drawTermDensity(canvas,closure,machine){
  const r=canvas.getBoundingClientRect(),dpr=Math.min(2,Math.max(1,devicePixelRatio||1)),pw=Math.max(2,Math.round(r.width*dpr)),ph=Math.max(2,Math.round(r.height*dpr));
  if(canvas.width!==pw||canvas.height!==ph){canvas.width=pw;canvas.height=ph;}
  const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,r.width,r.height);ctx.strokeStyle='#fff';ctx.lineCap='round';
  if(!closure)return;
  const leaves=[];
  function collect(t,depth=0,bind=[]){if(t.t==='v'){leaves.push({t,depth,target:bind[t.i]??0});return;}if(t.t==='l')collect(t.b,depth+1,[depth,...bind]);else{collect(t.f,depth+1,bind);collect(t.x,depth+1,bind);}}
  collect(closure.term);const maxD=Math.max(1,...leaves.map(x=>x.depth)),N=Math.max(1,leaves.length);let li=0;ctx.globalAlpha=.72;ctx.lineWidth=clamp(1.35-Math.log10(N+1)*.14,.35,1.15);
  function walk(t,depth=0,bindY=[]){const y=8+(depth/maxD)*(r.height*.78);if(t.t==='v'){const x=10+(li++)*(Math.max(1,r.width-20)/Math.max(1,N-1));const by=bindY[t.i]??4;ctx.beginPath();ctx.moveTo(x,by);ctx.lineTo(x,y);ctx.stroke();return{x1:x,x2:x};}if(t.t==='l'){const rr=walk(t.b,depth+1,[y,...bindY]);ctx.beginPath();ctx.moveTo(rr.x1,y);ctx.lineTo(rr.x2,y);ctx.stroke();return rr;}const a=walk(t.f,depth+1,bindY),b=walk(t.x,depth+1,bindY);ctx.beginPath();ctx.moveTo((a.x1+a.x2)/2,y);ctx.lineTo((b.x1+b.x2)/2,y);ctx.stroke();return{x1:Math.min(a.x1,b.x1),x2:Math.max(a.x2,b.x2)};}
  walk(closure.term);
  if(machine){
    const base=r.height*.84,usable=r.height*.14,frames=machine.stack.length;ctx.globalAlpha=.38;ctx.lineWidth=.7;
    for(let i=0;i<frames;i++){const x=10+i*(Math.max(1,r.width-20)/Math.max(1,frames-1));const fr=machine.stack[i];ctx.beginPath();ctx.moveTo(x,base);ctx.lineTo(x,base+usable*(fr.k==='upd'?.45:1));ctx.stroke();}
    const env=closure.env.length;for(let i=0;i<env;i++){const x=10+i*(Math.max(1,r.width-20)/Math.max(1,env-1));ctx.beginPath();ctx.moveTo(x,r.height-4);ctx.lineTo(x,r.height-(closure.env[i].value?12:7));ctx.stroke();}
  }
}
function canvas2d(canvas){
  const r=canvas.getBoundingClientRect(),dpr=Math.min(3,Math.max(1,devicePixelRatio||1)),pw=Math.max(2,Math.round(r.width*dpr)),ph=Math.max(2,Math.round(r.height*dpr));
  if(canvas.width!==pw||canvas.height!==ph){canvas.width=pw;canvas.height=ph;}
  const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,r.width,r.height);ctx.strokeStyle='#fff';ctx.fillStyle='#fff';ctx.lineCap='round';ctx.lineJoin='round';return{ctx,w:r.width,h:r.height};
}
function bitLength(n){n=n<0n?-n:n;return n===0n?1:n.toString(2).length;}
function ratioBig(n,d){if(n===0n)return 0;const sign=n<0n?-1:1,a=n<0n?-n:n,shift=Math.max(0,bitLength(d)-50),s=BigInt(shift);return sign*Number(a>>s)/Number(d>>s);}
function floatFrame(decoded){
  const vertices=new Map();for(const vtx of decoded.graph.vertices)vertices.set(vtx.id,vtx.coords.map(n=>ratioBig(n,decoded.scale)));
  return {vertices,edges:decoded.graph.edges,scale:decoded.scale};
}
function project(v,w,h){const [x,y,z]=v,dist=4.6,k=Math.min(w,h)*1.06/(z+dist);return{x:w/2+x*k,y:h/2-y*k,z};}

const cubeCanvas=document.getElementById('cubeCanvas');
const stage=document.getElementById('lambdaStage');
const lambdaCanvas=document.createElement('canvas');lambdaCanvas.setAttribute('aria-label','Live pure lambda evaluator');stage.replaceChildren(lambdaCanvas);
const frameEl=document.getElementById('frameValue'),vertexEl=document.getElementById('vertexValue'),edgeEl=document.getElementById('edgeValue'),radiusEl=document.getElementById('radiusValue');
const exactEl=document.getElementById('exactValue'),termEl=document.getElementById('termText'),toggle=document.getElementById('toggle'),reset=document.getElementById('reset');
const betaEl=document.getElementById('betaValue'),rateEl=document.getElementById('rateValue'),phaseEl=document.getElementById('phaseValue'),nodesEl=document.getElementById('nodesValue');

let gen=null,request=null,machine=null,phase='starting',frame=0,totalBeta=0,totalSteps=0,rate=0,lastRateBeta=0,lastRateAt=performance.now(),paused=false;
let previousFrame=null,currentFrame=null,morphStart=performance.now(),morphDuration=150,lastDisplay=0,errorText='';
function acceptFrame(item){
  previousFrame=currentFrame||floatFrame(item.decoded);currentFrame=floatFrame(item.decoded);morphStart=performance.now();phase=item.label;frame=currentFrame?frame+1:frame;
  vertexEl.textContent=String(item.decoded.graph.vertices.length);edgeEl.textContent=String(item.decoded.graph.edges.length);radiusEl.textContent='1';
  exactEl.textContent=`pure scaled rotation: cos=12/13 sin=5/13, Y then X | λ scale=${item.decoded.scale}`;
}
function advance(value){
  for(;;){
    const n=gen.next(value);value=undefined;if(n.done){request=null;machine=null;return;}
    const item=n.value;
    if(item.kind==='frame'){acceptFrame(item);continue;}
    request=item;phase=item.label;machine=new Machine(item.fn,item.args);return;
  }
}
function resetRuntime(){
  gen=workflow();request=null;machine=null;phase='starting';frame=-1;totalBeta=0;totalSteps=0;rate=0;lastRateBeta=0;lastRateAt=performance.now();previousFrame=null;currentFrame=null;errorText='';advance();
}
function computeSlice(){
  if(!paused&&!errorText){
    const deadline=performance.now()+10;
    try{
      while(performance.now()<deadline&&machine){
        const before=machine.beta,cont=machine.step();totalSteps++;totalBeta+=machine.beta-before;
        if(!cont){const result=machine.control;machine=null;advance(result);}
      }
    }catch(e){errorText=String(e&&e.stack||e);phase='evaluator error';machine=null;}
  }
  const now=performance.now();if(now-lastRateAt>=500){rate=(totalBeta-lastRateBeta)/((now-lastRateAt)/1000);lastRateBeta=totalBeta;lastRateAt=now;}
  setTimeout(computeSlice,0);
}
function drawCube(now){
  const {ctx,w,h}=canvas2d(cubeCanvas);if(!currentFrame)return;
  const a=previousFrame||currentFrame,b=currentFrame,t=ease(clamp((now-morphStart)/morphDuration,0,1));
  const point=id=>{const pa=a.vertices.get(id)||b.vertices.get(id),pb=b.vertices.get(id);return pa.map((x,i)=>lerp(x,pb[i],t));};
  const lines=b.edges.map(([ia,ib])=>({a:project(point(ia),w,h),b:project(point(ib),w,h)})).sort((u,v)=>(u.a.z+u.b.z)-(v.a.z+v.b.z));
  for(const line of lines){const z=(line.a.z+line.b.z)/2,d=.48+.45*clamp((z+2)/4,0,1);ctx.globalAlpha=d;ctx.lineWidth=1.2+1.1*d;ctx.beginPath();ctx.moveTo(line.a.x,line.a.y);ctx.lineTo(line.b.x,line.b.y);ctx.stroke();}
  for(const [id] of b.vertices){const p=project(point(id),w,h);ctx.globalAlpha=.85;ctx.beginPath();ctx.arc(p.x,p.y,2.1,0,Math.PI*2);ctx.fill();}
}
function ui(now){
  drawCube(now);
  if(now-lastDisplay>80){
    const closure=machine?machine.control:(request?request.fn:null);drawTermDensity(lambdaCanvas,closure,machine);
    const st=closure?termStats(closure.term):{nodes:0};frameEl.textContent=String(Math.max(0,frame));betaEl.textContent=totalBeta.toLocaleString();rateEl.textContent=Math.round(rate).toLocaleString()+' β/s';phaseEl.textContent=phase;nodesEl.textContent=st.nodes.toLocaleString();
    termEl.textContent=errorText||`LIVE CALL-BY-NEED GRAPH REDUCER\n\nphase: ${phase}\nβ reductions: ${totalBeta.toLocaleString()}\nmachine transitions: ${totalSteps.toLocaleString()}\nβ rate: ${Math.round(rate).toLocaleString()} / second\ncontrol nodes: ${st.nodes.toLocaleString()}\nstack frames: ${machine?machine.stack.length:0}\nenvironment cells: ${closure?closure.env.length:0}\n\nThe line field is generated directly from the evaluator's active de Bruijn control term. The lower wire strip is the live argument/update stack and environment cache. Topology, IDs, coordinates, binary arithmetic, rotation and scale all pass through this reducer. JavaScript only schedules reductions, observes the normal form and projects decoded coordinates to pixels.`;
    lastDisplay=now;
  }
  requestAnimationFrame(ui);
}
toggle.addEventListener('click',()=>{paused=!paused;toggle.textContent=paused?'Resume evaluator':'Pause evaluator';phase=paused?'paused':(request?.label||'running');});
reset.addEventListener('click',()=>{paused=false;toggle.textContent='Pause evaluator';resetRuntime();});

resetRuntime();computeSlice();requestAnimationFrame(ui);
