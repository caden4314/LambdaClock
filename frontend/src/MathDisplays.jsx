import {Match,Switch,onCleanup,onMount} from 'solid-js';

const TAU=Math.PI*2;
const META={
  rule110:{title:'Rule 110',equation:'next = rule110(left, center, right)',note:'continuous cellular computation / no generation reset'},
  rewrite:{title:'Rewrite Machine',equation:'X → X+YF+    Y → −FX−Y',note:'recursive rewriting / unbounded paperfolding walk'},
  fourier:{title:'Fourier Machine',equation:'f(t) = Σ 4/(πn) · sin(nt)',note:'rotating harmonics assemble a continuous signal'},
  complex:{title:'Complex Plane',equation:'zₙ₊₁ = zₙ² + c',note:'aspect-correct Mandelbrot plane / bounded live orbit'},
  lorenz:{title:'Lorenz System',equation:'ẋ=σ(y−x)   ẏ=x(ρ−z)−y   ż=xy−βz',note:'continuous integration / rolling strange-attractor history'},
  modular:{title:'Modular Circle',equation:'x → kx mod N',note:'continuous modular sweep / no visible reset'}
};

function CanvasSurface(props){
  let canvas,frame,observer,w=1,h=1,dpr=1,last=0;
  const resize=()=>{if(!canvas)return;const r=canvas.getBoundingClientRect();w=Math.max(1,r.width);h=Math.max(1,r.height);dpr=Math.min(globalThis.devicePixelRatio||1,2);canvas.width=Math.max(1,Math.round(w*dpr));canvas.height=Math.max(1,Math.round(h*dpr))};
  const render=(ctx,now,dt)=>{ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);props.draw(ctx,w,h,now/1000,dt)};
  const draw=now=>{const ctx=canvas.getContext('2d'),dt=last?Math.min(.08,(now-last)/1000):0;render(ctx,now,dt);last=now;frame=requestAnimationFrame(draw)};
  onMount(()=>{resize();observer=new ResizeObserver(resize);observer.observe(canvas);const ctx=canvas.getContext('2d');if(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches)render(ctx,0,0);else frame=requestAnimationFrame(draw)});
  onCleanup(()=>{cancelAnimationFrame(frame);observer?.disconnect()});
  return <canvas ref={canvas} class="math-canvas" aria-label={props.label}/>;
}

function drawLabel(ctx,w,h,text){ctx.save();ctx.fillStyle='rgba(255,255,255,.48)';ctx.font=`${Math.max(10,Math.min(13,w/65))}px ui-monospace, monospace`;ctx.textAlign='right';ctx.fillText(text,w-18,h-16);ctx.restore()}
function ruleStep(row){const out=new Uint8Array(row.length);for(let i=0;i<row.length;i++){const a=row[(i-1+row.length)%row.length],b=row[i],c=row[(i+1)%row.length],v=(a<<2)|(b<<1)|c;out[i]=(110>>v)&1}return out}
function Rule110(){
  let row=null,history=[],cols=0,generation=0n,acc=0;
  const seed=nextCols=>{cols=nextCols;row=new Uint8Array(cols);row[Math.floor(cols/2)]=1;history=[row.slice()];acc=0};
  const draw=(ctx,w,h,t,dt)=>{const cell=Math.max(3,Math.min(8,w/110)),nextCols=Math.ceil(w/cell),maxRows=Math.ceil(h/cell)+3;if(!row||nextCols!==cols)seed(nextCols);acc+=dt*8;let guard=0;while(acc>=1&&guard++<12){row=ruleStep(row);history.push(row.slice());generation++;if(history.length>maxRows+3)history.shift();acc-=1}const phase=acc*cell;for(let y=0;y<history.length;y++){const yy=h-(history.length-y)*cell-phase;if(yy>h||yy+cell<0)continue;ctx.globalAlpha=.12+.84*(y/Math.max(1,history.length-1));ctx.fillStyle='#fff';const r=history[y];for(let x=0;x<r.length;x++)if(r[x])ctx.fillRect(x*cell,yy,Math.max(1,cell-1),Math.max(1,cell-1))}ctx.globalAlpha=1;drawLabel(ctx,w,h,`generation ${generation.toString()}  •  live`)};
  return <CanvasSurface label="Continuously evolving Rule 110 cellular automaton" draw={draw}/>;
}

