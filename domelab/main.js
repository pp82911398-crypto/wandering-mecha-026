// Dome bay with the finished 026: the old dome scene (src/env.js, built in metres, untouched) + its look
// (fog, env map, light shafts, lit rain, steam / sparks, wet mirror floor, post chain), with the 026 scaled
// ×2.05 standing where the old machine stood. The scene's anchor points (head lamp, reactor, waist, feet,
// pauldron hooks) are hung on the 026's own parts, so cables and cradles follow it. Views / programs / info
// card / dock are the shared modules (unit = 2.05 world metres per head unit).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createMaterials, G } from '../src/materials.js';
import { buildEnvironment, updateEnvironment, liftGo, liftMoveTo } from '../src/env.js?v=dome-crane-depth-20261023e';
import { buildLiftCrawler, buildObservationEquipment } from './equipment.js?v=dome-perf-20261023e';
import { buildIndustrialRoof } from './roof.js?v=dome-20261022k';
import { industrialFloorTextures } from './surfaces.js?v=dome-20261022k';
import { buildVisitorGalleries, attachVisitorInteraction } from './visitors.js?v=dome-perf-20261023am';
import { createWallAppearance } from './walls.js?v=dome-perf-20261023am';
import { finishCockpit, buildBoardingPassage } from './cockpit.js?v=dome-perf-20261023am';
import { createPlayerController } from './player.js?v=dome-perf-20261023am';
import { airportGroundLayout } from './ground-layout.js?v=dome-walk-20261023c';
import { buildMobileLiftAccess } from './access.js?v=dome-perf-20261023am';
import { buildRecessedTurntable } from './turntable.js?v=dome-walk-20261023d';
import { createRain, createBeam, Particles, WetFloor } from '../src/fx.js?v=dome-perf-20261023e';
import { createPost } from '../src/post.js?v=dome-perf-20261023e';
import { createQualityController, RENDER_MODES } from './quality.js?v=dome-perf-20261023s';
import { buildMech } from './mech.js?v=dome-controls-20261023a';
import { createMechControls } from './mech-controls.js?v=dome-controls-20261023a';
import { setupViews } from '../hangar/views.js';
import { setupMachine } from '../hangar/machine.js?v=dome-surface-sync-20261023';
import { setupHud } from '../hangar/hud.js?v=dome-perf-20261023am';
import { mergeStatic } from '../hangar/merge.js';
import { createDock } from '../ui/dock.js?v=dome-20261022k';
import { setOpen } from '../headlab/head.js';
import { SCHEMES, applyScheme } from '../finallab/schemes.js';
import { SURF } from '../finallab/surface.js';
import { WEAR } from '../finallab/wear.js';
import { readFinishedAppearance, followFinishedAppearance } from '../finallab/appearance.js';
import { createMaterialUpgrade } from './material-upgrade.js?v=20261023c';
import { startModelSync, restoreModelView } from './model-sync.js?v=dome-perf-20261023e';
import { createQualitySettings } from './settings.js?v=dome-perf-20261023e';
import { mergeStaticEnv, mergeRigid } from './merge-env.js?v=dome-perf-20261023e';
import { buildShoulderBridges } from './shoulder-bridge.js?v=dome-perf-20261023am';

const V3 = THREE.Vector3, U = 2.05;
const $ = id => document.getElementById(id);
const Q = new URLSearchParams(location.search), quality = Q.get('q') || 'high';
const status = async (t, p) => { $('ltext').textContent = t; $('lbar').style.width = (p * 100) + '%'; await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0))); };

const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, quality === 'ultra' ? 1.5 : 1.25));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x1b2433, 0.0078);
scene.background = new THREE.Color(0x0b111b);
const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.1, 4000);
camera.layers.enable(1);

function envMap() {   // the old bay's reflection box: dark with a few emissive panels
  const s = new THREE.Scene();
  s.add(new THREE.Mesh(new THREE.BoxGeometry(100, 100, 100), new THREE.MeshBasicMaterial({ color: 0x06080c, side: THREE.BackSide })));
  const panel = (c, i, p, r, w, h) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(i), side: THREE.DoubleSide })); m.position.set(...p); m.rotation.set(...r); s.add(m); };
  panel(0x6f8fc8, 1.6, [0, 49, 0], [Math.PI / 2, 0, 0], 60, 60); panel(0xffa860, 4, [-49, 10, 10], [0, Math.PI / 2, 0], 30, 6);
  panel(0xffa860, 3, [49, 18, -10], [0, -Math.PI / 2, 0], 30, 4); panel(0x7fc8ff, 2.2, [0, 6, -49], [0, 0, 0], 70, 14);
  panel(0xfff0dc, 6, [20, 30, 49], [0, Math.PI, 0], 10, 4); panel(0x1a1c22, 1, [0, -49, 0], [-Math.PI / 2, 0, 0], 100, 100);
  const pm = new THREE.PMREMGenerator(renderer), texture = pm.fromScene(s, 0.02).texture;
  pm.dispose(); s.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  return texture;
}

