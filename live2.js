(() => {
'use strict';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
let gensym=0;
const fresh=(p='x')=>`${p}_${gensym++}`;

/* Named AST is only a source assembler. The evaluator receives a closed De Bruijn term. */
const NV=n=>({t:'v',n});
const NL=(n,b)=>({t:'l',n,b});
const NA=(f,a)=>({t:'a',f,a});
const app=(f,...xs)=>xs.reduce((q,x)=>NA(q,x),f);
const fn=(p,body)=>{const n=fresh(p),v=NV(n);return NL(n,body(v));};
const fn2=(a,b,body)=>fn(a,x=>fn(b,y=>body(x,y)));
const fn3=(a,b,c,body)=>fn(a,x=>fn(b,y=>fn(c,z=>body(x,y,z))));
const fn4=(a,b,c,d,body)=>fn(a,x=>fn(b,y=>fn(c,z=>fn(d,w=>body(x,y,z,w)))));

const TRUE=fn('t',t=>fn('f',()=>t));
const FALSE=fn('t',()=>fn('f',f=>f));
const NOT=fn('b',b=>app(b,FALSE,TRUE));
const AND=fn2('a','b',(a,b)=>app(a,b,FALSE));
const OR=fn2('a','b',(a,b)=>app(a,TRUE,b));
const XOR=fn2('a','b',(a,b)=>app(a,app(NOT,b),b));

const PAIR=fn2('a','b',(a,b)=>fn('s',s=>app(s,a,b)));
const FST=fn('p',p=>app(p,TRUE));
const SND=fn('p',p=>app(p,FALSE));
const pair=(a,b)=>app(PAIR,a,b),fst=a=>app(FST,a),snd=a=>app(SND,a);

/* Scott lists */
const NIL=fn('n',n=>fn('c',()=>n));
const CONS=fn2('h','t',(h,t)=>fn2('n','c',(_n,c)=>app(c,h,t)));
const cons=(h,t)=>app(CONS,h,t);

const Y=fn('f',f=>{
  const a=fn('x',x=>app(f,app(x,x)));
  const b=fn('x',x=>app(f,app(x,x)));
  return app(a,b);
});

const MAP=app(Y,fn3('r','f','l',(r,f,l)=>
  app(l,NIL,fn2('h','t',(h,t)=>cons(app(f,h),app(r,f,t))))
));
const APPEND=app(Y,fn3('r','a','b',(r,a,b)=>
  app(a,b,fn2('h','t',(h,t)=>cons(h,app(r,t,b))))
));

/* Scott binary naturals, LSB first. */
const ZERO=NIL;
const ONE=cons(TRUE,NIL);
const DOUBLE=fn('n',n=>cons(FALSE,n));
const SUCC=app(Y,fn2('r','bits',(r,bits)=>
  app(bits,ONE,fn2('bit','tail',(bit,tail)=>app(bit,
    cons(FALSE,app(r,tail)),cons(TRUE,tail))))
));

const ADDC=app(Y,fn4('r','a','b','carry',(r,a,b,carry)=>
  app(a,
    app(b,app(carry,ONE,ZERO),fn2('bb','bt',()=>app(carry,app(SUCC,b),b))),
    fn2('aa','at',(aa,at)=>app(b,
      app(carry,app(SUCC,a),a),
      fn2('bb','bt',(bb,bt)=>{
        const sum=app(XOR,app(XOR,aa,bb),carry);
        const carry2=app(OR,app(AND,aa,bb),app(AND,carry,app(OR,aa,bb)));
        return cons(sum,app(r,at,bt,carry2));
      })
    ))
  )
));
const ADD=fn2('a','b',(a,b)=>app(ADDC,a,b,FALSE));

/* Compile-time convenience: creates a pure lambda shift/add multiplier. */
function mulConst(k){
  return fn('n',n=>{
    let x=k,shifted=n,sum=ZERO,have=false;
    while(x>0){
      if(x&1){sum=have?app(ADD,sum,shifted):shifted;have=true;}
      x>>=1;if(x>0)shifted=app(DOUBLE,shifted);
    }
    return have?sum:ZERO;
  });
}

/* 40^2+9^2=41^2 and 60^2+11^2=61^2 */
const M9=mulConst(9),M40=mulConst(40),M41=mulConst(41);
const M11=mulConst(11),M60=mulConst(60),M61=mulConst(61);

/* Signed integer = pair positive negative. No host subtraction is used by the lambda program. */
const ZZERO=pair(ZERO,ZERO),ZONE=pair(ONE,ZERO);
const ZNEG=fn('z',z=>pair(snd(z),fst(z)));
const ZADD=fn2('a','b',(a,b)=>pair(app(ADD,fst(a),fst(b)),app(ADD,snd(a),snd(b))));
const ZSUB=fn2('a','b',(a,b)=>app(ZADD,a,app(ZNEG,b)));
const zscale=m=>fn('z',z=>pair(app(m,fst(z)),app(m,snd(z))));
const Z9=zscale(M9),Z40=zscale(M40),Z41=zscale(M41);
const Z11=zscale(M11),Z60=zscale(M60),Z61=zscale(M61);

const LHEAD=fn('l',l=>app(l,ZZERO,fn2('h','t',(h,_t)=>h)));
const LTAIL=fn('l',l=>app(l,NIL,fn2('h','t',(_h,t)=>t)));
const head=l=>app(LHEAD,l),tail=l=>app(LTAIL,l);
const list3=(x,y,z)=>cons(x,cons(y,cons(z,NIL)));

/* graph = pair scale (pair vertices edges); IDs/topology are generated, not tabled. */
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
  return graph(gScale(g),
    app(APPEND,app(MAP,plusV,verts),app(MAP,minusV,verts)),
    app(APPEND,app(MAP,plusE,edges),app(APPEND,app(MAP,minusE,edges),app(MAP,cross,verts)))
  );
});

