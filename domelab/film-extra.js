// The airport film: medium/wide compositions, independently timed camera, lens and mechanical actions.
// Captures the real WebGL framebuffer at a fixed simulation step; no generated or enlarged imagery.
import * as THREE from 'three';
import { setOpen } from '../headlab/head.js';
import { Particles } from '../src/fx.js?v=dome-perf-20261023e';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
const V=THREE.Vector3,D=window.__dome,L=window.__lab;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const FPS=30,URL_ROOT='http://127.0.0.1:8784/';
const SHOTS=[
 {id:'d24-09',name:'下移迎视与肩舱联动',frames:180,stage:'park',scheme:'hazard',p:[[0,105,71],[0,80,68],[0,65,59],[0,65,48]],t:[[0,76,0],[0,68,0],[0,64,0]],fov:[70,56],pace:[[0,0],[.3,.48],[.53,.66],[.78,.78],[1,1]],flash:[3.15],focus:true,blur:'vertical'},
 {id:'d24-10',name:'观察台横移与检修火花',frames:150,stage:'maintenance',scheme:'hazard',p:[[-60,72,47],[-49,68,49],[-36,65,52],[-28,65,51]],t:[[-13,65,0],[-5,62,0]],fov:[70,62],pace:[[0,0],[.22,.44],[.65,.75],[1,1]],blur:'horizontal',weld:true},
 {id:'d24-11',name:'利刃炮臂展开与正面弧绕',frames:180,stage:'park',scheme:'snow',p:[[-44,50,62],[-24,50,68],[0,55,71],[10,58,72]],t:[[0,48,0],[0,50,0]],fov:[70,68],pace:[[0,0],[.38,.13],[.66,.78],[1,1]],blur:'horizontal',flash:[4.25]},
 {id:'d24-12',name:'空间压缩与推拉变焦',frames:150,stage:'park',scheme:'night',p:[[0,39,75],[0,39,65],[0,39,52],[0,39,45]],t:[[0,41,0],[0,41,0]],fov:[66,66],pace:[[0,0],[.22,.11],[.56,.75],[1,1]],dollyFull:true,focus:true,flash:[1.2]},
 {id:'d24-13',name:'旋转后拉揭示穹顶',frames:150,stage:'park',scheme:'hazard',p:[[-26,61,48],[-42,68,54],[-55,78,54],[-65,86,48]],t:[[0,51,0],[0,72,-6]],fov:[58,82],roll:[9,0],pace:[[0,0],[.3,.18],[.66,.83],[1,1]],blur:'radial'},
 ...['hazard','navy','snow','night'].map((scheme,i)=>({id:'d24-'+(14+i),name:'同轨涂装·'+['工程黄','海军灰','雪原白','炭黑'][i],frames:90,stage:'park',scheme,p:[[-24,34,68],[-12,32,70],[2,30,71]],t:[[0,41,0],[0,41,0]],fov:[70,68],pace:[[0,0],[.25,.18],[.8,.9],[1,1]],match:true})),
 {id:'d24-18',name:'头部追镜与掠升',frames:150,stage:'park',scheme:'navy',p:[[22,59,68],[12,65,60],[-15,74,56],[-24,81,54]],t:[[0,60,0],[0,68,0]],fov:[68,58],pace:[[0,0],[.2,.12],[.55,.71],[.85,.92],[1,1]],focus:true,blur:'horizontal'},
 {id:'d24-19',name:'背推动力与时间变速',frames:150,stage:'park',scheme:'snow',p:[[46,22,-57],[44,30,-59],[34,35,-64],[12,40,-70]],t:[[0,44,-2],[0,45,-2]],fov:[72,68],pace:[[0,0],[.22,.46],[.65,.58],[.82,.76],[1,1]],blur:'radial',flash:[2.35]},
 {id:'d24-20',name:'地面待命·正面无遮挡修正',frames:180,stage:'park',scheme:'hazard',groundRepair:true,clearSubject:true,p:[[0,39,75],[0,39,71],[0,39,67],[0,39,63]],t:[[0,41,0],[0,42,0]],fov:[72,70],pace:[[0,0],[.23,.12],[.63,.8],[1,1]],flash:[4.5]}
];
let busy=false,capturing=false,waiting=false,current=null,index=0,localTime=0,previewU=0,aborted=false,lastUi=-1;
const report=[];
const panel=document.createElement('section');panel.id='filmConsole';
panel.innerHTML='<style>#director,#scout{display:none!important}#filmConsole{position:fixed;bottom:14px;left:14px;z-index:160;width:420px;background:#07111eea;color:#dce6ef;border:1px solid #6f7a87;padding:14px;font:12px/1.6 monospace}#filmConsole button{padding:8px;margin:5px;background:#1b2b3c;color:#ffd08a;border:1px solid #667789}#filmConsole pre{white-space:pre-wrap;max-height:150px;overflow:auto;font:10px monospace}</style><b>穹顶机场 · 新增 12 镜头 / 关键帧摄影</b><div><button id="film-start">录制全部镜头</button><button id="film-one">只录当前镜头</button><button id="film-preview">预演当前镜头</button><button id="film-stop">停止</button></div><label>镜头 <select id="film-shot"></select></label><div id="film-status" role="status">就绪 · 12 镜头 / 1080p30 / 含检修与闪电</div><pre id="film-report"></pre>';
document.body.append(panel);
const $=id=>document.getElementById(id),status=s=>$('film-status').textContent=s;
SHOTS.forEach((s,i)=>$('film-shot').add(new Option(`${i+1} · ${s.name}`,i)));
function smooth(x){x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);}
function ramp(t,a,b){return smooth((t-a)/(b-a));}
// Monotone cubic interpolation: variable velocity with continuous tangents, no reverse motion.
function timing(keys,x){
  if(x<=keys[0][0])return keys[0][1];if(x>=keys.at(-1)[0])return keys.at(-1)[1];
  const slopes=keys.slice(1).map((k,i)=>(k[1]-keys[i][1])/(k[0]-keys[i][0]));
  const m=keys.map((k,i)=>i===0?slopes[0]:i===keys.length-1?0:slopes[i-1]*slopes[i]<=0?0:2/(1/slopes[i-1]+1/slopes[i]));
  let i=0;while(x>keys[i+1][0])i++;
  const h=keys[i+1][0]-keys[i][0],u=(x-keys[i][0])/h;
  return (2*u**3-3*u*u+1)*keys[i][1]+(u**3-2*u*u+u)*h*m[i]+(-2*u**3+3*u*u)*keys[i+1][1]+(u**3-u*u)*h*m[i+1];
}
function scalar(label,value){
  for(const row of document.querySelectorAll('#panel label'))if(row.querySelector('span')?.textContent===label){
    const input=row.querySelector('input');if(input){input.value=value;input.dispatchEvent(new Event('input'));return;}
  }
}
function size(){
  if(L.renderer.domElement.width!==1920||L.renderer.domElement.height!==1080){
    L.renderer.setPixelRatio(1);L.renderer.setSize(1920,1080,false);D.post.setPixelRatio(1);D.post.setSize(1920,1080);D.wet.setSize(1920,1080);
  }
}
function canopy(value){D.MC.st.canopyT=D.MC.st.canopyTarget=value;setOpen(D.mech.head,value);}
function crewBridge(value){D.boarding.state.open=D.boarding.state.target=value;D.boarding.update(0);}
function roof(value){D.env.roof.state.open=D.env.roof.state.target=value;D.env.roof.update(0);}
function head(yaw,pitch){const a=Math.abs(yaw);pitch=Math.max(-(a>30?4:a>25?6:9),Math.min(a>10?12:20,pitch));if(Math.abs(lastHead[0]-yaw)<.001&&Math.abs(lastHead[1]-pitch)<.001)return;D.mech.neck.set(yaw,pitch);lastHead=[yaw,pitch];}
function turn(angle){const T=D.env.turntable;T.state.angle=T.state.target=angle;T.rotor.rotation.y=angle*Math.PI/180;}
function stageActor(point){
  const A=D.player.avatar;A.root.visible=false;if(!point)return;
  D.player.world.refresh();const p=new V(...point),floor=D.player.world.groundBelow(p,8);
  if(!floor)throw Error('人物摆位缺少实体地板');p.y=floor.y+.005;
  A.root.position.copy(p);A.root.rotation.y=Math.atan2(-p.x,-p.z);A.root.visible=true;
  A.update(1/FPS,0,{grounded:true,crouch:false,running:false,vertical:0});current.actorActual=p.toArray();
}
function mechanism(s,t,u){
 const id=Number(s.id.slice(-2)),P=D.mech.prop;
 canopy(0);crewBridge(0);roof(id===9?.7+.3*ramp(t,0,3):1);
 if(id===9){head(0,12-19*ramp(t,.45,3.8));for(const a of Object.values(D.mech.arms.arms))a.setMissiles?.(ramp(t,2,3.7));}
 else if(id===10){head(-14+8*ramp(t,1,4),-3);const q=6*ramp(t,.2,4.5);D.env.observation[0].state.offset=D.env.observation[0].state.targetOffset=q;D.env.observation[0].update(0);D.env.observation[0].crawler.update(-q);const lift=D.env.lift;lift.targetX=20;lift.phase=t<4.8?'drive':'idle';}
 else if(id===11){head(-20-12*ramp(t,.2,4),2);D.mech.waist.set(-5*ramp(t,.4,4),0,0);D.mech.arms.arms.leftFront.deploy(ramp(t,.15,1.4));D.mech.arms.arms.right.deploy(ramp(t,.4,1.6));}
 else if(id===12)head(-5+10*ramp(t,.8,4),-2);
 else if(id===13)head(-12,4*ramp(t,0,4));
 else if(s.match){head(-8+14*ramp(t,.1,2.8),-2);scalar('反应堆转速',.3+.5*ramp(t,.2,2.7));}
 else if(id===18){const k=timing(s.pace,u),p=s.curve.getPointAt(k);head(Math.max(-35,Math.min(35,Math.atan2(p.x,p.z)*180/Math.PI)),-8+12*ramp(t,.5,4.7));}
 else if(id===19){P.tgt.deploy=ramp(t,0,1.6);P.tgt.wing=.8*ramp(t,.7,2.3);P.tgt.thrust=.4*ramp(t,2.1,3.4);}
 else if(id===20){P.hover=P.tgt.hover=0;turn(0);head(-15*(1-ramp(t,.4,4.5)),2);P.tgt.deploy=1;P.tgt.wing=.5;P.tgt.thrust=.12;P.update(0);}
}

