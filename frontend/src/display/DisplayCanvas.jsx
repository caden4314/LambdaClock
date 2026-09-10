import {createEffect,onCleanup,onMount} from 'solid-js';
import {createDisplayRuntime} from './engine.js';

function runtimeOptions(props){
  return {
    background:props.background??'#000',
    persistence:props.persistence??0,
    paused:!!props.paused,
    maxDpr:props.maxDpr??2.5,
    maxPixels:props.maxPixels??1_500_000,
    resolutionScale:props.resolutionScale??1,
    adaptiveResolution:props.adaptiveResolution!==false,
    minQuality:props.minQuality??.55,
    maxFps:props.maxFps??60
  };
}

export default function DisplayCanvas(props){
  let canvas,runtime;
  onMount(()=>{
    runtime=createDisplayRuntime(canvas,runtimeOptions(props));
    runtime.setScene(props.scene);runtime.start();props.onReady?.(runtime);
  });
  createEffect(()=>runtime?.setScene(props.scene));
  createEffect(()=>runtime?.setOptions(runtimeOptions(props)));
  onCleanup(()=>runtime?.destroy());
  return <canvas ref={canvas} class={`display-canvas${props.class?` ${props.class}`:''}`} aria-label={props.label??'Animated display'} role="img"/>;
}
