import {runAlu,runCordicRotatePairRaw} from './lambda-math/index.js';

const FRAC=13,SCALE=2**FRAC,BOUND=Math.round(1.42*SCALE);
const angularRate=[1220,910,690];
const identityRaw=[[SCALE,0,0],[0,SCALE,0],[0,0,SCALE]];
let raw=[0,Math.round(.38*SCALE),Math.round(-.52*SCALE)],direction=[1,1,-1];
let totalBeta=0,seq=0,paused=false,speed=1,last=performance.now();

function stepAngle(index,dt){
  const delta=Math.max(1,Math.round(angularRate[index]*speed*dt))*direction[index];
  let alu=runAlu('add',raw[index],delta,{width:16,limit:2_000_000});
  let beta=alu.beta;
  if(alu.signed>BOUND||alu.signed<-BOUND){
    direction[index]*=-1;
    alu=runAlu('add',raw[index],Math.abs(delta)*direction[index],{width:16,limit:2_000_000});beta+=alu.beta;
  }
  raw[index]=alu.signed;return beta;
}

function rotateBasisVector(input){
  let beta=0,residual=0;
  const xTurn=runCordicRotatePairRaw(input[1],input[2],raw[0],{width:16,frac:FRAC,iterations:10,limit:12_000_000});
  beta+=xTurn.beta;residual=Math.max(residual,Math.abs(xTurn.residual));
  const yTurn=runCordicRotatePairRaw(input[0],xTurn.yRaw,-raw[1],{width:16,frac:FRAC,iterations:10,limit:12_000_000});
  beta+=yTurn.beta;residual=Math.max(residual,Math.abs(yTurn.residual));
  const zTurn=runCordicRotatePairRaw(yTurn.xRaw,xTurn.xRaw,raw[2],{width:16,frac:FRAC,iterations:10,limit:12_000_000});
  beta+=zTurn.beta;residual=Math.max(residual,Math.abs(zTurn.residual));
  const outRaw=[zTurn.xRaw,zTurn.yRaw,yTurn.yRaw];
  return {raw:outRaw,value:outRaw.map(v=>v/SCALE),beta,residual};
}

function computeState(dt){
  let angleBeta=0;for(let i=0;i<3;i++)angleBeta+=stepAngle(i,dt);
  const started=performance.now(),columns=identityRaw.map(rotateBasisVector),computeMs=performance.now()-started;
  const basis=columns.map(column=>column.value),basisRaw=columns.map(column=>column.raw),vectorBeta=columns.map(column=>column.beta),basisBeta=vectorBeta.reduce((sum,value)=>sum+value,0);
  const residualMax=Math.max(...columns.map(column=>column.residual));
  totalBeta+=angleBeta+basisBeta;
  return {type:'state',seq:++seq,raw:[...raw],angles:raw.map(v=>v/SCALE),direction:[...direction],basis,basisRaw,vectorBeta,basisBeta,angleBeta,residualMax,computeMs,totalBeta};
}

function loop(){
  const now=performance.now(),dt=Math.min(.35,Math.max(1/240,(now-last)/1000));last=now;
  if(paused){setTimeout(loop,16);return}
  postMessage(computeState(dt));setTimeout(loop,0);
}

onmessage=event=>{
  const data=event.data||{};
  if(data.type==='pause'){paused=!!data.value;last=performance.now()}
  else if(data.type==='speed')speed=Math.max(.2,Math.min(3,Number(data.value)||1));
  else if(data.type==='reset'){
    raw=[0,Math.round(.38*SCALE),Math.round(-.52*SCALE)];direction=[1,1,-1];totalBeta=0;seq=0;last=performance.now();
  }
};

loop();
