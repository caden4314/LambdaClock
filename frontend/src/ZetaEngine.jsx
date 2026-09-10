import {createMemo,createSignal,onCleanup,onMount} from 'solid-js';
import ProjectLambdaPanel from './ProjectLambdaPanel.jsx';

const ZERO_PRESETS=[
  ['ζ₁',14.134725],
  ['ζ₂',21.022040],
  ['ζ₃',25.010858],
  ['ζ₄',30.424876]
];

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const fmt=(v,d=6)=>Number.isFinite(v)?v.toFixed(d):'—';
const cabs=(re,im)=>Math.hypot(re,im);
const theta=t=>.5*t*Math.log(t/(2*Math.PI))-.5*t-Math.PI/8+1/(48*t)+7/(5760*t*t*t);

function denominator(t){
  const a=Math.SQRT2;
  const theta=-t*Math.LN2;
  return {re:1-a*Math.cos(theta),im:-a*Math.sin(theta)};
}
function divide(ar,ai,br,bi){
  const d=br*br+bi*bi;
  return {re:(ar*br+ai*bi)/d,im:(ai*br-ar*bi)/d};
}

export default function ZetaEngine(){
  const [t,setT]=createSignal(14.134725);
  const [running,setRunning]=createSignal(true);
  const [density,setDensity]=createSignal(5);
  const [snapshot,setSnapshot]=createSignal({n:0,re:0,im:0,etaRe:0,etaIm:0,term:1});
  const [trail,setTrail]=createSignal([{re:0,im:0,n:0}]);
  let canvas,ctx,ro,raf=0,lastPublish=0,viewScale=1;
  let n=0,sumRe=0,sumIm=0,cRe=0,cIm=0,den=denominator(t());
  let trace=[{re:0,im:0,n:0}];

  function reset(nextT=t()){
    n=0;sumRe=0;sumIm=0;cRe=0;cIm=0;den=denominator(nextT);
    trace=[{re:0,im:0,n:0}];viewScale=1;
    const fresh={n:0,re:0,im:0,etaRe:0,etaIm:0,term:1};
    setSnapshot(fresh);setTrail(trace);
  }

  function addTerm(){
    n+=1;
    const sign=n%2===1?1:-1;
    const amp=1/Math.sqrt(n);
    const angle=-t()*Math.log(n);
    const tr=sign*amp*Math.cos(angle),ti=sign*amp*Math.sin(angle);
    let y=tr-cRe,tmp=sumRe+y;cRe=(tmp-sumRe)-y;sumRe=tmp;
    y=ti-cIm;tmp=sumIm+y;cIm=(tmp-sumIm)-y;sumIm=tmp;
    const z=divide(sumRe,sumIm,den.re,den.im);
    return {n,re:z.re,im:z.im,etaRe:sumRe,etaIm:sumIm,term:amp};
  }

  function batch(count){
    let s=snapshot();
    for(let i=0;i<count;i++)s=addTerm();
    return s;
  }

  const modulus=createMemo(()=>cabs(snapshot().re,snapshot().im));
  const argument=createMemo(()=>Math.atan2(snapshot().im,snapshot().re));
  const hardyZ=createMemo(()=>snapshot().re*Math.cos(theta(t()))-snapshot().im*Math.sin(theta(t())));
  const lambdaN=createMemo(()=>snapshot().n%10);
  const lambdaMag=createMemo(()=>clamp(Math.round(modulus()*4),0,9));
  const lambdaPhase=createMemo(()=>clamp(Math.round(((argument()+Math.PI)/(2*Math.PI))*8),0,8));

  function resize(){
    const r=canvas.getBoundingClientRect(),d=Math.min(2,devicePixelRatio||1);
    canvas.width=Math.max(2,Math.round(r.width*d));
    canvas.height=Math.max(2,Math.round(r.height*d));
    ctx=canvas.getContext('2d');ctx.setTransform(d,0,0,d,0,0);draw();
  }

  function draw(){
    if(!ctx||!canvas)return;
    const d=Math.min(2,devicePixelRatio||1),w=canvas.width/d,h=canvas.height/d,data=trail();
    ctx.clearRect(0,0,w,h);
    let max=0.04;
    for(const p of data)max=Math.max(max,Math.abs(p.re),Math.abs(p.im));
    viewScale+=(max*1.18-viewScale)*.045;
    const scale=.43*Math.min(w,h)/Math.max(.025,viewScale),cx=w/2,cy=h/2;
    ctx.lineWidth=1;ctx.strokeStyle='rgba(255,255,255,.11)';
    ctx.beginPath();ctx.moveTo(0,cy);ctx.lineTo(w,cy);ctx.moveTo(cx,0);ctx.lineTo(cx,h);ctx.stroke();
    for(const r of [.25,.5,.75,1]){
      ctx.beginPath();ctx.arc(cx,cy,viewScale*r*scale,0,Math.PI*2);ctx.strokeStyle='rgba(255,255,255,.045)';ctx.stroke();
    }
    for(let i=1;i<data.length;i++){
      const a=data[i-1],b=data[i],alpha=.1+.78*i/data.length;
      ctx.beginPath();ctx.moveTo(cx+a.re*scale,cy-a.im*scale);ctx.lineTo(cx+b.re*scale,cy-b.im*scale);
      ctx.strokeStyle=`rgba(255,255,255,${alpha})`;ctx.lineWidth=.7+1.2*i/data.length;ctx.stroke();
    }
    const p=data[data.length-1]||{re:0,im:0};
    ctx.beginPath();ctx.arc(cx+p.re*scale,cy-p.im*scale,3.1,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();
    ctx.beginPath();ctx.arc(cx,cy,3,0,Math.PI*2);ctx.strokeStyle='rgba(255,255,255,.38)';ctx.lineWidth=1;ctx.stroke();
  }

  function frame(now){
    if(running()){
      const s=batch(1<<density());
      if(now-lastPublish>45){
        lastPublish=now;trace=[...trace,{re:s.re,im:s.im,n:s.n}].slice(-620);
        setSnapshot(s);setTrail(trace);draw();
      }
    }
    raf=requestAnimationFrame(frame);
  }

  function changeT(value){const next=Number(value);setT(next);reset(next);draw()}
  function singleStep(){const s=batch(1);trace=[...trace,{re:s.re,im:s.im,n:s.n}].slice(-620);setSnapshot(s);setTrail(trace);draw()}
  function restart(){reset(t());draw()}

  onMount(()=>{
    ro=new ResizeObserver(resize);ro.observe(canvas);resize();raf=requestAnimationFrame(frame);
  });
  onCleanup(()=>{ro?.disconnect();cancelAnimationFrame(raf)});

  const complexText=createMemo(()=>`${fmt(snapshot().re)} ${snapshot().im<0?'−':'+'} ${fmt(Math.abs(snapshot().im))}i`);
  const etaText=createMemo(()=>`${fmt(snapshot().etaRe)} ${snapshot().etaIm<0?'−':'+'} ${fmt(Math.abs(snapshot().etaIm))}i`);
  const formula=createMemo(()=>`s = 1/2 + ${fmt(t(),6)}i\nη_N(s) = Σₙ₌₁ᴺ (−1)ⁿ⁻¹ n⁻ˢ\nζ_N(s) = η_N(s) / (1 − 2¹⁻ˢ)\nN = ${snapshot().n}   ζ_N ≈ ${complexText()}`);

  return <main class="project-page zeta-page">
    <header class="project-head zeta-head">
      <div><h1>Zeta Engine</h1><p>An endless critical-line computation: one recurrence, one complex trajectory, no terminal iteration.</p></div>
      <code>ζ(s) = η(s) / (1 − 2¹⁻ˢ),  s = 1/2 + it</code>
    </header>
    <section class="project-body zeta-body">
      <div class="metric-row zeta-metrics">
        <div class="metric"><small>iteration N</small><b>{snapshot().n.toLocaleString()}</b></div>
        <div class="metric"><small>|ζₙ(s)|</small><b>{fmt(modulus(),8)}</b></div>
        <div class="metric"><small>arg ζ</small><b>{fmt(argument(),5)}</b></div>
        <div class="metric"><small>Hardy Z(t)</small><b>{fmt(hardyZ(),8)}</b></div>
        <div class="metric"><small>|termₙ|</small><b>{snapshot().n?fmt(snapshot().term,8):'1.00000000'}</b></div>
      </div>
      <section class="zeta-plane-wrap">
        <canvas ref={canvas} class="zeta-plane" aria-label="Complex-plane trajectory of zeta partial sums"/>
        <div class="zeta-plane-readout"><small>ζₙ(½ + {fmt(t(),6)}i)</small><strong>{complexText()}</strong><span>ηₙ = {etaText()}</span></div>
      </section>
      <ProjectLambdaPanel
        kind="zeta"
        n={lambdaN()}
        magnitude={lambdaMag()}
        phase={lambdaPhase()}
        sign={snapshot().n%2===1}
        t={clamp(Math.round((t()/50)*9),0,9)}
        expression={formula()}
        label="Live lambda recurrence for the infinite zeta engine"
      />
      <section class="zeta-controls">
        <label class="lab-range"><span>critical-line height t <b>{fmt(t(),6)}</b></span><input type="range" min="1" max="50" step="0.0005" value={t()} onInput={e=>changeT(+e.currentTarget.value)}/></label>
        <label class="lab-range"><span>terms / frame <b>{1<<density()}</b></span><input type="range" min="0" max="9" step="1" value={density()} onInput={e=>setDensity(+e.currentTarget.value)}/></label>
      </section>
      <div class="lab-controls centered zeta-actions">
        <button class={`lab-button${running()?' active':''}`} type="button" onClick={()=>setRunning(v=>!v)}>{running()?'pause':'run forever'}</button>
        <button class="lab-button" type="button" onClick={singleStep}>one term</button>
        <button class="lab-button" type="button" onClick={restart}>restart sum</button>
      </div>
      <div class="zeta-presets" aria-label="Known critical-line zero presets">
        {ZERO_PRESETS.map(([name,value])=><button type="button" class="zeta-preset" onClick={()=>changeT(value)}><span>{name}</span><code>{value.toFixed(6)}</code></button>)}
      </div>
      <div class="zeta-theory">
        <code>η(s) = Σₙ₌₁∞ (−1)ⁿ⁻¹ n⁻ˢ</code>
        <span>analytic continuation through the Dirichlet eta function</span>
        <code>Z ≡ Y (λself.λn.λS. self (SUCC n) (CADD S (TERM s n)))</code>
      </div>
    </section>
  </main>;
}
