import DisplayCanvas from './DisplayCanvas.jsx';
import {drawOscilloscope,findTriggerAnchor} from './scope.js';
import {sampleSignalInto} from './signal.js';
import {withGlow,drawVignette,drawScanlines} from './effects.js';

const DEFAULT_SOURCE=t=>Math.sin(t*Math.PI*2*60);

export default function Oscilloscope(props){
  let buffers=[],views=[],shape='';
  function ensure(sourceCount,total){
    const next=`${sourceCount}:${total}`;if(next===shape)return;shape=next;
    buffers=Array.from({length:sourceCount},()=>new Float32Array(total));
    views=Array.from({length:sourceCount},(_,index)=>({samples:buffers[index],start:0,count:0,alpha:index ? .5 : 1,scale:.39,lineWidth:index?1:1.45,offset:0}));
  }
  const scene={render({ctx,width,height,time,quality}){
    const sources=props.sources?.length?props.sources:[DEFAULT_SOURCE],q=Math.max(.45,Math.min(1,quality??1));
    const requested=props.sampleCount??Math.max(384,width*1.15),sampleCount=Math.max(256,Math.min(1536,Math.trunc(requested*(.58+.42*q))));
    const duration=Math.max(.001,Number(props.windowSeconds??.02)),sampleRate=sampleCount/duration,extra=Math.floor(sampleCount*.35),total=sampleCount+extra,start=time-duration-extra/sampleRate;
    ensure(sources.length,total);
    for(let i=0;i<sources.length;i++)sampleSignalInto(buffers[i],sources[i],{sampleRate,startTime:start});
    const anchor=findTriggerAnchor(buffers[0],{count:sampleCount,level:props.triggerLevel??0,edge:props.triggerEdge??'rising',pretrigger:props.pretrigger??.18});
    for(let i=0;i<views.length;i++){const view=views[i];view.samples=buffers[i];view.start=anchor;view.count=sampleCount;view.alpha=i ? .5 : 1;view.scale=props.scale??.39;view.lineWidth=i?1:1.45;view.offset=props.offsets?.[i]??0}
    const draw=(style={})=>drawOscilloscope(ctx,{width,height,channels:views,graticule:props.graticule!==false&&!style.glow,triggerX:props.pretrigger??.18,widthScale:style.widthScale??1,alphaScale:style.alphaScale??1});
    props.glow===false?draw():withGlow(ctx,8,draw,{alpha:.22,quality:q,mode:props.glowMode??'fast'});if(props.scanlines)drawScanlines(ctx,{width,height,spacing:4,alpha:.045,offset:time*12});drawVignette(ctx,{width,height,strength:.28});
  }};
  return <DisplayCanvas scene={scene} paused={props.paused} persistence={props.persistence??.86} background={props.background??'#000'} resolutionScale={props.resolutionScale??1} maxDpr={props.maxDpr??2.5} maxPixels={props.maxPixels??1_250_000} adaptiveResolution={props.adaptiveResolution!==false} maxFps={props.maxFps??0} class={props.class} label={props.label??'Oscilloscope display'}/>;
}
