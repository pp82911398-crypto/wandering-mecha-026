import * as THREE from 'three';
import { Batch, cyl, tube } from '../src/kit.js';
import { liftGo } from '../src/env.js?v=dome-crane-depth-20261023e';

const V3 = THREE.Vector3, box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
export const liftGlass = new THREE.MeshStandardMaterial({ name: 'paleAmberLiftGlass', color: 0xf3dda0,
  metalness: .12, roughness: .18, transparent: true, opacity: .17, depthWrite: false, side: THREE.DoubleSide });
const deck = (B, m, w, h, d, p) => B.add(box(w, h, d), m.deck || m.grate, p);

export function cabinGlass(parent, { w, d, h, x = 0, z = 0, bottom = .32 }) {
  const B = new Batch();
  B.add(box(w, h - bottom, .025), liftGlass, [x, (h + bottom) / 2, z + d / 2]);
  for (const s of [-1, 1]) B.add(box(.025, h - bottom, d), liftGlass, [x + s * w / 2, (h + bottom) / 2, z]);
  const g = B.build(false); g.name = 'paleAmberCabinGlazing'; g.userData.noCollision = true; parent.add(g); return g;
}

export function stairs(parent, m, { start, end, width = 1.65, name = 'crawlerAccessStairs' }) {
  const a = new V3(...start), b = new V3(...end), delta = b.clone().sub(a), rise = b.y - a.y;
  const run = Math.hypot(delta.x, delta.z), n = Math.ceil(rise / .15), yaw = Math.atan2(delta.x, delta.z);
  const B = new Batch(), right = new V3(delta.z / run, 0, -delta.x / run);
  for (let i = 0; i < n; i++) {
    const p = a.clone().lerp(b, (i + .5) / n), y = a.y + rise * (i + 1) / n;
    B.add(box(width, y, run / n + .035), m.deck || m.grate, [p.x, y / 2, p.z], [0, yaw, 0]);
    B.add(box(width, .012, .045), m.yellow, [p.x, y + .006, p.z], [0, yaw, 0]);
  }
  for (const s of [-1, 1]) {
    const lo = a.clone().addScaledVector(right, s * (width / 2 + .06)), hi = b.clone().addScaledVector(right, s * (width / 2 + .06));
    B.add(tube([[lo.x, a.y + 1.05, lo.z], [hi.x, b.y + 1.05, hi.z]], .025, 1, 6), m.yellow);
    for (let i = 0; i <= 10; i++) {
      const p = lo.clone().lerp(hi, i / 10); B.add(cyl(.025, .025, 1.05, 6), m.yellow, [p.x, a.y + rise * i / 10 + .525, p.z]);
    }
  }
  const group = B.build(); group.name = name; parent.add(group);
  return { root: parent, group, start: a, end: b, steps: n, rise: rise / n };
}

function panel(parent, m, x, y, z, name) {
  const B = new Batch();
  B.add(box(.12, .85, .12), m.steel, [x, y + .425, z]);
  B.add(box(.34, .46, .22), m.dark, [x, y + 1.08, z]);
  B.add(box(.26, .14, .025), m.yellow, [x, y + 1.2, z - .125]);
  for (const dx of [-.065, .065]) B.add(cyl(.038, .038, .025, 10), m.led, [x + dx, y + 1.04, z - .135], [Math.PI / 2, 0, 0]);
  const group = B.build(false); group.name = name; parent.add(group); return group;
}

function gate(parent, m, { x = 0, y = 0, z = 0, width = 2.45, glass = false }) {
  const root = new THREE.Group(); root.name = 'liftGate'; root.position.set(x, y, z); parent.add(root);
  const halves = [-1, 1].map(side => {
    const B = new Batch(), half = width / 2;
    for (const h of [.55, 1.1]) B.add(box(half, .055, .055), m.yellow, [0, h, 0]);
    for (const xx of [-half / 2, half / 2]) B.add(box(.055, 1.1, .055), m.yellow, [xx, .55, 0]);
    const leaf = B.build(false); leaf.name = 'liftGateLeaf'; root.add(leaf);
    if (glass) { const mesh = new THREE.Mesh(box(half - .1, .95, .02), liftGlass); mesh.position.y = .58; mesh.userData.noCollision = true; leaf.add(mesh); }
    return { leaf, side };
  });
  let open = 0;
  return { root, get open() { return open; }, update(dt, docked) {
    open += THREE.MathUtils.clamp((docked ? 1 : 0) - open, -dt * 2.5, dt * 2.5);
    halves.forEach(({ leaf, side }) => {
      // Double sliding leaves: the yellow frame and the glass move together to the two sides.
      leaf.position.x = side * (width / 4 + open * (width / 2 + .15));
      leaf.visible = true;
      leaf.userData.collisionEnabled = open < .35;
    });
  } };
}

