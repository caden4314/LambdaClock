(() => {
'use strict';

const NS='http://www.w3.org/2000/svg';
const TAU=Math.PI*2;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const ease=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
const nowMs=()=>performance.now();

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
  clock:{title:'Lambda Clock',formula:'TIME = \u03bbp. p d0 d1 d2 d3 d4 d5  |  each digit is a Church numeral'},
  wave:{title:'Lambda Wave',formula:'STEP = \u03bbs. s (\u03bbx.\u03bbv. <x + D(v - Dx), v - Dx>)  |  D=1/5  |  5 Hz'},
  oscilloscope:{title:'Lambda Oscilloscope',formula:'MIX = \u03bba.\u03bbb.\u03bbc. a + b + c  |  3 oscillator states  |  10 Hz'},
  lissajous:{title:'Lambda Lissajous',formula:'POINT = \u03bbt. <sin(3t), sin(4t + pi/2)>  |  10 Hz'},
  chaos:{title:'Lambda Chaos',formula:'NEXT = \u03bbx. r*x*(1-x)  |  r=3.86  |  5 Hz'},
  fourier:{title:'Lambda Fourier',formula:'SUM = \u03bbt. sin(t) + 1/2 sin(3t) + 1/3 sin(5t)  |  10 Hz'},
  logic:{title:'Lambda Logic',formula:'TRUE = \u03bba.\u03bbb.a  |  FALSE = \u03bba.\u03bbb.b  |  Church booleans'},
  numbers:{title:'Lambda Counter / Prime Stream',formula:'N = \u03bbf.\u03bbx. f^n x  |  numeral + Church boolean prime flag'},
  life:{title:'Lambda Game of Life',formula:'NEXT = \u03bbc.\u03bbn. OR (AND c (n=2)) (n=3)  |  4 Hz'},
  reducer:{title:'Interactive Beta Reducer',formula:'Leftmost-outermost beta reduction  |  enter a lambda term and watch the display normalize'},
  pendulum:{title:'Lambda Double Pendulum',formula:'STATE = \u03bbt. <theta1, theta2, omega1, omega2>  |  physics at display refresh, lambda state at 10 Hz'},
  julia:{title:'Lambda Julia Orbit',formula:'ITER = \u03bbz. z*z + c  |  c=-0.8+0.156i  |  10 Hz'},
  rule30:{title:'Lambda Rule 30',formula:'CELL = \u03bbl.\u03bbc.\u03bbr. l XOR (c OR r)  |  8 generations/s'},
  sorting:{title:'Lambda Sorting Machine',formula:'COMPARE = \u03bba.\u03bbb. IF (a>b) <b,a> <a,b>  |  animated bubble sort'},
  ski:{title:'SKI Combinator Machine',formula:'S x y z = x z (y z)  |  K x y = x  |  I x = x'},
  fibonacci:{title:'Lambda Fibonacci Recursion',formula:'F = Y (\u03bbf.\u03bbn. IF (n<2) n (ADD (f(n-1)) (f(n-2))))'},
  collatz:{title:'Lambda Collatz Machine',formula:'NEXT = \u03bbn. IF (EVEN n) (n/2) (3n+1)  |  5 Hz'},
  sieve:{title:'Lambda Prime Sieve',formula:'FILTER = \u03bbp.\u03bbn. NOT (DIVIDES p n)  |  animated Eratosthenes sieve'},
  randomwalk:{title:'Lambda Random Walk',formula:'STEP = \u03bbs.\u03bbb. IF b (RIGHT s) (LEFT s)  |  deterministic lambda-linked bits'},
  lorenz:{title:'Lambda Lorenz Attractor',formula:'dx=sigma(y-x), dy=x(rho-z)-y, dz=xy-beta*z  |  lambda state at 10 Hz'},
  particles:{title:'Lambda Particle System',formula:'STEP = \u03bbp. <position + velocity, velocity + force(position)>  |  36 particles'},
  image:{title:'Lambda Image Function',formula:'PIXEL = \u03bbx.\u03bby.\u03bbt. sin(x+t) * cos(y-t) + sin(x+y+t)'},
  benchmark:{title:'Lambda Reduction Benchmark',formula:'BENCH = (\u03bbx.x) y repeated in bounded bursts  |  reductions/s'}
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
    this.section=section;this.interval=interval;this.active=false;
    this.stateEl=section.querySelector('.state');this.formulaEl=section.querySelector('.formula');
    this.lambda=new LambdaDisplay(section.querySelector('.lambda-wrap'),Math.min(950,Math.max(140,interval*.94)));
    this.timer=null;
  }
  start(){
    this.renderInitial?.();
    this.timer=setInterval(()=>{if(this.active)this.step?.();},this.interval);
  }
  setActive(v){this.active=v;if(v){this.lastFrame=nowMs();this.draw?.(nowMs());}}
  frame(now){if(this.active)this.draw?.(now);}
}

