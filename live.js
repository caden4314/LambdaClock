(() => {
'use strict';

/*
  Pure Lambda Cube live machine
  -----------------------------
  The JavaScript below is the evaluator + decoder + display boundary.
  Cube topology, binary arithmetic, signed arithmetic and 3-D rotation are
  represented as CLOSED untyped lambda terms and executed by beta reduction.
*/

const NS='http://www.w3.org/2000/svg';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
let gensym=0;
const fresh=(p='x')=>`${p}_${gensym++}`;

/* ---------- named lambda AST used only to assemble the closed source term ---------- */
const NV=n=>({t:'v',n});
const NL=(n,b)=>({t:'l',n,b});
const NA=(f,a)=>({t:'a',f,a});
const app=(f,...xs)=>xs.reduce((q,x)=>NA(q,x),f);
const fn=(prefix,body)=>{const n=fresh(prefix),v=NV(n);return NL(n,body(v));};
const fn2=(a,b,body)=>fn(a,x=>fn(b,y=>body(x,y)));
const fn3=(a,b,c,body)=>fn(a,x=>fn(b,y=>fn(c,z=>body(x,y,z))));
const fn4=(a,b,c,d,body)=>fn(a,x=>fn(b,y=>fn(c,z=>fn(d,w=>body(x,y,z,w)))));

/* ---------- core pure lambda data ---------- */
const TRUE=fn('t',t=>fn('f',()=>t));
const FALSE=fn('t',()=>fn('f',f=>f));
const NOT=fn('b',b=>app(b,FALSE,TRUE));
const AND=fn2('a','b',(a,b)=>app(a,b,FALSE));
const OR=fn2('a','b',(a,b)=>app(a,TRUE,b));
const XOR=fn2('a','b',(a,b)=>app(a,app(NOT,b),b));

const PAIR=fn2('a','b',(a,b)=>fn('s',s=>app(s,a,b)));
const FST=fn('p',p=>app(p,TRUE));
const SND=fn('p',p=>app(p,FALSE));
const pair=(a,b)=>app(PAIR,a,b);
const fst=a=>app(FST,a);
const snd=a=>app(SND,a);

/* Scott list: NIL = λn.λc.n ; CONS h t = λn.λc.c h t */
const NIL=fn('n',n=>fn('c',()=>n));
const CONS=fn2('h','t',(h,t)=>fn2('n','c',(_n,c)=>app(c,h,t)));
const cons=(h,t)=>app(CONS,h,t);

/* normal-order fixed point */
const Y=fn('f',f=>{
  const left=fn('x',x=>app(f,app(x,x)));
  const right=fn('x',x=>app(f,app(x,x)));
  return app(left,right);
});

const MAP=app(Y,fn4('r','f','l','unused',(r,f,l,_u)=>
  app(l,NIL,fn2('h','t',(h,t)=>cons(app(f,h),app(r,f,t))))
));
/* remove dummy binder introduced above without adding a primitive */
const MAPC=fn2('f','l',(f,l)=>app(MAP,f,l,TRUE));

const APPEND=app(Y,fn3('r','a','b',(r,a,b)=>
  app(a,b,fn2('h','t',(h,t)=>cons(h,app(r,t,b))))
));

/* ---------- Scott binary naturals, least-significant bit first ---------- */
const ZERO=NIL;
const ONE=cons(TRUE,NIL);
const DOUBLE=fn('n',n=>cons(FALSE,n));

const SUCC=app(Y,fn2('r','bits',(r,bits)=>
  app(bits,
    ONE,
    fn2('bit','tail',(bit,tail)=>app(bit,
      cons(FALSE,app(r,tail)),
      cons(TRUE,tail)
    ))
  )
));

const ADDC=app(Y,fn4('r','a','b','carry',(r,a,b,carry)=>
  app(a,
    app(b,
      app(carry,ONE,ZERO),
      fn2('bb','bt',()=>app(carry,app(SUCC,b),b))
    ),
    fn2('aa','at',(aa,at)=>
      app(b,
        app(carry,app(SUCC,a),a),
        fn2('bb','bt',(bb,bt)=>{
          const s=app(XOR,app(XOR,aa,bb),carry);
          const co=app(OR,app(AND,aa,bb),app(AND,carry,app(OR,aa,bb)));
          return cons(s,app(r,at,bt,co));
        })
      )
    )
  )
));
const ADD=fn2('a','b',(a,b)=>app(ADDC,a,b,FALSE));

function mulConst(k){
  return fn('n',n=>{
    let shifted=n;
    let sum=ZERO;
    let first=true;
    let x=k;
    while(x>0){
      if(x&1){sum=first?shifted:app(ADD,sum,shifted);first=false;}
      x>>=1;
      if(x>0)shifted=app(DOUBLE,shifted);
    }
    return first?ZERO:sum;
  });
}

/* exact Pythagorean rotations: Y=(40,9,41), X=(60,11,61) */
const M9=mulConst(9),M40=mulConst(40),M41=mulConst(41);
const M11=mulConst(11),M60=mulConst(60),M61=mulConst(61);

/* ---------- signed binary integer = PAIR positive negative ---------- */
const ZZERO=pair(ZERO,ZERO);
const ZONE=pair(ONE,ZERO);
const ZNEG=fn('z',z=>pair(snd(z),fst(z)));
const ZADD=fn2('a','b',(a,b)=>pair(app(ADD,fst(a),fst(b)),app(ADD,snd(a),snd(b))));
const ZSUB=fn2('a','b',(a,b)=>app(ZADD,a,app(ZNEG,b)));
const zScaleTerm=m=>fn('z',z=>pair(app(m,fst(z)),app(m,snd(z))));
const Z9=zScaleTerm(M9),Z40=zScaleTerm(M40),Z41=zScaleTerm(M41);
const Z11=zScaleTerm(M11),Z60=zScaleTerm(M60),Z61=zScaleTerm(M61);

const LHEAD=fn('l',l=>app(l,ZZERO,fn2('h','t',(h,_t)=>h)));
const LTAIL=fn('l',l=>app(l,NIL,fn2('h','t',(_h,t)=>t)));
const head=l=>app(LHEAD,l),tail=l=>app(LTAIL,l);
const list3=(x,y,z)=>cons(x,cons(y,cons(z,NIL)));

/* ---------- generated hypercube graph ----------
   graph  = PAIR scale (PAIR vertices edges)
   vertex = PAIR binary-id coordinate-list
   edge   = PAIR binary-id binary-id
*/
const graph=(scale,vertices,edges)=>pair(scale,pair(vertices,edges));
const gScale=g=>fst(g),gVerts=g=>fst(snd(g)),gEdges=g=>snd(snd(g));
const vId=v=>fst(v),vCoords=v=>snd(v);

const SEED=graph(ONE,cons(pair(ZERO,NIL),NIL),NIL);

const EXPAND=fn2('radius','g',(radius,g)=>{
  const verts=gVerts(g),edges=gEdges(g);
  const plusV=fn('v',v=>pair(app(DOUBLE,vId(v)),cons(radius,vCoords(v))));
  const minusV=fn('v',v=>pair(app(SUCC,app(DOUBLE,vId(v))),cons(app(ZNEG,radius),vCoords(v))));
  const plusE=fn('e',e=>pair(app(DOUBLE,fst(e)),app(DOUBLE,snd(e))));
  const minusE=fn('e',e=>pair(app(SUCC,app(DOUBLE,fst(e))),app(SUCC,app(DOUBLE,snd(e)))));
  const cross=fn('v',v=>pair(app(DOUBLE,vId(v)),app(SUCC,app(DOUBLE,vId(v)))));
  const newVerts=app(APPEND,app(MAPC,plusV,verts),app(MAPC,minusV,verts));
  const newEdges=app(APPEND,
    app(MAPC,plusE,edges),
    app(APPEND,app(MAPC,minusE,edges),app(MAPC,cross,verts))
  );
  return graph(gScale(g),newVerts,newEdges);
});

const THREE=fn('f',f=>fn('x',x=>app(f,app(f,app(f,x)))));
const CUBE=fn('radius',radius=>app(THREE,app(EXPAND,radius),SEED));
const INIT=app(CUBE,ZONE);

/* ---------- exact 3-D rotation executed inside lambda calculus ---------- */
const ROTVERT=fn('v',v=>{
  const id=vId(v),c=vCoords(v);
  const x=head(c),t1=tail(c),y=head(t1),z=head(tail(t1));

  /* Y: (x1,y1,z1) /41 */
  const x1=app(ZADD,app(Z40,x),app(Z9,z));
  const y1=app(Z41,y);
  const z1=app(ZSUB,app(Z40,z),app(Z9,x));

  /* X: (x2,y2,z2) /61 ; common scale is multiplied by 41*61 */
  const x2=app(Z61,x1);
  const y2=app(ZSUB,app(Z60,y1),app(Z11,z1));
  const z2=app(ZADD,app(Z11,y1),app(Z60,z1));
  return pair(id,list3(x2,y2,z2));
});

const STEP=fn('g',g=>graph(
  app(M61,app(M41,gScale(g))),
  app(MAPC,ROTVERT,gVerts(g)),
  gEdges(g)
));

/* ---------- compile named closed terms to pure De Bruijn lambda terms ---------- */
const DV=k=>({t:'v',k});
const DL=b=>({t:'l',b});
const DA=(f,a)=>({t:'a',f,a});
function compile(t,env=[]){
  if(t.t==='v'){
    const k=env.indexOf(t.n);
    if(k<0)throw new Error(`free variable: ${t.n}`);
    return DV(k);
  }
  if(t.t==='l')return DL(compile(t.b,[t.n,...env]));
  return DA(compile(t.f,env),compile(t.a,env));
}
const INIT_TERM=compile(INIT);
const STEP_TERM=compile(STEP);

/* ---------- actual beta reducer: full leftmost-outermost, capture safe ---------- */
function shift(d,t,cut=0){
  if(t.t==='v')return DV(t.k>=cut?t.k+d:t.k);
  if(t.t==='l')return DL(shift(d,t.b,cut+1));
  return DA(shift(d,t.f,cut),shift(d,t.a,cut));
}
function subst(j,s,t,cut=0){
  if(t.t==='v')return t.k===j+cut?shift(cut,s):t;
  if(t.t==='l')return DL(subst(j,s,t.b,cut+1));
  return DA(subst(j,s,t.f,cut),subst(j,s,t.a,cut));
}
function contract(body,arg){return shift(-1,subst(0,shift(1,arg),body));}

function betaStep(t,path='r'){
  if(t.t==='a'){
    if(t.f.t==='l')return {changed:true,term:contract(t.f.b,t.a),path};
    const lf=betaStep(t.f,path+'f');
    if(lf.changed)return {changed:true,term:DA(lf.term,t.a),path:lf.path};
    const ra=betaStep(t.a,path+'a');
    if(ra.changed)return {changed:true,term:DA(t.f,ra.term),path:ra.path};
    return {changed:false,term:t,path:null};
  }
  if(t.t==='l'){
    const b=betaStep(t.b,path+'b');
    return b.changed?{changed:true,term:DL(b.term),path:b.path}:{changed:false,term:t,path:null};
  }
  return {changed:false,term:t,path:null};
}

function nodeCount(t){
  let n=0,stack=[t];
  while(stack.length){const q=stack.pop();n++;if(q.t==='l')stack.push(q.b);else if(q.t==='a'){stack.push(q.a,q.f);}}
  return n;
}
function pretty(t){
  if(t.t==='v')return String(t.k+1);
  if(t.t==='l')return `λ.${pretty(t.b)}`;
  const f=t.f.t==='l'?`(${pretty(t.f)})`:pretty(t.f);
  const a=t.a.t==='v'?pretty(t.a):`(${pretty(t.a)})`;
  return `${f} ${a}`;
}

/* ---------- decode only completed lambda data at the display boundary ---------- */
function isVar(t,k){return t&&t.t==='v'&&t.k===k;}
function isNil(t){return t&&t.t==='l'&&t.b.t==='l'&&isVar(t.b.b,1);}
function uncons(t){
  if(isNil(t))return null;
  if(!t||t.t!=='l'||t.b.t!=='l')throw new Error('not Scott list');
  const b=t.b.b;
  if(b.t!=='a'||b.f.t!=='a'||!isVar(b.f.f,0))throw new Error('bad Scott cons');
  return [b.f.a,b.a];
}
function boolValue(t){
  if(!t||t.t!=='l'||t.b.t!=='l'||t.b.b.t!=='v')throw new Error('bad boolean');
  if(t.b.b.k===1)return true;if(t.b.b.k===0)return false;throw new Error('bad boolean index');
}
function decodeNat(t){
  let bit=0n,out=0n,p=t,guard=0;
  for(;;){
    const c=uncons(p);if(!c)return out;
    if(boolValue(c[0]))out|=(1n<<bit);
    bit++;p=c[1];if(++guard>100000)throw new Error('binary list guard');
  }
}
function unpair(t){
  if(!t||t.t!=='l')throw new Error('not pair');
  const b=t.b;
  if(b.t!=='a'||b.f.t!=='a'||!isVar(b.f.f,0))throw new Error('bad pair');
  return [b.f.a,b.a];
}
function decodeSigned(t){const [p,n]=unpair(t);return decodeNat(p)-decodeNat(n);}
function decodeList(t,fn){
  const out=[];let p=t,guard=0;
  for(;;){const c=uncons(p);if(!c)return out;out.push(fn(c[0]));p=c[1];if(++guard>100000)throw new Error('list guard');}
}
function decodeVertex(t){
  const [id,coords]=unpair(t),c=decodeList(coords,decodeSigned);
  if(c.length!==3)throw new Error(`vertex coordinate count ${c.length}`);
  return {id:Number(decodeNat(id)),raw:c};
}
function decodeEdge(t){const [a,b]=unpair(t);return [Number(decodeNat(a)),Number(decodeNat(b))];}
function decodeGraph(t){
  const [scale,payload]=unpair(t),[vs,es]=unpair(payload);
  return {scale:decodeNat(scale),vertices:decodeList(vs,decodeVertex),edges:decodeList(es,decodeEdge)};
}
function bigRatio(n,d){
  if(n===0n)return 0;
  const neg=n<0n;n=neg?-n:n;
  const bn=n.toString(2).length,bd=d.toString(2).length;
  const sn=Math.max(0,bn-52),sd=Math.max(0,bd-52);
  const mn=Number(n>>BigInt(sn)),md=Number(d>>BigInt(sd));
  const v=(mn/md)*Math.pow(2,sn-sd);
  return neg?-v:v;
}
function numericGraph(g){
  const byId=new Map();
  for(const v of g.vertices)byId.set(v.id,v.raw.map(x=>bigRatio(x,g.scale)));
  return {vertices:byId,edges:g.edges};
}

/* ---------- live lambda-display: exact current AST, not a telemetry surrogate ---------- */
function inspect(root){
  const vars=[],lams=[],apps=[];
  let maxLam=0,maxApp=0;
  function walk(t,path,binders,lamDepth,appDepth){
    if(t.t==='v'){
      vars.push({path,binder:binders[t.k]??null,appDepth});maxApp=Math.max(maxApp,appDepth);return [vars.length-1];
    }
    if(t.t==='l'){
      const id=path;lams.push({id,depth:lamDepth});maxLam=Math.max(maxLam,lamDepth);
      return walk(t.b,path+'b',[id,...binders],lamDepth+1,appDepth);
    }
    const li=walk(t.f,path+'f',binders,lamDepth,appDepth+1);
    const ri=walk(t.a,path+'a',binders,lamDepth,appDepth+1);
    apps.push({id:path,depth:appDepth,left:li,right:ri});maxApp=Math.max(maxApp,appDepth);
    return li.concat(ri);
  }
  walk(root,'r',[],0,0);
  return {vars,lams,apps,maxLam,maxApp};
}

class RawLambdaDisplay{
  constructor(host){
    this.canvas=document.createElement('canvas');this.canvas.className='raw-lambda-canvas';host.replaceChildren(this.canvas);
  }
  draw(term,hotPath){
    const box=this.canvas.getBoundingClientRect(),dpr=Math.min(2,Math.max(1,devicePixelRatio||1));
    const pw=Math.max(2,Math.round(box.width*dpr)),ph=Math.max(2,Math.round(box.height*dpr));
    if(this.canvas.width!==pw||this.canvas.height!==ph){this.canvas.width=pw;this.canvas.height=ph;}
    const ctx=this.canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,box.width,box.height);
    ctx.strokeStyle='#fff';ctx.lineCap='round';
    const q=inspect(term),N=q.vars.length;
    if(!N)return;
    q.vars.forEach((v,i)=>v.x=N===1?box.width/2:8+i*(box.width-16)/(N-1));
    const lamY=new Map();for(const l of q.lams)lamY.set(l.id,8+(l.depth/Math.max(1,q.maxLam+1))*74);
    const bound=new Map();for(const v of q.vars)if(v.binder){if(!bound.has(v.binder))bound.set(v.binder,[]);bound.get(v.binder).push(v.x);}
    ctx.lineWidth=1;
    for(const l of q.lams){const xs=bound.get(l.id)||[],y=lamY.get(l.id);let x1,x2;if(xs.length){x1=Math.min(...xs);x2=Math.max(...xs);}else{x1=box.width*.48;x2=box.width*.52;}ctx.globalAlpha=.6;ctx.beginPath();ctx.moveTo(x1,y);ctx.lineTo(x2,y);ctx.stroke();}
    for(const a of q.apps){
      const lx=a.left.map(i=>q.vars[i].x),rx=a.right.map(i=>q.vars[i].x);if(!lx.length||!rx.length)continue;
      const y=96+(a.depth/Math.max(1,q.maxApp+1))*(box.height-112),hot=hotPath&&a.id===hotPath;
      ctx.globalAlpha=hot?1:.72;ctx.lineWidth=hot?2.7:1.05;ctx.beginPath();ctx.moveTo(Math.min(...lx),y);ctx.lineTo(Math.min(...rx),y);ctx.stroke();
    }
    ctx.lineWidth=.9;for(const v of q.vars){const y1=v.binder?lamY.get(v.binder):5,y2=96+(v.appDepth/Math.max(1,q.maxApp+1))*(box.height-112);ctx.globalAlpha=.54;ctx.beginPath();ctx.moveTo(v.x,y1);ctx.lineTo(v.x,Math.max(y1+4,y2));ctx.stroke();}
    ctx.globalAlpha=1;
  }
}

/* ---------- ordinary display boundary for the latest COMPLETED raw graph ---------- */
function prepCanvas(canvas){
  const r=canvas.getBoundingClientRect(),dpr=Math.min(3,Math.max(1,devicePixelRatio||1));
  const W=Math.max(2,Math.round(r.width*dpr)),H=Math.max(2,Math.round(r.height*dpr));
  if(canvas.width!==W||canvas.height!==H){canvas.width=W;canvas.height=H;}
  const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,r.width,r.height);ctx.strokeStyle='#fff';ctx.fillStyle='#fff';ctx.lineCap='round';return {ctx,w:r.width,h:r.height};
}
function project([x,y,z],w,h){const d=4.8,s=Math.min(w,h)*1.14,k=s/(z+d);return{x:w/2+x*k,y:h/2-y*k,z};}
function drawCube(canvas,g){
  const {ctx,w,h}=prepCanvas(canvas);if(!g)return;
  const lines=[];for(const [a,b] of g.edges){const va=g.vertices.get(a),vb=g.vertices.get(b);if(!va||!vb)continue;lines.push([project(va,w,h),project(vb,w,h)]);}
  lines.sort((u,v)=>(u[0].z+u[1].z)-(v[0].z+v[1].z));
  for(const [a,b] of lines){const z=(a.z+b.z)/2,k=clamp((z+2)/4,0,1);ctx.globalAlpha=.42+.48*k;ctx.lineWidth=1.1+1.1*k;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}
  for(const v of g.vertices.values()){const p=project(v,w,h);ctx.globalAlpha=.9;ctx.beginPath();ctx.arc(p.x,p.y,2.1,0,Math.PI*2);ctx.fill();}
}

