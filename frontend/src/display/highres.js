const finitePositive=(value,fallback)=>Number.isFinite(+value)&&+value>0?+value:fallback;

export function resolveHighResSize({width=1920,height=1080,scale=1,maxDimension=16384,maxPixels=64_000_000}={}){
  const logicalWidth=Math.max(1,Math.round(finitePositive(width,1920))),logicalHeight=Math.max(1,Math.round(finitePositive(height,1080)));
  const requestedScale=Math.max(.1,finitePositive(scale,1));
  const byDimension=Math.min(maxDimension/logicalWidth,maxDimension/logicalHeight);
  const byPixels=Math.sqrt(maxPixels/(logicalWidth*logicalHeight));
  const actualScale=Math.max(.1,Math.min(requestedScale,byDimension,byPixels));
  return {width:logicalWidth,height:logicalHeight,scale:actualScale,pixelWidth:Math.max(1,Math.round(logicalWidth*actualScale)),pixelHeight:Math.max(1,Math.round(logicalHeight*actualScale)),requestedScale,clamped:actualScale<requestedScale-.0001};
}

function makeCanvas(width,height,offscreen=true){
  if(offscreen&&typeof globalThis.OffscreenCanvas==='function')return new OffscreenCanvas(width,height);
  if(globalThis.document?.createElement){const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;return canvas}
  throw new Error('High-resolution canvas requires OffscreenCanvas or a browser document');
}

export function createHighResCanvas(options={}){
  const size=resolveHighResSize(options),canvas=makeCanvas(size.pixelWidth,size.pixelHeight,options.offscreen!==false);
  canvas.width=size.pixelWidth;canvas.height=size.pixelHeight;
  const ctx=canvas.getContext('2d',{alpha:options.alpha!==false,desynchronized:false});
  if(!ctx)throw new Error('2D canvas unavailable');
  ctx.setTransform(size.scale,0,0,size.scale,0,0);
  if(options.background){ctx.fillStyle=options.background;ctx.fillRect(0,0,size.width,size.height)}
  return {canvas,ctx,...size};
}

export async function renderHighRes(draw,options={}){
  const surface=createHighResCanvas(options);
  await draw?.({ctx:surface.ctx,width:surface.width,height:surface.height,scale:surface.scale,pixelWidth:surface.pixelWidth,pixelHeight:surface.pixelHeight,canvas:surface.canvas});
  return surface;
}

export async function highResBlob(surface,{type='image/png',quality=.96}={}){
  const canvas=surface?.canvas??surface;
  if(!canvas)throw new Error('canvas required');
  if(typeof canvas.convertToBlob==='function')return canvas.convertToBlob({type,quality});
  if(typeof canvas.toBlob==='function')return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('canvas export failed')),type,quality));
  throw new Error('canvas blob export unavailable');
}
