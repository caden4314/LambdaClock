import { createSignal, onCleanup, onMount } from 'solid-js';
import LambdaDisplay from './LambdaDisplay.jsx';

const formatter=new Intl.DateTimeFormat('en-US',{
  timeZone:'America/Chicago',hourCycle:'h23',hour:'2-digit',minute:'2-digit',second:'2-digit'
});

function readTime(){
  const parts=formatter.formatToParts(new Date());
  const get=t=>parts.find(p=>p.type===t)?.value||'00';
  const text=`${get('hour')}:${get('minute')}:${get('second')}`;
  return {text,digits:text.replaceAll(':','').split('').map(Number)};
}

export default function App(){
  const first=readTime();
  const [time,setTime]=createSignal(first.text);
  const [digits,setDigits]=createSignal(first.digits);
  let timer;

  onMount(()=>{
    let last=first.text;
    timer=setInterval(()=>{
      const next=readTime();
      if(next.text===last)return;
      last=next.text;
      setTime(next.text);
      setDigits(next.digits);
    },100);
  });
  onCleanup(()=>clearInterval(timer));

  const pieces=()=>time().split(':');

  return (
    <main class="screen">
      <div class="clock" aria-label={`Current time ${time()}`}>
        <span>{pieces()[0]}</span><i>:</i><span>{pieces()[1]}</span><i>:</i><span>{pieces()[2]}</span>
      </div>
      <div class="diagram-wrap">
        <LambdaDisplay digits={digits()} />
      </div>
    </main>
  );
}