const bokeh=new BokehPass(L.scene,L.camera,{focus:65,aperture:.00010,maxblur:.006});
bokeh.enabled=false;D.post.composer.insertPass(bokeh,1);
const motion=new ShaderPass({uniforms:{tDiffuse:{value:null},amount:{value:0},direction:{value:new THREE.Vector2(1,0)},radial:{value:0}},
vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
fragmentShader:'uniform sampler2D tDiffuse;uniform float amount;uniform vec2 direction;uniform float radial;varying vec2 vUv;void main(){vec2 d=mix(direction,(vUv-.5)*2.,radial)*amount;vec4 c=vec4(0.);float w=0.;for(int i=-4;i<=4;i++){float f=float(i)/4.;float k=1.-abs(f)*.65;c+=texture2D(tDiffuse,clamp(vUv+d*f,vec2(.001),vec2(.999)))*k;w+=k;}gl_FragColor=c/w;}'});
D.post.composer.addPass(motion);
const welding=new Particles(L.scene,1800,{color:0xffad4a,gravity:-13,drag:.7});welding.points.layers.set(1);
const weldLamp=new THREE.PointLight(0xb7dcff,0,10,1.2);L.scene.add(weldLamp);
const weldTip=new THREE.Mesh(new THREE.SphereGeometry(.11,8,6),new THREE.MeshBasicMaterial({color:0xd9efff}));weldTip.userData.noCollision=true;L.scene.add(weldTip);
const stormLamp=new THREE.PointLight(0xa8caff,0,330,1.2);stormLamp.position.set(18,137,23);L.scene.add(stormLamp);
let lastFrameTime=-1,lastHead=[NaN,NaN];
function lightning(s,t){
 D.env.nextFlash=1000;D.env.flashT=2;let f=0;
 for(const at of s.flash||[]){const d=t-at;if(d>=0&&d<1.2)f+=Math.exp(-d*22)+(d>.19?Math.exp(-(d-.19)*13)*.7:0);}
 f=Math.min(1.2,f);D.env.flash=f;D.env.sky.uniforms.uFlash.value=f;D.env.sky.uniforms.uFlashPos.value.set(.22,-.35);D.env.lights.moon.intensity=1.25+f*5;stormLamp.intensity=f*9500;
}
function effects(s,t,u){
 lightning(s,t);const isNew=t!==lastFrameTime,dt=isNew?Math.max(0,Math.min(.1,t-lastFrameTime)):0;lastFrameTime=t;
 if(s.weld){
  const a=D.J.anchors.armLHook.getWorldPosition(new V()).add(new V(-.8,-4.5,3.3));
  weldLamp.position.copy(a);weldTip.position.copy(a);
  const pulse=t>.45&&t<4.35&&(Math.sin(t*15)+Math.sin(t*29))>-.1;
  weldLamp.intensity=pulse?240:0;weldTip.visible=pulse;
  if(isNew&&pulse)welding.emit(a,new V(-.25,-.7,.65),18,7,.9,.8,.34);
  if(isNew)welding.update(dt);
 }else{weldLamp.intensity=0;weldTip.visible=false;if(isNew)welding.update(dt);}
 bokeh.enabled=!!s.focus;
 if(bokeh.enabled){const target=s.id==='d24-18'?new V(0,77,0):new V(0,55,0);bokeh.uniforms.focus.value=L.camera.position.distanceTo(target);bokeh.uniforms.aperture.value=s.id==='d24-12'?.00012:.00006;bokeh.uniforms.maxblur.value=.005;}
 const du=.012,k0=timing(s.pace,Math.max(0,u-du)),k1=timing(s.pace,Math.min(1,u+du));
 const speed=(k1-k0)/(Math.min(1,u+du)-Math.max(0,u-du));
 motion.uniforms.amount.value=s.blur?Math.min(.010,Math.max(0,speed-1.2)*.0045):0;
 motion.uniforms.direction.value.set(s.blur==='vertical'?0:1,s.blur==='vertical'?1:0);motion.uniforms.radial.value=s.blur==='radial'?1:0;
 motion.enabled=motion.uniforms.amount.value>.0001;
}

