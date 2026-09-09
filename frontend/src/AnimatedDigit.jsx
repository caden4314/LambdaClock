import {createEffect,createSignal,onCleanup} from 'solid-js';

export default function AnimatedDigit(props){
  const [current,setCurrent]=createSignal(props.value);
  const [previous,setPrevious]=createSignal(null);
  const [cycle,setCycle]=createSignal(0);
  const [motion,setMotion]=createSignal(props.motion||{});
  let clearTimer;

  createEffect(()=>{
    const next=props.value;
    if(next===current())return;
    clearTimeout(clearTimer);
    setPrevious(current());
    setCurrent(next);
    setMotion(props.motion||{});
    setCycle(v=>v+1);
    const delay=Number(props.motion?.delay||0);
    clearTimer=setTimeout(()=>setPrevious(null),delay+760);
  });

  onCleanup(()=>clearTimeout(clearTimer));

  const style=()=>({
    '--digit-delay':`${Number(motion().delay||0)}ms`,
    '--digit-distance':`${Number(motion().distance||.72)}em`
  });
  const flavor=()=>motion().special?' digit-special':motion().wrap?' digit-wrap':motion().carry?' digit-carry':'';

  return (
    <span class={`digit-slot${flavor()}`} style={style()} aria-hidden="true">
      {previous()!==null&&<span class={`digit-layer digit-old digit-old-${cycle()%2}`}>{previous()===' ' ? '\u00a0' : previous()}</span>}
      <span class={`digit-layer digit-new digit-new-${cycle()%2}`}>{current()===' ' ? '\u00a0' : current()}</span>
    </span>
  );
}