class ClockDemo extends BaseDemo{
  constructor(section){
    super(section,1000);this.last='';
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
    if(s===this.last)return;this.last=s;this.lambda.term(this.term(d));this.stateEl.textContent='local device time';
  }
  draw(){const d=new Date();this.readout.textContent=this.stamp(d);}
}

class WaveDemo extends BaseDemo{
  constructor(section){super(section,200);this.canvas=canvasFor(section);this.x=1;this.v=0;this.s=new AnimatedSeries(100,1);}
  renderInitial(){this.updateLambda();}
  step(){
    const dt=.2,nv=this.v-dt*this.x,nx=this.x+dt*nv;
    this.v=nv;this.x=nx;this.s.push(this.x,this.interval);this.updateLambda();
  }
  updateLambda(){this.lambda.term(numericState([q(this.x),q(this.v)],'wave'));this.stateEl.textContent=`x=${signed(this.x)}  v=${signed(this.v)}  lambda-eval=5 Hz`;}
  draw(now){drawHistory(this.canvas,[this.s],1.25,now);}
}

class OscilloscopeDemo extends BaseDemo{
  constructor(section){super(section,100);this.canvas=canvasFor(section);this.t=0;this.series=[0,1,2,3].map(()=>new AnimatedSeries(140,0));this.values=[0,0,0,0];}
  renderInitial(){this.step();}
  step(){
    const a=Math.sin(TAU*.45*this.t),b=.65*Math.sin(TAU*.78*this.t+.7),c=.4*Math.sin(TAU*1.12*this.t+1.4),mix=a+b+c;
    this.values=[mix,a,b,c];this.values.forEach((v,i)=>this.series[i].push(v,this.interval));
    this.lambda.term(numericState([q(a,5),q(b,5),q(c,5),q(mix,5)],'scope'));
    this.stateEl.textContent=`a=${signed(a,2)}  b=${signed(b,2)}  c=${signed(c,2)}  sum=${signed(mix,2)}`;
    this.t+=.1;
  }
  draw(now){drawHistory(this.canvas,this.series,2.1,now);}
}

class LissajousDemo extends BaseDemo{
  constructor(section){super(section,100);this.canvas=canvasFor(section);this.t=0;this.pts=[];this.from=[0,1];this.to=[0,1];this.tweenStart=nowMs();}
  renderInitial(){this.step();}
  step(){
    const cur=this.current(nowMs());
    this.pts.push(cur);if(this.pts.length>300)this.pts.shift();
    this.from=cur;this.to=[Math.sin(3*this.t),Math.sin(4*this.t+Math.PI/2)];this.tweenStart=nowMs();this.t+=.075;
    this.lambda.term(numericState([q(this.to[0]),q(this.to[1])],'liss'));
    this.stateEl.textContent=`x=${signed(this.to[0])}  y=${signed(this.to[1])}`;
  }
  current(now){const a=ease(clamp((now-this.tweenStart)/this.interval,0,1));return [lerp(this.from[0],this.to[0],a),lerp(this.from[1],this.to[1],a)];}
  draw(now){drawXYPath(this.canvas,this.pts,.43,this.current(now));}
}

