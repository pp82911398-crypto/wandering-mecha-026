// Location scouting photographs, captured directly after the live airport render.
import * as THREE from 'three';
import { setOpen } from '../headlab/head.js';
const V=THREE.Vector3,D=window.__dome,L=window.__lab,DIR=window.__director;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const box=o=>{const b=new THREE.Box3().setFromObject(o);return{min:b.min.toArray(),max:b.max.toArray()};};
const panel=document.createElement('section');panel.id='scout';
panel.style.cssText='position:fixed;right:12px;bottom:12px;z-index:150;width:440px;padding:12px;background:#101b2beb;color:#e4ecf2;font:12px monospace;max-height:48vh;overflow:auto;border:1px solid #647786';
panel.innerHTML='<b>穹顶机场 · 机位勘景</b><p><button id="scout-apply">查看候选机位</button> <button id="scout-run">拍摄候选组</button> <button id="scout-info">场景坐标</button></p><textarea id="scout-data" aria-label="勘景参数" style="width:100%;height:120px;box-sizing:border-box;background:#0b121e;color:#e0e9f1"></textarea><div id="scout-status">就绪</div><pre id="scout-report" style="white-space:pre-wrap;font:10px monospace;max-height:100px;overflow:auto"></pre>';
document.body.append(panel);
const $=id=>document.getElementById(id), status=s=>$('scout-status').textContent=s;
const directorUpdate=DIR.update.bind(DIR),afterFrame=DIR.afterFrame.bind(DIR);
let pose=null,capture=null,busy=false;
function scalar(label,value){for(const row of document.querySelectorAll('#panel label')){if(row.querySelector('span')?.textContent===label){const i=row.querySelector('input');if(i){i.value=value;i.dispatchEvent(new Event('input'));return;}}}}
function actor(point){
  const a=D.player.avatar;a.root.visible=false;if(!point)return null;
  D.player.world.refresh();const p=new V(...point),floor=D.player.world.groundBelow(p,8);
  if(!floor)throw Error('人物位置没有实体地板');p.y=floor.y+.005;
  a.root.position.copy(p);a.root.rotation.y=Math.atan2(-p.x,-p.z);a.root.visible=true;
  a.update(1/60,0,{grounded:true,crouch:false,running:false,vertical:0});
  return p.toArray();
}
function photoSize(){
  if(L.renderer.domElement.width!==1920||L.renderer.domElement.height!==1080){
    L.renderer.setPixelRatio(1);L.renderer.setSize(1920,1080,false);D.post.setPixelRatio(1);D.post.setSize(1920,1080);D.wet.setSize(1920,1080);
  }
}
DIR.update=()=>{
  directorUpdate();if(!pose)return;
  photoSize();L.camera.position.fromArray(pose.p);L.camera.up.set(0,1,0);L.controls.enabled=false;L.controls.target.fromArray(pose.t);
  L.camera.lookAt(L.controls.target);L.camera.fov=pose.fov;L.camera.aspect=16/9;L.camera.updateProjectionMatrix();
};
DIR.afterFrame=()=>{
  afterFrame();if(!capture)return;const {name,resolve,reject}=capture;capture=null;
  L.renderer.domElement.toBlob(async blob=>{
    try{if(!blob)throw Error('画面读取失败');const r=await fetch('http://127.0.0.1:8784/'+name+'.png',{method:'POST',headers:{'Content-Type':'image/png'},body:blob});if(!r.ok)throw Error('截图保存失败');resolve(await r.text());}catch(e){reject(e);}
  },'image/png');
};
async function setup(shot){
  if(D.player.state.active)D.player.exit(true);D.player.avatar.root.visible=false;
  D.visitor.ride.release();D.VW.stopTour();D.VW.state.tween=null;D.VW.state.ride=null;D.modelSync?.stop();
  if(window.__freecam)for(const k of Object.keys(window.__freecam.keys))window.__freecam.keys[k]=0;
  const dyn=localStorage.getItem('mech026.dome.dynamicRes');D.renderQuality.enableDynamic(false);
  if(dyn===null)localStorage.removeItem('mech026.dome.dynamicRes');else localStorage.setItem('mech026.dome.dynamicRes',dyn);
  const paint=document.querySelector('select[aria-label="机甲涂装"]');paint.value='hazard';paint.dispatchEvent(new Event('change'));
  scalar('全身灯光',1);scalar('反应堆转速',.4);
  L.renderer.toneMappingExposure=shot.exposure??1.12;D.post.bloom.strength=.28;D.post.setSamples(4);L.scene.fog.density=shot.fog??.006;
  D.MC.st.thunder=false;D.MC.st.eTarget=0;D.MC.st.thr=false;
  D.env.turntable.state.auto=false;D.env.turntable.state.angle=D.env.turntable.state.target=0;
  const P=D.mech.prop;for(const k of ['deploy','wing','thrust','foot','palm','hover'])P.tgt[k]=0;
  if(shot.setup==='back'){P.tgt.deploy=1;P.tgt.wing=.8;P.tgt.thrust=.22;}
  const close=['core','hero','wide','back','roof'].includes(shot.setup),lift=D.env.lift;
  lift.x=lift.targetX=close?14:0;lift.stop=close?0:3;lift.y=lift.stops[lift.stop].y;lift.ext=close?0:lift.stops[3].ext;lift.phase='idle';lift.holdExt=false;
  D.env.observation.forEach(side=>{side.state.offset=side.state.targetOffset=close?6:0;});
  for(const bridge of D.shoulderBridges.list){bridge.state.open=0;bridge.setOpen(0);bridge.update(0);}
  const opening=['open','inside'].includes(shot.setup)?1:0;
  D.MC.st.canopyT=D.MC.st.canopyTarget=opening;setOpen(D.mech.head,opening);
  D.boarding.state.open=D.boarding.state.target=opening;
  const roofOpen=shot.setup==='roof'?.6:1;D.env.roof.state.open=D.env.roof.state.target=roofOpen;D.env.roof.update(0);
  pose=shot;L.renderer.shadowMap.needsUpdate=true;photoSize();
  await wait(shot.setup==='back'?2600:700);
  if(shot.actor){shot.actorActual=actor(shot.actor);L.renderer.shadowMap.needsUpdate=true;await wait(400);}
}
async function photograph(shot){
  await setup(shot);await wait(350);
  D.player.world.refresh();const feet=new V(...shot.p).add(new V(0,-.25,0)),before=feet.clone();D.player.world.resolve(feet,.25,.5);shot.cameraIntrusion=feet.distanceTo(before);
  return new Promise((resolve,reject)=>{capture={name:shot.id,resolve,reject};});
}
function diagnostics(){
  L.scene.updateMatrixWorld(true);const people=[];
  L.scene.traverse(o=>{if(o.userData.npcFeet)for(const p of o.userData.npcFeet)people.push(new V(p.x,p.y,p.z).applyMatrix4(o.matrixWorld).toArray());});
  const report={head:box(D.mech.head),core:box(D.mech.reactor),prop:box(D.mech.prop.root||D.mech.group),anchors:D.anchors(),people,
    bridge:box(D.boarding.root),entrance:D.boarding.entrance,lift:{F:D.env.lift.F,y:D.env.lift.y,Ls:D.env.lift.Ls,ext:D.env.lift.ext},
    propKeys:Object.keys(D.mech.prop),actorHeight:box(D.player.avatar.root)};
  $('scout-report').textContent=JSON.stringify(report,(k,v)=>v?.isVector3?v.toArray():v);return report;
}
$('scout-apply').onclick=async()=>{try{const a=JSON.parse($('scout-data').value);await setup(Array.isArray(a)?a[0]:a);status('机位已载入');diagnostics();}catch(e){status(e.message);}};
$('scout-run').onclick=async()=>{
  if(busy)return;busy=true;
  try{let a=JSON.parse($('scout-data').value);if(!Array.isArray(a))a=[a];
    const report=[];for(let i=0;i<a.length;i++){status(`拍摄 ${i+1}/${a.length} · ${a[i].id}`);const path=await photograph(a[i]);report.push({...a[i],path});}
    const r=await fetch('http://127.0.0.1:8784/scout-cameras.json',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(report)});if(!r.ok)throw Error('机位记录保存失败');
    status(`完成 ${a.length} 张 · 1920×1080 实景截图`);
  }catch(e){status('勘景错误：'+e.message);}finally{busy=false;}
};
$('scout-info').onclick=diagnostics;
$('scout-data').value=JSON.stringify({id:'scout-initial',setup:'hero',p:[-40,20,75],t:[0,41,0],fov:60});
diagnostics();
