import {runAlu,runCordicSinCos} from './lambda-math/index.js';

const FRAC=13,SCALE=2**FRAC,BOUND=Math.round(1.42*SCALE);
const baseDelta=[43,31,23];
let raw=[0,Math.round(.38*SCALE),Math.round(-.52*SCALE)];
let direction=[1,1,-1],trig=[{sin:0,cos:1},{sin:0,cos:1},{sin:0,cos:1}],axis=0,totalBeta=0,seq=0,paused=false,speed=1;

function stepAxis(index){
  const delta=Math.max(1,Math.round(baseDelta[index]*speed))*direction[index];
  let alu=runAlu('add',raw[index],delta,{width:16,limit:2_000_000});
  if(alu.signed>BOUND||alu.signed<-BOUND){
    direction[index]*=-1;
    alu=runAlu('add',raw[index],Math.max(1,Math.round(baseDelta[index]*speed))*direction[index],{width:16,limit:2_000_000});
  }
  raw[index]=alu.signed;
  const angle=raw[index]/SCALE,started=performance.now();
  const cordic=runCordicSinCos(angle,{width:16,frac:FRAC,iterations:11,limit:8_000_000});
  trig[index]={sin:cordic.sin,cos:cordic.cos,residual:cordic.residual,beta:cordic.beta,computeMs:performance.now()-started};
  totalBeta+=alu.beta+cordic.beta;
}

function publish(){
  postMessage({type:'state',seq:++seq,raw:[...raw],angles:raw.map(v=>v/SCALE),sin:trig.map(v=>v.sin),cos:trig.map(v=>v.cos),residual:trig.map(v=>v.residual),beta:trig.map(v=>v.beta),computeMs:trig.map(v=>v.computeMs),totalBeta,direction:[...direction]});
}

function loop(){
  if(!paused){stepAxis(axis);axis=(axis+1)%3;if(axis===0)publish()}
  setTimeout(loop,12);
}

onmessage=event=>{
  const data=event.data||{};
  if(data.type==='pause')paused=!!data.value;
  else if(data.type==='speed')speed=Math.max(.2,Math.min(3,Number(data.value)||1));
  else if(data.type==='reset'){raw=[0,Math.round(.38*SCALE),Math.round(-.52*SCALE)];direction=[1,1,-1];trig=[{sin:0,cos:1},{sin:0,cos:1},{sin:0,cos:1}];axis=0;totalBeta=0;seq=0}
};

loop();
