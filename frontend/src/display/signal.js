export function nextPowerOfTwo(value){let n=1,target=Math.max(2,Math.trunc(value)||2);while(n<target)n<<=1;return n}
export function hannWindow(length){const n=Math.max(2,Math.trunc(length));return Array.from({length:n},(_,i)=>.5-.5*Math.cos(2*Math.PI*i/(n-1)))}
export function sampleSignal(source,{count=1024,sampleRate=4096,startTime=0}={}){const n=Math.max(2,Math.trunc(count));return Array.from({length:n},(_,i)=>Number(source?.(startTime+i/sampleRate,i,sampleRate)??0)||0)}

export function fftReal(samples){
  const input=Array.from(samples||[],Number),n=nextPowerOfTwo(input.length),re=new Float64Array(n),im=new Float64Array(n);for(let i=0;i<input.length;i++)re[i]=Number.isFinite(input[i])?input[i]:0;
  for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){[re[i],re[j]]=[re[j],re[i]];[im[i],im[j]]=[im[j],im[i]]}}
  for(let len=2;len<=n;len<<=1){const angle=-2*Math.PI/len,wlr=Math.cos(angle),wli=Math.sin(angle);for(let start=0;start<n;start+=len){let wr=1,wi=0;for(let j=0;j<len/2;j++){const even=start+j,odd=even+len/2,tr=wr*re[odd]-wi*im[odd],ti=wr*im[odd]+wi*re[odd],er=re[even],ei=im[even];re[even]=er+tr;im[even]=ei+ti;re[odd]=er-tr;im[odd]=ei-ti;const nr=wr*wlr-wi*wli;wi=wr*wli+wi*wlr;wr=nr}}}
  return {re,im,size:n};
}

export function magnitudeSpectrum(samples,{sampleRate=4096,window='hann',dbFloor=-100}={}){
  const n=nextPowerOfTwo(samples?.length??2),source=Array.from({length:n},(_,i)=>Number(samples?.[i]??0)||0),win=window==='hann'?hannWindow(n):Array(n).fill(1);for(let i=0;i<n;i++)source[i]*=win[i];
  const {re,im}=fftReal(source),bins=n/2,out=new Array(bins);for(let i=0;i<bins;i++){const magnitude=2*Math.hypot(re[i],im[i])/n,db=Math.max(dbFloor,20*Math.log10(Math.max(magnitude,1e-12)));out[i]={bin:i,frequency:i*sampleRate/n,magnitude,db}}
  return out;
}
export function dominantFrequency(spectrum,{minFrequency=1}={}){let best=null;for(const point of spectrum||[])if(point.frequency>=minFrequency&&(!best||point.magnitude>best.magnitude))best=point;return best}
export function normalizeSpectrum(spectrum,{floor=-90,ceiling=0}={}){const span=Math.max(1e-9,ceiling-floor);return (spectrum||[]).map(point=>({...point,value:Math.max(0,Math.min(1,(point.db-floor)/span))}))}
