import * as THREE from 'three';
import { Batch, ring, cyl } from '../src/kit.js';
import { textTex } from '../src/materials.js';
import { buildControlLift } from '../portstorm/lift.js?v=dome-perf-20261023f';
import { brightWalkwayMaterial } from './surfaces.js?v=dome-20261022k';
import { containsCabin, galleryLandingAccess } from './access.js?v=dome-perf-20261023aj';

const V3 = THREE.Vector3, TAU = Math.PI * 2;
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

export function buildVisitorGalleries(scene, { RW, CZ, tiers }, m) {
  const root = new THREE.Group(); root.name = 'visitorGalleries'; scene.add(root);
  const inner = RW - 13, shaftRadius = RW - 8.5, angles = [45, 135, 225, 315].map(d => d * Math.PI / 180);
  const surface = brightWalkwayMaterial(), B = new Batch(), lifts = [], stops = [.45, ...tiers], accessUpdates = [];
  const shaftHalf = 2.5;
  // Real openings through every deck let the cages pass between floors.
  const shape = new THREE.Shape(); shape.absarc(0, 0, RW, 0, TAU, false);
  const centre = new THREE.Path(); centre.absarc(0, 0, inner, 0, TAU, true); shape.holes.push(centre);
  for (const a of angles) {
    const p = new THREE.Path();
    for (const [i, [x, z]] of [[-shaftHalf, -shaftHalf], [-shaftHalf, shaftHalf], [shaftHalf, shaftHalf], [shaftHalf, -shaftHalf]].entries()) {
      const X = Math.sin(a) * shaftRadius + Math.cos(a) * x + Math.sin(a) * z;
      const Z = Math.cos(a) * shaftRadius - Math.sin(a) * x + Math.cos(a) * z;
      if (!i) p.moveTo(X, -Z); else p.lineTo(X, -Z);
    }
    p.closePath(); shape.holes.push(p);
  }
  // Shape XY is mapped to world XZ (negative Z before the rotation).
  const deckGeo = new THREE.ShapeGeometry(shape, 128);
  const pos = deckGeo.attributes.position, uv = deckGeo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i), pos.getY(i));
  deckGeo.rotateX(-Math.PI / 2);
  for (const y of tiers) {
    B.add(deckGeo.clone(), surface.material, [0, y, CZ]);
    B.add(ring(inner, inner + .5, .4, 192), m.beam, [0, y - .23, CZ]);
    // Narrow light fascia stays below the deck, with no objects protruding into the path.
    B.add(ring(inner - .09, inner + .02, .16, 192), m.led, [0, y - .44, CZ]);
    for (const h of [.55, 1.12]) B.add(ring(inner - .035, inner + .045, .075, 192), m.rail, [0, y + h, CZ]);
    for (let i = 0; i < 180; i++) {
      const a = i / 180 * TAU;
      B.add(box(.075, 1.12, .075), m.rail, [Math.sin(a) * inner, y + .56, CZ + Math.cos(a) * inner]);
    }
  }
  // Reuse the established lift mechanism, with an open viewing side and industrial guides.
  for (let i = 0; i < angles.length; i++) {
    const a = angles[i], g = new THREE.Group(); g.name = 'visitorLift' + i;
    g.position.set(Math.sin(a) * shaftRadius, 0, CZ + Math.cos(a) * shaftRadius); g.rotation.y = a; root.add(g);
    const elevator = buildControlLift(g, { x: 0, zMez: -2.4, y0: tiers.at(-1), openFront: true });
    elevator.group.children[0].visible = false; // replace crossbars across the entrances with rear guides
    elevator.group.children[2].visible = false; // open platform; no transparent glass overdraw
    const cage = elevator.group.getObjectByName('controlLiftCage');
    const D = new Batch(), C = new Batch(), top = tiers.at(-1) + 6;
    for (const x of [-1.9, 1.9]) {
      D.add(box(.28, top, .38), m.steel, [x, top / 2, 2.12]);
      D.add(box(.07, top, .1), m.yellow, [x, top / 2, 1.89]);
      D.add(cyl(.065, .065, top, 6), m.steel, [x * .6, top / 2, 2.3]);
    }
    D.add(box(4.8, top, .25), m.beam, [0, top / 2, 2.62]);
    D.add(box(4.9, .45, 4.8), m.beam, [0, top, 0]);
    D.add(box(4.9, .28, 4.9), m.dark, [0, .14, 0]);
    const floorGeo = box(3.25, .025, 3.25);
    for (let v = 0; v < floorGeo.attributes.uv.count; v++) floorGeo.attributes.uv.setXY(v, m.deck ? floorGeo.attributes.position.getX(v) / 700 + .5 : floorGeo.attributes.uv.getX(v) * 3.25, m.deck ? floorGeo.attributes.position.getZ(v) / 700 + .5 : floorGeo.attributes.uv.getY(v) * 3.25);
    C.add(floorGeo, m.deck || surface.material, [0, .018, 0]);
    C.add(box(.6, 1.15, .35), m.dark, [0, .65, 1.53]);
    C.add(box(.5, .3, .03), m.yellow, [0, 1.18, 1.34]);
    for (const x of [-.13, .13]) C.add(box(.08, .06, .04), m.led, [x, 1.18, 1.31]);
    cage.add(C.build(false));
    const labelMat = new THREE.MeshBasicMaterial({ map: textTex([{ t: 'LIFT ' + 'ABCD'[i], size: 90, y: 105, color: '#c4d0d4' }], 512, 160), transparent: true, toneMapped: false });
    for (let j = 0; j < stops.length; j++) {
      const y = stops[j];
      // The three fenced sides of each opening; the inward side opens onto the gallery.
      for (const x of [-2.48, 2.48]) {
        D.add(box(.085, 1.15, .085), m.yellow, [x, y + .575, -2.48]);
        D.add(box(.085, .085, 5), m.yellow, [x, y + 1.15, 0]);
      }
      D.add(box(5, .085, .085), m.yellow, [0, y + 1.15, 2.48]);
      D.add(box(.45, 1.1, .3), m.dark, [2.85, y + .55, -2.6]);
      D.add(box(.2, .13, .04), m.led, [2.85, y + 1, -2.78]);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.5, .78), labelMat);
      sign.position.set(0, y + 3.2, 2.46); sign.rotation.y = Math.PI; g.add(sign);
      if (j > 0) {
        // Flush sills bridge the small clearance to the cabin floor, never the shaft itself.
        D.add(box(4.9, .08, .5), m.yellow, [0, y - .028, -2.7]);   // 12 mm proud of the deck: no coplanar top face
      }
    }
    g.add(D.build());
    const state = { y: stops[0], target: stops[0], floor: 0, speed: 0, moving: false, gate: 1, hold: false };
    const gates = [-1, 1].map(s => {
      const parts = new Batch();
      for (const y of [.55, 1.1]) parts.add(box(1.68, .08, .08), m.yellow, [0, y, 0]);
      parts.add(box(.08, 1.1, .08), m.yellow, [-s * .8, .55, 0]);
      const gate = parts.build(false); cage.add(gate); return { gate, side: s };
    });
    const api = { root: g, elevator, cage, stops, state, id: i, name: `外围观景电梯 ${'ABCD'[i]}`,
      contains: position => containsCabin(cage, position, { floor: .0305 }),
      go(floor) { if (!Number.isInteger(floor) || floor < 0 || floor >= stops.length) return false;
        state.floor = floor; state.target = stops[floor]; state.hold = false; return true; },
      cancel() { state.target = state.y; state.speed = 0; state.gate = 0; state.hold = true; },
      position(out = new V3()) { g.updateWorldMatrix(true, false); return g.localToWorld(out.set(0, state.y, 0)); },
      landing(floor, out = new V3()) { g.updateWorldMatrix(true, false); return g.localToWorld(out.set(0, stops[floor], -3.5)); },
      update(dt) {
        const d = state.target - state.y;
        const gateTarget = state.hold || Math.abs(d) > .01 ? 0 : 1;
        state.gate += THREE.MathUtils.clamp(gateTarget - state.gate, -dt * 1.5, dt * 1.5);
        for (const { gate, side } of gates) { gate.position.set(side * (.85 + state.gate * 1.65), 0, -1.72); gate.userData.collisionEnabled = state.gate < .35; }
        const desired = state.gate > .001 && gateTarget === 0 ? 0 : Math.sign(d) * Math.min(4.5, Math.sqrt(2 * 2.5 * Math.abs(d)));
        state.speed += THREE.MathUtils.clamp(desired - state.speed, -2.5 * dt, 2.5 * dt);
        const step = state.speed * dt;
        if (Math.abs(d) < .01 || (Math.sign(step) === Math.sign(d) && Math.abs(step) >= Math.abs(d))) { state.y = state.target; state.speed = 0; }
        else state.y += step;
        state.moving = Math.abs(state.y - state.target) > .01;
        elevator.set((state.y - stops[0]) / (stops.at(-1) - stops[0]));
      },
    };
    lifts.push(api);
    accessUpdates.push(galleryLandingAccess(api, m));
  }
  root.add(B.build());
  // Human-scale access doors, service panels and conduits share a few merged meshes.
  const services = new Batch();
  const accessMap = textTex([{ t: 'LAB ACCESS', size: 70, y: 90, color: '#bdc9cf' }, { t: 'AUTHORIZED PERSONNEL', size: 26, y: 145, color: '#c7a356' }], 512, 192);
  const accessMaterial = new THREE.MeshBasicMaterial({ map: accessMap, transparent: true, toneMapped: false });
  for (const degrees of [20, 160, 200, 340]) {
    const a = degrees * Math.PI / 180, X = Math.sin(a) * 98.5, Z = CZ + Math.cos(a) * 98.5;
    const local = (x, y, z) => [X + Math.cos(a) * x + Math.sin(a) * z, y, Z - Math.sin(a) * x + Math.cos(a) * z];
    services.add(box(3.5, 4.3, .28), m.steel, local(0, 2.15, 0), [0, a, 0]);
    services.add(box(2.8, 3.7, .14), m.yellow, local(0, 1.87, -.23), [0, a, 0]);
    services.add(box(1.3, .65, .09), m.glass, local(0, 2.8, -.35), [0, a, 0]);
    services.add(box(.32, .62, .08), m.dark, local(2.2, 1.5, -.22), [0, a, 0]);
    services.add(box(2, 1.1, .3), m.steel, local(-3.1, 1.7, 0), [0, a, 0]);
    services.add(box(10, .12, .16), m.steel, local(0, 4.9, 0), [0, a, 0]);
    for (const x of [-4.2, 3.5]) services.add(box(.12, 4.9, .16), m.steel, local(x, 2.45, 0), [0, a, 0]);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.7, 1.76), accessMaterial);
    sign.position.set(...local(5.4, 3.2, -.25)); sign.rotation.y = a + Math.PI; root.add(sign);
  }
  root.add(services.build());
  return { root, lifts, stops, inner, width: RW - inner, material: surface.material,
    update(dt) { for (const lift of lifts) lift.update(dt); accessUpdates.forEach(update => update(dt)); } };
}

