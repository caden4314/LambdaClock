import {createEffect,createMemo,createSignal,For,Match,onCleanup,onMount,Show,Switch} from 'solid-js';

export const PROJECTS=[
  {id:'clock',name:'Clock',note:'Church time'},
  {id:'counter',name:'Counter',note:'Church numerals'},
  {id:'booleans',name:'Boolean Lab',note:'TRUE / FALSE'},
  {id:'arithmetic',name:'Arithmetic',note:'ADD / MUL'},
  {id:'fibonacci',name:'Fibonacci',note:'pair recursion'},
  {id:'wave',name:'Wave',note:'function iteration'},
  {id:'binary',name:'Binary',note:'boolean bits'},
  {id:'combinators',name:'Combinators',note:'S K I reduction'},
  {id:'recursion',name:'Recursion Tree',note:'Y-style unfolding'},
  {id:'automata',name:'Cellular Automata',note:'Rule 90 XOR'}
];

const churchText=n=>n===0?'λf.λx.x':`λf.λx.${Array.from({length:n},()=> 'f(').join('')}x${')'.repeat(n)}`;
const boolText=v=>v?'λt.λf.t':'λt.λf.f';

function Shell(props){
  return <main class="project-page">
    <header class="project-head"><div><h1>{props.title}</h1><p>{props.subtitle}</p></div><code>{props.lambda}</code></header>
    <section class="project-body">{props.children}</section>
  </main>;
}
function Button(props){return <button class={`lab-button${props.active?' active':''}`} type="button" onClick={props.onClick}>{props.children}</button>}
function Range(props){return <label class="lab-range"><span>{props.label}<b>{props.value}</b></span><input type="range" min={props.min??0} max={props.max??9} step={props.step??1} value={props.value} onInput={e=>props.onInput?.(+e.currentTarget.value)}/></label>}
function Marks(props){const count=()=>Math.min(props.value,48);return <div class="church-marks"><For each={Array.from({length:count()})}>{(_,i)=><i style={{'animation-delay':`${i()*18}ms`}}/>}</For><Show when={props.value>48}><span>+{props.value-48}</span></Show></div>}

function Counter(){
  const [n,setN]=createSignal(3);
  return <Shell title="Counter" subtitle="A number as repeated function application." lambda="N ≡ λf.λx.fⁿx">
    <div class="hero-number">{n()}</div><Marks value={n()}/><code class="big-lambda">{churchText(n())}</code>
    <div class="lab-controls centered"><Button onClick={()=>setN(v=>Math.max(0,v-1))}>−</Button><Button onClick={()=>setN(v=>Math.min(18,v+1))}>+</Button><Button onClick={()=>setN(0)}>zero</Button></div>
  </Shell>;
}

function BooleanLab(){
  const [a,setA]=createSignal(true),[b,setB]=createSignal(false),[op,setOp]=createSignal('AND');
  const out=createMemo(()=>op()==='AND'?a()&&b():op()==='OR'?a()||b():op()==='XOR'?a()!==b():!a());
  const formula=()=>op()==='AND'?'λp.λq.p q p':op()==='OR'?'λp.λq.p p q':op()==='XOR'?'λp.λq.p (NOT q) q':'λp.p FALSE TRUE';
  return <Shell title="Boolean Lab" subtitle="Church booleans behave like selectors." lambda={formula()}>
    <div class="boolean-flow">
      <button class={`bool-node${a()?' on':''}`} onClick={()=>setA(v=>!v)}><small>A</small>{a()?'TRUE':'FALSE'}<code>{boolText(a())}</code></button>
      <Show when={op()!=='NOT'}><button class={`bool-node${b()?' on':''}`} onClick={()=>setB(v=>!v)}><small>B</small>{b()?'TRUE':'FALSE'}<code>{boolText(b())}</code></button></Show>
      <div class="bool-arrow">→</div><div class={`bool-node output${out()?' on':''}`}><small>OUT</small>{out()?'TRUE':'FALSE'}<code>{boolText(out())}</code></div>
    </div>
    <div class="lab-controls centered"><For each={['AND','OR','XOR','NOT']}>{name=><Button active={op()===name} onClick={()=>setOp(name)}>{name}</Button>}</For></div>
  </Shell>;
}

function Arithmetic(){
  const [a,setA]=createSignal(3),[b,setB]=createSignal(2),[op,setOp]=createSignal('ADD');
  const result=createMemo(()=>op()==='ADD'?a()+b():a()*b());
  return <Shell title="Arithmetic" subtitle="Compose Church numerals to add or multiply." lambda={op()==='ADD'?'λm.λn.λf.λx.m f (n f x)':'λm.λn.λf.m (n f)'}>
    <div class="split-controls"><Range label="A" value={a()} onInput={setA}/><Range label="B" value={b()} onInput={setB}/></div>
    <div class="equation"><span>{a()}</span><b>{op()==='ADD'?'+':'×'}</b><span>{b()}</span><i>=</i><strong>{result()}</strong></div><Marks value={result()}/>
    <div class="lab-controls centered"><Button active={op()==='ADD'} onClick={()=>setOp('ADD')}>ADD</Button><Button active={op()==='MUL'} onClick={()=>setOp('MUL')}>MUL</Button></div>
  </Shell>;
}

