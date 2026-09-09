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
  digits.forEach((d,i)=>{body=A('time:app'+i,body,church(d,'d'+i));});
  return L(k,body);
}

function leaves(node,out=[]){
  if(node.t==='v') out.push(node);
  else if(node.t==='l') leaves(node.body,out);
  else {leaves(node.left,out);leaves(node.right,out);}
  return out;
}

function depth(node){
  if(node.t==='v') return 0;
  if(node.t==='l') return 1+depth(node.body);
  return 1+Math.max(depth(node.left),depth(node.right));
}

function leftmost(node){
  if(node.t==='v') return node;
  if(node.t==='l') return leftmost(node.body);
  return leftmost(node.left);
}

function layout(root){
  const vars=leaves(root,[]);
  vars.forEach((v,i)=>{v.gx=1+i*4;v.end=0;});
  const segments=[];
  const binderY=new Map();

  function span(node){
    const xs=leaves(node,[]).map(v=>v.gx);
    return {min:Math.min(...xs)-1,max:Math.max(...xs)+2};
  }

  function walk(node,top=0){
    if(node.t==='v'){
      node.end=Math.max(node.end,top);
      return;
    }
    if(node.t==='l'){
      const s=span(node.body);
      binderY.set(node.id,top);
      segments.push({id:'L:'+node.id,x1:s.min,y1:top,x2:s.max,y2:top,kind:0});
      walk(node.body,top+2);
      return;
    }

    walk(node.left,top);
    walk(node.right,top);
    const y=top+2*depth(node);
    const a=leftmost(node.left),b=leftmost(node.right);
    a.end=Math.max(a.end,y);
    b.end=Math.max(b.end,y);
    segments.push({id:'A:'+node.id,x1:a.gx,y1:y,x2:b.gx,y2:y,kind:1});
  }

  walk(root,0);

  for(const v of vars){
    const y1=binderY.get(v.binder)??0;
    const y2=Math.max(y1+2,v.end);
    segments.push({id:'V:'+v.key,x1:v.gx,y1,x2:v.gx,y2,kind:2});
  }

  return {
    segments,
    gridW:Math.max(3,vars.length*4-1),
    gridH:depth(root)*2+1
  };
}

export default function LambdaDisplay(props){
  let canvas;
  const live=new Map();
  let ctx=null,raf=0,last=performance.now();
  let gridW=3,gridH=3;

  function setTarget(digits){
    const diagram=layout(timeTerm(digits));
    gridW=diagram.gridW;
    gridH=diagram.gridH;
    const next=new Map(diagram.segments.map(s=>[s.id,s]));

    for(const [id,target] of next){
      let item=live.get(id);
      if(!item){
        const mx=(target.x1+target.x2)/2,my=(target.y1+target.y2)/2;
        item={x1:mx,y1:my,x2:mx,y2:my,a:0,target:{...target,a:1},kind:target.kind};
        live.set(id,item);
      }else{
        item.target={...target,a:1};
        item.kind=target.kind;
      }
    }
    for(const [id,item] of live){
      if(!next.has(id)) item.target={...item.target,a:0};
    }
  }

  createEffect(()=>setTarget(props.digits));

  function resize(){
    if(!canvas)return;
    const r=canvas.getBoundingClientRect();
    const dpr=Math.min(2,devicePixelRatio||1);
    const w=Math.max(2,Math.round(r.width*dpr));
    const h=Math.max(2,Math.round(r.height*dpr));
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    ctx=canvas.getContext('2d');
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }

  function frame(now){
    resize();
    const dt=Math.min(.05,(now-last)/1000);last=now;
    const k=1-Math.exp(-dt*15);
    const w=canvas.clientWidth,h=canvas.clientHeight;
    ctx.clearRect(0,0,w,h);

    const pad=10;
    const scale=Math.max(.5,Math.min((w-pad*2)/gridW,(h-pad*2)/gridH));
    const drawW=gridW*scale,drawH=gridH*scale;
    const ox=(w-drawW)/2,oy=(h-drawH)/2;
    const stroke=Math.max(1.2,Math.min(5,scale*.82));

    ctx.lineCap='butt';
    ctx.lineJoin='miter';

    for(const [id,item] of [...live]){
      for(const p of ['x1','y1','x2','y2','a']) item[p]+=(item.target[p]-item[p])*k;
      if(item.target.a===0&&item.a<.01){live.delete(id);continue;}

      const alpha=Math.max(0,Math.min(1,item.a));
      const x1=ox+item.x1*scale,x2=ox+item.x2*scale;
      const y1=oy+item.y1*scale,y2=oy+item.y2*scale;
      ctx.strokeStyle=`rgba(255,255,255,${alpha})`;
      ctx.lineWidth=stroke;
      ctx.beginPath();
      ctx.moveTo(x1,y1);
      ctx.lineTo(x2,y2);
      ctx.stroke();
    }

    raf=requestAnimationFrame(frame);
  }

  onMount(()=>{resize();last=performance.now();raf=requestAnimationFrame(frame);});
  onCleanup(()=>cancelAnimationFrame(raf));
  return <canvas ref={canvas} class="lambda-display" aria-label="Animated Tromp lambda diagram of the current time"/>;
}
