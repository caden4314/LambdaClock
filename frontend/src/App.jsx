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
  const hourMath=two(hour);
  const text=`${hour}:${minute}:${second}`;
  const digits=`${hourMath}${minute}${second}`.split('').map(Number);
  const displayDigits=`${String(hour).padStart(2,' ')}${minute}${second}`.split('');
  const zone=Intl.DateTimeFormat().resolvedOptions().timeZone||'local time';
  return {period,text,digits,displayDigits,zone};
}

function makeTransition(previous,next,seq){
  const changed=[];
  for(let i=5;i>=0;i--) if(previous.digits[i]!==next.digits[i]) changed.push(i);
  const delays={};
  changed.forEach((index,order)=>delays[index]=order*78);
  const special=previous.period!==next.period?(next.period==='AM'?'midnight':'noon'):null;
  const reduction=!special&&changed.length===1&&changed[0]===5&&
    previous.digits[5]<9&&next.digits[5]===previous.digits[5]+1;
  return {
    seq,changed,delays,special,reduction,
    previousDigits:[...previous.digits],nextDigits:[...next.digits],
    previousDisplay:[...previous.displayDigits],nextDisplay:[...next.displayDigits],
    periodChanged:previous.period!==next.period
  };
}

function idleTransition(time){
  return {
    seq:0,changed:[],delays:{},special:null,reduction:false,
    previousDigits:[...time.digits],nextDigits:[...time.digits],
    previousDisplay:[...time.displayDigits],nextDisplay:[...time.displayDigits],
    periodChanged:false
  };
}

export default function App(){
  const first=readTime();
  const [time,setTime]=createSignal(first);
  const [transition,setTransition]=createSignal(idleTransition(first));
  let timer,sequence=0;

  function scheduleTick(){
    const delay=1000-(Date.now()%1000)+12;
    timer=setTimeout(()=>{
      const previous=time();
      const next=readTime();
      setTransition(makeTransition(previous,next,++sequence));
      setTime(next);
      scheduleTick();
    },delay);
  }

  onMount(scheduleTick);
  onCleanup(()=>clearTimeout(timer));

  const d=i=>time().displayDigits[i];
  const motion=i=>{
    const t=transition();
    const order=t.changed.indexOf(i);
    const old=t.previousDisplay[i],next=t.nextDisplay[i];
    const wrap=old==='9'&&next==='0';
    const distance=t.special?1.7:wrap?1.42:order>0?1.02:.72;
    return {seq:t.seq,delay:order<0?0:t.delays[i],distance,wrap,carry:order>0,special:t.special};
  };

  return (
    <main class={`screen${transition().special?' special-event':''}`} data-special={transition().special||''}>
      <div class="clock" aria-label={`Current local time ${time().text} ${time().period}, ${time().zone}`}>
        <span class="time-group"><AnimatedDigit value={d(0)} motion={motion(0)}/><AnimatedDigit value={d(1)} motion={motion(1)}/></span><i>:</i>
        <span class="time-group"><AnimatedDigit value={d(2)} motion={motion(2)}/><AnimatedDigit value={d(3)} motion={motion(3)}/></span><i>:</i>
        <span class="time-group"><AnimatedDigit value={d(4)} motion={motion(4)}/><AnimatedDigit value={d(5)} motion={motion(5)}/></span>
        <b class="day-period"><AnimatedDigit value={time().period[0]} motion={{seq:transition().seq,delay:transition().periodChanged?310:0,distance:1.15,special:transition().special}}/><span>M</span></b>
      </div>
      <div class="diagrams">
        <div class="diagram-wrap">
          <LambdaDisplay digits={time().digits} transition={transition()}/>
        </div>
        <div class="period-diagram-wrap">
          <LambdaDisplay period={time().period} transition={transition()}/>
        </div>
      </div>
    </main>
  );
}