function fib(n){let a=0,b=1;for(let i=0;i<n;i++)[a,b]=[b,a+b];return a}
function Fibonacci(){
  const [n,setN]=createSignal(8),[running,setRunning]=createSignal(false);let timer;
  createEffect(()=>{clearInterval(timer);if(running())timer=setInterval(()=>setN(v=>v>=14?0:v+1),700)});onCleanup(()=>clearInterval(timer));
  const seq=createMemo(()=>Array.from({length:n()+1},(_,i)=>fib(i)));
  return <Shell title="Fibonacci" subtitle="Transform the pair (a,b) → (b,a+b) repeatedly." lambda="FIB ≡ ITER step ⟨0,1⟩">
    <div class="hero-number">{fib(n())}</div><div class="sequence-strip"><For each={seq()}>{(v,i)=><span class={i()===n()?'active':''}>{v}</span>}</For></div>
    <Range label="iterations" min={0} max={14} value={n()} onInput={setN}/><div class="lab-controls centered"><Button active={running()} onClick={()=>setRunning(v=>!v)}>{running()?'pause':'run'}</Button><Button onClick={()=>setN(0)}>reset</Button></div>
  </Shell>;
}

function Wave(){
  const [amp,setAmp]=createSignal(55),[freq,setFreq]=createSignal(2),[speed,setSpeed]=createSignal(1);let canvas,raf=0,ctx,w=1,h=1,ro,start=performance.now();
  function resize(){const r=canvas.getBoundingClientRect(),d=Math.min(2,devicePixelRatio||1);w=r.width;h=r.height;canvas.width=Math.max(2,Math.round(w*d));canvas.height=Math.max(2,Math.round(h*d));ctx=canvas.getContext('2d');ctx.setTransform(d,0,0,d,0,0)}
  function draw(now){if(!ctx){raf=requestAnimationFrame(draw);return}ctx.clearRect(0,0,w,h);ctx.strokeStyle='rgba(255,255,255,.12)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,h/2);ctx.lineTo(w,h/2);ctx.stroke();const t=(now-start)/1000*speed();ctx.strokeStyle='#fff';ctx.lineWidth=1.5;ctx.beginPath();for(let x=0;x<=w;x+=2){const p=x/Math.max(1,w),y=h/2-Math.sin(p*Math.PI*2*freq()+t*2.2)*amp();if(x===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)}ctx.stroke();raf=requestAnimationFrame(draw)}
  onMount(()=>{ro=new ResizeObserver(resize);ro.observe(canvas);resize();raf=requestAnimationFrame(draw)});onCleanup(()=>{ro?.disconnect();cancelAnimationFrame(raf)});
  return <Shell title="Wave" subtitle="Lambda supplies a composable function; the browser interpolates it smoothly." lambda="W ≡ λphase.λx.sin(phase + kx)">
    <canvas class="wave-canvas" ref={canvas}/><div class="split-controls three"><Range label="amplitude" min={12} max={95} value={amp()} onInput={setAmp}/><Range label="frequency" min={1} max={6} value={freq()} onInput={setFreq}/><Range label="speed" min={0} max={3} step={.25} value={speed()} onInput={setSpeed}/></div>
  </Shell>;
}

function Binary(){
  const [value,setValue]=createSignal(37);const bits=createMemo(()=>value().toString(2).padStart(6,'0').split('').map(Number));
  function toggle(i){const mask=1<<(5-i);setValue(v=>v^mask)}
  return <Shell title="Binary" subtitle="Each bit is a Church boolean in a six-bit list." lambda="BITS ≡ CONS TRUE / FALSE">
    <div class="bit-row"><For each={bits()}>{(bit,i)=><button class={`bit${bit?' on':''}`} onClick={()=>toggle(i())}><small>2^{5-i()}</small><b>{bit}</b><code>{bit?'T':'F'}</code></button>}</For></div>
    <div class="equation compact"><strong>{value()}</strong><i>↔</i><span>{bits().join('')}</span></div><Range label="value" min={0} max={63} value={value()} onInput={setValue}/>
  </Shell>;
}

const COMBINATORS={I:['I x','(λx.x) x','x'],K:['K a b','(λa.λb.a) a b','(λb.a) b','a'],S:['S K K x','K x (K x)','x']};
function Combinators(){
  const [kind,setKind]=createSignal('I'),[step,setStep]=createSignal(0),[auto,setAuto]=createSignal(false);let timer;const steps=()=>COMBINATORS[kind()];
  function choose(k){setKind(k);setStep(0);setAuto(false)}createEffect(()=>{clearInterval(timer);if(auto())timer=setInterval(()=>setStep(v=>v>=steps().length-1?0:v+1),850)});onCleanup(()=>clearInterval(timer));
  return <Shell title="Combinators" subtitle="Watch small S, K and I expressions reduce." lambda="I ≡ λx.x   K ≡ λx.λy.x">
    <div class="lab-controls centered"><For each={Object.keys(COMBINATORS)}>{k=><Button active={kind()===k} onClick={()=>choose(k)}>{k}</Button>}</For></div>
    <div class="reduction-stage"><code>{steps()[step()]}</code><span>β {step()} / {steps().length-1}</span></div><div class="step-dots"><For each={steps()}>{(_,i)=><i class={i()===step()?'active':''}/>}</For></div>
    <div class="lab-controls centered"><Button onClick={()=>setStep(v=>Math.max(0,v-1))}>back</Button><Button onClick={()=>setStep(v=>Math.min(steps().length-1,v+1))}>step</Button><Button active={auto()} onClick={()=>setAuto(v=>!v)}>auto</Button></div>
  </Shell>;
}

function makeTree(mode,n){let leaf=0;const nodes=[],edges=[];function walk(k,depth,parent=null){const id=nodes.length,node={id,k,depth,x:0};nodes.push(node);if(parent!==null)edges.push([parent,id]);if((mode==='fact'&&k<=1)||(mode==='fib'&&k<=1)){node.x=leaf++;return id}const left=walk(k-1,depth+1,id);if(mode==='fib'){const right=walk(k-2,depth+1,id);node.x=(nodes[left].x+nodes[right].x)/2}else node.x=nodes[left].x;return id}walk(n,0);return {nodes,edges,leaves:Math.max(1,leaf),depth:Math.max(...nodes.map(x=>x.depth),0)}}
function RecursionTree(){
  const [mode,setMode]=createSignal('fact'),[n,setN]=createSignal(5);const tree=createMemo(()=>makeTree(mode(),n()));
  return <Shell title="Recursion Tree" subtitle="Visualize recursive unfolding like a fixed-point combinator." lambda="Y ≡ λf.(λx.f(xx))(λx.f(xx))">
    <div class="lab-controls centered"><Button active={mode()==='fact'} onClick={()=>{setMode('fact');setN(v=>Math.min(v,7))}}>factorial</Button><Button active={mode()==='fib'} onClick={()=>{setMode('fib');setN(v=>Math.min(v,7))}}>fibonacci</Button></div>
    <svg class="tree-svg" viewBox="0 0 1000 520" preserveAspectRatio="xMidYMid meet"><For each={tree().edges}>{edge=>{const a=tree().nodes[edge[0]],b=tree().nodes[edge[1]],den=Math.max(1,tree().leaves-1),dep=Math.max(1,tree().depth),ax=40+a.x*(920/den),bx=40+b.x*(920/den),ay=45+a.depth*(430/dep),by=45+b.depth*(430/dep);return <line x1={ax} y1={ay} x2={bx} y2={by}/>}}</For><For each={tree().nodes}>{node=>{const x=40+node.x*(920/Math.max(1,tree().leaves-1)),y=45+node.depth*(430/Math.max(1,tree().depth));return <g><circle cx={x} cy={y} r="13"/><text x={x} y={y+4}>{node.k}</text></g>}}</For></svg>
    <Range label="input" min={1} max={mode()==='fib'?7:8} value={n()} onInput={setN}/>
  </Shell>;
}

function nextRule90(row){return row.map((_,i)=>((row[i-1]||0)!==(row[i+1]||0))?1:0)}
function Automata(){
  const size=41,centered=()=>Array.from({length:size},(_,i)=>i===Math.floor(size/2)?1:0);const [rows,setRows]=createSignal([centered()]),[running,setRunning]=createSignal(true);let timer;
  function step(){setRows(old=>[...old,nextRule90(old[old.length-1])].slice(-24))}function reset(){setRows([centered()])}function random(){setRows([Array.from({length:size},()=>Math.random()>.72?1:0)])}
  createEffect(()=>{clearInterval(timer);if(running())timer=setInterval(step,145)});onCleanup(()=>clearInterval(timer));
  return <Shell title="Cellular Automata" subtitle="Rule 90: each cell is XOR(left,right), expressed as Church booleans." lambda="XOR ≡ λp.λq.p (NOT q) q">
    <div class="automata-grid" style={{'grid-template-columns':`repeat(${size},1fr)`}}><For each={rows()}>{row=><For each={row}>{cell=><i class={cell?'on':''}/>}</For>}</For></div>
    <div class="lab-controls centered"><Button active={running()} onClick={()=>setRunning(v=>!v)}>{running()?'pause':'run'}</Button><Button onClick={step}>step</Button><Button onClick={reset}>center</Button><Button onClick={random}>random</Button></div>
  </Shell>;
}

export default function LambdaProject(props){return <Switch fallback={<Counter/>}><Match when={props.id==='counter'}><Counter/></Match><Match when={props.id==='booleans'}><BooleanLab/></Match><Match when={props.id==='arithmetic'}><Arithmetic/></Match><Match when={props.id==='fibonacci'}><Fibonacci/></Match><Match when={props.id==='wave'}><Wave/></Match><Match when={props.id==='binary'}><Binary/></Match><Match when={props.id==='combinators'}><Combinators/></Match><Match when={props.id==='recursion'}><RecursionTree/></Match><Match when={props.id==='automata'}><Automata/></Match></Switch>}
