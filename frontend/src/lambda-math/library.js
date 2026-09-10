import {V,L,A,lams,apps,letIn,compile,makeEvaluator,decodeBoolean,termSize} from './core.js';

export const TRUE=lams(['t','f'],V('t'));
export const FALSE=lams(['t','f'],V('f'));
export const IF=lams(['p','a','b'],apps(V('p'),V('a'),V('b')));
export const NOT=L('p',apps(V('p'),V('FALSE'),V('TRUE')));
export const AND=lams(['p','q'],apps(V('p'),V('q'),V('FALSE')));
export const OR=lams(['p','q'],apps(V('p'),V('TRUE'),V('q')));
export const XOR=lams(['p','q'],apps(V('p'),apps(V('NOT'),V('q')),V('q')));
export const PAIR=lams(['a','b','p'],apps(V('p'),V('a'),V('b')));
export const FST=L('p',A(V('p'),V('TRUE')));
export const SND=L('p',A(V('p'),V('FALSE')));

export const FULL_ADDER=lams(['a','b','c'],
  apps(V('PAIR'),
    apps(V('XOR'),apps(V('XOR'),V('a'),V('b')),V('c')),
    apps(V('OR'),apps(V('AND'),V('a'),V('b')),apps(V('AND'),V('c'),apps(V('XOR'),V('a'),V('b'))))
  )
);

export function bitsFromInt(value,width=16){
  const mod=2**width;
  let n=((Math.trunc(value)%mod)+mod)%mod;
  return Array.from({length:width},(_,i)=>(n&(2**(width-1-i)))!==0);
}

export function wordFromBits(bits){
  const names=bits.map((_,i)=>`b${i}`);
  return L('k',apps(V('k'),...bits.map(bit=>V(bit?'TRUE':'FALSE'))));
}

export const wordFromInt=(value,width=16)=>wordFromBits(bitsFromInt(value,width));
function bitNames(width,p='b'){return Array.from({length:width},(_,i)=>`${p}${i}`)}
export function wordSelector(width,index){
  const names=bitNames(width);
  return lams(names,V(names[index]));
}

export function wordNot(width=16){
  const names=bitNames(width);
  const mapped=names.map(n=>A(V('NOT'),V(n)));
  const consume=lams(names,L('k',apps(V('k'),...mapped)));
  return L('w',A(V('w'),consume));
}

export function wordSar(width=16,shift=1){
  const names=bitNames(width);
  const out=names.map((_,i)=>V(i<shift?names[0]:names[i-shift]));
  const consume=lams(names,L('k',apps(V('k'),...out)));
  return L('w',A(V('w'),consume));
}

export function wordSign(width=16){
  return L('w',A(V('w'),wordSelector(width,0)));
}

export function addWord(width=16){
  const aa=bitNames(width,'a'),bb=bitNames(width,'b');
  const rs=bitNames(width,'r');
  let body=L('k',apps(V('k'),...rs.map(r=>A(V('FST'),V(r)))));
  for(let bit=0;bit<width;bit++){
    const carry=bit===width-1?V('FALSE'):A(V('SND'),V(rs[bit+1]));
    const fa=apps(V('FA'),V(aa[bit]),V(bb[bit]),carry);
    body=letIn(rs[bit],fa,body);
  }
  return lams(['A','B'],A(V('A'),lams(aa,A(V('B'),lams(bb,body)))));
}
export function triple(){return lams(['x','y','z','k'],apps(V('k'),V('x'),V('y'),V('z')))}
export const tripleSelector=index=>lams(['x','y','z'],V(['x','y','z'][index]));

function prelude(width,body){
  const defs=[
    ['TRUE',TRUE],['FALSE',FALSE],['IF',IF],['NOT',NOT],['AND',AND],['OR',OR],['XOR',XOR],
    ['PAIR',PAIR],['FST',FST],['SND',SND],['FA',FULL_ADDER],
    ['ADD',addWord(width)],['NOTW',wordNot(width)],
    ['NEG',L('w',apps(V('ADD'),A(V('NOTW'),V('w')),wordFromInt(1,width)))],
    ['SUB',lams(['a','b'],apps(V('ADD'),V('a'),A(V('NEG'),V('b'))))],
    ['SIGN',wordSign(width)],['TRIPLE',triple()]
  ];
  return defs.reduceRight((out,[name,value])=>letIn(name,value,out),body);
}

export function runWordExpression(body,width=16,{limit=2_000_000}={}){
  const named=prelude(width,body);
  const db=compile(named);
  const ev=makeEvaluator(limit);
  const value=ev.closure(db);
  return {named,db,ev,value,nodes:termSize(named)};
}