(async function init() {
  await status('生成程序化材质', 0.1);
  const M = createMaterials();
  scene.environment = envMap(); scene.environmentIntensity = 0.55;

  await status('装配机甲 026（上色 / 浮雕 / 细节 / 反应堆）', 0.25);
  const appearance = readFinishedAppearance() || {};
  const mech = buildMech({ scheme: Q.get('scheme') || appearance.scheme || 'night', wear: +(Q.get('wear') ?? appearance.wear ?? .5),
    rounded: Q.has('round') ? Q.get('round') !== '0' : appearance.rounded !== false, rotorSpeed: appearance.rotorSpeed ?? 0 });
  canvas.dataset.modelSignature = JSON.stringify(mech.model.signature);
  canvas.dataset.groundContact = String(mech.groundContact);
  const cabin = finishCockpit(mech), cockpitGroup = cabin.cockpit;
  mech.group.scale.setScalar(U);
  scene.add(mech.group); scene.updateMatrixWorld(true);
  const headG = mech.head, AR = mech.arms.arms;

  // ---- anchor points the dome scene reads (J shim), hung on the 026's parts ----
  const box = new THREE.Box3();
  const hang = (parent, world, name) => { const o = new THREE.Object3D(); o.name = name; parent.add(o); parent.updateMatrixWorld(true); o.position.copy(parent.worldToLocal(world.clone())); return o; };
  const hb = box.setFromObject(headG).clone();
  const lamp = hang(headG, new V3((hb.min.x + hb.max.x) / 2, hb.min.y + (hb.max.y - hb.min.y) * 0.45, hb.max.z), 'anchorLamp');
  const reactor = hang(mech.torso, box.setFromObject(mech.reactor).getCenter(new V3()), 'anchorReactor');
  const footBox = id => { const b = new THREE.Box3(); mech.group.traverse(o => { if (o.isMesh && o.userData.part === `leg${id}.foot`) b.expandByObject(o); }); return b.getCenter(new V3()); };
  const footParent = id => {
    let parent = mech.mech;
    mech.legs.group.traverse(o => { if (o.isMesh && o.userData.part === `leg${id}.foot`) parent = o.parent; });
    return parent;
  };
  const footL = hang(footParent('L'), footBox('L'), 'anchorFootL'), footR = hang(footParent('R'), footBox('R'), 'anchorFootR');
  const waist = hang(mech.mech, mech.mech.localToWorld(new V3(0, -12.1, 0)), 'jointWaist');
  const hookAt = arm => { const b = new THREE.Box3().setFromObject(arm.root); return new V3((b.min.x + b.max.x) / 2, b.max.y, (b.min.z + b.max.z) / 2); };
  const hookL = hang(AR.leftFront.root, hookAt(AR.leftFront), 'anchorArmLHook'), hookR = hang(AR.right.root, hookAt(AR.right), 'anchorArmR1Hook');
  const lampSpot = new THREE.SpotLight(0xffc27a, 1800, 140, 0.32, 0.5, 2); lampSpot.position.copy(lamp.getWorldPosition(new V3()));
  lampSpot.target.position.copy(lampSpot.position).add(new V3(0, -14, 40)); scene.add(lampSpot, lampSpot.target);
  const J = { root: mech.group, anchors: { lamp, reactor, footL, footR, armLHook: hookL, armR1Hook: hookR }, joints: { waist }, lights: [{ kind: 'lampSpot', light: lampSpot }] };

  await status('构建穹顶维护井', 0.5);
  const env = buildEnvironment(scene, J, M, { liftBase: buildLiftCrawler, floorTextures: industrialFloorTextures,
    roof: buildIndustrialRoof, observation: buildObservationEquipment, galleries: buildVisitorGalleries, wallAppearance: createWallAppearance,
    turntable: buildRecessedTurntable, industrialDecks: true, heightDrop: 20, craneZ: -36, walkAccess: true, groundLayout: airportGroundLayout });
  scene.updateMatrixWorld(true); env.turntable.rotor.attach(mech.group);
  const boarding = buildBoardingPassage(env, headG);
  const access = buildMobileLiftAccess(env, boarding);

  // The lift's wide telescoping stages are the main bridge; the narrow E-controlled passage is the
  // boarding bridge. Panel open/close drives both, but roaming defaults to main open / boarding closed.
  let mainClosePending = false, boardingOpenPending = false;
  const setMainBridge = open => {
    const L = env.lift;
    if (L.stop !== 3) return false;
    if (open) {
      L.holdExt = false;
      if (L.ext < L.stops[3].ext - .001) { L.phase = 'extend'; return true; }
    } else {
      L.holdExt = true;
      if (L.ext > .001) { L.phase = 'retract'; return true; }
    }
    return false;
  };
  const openBoardingPair = () => {
    mainClosePending = false; boardingOpenPending = true;
    if (boarding.state.docked) { boarding.setOpen(1); boardingOpenPending = false; }
    else if (env.lift.stop === 3) setMainBridge(true);
  };
  const closeBoardingPair = () => {
    boardingOpenPending = false; boarding.setOpen(0); mainClosePending = true;
    if (boarding.state.open < .01) { setMainBridge(false); mainClosePending = false; }
  };
  const prepareRoam = () => {
    boardingOpenPending = false; mainClosePending = false; boarding.setOpen(0); env.lift.holdExt = false;
    if (env.lift.stop === 3) setMainBridge(true);
  };
  const surface = createMaterialUpgrade({ renderer, scene, env, mech, enabled: Q.get('surf') !== '0' });
  // Apply the default wall style after the material-upgrade wrapper is installed so the blue-gray
  // panels get the same surface treatment as a manual switch.
  env.wallAppearance.set('bluegray');
  const envMerge = mergeStaticEnv(scene, {
    exclude: [mech.group, env.turntable.root, env.roof.root, env.lift.root,
      ...env.observation.map(s => s.root), ...env.walkers.map(w => w.g), ...env.helis.map(h => h.g),
      ...(env.cantis || []).map(c => c.g), ...(env.cables || []).map(c => c.mesh || c.hook).filter(Boolean)],
    excludeNames: ['visitorGalleries', 'industrialDome', 'mobileLiftTower', 'recessedTurntable',
      'leftObservationTower', 'rightObservationTower', 'playerBayInspector', 'jaeger'],
  });
  console.info('[dome] static environment merged', envMerge);
  // Batch the static children of each animated root separately, so lifts, cages, gates, wheels, rotors and
  // doors keep their own transforms. This is where most of the environment draw calls live.
  const rigidMerge = [];
  const batchRigid = (root, nested = []) => { if (root) rigidMerge.push(mergeRigid(root, nested)); };
  const gatesIn = root => { const a = []; root?.traverse(o => { if (o.name === 'liftGate') a.push(o); }); return a; };
  batchRigid(env.turntable.root, [env.turntable.rotor]);
  batchRigid(env.roof.root, env.roof.leaves.map(l => l.group));
  const lift = env.lift, crawler = lift.crawler;
  batchRigid(lift.root, [lift.cage, lift.cw, lift.sheaves, crawler?.group, ...lift.secs, ...lift.ropes, ...lift.cwr, ...gatesIn(lift.root)]);
  { // The cage carries the telescoping stages and the animated cabin gate: merge only its fixed shell.
    const gates = lift.cage.children.filter(o => o.name === 'liftGate');
    batchRigid(lift.cage, [...lift.secs, ...gates]);
    for (const sec of lift.secs) batchRigid(sec, [boarding.root, boarding.guard]);
  }
  batchRigid(crawler?.group, crawler?.wheels.map(w => w.group));
  for (const side of env.observation) {
    batchRigid(side.root, [side.elevator.group, side.crawler.group, ...gatesIn(side.root)]);
    const cage = side.elevator.group.getObjectByName('controlLiftCage');
    batchRigid(side.elevator.group, [cage]);
    batchRigid(side.crawler.group, side.crawler.wheels.map(w => w.group));
    batchRigid(cage, cage.children.filter(o => o.name === 'liftGate'));
  }
  if (env.visitors?.root) {
    batchRigid(env.visitors.root, env.visitors.lifts.map(l => l.root));
    for (const l of env.visitors.lifts) batchRigid(l.root, [l.cage, ...gatesIn(l.root)]);
  }
  for (const h of env.helis) batchRigid(h.g, [...h.rotors, h.strobe, h.cable]);
  for (const w of env.walkers) batchRigid(w.g);
  for (const c of env.cantis || []) batchRigid(c.g);
  console.info('[dome] animated-root merging', rigidMerge);
  // Third working level of both observation towers: a telescoping bridge out toward the shoulder.
  const shoulderBridges = buildShoulderBridges({ env, J, scene });

  await status('大气、雨、湿地面', 0.7);
  const beams = env.beamDefs.map(d => createBeam(scene, d.from, d.to, d.angle, d.color, 1));
  const lampBeam = createBeam(scene, new V3(), new V3(0, 0, 1), lampSpot.angle * 0.8, new THREE.Color(0xffb060), 0.45); beams.push(lampBeam);
  const roofBeams = [];
  for (const [i, d] of env.extraBeams.entries()) { const b = createBeam(scene, d.from, d.to, d.angle, new THREE.Color(d.color), d.strength); b.layers.set(1); if (i < 3) roofBeams.push(b); }
  const heliBeams = env.heliBeams.map(d => { const from = new V3(); d.heli.g.localToWorld(from.set(0, -2.4, 3.6)); const mesh = createBeam(scene, from, d.to, 0.09, new THREE.Color(0xcfe0ff), 2.2); mesh.layers.set(1); return { def: d, mesh, from: new V3() }; });
  const rain = createRain(scene, env.spots);
  rain.mat.uniforms.uRoofEnabled.value = 1;
  rain.mat.uniforms.uRoofY.value = env.roof.opening.y;
  rain.mat.uniforms.uRoofZ.value = env.roof.opening.z;
  rain.mat.uniforms.uRoofRadius.value = env.roof.opening.radius;
  const sparks = new Particles(scene, 1400, { color: 0xffa040, gravity: -14, drag: 0.6 });
  const steam = new Particles(scene, 500, { additive: false, color: 0x9aa6b6, gravity: 1.4, drag: 1.4 });
  const wet = new WetFloor(renderer, scene, env.floorMask, 700, { sparse: true });
  wet.mat.uniforms.uStrength.value = 0.65;
  wet.setSize(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio());
  for (const o of [rain.lines, sparks.points, steam.points, wet.mesh, ...beams]) o.layers.set(1);

  await status('合并机甲静止零件 · 编译着色器', 0.85);
  const mr = mergeStatic(mech.group,
    () => {
      for (const a of Object.values(AR)) {
        a.deploy(1); a.setMissiles?.(1);
        if (a.hand) { a.hand.setGrip(1); a.hand.hand.rotation.set(.4, .6, 0); }
      }
      AR.leftRear.spin(1.7); AR.leftRear.update(); setOpen(headG, 1);
      mech.neck.set(20, 8); mech.waist.set(10, 5, 4); mech.model.FOREHEAD.set('square');
      Object.assign(mech.prop.tgt, { deploy: 1, wing: 1, thrust: 1, foot: 1, palm: 1 }); mech.prop.update(10);
    },
    () => {
      for (const a of Object.values(AR)) {
        a.deploy(0); a.setMissiles?.(0);
        if (a.hand) { a.hand.setGrip(.3); a.hand.hand.rotation.set(0, 0, 0); }
      }
      AR.leftRear.spin(0); AR.leftRear.update(); setOpen(headG, 0);
      mech.neck.set(0, 0); mech.waist.set(0, 0, 0); mech.model.FOREHEAD.set('blue');
      Object.assign(mech.prop.tgt, { deploy: 0, wing: 0, thrust: 0, foot: 0, palm: 0 }); mech.prop.update(10);
    });
  console.info('[dome] machine meshes merged', mr);
  // Distance detail culling: parts smaller than a pixel are hidden via their layer mask (not visible), so the
  // layer / X-ray visibility logic keeps working and the full detail returns on close-ups.
  const lod = [];
  mech.group.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh || Array.isArray(o.material)) return;
    const g = o.geometry; if (!g?.attributes?.position) return;
    if (!g.boundingSphere) g.computeBoundingSphere();
    if (!g.boundingSphere || !Number.isFinite(g.boundingSphere.radius)) return;
    lod.push({ o, r: g.boundingSphere.radius, c: g.boundingSphere.center.clone(), mask: o.layers.mask });
  });
  // The cockpit interior is fully occluded from outside; it only needs to exist for the head close-up and
  // boarding. Chrome pistons/rods are sub-pixel at hangar distance, so they are hidden by layer mask.
  const chrome = [];
  mech.group.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh) return;
    if ([].concat(o.material).some(m => m && m.name === 'chrome')) chrome.push({ o, mask: o.layers.mask });
  });
  let detailAt = -1, chromeHidden = false, cockpitHidden = false; const detailP = new V3();
  const updateDetailLod = now => {
    if (now - detailAt < 300) return; detailAt = now;
    const dHead = camera.position.distanceTo(cockpitGroup.getWorldPosition(detailP));
    const showCockpit = dHead < 55;
    if (showCockpit === cockpitHidden) { cockpitGroup.visible = showCockpit; cockpitHidden = !showCockpit; }
    const dMech = camera.position.distanceTo(mech.group.getWorldPosition(detailP));
    const hide = dMech > 45;
    if (hide !== chromeHidden) { for (const it of chrome) it.o.layers.mask = hide ? 0 : it.mask; chromeHidden = hide; }
  };
  let lodAt = -1; const lodP = new V3();
  const updateMechLod = now => {
    if (now - lodAt < 280) return;
    lodAt = now;
    const k = innerHeight / (2 * Math.tan(camera.fov * Math.PI / 360));
    for (const it of lod) {
      const o = it.o; if (!o.parent) continue;
      lodP.copy(it.c).applyMatrix4(o.matrixWorld);
      const d = camera.position.distanceTo(lodP);
      const e = o.matrixWorld.elements;
      const s = Math.max(Math.hypot(e[0], e[1], e[2]), Math.hypot(e[4], e[5], e[6]), Math.hypot(e[8], e[9], e[10]));
      const px = it.r * s * k / Math.max(d, 0.001);
      if (px < 0.8) { if (o.layers.mask !== 0) o.layers.mask = 0; }
      else if (o.layers.mask === 0 && it.mask !== 0) o.layers.mask = it.mask;
    }
  };
  const post = createPost(renderer, scene, camera, innerWidth, innerHeight, quality, { bloomScale: 0.5 });
  const renderQuality = createQualityController({ renderer, env, wet, rain, post,
    initial: quality === 'ultra' ? 'standard' : quality === 'low' ? 'performance' : 'balanced' });
  const controls = new OrbitControls(camera, canvas);
  Object.assign(controls, { enableDamping: true, dampingFactor: 0.055, rotateSpeed: 0.45, zoomSpeed: 0.7, maxDistance: 320 });

  // ---- shared modules ----
  const focusPoint = hang(mech.torso, new THREE.Box3().setFromObject(mech.torso).getCenter(new V3()), 'domeFocus');
  const focus = () => focusPoint.getWorldPosition(new V3());
  const anchors = () => {
    const b = new THREE.Box3();
    const clawO = AR.leftRear.root.getObjectByName('LR.spin');
    return { base: mech.group.position.clone(), head: b.setFromObject(headG).getCenter(new V3()), reactor: reactor.getWorldPosition(new V3()),
      claw: clawO ? clawO.getWorldPosition(new V3()) : focus(), foot: footR.getWorldPosition(new V3()), height: mech.height * U };
  };
  const VW = setupViews({ camera, anchors, unit: U });
  VW.views.liftBase = () => ({ p: new V3(env.lift.x + 22, 13, env.lift.TZ + 22), t: new V3(env.lift.x, 4, env.lift.TZ), fov: 48 });
  VW.views.dome = () => ({ p: new V3(25, env.HW - 46, env.CZ + 38), t: new V3(0, env.HW + 18, env.CZ), fov: 78 });
  VW.views.full = A => ({ p: new V3(0, 40, 82), t: A.base.clone().add(new V3(0, A.height * .48, 0)), fov: 60 });
  VW.views.turntable = () => ({ p: new V3(32, 18, 38), t: new V3(0, 2, 0), fov: 56 });
  const flash = new THREE.PointLight(0xbfd8ff, 0, 600, 1.2); scene.add(flash); let flashK = 0;
  let rotorTarget = appearance.rotorSpeed ?? 0;
  const MC = setupMachine(mech, { scene, renderer, unit: U, skipStaticUpdates: true, canopy: v => setOpen(headG, v), park: () => {}, rotorTarget: () => rotorTarget,
    show: { lightning: p => { flash.position.copy(p); flashK = 1; sparks.emit(anchors().claw, new V3(0, 0.4, 1), 40, 14, 0.8, 0.9, 0.3); } } });
  const D = createDock({ top: 58, bottom: 12 });
  const sec = { views: D.section('视角', 'VIEWS', true), machine: D.section('机甲控制', 'MACHINE'), scene: D.section('场景设备', 'SCENE'), sound: D.section('声音显示', 'SOUND') };
  let paused = false, preview = false, clock = null, resetFrameStats = false;
  const settings = createQualitySettings({
    onPause: open => { paused = open; preview = true; if (!open) { if (clock) clock.getDelta(); resetFrameStats = true; } },
    onPreview: () => { preview = true; },
  });
  { // settings entry in the dock header
    const head = D.panel.querySelector('.dock-head'), old = head.querySelector('button');
    const wrap = document.createElement('span'); wrap.style.cssText = 'display:flex;gap:6px;align-items:center';
    const gear = document.createElement('button'); gear.type = 'button'; gear.textContent = '画质设置';
    gear.onclick = () => settings.open();
    head.insertBefore(wrap, old); wrap.append(gear, old);
  }
  let hudStats = { fps: 0, frameMs: 0 };
  const HUD = setupHud({ camera, machine: MC, views: VW, show: { quality: 'std', setQuality() {} }, mech, focus, dock: D, sections: sec, fps: () => hudStats, layers: false,
    tag: 'PPDC · 穹顶机场 · 01 号维护井', sub: 'JAEGER 026 · SHATTERDOME BAY 01', quality: false, metersPerUnit: 1, extraViews: false,
    programs: ['thunder', 'canopy', 'thr'],
    viewList: [['head', '头部工作台'], ['reactor', '胸腔反应堆'], ['claw', '锯刃爪'], ['foot', '足部维护'], ['back', '背部推进'], ['full', '正面']] });
  const fold = (parent, title) => {
    const details = document.createElement('details'), summary = document.createElement('summary'), body = document.createElement('div');
    summary.textContent = title; body.className = 'sec'; details.append(summary, body); parent.append(details); return body;
  };
  const finishPanel = fold(sec.machine, '涂装 · 全身灯光 · 反应堆');
  let bodyLight = 1;
  const paintRow = document.createElement('label'); paintRow.className = 'row';
  paintRow.innerHTML = '<span>机甲涂装</span><select aria-label="机甲涂装"></select>';
  const paintSelect = paintRow.querySelector('select');
  for (const [key, scheme] of Object.entries(SCHEMES)) { const option = document.createElement('option'); option.value = key; option.textContent = scheme.cn; paintSelect.append(option); }
  paintSelect.value = mech.scheme; finishPanel.append(paintRow);
  paintSelect.onchange = () => {
    applyScheme(paintSelect.value, { mech: mech.mech, stripes: mech.stripes, scene: {}, rim: {}, key: {}, renderer: {} });
    mech.scheme = paintSelect.value; renderer.shadowMap.needsUpdate = true;
  };
  const bodyLightSlider = D.slider(finishPanel, '全身灯光', 0, 2, .05, 1, v => v.toFixed(2), v => {
    bodyLight = v; lampSpot.intensity = 1800 * v;
    mech.mats.lamp.emissiveIntensity = 3.2 * v; mech.mats.visor.emissiveIntensity = 2.6 * v; mech.mats.core.emissiveIntensity = 3 * v;
    if (mech.rotor) mech.rotor.lamp = v;
  });
  const rotorSlider = D.slider(finishPanel, '反应堆转速', 0, 1, .01, rotorTarget, v => v.toFixed(2), v => { rotorTarget = v; mech.rotor.target = v; });
  const wearSlider = D.slider(finishPanel, '磨损', 0, 1, .01, WEAR.value, v => v.toFixed(2), v => WEAR.value = v);
  const modelSyncReadout = D.sub(finishPanel, '正在连接成品间模型…'); modelSyncReadout.id = 'domeModelSync';
  const mechControls = createMechControls({ mech, machine: MC, dock: D, fold, parent: sec.machine,
    onMove: () => {
      if (boarding.state.target > 0) boarding.setOpen(0);
      for (const bridge of shoulderBridges.list) if (bridge.state.target > 0) bridge.setOpen(0);
    } });
  const updateAppearance = value => {
    const rounded = Q.has('round') ? Q.get('round') !== '0' : value.rounded !== false;
    if (rounded !== !!mech.model.RND) { location.reload(); return; }
    paintSelect.value = value.scheme; paintSelect.onchange();
    for (const [input, v] of [[bodyLightSlider, value.bodyLight], [rotorSlider, value.rotorSpeed], [wearSlider, value.wear]]) {
      if (v !== undefined) { input.value = v; input.dispatchEvent(new Event('input')); }
    }
    mech.jointGlow.setEnabled(value.jointGlow !== false);
    mech.model.FOREHEAD.set(value.forehead || 'blue'); SURF.on.value = value.surface === false ? 0 : 1;
    mechControls.syncAppearance(value);
    modelSyncReadout.dataset.appearance = JSON.stringify(value);
    renderer.shadowMap.needsUpdate = true;
  };
  if (appearance.scheme) updateAppearance(appearance);
  followFinishedAppearance(updateAppearance);
  const liftPanel = fold(sec.scene, '头部升降塔 · 履带');
  const doorPanel = fold(sec.scene, '机库门开关');
  const equipPanel = fold(sec.scene, '观察台 · 旋转底座');
  // scene equipment
  D.sub(liftPanel, '升降塔 · LIFT TOWER');
  const liftBtns = D.buttons(liftPanel, env.lift.stops.map((s, i) => [s.cn, () => access.primary.go(i)]));
  D.sub(liftPanel, '主桥 + 人物登机桥 · MAIN + CREW GANGWAY · E 只开登机桥');
  const [crewOpenBtn, crewCloseBtn] = D.buttons(liftPanel, [['展开主桥 + 登机桥', openBoardingPair], ['收回主桥 + 登机桥', closeBoardingPair]]);
  const crewStatus = D.sub(liftPanel, '当前：收起');
  const lateral = D.slider(liftPanel, '履带横移', env.lift.minX, env.lift.maxX, 0.1, 0, v => v.toFixed(1) + ' m', v => liftMoveTo(env.lift, v));
  D.buttons(liftPanel, [['左移', () => { lateral.value = env.lift.minX; liftMoveTo(env.lift, env.lift.minX); }],
    ['右移', () => { lateral.value = env.lift.maxX; liftMoveTo(env.lift, env.lift.maxX); }],
    ['回到机位', () => { lateral.value = 0; liftMoveTo(env.lift, 0); }], ['查看履带', () => VW.go('liftBase')]]);
  const liftReadout = D.sub(liftPanel, '履带待机 · 0.0 m');
  D.sub(doorPanel, '穹顶机库门 · ROOF HANGAR');
  const doorSlider = D.slider(doorPanel, '顶部开口', 0, 1, 0.01, 1, v => Math.round(v * 100) + '%', v => env.roof.setOpen(v));
  D.buttons(doorPanel, [['打开机库门', () => { doorSlider.value = 1; env.roof.setOpen(1); }],
    ['关闭机库门', () => { doorSlider.value = 0; env.roof.setOpen(0); }], ['查看穹顶', () => VW.go('dome')]], 2);
  const roofReadout = D.sub(doorPanel, '机库门已打开');
  D.sub(equipPanel, '内陷旋转底座 · 与地面齐平');
  const rotateTo = angle => { liftGo(env.lift, 0); env.turntable.rotateTo(angle); };
  const rotationSlider = D.slider(equipPanel, '机甲转向', -180, 180, 1, 0, v => Math.round(v) + '°', rotateTo);
  D.buttons(equipPanel, [['左转 90°', () => rotateTo(-90)], ['右转 90°', () => rotateTo(90)],
    ['转台回正', () => rotateTo(0)], ['查看转台', () => VW.go('turntable')]]);
  D.check(equipPanel, '转台缓慢旋转', on => { if (on) liftGo(env.lift, 0); env.turntable.state.auto = on; });
  const tableReadout = D.sub(equipPanel, '转台待机 · 0°');
  for (const side of env.observation) {
    D.sub(equipPanel, (side.side < 0 ? '左' : '右') + '观察台 · 电梯 / 履带');
    D.buttons(equipPanel, side.stops.map((y, i) => [i === 0 ? '地面层' : Math.round(y) + ' m 层', () => side.go(i)]));
    D.slider(equipPanel, '观察台外移', 0, 6, 0.1, 0, v => v.toFixed(1) + ' m', v => side.move(v));
    const name = side.side < 0 ? 'leftObservation' : 'rightObservation';
    VW.views[name] = () => ({ p: new V3(side.root.position.x - side.side * 20, 17, env.lift.TZ + 10),
      t: new V3(side.root.position.x, 23, side.root.position.z + 9), fov: 64 });
    D.buttons(equipPanel, [['查看' + (side.side < 0 ? '左' : '右') + '观察台', () => VW.go(name)]]);
    const bridge = shoulderBridges.bySide.get(side.side);
    if (bridge) {
      D.sub(equipPanel, `第三层肩桥 · ${bridge.level.toFixed(1)} m · 平台靠近后按 E 或按钮`);
      D.buttons(equipPanel, [[`展开第三层${side.side < 0 ? '左' : '右'}肩桥`, () => bridge.setOpen(1)],
        [`收回第三层${side.side < 0 ? '左' : '右'}肩桥`, () => bridge.setOpen(0)]]);
    }
  }
  const note = document.createElement('div'); note.className = 'note'; note.textContent = '横移前登机桥自动收回；选择楼层后自动回到中央机位。第三层左右观察台的肩桥可在人物漫游中靠近按 E 展开。顶部机库门控制雨水进入。'; sec.scene.appendChild(note);
  const finishRow = document.createElement('label'); finishRow.className = 'row';
  finishRow.innerHTML = '<span>墙面风格</span><select aria-label="墙面风格"><option value="dark">原深色</option><option value="bluegray" selected>蓝灰工业墙板</option></select>';
  finishRow.querySelector('select').value = env.wallAppearance.mode;
  finishRow.querySelector('select').onchange = event => env.wallAppearance.set(event.target.value);
  sec.scene.prepend(finishRow);
  // ---- quality settings (modal: opening it freezes the simulation) ----
  const S = settings.sec;
  const modeText = {
    balanced: '后期 1.05 倍超采样；保留工业光效、阴影和积水，动态分辨率兜底 28–30 帧。',
    standard: '后期 1.05 倍超采样；雨量与倒影刷新略高，关闭 MSAA，用超采样抗锯齿。',
    performance: '后期 0.8 倍；关闭实时倒影与调色，适合漫游和低性能设备。',
  };
  const modeNote = settings.noteLine(S.render, modeText[renderQuality.mode]);
  const modeSelect = settings.select(S.render, '渲染模式', Object.entries(RENDER_MODES).map(([v, c]) => [v, c.name]), renderQuality.mode, v => {
    renderQuality.set(v); modeNote.textContent = modeText[v]; if (typeof gradeCheck !== 'undefined') gradeCheck.checked = post.grade.enabled;
  });
  const dynCheck = settings.check(S.render, '动态分辨率（保 28–30 帧）', renderQuality.dynamic, on => renderQuality.enableDynamic(on));
  const surfaceToggle = settings.check(S.render, '机场材质升级', surface.enabled, on => surface.set(on));
  surfaceToggle.id = 'domeSurfaceToggle';
  const shadowCheck = settings.check(S.render, '实时阴影', renderer.shadowMap.enabled, on => {
    renderer.shadowMap.enabled = on; renderer.shadowMap.needsUpdate = true;
  });
  settings.noteLine(S.render, '动态分辨率只降低后期渲染分辨率，面板文字与 UI 不受影响。切换阴影会重编译一次着色器，可能停顿。');
  const exposureSlider = settings.slider(S.post, '曝光', 0.5, 1.8, 0.01, renderer.toneMappingExposure, v => v.toFixed(2), v => renderer.toneMappingExposure = v);
  const bloomSlider = settings.slider(S.post, '泛光', 0, 1.5, 0.01, post.bloom.strength, v => v.toFixed(2), v => post.bloom.strength = v);
  const fogSlider = settings.slider(S.post, '雾浓度', 0, 0.02, 0.0005, scene.fog.density, v => v.toFixed(4), v => scene.fog.density = v);
  const gradeCheck = settings.check(S.post, '颗粒 · 暗角', post.grade.enabled, on => post.grade.enabled = on);
  const domeSlider = settings.slider(S.scene, '穹顶照明', 0.2, 2, 0.05, 1, v => Math.round(v * 100) + '%', v => env.roof.uplights.forEach(l => l.intensity = 30000 * v));
  let wetOn = true, rainOn = true;
  const wetCheck = settings.check(S.scene, '湿地面倒影', true, on => { wetOn = on; wet.mesh.visible = on; });
  const rainCheck = settings.check(S.scene, '雨丝', true, on => { rainOn = on; rain.lines.visible = on; });
  const FREECAM_KEY = 'dome.freecamSpeed';
  let freecamSpeed = parseFloat(localStorage.getItem(FREECAM_KEY));
  if (!Number.isFinite(freecamSpeed)) freecamSpeed = .6;
  const applyFreecamSpeed = v => {
    freecamSpeed = v;
    try { localStorage.setItem(FREECAM_KEY, String(v)); } catch (e) {}
    window.__freecamSpeed = v;
    window.__freecam?.setSpeed?.(v);
  };
  applyFreecamSpeed(freecamSpeed);
  const freecamSlider = settings.slider(S.scene, '自由视角速度', .2, 1.5, .05, freecamSpeed,
    v => Math.round(v * 100) + '%', applyFreecamSpeed);
  settings.noteLine(S.scene, 'WASD 平移 · Q/E 升降 · Shift 加速。默认 60%。');
  settings.note('设置打开时游戏暂停；关闭后继续。帧率不足时先降后期分辨率，再考虑换画质档。');
  const perfReadout = document.createElement('div'); perfReadout.id = 'domePerf'; perfReadout.style.display = 'none'; document.body.appendChild(perfReadout);
  renderer.info.autoReset = false;
  settings.onReset = () => {
    renderQuality.enableDynamic(true);
    renderQuality.set('balanced');
    modeSelect.value = 'balanced'; modeNote.textContent = modeText.balanced; dynCheck.checked = true;
    if (!surface.enabled) { surfaceToggle.checked = true; surface.set(true); }
    if (!renderer.shadowMap.enabled) { shadowCheck.checked = true; renderer.shadowMap.enabled = true; }
    renderer.shadowMap.needsUpdate = true;
    for (const [input, v] of [[exposureSlider, 1.05], [bloomSlider, 0.42], [fogSlider, 0.0078], [domeSlider, 1]]) {
      input.value = v; input.dispatchEvent(new Event('input'));
    }
    for (const [box, v] of [[gradeCheck, true], [wetCheck, true], [rainCheck, true]]) {
      box.checked = v; box.dispatchEvent(new Event('change'));
    }
    applyFreecamSpeed(.6);
    freecamSlider.value = .6; freecamSlider.dispatchEvent(new Event('input'));
    renderQuality.resize();
  };

  window.__lab = { scene, camera, renderer, controls };   // freecam.js (WASD / mouse look) attaches here
  const visitor = attachVisitorInteraction(env.visitors, { camera, controls, views: VW, mobile: access.lifts });
  const player = createPlayerController({ scene, camera, controls, views: VW, visitor, env, boarding, bridges: shoulderBridges.list, onEnter: prepareRoam });
  access.setActor(() => player.state.active ? player.physics.position : null);
  const goView = VW.go;
  VW.go = (...args) => { if (player.state.active) player.exit(true); goView(...args); };
  D.sub(sec.views, '人物体验 · WALK'); player.mount(sec.views);
  window.__dome = { player, visitor, boarding, cabin, env, mech, J, VW, MC, mechControls, HUD, post, anchors, wet, rain, renderQuality, surface, access, settings, envMerge, rigidMerge, shoulderBridges,
    lodStats: () => ({ total: lod.length, hidden: lod.filter(i => i.o.layers.mask === 0).length, chrome: chrome.length, cockpit: cockpitGroup.visible }) };
  if (Q.get('verify') === 'walk') import('./walk-check.js?v=12');
  if (Q.get('verify') === 'performance') import('./perf-check.js?v=1');
  if (Q.get('verify') === 'materials') import('./verify.js?v=20261023b');
  if (Q.get('verify') === 'controls') import('../tools/model-controls-check.js?v=20261023b');
  VW.go('full', 0.01);
  if (restoreModelView({ camera, controls, views: VW })) VW.state.tween = null;
  if (!Q.has('verify')) startModelSync({ camera, controls, views: VW, readout: modelSyncReadout }).then(sync => window.__dome.modelSync = sync);
  renderer.compile(scene, camera);
  await status('就绪', 1);
  $('loader').classList.add('hide');

  clock = new THREE.Clock(); let t = 0, lastW = innerWidth, lastH = innerHeight;
  let perfFrames = 0, perfFrom = performance.now(), wetMs = 0, postMs = 0;
  let lastReflection = -1, lastShadow = -1, shadowKey = '', rigShadowKey = '', lastHud = -1;
  let lastFrameAt = 0, lastAdapt = performance.now(), goodTicks = 0, lastCanopyTarget = MC.st.canopyTarget;
  const frameSamples = [];
  const cameraDirection = new V3();
  document.addEventListener('visibilitychange', () => {
    // A hidden airport must not compete with the active scene for GPU time.
    clock.getDelta(); resetFrameStats = true;
    perfFrames = 0; wetMs = 0; postMs = 0; perfFrom = performance.now();
  });
  renderer.setAnimationLoop(() => {
    const rawDt = clock.getDelta();
    if (document.hidden) return;
    if (window.__director?.waitingForFrame) return;
    if (innerWidth !== lastW || innerHeight !== lastH) {
      lastW = innerWidth; lastH = innerHeight; camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
      renderQuality.resize();
    }
    if (resetFrameStats) { resetFrameStats = false; frameSamples.length = 0; lastFrameAt = 0; lastAdapt = performance.now(); goodTicks = 0; }
    if (paused) { if (preview) { preview = false; post.render(t); } return; }
    const dt = window.__director?.fixedDelta ?? Math.min(rawDt, 0.1);
    const frameNow = performance.now();
    if (lastFrameAt) frameSamples.push(frameNow - lastFrameAt);
    lastFrameAt = frameNow;
    if (frameSamples.length > 90) frameSamples.shift();
    if (renderQuality.dynamic && t > 4 && frameNow - lastAdapt > 1400 && frameSamples.length >= 30) {
      const sorted = frameSamples.slice(-50).sort((a, b) => a - b);
      const med = sorted[Math.floor(sorted.length / 2)];
      if (med > 34 && renderQuality.scale > renderQuality.minScale + 0.001) {
        renderQuality.setDynamicScale(renderQuality.scale - 0.05); goodTicks = 0;
      } else if (med < 26 && renderQuality.scale < 0.999) {
        if (++goodTicks >= 3) { renderQuality.setDynamicScale(renderQuality.scale + 0.05); goodTicks = 0; }
      } else goodTicks = 0;
      lastAdapt = frameNow;
    }
    t += dt; G.uTime.value = t;
    VW.update(dt);
    if (controls.enabled) controls.update();
    if (camera.position.y < 0.6) camera.position.y = 0.6;
    const nowDetail = performance.now();
    updateMechLod(nowDetail); updateDetailLod(nowDetail);
    // Auto-open only while the bridge is extending. Once it is fully out, a pilot closing the
    // canopy must not fight this line; closing triggers a full bridge retract below.
    if (lastCanopyTarget > .5 && MC.st.canopyTarget < .5 && boarding.state.target > .5) boarding.setOpen(0);
    if (boarding.state.target > .5 && boarding.state.open < .98 && MC.st.canopyTarget !== 1) MC.canopy(1);
    lastCanopyTarget = MC.st.canopyTarget;
    MC.update(t, dt); mech.mats.visor.emissiveIntensity *= bodyLight; mech.mats.core.emissiveIntensity *= bodyLight;
    mechControls.update(dt);
    if (mech.rotor?.update) mech.rotor.update(dt); if (mech.prop) mech.prop.update(dt);
    if (MC.st.sync >= 0 && Math.random() < 0.3) { const p = reactor.getWorldPosition(new V3()); for (const s of [-1, 1]) steam.emit(p.clone().add(new V3(s * 5.5, -10, -24)), new V3(0, -0.6, -1), 2, 9, 0.3, 1.6, 2.6); }
    sparks.update(dt); steam.update(dt);
    flashK = Math.max(0, flashK - dt * 3); flash.intensity = flashK * 60000; flash.visible = flashK > 0.001;
    updateEnvironment(env, J, t, dt, MC.st.e);
    boarding.update(dt);
    if (boardingOpenPending && boarding.state.docked) { boarding.setOpen(1); boardingOpenPending = false; }
    if (mainClosePending && boarding.state.open < .01) { setMainBridge(false); mainClosePending = false; }
    const crewOpen = boarding.state.open > .01 || boarding.state.target > .5;
    crewOpenBtn.classList.toggle('on', crewOpen);
    crewCloseBtn.classList.toggle('on', !crewOpen);
    crewStatus.textContent = boardingOpenPending ? '当前：主桥展开中'
      : mainClosePending || (env.lift.holdExt && env.lift.phase === 'retract') ? '当前：主桥收回中'
      : boarding.state.docked
        ? `当前：${boarding.state.open > .98 ? '已展开' : boarding.state.target > .5 ? '展开中' : boarding.state.open < .02 ? '已收起' : '收回中'}`
        : env.lift.holdExt ? '当前：主桥已收回' : '当前：需停在头部层';
    shoulderBridges.update(dt);
    access.update(dt);
    visitor.update();
    player.update(dt);
    window.__director?.update(dt);
    const updateReadouts = t - lastHud > 0.1;
    if (updateReadouts) {
      const tableAngle = THREE.MathUtils.euclideanModulo(env.turntable.state.angle + 180, 360) - 180;
      tableReadout.textContent = `${env.turntable.state.waiting ? '等待升降台降至地面' : '转台'} · ${Math.round(tableAngle)}°`;
      rotationSlider.value = THREE.MathUtils.euclideanModulo(env.turntable.state.target + 180, 360) - 180;
      rotationSlider.nextElementSibling.textContent = Math.round(tableAngle) + '°';
    }
    for (let i = 0; i < env.observation.length; i++) {
      const sp = env.spots[i]; beams[i].position.copy(sp.position);
      beams[i].quaternion.setFromUnitVectors(new V3(0, -1, 0), sp.target.position.clone().sub(sp.position).normalize());
      rain.mat.uniforms.uSP.value[i].copy(sp.position);
      rain.mat.uniforms.uSD.value[i].copy(sp.target.position).sub(sp.position).normalize();
    }
    const opening = env.roof.state.open;
    rain.mat.uniforms.uRoofShift.value = env.roof.opening.travel * opening * opening * (3 - 2 * opening);
    for (const b of roofBeams) b.material.uniforms.uOn.value = opening;
    if (updateReadouts) {
      liftReadout.textContent = `${env.lift.phase === 'retract' ? '正在收回登机桥' : env.lift.phase === 'drive' ? '履带横移中' : '履带待机'} · ${env.lift.x.toFixed(1)} m`;
      roofReadout.textContent = `机库门${env.roof.state.moving ? '运行中' : opening < 0.001 ? '已关闭 · 室内停雨' : '已打开'} · ${Math.round(opening * 100)}%`;
      lateral.value = env.lift.targetX;
      lateral.nextElementSibling.textContent = env.lift.targetX.toFixed(1) + ' m';
      doorSlider.nextElementSibling.textContent = Math.round(env.roof.state.target * 100) + '%';
    }
    for (const h of heliBeams) { h.def.heli.g.localToWorld(h.from.set(0, -2.4, 3.6)); h.mesh.position.copy(h.from); h.mesh.quaternion.setFromUnitVectors(new V3(0, -1, 0), h.def.to.clone().sub(h.from).normalize()); h.mesh.material.uniforms.uOn.value = opening; }
    // head lamp + its shaft follow the head (explode lifts it)
    const lp = lamp.getWorldPosition(new V3()); lampSpot.position.copy(lp); lampSpot.target.position.copy(lp).add(new V3(0, -14, 40));
    lampBeam.position.copy(lp); lampBeam.quaternion.setFromUnitVectors(new V3(0, -1, 0), new V3(0, -14, 40).normalize());
    lampBeam.material.uniforms.uOn.value = (0.25 + MC.st.power * 0.35) * bodyLight;
    rain.mat.uniforms.uLamp.value.copy(lp); rain.mat.uniforms.uLampDir.value.set(0, -14, 40).normalize();
    if (updateReadouts) { liftBtns.forEach((b, i) => b.classList.toggle('on', env.lift.stop === i)); HUD.update(); lastHud = t; }
    const cfg = renderQuality.profile;
    camera.getWorldDirection(cameraDirection);
    const lookingAtRoof = camera.position.y > 65 || cameraDirection.y > 0.5;
    env.roof.uplights.forEach(l => l.visible = lookingAtRoof);
    // A cached depth map contains the head's OLD silhouette. Sampling it after a turn
    // makes that silhouette shadow the new head, producing the black flashes seen in close-ups.
    // Refresh in the same frame as rig movement; retain the throttled cache while the rig is still.
    const rig = mech.model.lowerRig;
    const nextRigShadow = [
      ...Object.values(mech.neck.pose), ...Object.values(mech.waist.pose),
      ...Object.values(mechControls.weapons),
      ...Object.values(mechControls.grips).flatMap(g => [g.cur, g.wrist.cur, g.roll.cur]),
      ...Object.values(rig.C), ...Object.values(rig.L).flatMap(l => Object.values(l)), rig.ANKLE.out,
      mech.prop.deploy, mech.prop.wing, mech.prop.palm, mech.mech.position.y,
      MC.st.canopyT ?? 0, MC.st.deploy, MC.st.spin,
    ].map(v => Math.round(v * 1000)).join('|');
    const rigMoved = nextRigShadow !== rigShadowKey;
    const nextShadow = [MC.st.e, MC.st.deploy, MC.st.canopyT, MC.st.thrMove, MC.st.spin,
      env.lift.x, env.lift.y, env.roof.state.open, env.turntable.state.angle,
      ...env.observation.flatMap(s => [s.state.y, s.state.offset]), ...env.visitors.lifts.flatMap(l => [l.state.y, l.state.gate]),
      ...(player.state.active ? player.physics.position.toArray() : []), MC.st.layers.join('')].join('|');
    if (rigMoved || (nextShadow !== shadowKey && t - lastShadow >= 1 / cfg.shadowHz) || t - lastShadow > 1) {
      renderer.shadowMap.needsUpdate = true; shadowKey = nextShadow; lastShadow = t;
    }
    rigShadowKey = nextRigShadow;
    wet.mesh.visible = wetOn && cfg.reflectionHz > 0 && cameraDirection.y < 0.65;
    renderer.info.reset();
    const renderStart = performance.now();
    if (wet.mesh.visible && t - lastReflection >= 1 / cfg.reflectionHz) {
      wet.mat.uniforms.uTime.value = t;
      const shadowPending = renderer.shadowMap.needsUpdate; renderer.shadowMap.needsUpdate = false;
      wet.render(renderer, scene, camera, [rain.lines, ...beams]);
      renderer.shadowMap.needsUpdate = shadowPending; lastReflection = t;
    }
    const afterWet = performance.now();
    post.render(t);
    window.__director?.afterFrame();
    const now = performance.now(); wetMs += afterWet - renderStart; postMs += now - afterWet; perfFrames++;
    if (now - perfFrom >= 1200) {
      const fps = perfFrames * 1000 / (now - perfFrom);
      const stats = { fps: +fps.toFixed(1), frameMs: +((now - perfFrom) / perfFrames).toFixed(1),
        calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
        wetMs: +(wetMs / perfFrames).toFixed(1), postMs: +(postMs / perfFrames).toFixed(1),
        dpr: renderer.getPixelRatio(), postScale: +post.pixelRatio.toFixed(2), scale: +renderQuality.scale.toFixed(2), mode: renderQuality.mode };
      perfReadout.textContent = `${stats.fps} FPS · ${stats.frameMs} ms · ${stats.calls} 次绘制 · 渲染 ${Math.round(stats.scale * 100)}%`;
      perfReadout.dataset.stats = JSON.stringify(stats);
      settings.setStats(stats); hudStats = stats;
      perfReadout.dataset.view = JSON.stringify({ active: VW.state.active, tween: VW.state.tween?.k ?? null, camera: camera.position.toArray() });
      perfReadout.dataset.player = JSON.stringify({ active: player.state.active, firstPerson: player.state.firstPerson, position: player.physics.position.toArray(), grounded: player.physics.grounded, boardingOpen: boarding.state.open });
      perfFrames = 0; wetMs = 0; postMs = 0; perfFrom = now;
    }
  });
})();