const look=new V();
function pose(s,u){
  const k=timing(s.pace,u);L.camera.position.copy(s.curve.getPointAt(k));
  look.copy(s.aim.getPoint(smooth(u)));L.controls.target.copy(look);L.camera.up.set(0,1,0);L.camera.lookAt(look);
  let fov=THREE.MathUtils.lerp(s.fov[0],s.fov[1],smooth(u));
  if(s.dollyZoom&&u<.2){const distance=L.camera.position.distanceTo(look);fov=2*Math.atan(Math.tan(s.fov[0]*Math.PI/360)*s.d0/distance)*180/Math.PI;}
  if(s.dollyZoom&&u>=.2){const f1=2*Math.atan(Math.tan(s.fov[0]*Math.PI/360)*s.d0/s.d1)*180/Math.PI;fov=THREE.MathUtils.lerp(f1,s.fov[1],smooth((u-.2)/.8));}
  if(s.dollyFull)fov=2*Math.atan(Math.tan(s.fov[0]*Math.PI/360)*s.d0/L.camera.position.distanceTo(look))*180/Math.PI;
  if(s.roll)L.camera.rotateZ(THREE.MathUtils.lerp(...s.roll,smooth(u))*Math.PI/180);
  L.camera.fov=fov;L.camera.aspect=16/9;L.camera.updateProjectionMatrix();
}
function clearance(point,radius=.3){
  const p=point.clone().add(new V(0,-radius,0)),q=p.clone();D.player.world.resolve(p,radius,radius*2);return p.distanceTo(q);
}
const subjectRay=new THREE.Raycaster();
const subjectMarks=[[0,78,4],[0,62,9],[0,44,5],[-13,69,3],[13,69,3]];
function blockedSubject(point){
  const towers=[D.env.lift.root,...D.env.observation.map(s=>s.root)],blocked=[],surfaces=[];
  for(const root of towers)root.traverse(o=>{if(!o.isMesh)return;for(let a=o;a;a=a.parent)if(!a.visible)return;
    if([].concat(o.material).every(m=>m.transparent&&(m.opacity<.3||m.depthWrite===false)))return;surfaces.push(o);
  });
  for(const mark of subjectMarks){const target=new V(...mark),dir=target.clone().sub(point);subjectRay.set(point,dir.clone().normalize());subjectRay.far=dir.length()-.4;
    const hits=subjectRay.intersectObjects(surfaces,false);
    if(hits.length)blocked.push({mark,distance:hits[0].distance,object:hits[0].object.name});
  }return blocked;
}
async function fixture(s){
  if(D.player.state.active)D.player.exit(true);D.visitor.ride.release();D.VW.stopTour();D.VW.state.tween=null;D.VW.state.ride=null;D.modelSync?.stop();
  L.controls.enabled=false;document.exitPointerLock?.();
  if(window.__freecam)for(const k of Object.keys(window.__freecam.keys))window.__freecam.keys[k]=0;
  const saved=localStorage.getItem('mech026.dome.dynamicRes');D.renderQuality.enableDynamic(false);
  if(saved===null)localStorage.removeItem('mech026.dome.dynamicRes');else localStorage.setItem('mech026.dome.dynamicRes',saved);
  const paint=document.querySelector('select[aria-label="机甲涂装"]');paint.value=s.scheme||'hazard';paint.dispatchEvent(new Event('change'));
  L.renderer.toneMappingExposure=s.scheme==='night'?1.32:s.scheme==='navy'?1.17:1.1;L.scene.fog.density=.0065;D.post.bloom.strength=.28;D.post.setSamples(4);
  D.MC.st.deploy=0;D.MC.st._appliedDeploy=0;D.MC.st.sawSpeed=0;for(const a of Object.values(D.mech.arms.arms)){a.deploy(0);a.setMissiles?.(0);}D.MC.st.thunder=false;D.MC.st.thr=false;D.MC.st.eTarget=0;D.MC.st.thrT=0;
  for(const ctl of [D.mechControls.head,D.mechControls.waist]){ctl.seq=null;for(const c of Object.values(ctl.axes)){c.cur=c.target=c.vel=0;}}
  lastHead=[NaN,NaN];lastFrameTime=-1;welding.life.fill(0);welding.update(0);head(0,0);D.mech.waist.set(0,0,0);
  const P=D.mech.prop;for(const k of ['deploy','wing','thrust','foot','palm','hover']){P.tgt[k]=P[k]=0;}
  if(s.id==='d24-20'){P.deploy=P.tgt.deploy=1;P.wing=P.tgt.wing=.5;P.thrust=P.tgt.thrust=.1;}
  P.update(0);D.env.turntable.state.auto=false;turn(0);
  const parked=true,lift=D.env.lift;
  lift.x=lift.targetX=s.stage==='maintenance'?9:20;lift.stop=parked?0:3;lift.y=lift.stops[lift.stop].y;lift.ext=parked?0:lift.stops[3].ext;lift.phase='idle';lift.holdExt=false;
  D.env.observation.forEach(side=>{side.state.offset=side.state.targetOffset=s.stage==='maintenance'&&side.side<0?0:6;side.update(0);});
  for(const bridge of D.shoulderBridges.list){bridge.state.open=0;bridge.setOpen(0);bridge.update(0);}
  scalar('全身灯光',1);scalar('反应堆转速',.4);canopy(s.stage==='open'?1:0);crewBridge(s.stage==='open'?1:0);
  s.curve=new THREE.CatmullRomCurve3(s.p.map(p=>new V(...p)),false,'centripetal');
  s.aim=new THREE.CatmullRomCurve3(s.t.map(p=>new V(...p)),false,'centripetal');
  s.d0=new V(...s.p[0]).distanceTo(new V(...s.t[0]));s.d1=s.curve.getPointAt(timing(s.pace,.2)).distanceTo(s.aim.getPoint(smooth(.2)));
  current=s;previewU=0;index=0;localTime=0;mechanism(s,0,0);pose(s,0);size();L.renderer.shadowMap.needsUpdate=true;
  await sleep(1300);stageActor(s.actor);await sleep(300);
  D.player.world.refresh();const samples=Math.max(120,Math.ceil(s.curve.getLength()/.16)),fail=[];
  for(let n=0;n<=samples;n++){const p=s.curve.getPointAt(n/samples),push=clearance(p);if(push>.004)fail.push({u:n/samples,p:p.toArray(),push});}
  s.check={samples:samples+1,radius:.3,collisions:fail.length,length:s.curve.getLength(),examples:fail.slice(0,4)};
  if(fail.length){$('film-report').textContent=JSON.stringify(s.check,null,2);throw Error(`${s.name}：${fail.length} 个位置净空不足`);}
  if(s.clearSubject){const blocked=[];for(let n=0;n<=samples;n++){const hits=blockedSubject(s.curve.getPointAt(n/samples));if(hits.length)blocked.push({u:n/samples,hits});}
    s.check.subjectSightlines={samples:samples+1,landmarks:subjectMarks.length,obstructed:blocked.length,examples:blocked.slice(0,3)};
    if(blocked.length){$('film-report').textContent=JSON.stringify(s.check,null,2);throw Error(`正面主体仍有 ${blocked.length} 处塔架遮挡`);}
  }
}
async function post(name,data,type){const r=await fetch(URL_ROOT+name,{method:'POST',headers:{'Content-Type':type},body:data});if(!r.ok)throw Error('本地导出失败 '+r.status);return r.text();}
function serial(s){const {curve,aim,...rest}=s;return rest;}
let shotResolve,shotReject;
async function recordOne(s){
  if(s.id==='d24-20'&&!s.groundRepair)throw Error('悬空动作等待修正后补录');
  status('布置 '+s.name);await fixture(s);if(aborted)throw Error('已停止');
  index=0;localTime=0;lastUi=-1;capturing=true;
  return new Promise((resolve,reject)=>{shotResolve=resolve;shotReject=reject;});
}
window.__director={
  get fixedDelta(){return capturing?1/FPS:undefined;},get waitingForFrame(){return waiting;},
  update(){
    if(!current)return;size();const u=capturing?index/Math.max(1,current.frames-1):previewU;
    const t=capturing?index/FPS:u*current.frames/FPS;mechanism(current,t,u);pose(current,u);effects(current,t,u);
    if(capturing&&index%3===0)L.renderer.shadowMap.needsUpdate=true;
  },
  afterFrame(){
    if(!capturing||waiting)return;
    waiting=true;
    if(index%3===0){D.player.world.refresh();const push=clearance(L.camera.position);if(push>.004){capturing=false;waiting=false;shotReject(Error(`${current.name} 第${index}帧镜头净空不足 ${push.toFixed(3)}m`));return;}}
    L.renderer.domElement.toBlob(async blob=>{
      try{
        if(aborted)throw Error('已停止');if(!blob)throw Error('画布读取失败');
        await post(current.id+'-'+String(index).padStart(4,'0')+'.jpg',blob,'image/jpeg');index++;
        if(index-lastUi>=10){status(`录制 ${SHOTS.indexOf(current)+1}/12 · ${current.name} · ${index}/${current.frames}`);lastUi=index;}
        if(index>=current.frames){
          capturing=false;previewU=1;status('编码 '+current.name);
          const info={...serial(current),fps:FPS,canvas:[1920,1080],method:'live WebGL canvas frame capture'};
          const path=await post(current.id+'.json',JSON.stringify(info),'application/json');report.push({id:current.id,name:current.name,frames:current.frames,path,check:current.check});
          $('film-report').textContent=JSON.stringify(report,null,2);shotResolve(path);
        }
      }catch(e){capturing=false;shotReject?.(e);status(e.message);}finally{waiting=false;}
    },'image/jpeg',.96);
  },
};
$('film-start').onclick=async()=>{
  if(busy)return;busy=true;aborted=false;
  try{for(const s of SHOTS.slice(+$('film-shot').value).filter(s=>s.id!=='d24-20')){$('film-shot').value=String(SHOTS.indexOf(s));await recordOne(s);}
    await post('d24-extra-manifest.json',JSON.stringify({fps:FPS,frames:SHOTS.reduce((n,s)=>n+s.frames,0),shots:report,config:SHOTS.map(serial)}),'application/json');
    status('本批次完成 · 悬空动作暂缓，保留地面收尾');$('film-status').dataset.complete='true';
  }catch(e){status('录制中断：'+e.message);$('film-status').dataset.error=e.message;}finally{busy=false;}
};
$('film-shot').onchange=async()=>{if(!busy){try{await fixture(SHOTS[+$('film-shot').value]);status('镜头已就位');}catch(e){status(e.message);}}};
$('film-preview').onclick=async()=>{
  if(busy)return;await fixture(SHOTS[+$('film-shot').value]);const start=performance.now();
  const tick=()=>{if(busy)return;previewU=Math.min(1,(performance.now()-start)/1000/(current.frames/FPS));if(previewU<1)requestAnimationFrame(tick);};tick();
};
$('film-stop').onclick=()=>{aborted=true;capturing=false;shotReject?.(Error('已停止'));status('已停止');};

$('film-one').onclick=async()=>{if(busy)return;busy=true;aborted=false;try{await recordOne(SHOTS[+$('film-shot').value]);status('当前镜头完成');}catch(e){status(e.message);}finally{busy=false;}};