const THREE=fn('f',f=>fn('x',x=>app(f,app(f,app(f,x)))));
const CUBE=fn('r',r=>app(THREE,app(EXPAND,r),SEED));
const INIT=app(CUBE,ZONE);

/* Exact rational rotation, but only integer numerators are manipulated.
   Y: cos=40/41 sin=9/41
   X: cos=60/61 sin=11/61
   Common scale is multiplied by 41*61 after every complete frame. */
const ROTVERT=fn('v',v=>{
  const id=vId(v),c=vCoords(v);
  const x=head(c),t1=tail(c),y=head(t1),z=head(tail(t1));
  const x1=app(ZADD,app(Z40,x),app(Z9,z));
  const y1=app(Z41,y);
  const z1=app(ZSUB,app(Z40,z),app(Z9,x));
  const x2=app(Z61,x1);
  const y2=app(ZSUB,app(Z60,y1),app(Z11,z1));
  const z2=app(ZADD,app(Z11,y1),app(Z60,z1));
  return pair(id,list3(x2,y2,z2));
});
const STEP=fn('g',g=>graph(app(M61,app(M41,gScale(g))),app(MAP,ROTVERT,gVerts(g)),gEdges(g)));

/* De Bruijn form = evaluator input. */
const DV=k=>({t:'v',k}),DL=b=>({t:'l',b}),DA=(f,a)=>({t:'a',f,a});
function compile(t,env=[]){
  if(t.t==='v'){const k=env.indexOf(t.n);if(k<0)throw new Error(`free variable ${t.n}`);return DV(k);}
  if(t.t==='l')return DL(compile(t.b,[t.n,...env]));
  return DA(compile(t.f,env),compile(t.a,env));
}
const INIT_TERM=compile(INIT),STEP_TERM=compile(STEP);

