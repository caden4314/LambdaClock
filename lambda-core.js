/* ---------- named lambda AST builder ---------- */
const NV=n=>({t:'v',n});
const NL=(n,b)=>({t:'l',n,b});
const NA=(f,x)=>({t:'a',f,x});
const v=NV;
const app=(...xs)=>xs.reduce((a,b)=>NA(a,b));
const lam=(names,body)=>names.reduceRight((b,n)=>NL(n,b),body);
function lets(bindings,body){
  let out=body;
  for(let i=bindings.length-1;i>=0;i--){const [n,val]=bindings[i];out=NA(NL(n,out),val);}
  return out;
}

/* ---------- de Bruijn lambda calculus ---------- */
const DV=i=>({t:'v',i});
const DL=b=>({t:'l',b});
const DA=(f,x)=>({t:'a',f,x});
function compile(t,env=[]){
  if(t.t==='v'){const i=env.indexOf(t.n);if(i<0)throw new Error('free variable: '+t.n);return DV(i);}
  if(t.t==='l')return DL(compile(t.b,[t.n,...env]));
  return DA(compile(t.f,env),compile(t.x,env));
}
/* ---------- pure lambda library ---------- */
const TRUE=lam(['t','f'],v('t'));
const FALSE=lam(['t','f'],v('f'));
const Y=lam(['f'],app(lam(['x'],app(v('f'),app(v('x'),v('x')))),lam(['x'],app(v('f'),app(v('x'),v('x'))))));
const PAIR=lam(['a','b','s'],app(v('s'),v('a'),v('b')));
const FST=lam(['p'],app(v('p'),v('TRUE')));
const SND=lam(['p'],app(v('p'),v('FALSE')));
const NIL=lam(['n','c'],v('n'));
const CONS=lam(['h','t','n','c'],app(v('c'),v('h'),v('t')));
const ISNIL=lam(['l'],app(v('l'),v('TRUE'),lam(['h','t'],v('FALSE'))));
const HEAD=lam(['l'],app(v('l'),v('FALSE'),lam(['h','t'],v('h'))));
const TAIL=lam(['l'],app(v('l'),v('NIL'),lam(['h','t'],v('t'))));
const NOT=lam(['a'],app(v('a'),v('FALSE'),v('TRUE')));
const AND=lam(['a','b'],app(v('a'),v('b'),v('FALSE')));
const OR=lam(['a','b'],app(v('a'),v('TRUE'),v('b')));
const XOR=lam(['a','b'],app(v('a'),app(v('NOT'),v('b')),v('b')));

const BADD=app(v('Y'),lam(['self','a','b','carry'],
  app(v('a'),
    app(v('b'),
      app(v('carry'),app(v('CONS'),v('TRUE'),v('NIL')),v('NIL')),
      lam(['bh','bt'],app(v('CONS'),
        app(v('XOR'),v('bh'),v('carry')),
        app(v('self'),v('NIL'),v('bt'),app(v('AND'),v('bh'),v('carry')))))),
    lam(['ah','at'],
      app(v('b'),
        app(v('CONS'),
          app(v('XOR'),v('ah'),v('carry')),
          app(v('self'),v('at'),v('NIL'),app(v('AND'),v('ah'),v('carry')))),
        lam(['bh','bt'],app(v('CONS'),
          app(v('XOR'),app(v('XOR'),v('ah'),v('bh')),v('carry')),
          app(v('self'),v('at'),v('bt'),
            app(v('OR'),app(v('AND'),v('ah'),v('bh')),app(v('AND'),v('carry'),app(v('XOR'),v('ah'),v('bh'))))))))))
));
const ADDN=lam(['a','b'],app(v('BADD'),v('a'),v('b'),v('FALSE')));
const SHL1=lam(['n'],app(v('CONS'),v('FALSE'),v('n')));
const SHL2=lam(['n'],app(v('CONS'),v('FALSE'),app(v('CONS'),v('FALSE'),v('n'))));
const SHL3=lam(['n'],app(v('CONS'),v('FALSE'),app(v('CONS'),v('FALSE'),app(v('CONS'),v('FALSE'),v('n')))));
const MUL5=lam(['n'],app(v('ADDN'),v('n'),app(v('SHL2'),v('n'))));
const MUL12=lam(['n'],app(v('ADDN'),app(v('SHL2'),v('n')),app(v('SHL3'),v('n'))));
const MUL13=lam(['n'],app(v('ADDN'),v('n'),app(v('MUL12'),v('n'))));
const MUL169=lam(['n'],app(v('MUL13'),app(v('MUL13'),v('n'))));