/* ---------- machine ---------- */
const cubeCanvas=document.getElementById('cubeCanvas');
const lambdaHost=document.getElementById('lambdaStage');
const termEl=document.getElementById('termText');
const frameEl=document.getElementById('frameValue');
const vertexEl=document.getElementById('vertexValue');
const edgeEl=document.getElementById('edgeValue');
const radiusEl=document.getElementById('radiusValue');
const exactEl=document.getElementById('exactValue');
const toggle=document.getElementById('toggle');
const reset=document.getElementById('reset');
const rawDisplay=new RawLambdaDisplay(lambdaHost);

let current=INIT_TERM;
let completed=null;
let numeric=null;
let phase='GENERATING CUBE';
let frame=0;
let reductions=0;
let lastRedex=null;
let paused=false;
let pumping=false;
let rate=0,rateCount=0,rateAt=performance.now();
let lastTextAt=0;

function acceptNormalForm(term){
  completed=decodeGraph(term);numeric=numericGraph(completed);
  if(phase==='GENERATING CUBE'){frame=0;phase='ROTATING';}
  else frame++;
  current=DA(STEP_TERM,term);
}

function oneReduction(){
  const r=betaStep(current);
  if(!r.changed){acceptNormalForm(current);return false;}
  current=r.term;lastRedex=r.path;reductions++;rateCount++;return true;
}