export function containsCabin(cage, position, { x = 0, z = 0, w = 3.6, d = 3.6, floor = 0 } = {}) {
  cage.updateWorldMatrix(true, false); const p = cage.worldToLocal(position.clone());
  return Math.abs(p.x - x) < w / 2 - .1 && Math.abs(p.z - z) < d / 2 - .1 && p.y > floor - .7 && p.y < floor + .8;
}

export function galleryLandingAccess(lift, m) {
  const entries = lift.stops.map((y, floor) => {
    const g = gate(lift.root, m, { y, z: -2.65, width: 3.05 });
    const bridge = new THREE.Mesh(box(3.05, .09, 1.35), m.deck || m.grate);
    bridge.position.set(0, y - .039, -2.05); lift.root.add(bridge);   // +6 mm over the gallery deck
    return { floor, g, bridge };
  });
  const B = new Batch();
  // Three ordinary steps to the ground-level sill; the original .45 m plinth was too tall to walk onto.
  for (let i = 0; i < 3; i++) deck(B, m, 3.05, .15 * (i + 1), .38, [0, .075 * (i + 1), -3.72 + .38 * i]);
  lift.root.add(B.build());
  return dt => entries.forEach(({ floor, g, bridge }) => {
    const docked = Math.abs(lift.state.y - lift.stops[floor]) < .05 && (!lift.state.moving || Math.abs(lift.state.target - lift.state.y) < .02);
    g.update(dt, docked); bridge.visible = docked;
  });
}

