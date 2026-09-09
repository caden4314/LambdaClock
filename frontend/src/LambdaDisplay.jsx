import { createEffect, onCleanup, onMount } from 'solid-js';

const V=(binder,key)=>({t:'v',binder,key});
const L=(id,body)=>({t:'l',id,body});
const A=(id,left,right)=>({t:'a',id,left,right});
const PROPS=['x1','y1','x2','y2'];

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

function collapsed(segment){
  if(segment.kind===2){
    return {...segment,y2:segment.y1};
  }
  if(segment.kind===1){
    return {...segment,x2:segment.x1};
  }
  const mid=(segment.x1+segment.x2)/2;
  return {...segment,x1:mid,x2:mid};
}

function spring(value,velocity,target,dt,omega){
  const offset=value-target;
  const b=velocity+omega*offset;
  const e=Math.exp(-omega*dt);
  return {
    value:target+(offset+b*dt)*e,
    velocity:(velocity-omega*b*dt)*e
  };
}

function makeItem(target,now,instant=false){
  const start=instant?target:collapsed(target);
  const item={
    kind:target.kind,
    x1:start.x1,y1:start.y1,x2:start.x2,y2:start.y2,
    a:instant?1:0,va:0,
    vx1:0,vy1:0,vx2:0,vy2:0,
    target:{...target},
    removing:false,
    geometryAt:instant?now:now+(target.kind===2?55:target.kind===1?125:165),
    fadeAt:instant?now:now+80,
    energy:instant?0:1
  };
  return item;
}

function removalTarget(item){
  const t={...item.target};
  if(item.kind===2){
    t.y2=t.y1;
  }else if(item.kind===1){
    t.x2=t.x1;
  }else{
    const mid=(t.x1+t.x2)/2;
    t.x1=mid;t.x2=mid;
  }
  return t;
}

