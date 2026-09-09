(() => {
'use strict';

const NS='http://www.w3.org/2000/svg';
const TICK_MS=100;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const ease=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;

function gcd(a,b){a=a<0n?-a:a;b=b<0n?-b:b;while(b){const t=a%b;a=b;b=t;}return a||1n;}
class Q{
  constructor(n,d=1n){if(d===0n)throw new Error('zero denominator');if(d<0n){n=-n;d=-d;}const g=gcd(n,d);this.n=n/g;this.d=d/g;}
  add(q){return new Q(this.n*q.d+q.n*this.d,this.d*q.d);}
  sub(q){return new Q(this.n*q.d-q.n*this.d,this.d*q.d);}
  mul(q){return new Q(this.n*q.n,this.d*q.d);}
  neg(){return new Q(-this.n,this.d);}
  num(){return Number(this.n)/Number(this.d);}
  text(){return this.d===1n?String(this.n):`${this.n}/${this.d}`;}
}
const q=(n,d=1)=>new Q(BigInt(n),BigInt(d));

function cloneVertex(v){return v.slice();}
function mapVertex(v,fn){return v.map(fn);}
function seedGraph(){return {vertices:[[]],edges:[]};}
function expandGraph(graph,r){
  const plus=v=>[r,...cloneVertex(v)];
  const minus=v=>[r.neg(),...cloneVertex(v)];
  const vp=graph.vertices.map(plus),vm=graph.vertices.map(minus);
  const ep=graph.edges.map(([a,b])=>[plus(a),plus(b)]);
  const em=graph.edges.map(([a,b])=>[minus(a),minus(b)]);
  const cross=graph.vertices.map(v=>[plus(v),minus(v)]);
  return {vertices:[...vp,...vm],edges:[...ep,...em,...cross]};
}
function iterate(n,fn,x){return n===0?x:iterate(n-1,fn,fn(x));}
function cubeGraph(r=q(1)){return iterate(3,g=>expandGraph(g,r),seedGraph());}

const CY=q(399,401),SY=q(40,401);
const CX=q(899,901),SX=q(60,901);
function rotateY([x,y,z]){return [CY.mul(x).add(SY.mul(z)),y,CY.mul(z).sub(SY.mul(x))];}
function rotateX([x,y,z]){return [x,CX.mul(y).sub(SX.mul(z)),SX.mul(y).add(CX.mul(z))];}
function rotateVertex(v){return rotateX(rotateY(v));}
function rotateGraph(g){return {vertices:g.vertices.map(rotateVertex),edges:g.edges.map(([a,b])=>[rotateVertex(a),rotateVertex(b)])};}

function fVertex(v){return v.map(x=>x.num());}
function project(v,w,h){
  const [x,y,z]=v,dist=4.5,scale=Math.min(w,h)*1.05,k=scale/(z+dist);
  return {x:w/2+x*k,y:h/2-y*k,z};
}
function prepareCanvas(canvas){
  const r=canvas.getBoundingClientRect(),dpr=Math.min(3,Math.max(1,devicePixelRatio||1));
  const W=Math.max(2,Math.round(r.width*dpr)),H=Math.max(2,Math.round(r.height*dpr));
  if(canvas.width!==W||canvas.height!==H){canvas.width=W;canvas.height=H;}
  const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,r.width,r.height);
  ctx.strokeStyle='#fff';ctx.fillStyle='#fff';ctx.lineCap='round';ctx.lineJoin='round';return {ctx,w:r.width,h:r.height};
}

const V=(binder,key)=>({t:'v',binder,key});
const L=(binder,body,key)=>({t:'l',binder,body,key});
const A=(a,b,key)=>({t:'a',a,b,key});
function church(n,prefix){
  const fb=prefix+':f',xb=prefix+':x';let body=V(xb,prefix+':x');
  for(let i=0;i<n;i++)body=A(V(fb,prefix+':f'+i),body,prefix+':a'+i);
  return L(fb,L(xb,body,prefix+':lx'),prefix+':lf');
}
function pair(a,b,prefix){const s=prefix+':s';return L(s,A(A(V(s,prefix+':sr'),a,prefix+':a'),b,prefix+':b'),prefix+':l');}
function tuple(items,prefix){let out=items[items.length-1];for(let i=items.length-2;i>=0;i--)out=pair(items[i],out,`${prefix}:${i}`);return out;}
function lambdaState(frame){
  return tuple([church(3,'dim'),church(frame%16,'frame'),church(8,'verts'),church(12,'edges'),church(10,'hz')],'cube');
}
function leaves(node,out=[]){if(node.t==='v')out.push(node);else if(node.t==='l')leaves(node.body,out);else{leaves(node.a,out);leaves(node.b,out);}return out;}
function layout(root){
  const vars=leaves(root,[]),left=18,right=982,segs=[],binderY=new Map(),ends=new Map();
  vars.forEach((v,i)=>v.x=vars.length<2?500:left+i*(right-left)/(vars.length-1));
  function scanL(n,d=0){if(n.t==='l'){const xs=leaves(n.body,[]).map(v=>v.x),y=16+d*11;binderY.set(n.binder,y);segs.push({id:'l'+n.key,x1:Math.min(...xs)-3,y1:y,x2:Math.max(...xs)+3,y2:y});scanL(n.body,d+1);}else if(n.t==='a'){scanL(n.a,d);scanL(n.b,d);}}
  function lm(n){return leaves(n,[])[0].x;}
  function depth(n,d=0){return n.t==='a'?Math.max(depth(n.a,d+1),depth(n.b,d+1)):n.t==='l'?depth(n.body,d):d;}
  const md=Math.max(1,depth(root));
  function scanA(n,d=0){if(n.t==='a'){const y=105+(d/md)*215;segs.push({id:'a'+n.key,x1:lm(n.a),y1:y,x2:lm(n.b),y2:y});for(const v of leaves(n,[]))ends.set(v.key,Math.max(ends.get(v.key)||0,y));scanA(n.a,d+1);scanA(n.b,d+1);}else if(n.t==='l')scanA(n.body,d);}
  scanL(root);scanA(root);
  for(const v of vars){const y1=binderY.get(v.binder)||8,y2=Math.max(y1+12,ends.get(v.key)||330);segs.push({id:'v'+v.key,x1:v.x,y1,x2:v.x,y2});}
  return segs;
}
class LambdaView{
  constructor(host){this.svg=document.createElementNS(NS,'svg');this.svg.setAttribute('viewBox','0 0 1000 360');this.group=document.createElementNS(NS,'g');this.svg.appendChild(this.group);host.appendChild(this.svg);this.live=new Map();}
  update(term){
    const next=new Map(layout(term).map(s=>[s.id,s]));
    for(const [id,s] of next){let el=this.live.get(id);if(!el){el=document.createElementNS(NS,'line');el.setAttribute('class','lambda-line');this.group.appendChild(el);this.live.set(id,el);}for(const k of ['x1','y1','x2','y2'])el.setAttribute(k,s[k]);}
    for(const [id,el] of [...this.live])if(!next.has(id)){el.remove();this.live.delete(id);}
  }
}

const canvas=document.getElementById('cubeCanvas');
const stage=document.getElementById('lambdaStage');
const frameEl=document.getElementById('frameValue');
const vertexEl=document.getElementById('vertexValue');
const edgeEl=document.getElementById('edgeValue');
const radiusEl=document.getElementById('radiusValue');
const exactEl=document.getElementById('exactValue');
const termEl=document.getElementById('termText');
const toggle=document.getElementById('toggle');
const reset=document.getElementById('reset');
const lambdaView=new LambdaView(stage);

let exact=cubeGraph(q(1)),from=exact,to=exact,frame=0,lastTick=performance.now(),paused=false;
termEl.textContent='λn.λr. n ROTGRAPH ((λf.λx.f (f (f x))) (EXPAND r) SEED)\n\nROTGRAPH, EXPAND, PAIR, MAP, signed integers and rationals are lambda definitions, not primitives. The browser uses exact BigInt rationals here as a verification/display boundary while the target calculus remains pure λ.';

function publish(){
  frameEl.textContent=String(frame);vertexEl.textContent=String(exact.vertices.length);edgeEl.textContent=String(exact.edges.length);radiusEl.textContent='1';
  exactEl.textContent=`cy=${CY.text()} sy=${SY.text()} cx=${CX.text()} sx=${SX.text()}`;
  lambdaView.update(lambdaState(frame));
}
function tick(now){
  if(!paused&&now-lastTick>=TICK_MS){const steps=Math.floor((now-lastTick)/TICK_MS);for(let i=0;i<steps;i++){from=to;to=rotateGraph(to);exact=to;frame++;}lastTick+=steps*TICK_MS;publish();}
}
function currentGraph(now){
  const t=paused?1:ease(clamp((now-lastTick)/TICK_MS,0,1));
  const verts=from.vertices.map((v,i)=>fVertex(v).map((x,j)=>lerp(x,to.vertices[i][j].num(),t)));
  const edges=from.edges.map((e,i)=>e.map((v,k)=>fVertex(v).map((x,j)=>lerp(x,to.edges[i][k][j].num(),t))));
  return {vertices:verts,edges};
}
function draw(now){
  tick(now);const {ctx,w,h}=prepareCanvas(canvas),g=currentGraph(now);
  const lines=g.edges.map(([a,b])=>({a:project(a,w,h),b:project(b,w,h)})).sort((u,v)=>(u.a.z+u.b.z)-(v.a.z+v.b.z));
  for(const line of lines){const z=(line.a.z+line.b.z)/2;ctx.globalAlpha=.5+.4*clamp((z+2)/4,0,1);ctx.lineWidth=1.25+1.1*clamp((z+2)/4,0,1);ctx.beginPath();ctx.moveTo(line.a.x,line.a.y);ctx.lineTo(line.b.x,line.b.y);ctx.stroke();}
  for(const v of g.vertices){const p=project(v,w,h);ctx.globalAlpha=.9;ctx.beginPath();ctx.arc(p.x,p.y,2.2,0,Math.PI*2);ctx.fill();}
  requestAnimationFrame(draw);
}
toggle.addEventListener('click',()=>{paused=!paused;toggle.textContent=paused?'Resume':'Pause';if(!paused)lastTick=performance.now();});
reset.addEventListener('click',()=>{exact=cubeGraph(q(1));from=exact;to=exact;frame=0;lastTick=performance.now();publish();});
publish();requestAnimationFrame(draw);
})();
