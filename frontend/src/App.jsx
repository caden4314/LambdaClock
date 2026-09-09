import {createSignal,onCleanup,onMount} from 'solid-js';
import AnimatedDigit from './AnimatedDigit.jsx';
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
  const displayDigits=`${String(hour).padStart(2,' ')}${minute}${second}`.split('');
  const zone=Intl.DateTimeFormat().resolvedOptions().timeZone||'local time';
  return {hour:String(hour),minute,second,period,text,digits,displayDigits,zone};
}

function TimeGroup(props){
  return <span class="time-group">{props.values.map((value,index)=><AnimatedDigit value={value} key={index}/>)}</span>;
}

export default function App(){
  const [time,setTime]=createSignal(readTime());
  let timer;

  function scheduleTick(){
    const delay=1000-(Date.now()%1000)+12;
    timer=setTimeout(()=>{
      setTime(readTime());
      scheduleTick();
    },delay);
  }

  onMount(scheduleTick);
  onCleanup(()=>clearTimeout(timer));

  const chars=()=>time().displayDigits;

  return (
    <main class="screen">
      <div class="clock" aria-label={`Current local time ${time().text} ${time().period}, ${time().zone}`}>
        <TimeGroup values={chars().slice(0,2)}/><i>:</i>
        <TimeGroup values={chars().slice(2,4)}/><i>:</i>
        <TimeGroup values={chars().slice(4,6)}/>
        <b class="day-period"><AnimatedDigit value={time().period[0]}/><span>M</span></b>
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
