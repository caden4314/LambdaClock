import {createEffect,onCleanup,onMount} from 'solid-js';

const V=(binder,key)=>({t:'v',binder,key});
const L=(id,body)=>({t:'l',id,body});
const A=(id,left,right)=>({t:'a',id,left,right});
const PROPS=['x1','y1','x2','y2'];
let CLONE_SERIAL=0;

function church(n,prefix){
  const f=prefix+':f',x=prefix+':x';
  let body=V(x,prefix+':xv');
  for(let i=0;i<n;i++) body=A(prefix+':a'+i,V(f,prefix+':fv'+i),body);
  return L(f,L(x,body));
}

function timeTerm(digits,overrideIndex=-1,overrideTerm=null){
  const k='time:k';
  let body=V(k,'time:kv');
  digits.forEach((d,i)=>{
    const value=i===overrideIndex&&overrideTerm?overrideTerm:church(d,'d'+i);
    body=A('time:app'+i,body,value);
  });
  return L(k,body);
}

function periodTerm(period){
  const truth='period:true',falsity='period:false';
  return L(truth,L(falsity,V(period==='PM'?truth:falsity,'period:value')));
}

function freshClone(node){
  const serial='c'+(++CLONE_SERIAL);
  const binders=new Map();
  let local=0;
  function copy(n){
    if(n.t==='v') return V(binders.get(n.binder)??n.binder,`${n.key}:${serial}:v${local++}`);
    if(n.t==='a') return A(`${n.id}:${serial}:a${local++}`,copy(n.left),copy(n.right));
    const nextId=`${n.id}:${serial}:l${local++}`;
    const previous=binders.get(n.id);
    binders.set(n.id,nextId);
    const body=copy(n.body);
    if(previous===undefined)binders.delete(n.id);else binders.set(n.id,previous);
    return L(nextId,body);
  }
  return copy(node);
}

function substitute(node,binder,arg){
  if(node.t==='v') return node.binder===binder?freshClone(arg):node;
  if(node.t==='l') return node.id===binder?node:L(node.id,substitute(node.body,binder,arg));
  return A(node.id,substitute(node.left,binder,arg),substitute(node.right,binder,arg));
}

function betaOnce(node){
  if(node.t==='a'&&node.left.t==='l'){
    return {node:substitute(node.left.body,node.left.id,node.right),reduced:true};
  }
  if(node.t==='a'){
    const left=betaOnce(node.left);
    if(left.reduced)return {node:A(node.id,left.node,node.right),reduced:true};
    const right=betaOnce(node.right);
    if(right.reduced)return {node:A(node.id,node.left,right.node),reduced:true};
    return {node,reduced:false};
  }
  if(node.t==='l'){
    const body=betaOnce(node.body);
    return body.reduced?{node:L(node.id,body.node),reduced:true}:{node,reduced:false};
  }
  return {node,reduced:false};
}

function successorApplication(n,index,seq){
  const p=`d${index}:red${seq}`;
  const N=p+':n',F=p+':f',X=p+':x';
  const nf=A(p+':nf',V(N,p+':nv'),V(F,p+':farg'));
  const nfx=A(p+':nfx',nf,V(X,p+':xarg'));
  const body=A(p+':body',V(F,p+':fhead'),nfx);
  const succ=L(N,L(F,L(X,body)));
  return A(p+':apply',succ,church(n,p+':arg'));
}

function reductionStages(previous,index,seq){
  let term=successorApplication(previous,index,seq);
  const stages=[term];
  for(let i=0;i<3;i++){
    const next=betaOnce(term);
    if(!next.reduced)break;
    term=next.node;
    stages.push(term);
  }
  return stages;
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

function branchFrom(value){
  const text=String(value||'');
  const digit=text.match(/(?:^|:)d([0-5])(?=:)/);
  if(digit)return Number(digit[1]);
  if(text.startsWith('time:'))return 'time';
  if(text.startsWith('period:'))return 'period';
  return null;
}

function shortName(value){
  const text=String(value||'');
  return text.length>34?text.slice(0,31)+'…':text;
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
      segments.push({id:'L:'+node.id,x1:s.min,y1:top,x2:s.max,y2:top,kind:0,branch:branchFrom(node.id),binder:node.id,label:`λ ${shortName(node.id)}`});
      walk(node.body,top+2);
      return;
    }
    walk(node.left,top);
    walk(node.right,top);
    const y=top+2*depth(node);
    const a=leftmost(node.left),b=leftmost(node.right);
    a.end=Math.max(a.end,y);
    b.end=Math.max(b.end,y);
    segments.push({id:'A:'+node.id,x1:a.gx,y1:y,x2:b.gx,y2:y,kind:1,branch:branchFrom(node.id),label:`application ${shortName(node.id)}`});
  }

  walk(root,0);
  for(const v of vars){
    const y1=binderY.get(v.binder)??0;
    const y2=Math.max(y1+2,v.end);
    segments.push({id:'V:'+v.key,x1:v.gx,y1,x2:v.gx,y2,kind:2,branch:branchFrom(v.key)??branchFrom(v.binder),binder:v.binder,label:`variable → ${shortName(v.binder)}`});
  }
  return {segments,gridW:Math.max(3,vars.length*4-1),gridH:depth(root)*2+1};
}