function dragonTurn(n){const low=n&(-n);return (((low<<1n)&n)!==0n)?1:-1}
function RewriteMachine(){
  let x=0,y=0,a=0,step=0n,acc=0;const points=[[0,0]],limit=5200;
  const advance=()=>{x+=Math.cos(a);y+=Math.sin(a);points.push([x,y]);step++;a+=dragonTurn(step)*Math.PI/2;if(points.length>limit)points.shift()};
  const draw=(ctx,w,h,t,dt)=>{acc+=dt*26;let guard=0;while(acc>=1&&guard++<16){advance();acc-=1}let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;for(const p of points){minX=Math.min(minX,p[0]);maxX=Math.max(maxX,p[0]);minY=Math.min(minY,p[1]);maxY=Math.max(maxY,p[1])}const pad=Math.min(w,h)*.1,sx=(w-pad*2)/Math.max(1,maxX-minX),sy=(h-pad*2)/Math.max(1,maxY-minY),scale=Math.min(sx,sy),ox=(w-(maxX-minX)*scale)/2-minX*scale,oy=(h-(maxY-minY)*scale)/2-minY*scale;ctx.lineCap='round';ctx.lineJoin='round';ctx.lineWidth=Math.max(.8,Math.min(1.7,w/900));for(let start=1;start<points.length;start+=700){const end=Math.min(points.length,start+701),alpha=.16+.7*(end/points.length);ctx.strokeStyle=`rgba(255,255,255,${alpha})`;ctx.beginPath();ctx.moveTo(ox+points[start-1][0]*scale,oy+points[start-1][1]*scale);for(let i=start;i<end;i++)ctx.lineTo(ox+points[i][0]*scale,oy+points[i][1]*scale);ctx.stroke()}const p=points[points.length-1];ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(ox+p[0]*scale,oy+p[1]*scale,3,0,TAU);ctx.fill();drawLabel(ctx,w,h,`${step.toString()} rewrite steps  •  rolling trail`)};
  return <CanvasSurface label="Continuously growing recursive dragon rewrite machine" draw={draw}/>;
}

function fourierPoint(t,terms,scale){let x=0,y=0;for(let q=0;q<terms;q++){const n=q*2+1,r=scale*4/(Math.PI*n);x+=r*Math.cos(n*t);y+=r*Math.sin(n*t)}return [x,y]}
function FourierMachine(){
  let phase=0,cycles=0n;
  const draw=(ctx,w,h,t,dt)=>{phase+=dt*1.25;while(phase>=TAU){phase-=TAU;cycles++}const terms=6,cx=w*.25,cy=h*.5,scale=Math.min(w,h)*.105,theta=phase;let x=cx,y=cy;ctx.lineWidth=1;for(let q=0;q<terms;q++){const n=q*2+1,r=scale*4/(Math.PI*n),nx=x+r*Math.cos(n*theta),ny=y+r*Math.sin(n*theta);ctx.strokeStyle=`rgba(255,255,255,${.18+q*.035})`;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.stroke();ctx.strokeStyle='rgba(255,255,255,.72)';ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(nx,ny);ctx.stroke();x=nx;y=ny}ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(x,y,3,0,TAU);ctx.fill();const start=Math.max(x+28,w*.48),end=w*.94;ctx.strokeStyle='rgba(255,255,255,.28)';ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(start,y);ctx.stroke();ctx.strokeStyle='rgba(255,255,255,.88)';ctx.lineWidth=1.5;ctx.beginPath();for(let px=start;px<=end;px+=2){const past=theta-(px-start)*.018,[,dy]=fourierPoint(past,terms,scale),py=cy+dy;if(px===start)ctx.moveTo(px,py);else ctx.lineTo(px,py)}ctx.stroke();drawLabel(ctx,w,h,`${terms} odd harmonics  •  cycle ${cycles.toString()}`)};
  return <CanvasSurface label="Continuously animated Fourier epicycles and waveform" draw={draw}/>;
}