class ChaosDemo extends BaseDemo{
  constructor(section){super(section,200);this.canvas=canvasFor(section);this.x=.217;this.r=3.86;this.n=0;this.series=new AnimatedSeries(130,this.x);}
  renderInitial(){this.step();}
  step(){
    this.x=this.r*this.x*(1-this.x);this.n++;this.series.push(this.x,this.interval);
    this.lambda.term(tuple([church(Math.round(this.x*24),'chaos:x'),church(this.n%12,'chaos:n')],'chaos'));
    this.stateEl.textContent=`n=${this.n}  x=${this.x.toFixed(6)}  r=${this.r}`;
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
    this.lambda.term(numericState([q(a,6),q(b,6),q(c,6),q(sum,6)],'fourier'));
    this.stateEl.textContent=`fund=${signed(a,2)}  h3=${signed(b,2)}  h5=${signed(c,2)}  sum=${signed(sum,2)}`;
    this.t+=.14;
  }
  draw(now){drawHistory(this.canvas,this.series,1.85,now);}
}

class LogicDemo extends BaseDemo{
  constructor(section){super(section,500);this.panel=textPanel(section);this.i=0;this.ops=['AND','OR','XOR','NOT A'];}
  renderInitial(){this.step();}
  step(){
    const op=this.ops[Math.floor(this.i/4)%this.ops.length],a=!!(this.i&1),b=!!(this.i&2);
    const r=op==='AND'?(a&&b):op==='OR'?(a||b):op==='XOR'?(a!==b):!a;
    this.i=(this.i+1)%16;this.values={op,a,b,r};
    this.panel.textContent=`${a?'T':'F'}  ${op}  ${op==='NOT A'?'':(b?'T':'F')}  ->  ${r?'T':'F'}`;
    this.lambda.term(tuple([churchBool(a,'logic:a'),churchBool(b,'logic:b'),churchBool(r,'logic:r'),church(this.ops.indexOf(op),'logic:op')],'logic'));
    this.stateEl.textContent=`A=${a?'TRUE':'FALSE'}  B=${b?'TRUE':'FALSE'}  RESULT=${r?'TRUE':'FALSE'}`;
  }
}
function isPrime(n){if(n<2)return false;for(let d=2;d*d<=n;d++)if(n%d===0)return false;return true;}
class NumbersDemo extends BaseDemo{
  constructor(section){super(section,500);this.panel=textPanel(section,'number-panel');this.n=1;}
  renderInitial(){this.step();}
  step(){
    this.n++;if(this.n>29)this.n=2;const p=isPrime(this.n);
    this.panel.innerHTML=`<span>${this.n}</span><small>${p?'PRIME':'COMPOSITE'}</small>`;
    this.lambda.term(tuple([church(this.n,'num:n'),churchBool(p,'num:p')],'num'));
    this.stateEl.textContent=`Church(${this.n}) + Church(${p?'TRUE':'FALSE'})`;
  }
}
class LifeDemo extends BaseDemo{
  constructor(section){super(section,250);this.canvas=canvasFor(section);this.cols=18;this.rows=12;this.gen=0;this.fadeStart=nowMs();this.grid=Array.from({length:this.rows},()=>Array.from({length:this.cols},()=>Math.random()<.28));}
  renderInitial(){this.updateLambda();}
  neighbors(y,x){
    let n=0;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      if(!dx&&!dy)continue;const yy=(y+dy+this.rows)%this.rows,xx=(x+dx+this.cols)%this.cols;
      if(this.grid[yy][xx])n++;
    }
    return n;
  }
  step(){
    this.grid=this.grid.map((row,y)=>row.map((cell,x)=>{const n=this.neighbors(y,x);return n===3||(cell&&n===2);}));
    this.gen++;this.fadeStart=nowMs();this.updateLambda();
  }
  updateLambda(){
    const cy=Math.floor(this.rows/2),cx=Math.floor(this.cols/2),c=this.grid[cy][cx],n=this.neighbors(cy,cx),live=this.grid.flat().filter(Boolean).length;
    this.lambda.term(tuple([churchBool(c,'life:c'),church(n,'life:n'),church(live%17,'life:live'),church(this.gen%12,'life:g')],'life'));
    this.stateEl.textContent=`generation=${this.gen}  live=${live}  center=${c?'TRUE':'FALSE'}  neighbors=${n}`;
  }
  draw(now){
    const {ctx,w,h}=prepareCanvas(this.canvas),cw=w/this.cols,ch=h/this.rows,fade=ease(clamp((now-this.fadeStart)/this.interval,0,1));
    ctx.save();ctx.strokeStyle='#fff';ctx.lineWidth=.7;
    for(let y=0;y<this.rows;y++)for(let x=0;x<this.cols;x++){
      const live=this.grid[y][x];ctx.globalAlpha=live?(.35+.65*fade):.12;
      if(live)ctx.fillRect(x*cw+1,y*ch+1,Math.max(0,cw-2),Math.max(0,ch-2));
      else ctx.strokeRect(x*cw+.5,y*ch+.5,Math.max(0,cw-1),Math.max(0,ch-1));
    }ctx.restore();
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
    super(section,500);this.panel=textPanel(section);this.running=true;this.steps=0;
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
  constructor(section){
    super(section,100);this.canvas=canvasFor(section);
    this.s=[1.65,1.15,0,0];this.trail=[];this.lastFrame=nowMs();
  }
  renderInitial(){this.step();}
  accel(s){
    const [a,b,w1,w2]=s,g=9.81,m1=1,m2=1,l1=1,l2=1,d=a-b;
    const den1=l1*(2*m1+m2-m2*Math.cos(2*d));
    const den2=l2*(2*m1+m2-m2*Math.cos(2*d));
    const aa=(-g*(2*m1+m2)*Math.sin(a)-m2*g*Math.sin(a-2*b)-2*Math.sin(d)*m2*(w2*w2*l2+w1*w1*l1*Math.cos(d)))/den1;
    const ab=(2*Math.sin(d)*(w1*w1*l1*(m1+m2)+g*(m1+m2)*Math.cos(a)+w2*w2*l2*m2*Math.cos(d)))/den2;
    return [w1,w2,aa,ab];
  }
  integrate(dt){
    const k=this.accel(this.s);for(let i=0;i<4;i++)this.s[i]+=k[i]*dt;
  }
  step(){
    const [a,b,w1,w2]=this.s;
    this.lambda.term(numericState([q(a,4),q(b,4),q(w1,2),q(w2,2)],'pend'));
    this.stateEl.textContent=`theta1=${signed(a,2)}  theta2=${signed(b,2)}  omega1=${signed(w1,2)}  omega2=${signed(w2,2)}`;
  }
  draw(now){
    let dt=clamp((now-this.lastFrame)/1000,0,.03);this.lastFrame=now;
    const sub=3;for(let i=0;i<sub;i++)this.integrate(dt/sub);
    const {ctx,w,h}=prepareCanvas(this.canvas),cx=w/2,cy=h*.22,Ls=Math.min(w,h)*.25;
    const a=this.s[0],b=this.s[1],x1=cx+Math.sin(a)*Ls,y1=cy+Math.cos(a)*Ls,x2=x1+Math.sin(b)*Ls,y2=y1+Math.cos(b)*Ls;
    this.trail.push([x2,y2]);if(this.trail.length>180)this.trail.shift();
    const pts=this.trail.map(p=>({x:p[0],y:p[1]}));
    if(pts.length>2){ctx.save();ctx.globalAlpha=.32;ctx.lineWidth=1;smoothPath(ctx,pts);ctx.stroke();ctx.restore();}
    ctx.lineWidth=1.6;ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
    ctx.beginPath();ctx.arc(x1,y1,4,0,TAU);ctx.arc(x2,y2,5,0,TAU);ctx.fill();
  }
}

