import {runAlu,runArithmeticShift,runCordicSinCos,runCordicRotatePairRaw,wordView,cordicView} from '../frontend/src/lambda-math/index.js';

const expect=(actual,want,label)=>{if(actual!==want)throw new Error(`${label}: ${actual} !== ${want}`)};
const aluCases=[
  ['add',5,7,12],['add',255,1,256],['add',-5,2,-3],
  ['sub',12,7,5],['sub',7,12,-5],['not',5,0,-6],['neg',123,0,-123]
];
for(const [op,a,b,want] of aluCases){
  const out=runAlu(op,a,b);
  expect(out.signed,want,`${op}(${a},${b})`);
  if(out.beta<=0)throw new Error(`${op}: no beta reductions recorded`);
  const view=wordView(out);
  if(view.binary.length!==16||!view.hex.startsWith('0x'))throw new Error(`${op}: invalid display view`);
}
expect(runArithmeticShift(-5,2).signed,-2,'sar(-5,2)');
expect(runArithmeticShift(1024,5).signed,32,'sar(1024,5)');

let maxError=0,maxBeta=0;
for(const deg of [-90,-60,-30,0,30,45,60,90]){
  const rad=deg*Math.PI/180;
  const out=runCordicSinCos(rad,{iterations:12});
  const sinError=Math.abs(out.sin-Math.sin(rad));
  const cosError=Math.abs(out.cos-Math.cos(rad));
  maxError=Math.max(maxError,sinError,cosError);
  maxBeta=Math.max(maxBeta,out.beta);
  if(sinError>.0012||cosError>.0012)throw new Error(`CORDIC ${deg}Â° error: sin=${sinError}, cos=${cosError}`);
  if(out.beta<=0)throw new Error(`CORDIC ${deg}Â°: no beta reductions recorded`);
  const view=cordicView(out);
  if(view.x.binary.length!==16||view.y.binary.length!==16||view.stats.beta<=0)throw new Error(`CORDIC ${deg}Â°: invalid display view`);
}
let maxVectorError=0;
const vectorScale=8192;
for(const deg of [-60,-30,0,30,60]){
  const rad=deg*Math.PI/180,angleRaw=Math.round(rad*vectorScale);
  const out=runCordicRotatePairRaw(vectorScale,0,angleRaw,{iterations:10});
  const error=Math.max(Math.abs(out.x-Math.cos(rad)),Math.abs(out.y-Math.sin(rad)));
  maxVectorError=Math.max(maxVectorError,error);
  if(error>.003)throw new Error(`vector CORDIC ${deg}° error: ${error}`);
  if(out.beta<=0)throw new Error(`vector CORDIC ${deg}°: no beta reductions recorded`);
}
console.log(`Lambda math self-test passed; max CORDIC error=${maxError.toFixed(9)}, vector error=${maxVectorError.toFixed(9)}, max beta=${maxBeta}`);
