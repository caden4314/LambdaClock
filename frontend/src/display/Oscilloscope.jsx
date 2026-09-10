import DisplayCanvas from './DisplayCanvas.jsx';
import {drawOscilloscope,triggerWindow} from './scope.js';
import {sampleSignal} from './signal.js';
import {withGlow,drawVignette,drawScanlines} from './effects.js';

export default function Oscilloscope(props){
  const scene={render({ctx,width,height,time}){
    const sources=props.sources?.length?props.sources:[t=>Math.sin(t*Math.PI*2*60)];
    const sampleCount=Math.max(256,Math.min(2048,Math.trunc(props.sampleCount??Math.max(512,width*1.5))));
    const duration=Math.max(.001,Number(props.windowSeconds??.02)),sampleRate=sampleCount/duration,extra=Math.floor(sampleCount*.35),start=time-duration-extra/sampleRate;
    const raw=sources.map(source=>sampleSignal(source,{count:sampleCount+extra,sampleRate,startTime:start}));
    const channels=triggerWindow(raw,{count:sampleCount,level:props.triggerLevel??0,edge:props.triggerEdge??'rising',pretrigger:props.pretrigger??.18}).map((samples,index)=>({samples,alpha:index?0.5:1,scale:props.scale??.39,lineWidth:index?1:1.45,offset:(props.offsets?.[index]??0)}));
    const draw=()=>drawOscilloscope(ctx,{width,height,channels,graticule:props.graticule!==false,triggerX:props.pretrigger??.18});
    props.glow===false?draw():withGlow(ctx,8,draw,{alpha:.22});if(props.scanlines)drawScanlines(ctx,{width,height,spacing:4,alpha:.045,offset:time*12});drawVignette(ctx,{width,height,strength:.28});
  }};
  return <DisplayCanvas scene={scene} paused={props.paused} persistence={props.persistence??.86} background={props.background??'#000'} resolutionScale={props.resolutionScale??1} maxDpr={props.maxDpr??3} class={props.class} label={props.label??'Oscilloscope display'}/>;
}