/* Full leftmost-outermost beta reduction. */
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
const contract=(body,arg)=>shift(-1,subst(0,shift(1,arg),body));
function betaStep(t,path='r'){
  if(t.t==='a'){
    if(t.f.t==='l')return{changed:true,term:contract(t.f.b,t.a),path};
    const f=betaStep(t.f,path+'f');if(f.changed)return{changed:true,term:DA(f.term,t.a),path:f.path};
    const a=betaStep(t.a,path+'a');if(a.changed)return{changed:true,term:DA(t.f,a.term),path:a.path};
    return{changed:false,term:t,path:null};
  }
  if(t.t==='l'){const b=betaStep(t.b,path+'b');return b.changed?{changed:true,term:DL(b.term),path:b.path}:{changed:false,term:t,path:null};}
  return{changed:false,term:t,path:null};
}

function nodeCount(t){let n=0,s=[t];while(s.length){const q=s.pop();n++;if(q.t==='l')s.push(q.b);else if(q.t==='a')s.push(q.f,q.a);}return n;}
function pretty(t){
  if(t.t==='v')return String(t.k+1);
  if(t.t==='l')return `λ.${pretty(t.b)}`;
  const f=t.f.t==='l'?`(${pretty(t.f)})`:pretty(t.f);
  const a=t.a.t==='v'?pretty(t.a):`(${pretty(t.a)})`;
  return `${f} ${a}`;
}

/* Decode is intentionally outside the calculus: it only translates a completed data term to pixels. */
const isVar=(t,k)=>t&&t.t==='v'&&t.k===k;
const isNil=t=>t&&t.t==='l'&&t.b.t==='l'&&isVar(t.b.b,1);
function uncons(t){
  if(isNil(t))return null;if(!t||t.t!=='l'||t.b.t!=='l')throw Error('not Scott list');
  const b=t.b.b;if(b.t!=='a'||b.f.t!=='a'||!isVar(b.f.f,0))throw Error('bad cons');return[b.f.a,b.a];
}
function boolValue(t){if(!t||t.t!=='l'||t.b.t!=='l'||t.b.b.t!=='v')throw Error('bad bool');if(t.b.b.k===1)return true;if(t.b.b.k===0)return false;throw Error('bad bool');}
function decodeNat(t){let bit=0n,n=0n,p=t,g=0;for(;;){const c=uncons(p);if(!c)return n;if(boolValue(c[0]))n|=1n<<bit;bit++;p=c[1];if(++g>100000)throw Error('nat guard');}}
function unpair(t){if(!t||t.t!=='l')throw Error('not pair');const b=t.b;if(b.t!=='a'||b.f.t!=='a'||!isVar(b.f.f,0))throw Error('bad pair');return[b.f.a,b.a];}
const decodeSigned=t=>{const[p,n]=unpair(t);return decodeNat(p)-decodeNat(n);};
function decodeList(t,decode){const a=[];let p=t,g=0;for(;;){const c=uncons(p);if(!c)return a;a.push(decode(c[0]));p=c[1];if(++g>100000)throw Error('list guard');}}
function decodeVertex(t){const[id,c]=unpair(t),xyz=decodeList(c,decodeSigned);if(xyz.length!==3)throw Error('coordinate count');return{id:Number(decodeNat(id)),raw:xyz};}
function decodeEdge(t){const[a,b]=unpair(t);return[Number(decodeNat(a)),Number(decodeNat(b))];}
function decodeGraph(t){const[s,p]=unpair(t),[v,e]=unpair(p);return{scale:decodeNat(s),vertices:decodeList(v,decodeVertex),edges:decodeList(e,decodeEdge)};}
function ratio(n,d){if(n===0n)return 0;const neg=n<0n;if(neg)n=-n;const bn=n.toString(2).length,bd=d.toString(2).length,sn=Math.max(0,bn-52),sd=Math.max(0,bd-52);const v=Number(n>>BigInt(sn))/Number(d>>BigInt(sd))*Math.pow(2,sn-sd);return neg?-v:v;}
function numericGraph(g){const m=new Map();for(const v of g.vertices)m.set(v.id,v.raw.map(x=>ratio(x,g.scale)));return{vertices:m,edges:g.edges};}

