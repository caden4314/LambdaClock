import {createSignal,onCleanup,onMount} from 'solid-js';
import {PhosphorCRTDisplay,LambdaSurface,cubeBeamPath,exponentialSmoothing} from './display/index.js';
import './lambda-cube.css';

const axisName=['X','Y','Z'];
const identity=()=>[[1,0,0],[0,1,0],[0,0,1]];
const initialMetrics={seq:0,raw:[0,0,0],angles:[0,0,0],basis:identity(),basisRaw:[[8192,0,0],[0,8192,0],[0,0,8192]],vectorBeta:[0,0,0],basisBeta:0,angleBeta:0,residualMax:0,computeMs:0,totalBeta:0};
function stateDigits(raw){return raw.flatMap(value=>String(Math.min(99,Math.round(Math.abs(value)/11633*99))).padStart(2,'0').split('').map(Number))}
function transitionFor(previous,next,seq){
  const changed=[];for(let i=5;i>=0;i--)if(previous[i]!==next[i])changed.push(i);const delays={};changed.forEach((index,order)=>delays[index]=order*45);
  return {seq,changed,delays,special:null,reduction:false,previousDigits:[...previous],nextDigits:[...next],previousDisplay:previous.map(String),nextDisplay:next.map(String),periodChanged:false};
}
const fixed=value=>Number(value||0).toFixed(5),vectorText=vector=>`[${(vector||[]).map(value=>Number(value||0).toFixed(3)).join(', ')}]`;

