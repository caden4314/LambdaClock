(() => {
'use strict';

const NS='http://www.w3.org/2000/svg';
const TAU=Math.PI*2;
const TICK_MS=100;
const TICK_HZ=10;
const SIM_DT=1/TICK_HZ;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const ease=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
const nowMs=()=>performance.now();
function entropySeed(){
  try{const a=new Uint32Array(1);crypto.getRandomValues(a);return a[0]||0x9e3779b9;}catch(_){return (Date.now()^(Math.random()*0xffffffff))>>>0;}
}
function xorshift32(x){x^=x<<13;x^=x>>>17;x^=x<<5;return x>>>0;}
function decimal2(n,prefix){n=Math.abs(Math.floor(n))%100;return pair(church(Math.floor(n/10),prefix+':t'),church(n%10,prefix+':o'),prefix+':d2');}

const V=(binder,key)=>({t:'v',binder,key});
const L=(binder,body,key)=>({t:'l',binder,body,key});
const A=(a,b,key)=>({t:'a',a,b,key});

function church(n,prefix){
  n=clamp(Math.round(n),0,36);
  const fb=prefix+':f',xb=prefix+':x';
  let body=V(xb,prefix+':x-ref');
  for(let i=0;i<n;i++) body=A(V(fb,prefix+':f-ref:'+i),body,prefix+':app:'+i);
  return L(fb,L(xb,body,prefix+':lx'),prefix+':lf');
}
function churchBool(value,prefix){
  const tb=prefix+':t',fb=prefix+':f';
  return L(tb,L(fb,V(value?tb:fb,prefix+':ret'),prefix+':lf'),prefix+':lt');
}
function pair(a,b,prefix){
  const pb=prefix+':p';
  return L(pb,A(A(V(pb,prefix+':p-ref'),a,prefix+':a0'),b,prefix+':a1'),prefix+':lp');
}
function signedChurch(q,prefix){
  q=clamp(Math.round(q),-14,14);
  return pair(church(Math.max(0,q),prefix+':pos'),church(Math.max(0,-q),prefix+':neg'),prefix+':signed');
}
function tuple(items,prefix='state'){
  const pb=prefix+':p';
  let body=V(pb,prefix+':p-ref');
  items.forEach((item,i)=>{body=A(body,item,prefix+':app:'+i);});
  return L(pb,body,prefix+':lambda');
}
function numericState(values,prefix='state'){
  return tuple(values.map((v,i)=>signedChurch(v,prefix+':v'+i)),prefix);
}
function leaves(node,out=[]){
  if(node.t==='v') out.push(node);
  else if(node.t==='l') leaves(node.body,out);
  else{leaves(node.a,out);leaves(node.b,out);}
  return out;
}
function layoutTerm(root){
  const vars=leaves(root,[]);
  const left=18,right=982;
  vars.forEach((v,i)=>v.x=vars.length<2?500:left+i*(right-left)/(vars.length-1));
  const segs=[],binderY=new Map(),binderRange=new Map(),verticalEnds=new Map();
  function scanBinders(node,depth=0){
    if(node.t==='l'){
      const xs=leaves(node.body,[]).map(v=>v.x);
      const y=12+depth*11;
      binderY.set(node.binder,y);
      binderRange.set(node.binder,[Math.min(...xs)-3,Math.max(...xs)+3,node.key]);
      scanBinders(node.body,depth+1);
    }else if(node.t==='a'){
      scanBinders(node.a,depth);scanBinders(node.b,depth);
    }
  }
  function maxAppDepth(node,d=0){
    if(node.t==='a') return Math.max(maxAppDepth(node.a,d+1),maxAppDepth(node.b,d+1));
    if(node.t==='l') return maxAppDepth(node.body,d);
    return d;
  }
  function leftmost(node){return leaves(node,[])[0].x;}
  function scanApps(node,depth,maxDepth){
    if(node.t==='a'){
      const y=96+(depth/Math.max(1,maxDepth))*238;
      const x1=leftmost(node.a),x2=leftmost(node.b);
      segs.push({id:'a:'+node.key,x1,y1:y,x2,y2:y});
      for(const v of leaves(node,[])) verticalEnds.set(v.key,Math.max(verticalEnds.get(v.key)||0,y));
      scanApps(node.a,depth+1,maxDepth);scanApps(node.b,depth+1,maxDepth);
    }else if(node.t==='l') scanApps(node.body,depth,maxDepth);
  }
  scanBinders(root);
  scanApps(root,0,maxAppDepth(root));
  for(const [binder,y] of binderY){
    const [x1,x2,key]=binderRange.get(binder);
    segs.push({id:'l:'+key,x1,y1:y,x2,y2:y});
  }
  for(const v of vars){
    const y1=binderY.get(v.binder)??6;
    const y2=Math.min(352,Math.max(y1+14,verticalEnds.get(v.key)||330));
    segs.push({id:'v:'+v.key,x1:v.x,y1,x2:v.x,y2});
  }
  return segs;
}

class LambdaDisplay{
  constructor(host,duration=180){
    this.svg=document.createElementNS(NS,'svg');
    this.svg.setAttribute('viewBox','0 0 1000 360');
    this.svg.setAttribute('preserveAspectRatio','none');
    this.svg.classList.add('lambda-svg');
    this.group=document.createElementNS(NS,'g');
    this.svg.appendChild(this.group);
    host.appendChild(this.svg);
    this.duration=duration;
    this.live=new Map();
    this.animToken=0;
    this.reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false;
  }
  newLine(){
    const el=document.createElementNS(NS,'line');
    el.setAttribute('class','lambda-line');
    this.group.appendChild(el);
    return el;
  }
  set(item,g,opacity){
    item.geom={x1:g.x1,y1:g.y1,x2:g.x2,y2:g.y2};
    item.opacity=opacity;
    item.el.setAttribute('x1',g.x1.toFixed(2));
    item.el.setAttribute('y1',g.y1.toFixed(2));
    item.el.setAttribute('x2',g.x2.toFixed(2));
    item.el.setAttribute('y2',g.y2.toFixed(2));
    item.el.style.opacity=String(opacity);
  }
  collapse(g){
    const x=(g.x1+g.x2)/2,y=(g.y1+g.y2)/2;
    return {x1:x,y1:y,x2:x,y2:y};
  }
  term(term){this.morph(layoutTerm(term));}
  morph(nextSegs){
    const token=++this.animToken;
    const next=new Map(nextSegs.map(s=>[s.id,s]));
    const jobs=[];
    for(const s of nextSegs){
      let item=this.live.get(s.id);
      if(!item){
        item={el:this.newLine(),geom:this.collapse(s),opacity:0};
        this.set(item,item.geom,0);
        this.live.set(s.id,item);
      }
      jobs.push({id:s.id,item,from:{...item.geom},to:s,fo:item.opacity??1,toOp:1,remove:false});
    }
    for(const [id,item] of this.live){
      if(next.has(id)) continue;
      jobs.push({id,item,from:{...item.geom},to:this.collapse(item.geom),fo:item.opacity??1,toOp:0,remove:true});
    }
    if(this.reduced){
      for(const j of jobs){
        if(j.remove){j.item.el.remove();this.live.delete(j.id);}
        else this.set(j.item,j.to,1);
      }
      return;
    }
    const start=nowMs(),duration=this.duration;
    const frame=now=>{
      if(token!==this.animToken) return;
      const raw=Math.min(1,(now-start)/duration),t=ease(raw);
      for(const j of jobs){
        this.set(j.item,{
          x1:lerp(j.from.x1,j.to.x1,t),y1:lerp(j.from.y1,j.to.y1,t),
          x2:lerp(j.from.x2,j.to.x2,t),y2:lerp(j.from.y2,j.to.y2,t)
        },lerp(j.fo,j.toOp,t));
      }
      if(raw<1){requestAnimationFrame(frame);return;}
      for(const j of jobs){
        if(j.remove){j.item.el.remove();this.live.delete(j.id);}
        else this.set(j.item,j.to,1);
      }
    };
    requestAnimationFrame(frame);
  }
}

function prepareCanvas(canvas){
  const r=canvas.getBoundingClientRect();
  const dpr=Math.min(3,Math.max(1,window.devicePixelRatio||1));
  const pw=Math.max(2,Math.round(r.width*dpr)),ph=Math.max(2,Math.round(r.height*dpr));
  if(canvas.width!==pw||canvas.height!==ph){canvas.width=pw;canvas.height=ph;}
  const ctx=canvas.getContext('2d',{alpha:true});
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,r.width,r.height);
  ctx.strokeStyle='#fff';ctx.fillStyle='#fff';
  ctx.lineWidth=1.45;ctx.lineCap='round';ctx.lineJoin='round';
  ctx.imageSmoothingEnabled=true;
  if('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality='high';
  return {ctx,w:r.width,h:r.height,dpr};
}
function axes(ctx,w,h){
  ctx.save();ctx.globalAlpha=.16;ctx.lineWidth=.8;
  ctx.beginPath();ctx.moveTo(0,h/2);ctx.lineTo(w,h/2);ctx.stroke();ctx.restore();
}
function smoothPath(ctx,pts){
  if(!pts||pts.length<2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x,pts[0].y);
  if(pts.length===2){ctx.lineTo(pts[1].x,pts[1].y);return;}
  for(let i=0;i<pts.length-1;i++){
    const p0=pts[i-1]||pts[i],p1=pts[i],p2=pts[i+1],p3=pts[i+2]||p2;
    const cp1x=p1.x+(p2.x-p0.x)/6,cp1y=p1.y+(p2.y-p0.y)/6;
    const cp2x=p2.x-(p3.x-p1.x)/6,cp2y=p2.y-(p3.y-p1.y)/6;
    ctx.bezierCurveTo(cp1x,cp1y,cp2x,cp2y,p2.x,p2.y);
  }
}
class AnimatedSeries{
  constructor(limit=120,initial=0){
    this.limit=limit;this.history=[initial];this.from=initial;this.to=initial;
    this.start=nowMs();this.duration=100;
  }
  current(now=nowMs()){
    const t=ease(clamp((now-this.start)/Math.max(1,this.duration),0,1));
    return lerp(this.from,this.to,t);
  }
  push(v,duration){
    const cur=this.current();
    this.history.push(this.to);
    if(this.history.length>this.limit)this.history.shift();
    this.from=cur;this.to=v;this.start=nowMs();this.duration=Math.max(1,duration);
  }
  values(now=nowMs()){return [...this.history,this.current(now)];}
}
function drawHistory(canvas,series,scale=1,now=nowMs()){
  const {ctx,w,h}=prepareCanvas(canvas);axes(ctx,w,h);
  series.forEach((s,ai)=>{
    const arr=s instanceof AnimatedSeries?s.values(now):s;
    if(arr.length<2)return;
    const pts=arr.map((v,i)=>({x:i*(w/Math.max(1,arr.length-1)),y:h/2-v*(h*.42/scale)}));
    ctx.save();
    ctx.globalAlpha=ai===0?.96:Math.max(.18,.48-ai*.08);
    ctx.lineWidth=ai===0?1.9:1.1;
    smoothPath(ctx,pts);ctx.stroke();ctx.restore();
  });
}
function drawXYPath(canvas,pts,scale=.43,nowPoint=null){
  const {ctx,w,h}=prepareCanvas(canvas);
  ctx.save();ctx.translate(w/2,h/2);
  const s=Math.min(w,h)*scale;
  const all=pts.map(p=>({x:p[0]*s,y:-p[1]*s}));
  if(nowPoint)all.push({x:nowPoint[0]*s,y:-nowPoint[1]*s});
  if(all.length>1){ctx.globalAlpha=.9;ctx.lineWidth=1.5;smoothPath(ctx,all);ctx.stroke();}
  ctx.restore();
}
function q(v,scale=8){return clamp(Math.round(v*scale),-14,14);}
function signed(v,n=3){return (v>=0?'+':'')+v.toFixed(n);}
function canvasFor(section){
  const c=document.createElement('canvas');
  c.setAttribute('aria-hidden','true');
  section.querySelector('.visual').appendChild(c);
  return c;
}
function textPanel(section,className='term-panel'){
  const d=document.createElement('div');d.className=className;
  section.querySelector('.visual').appendChild(d);return d;
}

const defs={
  clock:{title:'Lambda Clock',formula:'TIME = \u03bbp. p d0 d1 d2 d3 d4 d5  |  each digit is a Church numeral  |  10 Hz'},
  wave:{title:'Lambda Wave',formula:'STEP = \u03bbs. s (\u03bbx.\u03bbv. <x + D(v - Dx), v - Dx>)  |  D=1/10  |  10 Hz'},
  oscilloscope:{title:'Lambda Oscilloscope',formula:'MIX = \u03bba.\u03bbb.\u03bbc. a + b + c  |  3 oscillator states  |  10 Hz'},
  lissajous:{title:'Lambda Lissajous',formula:'POINT = \u03bbt. <sin(3t), sin(4t + pi/2)>  |  10 Hz'},
  chaos:{title:'Lambda Chaos',formula:'NEXT = \u03bbx. r*x*(1-x)  |  r=3.86  |  10 Hz'},
  fourier:{title:'Lambda Fourier',formula:'SUM = \u03bbt. sin(t) + 1/2 sin(3t) + 1/3 sin(5t)  |  10 Hz'},
  logic:{title:'Lambda Logic',formula:'TRUE = \u03bba.\u03bbb.a  |  FALSE = \u03bba.\u03bbb.b  |  Church booleans  |  10 Hz'},
  numbers:{title:'Lambda Counter / Prime Stream',formula:'N = \u03bbf.\u03bbx. f^n x  |  numeral + Church boolean prime flag  |  10 Hz'},
  life:{title:'Lambda Game of Life',formula:'NEXT = \u03bbc.\u03bbn. OR (AND c (n=2)) (n=3)  |  10 Hz'},
  reducer:{title:'Interactive Beta Reducer',formula:'Leftmost-outermost beta reduction  |  enter a lambda term and watch the display normalize  |  10 Hz'},
  pendulum:{title:'Lambda Double Pendulum',formula:'STATE = \u03bbt. <theta1, theta2, omega1, omega2, endpoint, energy>  |  synchronized 10 Hz state'},
  julia:{title:'Lambda Julia Orbit',formula:'ITER = \u03bbz. z*z + c  |  rotating Julia parameters  |  10 Hz'},
  rule30:{title:'Lambda Rule 30',formula:'CELL = \u03bbl.\u03bbc.\u03bbr. l XOR (c OR r)  |  10 generations/s'},
  sorting:{title:'Lambda Sorting Machine',formula:'COMPARE = \u03bba.\u03bbb. IF (a>b) <b,a> <a,b>  |  animated bubble sort  |  10 Hz'},
  ski:{title:'SKI Combinator Machine',formula:'S x y z = x z (y z)  |  K x y = x  |  I x = x  |  10 Hz'},
  fibonacci:{title:'Lambda Fibonacci Recursion',formula:'F = Y (\u03bbf.\u03bbn. IF (n<2) n (ADD (f(n-1)) (f(n-2))))  |  10 Hz'},
  collatz:{title:'Lambda Collatz Machine',formula:'NEXT = \u03bbn. IF (EVEN n) (n/2) (3n+1)  |  10 Hz'},
  sieve:{title:'Lambda Prime Sieve',formula:'FILTER = \u03bbp.\u03bbn. NOT (DIVIDES p n)  |  animated Eratosthenes sieve  |  10 Hz'},
  randomwalk:{title:'Lambda Random Walk',formula:'STEP = \u03bbs.\u03bbb. IF b (RIGHT s) (LEFT s)  |  session-seeded xorshift bits  |  10 Hz'},
  lorenz:{title:'Lambda Lorenz Attractor',formula:'dx=sigma(y-x), dy=x(rho-z)-y, dz=xy-beta*z  |  lambda state at 10 Hz'},
  particles:{title:'Lambda Particle System',formula:'STEP = \u03bbp. <position + velocity, velocity + force(position)>  |  36 particles  |  10 Hz'},
  image:{title:'Lambda Image Function',formula:'PIXEL = \u03bbx.\u03bby.\u03bbt. sin(x+t) * cos(y-t) + sin(x+y+t)  |  10 Hz'},
  benchmark:{title:'Lambda Reduction Benchmark',formula:'BENCH = (\u03bbx.x) y repeated in bounded bursts  |  reductions/s  |  10 Hz'}
};

function makeSection(key){
  const d=defs[key];
  const section=document.createElement('section');
  section.className='demo';section.dataset.demo=key;
  section.innerHTML=`<h2>${d.title}</h2><div class="formula">${d.formula}</div><div class="controls" hidden></div><div class="visual"></div><div class="lambda-wrap"></div><div class="state"></div>`;
  return section;
}

class BaseDemo{
  constructor(section,interval){
    this.section=section;this.interval=TICK_MS;this.requestedInterval=interval;this.active=false;this.sample=0;
    this.stateEl=section.querySelector('.state');this.formulaEl=section.querySelector('.formula');
    this.lambda=new LambdaDisplay(section.querySelector('.lambda-wrap'),92);
    this.timer=null;
  }
  start(){
    this.renderInitial?.();
    this.timer=setInterval(()=>{if(this.active){this.sample++;this.step?.();}},TICK_MS);
  }
  setActive(v){this.active=v;if(v){this.lastFrame=nowMs();this.draw?.(nowMs());}}
  frame(now){if(this.active)this.draw?.(now);}
}

class ClockDemo extends BaseDemo{
  constructor(section){
    super(section,100);this.last='';
    this.readout=document.createElement('div');this.readout.className='big-readout';
    section.querySelector('.visual').appendChild(this.readout);
  }
  stamp(d){let h=d.getHours()%12||12;return String(h).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')+':'+String(d.getSeconds()).padStart(2,'0');}
  term(d){
    const h=d.getHours()%12||12;
    const ds=[Math.floor(h/10),h%10,Math.floor(d.getMinutes()/10),d.getMinutes()%10,Math.floor(d.getSeconds()/10),d.getSeconds()%10];
    return tuple(ds.map((n,i)=>church(n,'clock:d'+i)),'clock');
  }
  renderInitial(){this.step();}
  step(){
    const d=new Date(),s=this.stamp(d);this.readout.textContent=s;
    if(s===this.last)return;this.last=s;this.lambda.term(this.term(d));this.stateEl.textContent=`local device time | renderer=10 Hz | sample=${this.sample}`;
  }
  draw(){const d=new Date();this.readout.textContent=this.stamp(d);}
}

class WaveDemo extends BaseDemo{
  constructor(section){super(section,100);this.canvas=canvasFor(section);this.x=1;this.v=0;this.s=new AnimatedSeries(120,1);}
  renderInitial(){this.updateLambda();}
  step(){
    const dt=SIM_DT,nv=this.v-dt*this.x,nx=this.x+dt*nv;
    this.v=nv;this.x=nx;this.s.push(this.x,this.interval);this.updateLambda();
  }
  updateLambda(){const e=.5*(this.x*this.x+this.v*this.v);this.lambda.term(numericState([q(this.x),q(this.v),q(e,6),this.sample%15],'wave'));this.stateEl.textContent=`x=${signed(this.x)}  v=${signed(this.v)}  energy=${e.toFixed(3)}  lambda-eval=10 Hz  sample=${this.sample}`;}
  draw(now){drawHistory(this.canvas,[this.s],1.25,now);}
}

class OscilloscopeDemo extends BaseDemo{
  constructor(section){super(section,100);this.canvas=canvasFor(section);this.t=0;this.series=[0,1,2,3].map(()=>new AnimatedSeries(140,0));this.values=[0,0,0,0];}
  renderInitial(){this.step();}
  step(){
    const a=Math.sin(TAU*.45*this.t),b=.65*Math.sin(TAU*.78*this.t+.7),c=.4*Math.sin(TAU*1.12*this.t+1.4),mix=a+b+c;
    this.values=[mix,a,b,c];this.values.forEach((v,i)=>this.series[i].push(v,this.interval));
    this.lambda.term(numericState([q(a,5),q(b,5),q(c,5),q(mix,5),q(mix-a,5),this.sample%15],'scope'));
    this.stateEl.textContent=`a=${signed(a,2)}  b=${signed(b,2)}  c=${signed(c,2)}  sum=${signed(mix,2)}  sample=${this.sample}`;
    this.t+=.1;
  }
  draw(now){drawHistory(this.canvas,this.series,2.1,now);}
}

class LissajousDemo extends BaseDemo{
  constructor(section){super(section,100);this.canvas=canvasFor(section);this.t=0;this.pts=[];this.from=[0,1];this.to=[0,1];this.tweenStart=nowMs();}
  renderInitial(){this.step();}
  step(){
    const cur=this.current(nowMs()),phase=this.t;
    this.pts.push(cur);if(this.pts.length>300)this.pts.shift();
    this.from=cur;this.to=[Math.sin(3*phase),Math.sin(4*phase+Math.PI/2)];this.tweenStart=nowMs();this.t=phase+.075;
    this.lambda.term(numericState([q(this.to[0]),q(this.to[1]),q(Math.sin(phase),8),q(Math.cos(phase),8),this.sample%15],'liss'));
    this.stateEl.textContent=`x=${signed(this.to[0])}  y=${signed(this.to[1])}  t=${phase.toFixed(2)}  sample=${this.sample}`;
  }
  current(now){const a=ease(clamp((now-this.tweenStart)/this.interval,0,1));return [lerp(this.from[0],this.to[0],a),lerp(this.from[1],this.to[1],a)];}
  draw(now){drawXYPath(this.canvas,this.pts,.43,this.current(now));}
}

class ChaosDemo extends BaseDemo{
  constructor(section){super(section,100);this.canvas=canvasFor(section);this.x=.217;this.r=3.86;this.n=0;this.series=new AnimatedSeries(130,this.x);}
  renderInitial(){this.step();}
  step(){
    this.x=this.r*this.x*(1-this.x);this.n++;this.series.push(this.x,this.interval);
    const prev=this.series.history.length?this.series.history[this.series.history.length-1]:this.x;this.lambda.term(tuple([church(Math.round(this.x*24),'chaos:x'),signedChurch(q(this.x-prev,12),'chaos:dx'),church(Math.round(this.r*5),'chaos:r'),decimal2(this.n,'chaos:n')],'chaos'));
    this.stateEl.textContent=`n=${this.n}  x=${this.x.toFixed(6)}  r=${this.r}  sample=${this.sample}`;
  }
  draw(now){
    const {ctx,w,h}=prepareCanvas(this.canvas);
    const arr=this.series.values(now),pts=arr.map((v,i)=>({x:i*w/Math.max(1,arr.length-1),y:h-(v*h*.9+h*.05)}));
    ctx.save();ctx.globalAlpha=.16;ctx.beginPath();ctx.moveTo(0,h*.95);ctx.lineTo(w,h*.95);ctx.stroke();ctx.restore();
    if(pts.length>1){ctx.lineWidth=1.8;smoothPath(ctx,pts);ctx.stroke();}
  }
}

class FourierDemo extends BaseDemo{
  constructor(section){super(section,100);this.canvas=canvasFor(section);this.t=0;this.series=[0,1,2,3].map(()=>new AnimatedSeries(150,0));this.values=[0,0,0,0];}
  renderInitial(){this.step();}
  step(){
    const a=Math.sin(this.t),b=.5*Math.sin(3*this.t),c=(1/3)*Math.sin(5*this.t),sum=a+b+c;
    this.values=[sum,a,b,c];this.values.forEach((v,i)=>this.series[i].push(v,this.interval));
    this.lambda.term(numericState([q(a,6),q(b,6),q(c,6),q(sum,6),q(sum-a,6),this.sample%15],'fourier'));
    this.stateEl.textContent=`fund=${signed(a,2)}  h3=${signed(b,2)}  h5=${signed(c,2)}  sum=${signed(sum,2)}  sample=${this.sample}`;
    this.t+=.14;
  }
  draw(now){drawHistory(this.canvas,this.series,1.85,now);}
}

class LogicDemo extends BaseDemo{
  constructor(section){super(section,100);this.panel=textPanel(section);this.i=0;this.ops=['AND','OR','XOR','NOT A'];}
  renderInitial(){this.step();}
  step(){
    const op=this.ops[Math.floor(this.i/4)%this.ops.length],a=!!(this.i&1),b=!!(this.i&2);
    const r=op==='AND'?(a&&b):op==='OR'?(a||b):op==='XOR'?(a!==b):!a;
    this.i=(this.i+1)%16;this.values={op,a,b,r};
    this.panel.textContent=`${a?'T':'F'}  ${op}  ${op==='NOT A'?'':(b?'T':'F')}  ->  ${r?'T':'F'}`;
    this.lambda.term(tuple([churchBool(a,'logic:a'),churchBool(b,'logic:b'),churchBool(r,'logic:r'),church(this.ops.indexOf(op),'logic:op'),decimal2(this.sample,'logic:s')],'logic'));
    this.stateEl.textContent=`A=${a?'TRUE':'FALSE'}  B=${b?'TRUE':'FALSE'}  RESULT=${r?'TRUE':'FALSE'}  sample=${this.sample}`;
  }
}
function isPrime(n){if(n<2)return false;for(let d=2;d*d<=n;d++)if(n%d===0)return false;return true;}
class NumbersDemo extends BaseDemo{
  constructor(section){super(section,100);this.panel=textPanel(section,'number-panel');this.n=1;}
  renderInitial(){this.step();}
  step(){
    this.n++;const p=isPrime(this.n),tens=Math.floor((this.n%100)/10),ones=this.n%10;
    let divisors=0;for(let d=1;d<=Math.sqrt(this.n);d++)if(this.n%d===0)divisors+=d*d===this.n?1:2;
    this.panel.innerHTML=`<span>${this.n}</span><small>${p?'PRIME':'COMPOSITE'}</small>`;
    this.lambda.term(tuple([decimal2(this.n,'num:n'),churchBool(p,'num:p'),church(Math.min(14,divisors),'num:d'),church(tens,'num:t'),church(ones,'num:o'),decimal2(this.sample,'num:s')],'num'));
    this.stateEl.textContent=`n=${this.n}  prime=${p?'TRUE':'FALSE'}  divisors=${divisors}  sample=${this.sample}`;
  }
}
class LifeDemo extends BaseDemo{
  constructor(section){super(section,100);this.canvas=canvasFor(section);this.cols=18;this.rows=12;this.gen=0;this.fadeStart=nowMs();this.seed=entropySeed();this.seen=new Map();this.births=0;this.deaths=0;this.reseed();}
  rand(){this.seed=xorshift32(this.seed);return this.seed/4294967296;}
  reseed(){this.grid=Array.from({length:this.rows},()=>Array.from({length:this.cols},()=>this.rand()<.30));this.prevGrid=this.grid.map(r=>r.slice());this.seen.clear();this.gen=0;this.births=0;this.deaths=0;}
  renderInitial(){this.updateLambda();}
  neighbors(y,x){let n=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy)continue;const yy=(y+dy+this.rows)%this.rows,xx=(x+dx+this.cols)%this.cols;if(this.grid[yy][xx])n++;}return n;}
  hashGrid(g){return g.map(r=>r.map(v=>v?'1':'0').join('')).join('');}
  step(){
    const old=this.grid, next=old.map((row,y)=>row.map((cell,x)=>{const n=this.neighbors(y,x);return n===3||(cell&&n===2);}));
    this.births=0;this.deaths=0;for(let y=0;y<this.rows;y++)for(let x=0;x<this.cols;x++){if(!old[y][x]&&next[y][x])this.births++;if(old[y][x]&&!next[y][x])this.deaths++;}
    const hash=this.hashGrid(next),live=next.flat().filter(Boolean).length;
    if(this.seen.has(hash)||live<3){this.seed=xorshift32(this.seed^this.sample^0x9e3779b9);this.reseed();}else{this.prevGrid=old.map(r=>r.slice());this.grid=next;this.gen++;this.seen.set(hash,this.gen);if(this.seen.size>40)this.seen.delete(this.seen.keys().next().value);}
    this.fadeStart=nowMs();this.updateLambda();
  }
  updateLambda(){
    const cy=Math.floor(this.rows/2),cx=Math.floor(this.cols/2),c=this.grid[cy][cx],n=this.neighbors(cy,cx),live=this.grid.flat().filter(Boolean).length;
    this.lambda.term(tuple([churchBool(c,'life:c'),church(n,'life:n'),decimal2(live,'life:live'),decimal2(this.gen,'life:g'),church(Math.min(14,this.births),'life:b'),church(Math.min(14,this.deaths),'life:d'),decimal2(this.sample,'life:s')],'life'));
    this.stateEl.textContent=`generation=${this.gen}  live=${live}  births=${this.births}  deaths=${this.deaths}  center=${c?'TRUE':'FALSE'}  neighbors=${n}`;
  }
  draw(now){
    const {ctx,w,h}=prepareCanvas(this.canvas),cw=w/this.cols,ch=h/this.rows,fade=ease(clamp((now-this.fadeStart)/this.interval,0,1));
    ctx.save();ctx.strokeStyle='#fff';ctx.lineWidth=.7;for(let y=0;y<this.rows;y++)for(let x=0;x<this.cols;x++){const live=this.grid[y][x],was=this.prevGrid?.[y]?.[x]??false;ctx.globalAlpha=live?(was ? .95 : .25+.7*fade):.11;if(live)ctx.fillRect(x*cw+1,y*ch+1,Math.max(0,cw-2),Math.max(0,ch-2));else ctx.strokeRect(x*cw+.5,y*ch+.5,Math.max(0,cw-1),Math.max(0,ch-1));}ctx.restore();
  }
}

/* ---------- lambda parser / reducer ---------- */
function tokenizeLambda(text){
  const src=text.replace(/\\/g,'\u03bb');
  const tokens=[];let i=0;
  while(i<src.length){
    if(/\s/.test(src[i])){i++;continue;}
    const c=src[i];
    if(c==='\u03bb'||c==='.'||c==='('||c===')'){tokens.push(c);i++;continue;}
    const m=src.slice(i).match(/^[A-Za-z_][A-Za-z0-9_']*/);
    if(!m)throw new Error('Unexpected character: '+c);
    tokens.push(m[0]);i+=m[0].length;
  }
  return tokens;
}
function parseLambda(text){
  const t=tokenizeLambda(text);let p=0;
  const starts=()=>p<t.length&&(t[p]==='\u03bb'||t[p]==='('||/^[A-Za-z_]/.test(t[p]));
  function atom(){
    const tok=t[p++];
    if(tok==='\u03bb'){
      const name=t[p++];if(!name||!/^[_A-Za-z]/.test(name))throw new Error('Expected parameter');
      if(t[p++]!=='.')throw new Error('Expected "."');
      return {t:'lam',n:name,b:expr()};
    }
    if(tok==='('){const n=expr();if(t[p++]!==')')throw new Error('Expected ")"');return n;}
    if(!tok)throw new Error('Unexpected end');return {t:'var',n:tok};
  }
  function expr(){
    let n=atom();
    while(starts()&&t[p]!==')')n={t:'app',f:n,a:atom()};
    return n;
  }
  if(!t.length)throw new Error('Empty term');
  const n=expr();if(p!==t.length)throw new Error('Unexpected token: '+t[p]);return n;
}
function cloneLam(n){
  if(n.t==='var')return {t:'var',n:n.n};
  if(n.t==='lam')return {t:'lam',n:n.n,b:cloneLam(n.b)};
  return {t:'app',f:cloneLam(n.f),a:cloneLam(n.a)};
}
function freeVars(n,set=new Set()){
  if(n.t==='var')set.add(n.n);
  else if(n.t==='lam'){const inner=new Set();freeVars(n.b,inner);inner.delete(n.n);for(const v of inner)set.add(v);}
  else{freeVars(n.f,set);freeVars(n.a,set);}
  return set;
}
let freshId=0;
function renameVar(n,oldName,newName){
  if(n.t==='var')return {t:'var',n:n.n===oldName?newName:n.n};
  if(n.t==='lam')return {t:'lam',n:n.n===oldName?newName:n.n,b:renameVar(n.b,oldName,newName)};
  return {t:'app',f:renameVar(n.f,oldName,newName),a:renameVar(n.a,oldName,newName)};
}
function subst(n,name,arg){
  if(n.t==='var')return n.n===name?cloneLam(arg):cloneLam(n);
  if(n.t==='app')return {t:'app',f:subst(n.f,name,arg),a:subst(n.a,name,arg)};
  if(n.n===name)return cloneLam(n);
  const fv=freeVars(arg);
  if(fv.has(n.n)){
    const nn=n.n+'_'+(++freshId);
    const rb=renameVar(n.b,n.n,nn);
    return {t:'lam',n:nn,b:subst(rb,name,arg)};
  }
  return {t:'lam',n:n.n,b:subst(n.b,name,arg)};
}
function betaStep(n){
  if(n.t==='app'&&n.f.t==='lam')return {node:subst(n.f.b,n.f.n,n.a),changed:true};
  if(n.t==='app'){
    let r=betaStep(n.f);if(r.changed)return {node:{t:'app',f:r.node,a:cloneLam(n.a)},changed:true};
    r=betaStep(n.a);if(r.changed)return {node:{t:'app',f:cloneLam(n.f),a:r.node},changed:true};
    return {node:cloneLam(n),changed:false};
  }
  if(n.t==='lam'){const r=betaStep(n.b);return r.changed?{node:{t:'lam',n:n.n,b:r.node},changed:true}:{node:cloneLam(n),changed:false};}
  return {node:cloneLam(n),changed:false};
}
function lamString(n,ctx='root'){
  if(n.t==='var')return n.n;
  if(n.t==='lam')return '\u03bb'+n.n+'. '+lamString(n.b,'lam');
  const f=lamString(n.f,'app'),a=lamString(n.a,'arg');
  return (n.f.t==='lam'?'('+f+')':f)+' '+(n.a.t==='var'?a:'('+a+')');
}
function lamToDisplay(n,prefix='term',env=new Map(),path='r'){
  if(n.t==='var'){
    const b=env.get(n.n)||prefix+':free:'+n.n;
    return V(b,prefix+':'+path+':v:'+n.n);
  }
  if(n.t==='lam'){
    const b=prefix+':'+path+':bind:'+n.n,env2=new Map(env);env2.set(n.n,b);
    return L(b,lamToDisplay(n.b,prefix,env2,path+'b'),prefix+':'+path+':lam');
  }
  return A(lamToDisplay(n.f,prefix,env,path+'f'),lamToDisplay(n.a,prefix,env,path+'a'),prefix+':'+path+':app');
}
class BetaReducerDemo extends BaseDemo{
  constructor(section){
    super(section,100);this.panel=textPanel(section);this.running=true;this.steps=0;
    const c=section.querySelector('.controls');c.hidden=false;
    c.innerHTML='<input class="lambda-input" aria-label="Lambda term"><button type="button" data-act="run">Pause</button><button type="button" data-act="step">Step</button><button type="button" data-act="reset">Reset</button>';
    this.input=c.querySelector('input');this.input.value='(\u03bbx. x x) (\u03bby. y)';
    c.querySelector('[data-act="run"]').addEventListener('click',e=>{this.running=!this.running;e.currentTarget.textContent=this.running?'Pause':'Run';});
    c.querySelector('[data-act="step"]').addEventListener('click',()=>this.reduceOnce());
    c.querySelector('[data-act="reset"]').addEventListener('click',()=>this.reset());
    this.input.addEventListener('change',()=>this.reset());
  }
  renderInitial(){this.reset();}
  reset(){
    try{this.termAst=parseLambda(this.input.value);this.steps=0;this.running=true;this.section.querySelector('[data-act="run"]').textContent='Pause';this.renderTerm();}
    catch(e){this.stateEl.textContent=e.message;}
  }
  renderTerm(){
    const s=lamString(this.termAst);this.panel.textContent=s;this.lambda.term(lamToDisplay(this.termAst,'reducer'));
    this.stateEl.textContent=`beta steps=${this.steps}`;
  }
  reduceOnce(){
    if(!this.termAst)return;const r=betaStep(this.termAst);
    if(!r.changed){this.running=false;this.section.querySelector('[data-act="run"]').textContent='Run';this.stateEl.textContent=`normal form after ${this.steps} beta steps`;return;}
    this.termAst=r.node;this.steps++;this.renderTerm();
  }
  step(){if(this.running)this.reduceOnce();}
}

/* ---------- double pendulum ---------- */
class PendulumDemo extends BaseDemo{
  constructor(section){super(section,100);this.canvas=canvasFor(section);this.from=[1.65,1.15,0,0];this.to=[...this.from];this.trail=[];this.tweenStart=nowMs();}
  renderInitial(){this.publish();}
  accel(s){const [a,b,w1,w2]=s,g=9.81,m1=1,m2=1,l1=1,l2=1,d=a-b,den1=l1*(2*m1+m2-m2*Math.cos(2*d)),den2=l2*(2*m1+m2-m2*Math.cos(2*d));return [w1,w2,(-g*(2*m1+m2)*Math.sin(a)-m2*g*Math.sin(a-2*b)-2*Math.sin(d)*m2*(w2*w2*l2+w1*w1*l1*Math.cos(d)))/den1,(2*Math.sin(d)*(w1*w1*l1*(m1+m2)+g*(m1+m2)*Math.cos(a)+w2*w2*l2*m2*Math.cos(d)))/den2];}
  current(now){const t=ease(clamp((now-this.tweenStart)/TICK_MS,0,1));return this.from.map((v,i)=>lerp(v,this.to[i],t));}
  step(){
    const cur=this.current(nowMs()),next=[...this.to],sub=8,dt=SIM_DT/sub;for(let j=0;j<sub;j++){const k=this.accel(next);for(let i=0;i<4;i++)next[i]+=k[i]*dt;}
    this.from=cur;this.to=next;this.tweenStart=nowMs();const [a,b]=next,x1=Math.sin(a),y1=Math.cos(a),x2=x1+Math.sin(b),y2=y1+Math.cos(b);this.trail.push([x2,y2]);if(this.trail.length>220)this.trail.shift();this.publish(x2,y2);
  }
  publish(x2=null,y2=null){const [a,b,w1,w2]=this.to;if(x2===null){const x1=Math.sin(a),y1=Math.cos(a);x2=x1+Math.sin(b);y2=y1+Math.cos(b);}const motion=.5*(w1*w1+w2*w2);this.lambda.term(numericState([q(a,4),q(b,4),q(w1,2),q(w2,2),q(x2,5),q(y2,5),q(motion,2),this.sample%15],'pend'));this.stateEl.textContent=`theta1=${signed(a,2)}  theta2=${signed(b,2)}  omega1=${signed(w1,2)}  omega2=${signed(w2,2)}  sample=${this.sample}`;}
  draw(now){
    const s0=this.current(now),{ctx,w,h}=prepareCanvas(this.canvas),cx=w/2,cy=h*.22,Ls=Math.min(w,h)*.25,[a,b]=s0,x1=cx+Math.sin(a)*Ls,y1=cy+Math.cos(a)*Ls,x2=x1+Math.sin(b)*Ls,y2=y1+Math.cos(b)*Ls;
    const pts=this.trail.map(p=>({x:cx+p[0]*Ls,y:cy+p[1]*Ls}));if(pts.length>2){ctx.save();ctx.globalAlpha=.32;ctx.lineWidth=1;smoothPath(ctx,pts);ctx.stroke();ctx.restore();}ctx.lineWidth=1.6;ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();ctx.beginPath();ctx.arc(x1,y1,4,0,TAU);ctx.arc(x2,y2,5,0,TAU);ctx.fill();
  }
}

/* ---------- Julia orbit ---------- */
class JuliaDemo extends BaseDemo{
  constructor(section){super(section,100);this.canvas=canvasFor(section);this.seed=entropySeed();this.cs=[[-.8,.156],[-.745,.113],[.285,.01],[-.4,.6]];this.cIndex=this.seed%this.cs.length;this.c=this.cs[this.cIndex];this.z=[.18,.02];this.from=[...this.z];this.to=[...this.z];this.orbit=[];this.iter=0;this.tweenStart=nowMs();this.resetFlag=false;}
  rand(){this.seed=xorshift32(this.seed);return this.seed/4294967296;}
  renderInitial(){this.publish();}
  current(now){const t=ease(clamp((now-this.tweenStart)/TICK_MS,0,1));return [lerp(this.from[0],this.to[0],t),lerp(this.from[1],this.to[1],t)];}
  reseedOrbit(){this.cIndex=(this.cIndex+1+Math.floor(this.rand()*3))%this.cs.length;this.c=this.cs[this.cIndex];this.to=[(this.rand()-.5)*.7,(this.rand()-.5)*.7];this.from=[...this.to];this.iter=0;this.orbit=[];this.resetFlag=true;}
  step(){
    const cur=this.current(nowMs());this.orbit.push(cur);if(this.orbit.length>220)this.orbit.shift();const [x,y]=this.to;let nx=x*x-y*y+this.c[0],ny=2*x*y+this.c[1];this.iter++;this.resetFlag=false;
    if(nx*nx+ny*ny>16||this.iter>140){this.reseedOrbit();nx=this.to[0];ny=this.to[1];}else{this.from=cur;this.to=[nx,ny];}
    this.tweenStart=nowMs();this.publish();
  }
  publish(){const [nx,ny]=this.to,r=Math.hypot(nx,ny);this.lambda.term(numericState([q(nx,5),q(ny,5),q(this.c[0],8),q(this.c[1],8),q(r,4),this.iter%15,this.sample%15],'julia'));this.stateEl.textContent=`z=${signed(nx,3)} ${ny>=0?'+':'-'} ${Math.abs(ny).toFixed(3)}i  c=${signed(this.c[0],3)} ${this.c[1]>=0?'+':'-'} ${Math.abs(this.c[1]).toFixed(3)}i  iter=${this.iter}`;}
  draw(now){const {ctx,w,h}=prepareCanvas(this.canvas),cx=w/2,cy=h/2,s=Math.min(w,h)*.22;ctx.save();ctx.globalAlpha=.14;ctx.beginPath();ctx.moveTo(0,cy);ctx.lineTo(w,cy);ctx.moveTo(cx,0);ctx.lineTo(cx,h);ctx.stroke();ctx.restore();const pts=[...this.orbit,this.current(now)].map(p=>({x:cx+p[0]*s,y:cy-p[1]*s}));if(pts.length>1){ctx.lineWidth=1.5;smoothPath(ctx,pts);ctx.stroke();}}
}

/* ---------- Rule 30 ---------- */
class Rule30Demo extends BaseDemo{
  constructor(section){
    super(section,100);this.canvas=canvasFor(section);this.cols=61;this.maxRows=38;this.rows=[Array(this.cols).fill(false)];
    this.rows[0][Math.floor(this.cols/2)]=true;this.gen=0;this.shiftStart=nowMs();
  }
  renderInitial(){this.updateLambda();}
  nextRow(){
    const prev=this.rows[this.rows.length-1],n=Array(this.cols).fill(false);
    for(let i=0;i<this.cols;i++){
      const l=prev[(i-1+this.cols)%this.cols],c=prev[i],r=prev[(i+1)%this.cols];
      n[i]=!!(l!==(c||r));
    }
    return n;
  }
  step(){
    this.rows.push(this.nextRow());if(this.rows.length>this.maxRows)this.rows.shift();
    this.gen++;this.shiftStart=nowMs();this.updateLambda();
  }
  updateLambda(){
    const row=this.rows[this.rows.length-1],m=Math.floor(this.cols/2),l=row[m-1],c=row[m],r=row[m+1];
    const out=l!==(c||r),live=row.filter(Boolean).length;this.lambda.term(tuple([churchBool(l,'r30:l'),churchBool(c,'r30:c'),churchBool(r,'r30:r'),churchBool(out,'r30:o'),decimal2(this.gen,'r30:g'),decimal2(live,'r30:live'),decimal2(this.sample,'r30:s')],'r30'));
    this.stateEl.textContent=`generation=${this.gen}  center bits=${l?1:0}${c?1:0}${r?1:0}  out=${out?1:0}  live=${live}`;
  }
  draw(now){
    const {ctx,w,h}=prepareCanvas(this.canvas),cw=w/this.cols,ch=h/this.maxRows;
    const t=ease(clamp((now-this.shiftStart)/this.interval,0,1)),offset=(1-t)*ch;
    ctx.save();
    this.rows.forEach((row,y)=>row.forEach((v,x)=>{if(v){ctx.globalAlpha=.95;ctx.fillRect(x*cw,(y*ch)-offset,Math.ceil(cw+.2),Math.ceil(ch+.2));}}));
    ctx.restore();
  }
}

/* ---------- sorting ---------- */
class SortingDemo extends BaseDemo{
  constructor(section){
    super(section,100);this.canvas=canvasFor(section);this.seed=entropySeed();this.items=[8,3,11,5,1,9,4,7,2,10,6].map((v,i)=>({id:i,v,pos:i,from:i,target:i}));
    this.i=0;this.pass=0;this.tweenStart=nowMs();this.compared=[0,1];
  }
  rand(){this.seed=xorshift32(this.seed);return this.seed/4294967296;}
  inversions(){const a=[...this.items].sort((x,y)=>x.target-y.target).map(x=>x.v);let n=0;for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++)if(a[i]>a[j])n++;return n;}
  renderInitial(){this.updateLambda();}
  step(){
    if(this.pass>=this.items.length-1){this.resetSort();return;}
    const a=this.i,b=this.i+1;this.compared=[a,b];
    const ia=this.items.find(x=>x.target===a),ib=this.items.find(x=>x.target===b);
    for(const it of this.items){it.from=it.pos;}
    if(ia.v>ib.v){const t=ia.target;ia.target=ib.target;ib.target=t;}
    this.tweenStart=nowMs();this.i++;
    if(this.i>=this.items.length-1-this.pass){this.i=0;this.pass++;}
    this.updateLambda(ia,ib,ia.v>ib.v);
  }
  resetSort(){
    const vals=Array.from({length:this.items.length},(_,i)=>i+1);for(let i=vals.length-1;i>0;i--){const j=Math.floor(this.rand()*(i+1));[vals[i],vals[j]]=[vals[j],vals[i]];}
    this.items.forEach((it,i)=>{it.v=vals[i];it.pos=i;it.from=i;it.target=i;});
    this.i=0;this.pass=0;this.tweenStart=nowMs();this.updateLambda();
  }
  updateLambda(a=null,b=null,swap=false){
    const av=a?.v??0,bv=b?.v??0;
    const inv=this.inversions();this.lambda.term(tuple([church(av,'sort:a'),church(bv,'sort:b'),churchBool(swap,'sort:s'),church(this.pass,'sort:p'),church(this.i,'sort:i'),decimal2(inv,'sort:inv'),decimal2(this.sample,'sort:sample')],'sort'));
    this.stateEl.textContent=`pass=${this.pass}  index=${this.i}  compare=${av||'-'},${bv||'-'}  swap=${swap?'TRUE':'FALSE'}  inversions=${inv}`;
  }
  draw(now){
    const {ctx,w,h}=prepareCanvas(this.canvas),n=this.items.length,bw=w/n*.72,gap=w/n;
    const t=ease(clamp((now-this.tweenStart)/this.interval,0,1));
    for(const it of this.items){it.pos=lerp(it.from,it.target,t);}
    for(const it of this.items){
      const x=(it.pos+.5)*gap-bw/2,bh=(it.v/12)*h*.82,y=h-bh;
      ctx.globalAlpha=.92;ctx.fillRect(x,y,bw,bh);
    }
  }
}

/* ---------- SKI ---------- */
const skiSym=n=>({t:'sym',n});
const skiApp=(f,a)=>({t:'app',f,a});
function skiStr(n){
  if(n.t==='sym')return n.n;
  const f=skiStr(n.f),a=skiStr(n.a);return (n.f.t==='app'?'('+f+')':f)+' '+(n.a.t==='app'?'('+a+')':a);
}
function skiStep(n){
  if(n.t==='app'){
    if(n.f.t==='sym'&&n.f.n==='I')return {node:cloneSki(n.a),changed:true};
    if(n.f.t==='app'&&n.f.f.t==='sym'&&n.f.f.n==='K')return {node:cloneSki(n.f.a),changed:true};
    if(n.f.t==='app'&&n.f.f.t==='app'&&n.f.f.f.t==='sym'&&n.f.f.f.n==='S'){
      const x=n.f.f.a,y=n.f.a,z=n.a;
      return {node:skiApp(skiApp(cloneSki(x),cloneSki(z)),skiApp(cloneSki(y),cloneSki(z))),changed:true};
    }
    let r=skiStep(n.f);if(r.changed)return {node:skiApp(r.node,cloneSki(n.a)),changed:true};
    r=skiStep(n.a);if(r.changed)return {node:skiApp(cloneSki(n.f),r.node),changed:true};
  }
  return {node:cloneSki(n),changed:false};
}
function cloneSki(n){return n.t==='sym'?skiSym(n.n):skiApp(cloneSki(n.f),cloneSki(n.a));}
function skiLambdaDef(sym){
  if(sym==='I')return parseLambda('\u03bbx. x');
  if(sym==='K')return parseLambda('\u03bbx. \u03bby. x');
  if(sym==='S')return parseLambda('\u03bbx. \u03bby. \u03bbz. x z (y z)');
  return {t:'var',n:sym};
}
function skiToLambda(n){return n.t==='sym'?skiLambdaDef(n.n):{t:'app',f:skiToLambda(n.f),a:skiToLambda(n.a)};}
class SkiDemo extends BaseDemo{
  constructor(section){super(section,100);this.panel=textPanel(section);this.seed=entropySeed();this.reset();}
  rand(){this.seed=xorshift32(this.seed);return this.seed/4294967296;}
  reset(){const x=skiSym('x'),y=skiSym('y'),k=skiSym('K'),i=skiSym('I'),ss=skiSym('S');const choices=[()=>skiApp(skiApp(skiApp(ss,k),k),x),()=>skiApp(skiApp(k,x),y),()=>skiApp(i,skiApp(skiApp(k,x),y)),()=>skiApp(skiApp(skiApp(ss,skiApp(k,ss)),k),x)];this.term=choices[Math.floor(this.rand()*choices.length)]();this.steps=0;}
  renderInitial(){this.render();}
  step(){
    const r=skiStep(this.term);
    if(!r.changed){this.reset();}else{this.term=r.node;this.steps++;}
    this.render();
  }
  render(){
    this.panel.textContent=skiStr(this.term);
    const shown=lamToDisplay(skiToLambda(this.term),'ski:term');this.lambda.term(tuple([shown,decimal2(this.steps,'ski:steps'),decimal2(this.sample,'ski:sample')],'ski'));
    this.stateEl.textContent=`combinator reductions=${this.steps}  sample=${this.sample}`;
  }
}

/* ---------- Fibonacci tree ---------- */
function fib(n){return n<2?n:fib(n-1)+fib(n-2);}
function fibTree(n,depth=0){
  const node={n,depth,left:null,right:null,x:0,y:depth};
  if(n>1){node.left=fibTree(n-1,depth+1);node.right=fibTree(n-2,depth+1);}
  return node;
}
function layoutFib(root){
  let leaf=0;const nodes=[];
  function walk(n){
    if(n.left){walk(n.left);walk(n.right);n.x=(n.left.x+n.right.x)/2;}
    else n.x=leaf++;
    nodes.push(n);
  }walk(root);
  const maxX=Math.max(1,leaf-1),maxD=Math.max(...nodes.map(n=>n.depth),1);
  nodes.forEach(n=>{n.px=.05+.9*(n.x/maxX);n.py=.08+.84*(n.depth/maxD);});
  return nodes.sort((a,b)=>a.depth-b.depth);
}
class FibonacciDemo extends BaseDemo{
  constructor(section){super(section,100);this.canvas=canvasFor(section);this.n=6;this.tree=fibTree(this.n);this.nodes=layoutFib(this.tree);this.reveal=1;this.fadeStart=nowMs();}
  renderInitial(){this.updateLambda();}
  step(){
    this.reveal++;
    if(this.reveal>this.nodes.length+8){this.n=this.n===7?5:this.n+1;this.tree=fibTree(this.n);this.nodes=layoutFib(this.tree);this.reveal=1;}
    this.fadeStart=nowMs();this.updateLambda();
  }
  updateLambda(){
    const done=this.reveal>=this.nodes.length,res=done?fib(this.n):0;
    this.lambda.term(tuple([church(this.n,'fib:n'),decimal2(this.reveal,'fib:r'),decimal2(this.nodes.length,'fib:total'),decimal2(res,'fib:v'),churchBool(done,'fib:d'),decimal2(this.sample,'fib:s')],'fib'));
    this.stateEl.textContent=`fib(${this.n})${done?' = '+res:'  expanding recursion'}  nodes=${Math.min(this.reveal,this.nodes.length)}/${this.nodes.length}`;
  }
  draw(now){
    const {ctx,w,h}=prepareCanvas(this.canvas),shown=this.nodes.slice(0,Math.min(this.reveal,this.nodes.length)),set=new Set(shown);
    ctx.font=`${Math.max(9,Math.min(13,w/75))}px ui-monospace,monospace`;ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.save();ctx.globalAlpha=.38;ctx.lineWidth=.8;
    for(const n of shown){for(const c of [n.left,n.right])if(c&&set.has(c)){ctx.beginPath();ctx.moveTo(n.px*w,n.py*h);ctx.lineTo(c.px*w,c.py*h);ctx.stroke();}}
    ctx.restore();
    const newest=shown[shown.length-1],fade=ease(clamp((now-this.fadeStart)/this.interval,0,1));
    for(const n of shown){ctx.globalAlpha=n===newest?.25+.75*fade:.9;ctx.beginPath();ctx.arc(n.px*w,n.py*h,8,0,TAU);ctx.stroke();ctx.fillText(String(n.n),n.px*w,n.py*h);}
  }
}

/* ---------- Collatz ---------- */
class CollatzDemo extends BaseDemo{
  constructor(section){super(section,100);this.canvas=canvasFor(section);this.seed=entropySeed();this.n=this.nextSeed();this.series=new AnimatedSeries(180,Math.log2(this.n+1));this.steps=0;this.peak=this.n;}
  nextSeed(){this.seed=xorshift32(this.seed);let n=21+(this.seed%180);if(n%2===0)n++;return n;}
  renderInitial(){this.updateLambda(this.n);}
  step(){
    if(this.n===1){this.n=this.nextSeed();this.steps=0;this.peak=this.n;this.series=new AnimatedSeries(180,Math.log2(this.n+1));}
    const old=this.n,next=old%2===0?old/2:3*old+1;this.n=next;this.steps++;this.peak=Math.max(this.peak,next);this.series.push(Math.log2(next+1),this.interval);this.updateLambda(old);
  }
  updateLambda(old){
    this.lambda.term(tuple([decimal2(old,'col:n'),churchBool(old%2===0,'col:e'),decimal2(this.n,'col:next'),decimal2(this.steps,'col:steps'),decimal2(this.peak,'col:peak'),decimal2(this.sample,'col:sample')],'col'));
    this.stateEl.textContent=`n=${this.n}  step=${this.steps}  peak=${this.peak}  rule=${old%2===0?'n/2':'3n+1'}`;
  }
  draw(now){
    const arr=this.series.values(now),max=Math.max(2,...arr);const norm=arr.map(v=>(v/max)*1.7-0.85);
    drawHistory(this.canvas,[norm],1,now);
  }
}

/* ---------- Sieve ---------- */
class SieveDemo extends BaseDemo{
  constructor(section){super(section,100);this.canvas=canvasFor(section);this.max=80;this.status=Array(this.max+1).fill(0);this.p=2;this.queue=[];this.target=0;this.done=false;}
  renderInitial(){this.advancePrime();this.updateLambda();}
  advancePrime(){
    while(this.p<=this.max&&this.status[this.p]!==0)this.p++;
    if(this.p>this.max){this.done=true;return;}
    this.status[this.p]=1;this.queue=[];for(let n=this.p*this.p;n<=this.max;n+=this.p)if(this.status[n]===0)this.queue.push(n);
  }
  step(){
    if(this.done){this.status.fill(0);this.p=2;this.done=false;this.queue=[];this.advancePrime();this.updateLambda();return;}
    if(this.queue.length){this.target=this.queue.shift();this.status[this.target]=-1;}
    else{this.p++;this.advancePrime();this.target=0;}
    this.updateLambda();
  }
  updateLambda(){
    const primes=this.status.reduce((a,s)=>a+(s===1),0);this.lambda.term(tuple([decimal2(this.p,'sieve:p'),decimal2(this.target,'sieve:t'),churchBool(this.done,'sieve:d'),decimal2(primes,'sieve:pc'),decimal2(this.queue.length,'sieve:q'),decimal2(this.sample,'sieve:s')],'sieve'));
    this.stateEl.textContent=`prime=${this.done?'-':this.p}  eliminate=${this.target||'-'}  confirmed=${primes}  queue=${this.queue.length}  sample=${this.sample}`;
  }
  draw(){
    const {ctx,w,h}=prepareCanvas(this.canvas),nums=Array.from({length:this.max-1},(_,i)=>i+2),cols=10,rows=Math.ceil(nums.length/cols),cw=w/cols,ch=h/rows;
    ctx.font=`${Math.max(10,Math.min(18,cw*.28))}px ui-monospace,monospace`;ctx.textAlign='center';ctx.textBaseline='middle';
    nums.forEach((n,i)=>{
      const x=(i%cols+.5)*cw,y=(Math.floor(i/cols)+.5)*ch,s=this.status[n];
      ctx.globalAlpha=s===-1?.14:s===1?1:.55;ctx.fillText(String(n),x,y);
      if(s===1){ctx.globalAlpha=.45;ctx.beginPath();ctx.arc(x,y,Math.min(cw,ch)*.3,0,TAU);ctx.stroke();}
    });
  }
}

/* ---------- Random walk ---------- */
class RandomWalkDemo extends BaseDemo{
  constructor(section){super(section,100);this.canvas=canvasFor(section);this.seed=entropySeed();this.from=[0,0];this.to=[0,0];this.path=[[0,0]];this.tweenStart=nowMs();this.bits=[0,0];this.steps=0;}
  renderInitial(){this.publish();}
  rand(){this.seed=xorshift32(this.seed);return this.seed;}
  current(now){const t=ease(clamp((now-this.tweenStart)/TICK_MS,0,1));return [lerp(this.from[0],this.to[0],t),lerp(this.from[1],this.to[1],t)];}
  step(){
    const cur=this.current(nowMs()),r=this.rand(),axis=r&1,dir=(r>>>1)&1,dx=axis?0:(dir?1:-1),dy=axis?(dir?1:-1):0;
    this.path.push(cur);if(this.path.length>420)this.path.shift();this.from=cur;this.to=[cur[0]+dx,cur[1]+dy];this.tweenStart=nowMs();this.bits=[axis,dir];this.steps++;this.publish(r);
  }
  publish(r=this.seed){
    const [axis,dir]=this.bits,low=r&255;this.lambda.term(tuple([churchBool(!!axis,'walk:a'),churchBool(!!dir,'walk:d'),signedChurch(Math.round(this.to[0]/2),'walk:x'),signedChurch(Math.round(this.to[1]/2),'walk:y'),decimal2(this.steps,'walk:n'),church(low&7,'walk:b0'),church((low>>>3)&7,'walk:b1'),decimal2(this.sample,'walk:s')],'walk'));
    this.stateEl.textContent=`x=${this.to[0].toFixed(1)}  y=${this.to[1].toFixed(1)}  step=${this.steps}  axis=${axis?'Y':'X'}  dir=${dir?'+':'-'}  rng=${low.toString(16).padStart(2,'0')}`;
  }
  draw(now){
    const {ctx,w,h}=prepareCanvas(this.canvas),cur=this.current(now),sx=Math.min(w,h)/34,sy=sx,cx=w/2-cur[0]*sx,cy=h/2+cur[1]*sy;
    const pts=[...this.path,cur].map(p=>({x:cx+p[0]*sx,y:cy-p[1]*sy}));if(pts.length>1){ctx.globalAlpha=.9;ctx.lineWidth=1.4;smoothPath(ctx,pts);ctx.stroke();}const p=pts[pts.length-1];ctx.beginPath();ctx.arc(p.x,p.y,3,0,TAU);ctx.fill();
  }
}

/* ---------- Lorenz ---------- */
class LorenzDemo extends BaseDemo{
  constructor(section){super(section,100);this.canvas=canvasFor(section);this.from=[.1,0,0];this.to=[...this.from];this.trail=[];this.tweenStart=nowMs();}
  renderInitial(){this.publish();}
  deriv([x,y,z]){return [10*(y-x),x*(28-z)-y,x*y-(8/3)*z];}
  current(now){const t=ease(clamp((now-this.tweenStart)/TICK_MS,0,1));return this.from.map((v,i)=>lerp(v,this.to[i],t));}
  step(){
    const cur=this.current(nowMs()),next=[...this.to],sub=4,dt=.012/sub;for(let j=0;j<sub;j++){const d=this.deriv(next);for(let i=0;i<3;i++)next[i]+=d[i]*dt;}
    this.from=cur;this.to=next;this.tweenStart=nowMs();this.trail.push([next[0],next[2]]);if(this.trail.length>760)this.trail.shift();this.publish();
  }
  publish(){const [x,y,z]=this.to,[dx,dy,dz]=this.deriv(this.to);this.lambda.term(numericState([q(x,.35),q(y,.35),q(z-25,.35),q(dx,.035),q(dy,.025),q(dz,.025),this.sample%15],'lorenz'));this.stateEl.textContent=`x=${signed(x,2)}  y=${signed(y,2)}  z=${signed(z,2)}  dx=${signed(dx,1)}  dy=${signed(dy,1)}  dz=${signed(dz,1)}  sample=${this.sample}`;}
  draw(now){const cur=this.current(now),{ctx,w,h}=prepareCanvas(this.canvas),pts=this.trail.map(p=>({x:w/2+p[0]*(w/55),y:h*.78-(p[1]-20)*(h/55)}));pts.push({x:w/2+cur[0]*(w/55),y:h*.78-(cur[2]-20)*(h/55)});if(pts.length>1){ctx.globalAlpha=.82;ctx.lineWidth=1.15;smoothPath(ctx,pts);ctx.stroke();}}
}

/* ---------- Particle system ---------- */
class ParticlesDemo extends BaseDemo{
  constructor(section){super(section,100);this.canvas=canvasFor(section);this.seed=entropySeed();this.ps=Array.from({length:36},(_,i)=>{this.seed=xorshift32(this.seed);const a=(i/36*TAU)+((this.seed&255)/255-.5)*.12;this.seed=xorshift32(this.seed);const r=.18+.72*((this.seed&65535)/65535);return{x:Math.cos(a)*r,y:Math.sin(a)*r,vx:-Math.sin(a)*(.12+.12*r),vy:Math.cos(a)*(.12+.12*r)};});this.fromPos=this.ps.map(p=>[p.x,p.y]);this.toPos=this.fromPos.map(p=>[...p]);this.tweenStart=nowMs();}
  renderInitial(){this.publish();}
  currentPositions(now){const t=ease(clamp((now-this.tweenStart)/TICK_MS,0,1));return this.fromPos.map((p,i)=>[lerp(p[0],this.toPos[i][0],t),lerp(p[1],this.toPos[i][1],t)]);}
  step(){
    const cur=this.currentPositions(nowMs()),sub=4,dt=SIM_DT/sub;for(let j=0;j<sub;j++)for(const p of this.ps){const r2=p.x*p.x+p.y*p.y+.05,inv=1/Math.sqrt(r2),ax=-p.x*inv*.55-p.y*.12,ay=-p.y*inv*.55+p.x*.12;p.vx=(p.vx+ax*dt)*.999;p.vy=(p.vy+ay*dt)*.999;p.x+=p.vx*dt;p.y+=p.vy*dt;if(Math.abs(p.x)>1.3||Math.abs(p.y)>1.3){p.x*=.72;p.y*=.72;p.vx*=.9;p.vy*=.9;}}
    this.fromPos=cur;this.toPos=this.ps.map(p=>[p.x,p.y]);this.tweenStart=nowMs();this.publish();
  }
  publish(){const cx=this.ps.reduce((a,p)=>a+p.x,0)/this.ps.length,cy=this.ps.reduce((a,p)=>a+p.y,0)/this.ps.length,e=this.ps.reduce((a,p)=>a+p.vx*p.vx+p.vy*p.vy,0)/this.ps.length,spread=this.ps.reduce((a,p)=>a+Math.hypot(p.x-cx,p.y-cy),0)/this.ps.length,L=this.ps.reduce((a,p)=>a+p.x*p.vy-p.y*p.vx,0)/this.ps.length;this.lambda.term(numericState([q(cx,10),q(cy,10),q(e,30),q(spread,8),q(L,16),this.ps.length%15,this.sample%15],'particles'));this.stateEl.textContent=`center=(${signed(cx,3)}, ${signed(cy,3)})  energy=${e.toFixed(4)}  spread=${spread.toFixed(3)}  angular=${signed(L,3)}  sample=${this.sample}`;}
  draw(now){const pos=this.currentPositions(now),{ctx,w,h}=prepareCanvas(this.canvas),s=Math.min(w,h)*.42,cx=w/2,cy=h/2;ctx.save();ctx.globalAlpha=.12;ctx.lineWidth=.7;for(let i=0;i<pos.length;i++){const p=pos[i],q=pos[(i+7)%pos.length];ctx.beginPath();ctx.moveTo(cx+p[0]*s,cy+p[1]*s);ctx.lineTo(cx+q[0]*s,cy+q[1]*s);ctx.stroke();}ctx.restore();for(const p of pos){ctx.globalAlpha=.9;ctx.beginPath();ctx.arc(cx+p[0]*s,cy+p[1]*s,2.1,0,TAU);ctx.fill();}}
}

/* ---------- Image function ---------- */
class ImageDemo extends BaseDemo{
  constructor(section){super(section,100);this.canvas=canvasFor(section);this.fromT=0;this.toT=0;this.tweenStart=nowMs();this.off=document.createElement('canvas');this.off.width=180;this.off.height=110;this.offctx=this.off.getContext('2d');}
  renderInitial(){this.publish();}
  currentT(now){return lerp(this.fromT,this.toT,ease(clamp((now-this.tweenStart)/TICK_MS,0,1)));}
  field(x,y,t){return Math.sin(x+t)*Math.cos(y-t)+.36*Math.sin(x+y+t*.7);}
  step(){this.fromT=this.currentT(nowMs());this.toT+=.10;this.tweenStart=nowMs();this.publish();}
  publish(){const t=this.toT,c=this.field(0,0,t),a=this.field(-2,-1,t),b=this.field(2,1,t);this.lambda.term(numericState([q(Math.sin(t),8),q(Math.cos(t),8),q(c,6),q(a,5),q(b,5),Math.round(t*10)%15,this.sample%15],'image'));this.stateEl.textContent=`t=${t.toFixed(2)}  center=${signed(c,3)}  edgeA=${signed(a,3)}  edgeB=${signed(b,3)}  180x110  sample=${this.sample}`;}
  draw(now){const t=this.currentT(now),ow=this.off.width,oh=this.off.height,img=this.offctx.createImageData(ow,oh);for(let y=0;y<oh;y++)for(let x=0;x<ow;x++){const nx=(x/ow-.5)*8,ny=(y/oh-.5)*5,v=.5+.5*this.field(nx,ny,t),g=clamp(Math.round((v*.72+.18)*255),0,255),i=(y*ow+x)*4;img.data[i]=g;img.data[i+1]=g;img.data[i+2]=g;img.data[i+3]=255;}this.offctx.putImageData(img,0,0);const {ctx,w,h}=prepareCanvas(this.canvas);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(this.off,0,0,w,h);}
}

/* ---------- Benchmark ---------- */
class BenchmarkDemo extends BaseDemo{
  constructor(section){super(section,100);this.canvas=canvasFor(section);this.rate=0;this.series=new AnimatedSeries(120,0);}
  renderInitial(){this.step();}
  step(){
    const start=nowMs();let ops=0;
    const term=parseLambda('(\u03bbx. x) y');
    while(nowMs()-start<6){const r=betaStep(term);if(r.changed)ops++;}
    const elapsed=nowMs()-start;this.rate=ops/(elapsed/1000);this.series.push(this.rate,this.interval);
    const bucket=clamp(Math.round(Math.log10(Math.max(10,this.rate))*3),0,14);
    this.lambda.term(tuple([church(bucket,'bench:b'),church(Math.round(elapsed)%12,'bench:t'),decimal2(Math.round(this.rate/1000),'bench:k'),decimal2(this.sample,'bench:s')],'bench'));
    this.stateEl.textContent=`${Math.round(this.rate).toLocaleString()} beta reductions/s  |  ${elapsed.toFixed(1)} ms bounded sample  |  update=10 Hz`;
  }
  draw(now){
    const arr=this.series.values(now),max=Math.max(1,...arr),norm=arr.map(v=>(v/max)*1.6-.8);
    drawHistory(this.canvas,[norm],1,now);
  }
}

const classes={
  clock:ClockDemo,wave:WaveDemo,oscilloscope:OscilloscopeDemo,lissajous:LissajousDemo,chaos:ChaosDemo,fourier:FourierDemo,
  logic:LogicDemo,numbers:NumbersDemo,life:LifeDemo,reducer:BetaReducerDemo,pendulum:PendulumDemo,julia:JuliaDemo,rule30:Rule30Demo,
  sorting:SortingDemo,ski:SkiDemo,fibonacci:FibonacciDemo,collatz:CollatzDemo,sieve:SieveDemo,randomwalk:RandomWalkDemo,lorenz:LorenzDemo,
  particles:ParticlesDemo,image:ImageDemo,benchmark:BenchmarkDemo
};
const order=[
  'clock','wave','oscilloscope','lissajous','chaos','fourier','logic','numbers','life',
  'reducer','pendulum','julia','rule30','sorting','ski','fibonacci','collatz','sieve','randomwalk','lorenz','particles','image','benchmark'
];

const lab=document.getElementById('lab');if(!lab)return;
const only=lab.dataset.only,keys=only?[only]:order;
for(const key of keys)if(defs[key])lab.appendChild(makeSection(key));
const demos=[];
for(const section of lab.querySelectorAll('.demo')){
  const key=section.dataset.demo,Cls=classes[key];if(!Cls)continue;
  const demo=new Cls(section);demos.push(demo);demo.start();
}
if('IntersectionObserver' in window){
  const io=new IntersectionObserver(entries=>{
    for(const e of entries){
      const demo=demos.find(d=>d.section===e.target);
      if(demo)demo.setActive(e.isIntersecting);
    }
  },{rootMargin:'22% 0px 22% 0px',threshold:.01});
  demos.forEach(d=>io.observe(d.section));
}else demos.forEach(d=>d.setActive(true));

let raf=0;
function animate(now){
  for(const d of demos)if(d.active)d.frame(now);
  raf=requestAnimationFrame(animate);
}
raf=requestAnimationFrame(animate);

addEventListener('resize',()=>{for(const d of demos)if(d.active)d.draw?.(nowMs());},{passive:true});
document.addEventListener('visibilitychange',()=>{if(document.hidden){for(const d of demos)d.lastFrame=nowMs();}});
})();
