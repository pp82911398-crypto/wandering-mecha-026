// The airport film: medium/wide compositions, independently timed camera, lens and mechanical actions.
// Captures the real WebGL framebuffer at a fixed simulation step; no generated or enlarged imagery.
import * as THREE from 'three';
import { setOpen } from '../headlab/head.js';
const V=THREE.Vector3,D=window.__dome,L=window.__lab;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const FPS=30,URL_ROOT='http://127.0.0.1:8784/';
const SHOTS=[
 {id:'dome-cinema-01',name:'人物与巨物',frames:120,stage:'head',actor:[1.2,76,9.2],p:[[-32,77.5,47],[-28.5,77.2,44],[-25,76.8,41]],t:[[0,68.5,0],[0,69.5,0]],fov:[52,52],pace:[[0,0],[.32,.16],[.78,.81],[1,1]]},
 {id:'dome-cinema-02',name:'系统上线',frames:117,stage:'park',p:[[-32,47,51],[-28,49,50],[-23,52,48]],t:[[0,55,0],[0,56,0]],fov:[58,56],pace:[[0,0],[.25,.4],[.65,.83],[1,1]]},
 {id:'dome-cinema-03',name:'开舱接近',frames:234,stage:'head',actor:[1.2,76,9.2],p:[[-30,76,44],[-26,77,41],[-22,78,36],[-18,79,32]],t:[[0,70.5,1],[0,73,0]],fov:[52,50],pace:[[0,0],[.2,.1],[.55,.64],[.8,.85],[1,1]]},
 {id:'dome-cinema-04',name:'登机通路',frames:75,stage:'open',actor:[1.2,76,9.2],p:[[22,89,43],[20,88,41],[18,87,38]],t:[[0,70,3],[0,71,3]],fov:[62,64],pace:[[0,0],[.5,.65],[1,1]]},
 {id:'dome-cinema-05',name:'穹顶空镜',frames:39,stage:'roof',p:[[-22,94,42],[-20,96,41],[-18,98,39]],t:[[0,153,-10],[0,154,-10]],fov:[80,81],pace:[[0,0],[1,1]]},
 {id:'dome-cinema-06',name:'动力就绪',frames:159,stage:'back',p:[[-46,25,-63],[-43,27,-65],[-39,29,-66],[-36,31,-66]],t:[[0,44,-1],[0,45,-2]],fov:[66,67],pace:[[0,0],[.28,.42],[.55,.56],[.78,.7],[1,1]]},
 {id:'dome-cinema-07',name:'低位全貌',frames:189,stage:'hero',actor:[-14,3,39],p:[[-20,2.2,76],[-20.7,2.4,78],[-28,3.7,75],[-36,5,70]],t:[[0,37,0],[0,39,0]],fov:[68,67],pace:[[0,0],[.2,.12],[.7,.79],[1,1]],dollyZoom:true},
 {id:'dome-cinema-08',name:'回到穹顶',frames:117,stage:'wide',actor:[-14,3,39],p:[[-38,38,70],[-43,46,70],[-48,55,66]],t:[[0,62,-5],[0,71,-6]],fov:[80,89],pace:[[0,0],[.45,.58],[.82,.96],[1,1]]},
];
let busy=false,capturing=false,waiting=false,current=null,index=0,localTime=0,previewU=0,aborted=false,lastUi=-1;
const report=[];
const panel=document.createElement('section');panel.id='filmConsole';
panel.innerHTML='<style>#director,#scout{display:none!important}#filmConsole{position:fixed;bottom:14px;left:14px;z-index:160;width:420px;background:#07111eea;color:#dce6ef;border:1px solid #6f7a87;padding:14px;font:12px/1.6 monospace}#filmConsole button{padding:8px;margin:5px;background:#1b2b3c;color:#ffd08a;border:1px solid #667789}#filmConsole pre{white-space:pre-wrap;max-height:150px;overflow:auto;font:10px monospace}</style><b>穹顶机场 · 8 镜头成片 / 中远景与全景</b><div><button id="film-start">录制全部镜头</button><button id="film-preview">预演当前镜头</button><button id="film-stop">停止</button></div><label>镜头 <select id="film-shot"></select></label><div id="film-status" role="status">就绪 · 1920×1080 / 30fps / 35秒</div><pre id="film-report"></pre>';
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
function head(yaw,pitch){D.mech.neck.set(yaw,pitch);}
function turn(angle){const T=D.env.turntable;T.state.angle=T.state.target=angle;T.rotor.rotation.y=angle*Math.PI/180;}
function stageActor(point){
  const A=D.player.avatar;A.root.visible=false;if(!point)return;
  D.player.world.refresh();const p=new V(...point),floor=D.player.world.groundBelow(p,8);
  if(!floor)throw Error('人物摆位缺少实体地板');p.y=floor.y+.005;
  A.root.position.copy(p);A.root.rotation.y=Math.atan2(-p.x,-p.z);A.root.visible=true;
  A.update(1/FPS,0,{grounded:true,crouch:false,running:false,vertical:0});current.actorActual=p.toArray();
}
function mechanism(s,t,u){
  const P=D.mech.prop;
  if(s.id.endsWith('01')){head(-4*(1-ramp(t,.2,3.6)),0);canopy(0);crewBridge(0);scalar('全身灯光',.85);}
  else if(s.id.endsWith('02')){head(0,0);canopy(0);scalar('反应堆转速',.08+.5*ramp(t,.1,3.3));scalar('全身灯光',.85+.15*ramp(t,.1,2.5));}
  else if(s.id.endsWith('03')){
    head(0,0);canopy(timing([[0,0],[.5,0],[1.5,.12],[3.4,.65],[5.8,1],[7.8,1]],t));
    crewBridge(ramp(t,2.6,4.8));
  }else if(s.id.endsWith('04')){head(0,0);canopy(1);crewBridge(1);}
  else if(s.id.endsWith('05'))roof(.56+.11*t);
  else if(s.id.endsWith('06')){
    P.tgt.deploy=ramp(t,.1,1.8);P.tgt.wing=.8*ramp(t,1.1,2.8);P.tgt.thrust=.28*ramp(t,2.6,3.6);
    roof(.71+.29*ramp(t,0,3.5));
  }else if(s.id.endsWith('07')){turn(6*ramp(t,.6,5.8));P.tgt.deploy=1;P.tgt.wing=.5;P.tgt.thrust=.1;}
  else if(s.id.endsWith('08')){turn(6);P.tgt.deploy=1;P.tgt.wing=.5;P.tgt.thrust=.1;}
  if(!['05','06','07','08'].some(k=>s.id.endsWith(k)))roof(.56);
  if(s.id.endsWith('07')||s.id.endsWith('08'))roof(1);
}
const look=new V();
function pose(s,u){
  const k=timing(s.pace,u);L.camera.position.copy(s.curve.getPointAt(k));
  look.copy(s.aim.getPoint(smooth(u)));L.controls.target.copy(look);L.camera.up.set(0,1,0);L.camera.lookAt(look);
  let fov=THREE.MathUtils.lerp(s.fov[0],s.fov[1],smooth(u));
  if(s.dollyZoom&&u<.2){const distance=L.camera.position.distanceTo(look);fov=2*Math.atan(Math.tan(s.fov[0]*Math.PI/360)*s.d0/distance)*180/Math.PI;}
  if(s.dollyZoom&&u>=.2){const f1=2*Math.atan(Math.tan(s.fov[0]*Math.PI/360)*s.d0/s.d1)*180/Math.PI;fov=THREE.MathUtils.lerp(f1,s.fov[1],smooth((u-.2)/.8));}
  L.camera.fov=fov;L.camera.aspect=16/9;L.camera.updateProjectionMatrix();
}
function clearance(point,radius=.3){
  const p=point.clone().add(new V(0,-radius,0)),q=p.clone();D.player.world.resolve(p,radius,radius*2);return p.distanceTo(q);
}
async function fixture(s){
  if(D.player.state.active)D.player.exit(true);D.visitor.ride.release();D.VW.stopTour();D.VW.state.tween=null;D.VW.state.ride=null;D.modelSync?.stop();
  L.controls.enabled=false;document.exitPointerLock?.();
  if(window.__freecam)for(const k of Object.keys(window.__freecam.keys))window.__freecam.keys[k]=0;
  const saved=localStorage.getItem('mech026.dome.dynamicRes');D.renderQuality.enableDynamic(false);
  if(saved===null)localStorage.removeItem('mech026.dome.dynamicRes');else localStorage.setItem('mech026.dome.dynamicRes',saved);
  const paint=document.querySelector('select[aria-label="机甲涂装"]');paint.value='hazard';paint.dispatchEvent(new Event('change'));
  L.renderer.toneMappingExposure=1.1;L.scene.fog.density=.0065;D.post.bloom.strength=.28;D.post.setSamples(4);
  D.MC.st.thunder=false;D.MC.st.thr=false;D.MC.st.eTarget=0;D.MC.st.thrT=0;
  for(const ctl of [D.mechControls.head,D.mechControls.waist]){ctl.seq=null;for(const c of Object.values(ctl.axes)){c.cur=c.target=c.vel=0;}}
  head(0,0);D.mech.waist.set(0,0,0);
  const P=D.mech.prop;for(const k of ['deploy','wing','thrust','foot','palm','hover']){P.tgt[k]=P[k]=0;}
  if(s.stage==='hero'||s.stage==='wide'){P.deploy=P.tgt.deploy=1;P.wing=P.tgt.wing=.5;P.thrust=P.tgt.thrust=.1;}
  P.update(0);D.env.turntable.state.auto=false;turn(0);
  const parked=['park','roof','back','hero','wide'].includes(s.stage),lift=D.env.lift;
  lift.x=lift.targetX=parked?14:0;lift.stop=parked?0:3;lift.y=lift.stops[lift.stop].y;lift.ext=parked?0:lift.stops[3].ext;lift.phase='idle';lift.holdExt=false;
  D.env.observation.forEach(side=>{side.state.offset=side.state.targetOffset=parked?6:0;});
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
  if(fail.length)throw Error(`${s.name}：${fail.length} 个位置净空不足`);
}
async function post(name,data,type){const r=await fetch(URL_ROOT+name,{method:'POST',headers:{'Content-Type':type},body:data});if(!r.ok)throw Error('本地导出失败 '+r.status);return r.text();}
function serial(s){const {curve,aim,...rest}=s;return rest;}
let shotResolve,shotReject;
async function recordOne(s){
  status('布置 '+s.name);await fixture(s);if(aborted)throw Error('已停止');
  index=0;localTime=0;lastUi=-1;capturing=true;
  return new Promise((resolve,reject)=>{shotResolve=resolve;shotReject=reject;});
}
window.__director={
  get fixedDelta(){return capturing?1/FPS:undefined;},get waitingForFrame(){return waiting;},
  update(){
    if(!current)return;size();const u=capturing?index/Math.max(1,current.frames-1):previewU;
    const t=capturing?index/FPS:u*current.frames/FPS;mechanism(current,t,u);pose(current,u);
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
        if(index-lastUi>=10){status(`录制 ${SHOTS.indexOf(current)+1}/8 · ${current.name} · ${index}/${current.frames}`);lastUi=index;}
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
  try{for(const s of SHOTS){$('film-shot').value=String(SHOTS.indexOf(s));await recordOne(s);}
    await post('dome-cinema-manifest.json',JSON.stringify({fps:FPS,frames:SHOTS.reduce((n,s)=>n+s.frames,0),shots:report,config:SHOTS.map(serial)}),'application/json');
    status('全部 8 镜头完成 · 1050 帧 / 35 秒');$('film-status').dataset.complete='true';
  }catch(e){status('录制中断：'+e.message);$('film-status').dataset.error=e.message;}finally{busy=false;}
};
$('film-shot').onchange=async()=>{if(!busy){try{await fixture(SHOTS[+$('film-shot').value]);status('镜头已就位');}catch(e){status(e.message);}}};
$('film-preview').onclick=async()=>{
  if(busy)return;await fixture(SHOTS[+$('film-shot').value]);const start=performance.now();
  const tick=()=>{if(busy)return;previewU=Math.min(1,(performance.now()-start)/1000/(current.frames/FPS));if(previewU<1)requestAnimationFrame(tick);};tick();
};
$('film-stop').onclick=()=>{aborted=true;capturing=false;shotReject?.(Error('已停止'));status('已停止');};
