import DisplayCanvas from './DisplayCanvas.jsx';
import {drawPhosphorBeam,drawPhosphorFace} from './phosphor.js';
import {drawVignette} from './effects.js';

export default function PhosphorVectorDisplay(props){
  let phase=0;
  const scene={
    render(frame){
      const path=typeof props.path==='function'?props.path(frame):(props.path||[]);
      const rate=Math.max(.05,Number(props.beamRate??2.8));
      const from=phase,travel=Math.min(1.25,Math.max(0,frame.dt)*rate);phase=(phase+travel)%1;
      drawPhosphorFace(frame.ctx,{width:frame.width,height:frame.height,rings:props.rings??3,alpha:props.gridAlpha??.004,axisAlpha:props.axisAlpha??.01,borderAlpha:props.borderAlpha??.16});
      drawPhosphorBeam(frame.ctx,{path,fromPhase:from,toPhase:from+travel,coreWidth:props.coreWidth??1.1,bloomWidth:props.glow===false?0:(props.bloomWidth??4.8),intensity:props.intensity??1,quality:frame.quality,head:props.head!==false});
      drawVignette(frame.ctx,{width:frame.width,height:frame.height,strength:props.vignette??.32});
    },
    reset(){phase=0}
  };
  return <DisplayCanvas scene={scene} paused={props.paused} persistence={0} persistenceHalfLife={props.persistenceHalfLife??.24} background={props.background??'#000'} resolutionScale={props.resolutionScale??1} maxDpr={props.maxDpr??2.5} maxPixels={props.maxPixels??1_250_000} adaptiveResolution={props.adaptiveResolution!==false} minQuality={props.minQuality??.62} maxFps={props.maxFps??0} class={props.class} label={props.label??'Phosphor vector display'}/>;
}
