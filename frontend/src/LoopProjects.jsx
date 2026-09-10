import {createEffect,createMemo,createSignal,For,onCleanup,onMount} from 'solid-js';
import ProjectLambdaPanel from './ProjectLambdaPanel.jsx';

function Shell(props){
  return <main class="project-page loop-project">
    <header class="project-head"><div><h1>{props.title}</h1><p>{props.subtitle}</p></div><code>{props.lambda}</code></header>
    <section class="project-body">{props.children}</section>
  </main>;
}
function Button(props){return <button class={`lab-button${props.active?' active':''}`} type="button" onClick={props.onClick}>{props.children}</button>}
function Range(props){return <label class="lab-range"><span>{props.label}<b>{props.value}</b></span><input type="range" min={props.min} max={props.max} step={props.step??1} value={props.value} onInput={e=>props.onInput?.(+e.currentTarget.value)}/></label>}
function Metrics(props){return <div class="metric-row"><For each={props.items}>{item=><div class="metric"><small>{item[0]}</small><b>{item[1]}</b></div>}</For></div>}
function useTimer(running,delay,fn){let timer;createEffect(()=>{clearInterval(timer);if(running())timer=setInterval(fn,delay())});onCleanup(()=>clearInterval(timer));}

export function LambdaOrbit(){
  const [x,setX]=createSignal(.213),[rate,setRate]=createSignal(3.86),[running,setRunning]=createSignal(true),[delay,setDelay]=createSignal(115),[step,setStep]=createSignal(0);
  const [trail,setTrail]=createSignal([.213]);
  function advance(){setX(v=>{const next=rate()*v*(1-v);setTrail(t=>[...t,next].slice(-72));setStep(s=>s+1);return next})}
  function reset(){setX(.213);setTrail([.213]);setStep(0)}
  useTimer(running,delay,advance);
  const points=createMemo(()=>trail().map((v,i)=>`${(i/Math.max(1,trail().length-1))*100},${96-v*88}`).join(' '));
  return <Shell title="Lambda Orbit" subtitle="Repeated function application moving from stability into chaos." lambda="ORBIT ≡ ITER F seed">
    <Metrics items={[["step",step()],["x",x().toFixed(6)],["r",rate().toFixed(2)]]}/>
    <svg class="loop-plot" viewBox="0 0 100 100" preserveAspectRatio="none"><line x1="0" y1="50" x2="100" y2="50"/><polyline points={points()}/><circle cx="100" cy={96-x()*88} r="1.4"/></svg>
    <ProjectLambdaPanel kind="orbit" step={step()} x={x()} rate={rate()} expression={`ITER · F(r=${rate().toFixed(2)}) · seed → step ${step()}`}/>
    <div class="split-controls"><Range label="chaos / r" min={2.8} max={4} step={.01} value={rate()} onInput={setRate}/><Range label="loop ms" min={45} max={700} step={5} value={delay()} onInput={setDelay}/></div>
    <div class="lab-controls centered"><Button active={running()} onClick={()=>setRunning(v=>!v)}>{running()?'pause':'run'}</Button><Button onClick={advance}>step</Button><Button onClick={reset}>reset</Button></div>
  </Shell>;
}

export function CollatzLoop(){
  const [seed,setSeed]=createSignal(27),[value,setValue]=createSignal(27),[running,setRunning]=createSignal(true),[delay,setDelay]=createSignal(260),[cycles,setCycles]=createSignal(0);
  const [trail,setTrail]=createSignal([27]);
  function advance(){
    setValue(v=>{
      if(v===1){setCycles(c=>c+1);setTrail([seed()]);return seed()}
      const next=v%2===0?v/2:3*v+1;setTrail(t=>[...t,next].slice(-36));return next;
    });
  }
  function reset(nextSeed=seed()){setSeed(nextSeed);setValue(nextSeed);setTrail([nextSeed]);setCycles(0)}
  useTimer(running,delay,advance);
  const bars=createMemo(()=>{const data=trail(),max=Math.max(...data,1);return data.map(v=>Math.max(4,(v/max)*100))});
  return <Shell title="Collatz Loop" subtitle="A recursive odd/even orbit that falls to 1, then starts again." lambda="COLL ≡ Y (λself.λn.IF ...)">
    <Metrics items={[["value",value()],["cycles",cycles()],["seed",seed()]]}/>
    <div class="collatz-trail"><For each={bars()}>{(h,i)=><i class={i()===bars().length-1?'active':''} style={{height:`${h}%`}}/>}</For></div>
    <ProjectLambdaPanel kind="collatz" value={value()} expression={`Y · COLLATZ · ${value()} ${value()===1?'→ restart':'→ next'}`}/>
    <div class="split-controls"><Range label="seed" min={2} max={99} value={seed()} onInput={v=>reset(v)}/><Range label="loop ms" min={80} max={900} step={10} value={delay()} onInput={setDelay}/></div>
    <div class="lab-controls centered"><Button active={running()} onClick={()=>setRunning(v=>!v)}>{running()?'pause':'run'}</Button><Button onClick={advance}>step</Button><Button onClick={()=>reset()}>reset</Button></div>
  </Shell>;
}

export function FeedbackOscillator(){
  const [feedback,setFeedback]=createSignal(.88),[drive,setDrive]=createSignal(1.35),[running,setRunning]=createSignal(true),[value,setValue]=createSignal(.1);
  const [trail,setTrail]=createSignal(Array.from({length:90},()=>0));const lambdaState=createMemo(()=>Math.max(0,Math.min(9,Math.round((value()+1)*4.5))));let raf=0,last=0,phase=0;
  function frame(now){const dt=Math.min(.035,(now-last||16)/1000);last=now;if(running()){
    phase+=dt*drive()*3.2;setValue(v=>{const next=Math.tanh(feedback()*1.7*v+Math.sin(phase)*.62);setTrail(t=>[...t,next].slice(-90));return next});
  }raf=requestAnimationFrame(frame)}
  onMount(()=>raf=requestAnimationFrame(frame));onCleanup(()=>cancelAnimationFrame(raf));
  const points=createMemo(()=>trail().map((v,i)=>`${(i/89)*100},${50-v*38}`).join(' '));
  function reset(){phase=0;setValue(.1);setTrail(Array.from({length:90},()=>0))}
  return <Shell title="Feedback Oscillator" subtitle="The previous output is fed into the next evaluation, creating a live recursive state." lambda="OSC ≡ Y (λself.λx.STEP x (self x))">
    <Metrics items={[["state",value().toFixed(4)],["feedback",feedback().toFixed(2)],["drive",drive().toFixed(2)]]}/>
    <svg class="loop-plot oscillator" viewBox="0 0 100 100" preserveAspectRatio="none"><line x1="0" y1="50" x2="100" y2="50"/><polyline points={points()}/></svg>
    <ProjectLambdaPanel kind="oscillator" state={lambdaState()} feedback={feedback()} drive={drive()} expression={`Y · OSC(feedback=${feedback().toFixed(2)}) · state=${value().toFixed(4)}`}/>
    <div class="split-controls"><Range label="feedback" min={0} max={1.25} step={.01} value={feedback()} onInput={setFeedback}/><Range label="drive" min={.2} max={2.5} step={.05} value={drive()} onInput={setDrive}/></div>
    <div class="lab-controls centered"><Button active={running()} onClick={()=>setRunning(v=>!v)}>{running()?'pause':'run'}</Button><Button onClick={reset}>reset</Button></div>
  </Shell>;
}
