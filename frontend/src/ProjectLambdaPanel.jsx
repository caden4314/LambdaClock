import {createMemo,createSignal,Show} from 'solid-js';
import LambdaDisplay from './LambdaDisplay.jsx';

const V=(binder,key)=>({t:'v',binder,key});
const L=(id,body)=>({t:'l',id,body});
const A=(id,left,right)=>({t:'a',id,left,right});
const free=(name,key=name)=>V(`free:${name}`,`free:${key}`);

function church(n,p='n'){
  const f=`${p}:f`,x=`${p}:x`;
  let body=V(x,`${p}:xv`);
  for(let i=0;i<Math.max(0,Number(n)||0);i++) body=A(`${p}:a${i}`,V(f,`${p}:fv${i}`),body);
  return L(f,L(x,body));
}

function bool(value,p='b'){
  const t=`${p}:t`,f=`${p}:f`;
  return L(t,L(f,V(value?t:f,`${p}:v`)));
}

function apply(p,...nodes){
  return nodes.slice(1).reduce((left,right,i)=>A(`${p}:app${i}`,left,right),nodes[0]);
}

function addOp(p='add'){
  const m=`${p}:m`,n=`${p}:n`,f=`${p}:f`,x=`${p}:x`;
  const nf=A(`${p}:nf`,V(n,`${p}:nv`),V(f,`${p}:nfarg`));
  const nfx=A(`${p}:nfx`,nf,V(x,`${p}:xv`));
  return L(m,L(n,L(f,L(x,A(`${p}:body`,A(`${p}:mf`,V(m,`${p}:mv`),V(f,`${p}:mfarg`)),nfx)))));
}
function mulOp(p='mul'){
  const m=`${p}:m`,n=`${p}:n`,f=`${p}:f`;
  const nf=A(`${p}:nf`,V(n,`${p}:nv`),V(f,`${p}:fv`));
  return L(m,L(n,L(f,A(`${p}:body`,V(m,`${p}:mv`),nf))));
}

function notOp(p='not'){
  const q=`${p}:q`;
  return L(q,apply(`${p}:body`,V(q,`${p}:qv`),bool(false,`${p}:false`),bool(true,`${p}:true`)));
}

function boolOp(kind,p='op'){
  const a=`${p}:a`,b=`${p}:b`;
  if(kind==='NOT') return notOp(p);
  if(kind==='AND') return L(a,L(b,apply(`${p}:body`,V(a,`${p}:av`),V(b,`${p}:bv`),V(a,`${p}:av2`))));
  if(kind==='OR') return L(a,L(b,apply(`${p}:body`,V(a,`${p}:av`),V(a,`${p}:av2`),V(b,`${p}:bv`))));
  return L(a,L(b,apply(`${p}:body`,V(a,`${p}:av`),A(`${p}:notb`,notOp(`${p}:not`),V(b,`${p}:bv`)),V(b,`${p}:bv2`))));
}

function pair(a,b,p='pair'){
  const s=`${p}:s`;
  return L(s,apply(`${p}:body`,V(s,`${p}:sv`),a,b));
}

function yOp(p='y'){
  const f=`${p}:f`,x1=`${p}:x1`,x2=`${p}:x2`;
  const left=L(x1,A(`${p}:leftbody`,V(f,`${p}:fv1`),A(`${p}:xx1`,V(x1,`${p}:x1a`),V(x1,`${p}:x1b`))));
  const right=L(x2,A(`${p}:rightbody`,V(f,`${p}:fv2`),A(`${p}:xx2`,V(x2,`${p}:x2a`),V(x2,`${p}:x2b`))));
  return L(f,A(`${p}:body`,left,right));
}
function iOp(p='I'){const x=`${p}:x`;return L(x,V(x,`${p}:xv`));}
function kOp(p='K'){const x=`${p}:x`,y=`${p}:y`;return L(x,L(y,V(x,`${p}:xv`)));}
function sOp(p='S'){
  const f=`${p}:f`,g=`${p}:g`,x=`${p}:x`;
  return L(f,L(g,L(x,A(`${p}:body`,A(`${p}:fx`,V(f,`${p}:fv`),V(x,`${p}:x1`)),A(`${p}:gx`,V(g,`${p}:gv`),V(x,`${p}:x2`))))));
}

