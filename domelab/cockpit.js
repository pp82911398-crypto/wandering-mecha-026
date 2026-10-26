import * as THREE from 'three';
import { Batch, cyl, cbox, tube } from '../src/kit.js';
import { canvasTex, textTex } from '../src/materials.js';

export function finishCockpit(mech) {
  const head = mech.head || mech.mech.children[0].children[0], cockpit = head.getObjectByName('cockpit');
  const carbonMap = canvasTex(512, 512, c => {
    c.fillStyle = '#30383d'; c.fillRect(0, 0, 512, 512);
    for (let y = 0; y < 512; y += 16) for (let x = 0; x < 512; x += 16) {
      const horizontal = ((x + y) / 16) % 4 < 2;
      c.fillStyle = horizontal ? '#465057' : '#232e35'; c.fillRect(x + 1, y + 1, 14, 14);
      c.strokeStyle = horizontal ? '#657078' : '#3f4b52'; c.lineWidth = 1;
      for (let j = 3; j < 15; j += 3) { c.beginPath(); c.moveTo(x + (horizontal ? 1 : j), y + (horizontal ? j : 1)); c.lineTo(x + (horizontal ? 15 : j), y + (horizontal ? j : 15)); c.stroke(); }
    }
  }, { repeat: true }); carbonMap.repeat.set(4, 4); carbonMap.anisotropy = 4;
  const carbon = new THREE.MeshStandardMaterial({ name: 'cockpitCarbonFiber', map: carbonMap, color: 0xb0bcc1, metalness: .38, roughness: .43, emissive: 0x101b21, emissiveIntensity: .3 });
  const alloy = new THREE.MeshStandardMaterial({ name: 'cockpitAlloy', color: 0x84949e, metalness: .55, roughness: .46, emissive: 0x1c272e, emissiveIntensity: .25 });
  const dark = new THREE.MeshStandardMaterial({ name: 'cockpitGraphite', color: 0x26333d, metalness: .35, roughness: .7, emissive: 0x101b23, emissiveIntensity: .25 });
  const amber = new THREE.MeshStandardMaterial({ name: 'cockpitAmber', color: 0xc29a48, emissive: 0xffae3a, emissiveIntensity: .65, roughness: .5 });
  const screenMap = canvasTex(512, 256, c => {
    c.fillStyle = '#10232c'; c.fillRect(0, 0, 512, 256);
    c.strokeStyle = '#829a9f'; c.lineWidth = 1;
    for (let x = 12; x < 512; x += 32) { c.beginPath(); c.moveTo(x, 40); c.lineTo(x, 235); c.stroke(); }
    for (let y = 40; y < 256; y += 32) { c.beginPath(); c.moveTo(12, y); c.lineTo(500, y); c.stroke(); }
    c.fillStyle = '#e3b25e'; c.font = 'bold 18px monospace'; c.fillText('026 / NEURAL LINK · STANDBY', 15, 26);
    c.strokeStyle = '#efbd6a'; c.lineWidth = 3; c.strokeRect(160, 65, 170, 150);
    c.fillStyle = '#b5ced2'; c.font = '14px monospace'; c.fillText('SYSTEM READY', 20, 83); c.fillText('POWER 35%', 20, 110);
    for (let i = 0; i < 7; i++) c.fillRect(360, 65 + i * 23, 80 + i % 3 * 15, 7);
  });
  const screen = new THREE.MeshBasicMaterial({ name: 'cockpitDisplay', map: screenMap, color: 0xa8bbc3, toneMapped: false, side: THREE.DoubleSide });
  // Remove complete occupied rigs, including suit/helmet accessories, then install empty stations.
  const stations = [];
  for (const name of ['rigA', 'rigB', 'rigC']) {
    const rig = cockpit.getObjectByName(name); if (!rig) continue;
    stations.push({ position: rig.position.clone(), angle: rig.rotation.y, name }); rig.removeFromParent();
  }
  mech.pilotCount = 0;
  const paint = o => {
    if (!o.isMesh) return;
    const recolour = mat => {
      if (/glass|visor|core/.test(mat.name)) return screen;
      if (/lamp/.test(mat.name)) return amber;
      if (/dark|frame/.test(mat.name)) return dark;
      const g = o.geometry; if (!g.boundingBox) g.computeBoundingBox(); const s = g.boundingBox.getSize(new THREE.Vector3());
      return Math.min(s.x, s.y, s.z) < .08 && Math.max(s.x, s.y, s.z) > .25 ? carbon : alloy;
    };
    o.material = Array.isArray(o.material) ? o.material.map(recolour) : recolour(o.material);
  };
  cockpit.traverse(paint);
  const details = []; head.getObjectByName('canopy').traverse(o => { if (o.userData.cockpitDetail || o.name === 'screen') details.push(o); });
  for (const o of details) o.traverse(paint);
  for (const station of stations) {
    const g = new THREE.Group(); g.name = 'emptyStation' + station.name.slice(-1); g.position.copy(station.position); if (station.name === 'rigB') { g.position.x = .85; g.position.z = -.4; } g.rotation.y = station.angle; cockpit.add(g);
    const B = new Batch();
    B.add(cbox(.3, .055, .27, .02), carbon, [0, .03, 0]);
    for (const x of [-.17, .17]) B.add(cyl(.018, .018, .66, 8), alloy, [x, .37, -.14]);
    B.add(cbox(.31, .38, .055, .02), carbon, [0, .47, -.16]);
    B.add(cbox(.24, .07, .065, .01), alloy, [0, .7, -.16]);
    for (const x of [-.13, .13]) B.add(cbox(.025, .02, .13, .005), alloy, [x, .44, .02]);
    B.add(cbox(.32, .04, .16, .015), dark, [0, .38, .28], [-.5, 0, 0]);
    B.add(cbox(.25, .008, .1, .002), screen, [0, .41, .29], [-.5, 0, 0]);
    B.add(cbox(.025, .3, .018, .004), amber, [.17, .45, -.18]);
    g.add(B.build());
  }
  const B = new Batch();
  for (const x of [-.9, .9]) {
    B.add(cbox(.035, .03, .95, .005), amber, [x, 2.2, -.02]);
    B.add(cbox(.055, .11, .75, .01), carbon, [x, 1.85, -.1]);
  }
  cockpit.add(B.build());
  return { cockpit, stations: stations.length, carbon, screen };
}

