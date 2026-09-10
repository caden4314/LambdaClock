import {clamp} from './engine.js';
import {resolvePhosphorModel,phosphorDose} from './phosphor-models.js';

const mod1=x=>((x%1)+1)%1;
const segLength=s=>Math.hypot((s?.x2??0)-(s?.x1??0),(s?.y2??0)-(s?.y1??0));

export function measureCRTPath(path,retraceSpeed=5.5){
  const segments=[];let total=0;
  for(const s of path||[]){
    const geometric=segLength(s);if(geometric<1e-6)continue;
    const speed=s.blanked?Math.max(1,retraceSpeed):1,timeLength=geometric/speed;
    segments.push({...s,geometric,timeLength,start:total,end:total+timeLength});total+=timeLength;
  }
  return {segments,total};
}
export function sampleCRTPath(measured,phase){
  if(!measured?.segments?.length||measured.total<=0)return null;
  const d=mod1(phase)*measured.total;
  let s=measured.segments[measured.segments.length-1];
  for(const candidate of measured.segments){if(d<=candidate.end){s=candidate;break}}
  const t=clamp((d-s.start)/Math.max(1e-6,s.timeLength));
  return {x:s.x1+(s.x2-s.x1)*t,y:s.y1+(s.y2-s.y1)*t,blanked:!!s.blanked,intensity:s.intensity??1};
}
export function createCRTBeamState(){return {phase:0,x:NaN,y:NaN,vx:0,vy:0,z:0,sample:0}}

export function advanceCRTBeam(state,path,dt,{model='P7',beamRate=3.2,beamCurrent=1,width=1,height=1,retraceSpeed,deflectionHz,damping,maxSlew}={}){
  const m=resolvePhosphorModel(model),measured=measureCRTPath(path,retraceSpeed??m.retraceSpeed);if(!measured.total)return [];
  const frameDt=clamp(Number(dt)||0,0,.05),rate=Math.max(.02,Number(beamRate)||3.2);
  const estimatedPixels=measured.total*rate*frameDt,steps=Math.max(2,Math.min(40,Math.ceil(estimatedPixels/4))),h=frameDt/steps;
  const omega=2*Math.PI*Math.max(20,deflectionHz??m.deflectionHz),zeta=Math.max(.2,damping??m.damping),slew=Math.max(500,maxSlew??m.maxSlew),points=[];
  for(let i=0;i<steps;i++){
    state.phase=mod1(state.phase+rate*h);const target=sampleCRTPath(measured,state.phase);if(!target)continue;
    if(!Number.isFinite(state.x)){state.x=target.x;state.y=target.y}
    let ax=omega*omega*(target.x-state.x)-2*zeta*omega*state.vx,ay=omega*omega*(target.y-state.y)-2*zeta*omega*state.vy;
    state.vx+=ax*h;state.vy+=ay*h;let velocity=Math.hypot(state.vx,state.vy);
    if(velocity>slew){const k=slew/velocity;state.vx*=k;state.vy*=k;velocity=slew}
    state.x+=state.vx*h;state.y+=state.vy*h;
    const command=target.blanked?0:clamp(target.intensity,0,1.5),tau=command>state.z?m.blankOnTau:m.blankOffTau;
    state.z+= (command-state.z)*(1-Math.exp(-h/Math.max(.00005,tau)));
    const cx=width*.5,cy=height*.5,r=Math.min(width,height)*.465,edge=clamp(Math.hypot(state.x-cx,state.y-cy)/Math.max(1,r));
    const screenGain=1-m.edgeLoss*edge*edge,dose=phosphorDose({beamCurrent:(beamCurrent??m.beamCurrent)*state.z,velocity});
    const flicker=.985+.015*Math.sin((state.sample++*.754877666+state.phase*31.7)*Math.PI*2);
    const energy=dose*screenGain*flicker*Math.max(.42,h*420),radius=m.spotRadius*(1+m.bloom*Math.sqrt(Math.max(0,dose)))*(1+.11*edge*edge);
    if(energy>.0002)points.push({x:state.x,y:state.y,energy,radius,blanked:target.blanked});
  }
  return points;
}
