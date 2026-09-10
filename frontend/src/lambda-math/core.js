// Untyped lambda-calculus core used by the math library.
export const V=name=>({t:'v',name});
export const L=(name,body)=>({t:'l',name,body});
export const A=(fn,arg)=>({t:'a',fn,arg});
export const lams=(names,body)=>names.reduceRight((out,name)=>L(name,out),body);
export const apps=(fn,...args)=>args.reduce((out,arg)=>A(out,arg),fn);
export const letIn=(name,value,body)=>A(L(name,body),value);

export function compile(node,scope=[]){
  if(node.t==='v'){
    const index=scope.indexOf(node.name);
    if(index<0)throw new Error(`free lambda variable: ${node.name}`);
    return {t:'v',i:index};
  }
  if(node.t==='l')return {t:'l',body:compile(node.body,[node.name,...scope])};
  return {t:'a',fn:compile(node.fn,scope),arg:compile(node.arg,scope)};
}

export function termSize(node){
  if(node.t==='v')return 1;
  if(node.t==='l')return 1+termSize(node.body);
  return 1+termSize(node.fn)+termSize(node.arg);
}

export function pretty(node,depth=0){
  if(depth>7)return '…';
  if(node.t==='v')return node.name;
  if(node.t==='l')return `λ${node.name}.${pretty(node.body,depth+1)}`;
  return `(${pretty(node.fn,depth+1)} ${pretty(node.arg,depth+1)})`;
}
function C(term,env=[],marker=null){return {term,env,marker,value:null}}
function tick(stats){
  stats.beta++;
  if(stats.beta>stats.limit)throw new Error(`beta-step limit exceeded (${stats.limit})`);
}

export function makeEvaluator(limit=2_000_000){
  const stats={beta:0,forces:0,limit};
  function whnf(input){
    let c=input;
    while(true){
      if(c.value)c=c.value;
      else if(c.term.t==='v'){
        const next=c.env[c.term.i];
        if(!next)throw new Error(`bad de Bruijn index ${c.term.i}`);
        c=force(next);
      }else if(c.term.t==='a'){
        const fn=whnf(C(c.term.fn,c.env));
        if(fn.term.t!=='l')throw new Error('application head did not reduce to lambda');
        tick(stats);
        c=C(fn.term.body,[C(c.term.arg,c.env),...fn.env]);
      }else return c;
    }
  }
  function force(c){
    if(c.value)return c.value;
    stats.forces++;
    const out=whnf(c);
    if(out!==c)c.value=out;
    return out;
  }
  function apply(fn,arg){
    const head=whnf(fn);
    if(head.term.t!=='l')throw new Error('attempted to apply non-lambda');
    tick(stats);
    return C(head.term.body,[arg,...head.env]);
  }
  return {stats,closure:(term,marker=null)=>C(term,[],marker),whnf,force,apply};
}
const MARK_TRUE={t:'l',body:{t:'v',i:0}};
const MARK_FALSE={t:'l',body:{t:'l',body:{t:'v',i:1}}};

export function decodeBoolean(ev,boolClosure){
  const t=ev.closure(MARK_TRUE,'T');
  const f=ev.closure(MARK_FALSE,'F');
  const first=ev.apply(boolClosure,t);
  const chosen=ev.whnf(ev.apply(first,f));
  if(chosen.marker==='T')return true;
  if(chosen.marker==='F')return false;
  throw new Error('lambda value is not a Church boolean');
}

export function runClosed(named,{limit=2_000_000}={}){
  const db=compile(named);
  const evaluator=makeEvaluator(limit);
  return {db,evaluator,value:evaluator.closure(db)};
}