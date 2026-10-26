// Opt-in CPU benchmark and collision cache checks: ?verify=performance.
import * as THREE from 'three';
import { CollisionWorld } from './collision.js?v=dome-perf-20261023ab';
const panel = document.createElement('pre'); panel.id = 'perfCheck';
panel.style.cssText = 'position:fixed;bottom:8px;left:8px;z-index:100;background:#10202f;color:white;padding:12px';
document.body.append(panel);
const next = () => new Promise(resolve => requestAnimationFrame(resolve));
while (!window.__dome || !document.querySelector('#loader.hide')) await next();
const { player } = window.__dome;
window.__lab.renderer.setAnimationLoop(null);
// Reference implementation before caching, used only for A/B verification.
const instance = new THREE.Matrix4();
function uncached(world) {
  world.scene.updateMatrixWorld(true);
  for (const e of world.entries) {
    e.enabled = true;
    for (let p=e.mesh;p;p=p.parent) if (!p.visible || p.userData.collisionEnabled === false) { e.enabled=false; break; }
    if (!e.enabled) continue;
    e.matrix.copy(e.mesh.matrixWorld);
    if(e.instance!==null) { e.mesh.getMatrixAt(e.instance,instance); e.matrix.multiply(instance); }
    e.inverse.copy(e.matrix).invert(); e.box.copy(e.localBox).applyMatrix4(e.matrix);
  }
}
const median = a => a.sort((a,b)=>a-b)[Math.floor(a.length/2)];
const before=[],after=[];
for(let n=0;n<40;n++) {
  for(const optimized of (n%2?[true,false]:[false,true])) {
    const start=performance.now();
    for(let k=0;k<3;k++) optimized?player.world.refresh():uncached(player.world);
    (optimized?after:before).push((performance.now()-start)/3);
  }
  if(n%5===0) await next();
}
const scene = new THREE.Scene(), parent=new THREE.Group(); scene.add(parent);
const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial(),2);
parent.add(mesh); mesh.setMatrixAt(0,new THREE.Matrix4()); mesh.setMatrixAt(1,new THREE.Matrix4().makeTranslation(2,0,0));
const world=new CollisionWorld(scene); let mismatches=0;
for(let n=0;n<30;n++) {
  parent.position.set(n*.1,n*.02,0); parent.rotation.y=n*.07;
  parent.visible=n%7!==0; mesh.userData.collisionEnabled=n%5!==0;
  mesh.setMatrixAt(1,new THREE.Matrix4().makeTranslation(2,n*.03,0));
  world.refresh();
  const expected=world.entries.map(e=>({enabled:e.enabled,matrix:e.matrix.clone(),inverse:e.inverse.clone(),box:e.box.clone()}));
  uncached(world);
  world.entries.forEach((e,i)=>{ const a=expected[i]; if(e.enabled!==a.enabled || (e.enabled && (!e.matrix.equals(a.matrix)||!e.inverse.equals(a.inverse)||!e.box.equals(a.box)))) mismatches++; });
}
const result={done:true,entries:player.world.entries.length,refreshBeforeMs:median(before),refreshAfterMs:median(after),cachePoseChecks:30,cacheMismatches:mismatches};
panel.dataset.result=JSON.stringify(result); panel.textContent=JSON.stringify(result,null,2);