export default function LambdaDisplay(props){
  let canvas,ctx,observer;
  const live=new Map();
  const view={w:3,h:3,vw:0,vh:0,targetW:3,targetH:3};
  let raf=0,last=performance.now(),mounted=false;
  let cssW=1,cssH=1,dpr=1;
  let first=true;
  const reduced=()=>globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  function ensureAnimation(){
    if(!mounted||raf)return;
    last=performance.now();
    raf=requestAnimationFrame(frame);
  }

  function setTarget(digits){
    const diagram=layout(timeTerm(digits));
    const now=performance.now();
    const instant=first||reduced();
    view.targetW=diagram.gridW;
    view.targetH=diagram.gridH;
    if(first){
      view.w=diagram.gridW;
      view.h=diagram.gridH;
      first=false;
    }

    const next=new Map(diagram.segments.map(s=>[s.id,s]));
    for(const [id,target] of next){
      let item=live.get(id);
      if(!item){
        item=makeItem(target,now,instant);
        live.set(id,item);
      }else{
        const moved=PROPS.some(p=>Math.abs(item.target[p]-target[p])>.001);
        item.target={...target};
        item.kind=target.kind;
        item.removing=false;
        item.geometryAt=now;
        item.fadeAt=now;
        if(moved)item.energy=1;
      }
    }

    for(const [id,item] of live){
      if(next.has(id))continue;
      if(!item.removing){
        item.removing=true;
        item.target=removalTarget(item);
        item.geometryAt=now;
        item.fadeAt=now+130;
        item.energy=1;
      }
    }

    if(reduced()){
      for(const [id,item] of [...live]){
        if(item.removing){live.delete(id);continue;}
        for(const p of PROPS){item[p]=item.target[p];item['v'+p]=0;}
        item.a=1;item.va=0;item.energy=0;
      }
      view.w=view.targetW;view.h=view.targetH;view.vw=0;view.vh=0;
      draw();
      return;
    }
    ensureAnimation();
  }

  createEffect(()=>setTarget(props.digits));

  function resize(){
    if(!canvas)return;
    const r=canvas.getBoundingClientRect();
    cssW=Math.max(1,r.width);
    cssH=Math.max(1,r.height);
    dpr=Math.min(3,Math.max(1,globalThis.devicePixelRatio||1));
    const w=Math.max(2,Math.round(cssW*dpr));
    const h=Math.max(2,Math.round(cssH*dpr));
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    ctx=canvas.getContext('2d');
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ensureAnimation();
  }

  function snap(value,lineWidth){
    const physicalWidth=Math.max(1,Math.round(lineWidth*dpr));
    const half=physicalWidth%2?0.5:0;
    return (Math.round(value*dpr-half)+half)/dpr;
  }

  function drawLine(item,scale,ox,oy,stroke){
    let x1=ox+item.x1*scale,x2=ox+item.x2*scale;
    let y1=oy+item.y1*scale,y2=oy+item.y2*scale;

    if(item.kind===2){
      const x=(x1+x2)/2;x1=x;x2=x;
    }else{
      const y=(y1+y2)/2;y1=y;y2=y;
    }

    const speed=Math.abs(item.vx1)+Math.abs(item.vx2)+Math.abs(item.vy1)+Math.abs(item.vy2);
    const settled=speed<.012&&item.energy<.018;
    if(settled){
      x1=snap(x1,stroke);x2=snap(x2,stroke);
      y1=snap(y1,stroke);y2=snap(y2,stroke);
    }

    const alpha=Math.max(0,Math.min(1,item.a));
    if(alpha<=.002)return;

    if(item.energy>.025){
      ctx.strokeStyle=`rgba(255,255,255,${alpha*item.energy*.07})`;
      ctx.lineWidth=stroke+Math.min(3,1.5+item.energy*1.5);
      ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
    }

    ctx.strokeStyle=`rgba(255,255,255,${alpha})`;
    ctx.lineWidth=stroke;
    ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
  }

  function draw(){
    if(!ctx)return;
    ctx.clearRect(0,0,cssW,cssH);
    const pad=10;
    const scale=Math.max(.5,Math.min((cssW-pad*2)/Math.max(1,view.w),(cssH-pad*2)/Math.max(1,view.h)));
    const drawW=view.w*scale,drawH=view.h*scale;
    const ox=(cssW-drawW)/2,oy=(cssH-drawH)/2;
    const stroke=Math.max(1.05,Math.min(3.7,scale*.58));
    ctx.lineCap='butt';
    ctx.lineJoin='miter';

    const ordered=[...live.values()].sort((a,b)=>a.energy-b.energy);
    for(const item of ordered)drawLine(item,scale,ox,oy,stroke);
  }

  function frame(now){
    raf=0;
    const dt=Math.min(.033,Math.max(.001,(now-last)/1000));
    last=now;
    let active=false;

    const vw=spring(view.w,view.vw,view.targetW,dt,9.5);
    const vh=spring(view.h,view.vh,view.targetH,dt,9.5);
    view.w=vw.value;view.vw=vw.velocity;
    view.h=vh.value;view.vh=vh.velocity;
    if(Math.abs(view.w-view.targetW)>.002||Math.abs(view.vw)>.01||Math.abs(view.h-view.targetH)>.002||Math.abs(view.vh)>.01)active=true;

    for(const [id,item] of [...live]){
      const geometryReady=now>=item.geometryAt;
      if(geometryReady){
        for(const p of PROPS){
          const next=spring(item[p],item['v'+p],item.target[p],dt,17);
          item[p]=next.value;item['v'+p]=next.velocity;
          if(Math.abs(item[p]-item.target[p])>.0015||Math.abs(item['v'+p])>.012)active=true;
        }
      }else active=true;

      const wantedAlpha=item.removing?(now>=item.fadeAt?0:1):(now>=item.fadeAt?1:0);
      const alpha=spring(item.a,item.va,wantedAlpha,dt,13);
      item.a=alpha.value;item.va=alpha.velocity;
      if(Math.abs(item.a-wantedAlpha)>.002||Math.abs(item.va)>.01)active=true;

      item.energy*=Math.exp(-dt*5.4);
      if(item.energy>.012)active=true;

      if(item.removing&&item.a<.003&&Math.abs(item.va)<.008){
        live.delete(id);
      }
    }

    draw();
    if(active)raf=requestAnimationFrame(frame);
  }

  onMount(()=>{
    mounted=true;
    resize();
    observer=new ResizeObserver(resize);
    observer.observe(canvas);
    ensureAnimation();
  });

  onCleanup(()=>{
    mounted=false;
    observer?.disconnect();
    if(raf)cancelAnimationFrame(raf);
  });

  return <canvas ref={canvas} class="lambda-display" aria-label="Animated Tromp lambda diagram of the current time"/>;
}
