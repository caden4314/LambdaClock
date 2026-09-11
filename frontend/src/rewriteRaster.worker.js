import {initialDirection,makeSeededTurnCursor,normalizeSeed} from '../../shared/rewrite-seed.js';

let activeId=0;
const yieldTurn=()=>new Promise(resolve=>setTimeout(resolve,0));

function configure(ctx,camera,dpr){
  const far=Math.max(0,Math.min(1,(1.15-camera.scale)/1.08));
  ctx.setTransform(dpr*camera.scale,0,0,dpr*camera.scale,dpr*camera.ox,dpr*camera.oy);
  ctx.lineCap='round';ctx.lineJoin='round';
  ctx.strokeStyle=`rgba(255,255,255,${.58-.25*far})`;
  ctx.lineWidth=(.86+.22*(1-far))/camera.scale;
}

async function renderExact(job){
  const {id,seed,step,width,height,dpr,camera}=job;
  const pixelW=Math.max(1,Math.round(width*dpr)),pixelH=Math.max(1,Math.round(height*dpr));
  const canvas=new OffscreenCanvas(pixelW,pixelH),ctx=canvas.getContext('2d',{alpha:true,desynchronized:true});
  ctx.clearRect(0,0,pixelW,pixelH);configure(ctx,camera,dpr);
  const normalized=normalizeSeed(seed),cursor=makeSeededTurnCursor(normalized,1);
  let x=0,y=0,dir=initialDirection(normalized),done=0,lastProgress=-1;
  while(done<step){
    if(id!==activeId)return;
    const end=Math.min(step,done+200000);
    ctx.beginPath();ctx.moveTo(x,y);
    for(;done<end;done++){
      if(dir===0)x++;else if(dir===1)y++;else if(dir===2)x--;else y--;
      const turn=cursor.next();dir=(dir+(turn>0?1:3))&3;ctx.lineTo(x,y);
    }
    ctx.stroke();
    const progress=step?Math.floor(done*100/step):100;
    if(progress!==lastProgress&&(progress===100||progress-lastProgress>=2)){
      lastProgress=progress;postMessage({type:'progress',id,progress,done,step});
    }
    await yieldTurn();
  }
  if(id!==activeId)return;
  const bitmap=canvas.transferToImageBitmap();
  postMessage({type:'rendered',id,step,camera,width,height,dpr,x,y,dir,bitmap},[bitmap]);
}

self.onmessage=event=>{
  const job=event.data||{};
  if(job.type==='cancel'){activeId=Number(job.id)||activeId+1;return}
  if(job.type!=='render')return;
  activeId=Number(job.id);renderExact(job).catch(error=>postMessage({type:'error',id:job.id,message:String(error?.stack||error)}));
};

