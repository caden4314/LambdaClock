import {initProgram,stepProgram,trueTerm,falseTerm,nilMarkTerm,consCaseTerm,boolTMarkTerm,boolFMarkTerm} from './lambda-core.js';
let CELL_ID=0;
class Cell{constructor(closure,value=null){this.closure=closure;this.value=value;this.id=++CELL_ID;}}
class Machine{
  constructor(control,args=[]){this.control=control;this.stack=[];this.steps=0;this.beta=0;for(let i=args.length-1;i>=0;i--)this.stack.push({k:'arg',cell:new Cell(args[i],args[i])});}
  step(){
    this.steps++;const c=this.control,t=c.term;
    if(t.t==='a'){this.stack.push({k:'arg',cell:new Cell({term:t.x,env:c.env})});this.control={term:t.f,env:c.env};return true;}
    if(t.t==='v'){const cell=c.env[t.i];if(!cell)throw new Error('bad de Bruijn index '+t.i);if(cell.value)this.control=cell.value;else{this.stack.push({k:'upd',cell});this.control=cell.closure;}return true;}
    if(t.t==='l'){
      while(this.stack.length&&this.stack[this.stack.length-1].k==='upd'){const fr=this.stack.pop();fr.cell.value=this.control;}
      if(this.stack.length&&this.stack[this.stack.length-1].k==='arg'){const arg=this.stack.pop().cell;this.control={term:t.b,env:[arg,...c.env]};this.beta++;return true;}
      return false;
    }
    throw new Error('unknown term');
  }
}
const closed=term=>({term,env:[]});
const TRUE_C=closed(trueTerm),FALSE_C=closed(falseTerm),NIL_MARK_TERM=nilMarkTerm,NIL_MARK_C=closed(nilMarkTerm),CONS_CASE_C=closed(consCaseTerm),BOOL_T_TERM=boolTMarkTerm,BOOL_F_TERM=boolFMarkTerm,BOOL_T_C=closed(boolTMarkTerm),BOOL_F_C=closed(boolFMarkTerm),INIT_C=closed(initProgram),STEP_C=closed(stepProgram);
function* pairFirstG(p,label='pair fst'){return yield{kind:'eval',fn:p,args:[TRUE_C],label};}
function* pairSecondG(p,label='pair snd'){return yield{kind:'eval',fn:p,args:[FALSE_C],label};}
function* unconsG(list,label='list case'){
  const r=yield{kind:'eval',fn:list,args:[NIL_MARK_C,CONS_CASE_C],label};if(r.term===NIL_MARK_TERM)return null;
  return{h:yield* pairFirstG(r,label+' / head'),t:yield* pairSecondG(r,label+' / tail')};
}
function* boolG(b,label='boolean'){
  const r=yield{kind:'eval',fn:b,args:[BOOL_T_C,BOOL_F_C],label};if(r.term===BOOL_T_TERM)return true;if(r.term===BOOL_F_TERM)return false;throw new Error('boolean did not select a marker');
}
function* binaryG(list,label='binary'){
  let n=0n,p=1n,cur=list;for(let i=0;i<100000;i++){const cell=yield* unconsG(cur,`${label} bit ${i}`);if(!cell)return n;if(yield* boolG(cell.h,`${label} bit ${i} value`))n+=p;p<<=1n;cur=cell.t;}throw new Error('binary decode limit');
}
function* signedG(z,label='signed'){
  const p=yield* pairFirstG(z,label+' +'),n=yield* pairSecondG(z,label+' -');return(yield* binaryG(p,label+' +bits'))-(yield* binaryG(n,label+' -bits'));
}
function* idG(id,label='id'){
  const bits=[];let cur=id;for(let i=0;i<32;i++){const cell=yield* unconsG(cur,`${label} bit ${i}`);if(!cell)return bits.join('');bits.push((yield* boolG(cell.h,`${label} bit ${i}`))?'1':'0');cur=cell.t;}throw new Error('id decode limit');
}
function* coordsG(coords,label='coords'){
  const out=[];let cur=coords;for(let i=0;i<8;i++){const cell=yield* unconsG(cur,`${label}[${i}]`);if(!cell)return out;out.push(yield* signedG(cell.h,`${label}[${i}]`));cur=cell.t;}throw new Error('coordinate decode limit');
}
function* graphG(graph,label='graph'){
  let verts=yield* pairFirstG(graph,label+' vertices'),edges=yield* pairSecondG(graph,label+' edges');const vertices=[],edgeList=[];
  for(let i=0;i<64;i++){const cell=yield* unconsG(verts,`${label} vertex ${i}`);if(!cell)break;const id=yield* pairFirstG(cell.h,`${label} vertex ${i} id`),coords=yield* pairSecondG(cell.h,`${label} vertex ${i} coords`);vertices.push({id:yield* idG(id,`v${i} id`),coords:yield* coordsG(coords,`v${i}`)});verts=cell.t;}
  for(let i=0;i<128;i++){const cell=yield* unconsG(edges,`${label} edge ${i}`);if(!cell)break;const a=yield* pairFirstG(cell.h,`${label} edge ${i} a`),b=yield* pairSecondG(cell.h,`${label} edge ${i} b`);edgeList.push([yield* idG(a,`e${i}a`),yield* idG(b,`e${i}b`)]);edges=cell.t;}
  return{vertices,edges:edgeList};
}
function* stateG(state,label='state'){
  const graph=yield* pairFirstG(state,label+' graph'),scale=yield* pairSecondG(state,label+' scale');return{graph:yield* graphG(graph,label+' graph'),scale:yield* binaryG(scale,label+' scale')};
}
function* workflow(){
  let state=yield{kind:'eval',fn:INIT_C,args:[],label:'boot / generate cube'},decoded=yield* stateG(state,'boot decode');yield{kind:'frame',state,decoded,label:'cube generated'};
  for(let frame=1;;frame++){state=yield{kind:'eval',fn:STEP_C,args:[state],label:`frame ${frame} / STEP`};decoded=yield* stateG(state,`frame ${frame} decode`);yield{kind:'frame',state,decoded,label:`frame ${frame} complete`};}
}
export{Machine,workflow};
