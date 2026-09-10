// Presentation helpers for projects that consume the Lambda math engine.
// These functions format already-computed Lambda results; they never perform
// the mathematical operation that produced those results.

export function groupBinary(binary,group=4,separator=' '){
  const text=String(binary??'');
  const size=Math.max(1,Math.trunc(group)||1);
  const first=text.length%size||size;
  const chunks=[text.slice(0,first)];
  for(let i=first;i<text.length;i+=size)chunks.push(text.slice(i,i+size));
  return chunks.filter(Boolean).join(separator);
}

export function formatBinaryWord(word,{group=4,separator=' '}={}){
  return groupBinary(word?.binary??'',group,separator);
}

export function formatHexWord(word,width=16){
  const digits=Math.ceil(Math.max(1,width)/4);
  const value=Number(word?.unsigned??0)>>>0;
  return `0x${value.toString(16).toUpperCase().padStart(digits,'0').slice(-digits)}`;
}

export function formatFixed(value,{digits=7,trim=false}={}){
  const text=Number(value).toFixed(Math.max(0,Math.trunc(digits)));
  return trim?text.replace(/\.?0+$/,''):text;
}

export function wordView(word,{label='',width=16,group=4}={}){
  return {
    label,
    bits:[...(word?.bits??[])],
    signed:Number(word?.signed??0),
    unsigned:Number(word?.unsigned??0),
    binary:word?.binary??'',
    groupedBinary:formatBinaryWord(word,{group}),
    hex:formatHexWord(word,width)
  };
}

export function fixedWordView(word,{label='',width=16,frac=13,digits=7}={}){
  const view=wordView(word,{label,width});
  return {...view,value:view.signed/(2**frac),formatted:formatFixed(view.signed/(2**frac),{digits})};
}

export function runStats(result){
  return {
    beta:Number(result?.beta??result?.run?.ev?.stats?.beta??0),
    forces:Number(result?.forces??result?.run?.ev?.stats?.forces??0),
    nodes:Number(result?.nodes??0)
  };
}

export function cordicView(result,{width=16,frac=13,digits=7}={}){
  return {
    sin:formatFixed(result?.sin??0,{digits}),
    cos:formatFixed(result?.cos??0,{digits}),
    residual:formatFixed(result?.residual??0,{digits}),
    x:fixedWordView(result?.x,{label:'X',width,frac,digits}),
    y:fixedWordView(result?.y,{label:'Y',width,frac,digits}),
    z:fixedWordView(result?.z,{label:'Z',width,frac,digits}),
    stats:runStats(result)
  };
}
