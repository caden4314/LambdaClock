const clients=new Set();
let raf=0,lastTimestamp=0;
const stats={activeSurfaces:0,refreshHz:60,frameMs:1000/60,workMs:0,load:0,frames:0};
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
    if(delta>=3&&delta<100)stats.frameMs+=(delta-stats.frameMs)*.08;
  }
  lastTimestamp=timestamp;
  const started=clock();
  for(const callback of clients){
    try{callback(timestamp,stats.frameMs)}catch(error){console.error('Display frame failed',error)}
  }
  const cost=Math.max(0,clock()-started);
  stats.workMs=stats.frames?stats.workMs+(cost-stats.workMs)*.1:cost;
  stats.frames++;
  stats.activeSurfaces=clients.size;
  stats.refreshHz=stats.frameMs>0?1000/stats.frameMs:60;
  stats.load=stats.frameMs>0?Math.min(4,stats.workMs/stats.frameMs):0;
  requestFrame();
}

export function subscribeVsync(callback){
  if(typeof callback!=='function')throw new TypeError('vsync callback must be a function');
  clients.add(callback);stats.activeSurfaces=clients.size;requestFrame();
  return ()=>{
    clients.delete(callback);stats.activeSurfaces=clients.size;
    if(!clients.size&&raf&&typeof globalThis.cancelAnimationFrame==='function'){
      globalThis.cancelAnimationFrame(raf);raf=0;lastTimestamp=0;
    }
  };
}

export function getDisplaySchedulerStats(){return stats}