function combinator(kind,step){
  if(kind==='I') return step>0?free('x','I:x'):A('I:apply',iOp('I:def'),free('x','I:x'));
  if(kind==='K'){
    if(step>=2)return free('a','K:a');
    if(step===1){const b='K:mid:b';return A('K:mid:apply',L(b,free('a','K:mid:a')),free('b','K:argb'));}
    return apply('K:start',kOp('K:def'),free('a','K:a'),free('b','K:b'));
  }
  if(step>=2)return free('x','S:x');
  if(step===1)return A('S:mid',A('S:kx',kOp('S:k1'),free('x','S:x1')),A('S:kx2',kOp('S:k2'),free('x','S:x2')));
  return apply('S:start',sOp('S:def'),kOp('S:k1'),kOp('S:k2'),free('x','S:x'));
}

function binaryList(bits){
  let tail=free('NIL','bits:nil');
  [...bits].reverse().forEach((bitValue,index)=>{
    const i=bits.length-1-index;
    tail=apply(`bits:${i}`,free('CONS',`bits:cons${i}`),bool(!!bitValue,`bits:b${i}`),tail);
  });
  return tail;
}

function boundedChurch(value,p,max=9){
  const n=Math.max(0,Math.min(max,Math.round(Number(value)||0)));
  return church(n,p);
}
function waveFunction(mode){
  const phase='wave:fn:phase',x='wave:fn:x';
  const pv=k=>V(phase,`wave:fn:p${k}`),xv=k=>V(x,`wave:fn:x${k}`);
  const sin=(p,arg)=>apply(p,free('SIN',`${p}:sin`),arg);
  if(mode==='fold') return L(phase,L(x,apply('wave:fold:add',free('ADD','wave:fold:addf'),sin('wave:fold:a',apply('wave:fold:pa',free('ADD','wave:fold:padd'),pv('a'),xv('a'))),sin('wave:fold:b',apply('wave:fold:mul',free('MUL','wave:fold:mulf'),church(3,'wave:fold:three'),xv('b'))))));
  if(mode==='interference') return L(phase,L(x,apply('wave:int:add',free('ADD','wave:int:addf'),sin('wave:int:a',apply('wave:int:pa',free('ADD','wave:int:padd'),pv('a'),xv('a'))),sin('wave:int:b',apply('wave:int:pb',free('ADD','wave:int:padd2'),apply('wave:int:mul',free('MUL','wave:int:mulf'),church(2,'wave:int:two'),xv('b')),pv('b'))))));
  return L(phase,L(x,sin('wave:sine',apply('wave:sine:add',free('ADD','wave:sine:addf'),pv('s'),apply('wave:sine:mul',free('MUL','wave:sine:mulf'),free('k','wave:sine:k'),xv('s'))))));
}

