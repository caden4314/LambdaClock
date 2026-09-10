import DisplayCanvas from './DisplayCanvas.jsx';
import {createSpectrumAnalyzer} from './signal.js';
import {drawGrid} from './primitives.js';
import {withGlow,drawVignette,drawScanlines} from './effects.js';

const DEFAULT_SOURCE=t=>Math.sin(t*Math.PI*2*220);

export default function SpectrumDisplay(props){
  let analyzer=null,key='',lastAnalysis=-Infinity,smoothed=null;
  const scene={render({ctx,width,height,time,quality}){
    const source=props.source??DEFAULT_SOURCE,q=Math.max(.45,Math.min(1,quality??1)),fftSize=Math.max(64,Math.min(4096,Math.trunc(props.fftSize??1024))),sampleRate=Math.max(fftSize,Number(props.sampleRate??4096)),floor=props.floor??-90,ceiling=props.ceiling??0;
    const nextKey=`${fftSize}:${sampleRate}:${floor}:${ceiling}`;
    if(nextKey!==key){key=nextKey;analyzer=createSpectrumAnalyzer({fftSize,sampleRate,dbFloor:floor,dbCeiling:ceiling});smoothed=new Float32Array(analyzer.values.length);lastAnalysis=-Infinity}
    const requestedHz=Math.max(5,Math.min(60,Number(props.updateHz??30))),analysisHz=Math.min(requestedHz,18+12*q);
    if(time-lastAnalysis>=1/analysisHz||lastAnalysis<0){
      const result=analyzer.analyze(source,{startTime:time-analyzer.size/analyzer.sampleRate,floor,ceiling});
      const blend=lastAnalysis<0?1:.38;for(let i=0;i<smoothed.length;i++)smoothed[i]+=(result.values[i]-smoothed[i])*blend;lastAnalysis=time;
    }
    const maxFrequency=Math.min(analyzer.sampleRate/2,Number(props.maxFrequency??analyzer.sampleRate/2)),count=Math.max(2,Math.min(smoothed.length,Math.floor(maxFrequency/analyzer.binHz)+1));
    drawGrid(ctx,{width,height,xDiv:10,yDiv:6,alpha:.055});
    const draw=(style={})=>{ctx.save();ctx.strokeStyle='#fff';ctx.globalAlpha=.92*(style.alphaScale??1);ctx.lineWidth=1.25*(style.widthScale??1);ctx.lineJoin='round';ctx.lineCap='round';ctx.beginPath();for(let i=0;i<count;i++){const x=i/(count-1)*width,y=height-(smoothed[i]*height*.88+height*.04);i?ctx.lineTo(x,y):ctx.moveTo(x,y)}ctx.stroke();ctx.restore()};
    props.glow===false?draw():withGlow(ctx,7,draw,{alpha:.2,quality:q,mode:props.glowMode??'fast'});if(props.scanlines)drawScanlines(ctx,{width,height,spacing:4,alpha:.04,offset:time*9});drawVignette(ctx,{width,height,strength:.24});
  }};
  return <DisplayCanvas scene={scene} paused={props.paused} persistence={props.persistence??.55} background={props.background??'#000'} resolutionScale={props.resolutionScale??1} maxDpr={props.maxDpr??2.5} maxPixels={props.maxPixels??1_250_000} adaptiveResolution={props.adaptiveResolution!==false} maxFps={props.maxFps??0} class={props.class} label={props.label??'Frequency spectrum display'}/>;
}
