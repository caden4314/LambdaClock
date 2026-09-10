export const PHOSPHOR_MODELS=Object.freeze({
  P7:Object.freeze({
    id:'P7',label:'P7 radar',
    halfLives:[.005,.03,.2,2.0],
    weights:[.6518,.3283,.0225,.00128],
    colors:[[.70,.82,1.0],[1.0,.84,.22],[.78,.98,.22],[.46,.64,.08]],
    exposure:3.15,beamCurrent:1.75,spotRadius:5.2,bloom:0.42,
    deflectionHz:115,damping:.82,maxSlew:12000,
    blankOnTau:.0008,blankOffTau:.00045,retraceSpeed:5.5,
    edgeLoss:.08,grain:.026,glass:.12
  }),
  P31:Object.freeze({
    id:'P31',label:'P31 scope',
    halfLives:[.001,.0032,.012,.05],
    weights:[.15,.845,.0045,.0005],
    colors:[[.68,1.0,.54],[.48,1.0,.22],[.28,.76,.12],[.18,.45,.08]],
    exposure:2.4,beamCurrent:1.45,spotRadius:4.4,bloom:.32,
    deflectionHz:150,damping:.86,maxSlew:14500,
    blankOnTau:.00055,blankOffTau:.00035,retraceSpeed:6.5,
    edgeLoss:.06,grain:.018,glass:.1
  })
});

export function resolvePhosphorModel(model='P7'){
  if(model&&typeof model==='object')return model;
  return PHOSPHOR_MODELS[String(model||'P7').toUpperCase()]||PHOSPHOR_MODELS.P7;
}
export function phosphorDecayFactors(dt,model='P7',persistenceScale=1){
  const m=resolvePhosphorModel(model),scale=Math.max(.05,Number(persistenceScale)||1),t=Math.max(0,Number(dt)||0);
  return m.halfLives.map(halfLife=>Math.pow(.5,t/(Math.max(.0001,halfLife)*scale)));
}
export function phosphorDose({beamCurrent=1,velocity=1,referenceVelocity=900,min=.3,max=2.6}={}){
  const dwell=Math.max(min,Math.min(max,referenceVelocity/Math.max(80,Math.abs(velocity)||80)));
  const dose=Math.max(0,beamCurrent)*dwell;
  return 1-Math.exp(-dose);
}

export function phosphorRelativeEnergy(age,model='P7',persistenceScale=1){
  const m=resolvePhosphorModel(model),d=phosphorDecayFactors(age,m,persistenceScale),sum=m.weights.reduce((a,b)=>a+b,0)||1;
  return m.weights.reduce((total,w,i)=>total+w*d[i],0)/sum;
}
