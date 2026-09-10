import {createEffect,createSignal,onCleanup,onMount,Show} from 'solid-js';
import {resolveCanvasDpr} from './engine.js';
import {subscribeVsync} from './scheduler.js';
import {CRTPhosphorRenderer} from './crt-gl.js';
import {advanceCRTBeam,createCRTBeamState} from './crt-beam.js';
import PhosphorVectorDisplay from './PhosphorVectorDisplay.jsx';

export default function PhosphorCRTDisplay(props){
  const [fallback,setFallback]=createSignal(false);let canvas,renderer,resizeObserver,intersectionObserver,unsubscribe;
  let width=1,height=1,dpr=1,visible=true,pageVisible=!globalThis.document?.hidden,last=performance.now(),elapsed=0;
  let beam=createCRTBeamState(),latchedPath=null;
  const active=()=>!props.paused&&visible&&pageVisible&&!fallback();
  function sync(){if(active()&&!unsubscribe)unsubscribe=subscribeVsync(frame);else if(!active()&&unsubscribe){unsubscribe();unsubscribe=null}}
  function resize(){
    if(!canvas||!renderer)return;const rect=canvas.getBoundingClientRect();width=Math.max(1,rect.width);height=Math.max(1,rect.height);
    const r=resolveCanvasDpr({width,height,nativeDpr:Math.max(1,devicePixelRatio||1),resolutionScale:props.resolutionScale??1,maxDpr:props.maxDpr??2.5,maxPixels:props.maxPixels??1_250_000,quality:1});dpr=r.dpr;
    if(canvas.width!==r.pixelWidth||canvas.height!==r.pixelHeight){canvas.width=r.pixelWidth;canvas.height=r.pixelHeight;renderer.resize(r.pixelWidth,r.pixelHeight);latchedPath=null}
  }
  function frame(timestamp){
    if(!active()||!renderer)return;const dt=Math.min(.05,Math.max(1/1000,(timestamp-last)/1000));last=timestamp;elapsed+=dt;
    const candidate=typeof props.path==='function'?props.path({width,height,dt,time:elapsed,quality:1}):(props.path||[]);
    const path=props.latchPath?(latchedPath??(latchedPath=candidate)):candidate,scanBefore=beam.scan;
    let points=advanceCRTBeam(beam,path,dt,{model:props.model??'P7',beamRate:props.beamRate??3.2,beamCurrent:props.beamCurrent??1,width,height,retraceSpeed:props.retraceSpeed,deflectionHz:props.deflectionHz,damping:props.damping,maxSlew:props.maxSlew});
    if(props.latchPath&&beam.scan!==scanBefore){
      points=points.filter(point=>point.scan===scanBefore);latchedPath=candidate;beam.phase=0;beam.z=0;beam.vx=0;beam.vy=0;
      const first=latchedPath?.find(segment=>!segment.blanked);if(first){beam.x=first.x1;beam.y=first.y1}
    }
    renderer.setModel(props.model??'P7');renderer.frame({dt,points,dpr,persistenceScale:props.persistenceScale??1});
  }
  function reset(){beam=createCRTBeamState();latchedPath=null;renderer?.clear()}
  function visibility(){pageVisible=!document.hidden;last=performance.now();sync()}
  onMount(()=>{
    try{renderer=new CRTPhosphorRenderer(canvas,{model:props.model??'P7'})}catch(error){console.warn('Falling back to Canvas phosphor display',error);setFallback(true);return}
    resizeObserver=new ResizeObserver(resize);resizeObserver.observe(canvas);intersectionObserver=new IntersectionObserver(entries=>{visible=entries.some(e=>e.isIntersecting);last=performance.now();sync()},{rootMargin:'60px'});intersectionObserver.observe(canvas);document.addEventListener('visibilitychange',visibility);resize();props.onReady?.({reset,clear:()=>renderer?.clear()});sync();
  });
  createEffect(()=>{props.paused;last=performance.now();sync()});
  createEffect(()=>{props.model;renderer?.setModel(props.model??'P7')});
  onCleanup(()=>{unsubscribe?.();resizeObserver?.disconnect();intersectionObserver?.disconnect();document.removeEventListener('visibilitychange',visibility);renderer?.destroy()});
  return <Show when={!fallback()} fallback={<PhosphorVectorDisplay path={props.path} paused={props.paused} beamRate={props.beamRate} persistenceHalfLife={props.fallbackHalfLife??.28} glow={props.glow!==false} maxPixels={props.maxPixels} label={props.label}/>}>
    <canvas ref={canvas} class={`display-canvas crt-phosphor-canvas${props.class?` ${props.class}`:''}`} aria-label={props.label??'Physical phosphor CRT vector display'} role="img"/>
  </Show>;
}
