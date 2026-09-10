import {normalizeValues,sampleWave} from '../frontend/src/display/primitives.js';
import {smoothstep,smootherstep,pulse,springStep} from '../frontend/src/display/effects.js';

const assert=(ok,message)=>{if(!ok)throw new Error(message)};
const close=(a,b,eps=1e-6)=>Math.abs(a-b)<=eps;

const normalized=normalizeValues([-1,0,.25,2],4);
assert(normalized.length===4,'normalize length');
assert(close(normalized[0],0)&&close(normalized[1],0)&&close(normalized[2],.25)&&close(normalized[3],1),'normalize clamps values');

const wave=sampleWave(x=>x*2-1,5);
assert(wave.length===5,'wave sample count');
assert(close(wave[0],-1)&&close(wave[2],0)&&close(wave[4],1),'wave sampling endpoints');
assert(close(smoothstep(0),0)&&close(smoothstep(1),1),'smoothstep endpoints');
assert(close(smootherstep(0),0)&&close(smootherstep(1),1),'smootherstep endpoints');
for(let i=0;i<50;i++){const p=pulse(i/50,2);assert(p>=0&&p<=1,'pulse bounds')}

let spring={value:0,velocity:0};
for(let i=0;i<240;i++)spring=springStep(spring,1,1/120,{frequency:3,damping:1});
assert(Math.abs(spring.value-1)<.005,'spring converges');
console.log('Display system self-test passed');