function collapsed(segment,point=null){
  if(point)return {...segment,x1:point.x,y1:point.y,x2:point.x,y2:point.y};
  if(segment.kind===2)return {...segment,y2:segment.y1};
  if(segment.kind===1)return {...segment,x2:segment.x1};
  const mid=(segment.x1+segment.x2)/2;
  return {...segment,x1:mid,x2:mid};
}

function spring(value,velocity,target,dt,omega){
  const offset=value-target;
  const b=velocity+omega*offset;
  const e=Math.exp(-omega*dt);
  return {value:target+(offset+b*dt)*e,velocity:(velocity-omega*b*dt)*e};
}

function makeItem(target,now,instant=false,delay=0,startPoint=null){
  const start=instant?target:collapsed(target,startPoint);
  return {
    id:target.id,kind:target.kind,branch:target.branch,binder:target.binder,label:target.label,
    x1:start.x1,y1:start.y1,x2:start.x2,y2:start.y2,
    a:instant?1:0,va:0,targetAlpha:1,
    vx1:0,vy1:0,vx2:0,vy2:0,target:{...target},removing:false,
    geometryAt:instant?now:now+delay+(target.kind===2?45:target.kind===1?95:135),
    fadeAt:instant?now:now+delay+55,energy:instant?0:1,
    pulseAt:-1,pulseDuration:620,sx1:0,sy1:0,sx2:0,sy2:0
  };
}

function removalTarget(item){
  const t={...item.target};
  if(item.kind===2)t.y2=t.y1;
  else if(item.kind===1)t.x2=t.x1;
  else{const mid=(t.x1+t.x2)/2;t.x1=mid;t.x2=mid;}
  return t;
}

function distanceToSegment(px,py,x1,y1,x2,y2){
  const dx=x2-x1,dy=y2-y1;
  const len=dx*dx+dy*dy;
  if(len<.0001)return Math.hypot(px-x1,py-y1);
  const t=Math.max(0,Math.min(1,((px-x1)*dx+(py-y1)*dy)/len));
  return Math.hypot(px-(x1+dx*t),py-(y1+dy*t));
}

