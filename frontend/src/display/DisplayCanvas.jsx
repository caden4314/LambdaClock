import {createEffect,onCleanup,onMount} from 'solid-js';
import {createDisplayRuntime} from './engine.js';

export default function DisplayCanvas(props){
  let canvas,runtime;
  onMount(()=>{
    runtime=createDisplayRuntime(canvas,{background:props.background??'#000',persistence:props.persistence??0,paused:!!props.paused,maxDpr:props.maxDpr??2.5});
    runtime.setScene(props.scene);
    runtime.start();
    props.onReady?.(runtime);
  });
  createEffect(()=>runtime?.setScene(props.scene));
  createEffect(()=>runtime?.setOptions({background:props.background??'#000',persistence:props.persistence??0,paused:!!props.paused,maxDpr:props.maxDpr??2.5}));
  onCleanup(()=>runtime?.destroy());
  return <canvas ref={canvas} class={`display-canvas${props.class?` ${props.class}`:''}`} aria-label={props.label??'Animated display'} role="img"/>;
}