/* ---------- Julia orbit ---------- */
class JuliaDemo extends BaseDemo{
  constructor(section){super(section,100);this.canvas=canvasFor(section);this.c=[-.8,.156];this.z=[.18,.02];this.from=[...this.z];this.to=[...this.z];this.orbit=[];this.iter=0;this.tweenStart=nowMs();}
  renderInitial(){this.step();}
  current(now){const t=ease(clamp((now-this.tweenStart)/this.interval,0,1));return [lerp(this.from[0],this.to[0],t),lerp(this.from[1],this.to[1],t)];}
  step(){
    const cur=this.current(nowMs());this.orbit.push(cur);if(this.orbit.length>180)this.orbit.shift();
    const [x,y]=this.to;let nx=x*x-y*y+this.c[0],ny=2*x*y+this.c[1];this.iter++;
    if(nx*nx+ny*ny>16||this.iter>90){nx=.18;ny=.02;this.iter=0;this.orbit=[];}
    this.from=cur;this.to=[nx,ny];this.tweenStart=nowMs();
    this.lambda.term(numericState([q(nx,5),q(ny,5),this.iter%12],'julia'));
    this.stateEl.textContent=`z=${signed(nx,3)} ${ny>=0?'+':'-'} ${Math.abs(ny).toFixed(3)}i  iter=${this.iter}`;
  }
  draw(now){
    const {ctx,w,h}=prepareCanvas(this.canvas),cx=w/2,cy=h/2,s=Math.min(w,h)*.22;
    ctx.save();ctx.globalAlpha=.14;ctx.beginPath();ctx.moveTo(0,cy);ctx.lineTo(w,cy);ctx.moveTo(cx,0);ctx.lineTo(cx,h);ctx.stroke();ctx.restore();
    const pts=[...this.orbit,this.current(now)].map(p=>({x:cx+p[0]*s,y:cy-p[1]*s}));
    if(pts.length>1){ctx.lineWidth=1.5;smoothPath(ctx,pts);ctx.stroke();}
  }
}

