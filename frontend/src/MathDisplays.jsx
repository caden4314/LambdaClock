import {Match,Switch,onCleanup,onMount} from 'solid-js';

const TAU=Math.PI*2;
const META={
  rule110:{title:'Rule 110',equation:'next = rule110(left, center, right)',note:'one bit-wide rule / universal computation'},
  rewrite:{title:'Rewrite Machine',equation:'F → F+F−−F+F',note:'symbol rewriting becomes geometry'},
  fourier:{title:'Fourier Machine',equation:'f(t) = Σ 4/(πn) · sin(nt)',note:'rotating harmonics assemble a signal'},
  complex:{title:'Complex Plane',equation:'zₙ₊₁ = zₙ² + c',note:'every pixel is an iterated complex equation'},
  lorenz:{title:'Lorenz System',equation:'ẋ=σ(y−x)   ẏ=x(ρ−z)−y   ż=xy−βz',note:'three equations / one strange attractor'},
  modular:{title:'Modular Circle',equation:'x → kx mod N',note:'arithmetic becomes changing geometry'}
};

function CanvasSurface(props){
  let canvas,frame,observer,w=1,h=1,dpr=1,last=0;
  const resize=()=>{if(!canvas)return;const r=canvas.getBoundingClientRect();w=Math.max(1,r.width);h=Math.max(1,r.height);dpr=Math.min(globalThis.devicePixelRatio||1,2);canvas.width=Math.max(1,Math.round(w*dpr));canvas.height=Math.max(1,Math.round(h*dpr))};
  const draw=now=>{const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);props.draw(ctx,w,h,now/1000,last?(now-last)/1000:0);last=now;frame=requestAnimationFrame(draw)};
  onMount(()=>{resize();observer=new ResizeObserver(resize);observer.observe(canvas);if(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches){props.draw(canvas.getContext('2d'),w,h,0,0)}else frame=requestAnimationFrame(draw)});
  onCleanup(()=>{cancelAnimationFrame(frame);observer?.disconnect()});
  return <canvas ref={canvas} class="math-canvas" aria-label={props.label}/>;
}

function drawLabel(ctx,w,h,text){ctx.save();ctx.fillStyle='rgba(255,255,255,.48)';ctx.font=`${Math.max(10,Math.min(13,w/65))}px ui-monospace, monospace`;ctx.textAlign='right';ctx.fillText(text,w-18,h-16);ctx.restore()}
function ruleStep(row){const out=new Uint8Array(row.length);for(let i=0;i<row.length;i++){const a=row[(i-1+row.length)%row.length],b=row[i],c=row[(i+1)%row.length],v=(a<<2)|(b<<1)|c;out[i]=(110>>v)&1}return out}
function Rule110(){
  const draw=(ctx,w,h,t)=>{const cell=Math.max(3,Math.min(8,w/110)),cols=Math.ceil(w/cell),rows=Math.ceil(h/cell)+2,base=Math.floor(t*7)%320,phase=(t*7)%1;let row=new Uint8Array(cols);row[Math.floor(cols/2)]=1;for(let i=0;i<base;i++)row=ruleStep(row);ctx.fillStyle='#fff';for(let y=0;y<rows;y++){const yy=(y-phase)*cell;const alpha=.15+.78*(y/rows);ctx.globalAlpha=alpha;for(let x=0;x<cols;x++)if(row[x])ctx.fillRect(x*cell,yy,Math.max(1,cell-1),Math.max(1,cell-1));row=ruleStep(row)}ctx.globalAlpha=1;drawLabel(ctx,w,h,`generation ${base}`)};
  return <CanvasSurface label="Animated Rule 110 cellular automaton" draw={draw}/>;
}