export function decodeWordClosure(ev,input,width=16){
  const word=ev.force(input);
  const bits=[];
  for(let i=0;i<width;i++){
    const selector=ev.closure(compile(wordSelector(width,i)));
    const bit=ev.whnf(ev.apply(word,selector));
    bits.push(decodeBoolean(ev,bit));
  }
  let unsigned=0;
  for(const bit of bits)unsigned=unsigned*2+(bit?1:0);
  const signed=bits[0]?unsigned-2**width:unsigned;
  return {bits,unsigned,signed,binary:bits.map(Number).join('')};
}

export function decodeWord(run,width=16){
  return decodeWordClosure(run.ev,run.value,width);
}
export const CORDIC_ATAN_RAD=[
  0.785398163397,0.463647609001,0.244978663127,0.124354994547,
  0.062418809996,0.031239833430,0.015623728620,0.007812341060,
  0.003906230132,0.001953122516,0.000976562190,0.000488281211,
  0.000244140620,0.000122070312,0.000061035156,0.000030517578
];
export const CORDIC_K_INV=0.607252935009;

export function fixedFromNumber(value,frac=13,width=16){
  return wordFromInt(Math.round(value*(2**frac)),width);
}
export function fixedToNumber(word,frac=13){return word.signed/(2**frac)}

function cordicRotationStep(width,shift,atanWord){
  const sar=wordSar(width,shift);
  const sx=A(sar,V('x')),sy=A(sar,V('y'));
  const negative=A(V('SIGN'),V('z'));
  const nextX=apps(V('IF'),negative,apps(V('ADD'),V('x'),sy),apps(V('SUB'),V('x'),sy));
  const nextY=apps(V('IF'),negative,apps(V('SUB'),V('y'),sx),apps(V('ADD'),V('y'),sx));
  const nextZ=apps(V('IF'),negative,apps(V('ADD'),V('z'),atanWord),apps(V('SUB'),V('z'),atanWord));
  const body=apps(V('TRIPLE'),nextX,nextY,nextZ);
  return L('state',A(V('state'),lams(['x','y','z'],body)));
}

export function cordicRotationTerm(angleRadians,{width=16,frac=13,iterations=12}={}){
  const count=Math.max(1,Math.min(iterations,CORDIC_ATAN_RAD.length));
  let state=apps(V('TRIPLE'),fixedFromNumber(CORDIC_K_INV,frac,width),wordFromInt(0,width),fixedFromNumber(angleRadians,frac,width));
  for(let i=0;i<count;i++){
    const atanWord=fixedFromNumber(CORDIC_ATAN_RAD[i],frac,width);
    state=A(cordicRotationStep(width,i,atanWord),state);
  }
  return state;
}

export function decodeTripleWords(run,width=16){
  const out=[];
  for(let i=0;i<3;i++){
    const selector=run.ev.closure(compile(tripleSelector(i)));
    const word=run.ev.whnf(run.ev.apply(run.value,selector));
    out.push(decodeWordClosure(run.ev,word,width));
  }
  return out;
}

export function runCordicSinCos(angleRadians,options={}){
  const width=options.width??16,frac=options.frac??13;
  const body=cordicRotationTerm(angleRadians,{...options,width,frac});
  const run=runWordExpression(body,width,{limit:options.limit??8_000_000});
  const [x,y,z]=decodeTripleWords(run,width);
  return {
    cos:fixedToNumber(x,frac),sin:fixedToNumber(y,frac),residual:fixedToNumber(z,frac),
    x,y,z,beta:run.ev.stats.beta,forces:run.ev.stats.forces,nodes:run.nodes,run
  };
}

export function runAlu(op,a,b=0,{width=16,limit=2_000_000}={}){
  let body;
  if(op==='add')body=apps(V('ADD'),wordFromInt(a,width),wordFromInt(b,width));
  else if(op==='sub')body=apps(V('SUB'),wordFromInt(a,width),wordFromInt(b,width));
  else if(op==='neg')body=A(V('NEG'),wordFromInt(a,width));
  else if(op==='not')body=A(V('NOTW'),wordFromInt(a,width));
  else throw new Error(`unknown ALU operation: ${op}`);
  const run=runWordExpression(body,width,{limit});
  const word=decodeWord(run,width);
  return {...word,beta:run.ev.stats.beta,forces:run.ev.stats.forces,nodes:run.nodes,run};
}

export function runArithmeticShift(value,shift,{width=16,limit=2_000_000}={}){
  const amount=Math.max(0,Math.min(width-1,Math.trunc(shift)));
  const body=A(wordSar(width,amount),wordFromInt(value,width));
  const run=runWordExpression(body,width,{limit});
  const word=decodeWord(run,width);
  return {...word,beta:run.ev.stats.beta,forces:run.ev.stats.forces,nodes:run.nodes,run};
}