function pump(){
  if(pumping)return;pumping=true;
  const run=()=>{
    if(!paused){
      const start=performance.now();
      /* No mathematical tick rate: reduce as fast as possible, yielding only so the live display can paint. */
      while(performance.now()-start<12){oneReduction();}
    }
    const now=performance.now();if(now-rateAt>=500){rate=rateCount*1000/(now-rateAt);rateCount=0;rateAt=now;}
    setTimeout(run,0);
  };
  run();
}

function resetMachine(){current=INIT_TERM;completed=null;numeric=null;phase='GENERATING CUBE';frame=0;reductions=0;lastRedex=null;rateCount=0;rateAt=performance.now();}

toggle.addEventListener('click',()=>{paused=!paused;toggle.textContent=paused?'Resume evaluator':'Pause evaluator';});
reset.addEventListener('click',resetMachine);

function paint(now){
  rawDisplay.draw(current,lastRedex);drawCube(cubeCanvas,numeric);
  frameEl.textContent=String(frame);vertexEl.textContent=completed?String(completed.vertices.length):'…';edgeEl.textContent=completed?String(completed.edges.length):'…';radiusEl.textContent='1';
  exactEl.textContent=`${phase} | β=${reductions.toLocaleString()} | ${Math.round(rate).toLocaleString()} β/s | nodes=${nodeCount(current).toLocaleString()} | raw De Bruijn term`;
  if(now-lastTextAt>180){termEl.textContent=pretty(current);lastTextAt=now;}
  requestAnimationFrame(paint);
}

pump();requestAnimationFrame(paint);
})();
