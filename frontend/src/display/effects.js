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

export function withGlow(ctx,amount,draw,{alpha=.3}={}){
  if(!amount){draw();return}
  ctx.save();ctx.shadowColor=`rgba(255,255,255,${clamp(alpha)})`;ctx.shadowBlur=Math.max(0,amount);draw();ctx.restore();
}

export function drawScanlines(ctx,{width,height,spacing=4,alpha=.045,offset=0}={}){
  const w=width??ctx.canvas.clientWidth,h=height??ctx.canvas.clientHeight;ctx.save();ctx.fillStyle='#000';ctx.globalAlpha=clamp(alpha);for(let y=((offset%spacing)+spacing)%spacing;y<h;y+=spacing)ctx.fillRect(0,y,w,1);ctx.restore();
}

export function drawVignette(ctx,{width,height,strength=.34}={}){
  const w=width??ctx.canvas.clientWidth,h=height??ctx.canvas.clientHeight;const r=Math.max(w,h)*.72;const g=ctx.createRadialGradient(w/2,h/2,Math.min(w,h)*.12,w/2,h/2,r);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,`rgba(0,0,0,${clamp(strength)})`);ctx.save();ctx.fillStyle=g;ctx.fillRect(0,0,w,h);ctx.restore();
}

export function flashEnvelope(age,duration=.5){if(age<0||age>duration)return 0;const t=age/duration;return Math.sin(Math.PI*clamp(t))**1.6}