/* Exact current AST -> lambda-line display. */
function inspect(root){
  const vars=[],lams=[],apps=[];let maxLam=0,maxApp=0;
  function walk(t,path,binders,ld,ad){
    if(t.t==='v'){vars.push({binder:binders[t.k]??null,ad});maxApp=Math.max(maxApp,ad);return[vars.length-1];}
    if(t.t==='l'){lams.push({id:path,d:ld});maxLam=Math.max(maxLam,ld);return walk(t.b,path+'b',[path,...binders],ld+1,ad);}
    const l=walk(t.f,path+'f',binders,ld,ad+1),r=walk(t.a,path+'a',binders,ld,ad+1);apps.push({id:path,d:ad,l,r});maxApp=Math.max(maxApp,ad);return l.concat(r);
  }
  walk(root,'r',[],0,0);return{vars,lams,apps,maxLam,maxApp};
}
class RawLambdaDisplay{
  constructor(host){this.canvas=document.createElement('canvas');this.canvas.className='raw-lambda-canvas';host.replaceChildren(this.canvas);}
  draw(term,hot){
    const r=this.canvas.getBoundingClientRect(),dpr=Math.min(2,Math.max(1,devicePixelRatio||1)),W=Math.max(2,Math.round(r.width*dpr)),H=Math.max(2,Math.round(r.height*dpr));
    if(this.canvas.width!==W||this.canvas.height!==H){this.canvas.width=W;this.canvas.height=H;}const c=this.canvas.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,r.width,r.height);c.strokeStyle='#fff';c.lineCap='round';
    const q=inspect(term),N=q.vars.length;if(!N)return;q.vars.forEach((v,i)=>v.x=N===1?r.width/2:7+i*(r.width-14)/(N-1));
    const ly=new Map(),bound=new Map();for(const l of q.lams)ly.set(l.id,7+l.d/Math.max(1,q.maxLam+1)*76);for(const v of q.vars)if(v.binder){if(!bound.has(v.binder))bound.set(v.binder,[]);bound.get(v.binder).push(v.x);}
    c.lineWidth=.9;for(const l of q.lams){const xs=bound.get(l.id)||[],y=ly.get(l.id),x1=xs.length?Math.min(...xs):r.width*.49,x2=xs.length?Math.max(...xs):r.width*.51;c.globalAlpha=.55;c.beginPath();c.moveTo(x1,y);c.lineTo(x2,y);c.stroke();}
    for(const a of q.apps){const lx=a.l.map(i=>q.vars[i].x),rx=a.r.map(i=>q.vars[i].x);if(!lx.length||!rx.length)continue;const y=95+a.d/Math.max(1,q.maxApp+1)*(r.height-108),h=hot&&a.id===hot;c.globalAlpha=h?1:.68;c.lineWidth=h?2.7:1;c.beginPath();c.moveTo(Math.min(...lx),y);c.lineTo(Math.min(...rx),y);c.stroke();}
    c.lineWidth=.8;for(const v of q.vars){const y1=v.binder?ly.get(v.binder):5,y2=95+v.ad/Math.max(1,q.maxApp+1)*(r.height-108);c.globalAlpha=.48;c.beginPath();c.moveTo(v.x,y1);c.lineTo(v.x,Math.max(y1+3,y2));c.stroke();}c.globalAlpha=1;
  }
}

