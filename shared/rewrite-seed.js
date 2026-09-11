const MASK64=0xffffffffffffffffn;
const GOLDEN=0x9e3779b97f4a7c15n;
const MIX1=0xbf58476d1ce4e5b9n;
const MIX2=0x94d049bb133111ebn;
const BLOCK_SALT=0xd6e8feb86659fd93n;

export function normalizeSeed(value){
  if(typeof value==='bigint')return value&MASK64;
  const text=String(value??'').trim();
  if(/^0x[0-9a-f]+$/i.test(text))return BigInt(text)&MASK64;
  if(/^[0-9a-f]{1,16}$/i.test(text))return BigInt(`0x${text}`)&MASK64;
  let h=0xcbf29ce484222325n;
  for(const ch of new TextEncoder().encode(text||'lambda')){
    h=((h^BigInt(ch))*0x100000001b3n)&MASK64;
  }
  return h;
}

export function mix64(value){
  let z=(value+GOLDEN)&MASK64;
  z=((z^(z>>30n))*MIX1)&MASK64;
  z=((z^(z>>27n))*MIX2)&MASK64;
  return (z^(z>>31n))&MASK64;
}
export function seedHex(seed){
  return normalizeSeed(seed).toString(16).padStart(16,'0');
}

export function dragonTurn(index){
  const n=BigInt(index);
  const low=n&(-n);
  return (((low<<1n)&n)!==0n)?1:-1;
}

export function seededTurn(index,seed){
  const n=BigInt(index);
  if(n<=0n)return 1;
  const base=dragonTurn(n);
  const block=(n-1n)>>5n;
  const macro=(n-1n)>>12n;
  const s=normalizeSeed(seed);
  const blockFlip=(mix64(s^((block*BLOCK_SALT)&MASK64))&1n)?-1:1;
  const macroFlip=(mix64(s^0xa0761d6478bd642fn^macro)&1n)?-1:1;
  return base*blockFlip*macroFlip;
}


export function makeSeededTurnCursor(seed,startIndex=1){
  const s=normalizeSeed(seed);let n=Math.max(1,Math.floor(Number(startIndex)||1));
  let block=-1,macro=-1,blockFlip=1,macroFlip=1;
  const dragonNumber=value=>{let low=1;while(value%(low*2)===0)low*=2;return Math.floor(value/low)%4===3?1:-1};
  return {
    next(){
      const current=n++,nextBlock=Math.floor((current-1)/32),nextMacro=Math.floor((current-1)/4096);
      if(nextBlock!==block){block=nextBlock;blockFlip=(mix64(s^((BigInt(block)*BLOCK_SALT)&MASK64))&1n)?-1:1}
      if(nextMacro!==macro){macro=nextMacro;macroFlip=(mix64(s^0xa0761d6478bd642fn^BigInt(macro))&1n)?-1:1}
      return dragonNumber(current)*blockFlip*macroFlip;
    },
    get index(){return n}
  };
}

export function initialDirection(seed){
  return Number(mix64(normalizeSeed(seed))&3n);
}

export {MASK64};
