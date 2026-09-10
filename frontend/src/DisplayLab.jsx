import {createSignal,onCleanup,onMount} from 'solid-js';
import {DisplayCanvas,LambdaSurface,drawDotMatrix,drawPixelGrid,drawWave,drawGrid,drawScanlines,drawVignette,withGlow,pulse,sampleWave,clamp} from './display/index.js';

const digitsOf=n=>String(Math.abs(Math.trunc(n))%1_000_000).padStart(6,'0').split('').map(Number);
function transitionFor(previous,next,seq){
  const changed=[];for(let i=5;i>=0;i--)if(previous[i]!==next[i])changed.push(i);
  const delays={};changed.forEach((index,order)=>delays[index]=order*72);
  return {seq,changed,delays,special:null,reduction:false,previousDigits:[...previous],nextDigits:[...next],previousDisplay:previous.map(String),nextDisplay:next.map(String),periodChanged:false};
}

export default function DisplayLab(){
  const [paused,setPaused]=createSignal(false),[speed,setSpeed]=createSignal(1),[persistence,setPersistence]=createSignal(.82),[glow,setGlow]=createSignal(true),[scanlines,setScanlines]=createSignal(true);
  const [lambdaDigits,setLambdaDigits]=createSignal(digitsOf(123456));
  const [lambdaTransition,setLambdaTransition]=createSignal(transitionFor(lambdaDigits(),lambdaDigits(),0));
  let lambdaTimer=0,lambdaValue=123456,lambdaSeq=0;

  function finish(ctx,width,height,time){if(scanlines())drawScanlines(ctx,{width,height,spacing:4,alpha:.05,offset:time*10});drawVignette(ctx,{width,height,strength:.3})}
  const matrixScene={render({ctx,width,height,time}){
    const t=time*speed(),cols=24,rows=10;
    const values=(i)=>{const x=i%cols,y=Math.floor(i/cols),target=(rows-1)*(.5+.32*Math.sin(t*1.6+x*.43));const d=Math.abs(y-target);return clamp(Math.exp(-d*d*.8)*(.7+.3*pulse(t,1.1,x*.018)))};
    const draw=()=>drawDotMatrix(ctx,{width,height,cols,rows,values,radius:.36,gap:.18,offAlpha:.04,pulse:pulse(t,.7)});glow()?withGlow(ctx,7,draw,{alpha:.28}):draw();finish(ctx,width,height,t);
  }};
  const waveScene={render({ctx,width,height,time}){
    const t=time*speed();drawGrid(ctx,{width,height,xDiv:10,yDiv:4,alpha:.07});
    const a=sampleWave((x)=>Math.sin(x*Math.PI*4+t*2.6)*.72+Math.sin(x*Math.PI*11-t*1.3)*.18,360);
    const b=sampleWave((x)=>Math.sin(x*Math.PI*2-t*1.7)*.38,360);
    const draw=()=>{drawWave(ctx,{width,height,samples:a,lineWidth:1.55,amplitude:.38,alpha:.95});drawWave(ctx,{width,height,samples:b,lineWidth:1,amplitude:.38,alpha:.34})};glow()?withGlow(ctx,9,draw,{alpha:.22}):draw();finish(ctx,width,height,t);
  }};
  const pixelScene={render({ctx,width,height,time}){
    const t=time*speed(),cols=32,rows=18;
    const values=(i)=>{const x=(i%cols)/(cols-1),y=Math.floor(i/cols)/(rows-1),dx=x-.5,dy=y-.5;const ring=Math.sin(Math.hypot(dx,dy)*34-t*4.1),sweep=Math.sin(x*12+t*2.2)+Math.cos(y*15-t*1.7);return clamp(.5+.28*ring+.13*sweep)};
    const draw=()=>drawPixelGrid(ctx,{width,height,cols,rows,values,gap:1.15,round:1,offAlpha:.02});glow()?withGlow(ctx,5,draw,{alpha:.18}):draw();finish(ctx,width,height,t);
  }};

  onMount(()=>{lambdaTimer=setInterval(()=>{if(paused())return;const previous=lambdaDigits();lambdaValue=(lambdaValue+1)%1_000_000;const next=digitsOf(lambdaValue);setLambdaTransition(transitionFor(previous,next,++lambdaSeq));setLambdaDigits(next)},850)});
  onCleanup(()=>clearInterval(lambdaTimer));

  return <main class={`display-lab${paused()?' is-paused':''}`}>
    <header class="display-lab-head"><div><small>DISPLAY SYSTEM / EXAMPLE</small><h1>One renderer. Many surfaces.</h1><p>Reusable high-DPI canvases, persistent trails, effects and Lambda visualization for future math projects.</p></div><code>RAF · DPR · visibility aware · composable effects</code></header>
    <section class="display-controls">
      <button class={paused()?'active':''} onClick={()=>setPaused(v=>!v)}>{paused()?'RUN':'PAUSE'}</button>
      <label>SPEED <input type="range" min="0.25" max="2.5" step="0.05" value={speed()} onInput={e=>setSpeed(+e.currentTarget.value)}/><span>{speed().toFixed(2)}×</span></label>
      <label>PERSIST <input type="range" min="0" max="0.96" step="0.01" value={persistence()} onInput={e=>setPersistence(+e.currentTarget.value)}/><span>{Math.round(persistence()*100)}%</span></label>
      <button class={glow()?'active':''} onClick={()=>setGlow(v=>!v)}>GLOW</button><button class={scanlines()?'active':''} onClick={()=>setScanlines(v=>!v)}>SCAN</button>
    </section>
    <section class="display-grid">
      <article class="display-card"><header><span>01</span><div><b>DOT MATRIX</b><small>intensity + size field</small></div></header><div class="display-stage"><DisplayCanvas scene={matrixScene} paused={paused()} persistence={Math.min(.45,persistence()*.45)} label="Animated dot matrix"/></div></article>
      <article class="display-card"><header><span>02</span><div><b>WAVE SCOPE</b><small>anti-aliased trace + persistence</small></div></header><div class="display-stage"><DisplayCanvas scene={waveScene} paused={paused()} persistence={persistence()} label="Animated waveform oscilloscope"/></div></article>
      <article class="display-card"><header><span>03</span><div><b>PIXEL FIELD</b><small>32 × 18 intensity surface</small></div></header><div class="display-stage pixel-stage"><DisplayCanvas scene={pixelScene} paused={paused()} persistence={Math.min(.7,persistence()*.7)} label="Animated pixel field"/></div></article>
      <article class="display-card"><header><span>04</span><div><b>LAMBDA SURFACE</b><small>Tromp renderer adapter</small></div></header><div class="display-stage lambda-stage"><LambdaSurface digits={lambdaDigits()} transition={lambdaTransition()}/></div></article>
    </section>
  </main>;
}
