// Interior-only hangar page: hall + display mechs + control room + lighting.
// The port/sea/ships/rain live in /portstorm/ so neither page pays for the other.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildHangar } from '../portstorm/hangar.js';
import { buildMech } from '../portstorm/mech.js';
import { L } from '../portstorm/layout.js';
import { liftAnimator } from '../portstorm/lift.js';
import { buildWalkers } from '../portstorm/bay.js';
import { setupShow } from './show.js';
import { setupViews } from './views.js';
import { setupMachine } from './machine.js';
import { setupHud } from './hud.js';
import { mergeStatic } from './merge.js';
import { setOpen } from '../headlab/head.js';
import { HangarSound } from './sound.js';
import { createDock } from '../ui/dock.js';
import { PAL } from '../finallab/paint.js';
import { SCHEMES } from '../finallab/schemes.js';

const el = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.0));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
el.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x090f13);
const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 3000);
camera.position.set(30, 32, -222);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 20, -326); controls.enableDamping = true; controls.dampingFactor = 0.08;

const hangar = buildHangar([]);
scene.add(hangar.root);
const mech = buildMech({ scheme: 'navy', wear: 0.5 });
hangar.crawler.add(mech.group);
mech.group.position.set(0, hangar.deckTop, 0);

function schemeClone(src, key, x, z, ry) {
  const root = src.clone(true);
  const SC = SCHEMES[key] || SCHEMES.night;
  const map = new Map();
  root.traverse(o => {
    if (!o.isMesh || !o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const made = mats.map(m => {
      if (map.has(m)) return map.get(m);
      const c = m.clone();
      for (const [k, pm] of Object.entries(PAL)) if (pm === m && SC.mat[k]) { const [col, met, rough] = SC.mat[k]; c.color.setHex(col); c.metalness = met; c.roughness = rough; }
      map.set(m, c); return c;
    });
    o.material = Array.isArray(o.material) ? made : made[0];
  });
  if (!SC.stripes) root.traverse(o => { if (o.name?.startsWith('decal:红条')) o.visible = false; });
  root.position.set(x, 0, z); root.rotation.y = ry;
  root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  hangar.root.add(root); return root;
}
// two painted display copies used to stand in the side bays; each is ~1500 meshes (3 mechs ≈ 40 fps,
// 1 mech ≈ 51 fps), so the hall keeps only the main machine. The side bays stay as empty cradles.
// schemeClone(mech.group, 'hazard', -56, -300, 0.22);
// schemeClone(mech.group, 'snow', 56, -332, 0.12);

window.__lab = {
  scene, camera, renderer, controls, hangar, mech, L, state: {},
  setCam: () => {},
};
window.__storm = { lights: null };

function resize() {
  const w = el.clientWidth, h = el.clientHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize); resize();
// freecam.js disables the orbit controls; OrbitControls.update() would still re-aim the camera at its target
// every frame and undo the mouse-look, so only update while the controls are actually in use.
// ---- lifts: boarding cage + bridge (hangar.lift), control-room cage (interior.js → __interior.ctlLift)
const anim = liftAnimator();
{
  const css = document.createElement('style');
  css.textContent = `#liftPanel{position:fixed;left:24px;bottom:48px;z-index:20;background:rgba(12,18,22,.82);border:1px solid rgba(190,210,225,.2);backdrop-filter:blur(12px);padding:10px 12px;font:12px/1.4 "PingFang SC","Noto Sans SC",sans-serif;color:#b9c9d4}
#liftPanel h4{font-size:12px;letter-spacing:.14em;color:#eef4f8;margin:0 0 8px}
#liftPanel .r{display:flex;align-items:center;gap:6px;margin:5px 0}#liftPanel .r span{width:64px;color:#9fb3bf}
#liftPanel button{font:inherit;padding:4px 10px;color:#d6e1e8;background:rgba(255,255,255,.04);border:1px solid rgba(190,210,225,.18);cursor:pointer}
#liftPanel button:hover{border-color:#d86a2a;color:#fff}`;
  document.head.appendChild(css);
  const p = document.createElement('div'); p.id = 'liftPanel';
  p.innerHTML = `<h4>升降梯</h4>
    <div class="r"><span>登机梯</span><button data-l="bd0">地面</button><button data-l="bd1">驾驶舱</button></div>
    <div class="r"><span>登机桥</span><button data-l="br1">伸出</button><button data-l="br0">收回</button></div>
    <div class="r"><span>工作平台</span><button data-l="ct1">伸出</button><button data-l="ct0">收回</button></div>
    <div class="r"><span>控制室梯</span><button data-l="cr0">地面</button><button data-l="cr1">控制室</button></div>`;
  document.body.appendChild(p);
  const B = hangar.lift;
  const cageGo = to => anim.go(() => B.cage, v => B.set(v, B.bridge), to, 0.09);          // ~11 s full travel
  const bridgeGo = to => anim.go(() => B.bridge, v => B.set(B.cage, v), to, 0.25);
  const act = {
    bd0: () => cageGo(0), bd1: () => { bridgeGo(1); cageGo(1); },   // going up always brings the bridge out
    br1: () => bridgeGo(1), br0: () => bridgeGo(0),
    ct1: () => anim.go(() => hangar.cant.e, v => hangar.cant.set(v), 1, 0.2), ct0: () => anim.go(() => hangar.cant.e, v => hangar.cant.set(v), 0, 0.2),
    cr0: () => { const c = window.__interior?.ctlLift; if (c) anim.go(() => c.cage, v => c.set(v), 0, 0.15); },
    cr1: () => { const c = window.__interior?.ctlLift; if (c) anim.go(() => c.cage, v => c.set(v), 1, 0.15); },
  };
  p.querySelectorAll('button').forEach(b => b.onclick = () => act[b.dataset.l]());
}
// a few crew walking slow loops (old dome walkers), clear of the towers and the lift shaft
const walk = buildWalkers(hangar.root, [[[-42, -215], [-42, -330]], [[46, -215], [46, -300]], [[-35, -209], [-8, -209]], [[18, -212], [40, -212]], [[-46, -280], [-32, -300]], [[42, -262], [49, -318]]]);
// ---- old dome bay look + views + programs + HUD (built once interior.js has added its lights) ----
const V3 = THREE.Vector3;
let SH = null, VW = null, MC = null, HUD = null;
const Q = new URLSearchParams(location.search);
const focus = () => { const b = new THREE.Box3(); const t = mech.torso; t.updateMatrixWorld(true); b.setFromObject(t); return b.getCenter(new V3()); };
let footC = null;
const anchors = () => {
  const c = hangar.crawler.position, box = new THREE.Box3();
  const head = box.setFromObject(mech.mech.children[0].children[0]).getCenter(new V3());
  const reactor = box.setFromObject(mech.reactor).getCenter(new V3());
  const clawO = mech.arms.arms.leftRear.root.getObjectByName('LR.spin'), claw = clawO ? clawO.getWorldPosition(new V3()) : focus();
  if (!footC) { const fb = new THREE.Box3(); mech.group.traverse(o => { if (o.isMesh && o.userData.part === 'legR.foot') fb.expandByObject(o); }); footC = fb.isEmpty() ? new V3(c.x + 3, 1, c.z + 2) : fb.getCenter(new V3()); }
  return { base: new V3(c.x, 0, c.z), head, reactor, claw, foot: footC.clone(), height: mech.height + hangar.deckTop };
};
const park = (retract) => { if (!retract) return; anim.go(() => hangar.lift.bridge, v => hangar.lift.set(hangar.lift.cage, v), 0, 0.3); anim.go(() => hangar.cant.e, v => hangar.cant.set(v), 0, 0.3); };
function buildShow() {
  const it = window.__interior;
  const beams = [];
  scene.traverse(o => { if (o.isSpotLight && o.userData.base && o.parent?.name === 'interiorDetail') beams.push({ from: o.position.clone(), to: o.target.position.clone(), angle: o.angle * 0.5, color: 0xffe2c0, strength: 0.9 }); });
  it.fixtures.filter((f, i) => !f.userData.spot && i % 4 === 2).forEach(f => beams.push({ from: f.position.clone().add(new V3(0, -0.5, 0)), to: new V3(f.position.x, 0, f.position.z + 3), angle: 0.22, color: 0xffd8a8, strength: 0.45 }));
  SH = setupShow({ renderer, scene, camera, quality: Q.get('q') === 'cinema' ? 'cinema' : 'std', focus, beams,
    floor: { x: L.gate.cx, z: (L.hangar.tunnelZ0 + L.hangar.hallZ1) / 2, w: L.hangar.hallW, d: L.hangar.tunnelZ0 - L.hangar.hallZ1 },
    drains: [[-24.5, -165, -24.5, -330], [32.5, -165, 32.5, -330]],
    sparkSpots: () => hangar.cant.e > 0.95 ? [new V3(-8.6, 32.6, L.hangar.towerZ), new V3(16.6, 32.6, L.hangar.towerZ), new V3(-8.6, 16.6, L.hangar.towerZ - 1)] : [] });
  VW = setupViews({ camera, anchors, lift: hangar.lift });
  anchors();   // cache the foot point before the merge renames meshes
  const AR = mech.arms.arms, headG = mech.mech.children[0].children[0];
  const mr = mergeStatic(mech.group,
    () => { for (const a of Object.values(AR)) a.deploy(1); AR.leftRear.spin(1.7); AR.leftRear.update(); setOpen(headG, 1); Object.assign(mech.prop.tgt, { deploy: 1, wing: 1, thrust: 1 }); mech.prop.update(10); },   // canopy, thrusters and fans move too
    () => { for (const a of Object.values(AR)) a.deploy(0); AR.leftRear.spin(0); AR.leftRear.update(); setOpen(headG, 0); Object.assign(mech.prop.tgt, { deploy: 0, wing: 0, thrust: 0 }); mech.prop.update(10); });
  console.info('[hangar] machine meshes merged', mr);
  // lights left at intensity 0 by the port timeline (crawler headlights, gate, beacons, aux points) still cost a
  // full per-pixel light each in three.js: switch them off for this page (the lightning flash light stays)
  scene.traverse(o => { if (o.isLight && !o.isHemisphereLight && o.intensity === 0 && o !== SH.flashLight) o.visible = false; });
  // shadows only re-render while something moves (machine programs, lifts, decks)
  renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true;
  // lift / hydraulic speeds for the hall sound (units of travel per second)
  const sp = { c: hangar.lift.cage, b: hangar.lift.bridge, d: hangar.cant.e, ctl: 0, t: performance.now() };
  const soundExtra = () => {
    const now = performance.now(), dt = Math.max(1e-3, (now - sp.t) / 1000), ctl = window.__interior?.ctlLift?.cage ?? 0;
    const lift = Math.min(1, (Math.abs(hangar.lift.cage - sp.c) + Math.abs(ctl - sp.ctl)) / dt / 0.09), hyd = Math.min(1, (Math.abs(hangar.lift.bridge - sp.b) + Math.abs(hangar.cant.e - sp.d)) / dt / 0.25);
    Object.assign(sp, { c: hangar.lift.cage, b: hangar.lift.bridge, d: hangar.cant.e, ctl, t: now }); return { lift, hyd };
  };
  MC = setupMachine(mech, { scene, renderer, show: SH, park, canopy: v => setOpen(headG, v), SoundClass: HangarSound, soundExtra });
  SH.onWeld = () => MC.sound.burst('weld', true);
  VW.onCanopy = v => MC.canopy(v);
  // ---- one dock, fixed categories (same order on every scene page) ----
  const D = createDock({ top: 58, bottom: 12 });
  const sec = {
    views: D.section('视角', 'VIEWS', true), machine: D.section('机甲功能', 'MACHINE', true), scene: D.section('场景设备', 'SCENE'),
    light: D.section('灯光画质', 'LIGHT'), sound: D.section('声音显示', 'SOUND'),
  };
  HUD = setupHud({ camera, machine: MC, views: VW, show: SH, mech, focus, dock: D, sections: sec });
  // scene: lifts / bridge / decks (rows of the old lift panel, rebuilt as dock button rows)
  const lf = document.getElementById('liftPanel');
  if (lf) { lf.querySelectorAll('.r').forEach(r => { const label = r.querySelector('span').textContent; D.sub(sec.scene, label); const g = document.createElement('div'); g.className = 'btns'; r.querySelectorAll('button').forEach(b => g.appendChild(b)); sec.scene.appendChild(g); }); lf.remove(); }
  // light: the lighting panel's rows (lighting.js) + dome light effects
  const lp = document.getElementById('lightPanel');
  if (lp) {
    lp.querySelectorAll('.lr').forEach(r => { r.className = 'row'; sec.light.appendChild(r); });
    lp.querySelectorAll('label.chk').forEach(r => { r.className = 'row chk'; sec.light.appendChild(r); });
    const pr = lp.querySelector('.presets'); if (pr) { D.sub(sec.light, '预设 · PRESETS'); pr.className = 'btns c3'; sec.light.appendChild(pr); }
    lp.remove();
  }
  { const hint = document.getElementById('hint'); if (hint) hint.style.display = 'none'; }
  D.sub(sec.light, '光效 · DOME FX');
  const beamBase = SH.beams.map(b => b.material.uniforms.uColor.value.clone());
  D.slider(sec.light, '泛光', 0, 1.5, 0.01, SH.post.bloom.strength, null, v => SH.bloomBase = v);
  D.slider(sec.light, '背光', 0, 6000, 50, SH.back.intensity, v => v.toFixed(0), v => SH.back.intensity = v);
  D.slider(sec.light, '侧光', 0, 5000, 50, SH.rim.intensity, v => v.toFixed(0), v => SH.rim.intensity = v);
  D.slider(sec.light, '光柱', 0, 2, 0.01, 1, null, v => SH.beams.forEach((b, i) => { b.material.uniforms.uColor.value.copy(beamBase[i]).multiplyScalar(v); b.visible = v > 0.001; }));
  D.check(sec.light, '颗粒 · 暗角', on => SH.post.grade.enabled = on, true);
  D.check(sec.light, '蒸汽 · 焊花', on => { SH.steam.points.visible = on; SH.sparks.points.visible = on; SH.fxOff = !on; }, true);
  VW.go('full', 0.01);
  window.__show = { SH, VW, MC, HUD, anchors };
}
(function wait() { if (window.__interior && window.__lightPanel) buildShow(); else setTimeout(wait, 200); })();

let lastT = performance.now();
function loop(now = performance.now()) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now; anim.update(dt); walk(dt);
  if (mech.rotor?.update) mech.rotor.update(dt);
  if (mech.prop) mech.prop.update(dt);
  if (VW) VW.update(dt);
  if (MC) MC.update(now * 0.001, dt);
  if (HUD) HUD.update();
  if (controls.enabled) controls.update();
  if (MC) { const s = MC.st, moving = anim.busy() || Math.abs(s.e - s.eTarget) > 1e-4 || (s.deploy > 0 && s.deploy < 1) || s.sawSpeed > 0.05 || s.thrMove > 0.002; if (moving || (now % 2000) < 20) renderer.shadowMap.needsUpdate = true; }
  if (SH) SH.render(now * 0.001, dt); else renderer.render(scene, camera);
}
loop();
