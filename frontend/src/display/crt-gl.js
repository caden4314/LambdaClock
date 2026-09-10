import {resolvePhosphorModel,phosphorDecayFactors} from './phosphor-models.js';

const FULLSCREEN_VS=`#version 300 es
in vec2 aPosition;out vec2 vUv;
void main(){vUv=aPosition*.5+.5;gl_Position=vec4(aPosition,0.,1.);}`;
const DECAY_FS=`#version 300 es
precision highp float;uniform sampler2D uState;uniform vec4 uDecay;in vec2 vUv;out vec4 outColor;
void main(){outColor=texture(uState,vUv)*uDecay;}`;
const BEAM_VS=`#version 300 es
precision highp float;in vec2 aPosition;in float aEnergy;in float aRadius;out float vEnergy;
void main(){gl_Position=vec4(aPosition,0.,1.);gl_PointSize=aRadius;vEnergy=aEnergy;}`;
const BEAM_FS=`#version 300 es
precision highp float;uniform vec4 uWeights;in float vEnergy;out vec4 outColor;
void main(){vec2 p=gl_PointCoord*2.-1.;float r2=dot(p,p);if(r2>1.)discard;float core=exp(-r2*8.5);float halo=.18*exp(-r2*2.15);outColor=uWeights*(core+halo)*vEnergy;}`;
const LINE_VS=`#version 300 es
precision highp float;in vec2 aPosition;in float aEnergy;in float aCross;out float vEnergy;out float vCross;
void main(){gl_Position=vec4(aPosition,0.,1.);vEnergy=aEnergy;vCross=aCross;}`;
const LINE_FS=`#version 300 es
precision highp float;uniform vec4 uWeights;in float vEnergy;in float vCross;out vec4 outColor;
void main(){float r=abs(vCross);if(r>1.)discard;float core=exp(-r*r*7.5);float halo=.16*exp(-r*r*1.8);float edge=1.-smoothstep(.86,1.,r);outColor=uWeights*(core+halo)*edge*vEnergy;}`;
const COMPOSITE_FS=`#version 300 es
precision highp float;uniform sampler2D uState;uniform vec3 uC0;uniform vec3 uC1;uniform vec3 uC2;uniform vec3 uC3;
uniform float uExposure;uniform float uGrain;uniform float uGlass;uniform float uAspect;uniform vec2 uResolution;
in vec2 vUv;out vec4 outColor;
float hash21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float ring(float r,float target,float px){return 1.-smoothstep(px,px*2.,abs(r-target));}
void main(){
  vec4 s=texture(uState,vUv);vec3 light=s.r*uC0+s.g*uC1+s.b*uC2+s.a*uC3;
  vec2 q=vUv-.5;q.x*=uAspect;float r=length(q);float radius=.465;
  if(r>radius){outColor=vec4(0.,0.,0.,1.);return;}
  float grain=(hash21(floor(gl_FragCoord.xy*.5))-.5)*2.;light*=1.+grain*uGrain;
  float edge=clamp(r/radius,0.,1.);light*=1.-uGlass*edge*edge;
  vec3 mapped=1.-exp(-max(light,0.)*uExposure);
  float px=1.15/min(uResolution.x,uResolution.y);
  float grid=.0;grid+=ring(r,radius/3.,px)*.024;grid+=ring(r,radius*2./3.,px)*.021;grid+=ring(r,radius,px)*.10;
  grid+=(1.-smoothstep(px,px*2.,abs(q.x)))*.42;grid+=(1.-smoothstep(px,px*2.,abs(q.y)))*.42;
  for(int i=0;i<24;i++){float a=float(i)*6.28318530718/24.;vec2 d=vec2(cos(a),sin(a));float radial=abs(dot(q,vec2(-d.y,d.x)));float along=dot(q,d);float tick=step(radius-.018-(mod(float(i),6.)==0.?0.012:0.),along)*step(along,radius)* (1.-smoothstep(px,px*2.,radial));grid+=tick*.035;}
  mapped+=vec3(grid);
  float vignette=1.-.22*pow(edge,2.7);mapped*=vignette;
  outColor=vec4(pow(clamp(mapped,0.,1.),vec3(1./2.2)),1.);
}`;

function shader(gl,type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){const info=gl.getShaderInfoLog(s);gl.deleteShader(s);throw new Error(info||'shader compile failed')}return s}
function program(gl,vs,fs){const p=gl.createProgram(),v=shader(gl,gl.VERTEX_SHADER,vs),f=shader(gl,gl.FRAGMENT_SHADER,fs);gl.attachShader(p,v);gl.attachShader(p,f);gl.linkProgram(p);gl.deleteShader(v);gl.deleteShader(f);if(!gl.getProgramParameter(p,gl.LINK_STATUS)){const info=gl.getProgramInfoLog(p);gl.deleteProgram(p);throw new Error(info||'program link failed')}return p}
function texture(gl,w,h,internal,type){const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,internal,w,h,0,gl.RGBA,type,null);return t}
function target(gl,tex){const f=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,f);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,tex,0);return f}
function uniform3(gl,p,name,v){gl.uniform3f(gl.getUniformLocation(p,name),v[0],v[1],v[2])}

