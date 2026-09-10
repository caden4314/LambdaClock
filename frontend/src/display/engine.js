export const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));
export const lerp=(a,b,t)=>a+(b-a)*t;

function now(){return globalThis.performance?.now?.()??Date.now()}

export function createDisplayRuntime(canvas,options={}){
  if(!canvas)throw new Error('display runtime requires a canvas');
  const ctx=canvas.getContext('2d',{alpha:true,desynchronized:true});
  if(!ctx)throw new Error('2D canvas unavailable');
  const state={scene:null,running:false,destroyed:false,visible:true,pageVisible:!globalThis.document?.hidden,width:1,height:1,dpr:1,last:now(),elapsed:0,frame:0,fps:0,options:{background:'#000',persistence:0,maxDpr:2.5,resolutionScale:1,paused:false,...options}};
  let raf=0,resizeObserver=null,intersectionObserver=null,media=null;

  function resize(){
    const rect=canvas.getBoundingClientRect();
    const width=Math.max(1,rect.width),height=Math.max(1,rect.height);
    const nativeDpr=Math.max(1,globalThis.devicePixelRatio||1),scale=Math.max(.25,state.options.resolutionScale??1);
    const dpr=Math.min(state.options.maxDpr??2.5,nativeDpr*scale);
    const pixelW=Math.max(1,Math.round(width*dpr)),pixelH=Math.max(1,Math.round(height*dpr));
    if(canvas.width!==pixelW||canvas.height!==pixelH){canvas.width=pixelW;canvas.height=pixelH;state.width=width;state.height=height;state.dpr=dpr;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);state.scene?.resize?.({width,height,dpr,ctx,pixelWidth:pixelW,pixelHeight:pixelH});}
    else{state.width=width;state.height=height;state.dpr=dpr;ctx.setTransform(dpr,0,0,dpr,0,0)}
  }

  function background(){
    const p=clamp(state.options.persistence??0,0,.985);
    if(p<=.001){ctx.clearRect(0,0,state.width,state.height);if(state.options.background){ctx.fillStyle=state.options.background;ctx.fillRect(0,0,state.width,state.height)}return}
    ctx.save();ctx.globalCompositeOperation='source-over';ctx.globalAlpha=Math.max(.015,1-p);ctx.fillStyle=state.options.background??'#000';ctx.fillRect(0,0,state.width,state.height);ctx.restore();
  }

  function active(){return state.running&&!state.destroyed&&state.visible&&state.pageVisible&&!state.options.paused}
  function tick(timestamp){
    raf=0;if(!active())return;resize();
    const rawDt=Math.max(0,(timestamp-state.last)/1000),dt=Math.min(.05,rawDt||1/60);state.last=timestamp;state.elapsed+=dt;state.frame++;
    state.fps=state.fps?lerp(state.fps,1/Math.max(dt,.0001),.08):1/Math.max(dt,.0001);
    background();ctx.save();state.scene?.render?.({ctx,width:state.width,height:state.height,dpr:state.dpr,pixelWidth:canvas.width,pixelHeight:canvas.height,time:state.elapsed,dt,frame:state.frame,fps:state.fps,reducedMotion:!!media?.matches,runtime:api});ctx.restore();schedule();
  }
  function schedule(){if(!active()||raf)return;raf=requestAnimationFrame(tick)}
  function start(){if(state.destroyed)return;state.running=true;state.last=now();schedule()}
  function stop(){state.running=false;if(raf)cancelAnimationFrame(raf);raf=0}
  function setScene(scene){state.scene=typeof scene==='function'?{render:scene}:scene;state.scene?.init?.({ctx,runtime:api});state.last=now();schedule()}
  function setOptions(next){const oldScale=state.options.resolutionScale,oldMax=state.options.maxDpr,wasPaused=state.options.paused;Object.assign(state.options,next||{});if(oldScale!==state.options.resolutionScale||oldMax!==state.options.maxDpr)resize();if(wasPaused&&!state.options.paused)state.last=now();schedule()}
  function invalidate(){state.last=now();schedule()}
  function snapshot(){return {width:state.width,height:state.height,dpr:state.dpr,pixelWidth:canvas.width,pixelHeight:canvas.height,frame:state.frame,fps:state.fps,elapsed:state.elapsed,visible:state.visible,running:state.running,paused:!!state.options.paused}}
  function onVisibility(){state.pageVisible=!document.hidden;state.last=now();if(raf&&!state.pageVisible){cancelAnimationFrame(raf);raf=0}schedule()}
  function destroy(){stop();state.destroyed=true;resizeObserver?.disconnect();intersectionObserver?.disconnect();media?.removeEventListener?.('change',invalidate);globalThis.document?.removeEventListener?.('visibilitychange',onVisibility);state.scene?.destroy?.()}

  const api={ctx,start,stop,destroy,setScene,setOptions,invalidate,snapshot,get options(){return state.options}};
  resizeObserver=globalThis.ResizeObserver?new ResizeObserver(()=>{resize();invalidate()}):null;resizeObserver?.observe(canvas);
  intersectionObserver=globalThis.IntersectionObserver?new IntersectionObserver(entries=>{state.visible=entries.some(entry=>entry.isIntersecting);state.last=now();if(raf&&!state.visible){cancelAnimationFrame(raf);raf=0}schedule()},{rootMargin:'80px'}):null;intersectionObserver?.observe(canvas);
  media=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')??null;media?.addEventListener?.('change',invalidate);globalThis.document?.addEventListener?.('visibilitychange',onVisibility);
  resize();return api;
}