function prep(canvas){const r=canvas.getBoundingClientRect(),d=Math.min(3,Math.max(1,devicePixelRatio||1)),W=Math.max(2,Math.round(r.width*d)),H=Math.max(2,Math.round(r.height*d));if(canvas.width!==W||canvas.height!==H){canvas.width=W;canvas.height=H;}const c=canvas.getContext('2d');c.setTransform(d,0,0,d,0,0);c.clearRect(0,0,r.width,r.height);c.strokeStyle='#fff';c.fillStyle='#fff';c.lineCap='round';return{c,w:r.width,h:r.height};}
function project(v,w,h){const[x,y,z]=v,d=4.8,s=Math.min(w,h)*1.14,k=s/(z+d);return{x:w/2+x*k,y:h/2-y*k,z};}
function drawCube(canvas,g){const{c,w,h}=prep(canvas);if(!g)return;const lines=[];for(const[a,b]of g.edges){const va=g.vertices.get(a),vb=g.vertices.get(b);if(va&&vb)lines.push([project(va,w,h),project(vb,w,h)]);}lines.sort((a,b)=>(a[0].z+a[1].z)-(b[0].z+b[1].z));for(const[a,b]of lines){const k=clamp(((a.z+b.z)/2+2)/4,0,1);c.globalAlpha=.42+.48*k;c.lineWidth=1.1+1.1*k;c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();}for(const v of g.vertices.values()){const p=project(v,w,h);c.globalAlpha=.9;c.beginPath();c.arc(p.x,p.y,2.1,0,Math.PI*2);c.fill();}}

const cubeCanvas=document.getElementById('cubeCanvas'),lambdaHost=document.getElementById('lambdaStage'),termEl=document.getElementById('termText');
const frameEl=document.getElementById('frameValue'),vertexEl=document.getElementById('vertexValue'),edgeEl=document.getElementById('edgeValue'),radiusEl=document.getElementById('radiusValue'),exactEl=document.getElementById('exactValue');
const toggle=document.getElementById('toggle'),reset=document.getElementById('reset'),rawDisplay=new RawLambdaDisplay(lambdaHost);
let current=INIT_TERM,complete=null,numeric=null,phase='GENERATING CUBE',frame=0,reductions=0,lastRedex=null,paused=false,pumping=false,rate=0,rateCount=0,rateAt=performance.now(),lastTextAt=0,lastError='';

function acceptNormal(t){complete=decodeGraph(t);numeric=numericGraph(complete);if(phase==='GENERATING CUBE'){frame=0;phase='ROTATING';}else frame++;current=DA(STEP_TERM,t);}
function one(){const r=betaStep(current);if(!r.changed){acceptNormal(current);return;}current=r.term;lastRedex=r.path;reductions++;rateCount++;}
function pump(){if(pumping)return;pumping=true;const run=()=>{try{if(!paused){const start=performance.now();while(performance.now()-start<12)one();}}catch(e){lastError=String(e);paused=true;}const now=performance.now();if(now-rateAt>=500){rate=rateCount*1000/(now-rateAt);rateCount=0;rateAt=now;}setTimeout(run,0);};run();}
function restart(){current=INIT_TERM;complete=null;numeric=null;phase='GENERATING CUBE';frame=0;reductions=0;lastRedex=null;lastError='';rate=0;rateCount=0;rateAt=performance.now();}
toggle.addEventListener('click',()=>{paused=!paused;toggle.textContent=paused?'Resume evaluator':'Pause evaluator';});reset.addEventListener('click',restart);
function paint(now){rawDisplay.draw(current,lastRedex);drawCube(cubeCanvas,numeric);frameEl.textContent=String(frame);vertexEl.textContent=complete?String(complete.vertices.length):'…';edgeEl.textContent=complete?String(complete.edges.length):'…';radiusEl.textContent='1';exactEl.textContent=lastError?`ERROR: ${lastError}`:`${phase} | β=${reductions.toLocaleString()} | ${Math.round(rate).toLocaleString()} β/s | nodes=${nodeCount(current).toLocaleString()} | RAW De Bruijn`;if(now-lastTextAt>180){try{termEl.textContent=pretty(current);}catch(e){termEl.textContent=`raw term too deep for text serializer: ${e}`;}lastTextAt=now;}requestAnimationFrame(paint);}
pump();requestAnimationFrame(paint);
})();
