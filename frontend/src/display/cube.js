import {clamp} from './engine.js';
import {createBeamPath} from './phosphor.js';

export const CUBE_VERTICES=Object.freeze([
  [-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],
  [-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]
]);
export const CUBE_EDGES=Object.freeze([[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]]);
// Ordered for a CRT beam: long connected runs with blanked retraces only when needed.
export const CUBE_TRACE_EDGES=Object.freeze([[0,1],[1,2],[2,3],[3,0],[0,4],[4,5],[5,6],[6,7],[7,4],[1,5],[2,6],[3,7]]);

export function rotatePoint3D(point,rotation={}){
  const [x,y,z]=point;
  const sx=rotation.sinX??0,cx=rotation.cosX??1,sy=rotation.sinY??0,cy=rotation.cosY??1,sz=rotation.sinZ??0,cz=rotation.cosZ??1;
  const y1=y*cx-z*sx,z1=y*sx+z*cx;
  const x2=x*cy+z1*sy,z2=-x*sy+z1*cy;
  return [x2*cz-y1*sz,x2*sz+y1*cz,z2];
}

export function rotatePointByBasis(point,basis){
  const b=basis?.length===3?basis:[[1,0,0],[0,1,0],[0,0,1]],x=point[0],y=point[1],z=point[2];
  return [x*b[0][0]+y*b[1][0]+z*b[2][0],x*b[0][1]+y*b[1][1]+z*b[2][1],x*b[0][2]+y*b[1][2]+z*b[2][2]];
}

export function projectPoint3D(point,{width=1,height=1,distance=4.4,scale=.31}={}){
  const d=Math.max(2.2,Number(distance)||4.4),perspective=d/Math.max(.2,d-point[2]),s=Math.min(width,height)*(Number(scale)||.31)*perspective;
  return [width*.5+point[0]*s,height*.5-point[1]*s,point[2],perspective];
}

export function cubeProjection(rotation,options={}){
  const rotated=CUBE_VERTICES.map(point=>rotatePoint3D(point,rotation));
  return rotated.map(point=>projectPoint3D(point,options));
}

export function cubeProjectionFromBasis(basis,options={}){
  const rotated=CUBE_VERTICES.map(point=>rotatePointByBasis(point,basis));
  return rotated.map(point=>projectPoint3D(point,options));
}

export function cubeBeamPath(basis,{width,height,distance=4.7,scale=.24,blankRetrace=true}={}){
  const points=cubeProjectionFromBasis(basis,{width,height,distance,scale});
  return createBeamPath(points,CUBE_TRACE_EDGES,{blankRetrace});
}

export function drawWireCube(ctx,{width,height,rotation,distance=4.4,scale=.31,alpha=.94,lineWidth=1.35,widthScale=1,alphaScale=1,vertices=true}={}){
  const points=cubeProjection(rotation,{width,height,distance,scale}),as=Math.max(0,alphaScale),ws=Math.max(.1,widthScale);
  ctx.save();ctx.strokeStyle='#fff';ctx.fillStyle='#fff';ctx.lineCap='round';ctx.lineJoin='round';ctx.lineWidth=lineWidth*ws;
  for(const [a,b] of CUBE_EDGES){
    const p=points[a],q=points[b],depth=clamp(((p[2]+q[2])*.25)+.5,0,1);
    ctx.globalAlpha=alpha*as*(.42+.58*depth);ctx.beginPath();ctx.moveTo(p[0],p[1]);ctx.lineTo(q[0],q[1]);ctx.stroke();
  }
  if(vertices){
    for(const point of points){
      const depth=clamp(point[2]*.25+.5,0,1),r=(1.25+depth*.9)*Math.sqrt(ws);
      ctx.globalAlpha=alpha*as*(.5+.5*depth);ctx.beginPath();ctx.arc(point[0],point[1],r,0,Math.PI*2);ctx.fill();
    }
  }
  ctx.restore();return points;
}
