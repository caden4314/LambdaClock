import {createSignal,onCleanup,onMount} from 'solid-js';
import {DisplayCanvas,HighResCanvas,Oscilloscope,SpectrumDisplay,LambdaSurface,drawDotMatrix,drawPixelGrid,drawScanlines,drawVignette,drawScopeGraticule,drawXYScope,drawFunctionPlot,drawVectorField,withGlow,pulse,clamp,rasterizeDotText,scrollDotRaster,getDisplaySchedulerStats} from './display/index.js';
import './display/display.css';

const TAU=Math.PI*2;
const digitsOf=n=>String(Math.abs(Math.trunc(n))%1_000_000).padStart(6,'0').split('').map(Number);
const dotMessage=rasterizeDotText(' LAMBDA DISPLAY ',{spacing:1,pad:1});
function transitionFor(previous,next,seq){const changed=[];for(let i=5;i>=0;i--)if(previous[i]!==next[i])changed.push(i);const delays={};changed.forEach((index,order)=>delays[index]=order*72);return {seq,changed,delays,special:null,reduction:false,previousDigits:[...previous],nextDigits:[...next],previousDisplay:previous.map(String),nextDisplay:next.map(String),periodChanged:false}}

export default function DisplayLab(){
  const [paused,setPaused]=createSignal(false),[speed,setSpeed]=createSignal(1),[persistence,setPersistence]=createSignal(.82),[glow,setGlow]=createSignal(true),[scanlines,setScanlines]=createSignal(true);
  const [perf,setPerf]=createSignal({hz:60,load:0,active:0});
  const [lambdaDigits,setLambdaDigits]=createSignal(digitsOf(123456)),[lambdaTransition,setLambdaTransition]=createSignal(transitionFor(lambdaDigits(),lambdaDigits(),0));
  let lambdaTimer=0,perfTimer=0,lambdaValue=123456,lambdaSeq=0,matrixStep=-1,matrixRaster=scrollDotRaster(dotMessage,28,0);
  const xyX=new Float32Array(700),xyY=new Float32Array(700);
  const scopeSources=[t=>Math.sin(TAU*55*t*speed())*.72+Math.sin(TAU*165*t*speed())*.12,t=>Math.sin(TAU*55*t*speed()+Math.PI/2)*.46];
  const spectrumSource=t=>Math.sin(TAU*220*t*speed())*.7+Math.sin(TAU*440*t*speed())*.32+Math.sin(TAU*880*t*speed())*.14;
  function finish(ctx,width,height,time){if(scanlines())drawScanlines(ctx,{width,height,spacing:4,alpha:.05,offset:time*10});drawVignette(ctx,{width,height,strength:.3})}

  const matrixScene={render({ctx,width,height,time,quality}){const t=time*speed(),step=Math.floor(t*7);if(step!==matrixStep){matrixStep=step;matrixRaster=scrollDotRaster(dotMessage,28,step)}const q=quality??1,breath=pulse(t,1.15),values=i=>matrixRaster.values[i]?(.72+.28*pulse(t,1.15,(i%matrixRaster.cols)*.025)):0,draw=(style={})=>drawDotMatrix(ctx,{width,height,cols:matrixRaster.cols,rows:matrixRaster.rows,values,radius:.38,gap:.16,offAlpha:.035,pulse:breath,sizeScale:style.sizeScale??1,alphaScale:style.alphaScale??1});glow()?withGlow(ctx,7,draw,{alpha:.28,quality:q,mode:'fast'}):draw();finish(ctx,width,height,t)}};
  const pixelScene={render({ctx,width,height,time,quality}){const t=time*speed(),q=quality??1,cols=q<.68?24:32,rows=q<.68?14:18,values=i=>{const x=(i%cols)/(cols-1),y=Math.floor(i/cols)/(rows-1),dx=x-.5,dy=y-.5,ring=Math.sin(Math.hypot(dx,dy)*34-t*4.1),sweep=Math.sin(x*12+t*2.2)+Math.cos(y*15-t*1.7);return clamp(.5+.28*ring+.13*sweep)},draw=(style={})=>drawPixelGrid(ctx,{width,height,cols,rows,values,gap:1.15,round:1,offAlpha:.02,sizeScale:style.sizeScale??1,alphaScale:style.alphaScale??1});glow()?withGlow(ctx,5,draw,{alpha:.18,quality:q,mode:'fast'}):draw();finish(ctx,width,height,t)}};
  const xyScene={render({ctx,width,height,time,quality}){const t=time*speed(),q=quality??1,n=Math.max(280,Math.min(xyX.length,Math.floor(xyX.length*(.5+.5*q))));for(let i=0;i<n;i++){const p=i/(n-1)*TAU*3;xyX[i]=Math.sin(p*3+t*.7);xyY[i]=Math.sin(p*4+t*.91+.45)}drawScopeGraticule(ctx,{width,height,xDiv:8,yDiv:8,alpha:.045,axisAlpha:.13});const draw=(style={})=>drawXYScope(ctx,{width,height,xSamples:xyX,ySamples:xyY,count:n,lineWidth:1.1,alpha:.88,scale:.42,widthScale:style.widthScale??1,alphaScale:style.alphaScale??1});glow()?withGlow(ctx,8,draw,{alpha:.2,quality:q,mode:'fast'}):draw();finish(ctx,width,height,t)}};
  const highResScene={render({ctx,width,height,time,quality}){const t=time*speed(),q=Math.max(.45,quality??1),cols=Math.round(12+10*q),rows=Math.round(7+6*q),samples=Math.round(480+1320*q);drawVectorField(ctx,(x,y)=>[-y+Math.sin(t*.4)*.25,x+Math.cos(t*.35)*.25],{width,height,xMin:-4,xMax:4,yMin:-2.4,yMax:2.4,cols,rows,alpha:.22,maxLength:.34});const draw=(style={})=>drawFunctionPlot(ctx,x=>Math.sin(x*x*.72-t*.7)*1.15/(1+Math.abs(x)*.08),{width,height,xMin:-4,xMax:4,yMin:-2.4,yMax:2.4,samples,lineWidth:.8,alpha:.95,axes:!style.glow,widthScale:style.widthScale??1,alphaScale:style.alphaScale??1});glow()?withGlow(ctx,5,draw,{alpha:.15,quality:q,mode:'fast'}):draw();finish(ctx,width,height,t)}};

  onMount(()=>{
    lambdaTimer=setInterval(()=>{if(paused())return;const previous=lambdaDigits();lambdaValue=(lambdaValue+1)%1_000_000;const next=digitsOf(lambdaValue);setLambdaTransition(transitionFor(previous,next,++lambdaSeq));setLambdaDigits(next)},850);
    perfTimer=setInterval(()=>{const stats=getDisplaySchedulerStats();setPerf({hz:stats.refreshHz,load:stats.load,active:stats.activeSurfaces})},500);
  });
  onCleanup(()=>{clearInterval(lambdaTimer);clearInterval(perfTimer)});

  return <main class={`display-lab${paused()?' is-paused':''}`}>
    <header class="display-lab-head"><div><small>DISPLAY SYSTEM / PERFORMANCE LAB</small><h1>One renderer. One vsync.</h1><p>Shared scheduling, adaptive resolution, reused signal buffers and blur-free live bloom designed to stay smooth together.</p></div><code>{perf().hz.toFixed(0)} Hz · {perf().active} surfaces · {Math.round(perf().load*100)}% renderer load</code></header>
    <section class="display-controls"><button class={paused()?'active':''} onClick={()=>setPaused(v=>!v)}>{paused()?'RUN':'PAUSE'}</button><label>SPEED <input type="range" min="0.25" max="2.5" step="0.05" value={speed()} onInput={e=>setSpeed(+e.currentTarget.value)}/><span>{speed().toFixed(2)}×</span></label><label>PERSIST <input type="range" min="0" max="0.96" step="0.01" value={persistence()} onInput={e=>setPersistence(+e.currentTarget.value)}/><span>{Math.round(persistence()*100)}%</span></label><button class={glow()?'active':''} onClick={()=>setGlow(v=>!v)}>GLOW</button><button class={scanlines()?'active':''} onClick={()=>setScanlines(v=>!v)}>SCAN</button></section>
    <section class="display-grid">
      <article class="display-card"><header><span>01</span><div><b>DOT MATRIX</b><small>cached raster · intensity animation</small></div></header><div class="display-stage"><DisplayCanvas scene={matrixScene} paused={paused()} persistence={Math.min(.45,persistence()*.45)} label="Animated scrolling dot matrix"/></div></article>
      <article class="display-card"><header><span>02</span><div><b>OSCILLOSCOPE</b><small>2 channel · triggered · typed buffers</small></div></header><div class="display-stage"><Oscilloscope sources={scopeSources} paused={paused()} persistence={persistence()} windowSeconds={.055} triggerLevel={0} pretrigger={.2} glow={glow()} glowMode="fast" scanlines={scanlines()}/></div></article>
      <article class="display-card"><header><span>03</span><div><b>SPECTRUM</b><small>planned FFT · decoupled analysis</small></div></header><div class="display-stage"><SpectrumDisplay source={spectrumSource} paused={paused()} persistence={Math.min(.72,persistence()*.75)} fftSize={1024} sampleRate={4096} maxFrequency={1600} updateHz={30} glow={glow()} glowMode="fast" scanlines={scanlines()}/></div></article>
      <article class="display-card"><header><span>04</span><div><b>PIXEL FIELD</b><small>adaptive grid density</small></div></header><div class="display-stage pixel-stage"><DisplayCanvas scene={pixelScene} paused={paused()} persistence={Math.min(.7,persistence()*.7)} label="Animated pixel field"/></div></article>
      <article class="display-card"><header><span>05</span><div><b>XY SCOPE</b><small>reused phase-space buffers</small></div></header><div class="display-stage"><DisplayCanvas scene={xyScene} paused={paused()} persistence={Math.min(.9,persistence()*.9)} label="Animated XY oscilloscope"/></div></article>
      <article class="display-card high-res-card"><header><span>06</span><div><b>HIGH-RES PLOT</b><small>adaptive 3× target · pixel budget</small></div><em>3×</em></header><div class="display-stage"><HighResCanvas scene={highResScene} paused={paused()} resolutionScale={3} maxDpr={8} maxPixels={1250000} label="High-resolution mathematical plot"/></div></article>
      <article class="display-card display-card-wide"><header><span>07</span><div><b>LAMBDA SURFACE</b><small>Tromp renderer adapter</small></div></header><div class="display-stage lambda-stage"><LambdaSurface digits={lambdaDigits()} transition={lambdaTransition()}/></div></article>
    </section>
  </main>;
}
