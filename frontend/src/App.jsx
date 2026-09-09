import { createSignal, onCleanup, onMount } from 'solid-js';
import LambdaDisplay from './LambdaDisplay.jsx';

const two=n=>String(n).padStart(2,'0');

function readTime(){
  const now=new Date();
  const h24=now.getHours();
  const hour=h24%12||12;
  const minute=two(now.getMinutes());
  const second=two(now.getSeconds());
  const period=h24>=12?'PM':'AM';
  const text=`${hour}:${minute}:${second}`;
  const digits=`${hour}${minute}${second}`.split('').map(Number);
  const zone=Intl.DateTimeFormat().resolvedOptions().timeZone||'local time';
  return {hour:String(hour),minute,second,period,text,digits,zone};
}

export default function App(){
  const [time,setTime]=createSignal(readTime());
  let timer;

  function scheduleTick(){
    const delay=1000-(Date.now()%1000)+16;
    timer=setTimeout(()=>{
      setTime(readTime());
      scheduleTick();
    },delay);
  }

  onMount(scheduleTick);
  onCleanup(()=>clearTimeout(timer));

  return (
    <main class="screen">
      <div class="clock" aria-label={`Current local time ${time().text} ${time().period}, ${time().zone}`}>
        <span>{time().hour}</span><i>:</i><span>{time().minute}</span><i>:</i><span>{time().second}</span>
        <b class="day-period">{time().period}</b>
      </div>
      <div class="diagrams">
        <div class="diagram-wrap">
          <LambdaDisplay digits={time().digits}/>
        </div>
        <div class="period-diagram-wrap">
          <LambdaDisplay period={time().period}/>
        </div>
      </div>
    </main>
  );
}
