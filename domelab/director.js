// Optional filming console: enabled only by ?director=1. All footage is the live WebGL canvas.
import * as THREE from 'three';
const V = THREE.Vector3;
const sleep = ms => new Promise(r => setTimeout(r, ms));
while (!window.__dome || !document.querySelector('#loader.hide')) await sleep(200);
const D = window.__dome, L = window.__lab, { camera, renderer, scene, controls } = L;
const world = D.player.world;
const receiver = 'http://127.0.0.1:8784/';
const panel = document.createElement('section'); panel.id = 'director';
panel.innerHTML = `<style>
#director{position:fixed;left:14px;bottom:14px;z-index:100;width:440px;max-height:48vh;overflow:auto;padding:12px;background:#07101bea;border:1px solid #52616f;color:#dce6ee;font:12px/1.5 monospace;box-sizing:border-box}
#director button,#director select{background:#182735;border:1px solid #6a7881;color:#f6cf89;padding:6px;margin:3px;cursor:pointer}
#director textarea{width:100%;height:64px;background:#101b26;color:#e0e7ee;box-sizing:border-box;font:11px monospace}
#director pre{white-space:pre-wrap;font:10px/1.4 monospace;max-height:160px;overflow:auto}
body.director-clean #c{object-fit:contain}
body.director-clean #panel,body.director-clean #hudL,body.director-clean #sceneNav,body.director-clean #visitorWalkHelp{display:none!important}
body.director-recording #director{opacity:0.02;pointer-events:none}
</style><b>DIRECTOR · 横屏实景录制</b><div>
<select id="director-shot"><option value="full">全貌展示</option><option value="cockpit">接近驾驶舱</option></select>
<button id="director-pose">应用机位</button><button id="director-read">读取机位</button><button id="director-info">场景诊断</button>
<button id="director-setup">布置登机设备</button><button id="director-stage">布置全貌设备</button><button id="director-check">轨迹净空检查</button>
<button id="director-play">预演</button><button id="director-frames">录制当前镜头 · 30fps</button><button id="director-stop">停止</button>
<button id="director-clean">净画面开关</button><button id="director-frame">保存画面</button>
</div><label>镜头位置 / 目标 / 垂直视角 / 时长<textarea id="director-data" aria-label="导演机位参数"></textarea></label>
<label>预览进度 <input id="director-progress" aria-label="镜头预览进度" type="range" min="0" max="1" step="0.01" value="0"></label>
<div id="director-status" role="status">就绪</div><pre id="director-info-text"></pre>`;
document.body.append(panel); document.body.classList.add('director-clean');
const $ = id => document.getElementById(id), status = s => $('director-status').textContent = s;
const defaults = {
  full: { duration: 12, points: [[-46,18,70],[-34,21,78],[-22,24,83],[-10,27,86]], targets:[[0,41,0],[0,41,0]], fov:[62,61] },
  cockpit: { duration: 12, points: [[0,75.5,14.5],[0,76.9,11.3],[0,78.5,7.6],[0,80,4.1]], targets:[[0,78.4,.4],[0,78.7,-.4]], fov:[56,62] },
};
let shot = 'full', config, curve, aim, running = false, started = 0, checkResult = null;
let currentProgress = null;
let capturing=false, waitingForFrame=false, captureIndex=0, captureTotal=0, captureName='', captureCheck=null;
function readConfig() {
  const value = JSON.parse($('director-data').value);
  if (!value.points?.length || !value.targets?.length) throw Error('需要 points 和 targets');
  config = value; curve = new THREE.CatmullRomCurve3(value.points.map(p => new V(...p)), false, 'centripetal');
  aim = value.targets.length === 1 ? null : new THREE.CatmullRomCurve3(value.targets.map(p=>new V(...p)), false, 'centripetal');
  checkResult = null;
}
function lock() {
  if (D.player.state.active) D.player.exit(true);
  D.visitor.ride.release(); D.VW.stopTour(); D.VW.state.tween = null; D.VW.state.ride = null;
  controls.enabled = false; document.exitPointerLock?.();
  if (window.__freecam) { window.__freecam.movementEnabled = false; for (const k of Object.keys(window.__freecam.keys)) window.__freecam.keys[k] = 0; }
  D.modelSync?.stop();
}
function pose(progress) {
  const u = Math.max(0,Math.min(1,progress));
  // Smooth acceleration, a long steady middle, and smooth braking; no reversal or roll.
  const e = u*u*u*(u*(u*6-15)+10);
  camera.position.copy(curve.getPointAt(e));
  const target = aim ? aim.getPoint(e) : new V(...config.targets[0]);
  camera.up.set(0,1,0); camera.lookAt(target); controls.target.copy(target);
  camera.fov = THREE.MathUtils.lerp(config.fov[0],config.fov.at(-1),e);
  camera.aspect = 16/9; camera.updateProjectionMatrix();
  $('director-progress').value = String(u);
}
function select() { shot = $('director-shot').value; $('director-data').value = JSON.stringify(defaults[shot]); readConfig(); lock(); currentProgress=0; pose(0); status('机位已载入'); }
function box(o) { if (!o) return null; const b=new THREE.Box3().setFromObject(o);return {min:b.min.toArray(),max:b.max.toArray()}; }
function info() {
  scene.updateMatrixWorld(true);
  const head = D.mech.head, cp = head.getObjectByName('cockpit');
  const report = { anchors: D.anchors(), headOrigin:head.getWorldPosition(new V()), head:box(head), cockpit:box(cp),
    mech:box(D.mech.group), entrance:D.boarding.entrance, bridge:box(D.boarding.root),
    lift:{x:D.env.lift.x,y:D.env.lift.y,ext:D.env.lift.ext,F:D.env.lift.F,TZ:D.env.lift.TZ,stops:D.env.lift.stops},
    dome:{RW:D.env.RW,HW:D.env.HW,CZ:D.env.CZ}, viewport:[innerWidth,innerHeight],canvas:[renderer.domElement.width,renderer.domElement.height],
    recorderTypes:['video/mp4;codecs=avc1.42001f','video/mp4','video/webm;codecs=vp9','video/webm;codecs=vp8'].filter(m=>window.MediaRecorder?.isTypeSupported(m)),
    pose:{p:camera.position.toArray(),t:controls.target.toArray(),fov:camera.fov} };
  $('director-info-text').textContent=JSON.stringify(report,(k,v)=>v?.isVector3?v.toArray():v,2); return report;
}
async function check() {
  lock(); readConfig(); status('检查镜头球体与所有实体的净空…'); await sleep(30);
  world.refresh(); const count=Math.max(120,Math.ceil(curve.getLength()/.18)), collisions=[];
  for(let i=0;i<=count;i++) {
    const p=curve.getPointAt(i/count), feet=p.clone().add(new V(0,-.32,0)), before=feet.clone();
    world.resolve(feet,.32,.64);
    if(feet.distanceTo(before)>.003) collisions.push({u:i/count,p:p.toArray(),push:feet.distanceTo(before)});
  }
  checkResult={samples:count+1,radius:.32,collisions:collisions.length,examples:collisions.slice(0,12),length:curve.getLength()};
  $('director-info-text').textContent=JSON.stringify(checkResult,null,2);
  status(collisions.length?`轨迹有 ${collisions.length} 处净空不足，录制被阻止`:`净空检查通过 · ${count+1} 个位置 · 0.32 m 镜头半径`);
  return checkResult;
}
async function upload(name,data,type) { const r=await fetch(receiver+name,{method:'POST',headers:{'Content-Type':type},body:data});if(!r.ok)throw Error('本地保存失败 '+r.status);return r.text(); }
function stop(){
  running=false;capturing=false;currentProgress=Number($('director-progress').value);
  document.body.classList.remove('director-recording');window.__freecam?.sync();status('镜头已停止');
}
window.__director={
  get waitingForFrame(){return waitingForFrame;},
  get fixedDelta(){return capturing?1/30:undefined;},
  update(){
    if(capturing){if(renderer.domElement.width!==1920||renderer.domElement.height!==1080){renderer.setPixelRatio(1);renderer.setSize(1920,1080,false);D.post.setSize(1920,1080);D.wet.setSize(1920,1080);}pose(captureIndex/Math.max(1,captureTotal-1));}
    else if(running){const u=(performance.now()-started)/1000/config.duration;pose(u);if(u>=1){running=false;currentProgress=1;status('预演完成');}}
    else if(currentProgress!==null)pose(currentProgress);
  },
  afterFrame(){
    if(capturing && !waitingForFrame){
      waitingForFrame=true;
      renderer.domElement.toBlob(async blob=>{
        try{
          if(!blob)throw Error('画布采集失败');
          await upload(captureName+'-'+String(captureIndex).padStart(4,'0')+'.jpg',blob,'image/jpeg');
          captureIndex++;status(`逐帧采集 ${shot} · ${captureIndex}/${captureTotal}`);
          if(captureIndex>=captureTotal){
            capturing=false;currentProgress=1;
            status('画面采集完成，正在编码 MP4…');
            const path=await upload(captureName+'.json',JSON.stringify({shot,config,check:captureCheck,frames:captureTotal,fps:30,canvas:[1920,1080],method:'live WebGL canvas frame capture'}),'application/json');
            status('镜头已保存：'+path);$('director-status').dataset.output=path;document.body.classList.remove('director-recording');
          }
        }catch(e){capturing=false;status('采集错误：'+e.message);document.body.classList.remove('director-recording');}
        waitingForFrame=false;
      },'image/jpeg',.97);
    }
  },
  defaults,info,check,select,
};
$('director-shot').onchange=select;
$('director-pose').onclick=()=>{try{readConfig();lock();currentProgress=0;pose(0);status('机位已应用');}catch(e){status(e.message);}};
$('director-read').onclick=()=>{currentProgress=null;info();};
$('director-info').onclick=info;
$('director-check').onclick=()=>check().catch(e=>status(e.message));
$('director-play').onclick=()=>{readConfig();lock();currentProgress=null;started=performance.now();running=true;status('轨迹预演中');};
$('director-frames').onclick=async()=>{
  try{
    if(capturing||waitingForFrame)return;captureCheck=await check();if(captureCheck.collisions)return;
    lock();const oldDyn=localStorage.getItem('mech026.dome.dynamicRes');D.renderQuality.enableDynamic(false);
    if(oldDyn===null)localStorage.removeItem('mech026.dome.dynamicRes');else localStorage.setItem('mech026.dome.dynamicRes',oldDyn);
    renderer.setPixelRatio(1);renderer.setSize(1920,1080,false);D.post.setPixelRatio(1);D.post.setSize(1920,1080);D.wet.setSize(1920,1080);
    pose(0);currentProgress=0;await sleep(1000);
    captureIndex=0;captureTotal=Math.round(config.duration*30);captureName=shot+'-frames-'+Date.now();running=false;capturing=true;currentProgress=null;
    document.body.classList.add('director-recording');status('逐帧采集开始');
  }catch(e){status(e.message);}
};
$('director-stop').onclick=stop;
$('director-clean').onclick=()=>document.body.classList.toggle('director-clean');
$('director-progress').oninput=()=>{running=false;lock();currentProgress=Number($('director-progress').value);pose(currentProgress);};
$('director-frame').onclick=()=>{renderer.domElement.toBlob(async blob=>{if(blob)status(await upload('scout-'+Date.now()+'.png',blob,'image/png'));});};
$('director-setup').onclick=()=>{
  const lift=D.env.lift;D.env.turntable.state.auto=false;lift.x=lift.targetX=0;lift.y=lift.stops[3].y;lift.ext=lift.stops[3].ext;lift.stop=3;lift.phase='idle';
  D.MC.canopy(1);D.boarding.setOpen(1);status('驾驶舱层就位；等待舱盖和登机桥展开');
};
$('director-stage').onclick=()=>{
  const lift=D.env.lift;D.boarding.setOpen(0);D.MC.canopy(0);
  lift.x=lift.targetX=lift.maxX;lift.y=lift.stops[0].y;lift.ext=0;lift.stop=0;lift.phase='idle';
  D.env.observation.forEach(side=>{side.state.offset=side.state.targetOffset=6;});
  for(const bridge of D.shoulderBridges.list)bridge.setOpen(0);
  const paint=document.querySelector('select[aria-label="机甲涂装"]');paint.value='hazard';paint.dispatchEvent(new Event('change'));
  renderer.toneMappingExposure=1.18;D.env.turntable.state.auto=false;status('全貌摄影布置就位：主塔右移14m，侧塔外移6m，工程黄');
};
select();info();
if (new URLSearchParams(location.search).has('scout')) import('./scout.js?v=20261023a');
if (new URLSearchParams(location.search).has('film')) import('./film.js?v=20261023a');

if (new URLSearchParams(location.search).has('extra')) import('./film-extra.js?v=20261024i');

if (new URLSearchParams(location.search).has('r3')) import('./film-r3.js?v=20261024c');
