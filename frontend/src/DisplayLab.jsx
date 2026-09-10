import {createSignal,onCleanup,onMount} from 'solid-js';
import {DisplayCanvas,HighResCanvas,Oscilloscope,SpectrumDisplay,LambdaSurface,drawDotMatrix,drawPixelGrid,drawScanlines,drawVignette,drawScopeGraticule,drawXYScope,drawFunctionPlot,drawVectorField,withGlow,pulse,clamp,rasterizeDotText,scrollDotRaster} from './display/index.js';
import './display/display.css';

const TAU=Math.PI*2;
const digitsOf=n=>String(Math.abs(Math.trunc(n))%1_000_000).padStart(6,'0').split('').map(Number);
const dotMessage=rasterizeDotText(' LAMBDA DISPLAY ',{spacing:1,pad:1});
function transitionFor(previous,next,seq){const changed=[];for(let i=5;i>=0;i--)if(previous[i]!==next[i])changed.push(i);const delays={};changed.forEach((index,order)=>delays[index]=order*72);return {seq,changed,delays,special:null,reduction:false,previousDigits:[...previous],nextDigits:[...next],previousDisplay:previous.map(String),nextDisplay:next.map(String),periodChanged:false}}

export default function DisplayLab(){
  const [paused,setPaused]=createSignal(false),[speed,setSpeed]=createSignal(1),[persistence,setPersistence]=createSignal(.82),[glow,setGlow]=createSignal(true),[scanlines,setScanlines]=createSignal(true);
  const [lambdaDigits,setLambdaDigits]=createSignal(digitsOf(123456)),[lambdaTransition,setLambdaTransition]=createSignal(transitionFor(lambdaDigits(),lambdaDigits(),0));
  let lambdaTimer=0,lambdaValue=123456,lambdaSeq=0;
  const scopeSources=[t=>Math.sin(TAU*55*t*speed())*.72+Math.sin(TAU*165*t*speed())*.12,t=>Math.sin(TAU*55*t*speed()+Math.PI/2)*.46];
  const spectrumSource=t=>Math.sin(TAU*220*t*speed())*.7+Math.sin(TAU*440*t*speed())*.32+Math.sin(TAU*880*t*speed())*.14;
  function finish(ctx,width,height,time){if(scanlines())drawScanlines(ctx,{width,height,spacing:4,alpha:.05,offset:time*10});drawVignette(ctx,{width,height,strength:.3})}

  const matrixScene={render({ctx,width,height,time}){const t=time*speed(),scroll=scrollDotRaster(dotMessage,28,Math.floor(t*7)),values=scroll.values.map((v,i)=>v?(.72+.28*pulse(t,1.15,(i%scroll.cols)*.025)):0),draw=()=>drawDotMatrix(ctx,{width,height,cols:scroll.cols,rows:scroll.rows,values,radius:.38,gap:.16,offAlpha:.035,pulse:pulse(t,.7)});glow()?withGlow(ctx,7,draw,{alpha:.28}):draw();finish(ctx,width,height,t)}};
  const pixelScene={render({ctx,width,height,time}){const t=time*speed(),cols=32,rows=18,values=i=>{const x=(i%cols)/(cols-1),y=Math.floor(i/cols)/(rows-1),dx=x-.5,dy=y-.5,ring=Math.sin(Math.hypot(dx,dy)*34-t*4.1),sweep=Math.sin(x*12+t*2.2)+Math.cos(y*15-t*1.7);return clamp(.5+.28*ring+.13*sweep)},draw=()=>drawPixelGrid(ctx,{width,height,cols,rows,values,gap:1.15,round:1,offAlpha:.02});glow()?withGlow(ctx,5,draw,{alpha:.18}):draw();finish(ctx,width,height,t)}};
  const xyScene={render({ctx,width,height,time}){const t=time*speed(),n=700,xs=new Array(n),ys=new Array(n);for(let i=0;i<n;i++){const p=i/(n-1)*TAU*3;xs[i]=Math.sin(p*3+t*.7);ys[i]=Math.sin(p*4+t*.91+.45)}drawScopeGraticule(ctx,{width,height,xDiv:8,yDiv:8,alpha:.045,axisAlpha:.13});const draw=()=>drawXYScope(ctx,{width,height,xSamples:xs,ySamples:ys,lineWidth:1.1,alpha:.88,scale:.42});glow()?withGlow(ctx,8,draw,{alpha:.2}):draw();finish(ctx,width,height,t)}};
  const highResScene={render({ctx,width,height,time}){const t=time*speed();drawVectorField(ctx,(x,y)=>[-y+Math.sin(t*.4)*.25,x+Math.cos(t*.35)*.25],{width,height,xMin:-4,xMax:4,yMin:-2.4,yMax:2.4,cols:22,rows:12,alpha:.22,maxLength:.34});const draw=()=>drawFunctionPlot(ctx,x=>Math.sin(x*x*.72-t*.7)*1.15/(1+Math.abs(x)*.08),{width,height,xMin:-4,xMax:4,yMin:-2.4,yMax:2.4,samples:1800,lineWidth:.8,alpha:.95,axes:true});glow()?withGlow(ctx,5,draw,{alpha:.15}):draw();finish(ctx,width,height,t)}};

  onMount(()=>{lambdaTimer=setInterval(()=>{if(paused())return;const previous=lambdaDigits();lambdaValue=(lambdaValue+1)%1_000_000;const next=digitsOf(lambdaValue);setLambdaTransition(transitionFor(previous,next,++lambdaSeq));setLambdaDigits(next)},850)});onCleanup(()=>clearInterval(lambdaTimer));

  return <main class={`display-lab${paused()?' is-paused':''}`}>
    <header class="display-lab-head"><div><small>DISPLAY SYSTEM / EXAMPLE</small><h1>One renderer. Many surfaces.</h1><p>High-resolution canvases, instrument displays, persistent trails, plots, pixels and Lambda visualization for future math projects.</p></div><code>RAF · DPR · hi-res · trigger · FFT · composable effects</code></header>
    <section class="display-controls"><button class={paused()?'active':''} onClick={()=>setPaused(v=>!v)}>{paused()?'RUN':'PAUSE'}</button><label>SPEED <input type="range" min="0.25" max="2.5" step="0.05" value={speed()} onInput={e=>setSpeed(+e.currentTarget.value)}/><span>{speed().toFixed(2)}×</span></label><label>PERSIST <input type="range" min="0" max="0.96" step="0.01" value={persistence()} onInput={e=>setPersistence(+e.currentTarget.value)}/><span>{Math.round(persistence()*100)}%</span></label><button class={glow()?'active':''} onClick={()=>setGlow(v=>!v)}>GLOW</button><button class={scanlines()?'active':''} onClick={()=>setScanlines(v=>!v)}>SCAN</button></section>
    <section class="display-grid">
      <article class="display-card"><header><span>01</span><div><b>DOT MATRIX</b><small>5 × 7 text raster + intensity</small></div></header><div class="display-stage"><DisplayCanvas scene={matrixScene} paused={paused()} persistence={Math.min(.45,persistence()*.45)} label="Animated scrolling dot matrix"/></div></article>
      <article class="display-card"><header><span>02</span><div><b>OSCILLOSCOPE</b><small>2 channel · triggered · persistent</small></div></header><div class="display-stage"><Oscilloscope sources={scopeSources} paused={paused()} persistence={persistence()} windowSeconds={.055} triggerLevel={0} pretrigger={.2} glow={glow()} scanlines={scanlines()}/></div></article>
      <article class="display-card"><header><span>03</span><div><b>SPECTRUM</b><small>radix-2 FFT · Hann window</small></div></header><div class="display-stage"><SpectrumDisplay source={spectrumSource} paused={paused()} persistence={Math.min(.72,persistence()*.75)} fftSize={1024} sampleRate={4096} maxFrequency={1600} glow={glow()} scanlines={scanlines()}/></div></article>
      <article class="display-card"><header><span>04</span><div><b>PIXEL FIELD</b><small>32 × 18 intensity surface</small></div></header><div class="display-stage pixel-stage"><DisplayCanvas scene={pixelScene} paused={paused()} persistence={Math.min(.7,persistence()*.7)} label="Animated pixel field"/></div></article>
      <article class="display-card"><header><span>05</span><div><b>XY SCOPE</b><small>Lissajous / phase-space surface</small></div></header><div class="display-stage"><DisplayCanvas scene={xyScene} paused={paused()} persistence={Math.min(.9,persistence()*.9)} label="Animated XY oscilloscope"/></div></article>
      <article class="display-card high-res-card"><header><span>06</span><div><b>HIGH-RES PLOT</b><small>3× supersampled function + vector field</small></div><em>3×</em></header><div class="display-stage"><HighResCanvas scene={highResScene} paused={paused()} resolutionScale={3} maxDpr={8} label="High-resolution mathematical plot"/></div></article>
      <article class="display-card display-card-wide"><header><span>07</span><div><b>LAMBDA SURFACE</b><small>Tromp renderer adapter</small></div></header><div class="display-stage lambda-stage"><LambdaSurface digits={lambdaDigits()} transition={lambdaTransition()}/></div></article>
    </section>
  </main>;
}
