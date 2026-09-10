import {clamp} from './engine.js';

export function createRingBuffer(capacity=4096){
  const size=Math.max(2,Math.trunc(capacity)),data=new Float32Array(size);let write=0,count=0;
  return {push(value){data[write]=Number(value)||0;write=(write+1)%size;count=Math.min(size,count+1)},pushMany(values){for(const value of values||[])this.push(value)},clear(){write=0;count=0;data.fill(0)},toArray(limit=count){const n=Math.min(count,Math.max(0,Math.trunc(limit)));const out=new Array(n),start=(write-n+size)%size;for(let i=0;i<n;i++)out[i]=data[(start+i)%size];return out},get length(){return count},get capacity(){return size}};
}

export function findTriggerIndex(samples,{level=0,edge='rising',hysteresis=.001,start=1,end}={}){
  const data=Array.from(samples||[]),stop=Math.min(data.length-1,end??data.length-1),h=Math.abs(hysteresis);
  for(let i=Math.max(1,start);i<=stop;i++){
    const a=Number(data[i-1]??0),b=Number(data[i]??0);
    if(edge==='falling'){if(a>level+h&&b<=level-h)return i}else if(a<level-h&&b>=level+h)return i;
  }
  return -1;
}

export function triggerWindow(channels,{count,level=0,edge='rising',pretrigger=.18}={}){
  const source=(channels||[]).map(channel=>Array.from(channel||[])),n=Math.max(2,Math.trunc(count??source[0]?.length??2));if(!source.length)return [];
  const primary=source[0],trigger=findTriggerIndex(primary,{level,edge,start:1,end:Math.max(2,primary.length-n+Math.floor(n*.75))});
  const anchor=trigger<0?Math.max(0,primary.length-n):Math.max(0,Math.min(primary.length-n,trigger-Math.floor(n*clamp(pretrigger,0,.8))));
  return source.map(channel=>channel.slice(anchor,anchor+n));
}

export function drawScopeGraticule(ctx,{x=0,y=0,width,height,xDiv=10,yDiv=8,alpha=.085,axisAlpha=.2,lineWidth=1}={}){
  const w=width??ctx.canvas.clientWidth,h=height??ctx.canvas.clientHeight;ctx.save();ctx.strokeStyle='#fff';ctx.lineWidth=lineWidth;
  for(let i=0;i<=xDiv;i++){ctx.globalAlpha=i===xDiv/2?axisAlpha:alpha;const px=x+w*i/xDiv;ctx.beginPath();ctx.moveTo(px,y);ctx.lineTo(px,y+h);ctx.stroke()}
  for(let i=0;i<=yDiv;i++){ctx.globalAlpha=i===yDiv/2?axisAlpha:alpha;const py=y+h*i/yDiv;ctx.beginPath();ctx.moveTo(x,py);ctx.lineTo(x+w,py);ctx.stroke()}
  ctx.globalAlpha=axisAlpha*.55;ctx.setLineDash([2,6]);ctx.beginPath();ctx.moveTo(x,y+h*.5);ctx.lineTo(x+w,y+h*.5);ctx.stroke();ctx.restore();
}

export function drawOscilloscope(ctx,{x=0,y=0,width,height,channels=[],lineWidth=1.35,alpha=1,graticule=true,triggerX=.18}={}){
  const w=width??ctx.canvas.clientWidth,h=height??ctx.canvas.clientHeight;if(graticule)drawScopeGraticule(ctx,{x,y,width:w,height:h});
  const list=channels.map(channel=>Array.isArray(channel)?{samples:channel}:channel);
  list.forEach((channel,index)=>{const data=Array.from(channel.samples||[]);if(data.length<2)return;ctx.save();ctx.strokeStyle='#fff';ctx.globalAlpha=(channel.alpha??(index?0.48:alpha));ctx.lineWidth=channel.lineWidth??lineWidth;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();const scale=channel.scale??.42,offset=channel.offset??0;for(let i=0;i<data.length;i++){const px=x+w*i/(data.length-1),py=y+h*(.5+offset)-clamp(Number(data[i]??0),-2,2)*h*scale;(i?ctx.lineTo(px,py):ctx.moveTo(px,py))}ctx.stroke();ctx.restore()});
  ctx.save();ctx.globalAlpha=.22;ctx.strokeStyle='#fff';ctx.lineWidth=1;const tx=x+w*clamp(triggerX,0,1);ctx.beginPath();ctx.moveTo(tx,y);ctx.lineTo(tx,y+7);ctx.stroke();ctx.restore();
}

export function drawXYScope(ctx,{x=0,y=0,width,height,xSamples=[],ySamples=[],lineWidth=1.2,alpha=.9,scale=.43}={}){
  const w=width??ctx.canvas.clientWidth,h=height??ctx.canvas.clientHeight,n=Math.min(xSamples.length,ySamples.length);if(n<2)return;ctx.save();ctx.strokeStyle='#fff';ctx.globalAlpha=alpha;ctx.lineWidth=lineWidth;ctx.lineJoin='round';ctx.lineCap='round';ctx.beginPath();for(let i=0;i<n;i++){const px=x+w*.5+clamp(Number(xSamples[i]??0),-1.2,1.2)*w*scale,py=y+h*.5-clamp(Number(ySamples[i]??0),-1.2,1.2)*h*scale;(i?ctx.lineTo(px,py):ctx.moveTo(px,py))}ctx.stroke();ctx.restore();
}
