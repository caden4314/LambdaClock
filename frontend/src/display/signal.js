export function nextPowerOfTwo(value){let n=1,target=Math.max(2,Math.trunc(value)||2);while(n<target)n<<=1;return n}
const hannCache=new Map();
export function hannWindow(length){const n=Math.max(2,Math.trunc(length));let out=hannCache.get(n);if(!out){out=new Float64Array(n);for(let i=0;i<n;i++)out[i]=.5-.5*Math.cos(2*Math.PI*i/(n-1));hannCache.set(n,out)}return out}
export function sampleSignal(source,{count=1024,sampleRate=4096,startTime=0}={}){const out=new Float64Array(Math.max(2,Math.trunc(count)));return sampleSignalInto(out,source,{sampleRate,startTime})}
export function sampleSignalInto(target,source,{sampleRate=4096,startTime=0}={}){const n=target?.length??0,rate=Math.max(1,Number(sampleRate)||4096);for(let i=0;i<n;i++)target[i]=Number(source?.(startTime+i/rate,i,rate)??0)||0;return target}

function fftInPlace(re,im){
  const n=re.length;
  for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){const rr=re[i];re[i]=re[j];re[j]=rr;const ii=im[i];im[i]=im[j];im[j]=ii}}
  for(let len=2;len<=n;len<<=1){const angle=-2*Math.PI/len,wlr=Math.cos(angle),wli=Math.sin(angle);for(let start=0;start<n;start+=len){let wr=1,wi=0;for(let j=0;j<len/2;j++){const even=start+j,odd=even+len/2,tr=wr*re[odd]-wi*im[odd],ti=wr*im[odd]+wi*re[odd],er=re[even],ei=im[even];re[even]=er+tr;im[even]=ei+ti;re[odd]=er-tr;im[odd]=ei-ti;const nr=wr*wlr-wi*wli;wi=wr*wli+wi*wlr;wr=nr}}}
}

export function fftReal(samples){
  const source=samples||[],n=nextPowerOfTwo(source.length??0),re=new Float64Array(n),im=new Float64Array(n);for(let i=0;i<Math.min(n,source.length??0);i++){const value=Number(source[i]);re[i]=Number.isFinite(value)?value:0}fftInPlace(re,im);return {re,im,size:n};
}

export function createSpectrumAnalyzer({fftSize=1024,sampleRate=4096,window='hann',dbFloor=-90,dbCeiling=0}={}){
  const n=nextPowerOfTwo(fftSize),rate=Math.max(n,Number(sampleRate)||4096),bins=n>>1,weights=window==='hann'?hannWindow(n):null;
  const samples=new Float64Array(n),re=new Float64Array(n),im=new Float64Array(n),magnitudes=new Float32Array(bins),db=new Float32Array(bins),values=new Float32Array(bins);
  const result={size:n,sampleRate:rate,binHz:rate/n,samples,magnitudes,db,values};
  return {
    ...result,
    analyze(source,{startTime=0,floor=dbFloor,ceiling=dbCeiling}={}){
      sampleSignalInto(samples,source,{sampleRate:rate,startTime});
      for(let i=0;i<n;i++){re[i]=samples[i]*(weights?weights[i]:1);im[i]=0}
      fftInPlace(re,im);
      const span=Math.max(1e-9,ceiling-floor);
      for(let i=0;i<bins;i++){
        const magnitude=2*Math.hypot(re[i],im[i])/n,d=Math.max(floor,20*Math.log10(Math.max(magnitude,1e-12)));magnitudes[i]=magnitude;db[i]=d;values[i]=Math.max(0,Math.min(1,(d-floor)/span));
      }
      return result;
    }
  };
}

export function magnitudeSpectrum(samples,{sampleRate=4096,window='hann',dbFloor=-100}={}){
  const n=nextPowerOfTwo(samples?.length??2),source=new Float64Array(n),weights=window==='hann'?hannWindow(n):null;for(let i=0;i<n;i++)source[i]=(Number(samples?.[i]??0)||0)*(weights?weights[i]:1);
  const {re,im}=fftReal(source),bins=n/2,out=new Array(bins);for(let i=0;i<bins;i++){const magnitude=2*Math.hypot(re[i],im[i])/n,db=Math.max(dbFloor,20*Math.log10(Math.max(magnitude,1e-12)));out[i]={bin:i,frequency:i*sampleRate/n,magnitude,db}}return out;
}
export function dominantFrequency(spectrum,{minFrequency=1}={}){let best=null;for(const point of spectrum||[])if(point.frequency>=minFrequency&&(!best||point.magnitude>best.magnitude))best=point;return best}
export function normalizeSpectrum(spectrum,{floor=-90,ceiling=0}={}){const span=Math.max(1e-9,ceiling-floor);return (spectrum||[]).map(point=>({...point,value:Math.max(0,Math.min(1,(point.db-floor)/span))}))}
