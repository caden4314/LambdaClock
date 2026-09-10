import {clamp,lerp} from './engine.js';

export const smoothstep=t=>{const x=clamp(t);return x*x*(3-2*x)};
export const smootherstep=t=>{const x=clamp(t);return x*x*x*(x*(x*6-15)+10)};
export const pulse=(time,hz=1,phase=0)=>.5-.5*Math.cos((time*hz+phase)*Math.PI*2);
export const triangle=(time,hz=1,phase=0)=>1-Math.abs((((time*hz+phase)%1)+1)%1*2-1);

export function springStep(state,target,dt,{frequency=8,damping=1}={}){
  const omega=Math.max(.001,frequency*Math.PI*2),zeta=Math.max(.05,damping);
  const x=state.value-target,v=state.velocity??0;
  const a=-2*zeta*omega*v-omega*omega*x;
  const nv=v+a*dt;return {value:target+(x+nv*dt),velocity:nv};
}

export function exponentialSmoothing(current,target,dt,speed=10){return lerp(current,target,1-Math.exp(-Math.max(0,speed)*dt))}

export function withGlow(ctx,amount,draw,{alpha=.3,quality=1}={}){
  const q=clamp(Number(quality)||1,.35,1);
  if(!amount||q<.58){draw();return}
  ctx.save();ctx.shadowColor=`rgba(255,255,255,${clamp(alpha)*q})`;ctx.shadowBlur=Math.max(0,amount*(.55+.45*q));draw();ctx.restore();
}

export function drawScanlines(ctx,{width,height,spacing=4,alpha=.045,offset=0}={}){
  const w=width??ctx.canvas.clientWidth,h=height??ctx.canvas.clientHeight,step=Math.max(2,spacing);
  ctx.save();ctx.strokeStyle='#000';ctx.globalAlpha=clamp(alpha);ctx.lineWidth=1;ctx.beginPath();
  for(let y=((offset%step)+step)%step+.5;y<h;y+=step){ctx.moveTo(0,y);ctx.lineTo(w,y)}
  ctx.stroke();ctx.restore();
}

const vignetteCache=new WeakMap();
export function drawVignette(ctx,{width,height,strength=.34}={}){
  const w=width??ctx.canvas.clientWidth,h=height??ctx.canvas.clientHeight,s=clamp(strength);
  const key=`${ctx.canvas.width}x${ctx.canvas.height}:${Math.round(w*10)}:${Math.round(h*10)}:${Math.round(s*1000)}`;
  let cached=vignetteCache.get(ctx);
  if(!cached||cached.key!==key){
    const r=Math.max(w,h)*.72,g=ctx.createRadialGradient(w/2,h/2,Math.min(w,h)*.12,w/2,h/2,r);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,`rgba(0,0,0,${s})`);cached={key,gradient:g};vignetteCache.set(ctx,cached);
  }
  ctx.save();ctx.fillStyle=cached.gradient;ctx.fillRect(0,0,w,h);ctx.restore();
}

export function flashEnvelope(age,duration=.5){if(age<0||age>duration)return 0;const t=age/duration;return Math.sin(Math.PI*clamp(t))**1.6}
