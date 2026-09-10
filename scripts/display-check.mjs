import {normalizeValues,sampleWave} from '../frontend/src/display/primitives.js';
import {smoothstep,smootherstep,pulse,springStep} from '../frontend/src/display/effects.js';
import {rasterizeDotText,scrollDotRaster} from '../frontend/src/display/dotfont.js';
import {createScene,displayLayer} from '../frontend/src/display/scene.js';
import {resolveHighResSize} from '../frontend/src/display/highres.js';
import {createRingBuffer,findTriggerIndex,triggerWindow} from '../frontend/src/display/scope.js';
import {sampleSignal,magnitudeSpectrum,dominantFrequency,nextPowerOfTwo} from '../frontend/src/display/signal.js';
import {cartesianTransform} from '../frontend/src/display/plot.js';

const assert=(ok,message)=>{if(!ok)throw new Error(message)};
const close=(a,b,eps=1e-6)=>Math.abs(a-b)<=eps;

const normalized=normalizeValues([-1,0,.25,2],4);assert(normalized.length===4,'normalize length');assert(close(normalized[0],0)&&close(normalized[1],0)&&close(normalized[2],.25)&&close(normalized[3],1),'normalize clamps values');
const wave=sampleWave(x=>x*2-1,5);assert(wave.length===5,'wave sample count');assert(close(wave[0],-1)&&close(wave[2],0)&&close(wave[4],1),'wave sampling endpoints');
assert(close(smoothstep(0),0)&&close(smoothstep(1),1),'smoothstep endpoints');assert(close(smootherstep(0),0)&&close(smootherstep(1),1),'smootherstep endpoints');for(let i=0;i<50;i++){const p=pulse(i/50,2);assert(p>=0&&p<=1,'pulse bounds')}
let spring={value:0,velocity:0};for(let i=0;i<240;i++)spring=springStep(spring,1,1/120,{frequency:3,damping:1});assert(Math.abs(spring.value-1)<.005,'spring converges');

const text=rasterizeDotText('LAMBDA');assert(text.rows===7&&text.cols>25&&text.values.some(Boolean),'dot font rasterizes text');const scrolled=scrollDotRaster(text,12,3);assert(scrolled.cols===12&&scrolled.rows===7&&scrolled.values.length===84,'dot raster scroll window');
const layer=displayLayer(()=>{}),scene=createScene(layer);assert(scene.layers.length===1&&scene.layers[0]===layer,'scene composes display layers');

const high=resolveHighResSize({width:1920,height:1080,scale:4,maxPixels:20_000_000});assert(high.pixelWidth*high.pixelHeight<=20_000_000,'high-res pixel cap');assert(high.scale<=4&&high.scale>1,'high-res scale resolves');
const ring=createRingBuffer(4);ring.pushMany([1,2,3,4,5]);assert(ring.length===4&&ring.toArray().join(',')==='2,3,4,5','ring buffer wraps');
const triggerSamples=[-.4,-.2,-.1,.2,.5,.3,-.2,.2];assert(findTriggerIndex(triggerSamples,{level:0,hysteresis:.01})===3,'rising trigger found');const tw=triggerWindow([triggerSamples,triggerSamples.map(v=>-v)],{count:5,level:0,pretrigger:.2});assert(tw.length===2&&tw[0].length===5,'triggered channel window');

assert(nextPowerOfTwo(1000)===1024,'FFT power-of-two sizing');const sampleRate=4096,frequency=256,samples=sampleSignal(t=>Math.sin(Math.PI*2*frequency*t),{count:1024,sampleRate});const spectrum=magnitudeSpectrum(samples,{sampleRate}),peak=dominantFrequency(spectrum);assert(Math.abs(peak.frequency-frequency)<1e-6,'FFT dominant frequency');
const transform=cartesianTransform({xMin:-1,xMax:1,yMin:-1,yMax:1,width:100,height:100}),origin=transform.toCanvas(0,0);assert(close(origin[0],50)&&close(origin[1],50),'Cartesian transform origin');
console.log(`Display system self-test passed; FFT peak=${peak.frequency}Hz; hi-res=${high.pixelWidth}x${high.pixelHeight}`);
