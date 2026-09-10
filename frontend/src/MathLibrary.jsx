import {createSignal,onMount,Show} from 'solid-js';
import {runAlu,runArithmeticShift,runCordicSinCos} from './lambda-math/library.js';

const clamp16=n=>Math.max(-32768,Math.min(32767,Math.trunc(Number(n)||0)));
const fmt=n=>Number(n).toFixed(7);
const hex=n=>'0x'+Number(n).toString(16).toUpperCase().padStart(4,'0');

function Stat(props){return <div class="math-stat"><small>{props.label}</small><b>{props.value}</b></div>}
function BinaryWord(props){return <div class="binary-word" aria-label={`${props.label} ${props.word.binary}`}><small>{props.label}</small><code>{props.word.binary}</code><span>{props.word.signed} · {hex(props.word.unsigned)}</span></div>}

export default function MathLibrary(){
  const [mode,setMode]=createSignal('cordic');
  const [angle,setAngle]=createSignal(30),[iterations,setIterations]=createSignal(12);
  const [cordic,setCordic]=createSignal(null),[cordicMs,setCordicMs]=createSignal(0);
  const [op,setOp]=createSignal('add'),[a,setA]=createSignal(12),[b,setB]=createSignal(7),[alu,setAlu]=createSignal(null),[aluMs,setAluMs]=createSignal(0);

  function runCordic(){
    const start=performance.now();
    const out=runCordicSinCos(angle()*Math.PI/180,{iterations:iterations()});
    setCordic(out);setCordicMs(performance.now()-start);
  }
  function runWord(){
    const start=performance.now();
    const out=op()==='sar'?runArithmeticShift(clamp16(a()),Math.max(0,Math.min(15,Math.trunc(b())))):runAlu(op(),clamp16(a()),clamp16(b()));
    setAlu(out);setAluMs(performance.now()-start);
  }
  onMount(()=>{runCordic();runWord()});

  return <main class="math-page">
    <header class="math-head">
      <div><h1>Lambda Math Library</h1><p>Real untyped lambda-calculus arithmetic, reduced to normal computational values rather than simulated with host math.</p></div>
      <code>16-bit · Q2.13 · call-by-need β reduction</code>
    </header>

    <div class="math-tabs" role="tablist" aria-label="Math library module">
      <button class={mode()==='cordic'?'active':''} onClick={()=>setMode('cordic')}>CORDIC</button>
      <button class={mode()==='alu'?'active':''} onClick={()=>setMode('alu')}>WORD / ALU</button>
    </div>

    <Show when={mode()==='cordic'} fallback={
      <section class="math-workbench">
        <div class="math-module-head"><div><small>λWORD16</small><h2>Binary arithmetic core</h2></div><code>bits = Church TRUE / FALSE</code></div>
        <div class="alu-op-row">
          {['add','sub','neg','sar'].map(name=><button class={op()===name?'active':''} onClick={()=>setOp(name)}>{name.toUpperCase()}</button>)}
        </div>
        <div class="math-input-grid"><label>A<input type="number" value={a()} min="-32768" max="32767" onInput={e=>setA(clamp16(e.currentTarget.value))}/></label><label>{op()==='sar'?'SHIFT':'B'}<input type="number" value={b()} min={op()==='sar'?0:-32768} max={op()==='sar'?15:32767} onInput={e=>setB(+e.currentTarget.value)}/></label></div>
        <button class="math-run" onClick={runWord}>reduce λ term</button>
        <Show when={alu()}><div class="math-stats"><Stat label="result" value={alu().signed}/><Stat label="β applications" value={alu().beta.toLocaleString()}/><Stat label="runtime" value={`${aluMs().toFixed(2)} ms`}/><Stat label="AST nodes" value={alu().nodes.toLocaleString()}/></div><BinaryWord label="RESULT WORD" word={alu()}/></Show>
        <div class="math-source"><small>lambda construction</small><code>FULLADD ≡ λa.λb.λc. PAIR (XOR (XOR a b) c) (OR (AND a b) (AND c (XOR a b)))</code><code>ADD16 ≡ ripple FULLADD from bit 15 → bit 0</code><code>NEG16 w ≡ ADD16 (NOT16 w) 0000000000000001</code></div>
      </section>
    }>
      <section class="math-workbench">
        <div class="math-module-head"><div><small>λCORDIC / circular rotation</small><h2>Shift-add trigonometry</h2></div><code>x,y,z → x′,y′,z′</code></div>
        <div class="math-input-grid"><label>ANGLE °<input type="number" value={angle()} min="-90" max="90" step="1" onInput={e=>setAngle(Math.max(-90,Math.min(90,+e.currentTarget.value||0)))}/></label><label>ITERATIONS<input type="number" value={iterations()} min="1" max="12" onInput={e=>setIterations(Math.max(1,Math.min(12,Math.trunc(+e.currentTarget.value||1))))}/></label></div>
        <input class="math-angle-range" type="range" min="-90" max="90" step="1" value={angle()} onInput={e=>setAngle(+e.currentTarget.value)}/>
        <button class="math-run" onClick={runCordic}>run λ CORDIC</button>
        <Show when={cordic()}>
          <div class="cordic-result"><div><small>SIN</small><b>{fmt(cordic().sin)}</b></div><div><small>COS</small><b>{fmt(cordic().cos)}</b></div></div>
          <div class="math-stats"><Stat label="β applications" value={cordic().beta.toLocaleString()}/><Stat label="runtime" value={`${cordicMs().toFixed(2)} ms`}/><Stat label="residual z" value={fmt(cordic().residual)}/><Stat label="AST nodes" value={cordic().nodes.toLocaleString()}/></div>
          <div class="register-grid"><BinaryWord label="X / COS" word={cordic().x}/><BinaryWord label="Y / SIN" word={cordic().y}/><BinaryWord label="Z / RESIDUAL" word={cordic().z}/></div>
        </Show>
        <div class="math-source"><small>real recurrence used by the lambda program</small><code>xᵢ₊₁ = xᵢ − dᵢ · (yᵢ ≫ i)</code><code>yᵢ₊₁ = yᵢ + dᵢ · (xᵢ ≫ i)</code><code>zᵢ₊₁ = zᵢ − dᵢ · atan(2⁻ⁱ)</code><p>dᵢ is selected from the sign of z using a Church boolean. Each add, subtract, sign test and shift is a lambda term.</p></div>
      </section>
    </Show>
  </main>;
}