/* ---------- Rule 30 ---------- */
class Rule30Demo extends BaseDemo{
  constructor(section){
    super(section,125);this.canvas=canvasFor(section);this.cols=61;this.maxRows=38;this.rows=[Array(this.cols).fill(false)];
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
    this.lambda.term(tuple([churchBool(l,'r30:l'),churchBool(c,'r30:c'),churchBool(r,'r30:r'),churchBool(l!==(c||r),'r30:o')],'r30'));
    this.stateEl.textContent=`generation=${this.gen}  center bits=${l?1:0}${c?1:0}${r?1:0}`;
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
    super(section,250);this.canvas=canvasFor(section);this.items=[8,3,11,5,1,9,4,7,2,10,6].map((v,i)=>({id:i,v,pos:i,from:i,target:i}));
    this.i=0;this.pass=0;this.tweenStart=nowMs();this.compared=[0,1];
  }
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
    const vals=[8,3,11,5,1,9,4,7,2,10,6];
    this.items.forEach((it,i)=>{it.v=vals[i];it.pos=i;it.from=i;it.target=i;});
    this.i=0;this.pass=0;this.tweenStart=nowMs();this.updateLambda();
  }
  updateLambda(a=null,b=null,swap=false){
    const av=a?.v??0,bv=b?.v??0;
    this.lambda.term(tuple([church(av,'sort:a'),church(bv,'sort:b'),churchBool(swap,'sort:s'),church(this.pass,'sort:p')],'sort'));
    this.stateEl.textContent=`pass=${this.pass}  compare=${av||'-'},${bv||'-'}  swap=${swap?'TRUE':'FALSE'}`;
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
  constructor(section){super(section,800);this.panel=textPanel(section);this.reset();}
  reset(){this.term=skiApp(skiApp(skiApp(skiSym('S'),skiSym('K')),skiSym('K')),skiSym('x'));this.steps=0;}
  renderInitial(){this.render();}
  step(){
    const r=skiStep(this.term);
    if(!r.changed){this.reset();}else{this.term=r.node;this.steps++;}
    this.render();
  }
  render(){
    this.panel.textContent=skiStr(this.term);
    this.lambda.term(lamToDisplay(skiToLambda(this.term),'ski'));
    this.stateEl.textContent=`combinator reductions=${this.steps}`;
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
  constructor(section){super(section,260);this.canvas=canvasFor(section);this.n=6;this.tree=fibTree(this.n);this.nodes=layoutFib(this.tree);this.reveal=1;this.fadeStart=nowMs();}
  renderInitial(){this.updateLambda();}
  step(){
    this.reveal++;
    if(this.reveal>this.nodes.length+8){this.n=this.n===7?5:this.n+1;this.tree=fibTree(this.n);this.nodes=layoutFib(this.tree);this.reveal=1;}
    this.fadeStart=nowMs();this.updateLambda();
  }
  updateLambda(){
    const done=this.reveal>=this.nodes.length,res=done?fib(this.n):0;
    this.lambda.term(tuple([church(this.n,'fib:n'),church(this.reveal%18,'fib:r'),church(res%36,'fib:v'),churchBool(done,'fib:d')],'fib'));
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
  constructor(section){super(section,200);this.canvas=canvasFor(section);this.seeds=[27,31,41,47];this.seedIndex=0;this.n=this.seeds[0];this.series=new AnimatedSeries(150,Math.log2(this.n+1));this.steps=0;}
  renderInitial(){this.updateLambda(this.n);}
  step(){
    if(this.n===1){this.seedIndex=(this.seedIndex+1)%this.seeds.length;this.n=this.seeds[this.seedIndex];this.steps=0;this.series=new AnimatedSeries(150,Math.log2(this.n+1));}
    const old=this.n,next=old%2===0?old/2:3*old+1;this.n=next;this.steps++;this.series.push(Math.log2(next+1),this.interval);this.updateLambda(old);
  }
  updateLambda(old){
    this.lambda.term(tuple([church(old%36,'col:n'),churchBool(old%2===0,'col:e'),church(this.n%36,'col:next')],'col'));
    this.stateEl.textContent=`n=${this.n}  step=${this.steps}  rule=${old%2===0?'n/2':'3n+1'}`;
  }
  draw(now){
    const arr=this.series.values(now),max=Math.max(2,...arr);const norm=arr.map(v=>(v/max)*1.7-0.85);
    drawHistory(this.canvas,[norm],1,now);
  }
}

/* ---------- Sieve ---------- */
class SieveDemo extends BaseDemo{
  constructor(section){super(section,220);this.canvas=canvasFor(section);this.max=80;this.status=Array(this.max+1).fill(0);this.p=2;this.queue=[];this.target=0;this.done=false;}
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
    this.lambda.term(tuple([church(this.p%36,'sieve:p'),church(this.target%36,'sieve:t'),churchBool(this.done,'sieve:d')],'sieve'));
    const primes=this.status.reduce((a,s)=>a+(s===1),0);
    this.stateEl.textContent=`prime=${this.done?'-':this.p}  eliminate=${this.target||'-'}  confirmed=${primes}`;
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
  constructor(section){super(section,100);this.canvas=canvasFor(section);this.seed=0x12345678;this.pos=[0,0];this.from=[0,0];this.to=[0,0];this.path=[[0,0]];this.tweenStart=nowMs();this.bits=[0,0];}
  renderInitial(){this.step();}
  rand(){this.seed=(1664525*this.seed+1013904223)>>>0;return this.seed;}
  current(now){const t=ease(clamp((now-this.tweenStart)/this.interval,0,1));return [lerp(this.from[0],this.to[0],t),lerp(this.from[1],this.to[1],t)];}
  step(){
    const cur=this.current(nowMs());this.path.push(cur);if(this.path.length>300)this.path.shift();
    const r=this.rand(),axis=r&1,dir=(r>>>1)&1,dx=axis?0:(dir?1:-1),dy=axis?(dir?1:-1):0;
    this.from=cur;this.to=[clamp(cur[0]+dx,-15,15),clamp(cur[1]+dy,-15,15)];this.tweenStart=nowMs();this.bits=[axis,dir];
    this.lambda.term(tuple([churchBool(!!axis,'walk:a'),churchBool(!!dir,'walk:d'),signedChurch(Math.round(this.to[0]/2),'walk:x'),signedChurch(Math.round(this.to[1]/2),'walk:y')],'walk'));
    this.stateEl.textContent=`x=${this.to[0].toFixed(1)}  y=${this.to[1].toFixed(1)}  axis=${axis?'Y':'X'}  dir=${dir?'+':'-'}`;
  }
  draw(now){
    const {ctx,w,h}=prepareCanvas(this.canvas),cur=this.current(now),sx=w/32,sy=h/32;
    const pts=[...this.path,cur].map(p=>({x:w/2+p[0]*sx,y:h/2-p[1]*sy}));
    if(pts.length>1){ctx.globalAlpha=.9;ctx.lineWidth=1.4;smoothPath(ctx,pts);ctx.stroke();}
    const p=pts[pts.length-1];ctx.beginPath();ctx.arc(p.x,p.y,3,0,TAU);ctx.fill();
  }
}

/* ---------- Lorenz ---------- */
class LorenzDemo extends BaseDemo{
  constructor(section){super(section,100);this.canvas=canvasFor(section);this.s=[.1,0,0];this.trail=[];this.lastFrame=nowMs();}
  renderInitial(){this.step();}
  deriv([x,y,z]){return [10*(y-x),x*(28-z)-y,x*y-(8/3)*z];}
  integrate(dt){
    const d=this.deriv(this.s);this.s[0]+=d[0]*dt;this.s[1]+=d[1]*dt;this.s[2]+=d[2]*dt;
  }
  step(){
    this.lambda.term(numericState([q(this.s[0],.35),q(this.s[1],.35),q(this.s[2]-25,.35)],'lorenz'));
    this.stateEl.textContent=`x=${signed(this.s[0],2)}  y=${signed(this.s[1],2)}  z=${signed(this.s[2],2)}`;
  }
  draw(now){
    const dt=clamp((now-this.lastFrame)/1000,0,.03);this.lastFrame=now;
    const sub=4;for(let i=0;i<sub;i++)this.integrate(dt/sub);
    this.trail.push([this.s[0],this.s[2]]);if(this.trail.length>650)this.trail.shift();
    const {ctx,w,h}=prepareCanvas(this.canvas),pts=this.trail.map(p=>({x:w/2+p[0]*(w/55),y:h*.78-(p[1]-20)*(h/55)}));
    if(pts.length>1){ctx.globalAlpha=.82;ctx.lineWidth=1.15;smoothPath(ctx,pts);ctx.stroke();}
  }
}

/* ---------- Particle system ---------- */
class ParticlesDemo extends BaseDemo{
  constructor(section){
    super(section,100);this.canvas=canvasFor(section);this.lastFrame=nowMs();
    this.ps=Array.from({length:36},(_,i)=>{const a=i/36*TAU,r=.18+.72*((i*17)%31)/31;return{x:Math.cos(a)*r,y:Math.sin(a)*r,vx:-Math.sin(a)*.18,vy:Math.cos(a)*.18};});
  }
  renderInitial(){this.step();}
  step(){
    const cx=this.ps.reduce((a,p)=>a+p.x,0)/this.ps.length,cy=this.ps.reduce((a,p)=>a+p.y,0)/this.ps.length;
    const e=this.ps.reduce((a,p)=>a+p.vx*p.vx+p.vy*p.vy,0)/this.ps.length;
    this.lambda.term(numericState([q(cx,10),q(cy,10),q(e,30)],'particles'));
    this.stateEl.textContent=`center=(${signed(cx,3)}, ${signed(cy,3)})  mean energy=${e.toFixed(4)}  particles=${this.ps.length}`;
  }
  draw(now){
    const dt=clamp((now-this.lastFrame)/1000,0,.03);this.lastFrame=now;
    for(const p of this.ps){
      const r2=p.x*p.x+p.y*p.y+.05,inv=1/Math.sqrt(r2),ax=-p.x*inv*.55-p.y*.12,ay=-p.y*inv*.55+p.x*.12;
      p.vx=(p.vx+ax*dt)*.999;p.vy=(p.vy+ay*dt)*.999;p.x+=p.vx*dt;p.y+=p.vy*dt;
      if(Math.abs(p.x)>1.25||Math.abs(p.y)>1.25){p.x*=.7;p.y*=.7;}
    }
    const {ctx,w,h}=prepareCanvas(this.canvas),s=Math.min(w,h)*.42,cx=w/2,cy=h/2;
    ctx.save();ctx.globalAlpha=.12;ctx.lineWidth=.7;
    for(let i=0;i<this.ps.length;i++){
      const p=this.ps[i],q=this.ps[(i+7)%this.ps.length];
      ctx.beginPath();ctx.moveTo(cx+p.x*s,cy+p.y*s);ctx.lineTo(cx+q.x*s,cy+q.y*s);ctx.stroke();
    }ctx.restore();
    for(const p of this.ps){ctx.globalAlpha=.9;ctx.beginPath();ctx.arc(cx+p.x*s,cy+p.y*s,2.1,0,TAU);ctx.fill();}
  }
}

/* ---------- Image function ---------- */
class ImageDemo extends BaseDemo{
  constructor(section){super(section,100);this.canvas=canvasFor(section);this.t=0;this.off=document.createElement('canvas');this.off.width=180;this.off.height=110;this.offctx=this.off.getContext('2d');this.lastFrame=nowMs();}
  renderInitial(){this.step();}
  step(){
    this.t+=.12;this.lambda.term(numericState([q(Math.sin(this.t),8),q(Math.cos(this.t),8),Math.round(this.t)%12],'image'));
    this.stateEl.textContent=`t=${this.t.toFixed(2)}  field sampled 180x110`;
  }
  draw(now){
    const t=this.t+clamp((now-(this.lastFrame||now))/1000,0,.1),ow=this.off.width,oh=this.off.height,img=this.offctx.createImageData(ow,oh);
    for(let y=0;y<oh;y++)for(let x=0;x<ow;x++){
      const nx=(x/ow-.5)*8,ny=(y/oh-.5)*5;
      const v=.5+.5*Math.sin(nx+t)*Math.cos(ny-t)+.18*Math.sin(nx+ny+t*.7);
      const g=clamp(Math.round((v*.72+.18)*255),0,255),i=(y*ow+x)*4;
      img.data[i]=g;img.data[i+1]=g;img.data[i+2]=g;img.data[i+3]=255;
    }
    this.offctx.putImageData(img,0,0);
    const {ctx,w,h}=prepareCanvas(this.canvas);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(this.off,0,0,w,h);
  }
}

/* ---------- Benchmark ---------- */
class BenchmarkDemo extends BaseDemo{
  constructor(section){super(section,1000);this.canvas=canvasFor(section);this.rate=0;this.series=new AnimatedSeries(80,0);}
  renderInitial(){this.step();}
  step(){
    const start=nowMs();let ops=0;
    const term=parseLambda('(\u03bbx. x) y');
    while(nowMs()-start<32){const r=betaStep(term);if(r.changed)ops++;}
    const elapsed=nowMs()-start;this.rate=ops/(elapsed/1000);this.series.push(this.rate,this.interval);
    const bucket=clamp(Math.round(Math.log10(Math.max(10,this.rate))*3),0,14);
    this.lambda.term(tuple([church(bucket,'bench:b'),church(Math.round(elapsed)%12,'bench:t')],'bench'));
    this.stateEl.textContent=`${Math.round(this.rate).toLocaleString()} beta reductions/s  |  ${elapsed.toFixed(1)} ms bounded sample`;
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