export function buildMobileLiftAccess(env, boarding) {
  const main = env.lift, m = env.observation[0].materials, routes = [], connectors = [], updates = [], mobile = [];
  let actorPosition = () => null;
  const onThreshold = (cage, options) => {
    const p = actorPosition(); if (!p) return false;
    cage.updateWorldMatrix(true, false); const q = cage.worldToLocal(p.clone());
    return Math.abs(q.x) < (options.w || 3.6) / 2 && Math.abs(q.y) < .7 && q.z < options.z + .45 && q.z > options.z - 1.15;
  };
  for (const [index, side] of env.observation.entries()) {
    const { root, elevator, stops, depth, baseY } = side, cage = elevator.group.getObjectByName('controlLiftCage');
    const front = depth / 2 + .6, portX = -side.side * 2.5;
    routes.push(stairs(root, m, { start: [side.side * 24.5, 0, front - 1.6], end: [side.side * 6.3, stops[0], front - 1.6], name: `observationStairs${index}` }));
    const B = new Batch(), centerX = side.side * 3.15;
    deck(B, m, 7.6, .18, 2, [centerX, stops[0] - .084, front - 1.6]);   // +6 mm over the landing
    deck(B, m, 2.7, .18, 1.8, [0, stops[0] - .078, front - .15]);   // +12 mm, above the other deck
    for (const x of [side.side * 1.5, side.side * 6]) B.add(box(.16, stops[0] - baseY, .16), m.steel, [x, (baseY + stops[0]) / 2, front - 1.6]);
    for (const x of [side.side * 1.5, side.side * 6]) B.add(cyl(.025, .025, 1.1, 6), m.yellow, [x, stops[0] + .55, front - 2.6]);
    B.add(box(6.5, .06, .06), m.yellow, [centerX, stops[0] + 1.1, front - 2.6]);
    root.add(B.build());
    const landingGates = stops.map((y, floor) => {
      panel(root, m, 2.6, y, front - .5, `observationCallPanel${index}-${floor}`);
      const door = gate(root, m, { y, z: front - .3, width: 2.5, glass: true });
      const sill = new THREE.Mesh(box(2.5, .1, 1.1), m.deck || m.grate); sill.position.set(0, y - .032, front + .1); root.add(sill);   // +18 mm over the landing
      return { floor, door, sill };
    });
    cabinGlass(cage, { w: 3.42, d: 3.42, h: 2.5 });
    const cabinDoor = gate(cage, m, { z: -1.72, width: 3.05, glass: true });
    panel(cage, m, 1.25, 0, 1.35, `observationCabinPanel${index}`);
    // The inner cantilever met the tower at a corner, with railings across that corner.
    // A full-width return connects it through the north-side pedestrian portal.
    for (const y of [24 + baseY, 44 + baseY]) {
      const cantiZ = -9.5 - root.position.z, towerFront = -depth / 2 - .3;
      const endZ = Math.max(towerFront + 1.3, cantiZ + 1.6);
      const C = new Batch(), lowZ = Math.min(cantiZ - 1.6, towerFront - .2), length = endZ - lowZ;
      deck(C, m, 4.3, .22, length, [portX, y - .11, (lowZ + endZ) / 2]);
      for (const xx of [portX - 2.15, portX + 2.15]) {
        const railEnd = Math.min(towerFront - 1, cantiZ - .7, endZ);
        if (railEnd > lowZ) {
          C.add(tube([[xx, y + 1.1, lowZ], [xx, y + 1.1, railEnd]], .03, 1, 6), m.yellow);
          for (const z of [lowZ, railEnd]) C.add(cyl(.03, .03, 1.1, 6), m.yellow, [xx, y + .55, z]);
        }
      }
      const group = C.build(); group.name = 'cantileverReturnBridge'; root.add(group);
      connectors.push({ root, y, path: [[-side.side * 6, y, cantiZ], [portX, y, cantiZ], [portX, y, towerFront + 1.8], [0, y, towerFront + 1.8]] });
    }
    const request = side.go;
    side.go = floor => {
      if (onThreshold(cage, { z: -1.8 })) return false;
      return request(floor);
    };
    const api = { root, cage, stops, id: `mobile${index + 1}`, name: side.side < 0 ? '左侧履带升降梯' : '右侧履带升降梯',
      state: side.state, go: floor => side.go(floor), cancel() { side.state.targetY = side.state.y; }, contains: p => containsCabin(cage, p),
      position(out = new V3()) { cage.updateWorldMatrix(true, false); return cage.localToWorld(out.set(0, .025, 0)); },
      landing(floor, out = new V3()) { root.updateWorldMatrix(true, false); return root.localToWorld(out.set(0, stops[floor], front - 1.1)); } };
    mobile.push(api);
    updates.push(dt => { cabinDoor.update(dt, !side.state.moving); side.state.gate = cabinDoor.open; landingGates.forEach(({ floor, door, sill }) => {
      const docked = Math.abs(side.state.y - stops[floor]) < .05 && (!side.state.moving || Math.abs(side.state.targetY - side.state.y) < .02);
      door.update(dt, docked); sill.visible = docked;
    }); });
  }
  // The central tower's existing stairs become permanent and gain a fixed call station.
  routes.push({ root: main.root, group: boarding.ground, start: new V3(0, 0, main.F - 9), end: new V3(0, main.stops[0].y, main.F + .3), steps: 36, rise: main.stops[0].y / 36 });
  panel(main.root, m, 1.15, main.stops[0].y, main.F - .8, 'mainLiftCallPanel');
  panel(main.cage, m, 1.2, 0, main.cz + 1.5, 'mainLiftCabinPanel');
  cabinGlass(main.cage, { w: main.CW - .15, d: 6.6, h: 3.05, z: main.cz });
  const shaft = new THREE.Group(); shaft.position.y = main.crawler.deckY; main.root.add(shaft);
  cabinGlass(shaft, { w: 8.8, d: 8.8, h: main.H - main.crawler.deckY, z: main.TZ, bottom: 0 });
  const groundGate = gate(main.root, m, { y: main.stops[0].y, z: main.F - .15, width: 1.5, glass: true });
  const cabinGate = gate(main.cage, m, { z: main.F, width: 3.6, glass: true });
  const ramp = new THREE.Mesh(box(2.8, .1, 1.8), m.deck || m.grate);
  ramp.rotation.x = -Math.atan2(.45, 1.7); ramp.position.set(0, -.225 - .05, main.F + .05); main.cage.add(ramp);
  main.canTravel = () => cabinGate.open < .001;
  const primaryState = { get y() { return main.y; }, get floor() { return main.stop; },
    get moving() { return main.phase !== 'idle'; }, get gate() { return cabinGate.open; } };
  const primary = { root: main.root, cage: main.cage, id: 'mobile0', name: '中央登机升降台',
    stops: main.stops.map(s => s.y), state: primaryState, callableFloor: floor => floor === 0,
    go(floor) {
      if (onThreshold(main.cage, { z: main.F, w: 3.8 })) return false;
      const p = actorPosition();
      if (p) { main.cage.updateWorldMatrix(true, false); const q = main.cage.worldToLocal(p.clone()); if (Math.abs(q.x) < 2 && q.z < main.F - .25 && q.y > -1.5) return false; }
      if (main.stop === floor && main.phase === 'idle' && Math.abs(main.x) < .005) return true;
      return liftGo(main, floor);
    },
    cancel() { let best = 0; main.stops.forEach((s, i) => { if (Math.abs(s.y - main.y) < Math.abs(main.stops[best].y - main.y)) best = i; }); liftGo(main, best); },
    contains: p => containsCabin(main.cage, p, { z: main.cz, w: main.CW, d: 6.8 }),
    position(out = new V3()) { main.cage.updateWorldMatrix(true, false); return main.cage.localToWorld(out.set(0, 0, main.cz)); },
    landing(floor, out = new V3()) { main.root.updateWorldMatrix(true, false); return main.root.localToWorld(out.set(0, main.stops[floor].y, main.F - 1)); } };
  mobile.unshift(primary);
  updates.push(dt => { groundGate.update(dt, main.phase === 'idle' && Math.abs(main.y - main.stops[0].y) < .03);
    cabinGate.update(dt, main.phase === 'idle'); });
  return { lifts: mobile, primary, routes, connectors, glassLiftCount: 3,
    setActor(getPosition) { actorPosition = getPosition; }, update(dt) { updates.forEach(update => update(dt)); } };
}
