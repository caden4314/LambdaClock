import {clamp} from './engine.js';

export function cartesianTransform({xMin=-5,xMax=5,yMin=-5,yMax=5,width=1,height=1}={}){
  const sx=width/Math.max(1e-12,xMax-xMin),sy=height/Math.max(1e-12,yMax-yMin);
  const xToCanvas=x=>(x-xMin)*sx,yToCanvas=y=>height-(y-yMin)*sy,xToWorld=px=>xMin+px/sx,yToWorld=py=>yMin+(height-py)/sy;
  return {toCanvas(x,y){return [xToCanvas(x),yToCanvas(y)]},toWorld(px,py){return [xToWorld(px),yToWorld(py)]},xToCanvas,yToCanvas,xToWorld,yToWorld,xMin,xMax,yMin,yMax,width,height};
}

export function drawAxes(ctx,{width,height,xMin=-5,xMax=5,yMin=-5,yMax=5,xStep=1,yStep=1,gridAlpha=.055,axisAlpha=.24}={}){
  const t=cartesianTransform({width,height,xMin,xMax,yMin,yMax});ctx.save();ctx.strokeStyle='#fff';ctx.lineWidth=1;
  ctx.globalAlpha=gridAlpha;ctx.beginPath();for(let x=Math.ceil(xMin/xStep)*xStep;x<=xMax;x+=xStep){const px=t.xToCanvas(x);ctx.moveTo(px,0);ctx.lineTo(px,height)}for(let y=Math.ceil(yMin/yStep)*yStep;y<=yMax;y+=yStep){const py=t.yToCanvas(y);ctx.moveTo(0,py);ctx.lineTo(width,py)}ctx.stroke();
  ctx.globalAlpha=axisAlpha;ctx.beginPath();if(xMin<=0&&xMax>=0){const px=t.xToCanvas(0);ctx.moveTo(px,0);ctx.lineTo(px,height)}if(yMin<=0&&yMax>=0){const py=t.yToCanvas(0);ctx.moveTo(0,py);ctx.lineTo(width,py)}ctx.stroke();ctx.restore();return t;
}

export function drawFunctionPlot(ctx,fn,{width,height,xMin=-5,xMax=5,yMin=-5,yMax=5,samples=1200,lineWidth=1.25,alpha=.95,axes=true,widthScale=1,alphaScale=1}={}){
  const t=axes?drawAxes(ctx,{width,height,xMin,xMax,yMin,yMax}):cartesianTransform({width,height,xMin,xMax,yMin,yMax}),n=Math.max(32,Math.trunc(samples)),range=xMax-xMin;ctx.save();ctx.strokeStyle='#fff';ctx.globalAlpha=alpha*Math.max(0,alphaScale);ctx.lineWidth=lineWidth*Math.max(.1,widthScale);ctx.lineJoin='round';ctx.lineCap='round';ctx.beginPath();let started=false;
  for(let i=0;i<n;i++){const x=xMin+range*i/(n-1),y=Number(fn?.(x,i,n));if(!Number.isFinite(y)||y<yMin*20||y>yMax*20){started=false;continue}const px=t.xToCanvas(x),py=t.yToCanvas(y);if(!started){ctx.moveTo(px,py);started=true}else ctx.lineTo(px,py)}ctx.stroke();ctx.restore();return t;
}

export function drawVectorField(ctx,field,{width,height,xMin=-2,xMax=2,yMin=-2,yMax=2,cols=18,rows=12,alpha=.42,maxLength=.32}={}){
  const t=cartesianTransform({width,height,xMin,xMax,yMin,yMax}),cellX=(xMax-xMin)/cols,cellY=(yMax-yMin)/rows;ctx.save();ctx.strokeStyle='#fff';ctx.fillStyle='#fff';ctx.globalAlpha=alpha;ctx.lineWidth=1;
  for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
    const x=xMin+(col+.5)*cellX,y=yMin+(row+.5)*cellY,vector=field?.(x,y)??[0,0],u0=Number(vector[0])||0,v0=Number(vector[1])||0,mag=Math.hypot(u0,v0)||1,u=u0/mag*cellX*maxLength,v=v0/mag*cellY*maxLength;
    const x1=t.xToCanvas(x-u*.5),y1=t.yToCanvas(y-v*.5),x2=t.xToCanvas(x+u*.5),y2=t.yToCanvas(y+v*.5),angle=Math.atan2(y2-y1,x2-x1),head=3;
    ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();ctx.beginPath();ctx.moveTo(x2,y2);ctx.lineTo(x2-Math.cos(angle-.55)*head,y2-Math.sin(angle-.55)*head);ctx.lineTo(x2-Math.cos(angle+.55)*head,y2-Math.sin(angle+.55)*head);ctx.closePath();ctx.fill();
  }
  ctx.restore();return t;
}

export function mapToViewport(value,min,max){return clamp((value-min)/Math.max(1e-12,max-min),0,1)}