function termFor(props){
  const kind=props.kind;
  if(kind==='church')return church(props.value,'counter:n');
  if(kind==='boolean')return apply('bool:eval',boolOp(props.op,'bool:op'),bool(!!props.a,'bool:a'),...(props.op==='NOT'?[]:[bool(!!props.b,'bool:b')]));
  if(kind==='arithmetic')return apply('arith:eval',props.op==='MUL'?mulOp('arith:mul'):addOp('arith:add'),church(props.a,'arith:a'),church(props.b,'arith:b'));
  if(kind==='fibonacci')return apply('fib:iter',church(Math.min(14,props.n||0),'fib:n'),free('STEP','fib:step'),pair(church(0,'fib:zero'),church(1,'fib:one'),'fib:pair'));
  if(kind==='wave'){
    const state=pair(boundedChurch(props.phase,'wave:state:phase',7),pair(boundedChurch(props.freq,'wave:state:freq',6),boundedChurch((Number(props.amp)||55)/12,'wave:state:amp',8),'wave:state:fa'),'wave:state');
    return pair(waveFunction(props.mode),state,'wave:live');
  }
  if(kind==='binary')return pair(binaryList(props.bits||[]),boundedChurch((Number(props.value)||0)%10,'bits:value'),'bits:live');
  if(kind==='combinator'){const code=props.combinator==='S'?2:props.combinator==='K'?1:0;return pair(combinator(props.combinator,props.step||0),pair(boundedChurch(code,'combo:kind',2),boundedChurch(props.step,'combo:step',4),'combo:state'),'combo:live');}
  if(kind==='recursion')return pair(pair(boundedChurch(props.n||1,'rec:state:n',8),bool(props.mode==='fib','rec:mode'),'rec:state'),apply('rec:run',yOp('rec:Y'),free(props.mode==='fib'?'FIB':'FACT','rec:function')),'rec:live');
  if(kind==='automata'){
    const evalTerm=apply('auto:xor',boolOp('XOR','auto:op'),bool(!!props.left,'auto:left'),bool(!!props.right,'auto:right'));
    return pair(evalTerm,pair(boundedChurch((Number(props.generation)||0)%10,'auto:gen'),boundedChurch((Number(props.population)||0)%10,'auto:pop'),'auto:state'),'auto:live');
  }
  if(kind==='orbit'){
    const core=apply('orbit:run',free('ITER','orbit:iter'),free('F','orbit:f'),free('seed','orbit:seed'));
    const state=pair(boundedChurch((Number(props.step)||0)%10,'orbit:step'),pair(boundedChurch((Number(props.x)||0)*9,'orbit:x'),boundedChurch(((Number(props.rate)||2.8)-2.8)*7.5,'orbit:r'),'orbit:xr'),'orbit:state');
    return pair(core,state,'orbit:live');
  }
  if(kind==='collatz'){
    const value=Math.max(0,Math.round(Number(props.value)||0));
    return pair(apply('collatz:run',yOp('collatz:Y'),free('COLLATZ','collatz:f')),pair(boundedChurch(value%10,'collatz:digit'),bool(value%2===0,'collatz:parity'),'collatz:state'),'collatz:live');
  }
  if(kind==='oscillator'){
    const state=boundedChurch(props.state,'osc:state',9);
    const fb=boundedChurch((Number(props.feedback)||0)*7.2,'osc:feedback',9);
    return pair(apply('osc:run',yOp('osc:Y'),free('OSC','osc:f')),pair(state,fb,'osc:statepair'),'osc:live');
  }
  return iOp('fallback:I');
}

function initialView(){
  try{return localStorage.getItem('lambda-view-mode')==='formula'?'formula':'live'}catch{return 'live'}
}
const [lambdaViewMode,setLambdaViewMode]=createSignal(initialView());
function chooseLambdaView(mode){
  setLambdaViewMode(mode);
  try{localStorage.setItem('lambda-view-mode',mode)}catch{}
}

export default function ProjectLambdaPanel(props){
  const root=createMemo(()=>termFor(props));
  return <section class="project-lambda-panel" aria-label="Lambda term visualization">
    <div class="lambda-view-toggle" role="tablist" aria-label="Lambda display mode">
      <button type="button" role="tab" aria-selected={lambdaViewMode()==='live'} class={lambdaViewMode()==='live'?'active':''} onClick={()=>chooseLambdaView('live')}>Live Lambda</button>
      <button type="button" role="tab" aria-selected={lambdaViewMode()==='formula'} class={lambdaViewMode()==='formula'?'active':''} onClick={()=>chooseLambdaView('formula')}>Formula</button>
    </div>
    <div class="lambda-view-stage">
      <Show when={lambdaViewMode()==='live'} fallback={
        <div class="project-formula-view">
          <small>current expression</small>
          <code>{props.expression}</code>
        </div>
      }>
        <div class="project-lambda-canvas">
          <LambdaDisplay root={root()} label={props.label||'Interactive Tromp-style lambda term'}/>
        </div>
      </Show>
    </div>
  </section>;
}
