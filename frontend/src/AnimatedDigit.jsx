import {createEffect,createSignal,onCleanup} from 'solid-js';

export default function AnimatedDigit(props){
  const [current,setCurrent]=createSignal(props.value);
  const [previous,setPrevious]=createSignal(null);
  const [cycle,setCycle]=createSignal(0);
  let clearTimer;

  createEffect(()=>{
    const next=props.value;
    if(next===current())return;
    clearTimeout(clearTimer);
    setPrevious(current());
    setCurrent(next);
    setCycle(v=>v+1);
    clearTimer=setTimeout(()=>setPrevious(null),520);
  });

  onCleanup(()=>clearTimeout(clearTimer));

  return (
    <span class="digit-slot" aria-hidden="true">
      {previous()!==null&&<span class={`digit-layer digit-old digit-old-${cycle()%2}`}>{previous()===' ' ? '\u00a0' : previous()}</span>}
      <span class={`digit-layer digit-new digit-new-${cycle()%2}`}>{current()===' ' ? '\u00a0' : current()}</span>
    </span>
  );
}
