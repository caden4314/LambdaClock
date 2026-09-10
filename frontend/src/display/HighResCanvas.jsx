import DisplayCanvas from './DisplayCanvas.jsx';

export default function HighResCanvas(props){
  const scale=()=>Math.max(1,Number(props.resolutionScale??3));
  return <DisplayCanvas
    scene={props.scene}
    paused={props.paused}
    persistence={props.persistence??0}
    background={props.background??'#000'}
    resolutionScale={scale()}
    maxDpr={props.maxDpr??8}
    maxPixels={props.maxPixels??2_000_000}
    adaptiveResolution={props.adaptiveResolution!==false}
    minQuality={props.minQuality??.5}
    maxFps={props.maxFps??60}
    onReady={props.onReady}
    class={`high-res-canvas${props.class?` ${props.class}`:''}`}
    label={props.label??`High-resolution ${scale()}x canvas`}
  />;
}