export function buildBoardingPassage(env, head) {
  const L = env.lift, root = new THREE.Group(); root.name = 'cockpitBoardingPassage';
  L.secs[2].add(root);
  head.updateWorldMatrix(true, false);
  // Step over the fixed lower visor lip before descending into the cockpit aisle.
  // Probe the real shell so the bridge stays above the latest finished-room geometry.
  const canopy = head.getObjectByName('canopy'), fixed = [];
  head.traverse(o => { if (!o.isMesh) return; for (let p = o; p; p = p.parent) if (p === canopy) return; fixed.push(o); });
  const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0), origin = new THREE.Vector3();
  let entryY = 1.65;
  for (const x of [-.12, 0, .12]) for (const z of [.9, 1.05, 1.2, 1.4, 1.55, 1.7, 1.85]) {
    origin.set(x, 2.4, z); head.localToWorld(origin); ray.set(origin, down);
    for (const hit of ray.intersectObjects(fixed, false)) {
      const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld), local = head.worldToLocal(hit.point.clone());
      if (normal.y > .35 && local.y < 2.55) { entryY = Math.max(entryY, local.y + .045); break; }
    }
  }
  const mount = head.parent.getObjectByName('neckMount');
  const floorMeshes = fixed.slice(); mount?.traverse(o => { if (o.isMesh) floorMeshes.push(o); });
  let innerFloor = 1.49;
  for (const z of [.15, .35, .55, .75]) {
    head.localToWorld(origin.set(0, 2.5, z)); ray.set(origin, down);
    for (const hit of ray.intersectObjects(floorMeshes, false)) {
      const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld), local = head.worldToLocal(hit.point.clone());
      if (normal.y > .55 && local.y < entryY) { innerFloor = Math.max(innerFloor, local.y + .015); break; }
    }
  }
  const sill = new Batch(), material = new THREE.MeshStandardMaterial({ color: 0x73828a, roughness: .7, metalness: .45 });
  sill.add(new THREE.BoxGeometry(.4, .045, .95), material, [0, entryY - .0225, 1.375]);
  const count = Math.max(1, Math.ceil((entryY - innerFloor) / .07)), sillRun = .55;
  for (let i = 0; i < count; i++) {
    const height = (entryY - innerFloor) * (count - i) / count;
    sill.add(new THREE.BoxGeometry(.4, height, sillRun / count + .012), material,
      [0, innerFloor + height / 2, .9 - sillRun * (i + .5) / count]);
  }
  for (const x of [-.23, .23]) {
    sill.add(tube([[x, entryY + .52, 1.85], [x, entryY + .52, .9], [x, innerFloor + .52, .35]], .012, 2, 6), material);
    for (const [z,y] of [[1.85,entryY],[.9,entryY],[.35,innerFloor]]) sill.add(cyl(.012,.012,.52,6),material,[x,y+.26,z]);
  }
  const entrySill = sill.build(); entrySill.name = 'domeCockpitEntrySill'; head.add(entrySill);
  // A short flat entry platform + shallow ramp, no rails: the bridge itself is the landing.
  const entryRamp = new THREE.Group(); entryRamp.name = 'boardingEntryStep'; head.add(entryRamp);
  const step = new THREE.Mesh(new THREE.BoxGeometry(.82, .08, .95), env.floor.material);
  step.position.set(0, entryY - .04, 1.37); entryRamp.add(step);
  const rampRun = .6, drop = entryY - innerFloor, rampLen = Math.hypot(rampRun, drop);
  const ramp = new THREE.Mesh(new THREE.BoxGeometry(.82, .06, rampLen), env.floor.material);
  ramp.rotation.x = -Math.atan2(drop, rampRun); ramp.position.set(0, (entryY + innerFloor) / 2 - .03, .35 + rampRun / 2); entryRamp.add(ramp);
  entryRamp.visible = false; entryRamp.userData.collisionEnabled = false;
  const entrance = head.localToWorld(new THREE.Vector3(0, entryY, 1.85));
  const retracted = L.F + L.Ls - .2;
  const startZ = retracted + (L.F + .3 - 2 * (L.Ls - .8) - retracted) * L.stops[3].ext;
  const length = startZ - entrance.z, rise = entrance.y - (L.stops[3].y - .73);
  const startY = -.73, endY = startY + rise;
  const alloy = new THREE.MeshStandardMaterial({ color: 0x7d898f, metalness: .4, roughness: .7 });
  const yellow = new THREE.MeshStandardMaterial({ color: 0xcda13a, metalness: .25, roughness: .55 });
  const B = new Batch(), slope = Math.atan2(rise, length);
  const floor = new THREE.BoxGeometry(.78, .1, Math.hypot(length, rise) + .12);
  floor.rotateX(slope); floor.translate(0, (startY + endY) / 2 - .05, -length / 2);
  for (let i = 0; i < floor.attributes.position.count; i++) floor.attributes.uv.setXY(i, floor.attributes.position.getX(i) / 700 + .5, floor.attributes.position.getZ(i) / 700 + .5);
  B.add(floor, env.floor.material);
  for (const x of [-.43, .43]) {
    B.add(tube([[x, startY + 1, 0], [x, endY + 1, -length]], .022, 1, 6), yellow);
    for (let i = 0; i <= 8; i++) { const t = i / 8; B.add(cyl(.023, .023, 1, 6), yellow, [x, startY + rise * t + .5, -length * t]); }
  }
  // Close the floor seam at the start, with the computers tucked outside this clear central aisle.
  B.add(cbox(.82, .1, .45, .01), alloy, [0, startY - .05, .13]); root.add(B.build());
  const ground = new THREE.Group(); ground.name = 'boardingLiftGroundStairs'; L.root.add(ground);
  // Short leveling ramp where the wide main bridge ends and the narrow boarding bridge starts.
  const jr = .9, jdrop = -.59 - startY;
  const junctionRamp = new THREE.Mesh(new THREE.BoxGeometry(.9, .06, Math.hypot(jr, jdrop)), env.floor.material);
  junctionRamp.name = 'boardingMainJunctionRamp';
  junctionRamp.rotation.x = Math.atan2(jdrop, jr);
  junctionRamp.position.set(0, (-.59 + startY) / 2 - .005, .1);
  L.secs[2].add(junctionRamp);
  const stairs = new Batch(), steps = 36, run = 9.3, height = L.stops[0].y, z0 = L.F - 9;
  for (let i = 0; i < steps; i++) {
    const h = height * (i + 1) / steps, g = new THREE.BoxGeometry(1.45, h, run / steps + .015);
    for (let v = 0; v < g.attributes.position.count; v++) g.attributes.uv.setXY(v, g.attributes.position.getX(v) / 700 + .5, g.attributes.position.getZ(v) / 700 + .5);
    stairs.add(g, env.floor.material, [0, h / 2, z0 + run * (i + .5) / steps]);
  }
  for (const x of [-.78, .78]) {
    stairs.add(tube([[x, 1.05, z0], [x, height + 1.05, z0 + run]], .025, 1, 6), yellow);
    for (let i = 0; i <= 8; i++) stairs.add(cyl(.025, .025, 1.05, 6), yellow, [x, height * i / 8 + .525, z0 + run * i / 8]);
  }
  ground.add(stairs.build());
  const guard = new THREE.Group(); guard.name = 'boardingPassageSafetyGate'; L.secs[2].add(guard);
  const sign = new THREE.Sprite(new THREE.SpriteMaterial({
    map: textTex([{ t: 'E · 登机桥', size: 86, y: 82, color: '#ffcf6a' }], 512, 160),
    transparent: true, depthWrite: false, toneMapped: false,
  }));
  sign.scale.set(1.55, .48, 1); sign.position.set(0, startY + 1.35, .5); L.secs[2].add(sign);
  const guardParts = new Batch();
  for (const y of [.5, 1]) guardParts.add(cbox(.9, .06, .06, .008), yellow, [0, startY + y, .1]);
  for (const x of [-.45, .45]) guardParts.add(cyl(.025, .025, 1, 6), yellow, [x, startY + .5, .1]);
  guard.add(guardParts.build());
  const state = { open: 0, target: 0, docked: false };
  const local = new THREE.Vector3(), start = new THREE.Vector3(), end = new THREE.Vector3();
  const api = { root, ground, guard, sign, entryRamp, state, entrance, length, rise, entrySill, entryY, innerFloor,
    setOpen(v) { state.target = THREE.MathUtils.clamp(v, 0, 1); },
    near(position) {
      if (!state.docked) return false;
      root.parent.updateWorldMatrix(true, false);
      root.parent.localToWorld(start.set(0, startY, .8)); root.parent.localToWorld(end.set(0, endY, -length - .8));
      return Math.min(position.distanceTo(start), position.distanceTo(end)) < 4.5;
    },
    toggle(position) {
      if (!api.near(position)) return false;
      if (state.target > .5) {
        root.parent.worldToLocal(local.copy(position));
        if (Math.abs(local.x) < .75 && local.z < .1 && local.z > -length + .1) return false;
      }
      state.target = state.target > .5 ? 0 : 1; return true;
    },
    update(dt = 1 / 60) {
    state.docked = L.stop === 3 && L.phase === 'idle' && Math.abs(L.x) < .01 && Math.abs(L.ext - L.stops[3].ext) < .002;
    if (!state.docked) state.target = 0;
    // Heavy telescoping gangway: about 5 s to extend and 6 s to retract, instead of snapping out.
    const rate = state.target > state.open ? .20 : .16;
    state.open += THREE.MathUtils.clamp(state.target - state.open, -dt * rate, dt * rate);
    const t = state.open * state.open * (3 - 2 * state.open), scale = .05 + .95 * t;
    root.scale.set(1, scale, scale); root.position.y = startY * (1 - scale);
    root.visible = state.docked;
    root.userData.collisionEnabled = state.open > .999;
    // Only show the safety frame while the bridge is actually deployed. At rest it must disappear with
    // the retracted bridge, otherwise it remains at the mouth and traps a walking character.
    guard.visible = state.docked && state.open > .15 && state.open < .999;
    sign.visible = state.docked;
    // The entry stairs/rails belong to the boarding bridge; hide them with it instead of leaving
    // a frame inside the cockpit after the helmet closes.
    // The old rail/stair sill stays gone; only a short flat step + ramp connects the bridge to the cockpit.
    entrySill.visible = false;
    entryRamp.visible = state.docked && state.open > .9;
    entryRamp.userData.collisionEnabled = state.open > .98;
    ground.visible = true;
  } };
  api.update(0); return api;
}