function kochPoints(g){let word='F';for(let n=0;n<g;n++)word=word.replaceAll('F','F+F--F+F');let x=0,y=0,a=0,minX=0,maxX=0,minY=0,maxY=0;const points=[[0,0]];for(const ch of word){if(ch==='F'){x+=Math.cos(a);y+=Math.sin(a);points.push([x,y]);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y)}else if(ch==='+')a-=Math.PI/3;else if(ch==='-')a+=Math.PI/3}return {points,minX,maxX,minY,maxY,wordLength:word.length}}
function RewriteMachine(){
  const cache=new Map();
  const draw=(ctx,w,h,t)=>{const cycle=t/4,g=Math.floor(cycle)%5,progress=.12+.88*Math.min(1,(cycle%1)*1.3),data=cache.get(g)||kochPoints(g);cache.set(g,data);const pad=Math.min(w,h)*.11,sx=(w-pad*2)/Math.max(1,data.maxX-data.minX),sy=(h-pad*2)/Math.max(1,data.maxY-data.minY),scale=Math.min(sx,sy),ox=(w-(data.maxX-data.minX)*scale)/2-data.minX*scale,oy=(h-(data.maxY-data.minY)*scale)/2-data.minY*scale,count=Math.max(1,Math.floor((data.points.length-1)*progress));ctx.lineWidth=Math.max(1,Math.min(2,w/700));ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='rgba(255,255,255,.9)';ctx.beginPath();ctx.moveTo(ox+data.points[0][0]*scale,oy+data.points[0][1]*scale);for(let i=1;i<=count;i++)ctx.lineTo(ox+data.points[i][0]*scale,oy+data.points[i][1]*scale);ctx.stroke();const p=data.points[count];ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(ox+p[0]*scale,oy+p[1]*scale,3,0,TAU);ctx.fill();drawLabel(ctx,w,h,`generation ${g}  •  ${data.wordLength} symbols`)};
  return <CanvasSurface label="Animated L-system rewrite machine" draw={draw}/>;
}

function fourierPoint(t,terms,scale){let x=0,y=0;for(let q=0;q<terms;q++){const n=q*2+1,r=scale*4/(Math.PI*n);x+=r*Math.cos(n*t);y+=r*Math.sin(n*t)}return [x,y]}
function FourierMachine(){
  const draw=(ctx,w,h,t)=>{const terms=6,cx=w*.25,cy=h*.5,scale=Math.min(w,h)*.105,theta=t*1.25;let x=cx,y=cy;ctx.lineWidth=1;for(let q=0;q<terms;q++){const n=q*2+1,r=scale*4/(Math.PI*n),nx=x+r*Math.cos(n*theta),ny=y+r*Math.sin(n*theta);ctx.strokeStyle=`rgba(255,255,255,${.18+q*.035})`;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.stroke();ctx.strokeStyle='rgba(255,255,255,.72)';ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(nx,ny);ctx.stroke();x=nx;y=ny}ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(x,y,3,0,TAU);ctx.fill();const start=Math.max(x+28,w*.48),end=w*.94;ctx.strokeStyle='rgba(255,255,255,.28)';ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(start,y);ctx.stroke();ctx.strokeStyle='rgba(255,255,255,.88)';ctx.lineWidth=1.5;ctx.beginPath();for(let px=start;px<=end;px+=2){const past=theta-(px-start)*.018,[,dy]=fourierPoint(past,terms,scale),py=cy+dy;if(px===start)ctx.moveTo(px,py);else ctx.lineTo(px,py)}ctx.stroke();drawLabel(ctx,w,h,`${terms} odd harmonics`)};
  return <CanvasSurface label="Animated Fourier epicycles and waveform" draw={draw}/>;
}

function ComplexPlane(){
  let cache=null,cw=0,ch=0;
  const build=(w,h)=>{const rw=Math.max(120,Math.min(320,Math.floor(w*.42))),rh=Math.max(90,Math.min(220,Math.floor(h*.42))),off=document.createElement('canvas');off.width=rw;off.height=rh;const c=off.getContext('2d'),img=c.createImageData(rw,rh),max=42;for(let py=0;py<rh;py++)for(let px=0;px<rw;px++){const cr=-2.5+3.5*px/(rw-1),ci=1.35-2.7*py/(rh-1);let zr=0,zi=0,it=0;while(zr*zr+zi*zi<=4&&it<max){const nzr=zr*zr-zi*zi+cr;zi=2*zr*zi+ci;zr=nzr;it++}const shade=it===max?0:Math.floor(38+205*it/max),o=(py*rw+px)*4;img.data[o]=shade;img.data[o+1]=shade;img.data[o+2]=shade;img.data[o+3]=255}c.putImageData(img,0,0);cache=off;cw=w;ch=h};
  const draw=(ctx,w,h,t)=>{if(!cache||Math.abs(cw-w)>2||Math.abs(ch-h)>2)build(w,h);ctx.imageSmoothingEnabled=true;ctx.globalAlpha=.74;ctx.drawImage(cache,0,0,w,h);ctx.globalAlpha=1;const cr=-.72+.42*Math.cos(t*.31),ci=.24*Math.sin(t*.47),mx=x=>((x+2.5)/3.5)*w,my=y=>((1.35-y)/2.7)*h;let zr=0,zi=0;ctx.strokeStyle='rgba(255,255,255,.78)';ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(mx(0),my(0));for(let i=0;i<26;i++){const nzr=zr*zr-zi*zi+cr;zi=2*zr*zi+ci;zr=nzr;if(zr*zr+zi*zi>16)break;ctx.lineTo(mx(zr),my(zi))}ctx.stroke();const x=mx(cr),y=my(ci);ctx.strokeStyle='#fff';ctx.beginPath();ctx.moveTo(x-8,y);ctx.lineTo(x+8,y);ctx.moveTo(x,y-8);ctx.lineTo(x,y+8);ctx.stroke();drawLabel(ctx,w,h,`c = ${cr.toFixed(3)} ${ci<0?'−':'+'} ${Math.abs(ci).toFixed(3)}i`)};
  return <CanvasSurface label="Animated Mandelbrot complex plane with orbit" draw={draw}/>;
}

