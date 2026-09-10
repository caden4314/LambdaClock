const clients=new Set();
let raf=0,lastTimestamp=0,frameMs=1000/60,workMs=0,frames=0;

const clock=()=>globalThis.performance?.now?.()??Date.now();

function requestFrame(){
  if(raf||!clients.size||typeof globalThis.requestAnimationFrame!=='function')return;
  raf=globalThis.requestAnimationFrame(runFrame);
}

function runFrame(timestamp){
  raf=0;
  if(!clients.size)return;
  if(lastTimestamp){
    const delta=timestamp-lastTimestamp;
    if(delta>=4&&delta<100)frameMs+=(delta-frameMs)*.08;
  }
  lastTimestamp=timestamp;
  const started=clock();
  for(const callback of clients){
    try{callback(timestamp,frameMs)}
    catch(error){console.error('Display frame failed',error)}
  }
  const cost=Math.max(0,clock()-started);
  workMs=frames?workMs+(cost-workMs)*.1:cost;
  frames++;
  requestFrame();
}

export function subscribeVsync(callback){
  if(typeof callback!=='function')throw new TypeError('vsync callback must be a function');
  clients.add(callback);
  requestFrame();
  return ()=>{
    clients.delete(callback);
    if(!clients.size&&raf&&typeof globalThis.cancelAnimationFrame==='function'){
      globalThis.cancelAnimationFrame(raf);
      raf=0;
      lastTimestamp=0;
    }
  };
}

export function getDisplaySchedulerStats(){
  return {
    activeSurfaces:clients.size,
    refreshHz:frameMs>0?1000/frameMs:60,
    frameMs,
    workMs,
    load:frameMs>0?Math.min(4,workMs/frameMs):0,
    frames
  };
}
