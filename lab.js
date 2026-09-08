(() => {
'use strict';

const NS='http://www.w3.org/2000/svg';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const ease=t=>1-Math.pow(1-t,3);
const TAU=Math.PI*2;

const V=(binder,key)=>({t:'v',binder,key});
const L=(binder,body,key)=>({t:'l',binder,body,key});
const A=(a,b,key)=>({t:'a',a,b,key});

function church(n,prefix){
  n=Math.max(0,Math.min(32,Math.round(n)));
  const fb=prefix+':f', xb=prefix+':x';
  let body=V(xb,prefix+':x-ref');
  for(let i=0;i<n;i++) body=A(V(fb,prefix+':f-ref:'+i),body,prefix+':app:'+i);
  return L(fb,L(xb,body,prefix+':lx'),prefix+':lf');
}
function churchBool(value,prefix){
  const tb=prefix+':t', fb=prefix+':f';
  return L(tb,L(fb,V(value?tb:fb,prefix+':ret'),prefix+':lf'),prefix+':lt');
}
function pair(a,b,prefix){
  const pb=prefix+':p';
  return L(pb,A(A(V(pb,prefix+':p-ref'),a,prefix+':a0'),b,prefix+':a1'),prefix+':lp');
}
function signedChurch(q,prefix){
  q=clamp(Math.round(q),-12,12);
  return pair(church(Math.max(0,q),prefix+':pos'),church(Math.max(0,-q),prefix+':neg'),prefix+':signed');
}
function tuple(items,prefix='state'){
  const pb=prefix+':p';
  let body=V(pb,prefix+':p-ref');
  items.forEach((item,i)=>{ body=A(body,item,prefix+':app:'+i); });
  return L(pb,body,prefix+':lambda');
}
function numericState(values,prefix='state'){
  return tuple(values.map((v,i)=>signedChurch(v,prefix+':v'+i)),prefix);
}
function leaves(node,out=[]){
  if(node.t==='v') out.push(node);
  else if(node.t==='l') leaves(node.body,out);
  else{ leaves(node.a,out); leaves(node.b,out); }
  return out;
}
function layoutTerm(root){
  const vars=leaves(root,[]);
  const left=18,right=982;
  vars.forEach((v,i)=>v.x=vars.length<2?500:left+i*(right-left)/(vars.length-1));
  const segs=[], binderY=new Map(), binderRange=new Map(), verticalEnds=new Map();
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
  function leftmost(node){ return leaves(node,[])[0].x; }
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
  constructor(host,duration=160){
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
    this.reduced=matchMedia?.('(prefers-reduced-motion: reduce)').matches??false;
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
  term(term){ this.morph(layoutTerm(term)); }
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
    const start=performance.now(),duration=this.duration;
    const frame=now=>{
      if(token!==this.animToken) return;
      const raw=Math.min(1,(now-start)/duration),t=ease(raw);
      for(const j of jobs){
        this.set(j.item,{x1:lerp(j.from.x1,j.to.x1,t),y1:lerp(j.from.y1,j.to.y1,t),x2:lerp(j.from.x2,j.to.x2,t),y2:lerp(j.from.y2,j.to.y2,t)},lerp(j.fo,j.toOp,t));
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

const defs={
  clock:{title:'Lambda Clock',formula:'TIME ≡ λp. p d₀ d₁ d₂ d₃ d₄ d₅ · each dᵢ is a Church numeral'},
  wave:{title:'Lambda Wave',formula:'STEP ≡ λs. s (λx.λv. ⟨x + Δ(v − Δx), v − Δx⟩) · Δ = 1/5 · 5 Hz'},
  oscilloscope:{title:'Lambda Oscilloscope',formula:'MIX ≡ λa.λb.λc. a + b + c · three oscillator states sampled at 10 Hz'},
  lissajous:{title:'Lambda Lissajous',formula:'POINT ≡ λt. ⟨sin(3t), sin(4t + π/2)⟩ · 10 Hz'},
  chaos:{title:'Lambda Chaos',formula:'NEXT ≡ λx. r·x·(1−x) · r = 3.86 · 5 Hz'},
  fourier:{title:'Lambda Fourier',formula:'SUM ≡ λt. sin(t) + ½sin(3t) + ⅓sin(5t) · 10 Hz'},
  logic:{title:'Lambda Logic',formula:'TRUE ≡ λa.λb.a · FALSE ≡ λa.λb.b · Church boolean operators at 2 Hz'},
  numbers:{title:'Lambda Counter / Prime Stream',formula:'N ≡ λf.λx. fⁿx · numeral + Church boolean prime flag · 2 Hz'},
  life:{title:'Lambda Game of Life',formula:'NEXT ≡ λc.λn. OR (AND c (n=2)) (n=3) · 4 Hz'}
};

function makeSection(key){
  const d=defs[key];
  const section=document.createElement('section');
  section.className='demo';section.dataset.demo=key;
  section.innerHTML=`<h2>${d.title}</h2><div class="formula">${d.formula}</div><div class="visual"></div><div class="lambda-wrap"></div><div class="state"></div>`;
  return section;
}
function canvasFor(section){const c=document.createElement('canvas');section.querySelector('.visual').appendChild(c);return c;}
function prepareCanvas(canvas){
  const r=canvas.getBoundingClientRect(),dpr=Math.min(2,window.devicePixelRatio||1),w=Math.max(2,Math.round(r.width*dpr)),h=Math.max(2,Math.round(r.height*dpr));
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
  const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,r.width,r.height);ctx.strokeStyle='#fff';ctx.fillStyle='#fff';ctx.lineWidth=1.5;return {ctx,w:r.width,h:r.height};
}
function axes(ctx,w,h){ctx.save();ctx.globalAlpha=.18;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,h/2);ctx.lineTo(w,h/2);ctx.stroke();ctx.restore();}
function drawHistory(canvas,arrays,scale=1){
  const {ctx,w,h}=prepareCanvas(canvas);axes(ctx,w,h);
  arrays.forEach((arr,ai)=>{if(arr.length<2)return;ctx.save();ctx.globalAlpha=ai===0?.95:Math.max(.2,.5-ai*.1);ctx.lineWidth=ai===0?2:1;ctx.beginPath();arr.forEach((v,i)=>{const x=i*(w/Math.max(1,arr.length-1)),y=h/2-v*(h*.42/scale);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});ctx.stroke();ctx.restore();});
}
function q(v,scale=8){return clamp(Math.round(v*scale),-12,12);}
function signed(v,n=3){return (v>=0?'+':'')+v.toFixed(n);}

class BaseDemo{
  constructor(section,interval){this.section=section;this.interval=interval;this.active=false;this.stateEl=section.querySelector('.state');this.formulaEl=section.querySelector('.formula');this.lambda=new LambdaDisplay(section.querySelector('.lambda-wrap'),Math.min(500,Math.max(100,interval*.82)));this.timer=null;}
  start(){this.timer=setInterval(()=>{if(this.active)this.step();},this.interval);this.renderInitial?.();}
  setActive(v){this.active=v;if(v)this.draw?.();}
}
class ClockDemo extends BaseDemo{
  constructor(section){super(section,1000);this.last='';this.readout=document.createElement('div');this.readout.className='big-readout';section.querySelector('.visual').appendChild(this.readout);}
  stamp(d){let h=d.getHours()%12||12;return String(h).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')+':'+String(d.getSeconds()).padStart(2,'0');}
  term(d){const h=d.getHours()%12||12,ds=[Math.floor(h/10),h%10,Math.floor(d.getMinutes()/10),d.getMinutes()%10,Math.floor(d.getSeconds()/10),d.getSeconds()%10];return tuple(ds.map((n,i)=>church(n,'clock:d'+i)),'clock');}
  renderInitial(){this.step();}
  step(){const d=new Date(),s=this.stamp(d);this.readout.textContent=s;if(s===this.last)return;this.last=s;this.lambda.term(this.term(d));this.stateEl.textContent='local device time';}
}
class WaveDemo extends BaseDemo{
  constructor(section){super(section,200);this.canvas=canvasFor(section);this.x=1;this.v=0;this.hist=[1];}
  renderInitial(){this.draw();this.updateLambda();}
  step(){const dt=.2,nv=this.v-dt*this.x,nx=this.x+dt*nv;this.v=nv;this.x=nx;this.hist.push(this.x);if(this.hist.length>80)this.hist.shift();this.draw();this.updateLambda();}
  draw(){drawHistory(this.canvas,[this.hist],1.25);this.stateEl.textContent=`x=${signed(this.x)}  v=${signed(this.v)}  λ-eval=5 Hz`;}
  updateLambda(){this.lambda.term(numericState([q(this.x),q(this.v)],'wave'));}
}
class OscilloscopeDemo extends BaseDemo{
  constructor(section){super(section,100);this.canvas=canvasFor(section);this.t=0;this.h=[[],[],[],[]];}
  renderInitial(){this.sample();}
  sample(){const a=Math.sin(TAU*.45*this.t),b=.65*Math.sin(TAU*.78*this.t+.7),c=.4*Math.sin(TAU*1.12*this.t+1.4),mix=a+b+c;[mix,a,b,c].forEach((v,i)=>{this.h[i].push(v);if(this.h[i].length>120)this.h[i].shift();});this.values=[a,b,c,mix];this.draw();this.lambda.term(numericState(this.values.map(v=>q(v,5)),'scope'));this.t+=.1;}
  step(){this.sample();}
  draw(){drawHistory(this.canvas,this.h,2.1);if(this.values)this.stateEl.textContent=`a=${signed(this.values[0],2)}  b=${signed(this.values[1],2)}  c=${signed(this.values[2],2)}  Σ=${signed(this.values[3],2)}`;}
}
class LissajousDemo extends BaseDemo{
  constructor(section){super(section,100);this.canvas=canvasFor(section);this.t=0;this.pts=[];this.xy=[0,0];}
  renderInitial(){this.sample();}
  sample(){const x=Math.sin(3*this.t),y=Math.sin(4*this.t+Math.PI/2);this.xy=[x,y];this.pts.push([x,y]);if(this.pts.length>260)this.pts.shift();this.t+=.075;this.draw();this.lambda.term(numericState([q(x),q(y)],'liss'));}
  step(){this.sample();}
  draw(){const {ctx,w,h}=prepareCanvas(this.canvas);ctx.save();ctx.translate(w/2,h/2);const s=Math.min(w,h)*.43;for(let i=1;i<this.pts.length;i++){ctx.globalAlpha=.12+.8*(i/this.pts.length);ctx.beginPath();ctx.moveTo(this.pts[i-1][0]*s,-this.pts[i-1][1]*s);ctx.lineTo(this.pts[i][0]*s,-this.pts[i][1]*s);ctx.stroke();}ctx.restore();this.stateEl.textContent=`x=${signed(this.xy[0])}  y=${signed(this.xy[1])}`;}
}
class ChaosDemo extends BaseDemo{
  constructor(section){super(section,200);this.canvas=canvasFor(section);this.x=.217;this.r=3.86;this.hist=[];this.n=0;}
  renderInitial(){this.sample();}
  sample(){this.x=this.r*this.x*(1-this.x);this.hist.push(this.x);if(this.hist.length>110)this.hist.shift();this.n++;this.draw();this.lambda.term(tuple([church(Math.round(this.x*20),'chaos:x'),church(this.n%10,'chaos:n')],'chaos'));}
  step(){this.sample();}
  draw(){const {ctx,w,h}=prepareCanvas(this.canvas);ctx.save();ctx.globalAlpha=.18;ctx.beginPath();ctx.moveTo(0,h);ctx.lineTo(w,h);ctx.stroke();ctx.restore();if(this.hist.length>1){ctx.beginPath();this.hist.forEach((v,i)=>{const x=i*w/(this.hist.length-1),y=h-(v*h*.92+h*.04);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.stroke();}this.stateEl.textContent=`n=${this.n}  x=${this.x.toFixed(6)}  r=${this.r}`;}
}
class FourierDemo extends BaseDemo{
  constructor(section){super(section,100);this.canvas=canvasFor(section);this.t=0;this.h=[[],[],[],[]];this.values=[0,0,0,0];}
  renderInitial(){this.sample();}
  sample(){const a=Math.sin(this.t),b=.5*Math.sin(3*this.t),c=(1/3)*Math.sin(5*this.t),sum=a+b+c;this.values=[a,b,c,sum];[sum,a,b,c].forEach((v,i)=>{this.h[i].push(v);if(this.h[i].length>140)this.h[i].shift();});this.t+=.14;this.draw();this.lambda.term(numericState(this.values.map(v=>q(v,6)),'fourier'));}
  step(){this.sample();}
  draw(){drawHistory(this.canvas,this.h,1.85);this.stateEl.textContent=`1·sin=${signed(this.values[0],2)}  ½·sin3=${signed(this.values[1],2)}  ⅓·sin5=${signed(this.values[2],2)}  Σ=${signed(this.values[3],2)}`;}
}
class LogicDemo extends BaseDemo{
  constructor(section){super(section,500);this.canvas=canvasFor(section);this.i=0;this.ops=['AND','OR','XOR','NOT A'];}
  renderInitial(){this.sample();}
  sample(){const op=this.ops[Math.floor(this.i/4)%this.ops.length],a=!!(this.i&1),b=!!(this.i&2);let r=op==='AND'?(a&&b):op==='OR'?(a||b):op==='XOR'?(a!==b):!a;this.values={op,a,b,r};this.i=(this.i+1)%16;this.draw();this.lambda.term(tuple([churchBool(a,'logic:a'),churchBool(b,'logic:b'),churchBool(r,'logic:r'),church(this.ops.indexOf(op),'logic:op')],'logic'));}
  step(){this.sample();}
  draw(){const {ctx,w,h}=prepareCanvas(this.canvas);ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`500 ${Math.max(28,Math.min(74,w*.09))}px ui-monospace,monospace`;const {op,a,b,r}=this.values||{op:'AND',a:false,b:false,r:false};ctx.fillText(`${a?'T':'F'}  ${op}  ${op==='NOT A'?'':(b?'T':'F')}  →  ${r?'T':'F'}`,w/2,h/2);this.formulaEl.textContent=`${op} · TRUE ≡ λa.λb.a · FALSE ≡ λa.λb.b · 2 Hz`;this.stateEl.textContent=`A=${a?'TRUE':'FALSE'}  B=${b?'TRUE':'FALSE'}  RESULT=${r?'TRUE':'FALSE'}`;}
}
function isPrime(n){if(n<2)return false;for(let d=2;d*d<=n;d++)if(n%d===0)return false;return true;}
class NumbersDemo extends BaseDemo{
  constructor(section){super(section,500);this.canvas=canvasFor(section);this.n=1;}
  renderInitial(){this.sample();}
  sample(){this.n++;if(this.n>19)this.n=2;const p=isPrime(this.n);this.p=p;this.draw();this.lambda.term(tuple([church(this.n,'num:n'),churchBool(p,'num:p')],'num'));}
  step(){this.sample();}
  draw(){const {ctx,w,h}=prepareCanvas(this.canvas);ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`300 ${Math.max(64,Math.min(150,w*.2))}px -apple-system,BlinkMacSystemFont,sans-serif`;ctx.fillText(String(this.n),w/2,h*.46);ctx.font=`400 ${Math.max(18,Math.min(34,w*.05))}px ui-monospace,monospace`;ctx.globalAlpha=.72;ctx.fillText(this.p?'PRIME':'COMPOSITE',w/2,h*.76);this.stateEl.textContent=`Church(${this.n}) + Church(${this.p?'TRUE':'FALSE'})`;}
}
class LifeDemo extends BaseDemo{
  constructor(section){super(section,250);this.canvas=canvasFor(section);this.cols=14;this.rows=10;this.gen=0;this.grid=Array.from({length:this.rows},()=>Array.from({length:this.cols},()=>Math.random()<.28));}
  renderInitial(){this.draw();this.updateLambda();}
  neighbors(y,x){let n=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy)continue;const yy=(y+dy+this.rows)%this.rows,xx=(x+dx+this.cols)%this.cols;if(this.grid[yy][xx])n++;}return n;}
  step(){const next=this.grid.map((row,y)=>row.map((cell,x)=>{const n=this.neighbors(y,x);return n===3||(cell&&n===2);}));this.grid=next;this.gen++;this.draw();this.updateLambda();}
  updateLambda(){const cy=Math.floor(this.rows/2),cx=Math.floor(this.cols/2),c=this.grid[cy][cx],n=this.neighbors(cy,cx),live=this.grid.flat().filter(Boolean).length;this.lambda.term(tuple([churchBool(c,'life:c'),church(n,'life:n'),church(live%13,'life:live'),church(this.gen%10,'life:g')],'life'));this.stateEl.textContent=`generation=${this.gen}  live=${live}  center=${c?'TRUE':'FALSE'}  neighbors=${n}`;}
  draw(){const {ctx,w,h}=prepareCanvas(this.canvas),cw=w/this.cols,ch=h/this.rows;ctx.save();ctx.strokeStyle='#fff';ctx.lineWidth=1;for(let y=0;y<this.rows;y++)for(let x=0;x<this.cols;x++){ctx.globalAlpha=this.grid[y][x]?1:.18;if(this.grid[y][x])ctx.fillRect(x*cw+1,y*ch+1,Math.max(0,cw-2),Math.max(0,ch-2));else ctx.strokeRect(x*cw+.5,y*ch+.5,Math.max(0,cw-1),Math.max(0,ch-1));}ctx.restore();}
}

const classes={clock:ClockDemo,wave:WaveDemo,oscilloscope:OscilloscopeDemo,lissajous:LissajousDemo,chaos:ChaosDemo,fourier:FourierDemo,logic:LogicDemo,numbers:NumbersDemo,life:LifeDemo};
const order=['clock','wave','oscilloscope','lissajous','chaos','fourier','logic','numbers','life'];
const lab=document.getElementById('lab');if(!lab)return;
const only=lab.dataset.only,keys=only?[only]:order;
for(const key of keys)lab.appendChild(makeSection(key));
const demos=[];
for(const section of lab.querySelectorAll('.demo')){const key=section.dataset.demo,Cls=classes[key];if(!Cls)continue;const demo=new Cls(section);demos.push(demo);demo.start();}
if('IntersectionObserver' in window){const io=new IntersectionObserver(entries=>{for(const e of entries){const demo=demos.find(d=>d.section===e.target);if(demo)demo.setActive(e.isIntersecting);}},{rootMargin:'45% 0px 45% 0px',threshold:.01});demos.forEach(d=>io.observe(d.section));}else demos.forEach(d=>d.setActive(true));
addEventListener('resize',()=>{for(const d of demos)if(d.active)d.draw?.();},{passive:true});
})();
