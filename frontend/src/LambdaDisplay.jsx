import { createEffect, onCleanup, onMount } from 'solid-js';

const V=(binder,key)=>({t:'v',binder,key});
const L=(id,body)=>({t:'l',id,body});
const A=(id,left,right)=>({t:'a',id,left,right});

function church(n,prefix){
  const f=prefix+':f',x=prefix+':x';
  let body=V(x,prefix+':xv');
  for(let i=0;i<n;i++) body=A(prefix+':a'+i,V(f,prefix+':fv'+i),body);
  return L(f,L(x,body));
}

function timeTerm(digits){
  const k='time:k';
  let body=V(k,'time:kv');
  digits.forEach((d,i)=>{ body=A('time:app'+i,body,church(d,'d'+i)); });
  return L(k,body);
}

function collectLeaves(node,out=[]){
  if(node.t==='v') out.push(node);
  else if(node.t==='l') collectLeaves(node.body,out);
  else { collectLeaves(node.left,out); collectLeaves(node.right,out); }
  return out;
}

function layout(root){
  const leaves=collectLeaves(root,[]);
  const index=new Map(leaves.map((v,i)=>[v.key,i]));
  const segments=[];
  const bindY=new Map();
  const usage=new Map();
  const maxX=Math.max(1,leaves.length-1);
  leaves.forEach((v,i)=>v.x=leaves.length===1?.5:i/maxX);

  function lambdaPass(node,depth=0){
    if(node.t==='l'){
      const xs=collectLeaves(node.body,[]).map(v=>v.x);
      const y=.05+depth*.045;
      bindY.set(node.id,y);
      segments.push({id:'L:'+node.id,x1:Math.min(...xs),y1:y,x2:Math.max(...xs),y2:y,kind:0});
      lambdaPass(node.body,depth+1);
    } else if(node.t==='a'){
      lambdaPass(node.left,depth);lambdaPass(node.right,depth);
    }
  }

  function appDepth(node,depth=0){
    if(node.t==='a') return Math.max(appDepth(node.left,depth+1),appDepth(node.right,depth+1));
    if(node.t==='l') return appDepth(node.body,depth);
    return depth;
  }
  const maxDepth=Math.max(1,appDepth(root));
  function leftX(node){return collectLeaves(node,[])[0]?.x??.5;}
  function appPass(node,depth=0){
    if(node.t==='a'){
      const y=.32+(depth/maxDepth)*.56;
      segments.push({id:'A:'+node.id,x1:leftX(node.left),y1:y,x2:leftX(node.right),y2:y,kind:1});
      collectLeaves(node,[]).forEach(v=>usage.set(v.key,Math.max(usage.get(v.key)||0,y)));
      appPass(node.left,depth+1);appPass(node.right,depth+1);
    } else if(node.t==='l') appPass(node.body,depth);
  }
  lambdaPass(root);appPass(root);

  for(const v of leaves){
    const y1=bindY.get(v.binder)??.03;
    const y2=Math.max(y1+.04,usage.get(v.key)??.9);
    segments.push({id:'V:'+v.key,x1:v.x,y1,x2:v.x,y2,kind:2});
  }
  return segments;
}

export default function LambdaDisplay(props){
  let canvas;
  const live=new Map();
  let ctx=null,raf=0,last=performance.now(),pulse=0;

  function setTarget(digits){
    const next=new Map(layout(timeTerm(digits)).map(s=>[s.id,s]));
    for(const [id,target] of next){
      let item=live.get(id);
      if(!item){
        const mx=(target.x1+target.x2)/2,my=(target.y1+target.y2)/2;
        item={x1:mx,y1:my,x2:mx,y2:my,a:0,target:{...target,a:1},kind:target.kind};
        live.set(id,item);
      } else item.target={...target,a:1};
    }
    for(const [id,item] of live) if(!next.has(id)) item.target={...item.target,a:0};
    pulse=1;
  }

  createEffect(()=>setTarget(props.digits));

  function resize(){
    if(!canvas)return;
    const r=canvas.getBoundingClientRect(),dpr=Math.min(2,devicePixelRatio||1);
    const w=Math.max(2,Math.round(r.width*dpr)),h=Math.max(2,Math.round(r.height*dpr));
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);
  }

  function frame(now){
    resize();
    const dt=Math.min(.05,(now-last)/1000);last=now;
    const k=1-Math.exp(-dt*13);
    pulse*=Math.exp(-dt*5);
    const w=canvas.clientWidth,h=canvas.clientHeight;
    ctx.clearRect(0,0,w,h);ctx.lineCap='round';ctx.lineJoin='round';
    for(const [id,item] of [...live]){
      for(const p of ['x1','y1','x2','y2','a']) item[p]+=(item.target[p]-item[p])*k;
      const alpha=Math.max(0,item.a);
      if(item.target.a===0&&alpha<.01){live.delete(id);continue;}
      const x1=18+item.x1*(w-36),x2=18+item.x2*(w-36),y1=8+item.y1*(h-16),y2=8+item.y2*(h-16);
      const base=item.kind===1?.82:item.kind===0?.58:.42;
      ctx.strokeStyle=`rgba(255,255,255,${alpha*(.05+.08*pulse)})`;ctx.lineWidth=5;
      ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
      ctx.strokeStyle=`rgba(255,255,255,${alpha*base})`;ctx.lineWidth=item.kind===1?1.25:1;
      ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
    }
    raf=requestAnimationFrame(frame);
  }

  onMount(()=>{resize();last=performance.now();raf=requestAnimationFrame(frame);});
  onCleanup(()=>cancelAnimationFrame(raf));
  return <canvas ref={canvas} class="lambda-display" aria-label="Animated Tromp-style lambda diagram of the current time"/>;
}
