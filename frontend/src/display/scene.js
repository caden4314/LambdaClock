export function displayLayer(draw,options={}){
  if(typeof draw!=='function')throw new Error('display layer requires a draw function');
  return {draw,enabled:options.enabled??true,alpha:options.alpha??1,blend:options.blend??'source-over',init:options.init,resize:options.resize,destroy:options.destroy};
}

function enabled(layer,frame){return typeof layer.enabled==='function'?!!layer.enabled(frame):layer.enabled!==false}
function valueOf(value,frame,fallback){const out=typeof value==='function'?value(frame):value;return out??fallback}

export function createScene(...input){
  const layers=input.flat().filter(Boolean);
  return {
    init(frame){for(const layer of layers)layer.init?.(frame)},
    resize(frame){for(const layer of layers)layer.resize?.(frame)},
    render(frame){
      for(const layer of layers){
        if(!enabled(layer,frame))continue;
        const {ctx}=frame;ctx.save();ctx.globalAlpha*=Math.max(0,Math.min(1,Number(valueOf(layer.alpha,frame,1))));ctx.globalCompositeOperation=valueOf(layer.blend,frame,'source-over');layer.draw(frame);ctx.restore();
      }
    },
    destroy(){for(const layer of layers)layer.destroy?.()},
    layers
  };
}