export default function LambdaCube(){
  const [paused,setPaused]=createSignal(false),[speed,setSpeed]=createSignal(1),[beamRate,setBeamRate]=createSignal(3.2),[beamCurrent,setBeamCurrent]=createSignal(1.75),[persistence,setPersistence]=createSignal(1),[phosphor,setPhosphor]=createSignal('P7'),[blankRetrace,setBlankRetrace]=createSignal(true),[metrics,setMetrics]=createSignal(initialMetrics);
  const [lambdaDigits,setLambdaDigits]=createSignal([0,0,0,0,0,0]),[lambdaTransition,setLambdaTransition]=createSignal(transitionFor([0,0,0,0,0,0],[0,0,0,0,0,0],0));
  let worker=null,lambdaSeq=0,crtApi=null;const targetBasis=identity(),currentBasis=identity();
  function cubePath(frame){
    const response=Math.max(5,10*(frame.quality??1));for(let c=0;c<3;c++)for(let r=0;r<3;r++)currentBasis[c][r]=exponentialSmoothing(currentBasis[c][r],targetBasis[c][r],frame.dt,response);
    return cubeBeamPath(currentBasis,{width:frame.width,height:frame.height,distance:4.8,scale:.235,blankRetrace:blankRetrace()});
  }
  function applyState(data){
    for(let c=0;c<3;c++)for(let r=0;r<3;r++)targetBasis[c][r]=data.basis?.[c]?.[r]??targetBasis[c][r];setMetrics(data);
    const previous=lambdaDigits(),next=stateDigits(data.raw);setLambdaTransition(transitionFor(previous,next,++lambdaSeq));setLambdaDigits(next);
  }
  onMount(()=>{worker=new Worker(new URL('./lambdaCube.worker.js',import.meta.url),{type:'module'});worker.onmessage=event=>{if(event.data?.type==='state')applyState(event.data)}});onCleanup(()=>worker?.terminate());
  function togglePause(){const next=!paused();setPaused(next);worker?.postMessage({type:'pause',value:next})}
  function changeSpeed(value){setSpeed(value);worker?.postMessage({type:'speed',value})}
  function reset(){worker?.postMessage({type:'reset'});crtApi?.reset?.();const base=identity();for(let c=0;c<3;c++)for(let r=0;r<3;r++){currentBasis[c][r]=base[c][r];targetBasis[c][r]=base[c][r]}}

  return <main class="cube-project">
    <header class="cube-head"><div><small>LAMBDA COMPUTER / PHYSICAL VECTOR CRT</small><h1>Lambda Cube</h1><p>Pure Lambda fixed-point CORDIC rotates the 3D basis. A GPU phosphor model simulates analog X/Y deflection, beam dwell, blanking, P7/P31 emission, persistence traps, grain and CRT glass.</p></div><code>{metrics().totalBeta.toLocaleString()} β · {metrics().computeMs.toFixed(0)} ms basis</code></header>
    <section class="cube-controls">
      <button class={paused()?'active':''} onClick={togglePause}>{paused()?'RUN':'PAUSE'}</button>
      <label>ROTATE <input type="range" min="0.2" max="3" step="0.1" value={speed()} onInput={e=>changeSpeed(+e.currentTarget.value)}/><span>{speed().toFixed(1)}×</span></label>
      <label>BEAM <input type="range" min="0.5" max="8" step="0.1" value={beamRate()} onInput={e=>setBeamRate(+e.currentTarget.value)}/><span>{beamRate().toFixed(1)}×</span></label>
      <label>CURRENT <input type="range" min="0.25" max="3" step="0.05" value={beamCurrent()} onInput={e=>setBeamCurrent(+e.currentTarget.value)}/><span>{beamCurrent().toFixed(2)}</span></label>
      <label>PERSIST <input type="range" min="0.25" max="2.5" step="0.05" value={persistence()} onInput={e=>setPersistence(+e.currentTarget.value)}/><span>{persistence().toFixed(2)}×</span></label>
      <button class={phosphor()==='P7'?'active':''} onClick={()=>setPhosphor(p=>p==='P7'?'P31':'P7')}>{phosphor()}</button>
      <button class={blankRetrace()?'active':''} onClick={()=>setBlankRetrace(v=>!v)}>BLANK RETRACE</button><button onClick={reset}>RESET</button>
    </section>
    <section class="cube-layout">
      <article class="cube-panel cube-xy"><header><span>XY</span><div><b>{phosphor()} PHOSPHOR VECTOR CRT</b><small>single analog beam · multi-reservoir afterglow · velocity-sensitive excitation</small></div></header><div class="cube-stage"><PhosphorCRTDisplay path={cubePath} latchPath={true} paused={paused()} model={phosphor()} beamRate={beamRate()} beamCurrent={beamCurrent()} persistenceScale={persistence()} maxPixels={1_250_000} onReady={api=>crtApi=api} label="Lambda-driven 3D cube traced by a physical phosphor CRT model"/></div></article>
      <article class="cube-panel cube-lambda"><header><span>λ</span><div><b>LIVE LAMBDA STATE</b><small>Church-encoded angle registers feeding the CORDIC worker</small></div></header><div class="cube-lambda-stage"><LambdaSurface digits={lambdaDigits()} transition={lambdaTransition()}/></div></article>
    </section>
    <section class="cube-math">
      <div class="cube-formula"><small>ACTUAL LAMBDA + CRT PIPELINE</small><code>θ′ = ADD16 θ Δθ</code><code>CORDICλ(x,y,θ): SIGN + SAR + ADD/SUB</code><code>Bλ = Rzλ · Ryλ · Rxλ · I</code><code>beam X/Y: damped 2nd-order deflection + slew limit</code><code>dose ∝ beamCurrent / beamVelocity; spot blooms with dose</code><code>P7: four decay reservoirs → blue-white flash + yellow-green long tail</code></div>
      <div class="cube-registers">{axisName.map((name,i)=><div class="cube-register"><span>{name} / BASIS COLUMN</span><b>{(metrics().angles[i]??0).toFixed(4)} rad</b><small>B{name.toLowerCase()} {vectorText(metrics().basis?.[i])}</small><small>{(metrics().vectorBeta?.[i]??0).toLocaleString()} β vector</small><small>max residual {fixed(metrics().residualMax)}</small><small>{metrics().basisBeta.toLocaleString()} β / basis</small><code>θ raw {metrics().raw?.[i]??0} / Q2.13</code></div>)}</div>
    </section>
  </main>;
}
