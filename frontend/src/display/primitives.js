import {clamp,lerp} from './engine.js';

export function normalizeValues(values,count,fill=0){
  const source=typeof values==='function'?Array.from({length:count},(_,i)=>values(i,count)):Array.from(values||[]);
  return Array.from({length:count},(_,i)=>clamp(Number(source[i]??fill),0,1));
}

export function sampleWave(fn,count=256,time=0){
  const n=Math.max(2,Math.trunc(count));
  return Array.from({length:n},(_,i)=>{
    const x=i/(n-1);
    return clamp(Number(fn?.(x,time,i,n)??0),-1,1);
  });
}

export function drawDotMatrix(ctx,{x=0,y=0,width,height,cols=16,rows=8,values,radius=.34,gap=.14,shape='circle',offAlpha=.08,onAlpha=1,pulse=0}={}){
  const w=width??ctx.canvas.clientWidth,h=height??ctx.canvas.clientHeight;
  const count=cols*rows,data=normalizeValues(values,count);
  const cellW=w/cols,cellH=h/rows,base=Math.min(cellW,cellH)*(1-gap);
  ctx.save();ctx.fillStyle='#fff';
  for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
    const i=row*cols+col,v=data[i],size=base*(.22+v*(radius*1.75));
    const cx=x+(col+.5)*cellW,cy=y+(row+.5)*cellH;
    ctx.globalAlpha=lerp(offAlpha,onAlpha,v)*(1+pulse*v*.18);
    if(shape==='square'){ctx.fillRect(cx-size/2,cy-size/2,size,size)}else{ctx.beginPath();ctx.arc(cx,cy,size/2,0,Math.PI*2);ctx.fill()}
  }
  ctx.restore();
}

export function drawPixelGrid(ctx,{x=0,y=0,width,height,cols=32,rows=18,values,gap=1,round=0,offAlpha=.025,onAlpha=1}={}){
  const w=width??ctx.canvas.clientWidth,h=height??ctx.canvas.clientHeight;
  const data=normalizeValues(values,cols*rows),cw=w/cols,ch=h/rows;
  ctx.save();ctx.fillStyle='#fff';
  for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
    const value=data[row*cols+col],px=x+col*cw+gap/2,py=y+row*ch+gap/2,pw=Math.max(0,cw-gap),ph=Math.max(0,ch-gap);
    ctx.globalAlpha=lerp(offAlpha,onAlpha,value);
    if(round>0&&ctx.roundRect){ctx.beginPath();ctx.roundRect(px,py,pw,ph,Math.min(round,pw/2,ph/2));ctx.fill()}else ctx.fillRect(px,py,pw,ph);
  }
  ctx.restore();
}

export function drawWave(ctx,{x=0,y=0,width,height,samples,lineWidth=1.5,amplitude=.42,center=.5,alpha=1,fill=false}={}){
  const w=width??ctx.canvas.clientWidth,h=height??ctx.canvas.clientHeight,data=Array.from(samples||[]);if(data.length<2)return;
  ctx.save();ctx.strokeStyle='#fff';ctx.fillStyle='#fff';ctx.lineWidth=lineWidth;ctx.lineJoin='round';ctx.lineCap='round';ctx.globalAlpha=alpha;
  ctx.beginPath();
  for(let i=0;i<data.length;i++){
    const px=x+(i/(data.length-1))*w,py=y+h*center-clamp(Number(data[i]??0),-1,1)*h*amplitude;
    if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);
  }
  if(fill){ctx.lineTo(x+w,y+h*center);ctx.lineTo(x,y+h*center);ctx.closePath();ctx.globalAlpha=alpha*.08;ctx.fill();ctx.globalAlpha=alpha}
  ctx.stroke();ctx.restore();
}

export function drawGrid(ctx,{x=0,y=0,width,height,xDiv=8,yDiv=4,alpha=.08,lineWidth=1}={}){
  const w=width??ctx.canvas.clientWidth,h=height??ctx.canvas.clientHeight;ctx.save();ctx.strokeStyle='#fff';ctx.globalAlpha=alpha;ctx.lineWidth=lineWidth;ctx.beginPath();
  for(let i=0;i<=xDiv;i++){const px=x+w*i/xDiv;ctx.moveTo(px,y);ctx.lineTo(px,y+h)}
  for(let i=0;i<=yDiv;i++){const py=y+h*i/yDiv;ctx.moveTo(x,py);ctx.lineTo(x+w,py)}
  ctx.stroke();ctx.restore();
}

export function drawPolyline(ctx,points,{alpha=1,lineWidth=1.5,closed=false}={}){
  if(!points?.length)return;ctx.save();ctx.strokeStyle='#fff';ctx.globalAlpha=alpha;ctx.lineWidth=lineWidth;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();ctx.moveTo(points[0][0],points[0][1]);for(let i=1;i<points.length;i++)ctx.lineTo(points[i][0],points[i][1]);if(closed)ctx.closePath();ctx.stroke();ctx.restore();
}