export class CRTPhosphorRenderer{
  constructor(canvas,{model='P7'}={}){
    this.canvas=canvas;this.gl=canvas.getContext('webgl2',{alpha:false,antialias:false,desynchronized:true,premultipliedAlpha:false});
    if(!this.gl)throw new Error('WebGL2 unavailable');
    const gl=this.gl;this.model=resolvePhosphorModel(model);this.extFloat=!!gl.getExtension('EXT_color_buffer_float');
    this.decayProgram=program(gl,FULLSCREEN_VS,DECAY_FS);this.beamProgram=program(gl,BEAM_VS,BEAM_FS);this.lineProgram=program(gl,LINE_VS,LINE_FS);this.compositeProgram=program(gl,FULLSCREEN_VS,COMPOSITE_FS);
    this.fullBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.fullBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
    this.beamBuffer=gl.createBuffer();this.lineBuffer=gl.createBuffer();this.lastBeamPoint=null;this.textures=[];this.targets=[];this.front=0;this.width=0;this.height=0;this.resize(2,2);
  }
  setModel(model){this.model=resolvePhosphorModel(model)}
  resize(w,h){
    const gl=this.gl,W=Math.max(2,w|0),H=Math.max(2,h|0);if(W===this.width&&H===this.height)return;this.width=W;this.height=H;
    for(const f of this.targets)gl.deleteFramebuffer(f);for(const t of this.textures)gl.deleteTexture(t);this.targets=[];this.textures=[];
    const internal=this.extFloat?gl.RGBA16F:gl.RGBA8,type=this.extFloat?gl.HALF_FLOAT:gl.UNSIGNED_BYTE;
    for(let i=0;i<2;i++){const t=texture(gl,W,H,internal,type);this.textures.push(t);this.targets.push(target(gl,t));gl.bindFramebuffer(gl.FRAMEBUFFER,this.targets[i]);gl.viewport(0,0,W,H);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT)}this.front=0;this.lastBeamPoint=null;gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  }
  drawFullscreen(p){const gl=this.gl;gl.bindBuffer(gl.ARRAY_BUFFER,this.fullBuffer);const loc=gl.getAttribLocation(p,'aPosition');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);gl.drawArrays(gl.TRIANGLES,0,6)}
  decay(dt,persistenceScale=1){
    const gl=this.gl,next=1-this.front,decay=phosphorDecayFactors(dt,this.model,persistenceScale);gl.bindFramebuffer(gl.FRAMEBUFFER,this.targets[next]);gl.viewport(0,0,this.width,this.height);gl.disable(gl.BLEND);gl.useProgram(this.decayProgram);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.textures[this.front]);gl.uniform1i(gl.getUniformLocation(this.decayProgram,'uState'),0);gl.uniform4f(gl.getUniformLocation(this.decayProgram,'uDecay'),decay[0],decay[1],decay[2],decay[3]);this.drawFullscreen(this.decayProgram);this.front=next;
  }
  deposit(points,dpr=1){
    const gl=this.gl,m=this.model;
    if(!points?.length){this.lastBeamPoint=null;return}
    const sequence=this.lastBeamPoint?[this.lastBeamPoint,...points]:points,lineData=new Float32Array(Math.max(0,(sequence.length-1)*24));let n=0;
    const vertex=(px,py,energy,cross)=>{lineData[n++]=px/this.width*2-1;lineData[n++]=1-py/this.height*2;lineData[n++]=energy;lineData[n++]=cross};
    for(let i=1;i<sequence.length;i++){
      const a=sequence[i-1],b=sequence[i];if(!a||!b)continue;
      const ax=a.x*dpr,ay=a.y*dpr,bx=b.x*dpr,by=b.y*dpr,dx=bx-ax,dy=by-ay,len=Math.hypot(dx,dy);if(len<.05)continue;
      const half=Math.max(.75,(Math.max(1,a.radius)+Math.max(1,b.radius))*.25*dpr),nx=-dy/len*half,ny=dx/len*half,e0=Math.max(0,a.energy),e1=Math.max(0,b.energy);
      if(Math.max(e0,e1)<=.0001)continue;
      vertex(ax-nx,ay-ny,e0,-1);vertex(ax+nx,ay+ny,e0,1);vertex(bx-nx,by-ny,e1,-1);
      vertex(bx-nx,by-ny,e1,-1);vertex(ax+nx,ay+ny,e0,1);vertex(bx+nx,by+ny,e1,1);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER,this.targets[this.front]);gl.viewport(0,0,this.width,this.height);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE);
    if(n){
      gl.useProgram(this.lineProgram);gl.bindBuffer(gl.ARRAY_BUFFER,this.lineBuffer);gl.bufferData(gl.ARRAY_BUFFER,lineData.subarray(0,n),gl.DYNAMIC_DRAW);
      const stride=16,pos=gl.getAttribLocation(this.lineProgram,'aPosition'),energy=gl.getAttribLocation(this.lineProgram,'aEnergy'),cross=gl.getAttribLocation(this.lineProgram,'aCross');
      gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,stride,0);gl.enableVertexAttribArray(energy);gl.vertexAttribPointer(energy,1,gl.FLOAT,false,stride,8);gl.enableVertexAttribArray(cross);gl.vertexAttribPointer(cross,1,gl.FLOAT,false,stride,12);
      gl.uniform4f(gl.getUniformLocation(this.lineProgram,'uWeights'),m.weights[0],m.weights[1],m.weights[2],m.weights[3]);gl.drawArrays(gl.TRIANGLES,0,n/4);
    }
    const head=points[points.length-1];
    if(head?.energy>.0001){
      const data=new Float32Array([head.x/(this.width/dpr)*2-1,1-head.y/(this.height/dpr)*2,head.energy*1.65,Math.max(1,head.radius*dpr*1.18)]);
      gl.useProgram(this.beamProgram);gl.bindBuffer(gl.ARRAY_BUFFER,this.beamBuffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.DYNAMIC_DRAW);
      const stride=16,pos=gl.getAttribLocation(this.beamProgram,'aPosition'),energy=gl.getAttribLocation(this.beamProgram,'aEnergy'),radius=gl.getAttribLocation(this.beamProgram,'aRadius');
      gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,stride,0);gl.enableVertexAttribArray(energy);gl.vertexAttribPointer(energy,1,gl.FLOAT,false,stride,8);gl.enableVertexAttribArray(radius);gl.vertexAttribPointer(radius,1,gl.FLOAT,false,stride,12);
      gl.uniform4f(gl.getUniformLocation(this.beamProgram,'uWeights'),m.weights[0],m.weights[1],m.weights[2],m.weights[3]);gl.drawArrays(gl.POINTS,0,1);
    }
    gl.disable(gl.BLEND);this.lastBeamPoint=points[points.length-1];
  }
  present(){
    const gl=this.gl,m=this.model;gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,this.width,this.height);gl.disable(gl.BLEND);gl.useProgram(this.compositeProgram);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.textures[this.front]);gl.uniform1i(gl.getUniformLocation(this.compositeProgram,'uState'),0);
    uniform3(gl,this.compositeProgram,'uC0',m.colors[0]);uniform3(gl,this.compositeProgram,'uC1',m.colors[1]);uniform3(gl,this.compositeProgram,'uC2',m.colors[2]);uniform3(gl,this.compositeProgram,'uC3',m.colors[3]);gl.uniform1f(gl.getUniformLocation(this.compositeProgram,'uExposure'),m.exposure);gl.uniform1f(gl.getUniformLocation(this.compositeProgram,'uGrain'),m.grain);gl.uniform1f(gl.getUniformLocation(this.compositeProgram,'uGlass'),m.glass);gl.uniform1f(gl.getUniformLocation(this.compositeProgram,'uAspect'),this.width/this.height);gl.uniform2f(gl.getUniformLocation(this.compositeProgram,'uResolution'),this.width,this.height);this.drawFullscreen(this.compositeProgram);
  }
  frame({dt,points,dpr=1,persistenceScale=1}){this.decay(dt,persistenceScale);this.deposit(points,dpr);this.present()}
  clear(){const gl=this.gl;this.lastBeamPoint=null;for(const f of this.targets){gl.bindFramebuffer(gl.FRAMEBUFFER,f);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT)}gl.bindFramebuffer(gl.FRAMEBUFFER,null)}
  destroy(){const gl=this.gl;for(const f of this.targets)gl.deleteFramebuffer(f);for(const t of this.textures)gl.deleteTexture(t);gl.deleteBuffer(this.fullBuffer);gl.deleteBuffer(this.beamBuffer);gl.deleteBuffer(this.lineBuffer);gl.deleteProgram(this.decayProgram);gl.deleteProgram(this.beamProgram);gl.deleteProgram(this.lineProgram);gl.deleteProgram(this.compositeProgram)}
}