function LorenzSystem(){
  const points=[];let x=.1,y=0,z=0,ready=false;
  const integrate=()=>{const dt=.006,s=10,r=28,b=8/3,dx=s*(y-x),dy=x*(r-z)-y,dz=x*y-b*z;x+=dx*dt;y+=dy*dt;z+=dz*dt;points.push([x,y,z]);if(points.length>2600)points.shift()};
  const draw=(ctx,w,h,t)=>{if(!ready){for(let i=0;i<3100;i++)integrate();ready=true}for(let i=0;i<7;i++)integrate();const a=t*.055,ca=Math.cos(a),sa=Math.sin(a),project=p=>{const rx=p[0]*ca-p[1]*sa,ry=p[0]*sa+p[1]*ca;return [w*.5+rx*Math.min(w/60,h/55),h*.92-p[2]*Math.min(w/60,h/55)+ry*.08]};ctx.lineWidth=1.15;ctx.strokeStyle='rgba(255,255,255,.62)';ctx.beginPath();points.forEach((p,i)=>{const [px,py]=project(p);if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py)});ctx.stroke();ctx.strokeStyle='rgba(255,255,255,.95)';ctx.lineWidth=1.6;ctx.beginPath();for(let i=Math.max(0,points.length-260);i<points.length;i++){const [px,py]=project(points[i]);if(i===Math.max(0,points.length-260))ctx.moveTo(px,py);else ctx.lineTo(px,py)}ctx.stroke();const [px,py]=project(points[points.length-1]);ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(px,py,3.3,0,TAU);ctx.fill();drawLabel(ctx,w,h,`x ${x.toFixed(2)}   y ${y.toFixed(2)}   z ${z.toFixed(2)}`)};
  return <CanvasSurface label="Animated Lorenz strange attractor" draw={draw}/>;
}

function ModularCircle(){
  const draw=(ctx,w,h,t)=>{const n=180,k=4.5+2.5*Math.sin(t*.22),cx=w/2,cy=h/2,r=Math.min(w,h)*.39;ctx.lineWidth=.8;ctx.strokeStyle='rgba(255,255,255,.16)';ctx.beginPath();ctx.arc(cx,cy,r,0,TAU);ctx.stroke();ctx.strokeStyle='rgba(255,255,255,.16)';for(let i=0;i<n;i++){const a=-Math.PI/2+TAU*i/n,b=-Math.PI/2+TAU*((i*k)%n)/n;ctx.beginPath();ctx.moveTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r);ctx.lineTo(cx+Math.cos(b)*r,cy+Math.sin(b)*r);ctx.stroke()}ctx.fillStyle='rgba(255,255,255,.75)';for(let i=0;i<n;i+=4){const a=-Math.PI/2+TAU*i/n;ctx.beginPath();ctx.arc(cx+Math.cos(a)*r,cy+Math.sin(a)*r,1.2,0,TAU);ctx.fill()}drawLabel(ctx,w,h,`N = ${n}   k = ${k.toFixed(3)}`)};
  return <CanvasSurface label="Animated modular multiplication circle" draw={draw}/>;
}

export default function MathDisplay(props){const meta=()=>META[props.kind]||META.rule110;return <main class="math-screen"><header class="math-head"><h1>{meta().title}</h1><p>{meta().equation}</p><small>{meta().note}</small></header><div class="math-stage"><Switch fallback={<Rule110/>}><Match when={props.kind==='rule110'}><Rule110/></Match><Match when={props.kind==='rewrite'}><RewriteMachine/></Match><Match when={props.kind==='fourier'}><FourierMachine/></Match><Match when={props.kind==='complex'}><ComplexPlane/></Match><Match when={props.kind==='lorenz'}><LorenzSystem/></Match><Match when={props.kind==='modular'}><ModularCircle/></Match></Switch></div></main>}