function ComplexPlane(){
  let cache=null,cw=0,ch=0,phase=0,passes=0n,view=null;
  const getView=(w,h)=>{const spanY=2.55,spanX=spanY*(w/h),cx=-.58;return {minX:cx-spanX/2,maxX:cx+spanX/2,minY:-spanY/2,maxY:spanY/2}};
  const build=(w,h)=>{view=getView(w,h);const rw=Math.max(220,Math.min(620,Math.floor(w*.58))),rh=Math.max(120,Math.min(360,Math.round(rw*h/w))),off=document.createElement('canvas');off.width=rw;off.height=rh;const c=off.getContext('2d'),img=c.createImageData(rw,rh),max=88;for(let py=0;py<rh;py++)for(let px=0;px<rw;px++){const cr=view.minX+(view.maxX-view.minX)*px/(rw-1),ci=view.maxY-(view.maxY-view.minY)*py/(rh-1);let zr=0,zi=0,it=0,mag2=0;while((mag2=zr*zr+zi*zi)<=4&&it<max){const nzr=zr*zr-zi*zi+cr;zi=2*zr*zi+ci;zr=nzr;it++}let shade=0;if(it<max){const mag=Math.sqrt(Math.max(mag2,4.000001)),smooth=it+1-Math.log2(Math.log2(mag)),q=Math.max(0,Math.min(1,smooth/max));shade=Math.floor(18+220*Math.pow(q,.43))}const o=(py*rw+px)*4;img.data[o]=shade;img.data[o+1]=shade;img.data[o+2]=shade;img.data[o+3]=255}c.putImageData(img,0,0);cache=off;cw=w;ch=h};
  const draw=(ctx,w,h,t,dt)=>{if(!cache||Math.abs(cw-w)>2||Math.abs(ch-h)>2)build(w,h);phase+=dt*.18;while(phase>=TAU){phase-=TAU;passes++}ctx.imageSmoothingEnabled=true;ctx.globalAlpha=.9;ctx.drawImage(cache,0,0,w,h);ctx.globalAlpha=1;const muR=.92,mr=muR*Math.cos(phase),mi=muR*Math.sin(phase),cr=.5*mr-.25*(mr*mr-mi*mi),ci=.5*mi-.5*mr*mi,mx=x=>((x-view.minX)/(view.maxX-view.minX))*w,my=y=>((view.maxY-y)/(view.maxY-view.minY))*h,visible=(x,y)=>x>=-2&&x<=w+2&&y>=-2&&y<=h+2;const ox=mx(0),oy=my(0);ctx.strokeStyle='rgba(255,255,255,.09)';ctx.lineWidth=1;ctx.beginPath();if(ox>=0&&ox<=w){ctx.moveTo(ox,0);ctx.lineTo(ox,h)}if(oy>=0&&oy<=h){ctx.moveTo(0,oy);ctx.lineTo(w,oy)}ctx.stroke();let zr=0,zi=0;const orbit=[[0,0]];for(let i=0;i<96;i++){const nzr=zr*zr-zi*zi+cr,nzi=2*zr*zi+ci;zr=nzr;zi=nzi;if(!Number.isFinite(zr)||!Number.isFinite(zi)||zr*zr+zi*zi>64)break;orbit.push([zr,zi])}ctx.save();ctx.beginPath();ctx.rect(0,0,w,h);ctx.clip();for(let i=1;i<orbit.length;i++){const ax=mx(orbit[i-1][0]),ay=my(orbit[i-1][1]),bx=mx(orbit[i][0]),by=my(orbit[i][1]);if(!visible(ax,ay)||!visible(bx,by))continue;ctx.strokeStyle=`rgba(255,255,255,${.09+.62*i/orbit.length})`;ctx.lineWidth=.75+1.05*i/orbit.length;ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(bx,by);ctx.stroke()}for(let i=4;i<orbit.length;i+=5){const px=mx(orbit[i][0]),py=my(orbit[i][1]);if(!visible(px,py))continue;ctx.fillStyle=`rgba(255,255,255,${.12+.45*i/orbit.length})`;ctx.beginPath();ctx.arc(px,py,1.15,0,TAU);ctx.fill()}ctx.restore();const cx=mx(cr),cy=my(ci);if(visible(cx,cy)){ctx.strokeStyle='rgba(255,255,255,.95)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(cx-6,cy);ctx.lineTo(cx+6,cy);ctx.moveTo(cx,cy-6);ctx.lineTo(cx,cy+6);ctx.stroke()}const tail=orbit[orbit.length-1],tx=mx(tail[0]),ty=my(tail[1]);if(visible(tx,ty)){ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(tx,ty,2.8,0,TAU);ctx.fill()}drawLabel(ctx,w,h,`c = ${cr.toFixed(4)} ${ci<0?'−':'+'} ${Math.abs(ci).toFixed(4)}i  •  pass ${passes.toString()}`)};
  return <CanvasSurface label="Aspect-correct Mandelbrot plane with a continuously bounded orbit" draw={draw}/>;
}

function LorenzSystem(){
  const points=[];let x=.1,y=0,z=0,ready=false,acc=0,rotation=0,steps=0n;
  const integrate=()=>{const dt=.006,s=10,r=28,b=8/3,dx=s*(y-x),dy=x*(r-z)-y,dz=x*y-b*z;x+=dx*dt;y+=dy*dt;z+=dz*dt;points.push([x,y,z]);steps++;if(points.length>3200)points.shift()};
  const draw=(ctx,w,h,t,dt)=>{if(!ready){for(let i=0;i<2800;i++)integrate();ready=true}acc+=dt*470;let guard=0;while(acc>=1&&guard++<48){integrate();acc-=1}rotation=(rotation+dt*.075)%TAU;const ca=Math.cos(rotation),sa=Math.sin(rotation),scale=Math.min(w/60,h/55),project=p=>{const rx=p[0]*ca-p[1]*sa,ry=p[0]*sa+p[1]*ca;return [w*.5+rx*scale,h*.92-p[2]*scale+ry*.08]};ctx.lineWidth=1.05;ctx.strokeStyle='rgba(255,255,255,.5)';ctx.beginPath();points.forEach((p,i)=>{const [px,py]=project(p);if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py)});ctx.stroke();ctx.strokeStyle='rgba(255,255,255,.96)';ctx.lineWidth=1.55;ctx.beginPath();const start=Math.max(0,points.length-330);for(let i=start;i<points.length;i++){const [px,py]=project(points[i]);if(i===start)ctx.moveTo(px,py);else ctx.lineTo(px,py)}ctx.stroke();const [px,py]=project(points[points.length-1]);ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(px,py,3.2,0,TAU);ctx.fill();drawLabel(ctx,w,h,`step ${steps.toString()}  •  x ${x.toFixed(2)}  y ${y.toFixed(2)}  z ${z.toFixed(2)}`)};
  return <CanvasSurface label="Continuously integrated Lorenz strange attractor" draw={draw}/>;
}

function ModularCircle(){
  let kPhase=0,sweeps=0n;
  const draw=(ctx,w,h,t,dt)=>{const n=180;kPhase+=dt*.22;while(kPhase>=n){kPhase-=n;sweeps++}const k=2+kPhase,cx=w/2,cy=h/2,r=Math.min(w,h)*.39;ctx.lineWidth=.8;ctx.strokeStyle='rgba(255,255,255,.17)';ctx.beginPath();ctx.arc(cx,cy,r,0,TAU);ctx.stroke();for(let i=0;i<n;i++){const a=-Math.PI/2+TAU*i/n,b=-Math.PI/2+TAU*((i*k)%n)/n,alpha=.08+.13*(.5+.5*Math.sin(i*.31+k*.17));ctx.strokeStyle=`rgba(255,255,255,${alpha})`;ctx.beginPath();ctx.moveTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r);ctx.lineTo(cx+Math.cos(b)*r,cy+Math.sin(b)*r);ctx.stroke()}ctx.fillStyle='rgba(255,255,255,.72)';for(let i=0;i<n;i+=4){const a=-Math.PI/2+TAU*i/n;ctx.beginPath();ctx.arc(cx+Math.cos(a)*r,cy+Math.sin(a)*r,1.15,0,TAU);ctx.fill()}drawLabel(ctx,w,h,`N = ${n}   k = ${k.toFixed(3)}   sweep ${sweeps.toString()}`)};
  return <CanvasSurface label="Continuously evolving modular multiplication circle" draw={draw}/>;
}

export default function MathDisplay(props){const meta=()=>META[props.kind]||META.rule110;return <main class="math-screen"><header class="math-head"><h1>{meta().title}</h1><p>{meta().equation}</p><small>{meta().note}</small></header><div class="math-stage"><Switch fallback={<Rule110/>}><Match when={props.kind==='rule110'}><Rule110/></Match><Match when={props.kind==='rewrite'}><RewriteMachine/></Match><Match when={props.kind==='fourier'}><FourierMachine/></Match><Match when={props.kind==='complex'}><ComplexPlane/></Match><Match when={props.kind==='lorenz'}><LorenzSystem/></Match><Match when={props.kind==='modular'}><ModularCircle/></Match></Switch></div></main>}