// Actor adapter is also usable by a future walking avatar. The scene panel has no ride buttons.
export function createVisitorRide(galleries, actor) {
  let riding = null, nearest = null, waiting = null;
  const p = new V3(), q = new V3();
  return {
    get riding() { return riding; }, get nearest() { return nearest; }, get waiting() { return waiting; },
    get freeWalking() { return !!actor.freeWalking; },
    setActor(next) { if (riding || waiting) return false; actor = next; return true; },
    release() { if (waiting) waiting.lift.cancel?.(); actor.end?.(); riding = null; waiting = null; nearest = null; },
    board(id, floor) {
      const lift = galleries.lifts.find(lift => lift.id === id); if (!lift || riding || waiting) return false;
      actor.getPosition(p); lift.landing(floor, q);
      if (Math.hypot(p.x - q.x, p.z - q.z) > 6 || Math.abs(p.y - q.y) > 2.5) return false;
      if (lift.go(floor) === false) return false;
      waiting = { lift, floor }; if (!actor.freeWalking) actor.begin?.(); return true;
    },
    go(floor) { return riding ? riding.go(floor) : false; },
    exit() {
      if (!riding || riding.state.moving || riding.state.gate < .95) return false;
      if (!actor.freeWalking) actor.setPosition(riding.landing(riding.state.floor, p)); actor.end?.(); riding = null; return true;
    },
    update() {
      actor.getPosition(p); nearest = null;
      if (actor.freeWalking) {
        // Physics carries a standing passenger with the actual cabin floor. Never pin the person to its centre.
        riding = galleries.lifts.find(lift => lift.contains?.(p)) || null;
        if (waiting && !waiting.lift.state.moving && Math.abs(waiting.lift.state.y - waiting.lift.stops[waiting.floor]) < .03) waiting = null;
      }
      if (!riding && !waiting) for (const lift of galleries.lifts) for (let floor = 0; floor < lift.stops.length; floor++) {
        if (lift.callableFloor && !lift.callableFloor(floor)) continue;
        lift.landing(floor, q);
        const distance = Math.hypot(p.x - q.x, p.z - q.z);
        if (distance < 6 && Math.abs(p.y - q.y) < 2.5 && (!nearest || distance < nearest.distance)) nearest = { id: lift.id, floor, distance };
      }
      if (!actor.freeWalking && waiting && !waiting.lift.state.moving && Math.abs(waiting.lift.state.y - waiting.lift.stops[waiting.floor]) < .01) { riding = waiting.lift; waiting = null; }
      if (riding && !actor.freeWalking) actor.setPosition(riding.position(p));
    },
  };
}