const ZNEG=lam(['z'],app(v('PAIR'),app(v('SND'),v('z')),app(v('FST'),v('z'))));
const ZADD=lam(['a','b'],app(v('PAIR'),
  app(v('ADDN'),app(v('FST'),v('a')),app(v('FST'),v('b'))),
  app(v('ADDN'),app(v('SND'),v('a')),app(v('SND'),v('b')))));
function zscale(name){return lam(['z'],app(v('PAIR'),app(v(name),app(v('FST'),v('z'))),app(v(name),app(v('SND'),v('z')))));}
const ZSCALE5=zscale('MUL5'), ZSCALE12=zscale('MUL12'), ZSCALE13=zscale('MUL13');

const MAP=app(v('Y'),lam(['self','f','l'],app(v('l'),v('NIL'),lam(['h','t'],app(v('CONS'),app(v('f'),v('h')),app(v('self'),v('f'),v('t')))))));
const APPEND=app(v('Y'),lam(['self','a','b'],app(v('a'),v('b'),lam(['h','t'],app(v('CONS'),v('h'),app(v('self'),v('t'),v('b')))))));
const PLUSID=lam(['id'],app(v('CONS'),v('TRUE'),v('id')));
const MINUSID=lam(['id'],app(v('CONS'),v('FALSE'),v('id')));
const PLUSREC=lam(['r','rec'],app(v('PAIR'),
  app(v('PLUSID'),app(v('FST'),v('rec'))),
  app(v('CONS'),v('r'),app(v('SND'),v('rec')))));
const MINUSREC=lam(['r','rec'],app(v('PAIR'),
  app(v('MINUSID'),app(v('FST'),v('rec'))),
  app(v('CONS'),app(v('ZNEG'),v('r')),app(v('SND'),v('rec')))));
const MAPEDGE=lam(['fn','edge'],app(v('PAIR'),app(v('fn'),app(v('FST'),v('edge'))),app(v('fn'),app(v('SND'),v('edge')))));
const SEED=app(v('PAIR'),app(v('CONS'),app(v('PAIR'),v('NIL'),v('NIL')),v('NIL')),v('NIL'));
const THREE=lam(['f','x'],app(v('f'),app(v('f'),app(v('f'),v('x')))));
const ONE=app(v('CONS'),v('TRUE'),v('NIL'));
const RADIUS=app(v('PAIR'),v('ONE'),v('NIL'));

const EXPAND_INNER=lam(['verts','edges'],
  app(v('PAIR'),
    app(v('APPEND'),
      app(v('MAP'),app(v('PLUSREC'),v('r')),v('verts')),
      app(v('MAP'),app(v('MINUSREC'),v('r')),v('verts'))),
    app(v('APPEND'),
      app(v('MAP'),app(v('MAPEDGE'),v('PLUSID')),v('edges')),
      app(v('APPEND'),
        app(v('MAP'),app(v('MAPEDGE'),v('MINUSID')),v('edges')),
        app(v('MAP'),
          lam(['rec'],app(v('PAIR'),
            app(v('PLUSID'),app(v('FST'),v('rec'))),
            app(v('MINUSID'),app(v('FST'),v('rec'))))),
          v('verts'))))));
const EXPAND=lam(['r','g'],app(EXPAND_INNER,app(v('FST'),v('g')),app(v('SND'),v('g'))));

