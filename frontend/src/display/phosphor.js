import {clamp} from './engine.js';

const mod1=value=>((value%1)+1)%1;
const length2=(a,b)=>Math.hypot((b?.[0]??0)-(a?.[0]??0),(b?.[1]??0)-(a?.[1]??0));

export function createBeamPath(points,edges,{blankRetrace=true}={}){
  const path=[];let cursor=null,firstStart=null,runId=0,edgeIndex=0;
  for(const edge of edges||[]){
    const a=points?.[edge[0]],b=points?.[edge[1]],edgeKey=Math.min(edge[0],edge[1])+'-'+Math.max(edge[0],edge[1]);if(!a||!b){edgeIndex++;continue}
    if(!firstStart)firstStart=a;
    if(cursor&&blankRetrace&&length2(cursor,a)>.25){
      path.push({x1:cursor[0],y1:cursor[1],x2:a[0],y2:a[1],blanked:true,intensity:0,runId:-1,edgeIndex:-1,edgeKey:null});
      runId++;
    }
    path.push({x1:a[0],y1:a[1],x2:b[0],y2:b[1],blanked:false,intensity:edge.intensity??1,runId,edgeIndex,edgeKey});
    cursor=b;edgeIndex++;
  }
  if(blankRetrace&&cursor&&firstStart&&length2(cursor,firstStart)>.25)path.push({x1:cursor[0],y1:cursor[1],x2:firstStart[0],y2:firstStart[1],blanked:true,intensity:0,runId:-1,edgeIndex:-1,edgeKey:null});
  return path;
}

export function measureBeamPath(path){
  const measured=[];let total=0;
  for(const segment of path||[]){
    const len=Math.hypot(segment.x2-segment.x1,segment.y2-segment.y1);if(len<1e-6)continue;
    measured.push({...segment,start:total,end:total+len,length:len});total+=len;
  }
  return {segments:measured,total};
}

function pointOnSegment(segment,distance){
  const t=clamp((distance-segment.start)/segment.length,0,1);
  return {x:segment.x1+(segment.x2-segment.x1)*t,y:segment.y1+(segment.y2-segment.y1)*t,blanked:!!segment.blanked,intensity:segment.intensity??1};
}

function strokeRange(ctx,measured,start,end,{lineWidth=1,alpha=1}={}){
  if(end<=start)return;
  ctx.beginPath();let any=false;
  for(const segment of measured.segments){
    if(segment.blanked||segment.end<=start||segment.start>=end)continue;
    const a=pointOnSegment(segment,Math.max(start,segment.start)),b=pointOnSegment(segment,Math.min(end,segment.end));
    ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);any=true;
  }
  if(any){ctx.lineWidth=lineWidth;ctx.globalAlpha=alpha;ctx.stroke()}
}

function beamRanges(measured,fromPhase,toPhase){
  const total=measured.total;if(total<=0)return [];
  const from=mod1(fromPhase),to=mod1(toPhase),raw=toPhase-fromPhase;
  if(Math.abs(raw)>=1)return [[0,total]];
  if(raw>=0&&to>=from)return [[from*total,to*total]];
  if(raw<0&&to<=from)return [[to*total,from*total]];
  return raw>=0?[[from*total,total],[0,to*total]]:[[0,from*total],[to*total,total]];
}

export function sampleBeamHead(path,phase){
  const measured=measureBeamPath(path),distance=mod1(phase)*measured.total;
  for(const segment of measured.segments)if(distance>=segment.start&&distance<=segment.end)return pointOnSegment(segment,distance);
  const last=measured.segments.at(-1);return last?pointOnSegment(last,last.end):null;
}

export function drawPhosphorBeam(ctx,{path,fromPhase=0,toPhase=.01,coreWidth=1.15,bloomWidth=4.8,intensity=1,quality=1,head=true}={}){
  const measured=measureBeamPath(path),ranges=beamRanges(measured,fromPhase,toPhase);if(!ranges.length)return null;
  const q=clamp(quality,.35,1),power=clamp(intensity,0,2);
  ctx.save();ctx.strokeStyle='#fff';ctx.lineCap='round';ctx.lineJoin='round';ctx.globalCompositeOperation='lighter';
  if(bloomWidth>0)for(const range of ranges)strokeRange(ctx,measured,range[0],range[1],{lineWidth:bloomWidth*(.72+.28*q),alpha:.13*power*q});
  for(const range of ranges)strokeRange(ctx,measured,range[0],range[1],{lineWidth:coreWidth,alpha:.9*power});
  const beam=sampleBeamHead(path,toPhase);
  if(head&&beam&&!beam.blanked){
    ctx.fillStyle='#fff';ctx.globalAlpha=.14*power*q;ctx.beginPath();ctx.arc(beam.x,beam.y,5.5*(.8+.2*q),0,Math.PI*2);ctx.fill();
    ctx.globalAlpha=Math.min(1,.98*power);ctx.beginPath();ctx.arc(beam.x,beam.y,1.65,0,Math.PI*2);ctx.fill();
  }
  ctx.restore();return beam;
}

export function drawPhosphorFace(ctx,{width,height,rings=3,alpha=.004,axisAlpha=.01,borderAlpha=.16}={}){
  const w=width??ctx.canvas.clientWidth,h=height??ctx.canvas.clientHeight,cx=w*.5,cy=h*.5,r=Math.min(w,h)*.465;
  ctx.save();ctx.strokeStyle='#fff';ctx.lineWidth=1;
  ctx.globalAlpha=alpha;ctx.beginPath();
  for(let i=1;i<=rings;i++){ctx.moveTo(cx+r*i/rings,cy);ctx.arc(cx,cy,r*i/rings,0,Math.PI*2)}ctx.stroke();
  ctx.globalAlpha=axisAlpha;ctx.beginPath();ctx.moveTo(cx-r,cy);ctx.lineTo(cx+r,cy);ctx.moveTo(cx,cy-r);ctx.lineTo(cx,cy+r);ctx.stroke();
  ctx.globalAlpha=alpha*1.25;ctx.beginPath();
  for(let i=0;i<24;i++){const a=i*Math.PI*2/24,inner=r-5-(i%6===0?4:0);ctx.moveTo(cx+Math.cos(a)*inner,cy+Math.sin(a)*inner);ctx.lineTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r)}ctx.stroke();
  ctx.globalAlpha=borderAlpha;ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.stroke();ctx.restore();
  return {cx,cy,r};
}

export function phosphorDecayForHalfLife(dt,halfLife=.22){
  return clamp(1-Math.pow(.5,Math.max(0,dt)/Math.max(.001,halfLife)),0,1);
}