export function attachVisitorInteraction(galleries, { camera, controls, views, mobile = [] }) {
  const target = new V3(); let oldControls = true;
  const cameraActor = {
    getPosition(out) { return out.copy(camera.position).add(new V3(0, -1.72, 0)); },
    setPosition(p) { const delta = p.clone().add(new V3(0, 1.72, 0)).sub(camera.position); camera.position.add(delta); controls.target.add(delta); },
    begin() {
      oldControls = controls.enabled; controls.enabled = false; views.state.tween = null; views.state.ride = null; views.stopTour();
      camera.fov = 60; camera.updateProjectionMatrix(); camera.lookAt(target.set(0, camera.position.y + 5, 0));
      document.exitPointerLock?.();
      if (window.__freecam) { window.__freecam.movementEnabled = false; for (const key of Object.keys(window.__freecam.keys)) window.__freecam.keys[key] = 0; }
      window.__freecam?.sync?.();
    },
    end() { controls.enabled = oldControls; if (window.__freecam) window.__freecam.movementEnabled = true; window.__freecam?.sync?.(); },
  };
  const allLifts = { lifts: [...galleries.lifts, ...mobile] }, ride = createVisitorRide(allLifts, cameraActor);
  const hint = document.createElement('div'); hint.id = 'visitorLiftHint';
  hint.style.cssText = 'position:fixed;bottom:28px;left:50%;transform:translateX(-50%);z-index:30;background:#121b23ee;border:1px solid #b18b3b;padding:12px 18px;color:#e0e6e9;font:13px sans-serif;max-width:80vw;display:none';
  const message = document.createElement('div'), buttons = document.createElement('div'); buttons.style.cssText = 'display:flex;gap:6px;margin-top:8px;flex-wrap:wrap'; hint.append(message, buttons); document.body.append(hint);
  let shownLift = null;
  function floorButtons(lift) {
    if (shownLift === lift) return; shownLift = lift; buttons.replaceChildren();
    if (!lift) return;
    lift.stops.forEach((y, floor) => {
      const b = document.createElement('button'); b.textContent = floor === 0 ? '地面 / 登台层' : `${floor} 层 · ${y.toFixed(1)} m`;
      b.style.cssText = 'background:#26333d;border:1px solid #697887;color:#e4e9ed;padding:6px 10px;cursor:pointer';
      b.onclick = () => ride.go(floor); buttons.append(b);
    });
  }
  document.addEventListener('keydown', e => {
    if (e.repeat || e.code !== 'KeyE' || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    if (ride.riding || ride.waiting || ride.nearest) { e.preventDefault(); e.stopPropagation(); }
    if (ride.riding) { if (!ride.freeWalking) ride.exit(); document.exitPointerLock?.(); }
    else if (ride.waiting && ride.freeWalking) ride.release();
    else if (ride.nearest) ride.board(ride.nearest.id, ride.nearest.floor);
  });
  return { ride, cameraActor, update() {
    ride.update(); const R = ride.riding, W = ride.waiting, N = ride.nearest;
    hint.style.display = R || W || N ? 'block' : 'none'; buttons.style.display = R ? 'flex' : 'none';
    floorButtons(R);
    message.textContent = R ? `${R.name} · ${R.state.moving ? '运行中' : '已平层'} · ${ride.freeWalking ? '可行走、转头；平层后直接走出 · E 释放鼠标选层' : '选择楼层 · E 离开'}`
      : W ? `${W.lift.name} 正在前往本层；可以自由走动，平层后直接走入 · E 取消叫梯`
      : N ? `${allLifts.lifts.find(lift => lift.id === N.id).name} · ${N.floor || '地面'} 层 · E 呼叫电梯，平层后走入` : '';
    // Free camera may rotate while riding; vertical motion continues to carry the eye position.
    if (R || W) { views.state.tween = null; views.state.ride = null; }
  } };
}