const V3=lam(['x','y','z'],app(v('CONS'),v('x'),app(v('CONS'),v('y'),app(v('CONS'),v('z'),v('NIL')))));
const VX=lam(['p'],app(v('HEAD'),v('p')));
const VY=lam(['p'],app(v('HEAD'),app(v('TAIL'),v('p'))));
const VZ=lam(['p'],app(v('HEAD'),app(v('TAIL'),app(v('TAIL'),v('p')))));
const RY=lam(['p'],app(
  lam(['x','y','z'],app(v('V3'),
    app(v('ZADD'),app(v('ZSCALE12'),v('x')),app(v('ZSCALE5'),v('z'))),
    app(v('ZSCALE13'),v('y')),
    app(v('ZADD'),app(v('ZSCALE12'),v('z')),app(v('ZNEG'),app(v('ZSCALE5'),v('x')))))),
  app(v('VX'),v('p')),app(v('VY'),v('p')),app(v('VZ'),v('p'))));
const RX=lam(['p'],app(
  lam(['x','y','z'],app(v('V3'),
    app(v('ZSCALE13'),v('x')),
    app(v('ZADD'),app(v('ZSCALE12'),v('y')),app(v('ZNEG'),app(v('ZSCALE5'),v('z')))),
    app(v('ZADD'),app(v('ZSCALE5'),v('y')),app(v('ZSCALE12'),v('z'))))),
  app(v('VX'),v('p')),app(v('VY'),v('p')),app(v('VZ'),v('p'))));
const ROT=lam(['p'],app(v('RX'),app(v('RY'),v('p'))));
const ROTREC=lam(['rec'],app(v('PAIR'),app(v('FST'),v('rec')),app(v('ROT'),app(v('SND'),v('rec')))));
const ROTGRAPH=lam(['g'],app(v('PAIR'),app(v('MAP'),v('ROTREC'),app(v('FST'),v('g'))),app(v('SND'),v('g'))));
const STEP=lam(['state'],app(v('PAIR'),app(v('ROTGRAPH'),app(v('FST'),v('state'))),app(v('MUL169'),app(v('SND'),v('state')))));
const INIT=app(v('PAIR'),app(v('THREE'),app(v('EXPAND'),v('RADIUS')),v('SEED')),v('ONE'));

const defs=[
  ['TRUE',TRUE],['FALSE',FALSE],['Y',Y],['PAIR',PAIR],['FST',FST],['SND',SND],
  ['NIL',NIL],['CONS',CONS],['ISNIL',ISNIL],['HEAD',HEAD],['TAIL',TAIL],
  ['NOT',NOT],['AND',AND],['OR',OR],['XOR',XOR],['BADD',BADD],['ADDN',ADDN],
  ['SHL1',SHL1],['SHL2',SHL2],['SHL3',SHL3],['MUL5',MUL5],['MUL12',MUL12],['MUL13',MUL13],['MUL169',MUL169],
  ['ZNEG',ZNEG],['ZADD',ZADD],['ZSCALE5',ZSCALE5],['ZSCALE12',ZSCALE12],['ZSCALE13',ZSCALE13],
  ['MAP',MAP],['APPEND',APPEND],['PLUSID',PLUSID],['MINUSID',MINUSID],['PLUSREC',PLUSREC],['MINUSREC',MINUSREC],['MAPEDGE',MAPEDGE],
  ['SEED',SEED],['THREE',THREE],['ONE',ONE],['RADIUS',RADIUS],['EXPAND',EXPAND],
  ['V3',V3],['VX',VX],['VY',VY],['VZ',VZ],['RY',RY],['RX',RX],['ROT',ROT],['ROTREC',ROTREC],['ROTGRAPH',ROTGRAPH],['STEP',STEP],['INIT',INIT]
];

const initProgram=compile(lets(defs,v('INIT')));
const stepProgram=compile(lam(['state'],lets(defs,app(v('STEP'),v('state')))));

const trueTerm=compile(TRUE),falseTerm=compile(FALSE);
const nilMarkTerm=compile(lam(['x'],v('x')));
const consCaseTerm=compile(lam(['h','t','s'],app(v('s'),v('h'),v('t'))));
const boolTMarkTerm=compile(lam(['x','y'],v('x'))),boolFMarkTerm=compile(lam(['x','y'],v('y')));
export {initProgram,stepProgram,trueTerm,falseTerm,nilMarkTerm,consCaseTerm,boolTMarkTerm,boolFMarkTerm};
