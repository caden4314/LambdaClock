import {createSignal,onCleanup,onMount} from 'solid-js';
import {DisplayCanvas,LambdaSurface,drawScopeGraticule,drawWireCube,withGlow,drawVignette,exponentialSmoothing} from './display/index.js';
import './lambda-cube.css';

const axisName=['X','Y','Z'];
const initialMetrics={seq:0,raw:[0,0,0],angles:[0,0,0],sin:[0,0,0],cos:[1,1,1],residual:[0,0,0],beta:[0,0,0],computeMs:[0,0,0],totalBeta:0};
function stateDigits(raw){return raw.flatMap(value=>String(Math.min(99,Math.round(Math.abs(value)/11633*99))).padStart(2,'0').split('').map(Number))}
function transitionFor(previous,next,seq){
  const changed=[];for(let i=5;i>=0;i--)if(previous[i]!==next[i])changed.push(i);
  const delays={};changed.forEach((index,order)=>delays[index]=order*45);
  return {seq,changed,delays,special:null,reduction:false,previousDigits:[...previous],nextDigits:[...next],previousDisplay:previous.map(String),nextDisplay:next.map(String),periodChanged:false};
}
const fixed=value=>Number(value||0).toFixed(5);

export default function LambdaCube(){
  const [paused,setPaused]=createSignal(false),[speed,setSpeed]=createSignal(1),[glow,setGlow]=createSignal(true),[trails,setTrails]=createSignal(true),[metrics,setMetrics]=createSignal(initialMetrics);
  const [lambdaDigits,setLambdaDigits]=createSignal([0,0,0,0,0,0]),[lambdaTransition,setLambdaTransition]=createSignal(transitionFor([0,0,0,0,0,0],[0,0,0,0,0,0],0));
  let worker=null,lambdaSeq=0;
  const target={sinX:0,cosX:1,sinY:0,cosY:1,sinZ:0,cosZ:1},current={...target};

  const cubeScene={render({ctx,width,height,dt,quality}){
    const response=Math.max(5,11*(quality??1));
    for(const key of Object.keys(current))current[key]=exponentialSmoothing(current[key],target[key],dt,response);
    drawScopeGraticule(ctx,{width,height,xDiv:10,yDiv:8,alpha:.035,axisAlpha:.11});
    const draw=(style={})=>drawWireCube(ctx,{width,height,rotation:current,distance:4.7,scale:.29,lineWidth:1.25,widthScale:style.widthScale??1,alphaScale:style.alphaScale??1});
    glow()?withGlow(ctx,7,draw,{alpha:.2,quality:quality??1,mode:'fast'}):draw();drawVignette(ctx,{width,height,strength:.22});
  }};

  function applyState(data){
    target.sinX=data.sin[0];target.cosX=data.cos[0];target.sinY=data.sin[1];target.cosY=data.cos[1];target.sinZ=data.sin[2];target.cosZ=data.cos[2];setMetrics(data);
    const previous=lambdaDigits(),next=stateDigits(data.raw);setLambdaTransition(transitionFor(previous,next,++lambdaSeq));setLambdaDigits(next);
  }

  onMount(()=>{worker=new Worker(new URL('./lambdaCube.worker.js',import.meta.url),{type:'module'});worker.onmessage=event=>{if(event.data?.type==='state')applyState(event.data)}});
  onCleanup(()=>worker?.terminate());
  function togglePause(){const next=!paused();setPaused(next);worker?.postMessage({type:'pause',value:next})}
  function changeSpeed(value){setSpeed(value);worker?.postMessage({type:'speed',value})}
  function reset(){worker?.postMessage({type:'reset'});Object.assign(current,{sinX:0,cosX:1,sinY:0,cosY:1,sinZ:0,cosZ:1});Object.assign(target,current)}

  return <main class="cube-project">
    <header class="cube-head"><div><small>LAMBDA COMPUTER / 3D PROJECTION</small><h1>Lambda Cube</h1><p>One real Lambda computation drives three CORDIC rotations. The XY surface only projects the resulting 3D state.</p></div><code>{metrics().totalBeta.toLocaleString()} β</code></header>
    <section class="cube-controls"><button class={paused()?'active':''} onClick={togglePause}>{paused()?'RUN':'PAUSE'}</button><label>SPEED <input type="range" min="0.2" max="3" step="0.1" value={speed()} onInput={e=>changeSpeed(+e.currentTarget.value)}/><span>{speed().toFixed(1)}×</span></label><button class={glow()?'active':''} onClick={()=>setGlow(v=>!v)}>GLOW</button><button class={trails()?'active':''} onClick={()=>setTrails(v=>!v)}>TRAIL</button><button onClick={reset}>RESET</button></section>
    <section class="cube-layout">
      <article class="cube-panel cube-xy"><header><span>XY</span><div><b>3D CUBE PROJECTION</b><small>Lambda CORDIC → rotation matrix → perspective</small></div></header><div class="cube-stage"><DisplayCanvas scene={cubeScene} paused={paused()} persistence={trails() ? .76 : 0} maxPixels={1250000} label="Lambda-driven rotating 3D cube on XY display"/></div></article>
      <article class="cube-panel cube-lambda"><header><span>λ</span><div><b>LIVE LAMBDA STATE</b><small>three fixed-point angle registers encoded as Church state</small></div></header><div class="cube-lambda-stage"><LambdaSurface digits={lambdaDigits()} transition={lambdaTransition()}/></div></article>
    </section>
    <section class="cube-math">
      <div class="cube-formula"><small>ACTUAL LAMBDA PIPELINE</small><code>θ′ = ADD16 θ Δθ</code><code>dᵢ = SIGN zᵢ</code><code>xᵢ₊₁ = IF dᵢ (ADD x (SAR y i)) (SUB x (SAR y i))</code><code>yᵢ₊₁ = IF dᵢ (SUB y (SAR x i)) (ADD y (SAR x i))</code><code>zᵢ₊₁ = IF dᵢ (ADD z atanᵢ) (SUB z atanᵢ)</code></div>
      <div class="cube-registers">{axisName.map((name,i)=><div class="cube-register"><span>{name}</span><b>{(metrics().angles[i]??0).toFixed(4)} rad</b><small>sin {fixed(metrics().sin[i])}</small><small>cos {fixed(metrics().cos[i])}</small><small>res {fixed(metrics().residual[i])}</small><small>{(metrics().beta[i]??0).toLocaleString()} β · {(metrics().computeMs[i]??0).toFixed(1)} ms</small><code>{metrics().raw[i]??0} / Q2.13</code></div>)}</div>
    </section>
  </main>;
}
