import {subscribeVsync,getDisplaySchedulerStats} from './scheduler.js';

export const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));
export const lerp=(a,b,t)=>a+(b-a)*t;
const clock=()=>globalThis.performance?.now?.()??Date.now();

export function resolveCanvasDpr({width=1,height=1,nativeDpr=1,resolutionScale=1,maxDpr=2.5,maxPixels=1_500_000,quality=1}={}){
  const w=Math.max(1,Number(width)||1),h=Math.max(1,Number(height)||1);
  const requested=Math.max(.25,(Number(nativeDpr)||1)*Math.max(.25,Number(resolutionScale)||1)*clamp(Number(quality)||1,.35,1));
  const hardMax=Math.max(.25,Number(maxDpr)||2.5),pixels=Math.max(1,Number(maxPixels)||1_500_000);
  const pixelCap=Math.sqrt(pixels/(w*h));
  const dpr=Math.max(.25,Math.min(requested,hardMax,pixelCap));
  const pixelWidth=Math.max(1,Math.round(w*dpr)),pixelHeight=Math.max(1,Math.round(h*dpr));
  return {dpr,requestedDpr:requested,pixelCapDpr:pixelCap,pixelWidth,pixelHeight,pixelCount:pixelWidth*pixelHeight};
}

export function createDisplayRuntime(canvas,options={}){
  if(!canvas)throw new Error('display runtime requires a canvas');
  const ctx=canvas.getContext('2d',{alpha:true,desynchronized:true});
  if(!ctx)throw new Error('2D canvas unavailable');
  const state={
    scene:null,running:false,destroyed:false,visible:true,pageVisible:!globalThis.document?.hidden,
    width:1,height:1,dpr:1,requestedDpr:1,pixelCount:1,last:clock(),elapsed:0,frame:0,fps:0,renderMs:0,
    quality:1,lastAdapt:0,badWindows:0,goodWindows:0,nextFrameAt:0,resizeDirty:true,
    options:{background:'#000',persistence:0,maxDpr:2.5,maxPixels:1_500_000,resolutionScale:1,adaptiveResolution:true,minQuality:.55,maxFps:60,paused:false,...options}
  };
  let unsubscribeFrame=null,resizeObserver=null,intersectionObserver=null,media=null;

  function measure(){
    const rect=canvas.getBoundingClientRect();
    state.width=Math.max(1,rect.width);state.height=Math.max(1,rect.height);state.resizeDirty=true;
  }

  function resize(force=false){
    if(!force&&!state.resizeDirty)return;
    state.resizeDirty=false;
    const resolved=resolveCanvasDpr({width:state.width,height:state.height,nativeDpr:Math.max(1,globalThis.devicePixelRatio||1),resolutionScale:state.options.resolutionScale,maxDpr:state.options.maxDpr,maxPixels:state.options.maxPixels,quality:state.quality});
    const logicalChanged=state.dpr!==resolved.dpr||canvas.width!==resolved.pixelWidth||canvas.height!==resolved.pixelHeight;
    state.dpr=resolved.dpr;state.requestedDpr=resolved.requestedDpr;state.pixelCount=resolved.pixelCount;
    if(logicalChanged){
      canvas.width=resolved.pixelWidth;canvas.height=resolved.pixelHeight;
      ctx.setTransform(state.dpr,0,0,state.dpr,0,0);
      ctx.clearRect(0,0,state.width,state.height);
      state.scene?.resize?.({width:state.width,height:state.height,dpr:state.dpr,ctx,pixelWidth:canvas.width,pixelHeight:canvas.height,runtime:api});
    }else ctx.setTransform(state.dpr,0,0,state.dpr,0,0);
  }

  function background(){
    const p=clamp(state.options.persistence??0,0,.985);
    if(p<=.001){
      ctx.clearRect(0,0,state.width,state.height);
      if(state.options.background){ctx.fillStyle=state.options.background;ctx.fillRect(0,0,state.width,state.height)}
      return;
    }
    ctx.save();ctx.globalCompositeOperation='source-over';ctx.globalAlpha=Math.max(.015,1-p);ctx.fillStyle=state.options.background??'#000';ctx.fillRect(0,0,state.width,state.height);ctx.restore();
  }

  function active(){return state.running&&!state.destroyed&&state.visible&&state.pageVisible&&!state.options.paused}
  function syncScheduler(){
    if(active()&&!unsubscribeFrame)unsubscribeFrame=subscribeVsync(tick);
    else if(!active()&&unsubscribeFrame){unsubscribeFrame();unsubscribeFrame=null}
  }

  function shouldPresent(timestamp){
    const cap=Math.max(0,Number(state.options.maxFps)||0);
    if(!cap)return true;
    const interval=1000/cap;
    if(!state.nextFrameAt){state.nextFrameAt=timestamp;return true}
    if(timestamp+.35<state.nextFrameAt)return false;
    do state.nextFrameAt+=interval;while(state.nextFrameAt<=timestamp-.35);
    return true;
  }

  function adapt(timestamp,schedulerFrameMs){
    if(state.options.adaptiveResolution===false||timestamp-state.lastAdapt<750)return;
    state.lastAdapt=timestamp;
    const stats=getDisplaySchedulerStats(),activeCount=Math.max(1,stats.activeSurfaces);
    const budget=Math.max(.8,(schedulerFrameMs||stats.frameMs||16.67)*.82/activeCount);
    const overloaded=state.renderMs>budget*1.08||stats.load>.92;
    const underloaded=state.renderMs<budget*.52&&stats.load<.66;
    if(overloaded){state.badWindows++;state.goodWindows=0}else if(underloaded){state.goodWindows++;state.badWindows=0}else{state.badWindows=0;state.goodWindows=0}
    let next=state.quality;
    if(state.badWindows>=2){next=Math.max(clamp(state.options.minQuality??.55,.35,1),state.quality*.86);state.badWindows=0}
    else if(state.goodWindows>=4&&state.quality<.999){next=Math.min(1,state.quality+.06);state.goodWindows=0}
    if(Math.abs(next-state.quality)>.005){state.quality=next;state.resizeDirty=true}
  }

  function tick(timestamp,schedulerFrameMs){
    if(!active()||!shouldPresent(timestamp))return;
    resize();
    const rawDt=Math.max(0,(timestamp-state.last)/1000),dt=Math.min(.05,rawDt||1/60);state.last=timestamp;state.elapsed+=dt;state.frame++;
    state.fps=state.fps?lerp(state.fps,1/Math.max(dt,.0001),.08):1/Math.max(dt,.0001);
    const started=clock();
    background();ctx.save();
    state.scene?.render?.({ctx,width:state.width,height:state.height,dpr:state.dpr,pixelWidth:canvas.width,pixelHeight:canvas.height,time:state.elapsed,dt,frame:state.frame,fps:state.fps,quality:state.quality,reducedMotion:!!media?.matches,runtime:api,scheduler:getDisplaySchedulerStats()});
    ctx.restore();
    const cost=Math.max(0,clock()-started);state.renderMs=state.renderMs?lerp(state.renderMs,cost,.08):cost;
    adapt(timestamp,schedulerFrameMs);
  }

  function start(){if(state.destroyed)return;state.running=true;state.last=clock();state.nextFrameAt=0;syncScheduler()}
  function stop(){state.running=false;syncScheduler()}
  function setScene(scene){
    const next=typeof scene==='function'?{render:scene}:scene;
    if(state.scene===next)return;
    state.scene?.destroy?.({runtime:api});state.scene=next;state.scene?.init?.({ctx,runtime:api});state.resizeDirty=true;syncScheduler();
  }
  function setOptions(next){
    const oldScale=state.options.resolutionScale,oldMax=state.options.maxDpr,oldPixels=state.options.maxPixels,oldPaused=state.options.paused,oldFps=state.options.maxFps;
    Object.assign(state.options,next||{});
    if(oldScale!==state.options.resolutionScale||oldMax!==state.options.maxDpr||oldPixels!==state.options.maxPixels)state.resizeDirty=true;
    if(oldPaused&&!state.options.paused){state.last=clock();state.nextFrameAt=0}
    if(oldFps!==state.options.maxFps)state.nextFrameAt=0;
    syncScheduler();
  }
  function invalidate(){state.last=clock();syncScheduler()}
  function snapshot(){const scheduler=getDisplaySchedulerStats();return {width:state.width,height:state.height,dpr:state.dpr,requestedDpr:state.requestedDpr,pixelWidth:canvas.width,pixelHeight:canvas.height,pixelCount:state.pixelCount,frame:state.frame,fps:state.fps,renderMs:state.renderMs,quality:state.quality,elapsed:state.elapsed,visible:state.visible,running:state.running,paused:!!state.options.paused,scheduler}}
  function onVisibility(){state.pageVisible=!document.hidden;state.last=clock();state.nextFrameAt=0;syncScheduler()}
  function destroy(){stop();state.destroyed=true;resizeObserver?.disconnect();intersectionObserver?.disconnect();media?.removeEventListener?.('change',invalidate);globalThis.document?.removeEventListener?.('visibilitychange',onVisibility);state.scene?.destroy?.({runtime:api})}

  const api={ctx,start,stop,destroy,setScene,setOptions,invalidate,snapshot,get options(){return state.options}};
  measure();
  resizeObserver=globalThis.ResizeObserver?new ResizeObserver(entries=>{const rect=entries[0]?.contentRect;if(rect){state.width=Math.max(1,rect.width);state.height=Math.max(1,rect.height)}else measure();state.resizeDirty=true}):null;resizeObserver?.observe(canvas);
  intersectionObserver=globalThis.IntersectionObserver?new IntersectionObserver(entries=>{state.visible=entries.some(entry=>entry.isIntersecting);state.last=clock();state.nextFrameAt=0;syncScheduler()},{rootMargin:'60px'}):null;intersectionObserver?.observe(canvas);
  media=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')??null;media?.addEventListener?.('change',invalidate);globalThis.document?.addEventListener?.('visibilitychange',onVisibility);
  resize(true);return api;
}
