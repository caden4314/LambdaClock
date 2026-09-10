import DisplayCanvas from './DisplayCanvas.jsx';
import {sampleSignal,magnitudeSpectrum,normalizeSpectrum} from './signal.js';
import {drawGrid,drawPolyline} from './primitives.js';
import {withGlow,drawVignette,drawScanlines} from './effects.js';

export default function SpectrumDisplay(props){
  const scene={render({ctx,width,height,time}){
    const source=props.source??(t=>Math.sin(t*Math.PI*2*220));
    const fftSize=Math.max(64,Math.min(4096,Math.trunc(props.fftSize??1024))),sampleRate=Math.max(fftSize,Number(props.sampleRate??4096));
    const samples=sampleSignal(source,{count:fftSize,sampleRate,startTime:time-fftSize/sampleRate});
    let spectrum=normalizeSpectrum(magnitudeSpectrum(samples,{sampleRate,dbFloor:props.floor??-90}),{floor:props.floor??-90,ceiling:props.ceiling??0});
    const maxFrequency=Math.min(sampleRate/2,Number(props.maxFrequency??sampleRate/2));spectrum=spectrum.filter(point=>point.frequency<=maxFrequency);
    drawGrid(ctx,{width,height,xDiv:10,yDiv:6,alpha:.055});
    const points=spectrum.map((point,i)=>[i/Math.max(1,spectrum.length-1)*width,height-(point.value*height*.88+height*.04)]);
    const draw=()=>drawPolyline(ctx,points,{lineWidth:1.25,alpha:.92});props.glow===false?draw():withGlow(ctx,7,draw,{alpha:.2});if(props.scanlines)drawScanlines(ctx,{width,height,spacing:4,alpha:.04,offset:time*9});drawVignette(ctx,{width,height,strength:.24});
  }};
  return <DisplayCanvas scene={scene} paused={props.paused} persistence={props.persistence??.55} background={props.background??'#000'} resolutionScale={props.resolutionScale??1} maxDpr={props.maxDpr??3} class={props.class} label={props.label??'Frequency spectrum display'}/>;
}
