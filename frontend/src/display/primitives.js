import {clamp,lerp} from './engine.js';

function readValue(values,index,count,fill=0){
  const raw=typeof values==='function'?values(index,count):values?.[index];
  return clamp(Number(raw??fill),0,1);
}

export function normalizeValues(values,count,fill=0){return Array.from({length:count},(_,i)=>readValue(values,i,count,fill))}
export function sampleWave(fn,count=256,time=0){const n=Math.max(2,Math.trunc(count));return Array.from({length:n},(_,i)=>clamp(Number(fn?.(i/(n-1),time,i,n)??0),-1,1))}

export function drawDotMatrix(ctx,{x=0,y=0,width,height,cols=16,rows=8,values,radius=.34,gap=.14,shape='circle',offAlpha=.08,onAlpha=1,pulse=0,sizeScale=1,alphaScale=1}={}){
  const w=width??ctx.canvas.clientWidth,h=height??ctx.canvas.clientHeight,count=cols*rows,cellW=w/cols,cellH=h/rows,base=Math.min(cellW,cellH)*(1-gap),ss=Math.max(.1,sizeScale),as=Math.max(0,alphaScale);
  ctx.save();ctx.fillStyle='#fff';
  for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
    const i=row*cols+col,v=readValue(values,i,count),size=base*(.22+v*(radius*1.75))*ss,cx=x+(col+.5)*cellW,cy=y+(row+.5)*cellH;
    ctx.globalAlpha=lerp(offAlpha,onAlpha,v)*(1+pulse*v*.18)*as;
    if(shape==='square')ctx.fillRect(cx-size/2,cy-size/2,size,size);else{ctx.beginPath();ctx.arc(cx,cy,size/2,0,Math.PI*2);ctx.fill()}
  }
  ctx.restore();
}

export function drawPixelGrid(ctx,{x=0,y=0,width,height,cols=32,rows=18,values,gap=1,round=0,offAlpha=.025,onAlpha=1,sizeScale=1,alphaScale=1}={}){
  const w=width??ctx.canvas.clientWidth,h=height??ctx.canvas.clientHeight,count=cols*rows,cw=w/cols,ch=h/rows,ss=Math.max(.1,sizeScale),as=Math.max(0,alphaScale);
  ctx.save();ctx.fillStyle='#fff';
  for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
    const i=row*cols+col,value=readValue(values,i,count),baseW=Math.max(0,cw-gap),baseH=Math.max(0,ch-gap),pw=Math.min(cw,baseW*ss),ph=Math.min(ch,baseH*ss),cx=x+(col+.5)*cw,cy=y+(row+.5)*ch,px=cx-pw/2,py=cy-ph/2;
    ctx.globalAlpha=lerp(offAlpha,onAlpha,value)*as;
    if(round>0&&ctx.roundRect){ctx.beginPath();ctx.roundRect(px,py,pw,ph,Math.min(round*ss,pw/2,ph/2));ctx.fill()}else ctx.fillRect(px,py,pw,ph);
  }
  ctx.restore();
}

export function drawWave(ctx,{x=0,y=0,width,height,samples,lineWidth=1.5,amplitude=.42,center=.5,alpha=1,fill=false,widthScale=1,alphaScale=1}={}){
  const w=width??ctx.canvas.clientWidth,h=height??ctx.canvas.clientHeight,data=samples||[],n=data.length??0;if(n<2)return;
  ctx.save();ctx.strokeStyle='#fff';ctx.fillStyle='#fff';ctx.lineWidth=lineWidth*Math.max(.1,widthScale);ctx.lineJoin='round';ctx.lineCap='round';ctx.globalAlpha=alpha*Math.max(0,alphaScale);ctx.beginPath();
  for(let i=0;i<n;i++){const px=x+(i/(n-1))*w,py=y+h*center-clamp(Number(data[i]??0),-1,1)*h*amplitude;i?ctx.lineTo(px,py):ctx.moveTo(px,py)}
  if(fill){ctx.lineTo(x+w,y+h*center);ctx.lineTo(x,y+h*center);ctx.closePath();ctx.globalAlpha=alpha*.08*Math.max(0,alphaScale);ctx.fill();ctx.globalAlpha=alpha*Math.max(0,alphaScale)}
  ctx.stroke();ctx.restore();
}

export function drawGrid(ctx,{x=0,y=0,width,height,xDiv=8,yDiv=4,alpha=.08,lineWidth=1}={}){
  const w=width??ctx.canvas.clientWidth,h=height??ctx.canvas.clientHeight;ctx.save();ctx.strokeStyle='#fff';ctx.globalAlpha=alpha;ctx.lineWidth=lineWidth;ctx.beginPath();
  for(let i=0;i<=xDiv;i++){const px=x+w*i/xDiv;ctx.moveTo(px,y);ctx.lineTo(px,y+h)}for(let i=0;i<=yDiv;i++){const py=y+h*i/yDiv;ctx.moveTo(x,py);ctx.lineTo(x+w,py)}ctx.stroke();ctx.restore();
}

export function drawPolyline(ctx,points,{alpha=1,lineWidth=1.5,closed=false,widthScale=1,alphaScale=1}={}){
  const n=points?.length??0;if(!n)return;ctx.save();ctx.strokeStyle='#fff';ctx.globalAlpha=alpha*Math.max(0,alphaScale);ctx.lineWidth=lineWidth*Math.max(.1,widthScale);ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();ctx.moveTo(points[0][0],points[0][1]);for(let i=1;i<n;i++)ctx.lineTo(points[i][0],points[i][1]);if(closed)ctx.closePath();ctx.stroke();ctx.restore();
}
