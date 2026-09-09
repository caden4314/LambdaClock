import {Machine} from '../lambda-machine.js';
const V=n=>({t:'v',n}),L=(n,b)=>({t:'l',n,b}),A=(f,x)=>({t:'a',f,x});
const app=(...xs)=>xs.reduce((a,b)=>A(a,b));
const lam=(names,body)=>names.reduceRight((b,n)=>L(n,b),body);
function compile(t,env=[]){if(t.t==='v'){const i=env.indexOf(t.n);if(i<0)throw new Error('free clock variable '+t.n);return{t:'v',i};}if(t.t==='l')return{t:'l',b:compile(t.b,[t.n,...env])};return{t:'a',f:compile(t.f,env),x:compile(t.x,env)};}
function church(n,p='d'){let body=V(p+'x');for(let i=0;i<n;i++)body=A(V(p+'f'),body);return lam([p+'f',p+'x'],body);}
function buildClockProgram(digits){const names=['h1','h2','m1','m2','s1','s2'];const tuple=lam(names,lam(['k'],app(V('k'),...names.map(V))));return compile(app(tuple,...digits.map((d,i)=>church(d,'d'+i))));}
function chicagoDigits(date=new Date()){const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',hourCycle:'h23',hour:'2-digit',minute:'2-digit',second:'2-digit'}).formatToParts(date);const get=t=>parts.find(p=>p.type===t)?.value||'00';const text=get('hour')+':'+get('minute')+':'+get('second');return{text,digits:text.split(':').join('').split('').map(Number)};}
function startClock(date=new Date()){const input=chicagoDigits(date);return{input,machine:new Machine({term:buildClockProgram(input.digits),env:[]},[]),beta:0,steps:0,done:false};}
export {buildClockProgram,chicagoDigits,startClock};