export default function LambdaDisplay(props){
  let canvas,ctx,observer,holdTimer,inspectClearTimer;
  const live=new Map();
  const view={w:3,h:3,vw:0,vh:0,targetW:3,targetH:3};
  const inspection={id:null,label:false,x:0,y:0};
  const stageTimers=[];
  let raf=0,last=performance.now(),mounted=false,first=true,lastSeq=-1;
  let cssW=1,cssH=1,dpr=1;
  const reduced=()=>globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  function clearStageTimers(){while(stageTimers.length)clearTimeout(stageTimers.pop());}
  function schedule(fn,delay){const id=setTimeout(fn,delay);stageTimers.push(id);}
  function ensureAnimation(){if(!mounted||raf)return;last=performance.now();raf=requestAnimationFrame(frame);}

  function transitionDelay(target,transition,ignore=false){
    if(ignore||!transition)return 0;
    if(typeof target.branch==='number')return transition.delays?.[target.branch]||0;
    if(target.branch==='time'&&transition.changed?.length){
      return Math.max(0,...transition.changed.map(i=>transition.delays?.[i]||0))+70;
    }
    if(target.branch==='period'&&transition.periodChanged)return 230;
    return 0;
  }

  function affected(target,transition){
    if(!transition)return false;
    if(typeof target.branch==='number')return transition.changed?.includes(target.branch);
    if(target.branch==='time')return !!transition.changed?.length;
    if(target.branch==='period')return !!transition.periodChanged;
    return false;
  }

  function setTarget(root,meta={}){
    const diagram=layout(root);
    const now=performance.now();
    const instant=first||reduced();
    const transition=meta.transition;
    view.targetW=diagram.gridW;view.targetH=diagram.gridH;
    if(first){view.w=diagram.gridW;view.h=diagram.gridH;first=false;}
    const center=meta.specialRebuild?{x:diagram.gridW/2,y:diagram.gridH/2}:null;
    const next=new Map(diagram.segments.map(s=>[s.id,s]));

    for(const [id,target] of next){
      const delay=transitionDelay(target,transition,meta.ignoreCascade);
      let item=live.get(id);
      if(!item){
        item=makeItem(target,now,instant,delay,center);
        live.set(id,item);
      }else{
        const moved=PROPS.some(p=>Math.abs(item.target[p]-target[p])>.001);
        item.target={...target};item.kind=target.kind;item.branch=target.branch;item.binder=target.binder;item.label=target.label;
        item.removing=false;item.targetAlpha=1;item.geometryAt=now+delay;item.fadeAt=now+Math.min(delay,90);
        if(moved)item.energy=Math.max(item.energy,.9);
      }
      if(meta.pulse&&affected(target,transition)){
        item.pulseAt=now+delay+(target.branch==='time'?35:0);
        item.pulseDuration=transition?.changed?.length>1?720:610;
        item.energy=Math.max(item.energy,.72);
      }
    }

    for(const [id,item] of live){
      if(next.has(id))continue;
      if(!item.removing){
        const delay=transitionDelay(item.target,transition,meta.ignoreCascade);
        item.removing=true;item.target=removalTarget(item);item.targetAlpha=0;
        item.geometryAt=now+delay;item.fadeAt=now+delay+105;item.energy=1;
        if(meta.pulse&&affected(item,transition))item.pulseAt=now+delay;
      }
    }

    if(reduced()){
      for(const [id,item] of [...live]){
        if(item.removing){live.delete(id);continue;}
        for(const p of PROPS){item[p]=item.target[p];item['v'+p]=0;}
        item.a=item.targetAlpha;item.va=0;item.energy=0;item.pulseAt=-1;
      }
      view.w=view.targetW;view.h=view.targetH;view.vw=0;view.vh=0;draw(performance.now());return;
    }
    ensureAnimation();
  }

  function specialTransition(finalRoot,transition){
    clearStageTimers();
    const now=performance.now();
    const cx=view.w/2,cy=view.h/2;
    inspection.id=null;inspection.label=false;
    for(const item of live.values()){
      item.target={...item.target,x1:cx,y1:cy,x2:cx,y2:cy};
      item.targetAlpha=.055;item.geometryAt=now+(typeof item.branch==='number'?(5-item.branch)*18:0);
      item.fadeAt=now+80;item.energy=1.3;item.pulseAt=now;
    }
    ensureAnimation();
    schedule(()=>{
      live.clear();
      setTarget(finalRoot,{transition,pulse:true,specialRebuild:true,ignoreCascade:false});
    },350);
  }

  function reductionTransition(finalRoot,transition){
    clearStageTimers();
    const index=5;
    // Keep the real SUCC beta-reduction as lambda math, but do not expose
    // its temporary intermediate topology to the visual animation.
    reductionStages(transition.previousDigits[index],index,transition.seq);
    setTarget(finalRoot,{transition,pulse:true,ignoreCascade:true});
  }

  createEffect(()=>{
    const transition=props.transition||{seq:0,changed:[],delays:{}};
    const root=props.period!==undefined?periodTerm(props.period):timeTerm(props.digits??[]);
    const seq=transition.seq??0;
    if(seq===lastSeq){setTarget(root,{transition});return;}
    lastSeq=seq;
    clearStageTimers();
    if(transition.special&&!reduced())specialTransition(root,transition);
    else if(props.period===undefined&&transition.reduction&&!reduced())reductionTransition(root,transition);
    else setTarget(root,{transition,pulse:seq>0});
  });

  function resize(){
    if(!canvas)return;
    const r=canvas.getBoundingClientRect();cssW=Math.max(1,r.width);cssH=Math.max(1,r.height);
    dpr=Math.min(3,Math.max(1,globalThis.devicePixelRatio||1));
    const w=Math.max(2,Math.round(cssW*dpr)),h=Math.max(2,Math.round(cssH*dpr));
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ensureAnimation();
  }

  function snap(value,lineWidth){
    const physicalWidth=Math.max(1,Math.round(lineWidth*dpr));
    const half=physicalWidth%2?.5:0;
    return (Math.round(value*dpr-half)+half)/dpr;
  }

  function inspectStrength(item){
    if(!inspection.id)return 0;
    const selected=live.get(inspection.id);
    if(!selected)return 0;
    if(item.id===selected.id)return 1;
    if(selected.binder&&(item.binder===selected.binder||item.id==='L:'+selected.binder))return .95;
    if(selected.branch!==null&&item.branch===selected.branch)return .62;
    return 0;
  }

  function pulseValue(item,now){
    if(item.pulseAt<0)return 0;
    const phase=(now-item.pulseAt)/item.pulseDuration;
    if(phase<0||phase>1)return 0;
    return Math.sin(Math.PI*phase);
  }

  function drawLine(item,scale,ox,oy,stroke,now){
    let x1=ox+item.x1*scale,x2=ox+item.x2*scale,y1=oy+item.y1*scale,y2=oy+item.y2*scale;
    if(item.kind===2){const x=(x1+x2)/2;x1=x;x2=x;}else{const y=(y1+y2)/2;y1=y;y2=y;}
    const speed=Math.abs(item.vx1)+Math.abs(item.vx2)+Math.abs(item.vy1)+Math.abs(item.vy2);
    const pulse=pulseValue(item,now),inspect=inspectStrength(item);
    const activity=Math.max(Math.min(1,item.energy),pulse,inspect*.8,Math.min(1,speed*.08));
    const settled=speed<.012&&item.energy<.018&&pulse===0;
    const lineWidth=stroke*(1+activity*1.18);
    if(settled){x1=snap(x1,lineWidth);x2=snap(x2,lineWidth);y1=snap(y1,lineWidth);y2=snap(y2,lineWidth);}
    item.sx1=x1;item.sy1=y1;item.sx2=x2;item.sy2=y2;

    let alpha=Math.max(0,Math.min(1,item.a));
    if(inspection.id)alpha*=inspect>0?.98:.28;
    if(alpha<=.002)return;

    ctx.strokeStyle=`rgba(255,255,255,${alpha})`;ctx.lineWidth=lineWidth;
    ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();

    if(pulse>.02||item.energy>.04){
      const raw=item.pulseAt>=0?(now-item.pulseAt)/item.pulseDuration:(1-item.energy)*1.3;
      const travel=Math.max(0,Math.min(1,raw));
      const tail=Math.max(0,travel-.16),head=Math.min(1,travel+.1);
      const hx1=x1+(x2-x1)*tail,hy1=y1+(y2-y1)*tail;
      const hx2=x1+(x2-x1)*head,hy2=y1+(y2-y1)*head;
      const strength=Math.max(pulse,item.energy*.6);
      ctx.strokeStyle=`rgba(255,255,255,${alpha*strength*.34})`;
      ctx.lineWidth=lineWidth+1.4+strength*2.2;
      ctx.beginPath();ctx.moveTo(hx1,hy1);ctx.lineTo(hx2,hy2);ctx.stroke();
    }
  }

  function drawTooltip(){
    if(!inspection.label||!inspection.id)return;
    const item=live.get(inspection.id);if(!item)return;
    const text=item.label||item.id;
    ctx.font='12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    const width=Math.ceil(ctx.measureText(text).width)+14,height=25;
    const x=Math.max(6,Math.min(cssW-width-6,inspection.x+12));
    const y=Math.max(6,Math.min(cssH-height-6,inspection.y+12));
    ctx.fillStyle='rgba(0,0,0,.94)';ctx.fillRect(x,y,width,height);
    ctx.strokeStyle='rgba(255,255,255,.72)';ctx.lineWidth=1;ctx.strokeRect(x+.5,y+.5,width-1,height-1);
    ctx.fillStyle='#fff';ctx.fillText(text,x+7,y+16);
  }

  function draw(now=performance.now()){
    if(!ctx)return;
    ctx.clearRect(0,0,cssW,cssH);
    const pad=10;
    const scale=Math.max(.5,Math.min((cssW-pad*2)/Math.max(1,view.w),(cssH-pad*2)/Math.max(1,view.h)));
    const drawW=view.w*scale,drawH=view.h*scale,ox=(cssW-drawW)/2,oy=(cssH-drawH)/2;
    const stroke=Math.max(.68,Math.min(2.15,scale*.34));
    ctx.lineCap='butt';ctx.lineJoin='miter';
    const ordered=[...live.values()].sort((a,b)=>inspectStrength(a)-inspectStrength(b)||a.energy-b.energy);
    for(const item of ordered)drawLine(item,scale,ox,oy,stroke,now);
    drawTooltip();
  }

  function frame(now){
    raf=0;
    const dt=Math.min(.033,Math.max(.001,(now-last)/1000));last=now;
    let active=false;
    const vw=spring(view.w,view.vw,view.targetW,dt,9.5),vh=spring(view.h,view.vh,view.targetH,dt,9.5);
    view.w=vw.value;view.vw=vw.velocity;view.h=vh.value;view.vh=vh.velocity;
    if(Math.abs(view.w-view.targetW)>.002||Math.abs(view.vw)>.01||Math.abs(view.h-view.targetH)>.002||Math.abs(view.vh)>.01)active=true;

    for(const [id,item] of [...live]){
      if(now>=item.geometryAt){
        for(const p of PROPS){
          const next=spring(item[p],item['v'+p],item.target[p],dt,17);
          item[p]=next.value;item['v'+p]=next.velocity;
          if(Math.abs(item[p]-item.target[p])>.0015||Math.abs(item['v'+p])>.012)active=true;
        }
      }else active=true;
      const wanted=now>=item.fadeAt?item.targetAlpha:item.a;
      const alpha=spring(item.a,item.va,wanted,dt,13);item.a=alpha.value;item.va=alpha.velocity;
      if(Math.abs(item.a-wanted)>.002||Math.abs(item.va)>.01)active=true;
      item.energy*=Math.exp(-dt*4.35);if(item.energy>.012)active=true;
      if(item.pulseAt>=0&&now<item.pulseAt+item.pulseDuration)active=true;
      if(item.removing&&item.a<.003&&Math.abs(item.va)<.008)live.delete(id);
    }
    draw(now);if(active)raf=requestAnimationFrame(frame);
  }

  function hitTest(x,y){
    let best=null,bestDistance=14;
    for(const item of live.values()){
      if(item.a<.18)continue;
      const d=distanceToSegment(x,y,item.sx1,item.sy1,item.sx2,item.sy2);
      if(d<bestDistance){best=item;bestDistance=d;}
    }
    return best;
  }

  function setInspect(item,x,y,label=false){
    const id=item?.id||null;
    if(inspection.id===id&&inspection.label===label&&Math.abs(inspection.x-x)<1&&Math.abs(inspection.y-y)<1)return;
    inspection.id=id;inspection.label=label;inspection.x=x;inspection.y=y;ensureAnimation();
  }

  function eventPoint(event){const r=canvas.getBoundingClientRect();return{x:event.clientX-r.left,y:event.clientY-r.top};}
  function onPointerMove(event){
    if(event.pointerType!=='mouse')return;
    const p=eventPoint(event);setInspect(hitTest(p.x,p.y),p.x,p.y,false);
  }
  function onPointerDown(event){
    clearTimeout(holdTimer);clearTimeout(inspectClearTimer);
    const p=eventPoint(event),item=hitTest(p.x,p.y);setInspect(item,p.x,p.y,false);
    if(item){
      canvas.setPointerCapture?.(event.pointerId);
      holdTimer=setTimeout(()=>{inspection.label=true;ensureAnimation();},620);
    }
  }
  function onPointerUp(event){
    clearTimeout(holdTimer);
    if(event.pointerType!=='mouse')inspectClearTimer=setTimeout(()=>setInspect(null,0,0,false),850);
  }
  function onPointerLeave(event){if(event.pointerType==='mouse')setInspect(null,0,0,false);}

  onMount(()=>{
    mounted=true;resize();observer=new ResizeObserver(resize);observer.observe(canvas);
    canvas.addEventListener('pointermove',onPointerMove);canvas.addEventListener('pointerdown',onPointerDown);
    canvas.addEventListener('pointerup',onPointerUp);canvas.addEventListener('pointercancel',onPointerUp);canvas.addEventListener('pointerleave',onPointerLeave);
    ensureAnimation();
  });

  onCleanup(()=>{
    mounted=false;observer?.disconnect();if(raf)cancelAnimationFrame(raf);
    clearTimeout(holdTimer);clearTimeout(inspectClearTimer);clearStageTimers();
    canvas?.removeEventListener('pointermove',onPointerMove);canvas?.removeEventListener('pointerdown',onPointerDown);
    canvas?.removeEventListener('pointerup',onPointerUp);canvas?.removeEventListener('pointercancel',onPointerUp);canvas?.removeEventListener('pointerleave',onPointerLeave);
  });

  const label=()=>props.period!==undefined?`Animated Tromp lambda diagram of ${props.period}, encoded as a Church boolean`:'Animated Tromp lambda diagram of the current local time';
  return <canvas ref={canvas} class="lambda-display" aria-label={label()}/>;
}
