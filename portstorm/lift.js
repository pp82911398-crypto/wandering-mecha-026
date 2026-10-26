// Lifts for the hangar (adapted from the old dome bay's lift tower, src/env.js buildLift):
//  - boarding lift: a cage riding the yellow mast on the west face of the maintenance tower up to cockpit
//    level, an internal crossing deck, and a 3-stage telescoping bridge out of the east face to the visor;
//  - control-room lift: an open steel shaft with glazing in front of the control-room mezzanine (2 stops).
// No hinges anywhere: the bridge stages slide on each other, the cages ride guide rails, counterweights move opposite.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const box = (arr, w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); arr.push(g); };
function mesh(parts, mat, shadow = true) { const m = new THREE.Mesh(mergeGeometries(parts), mat); m.castShadow = shadow; m.receiveShadow = true; return m; }
const mats = () => ({
  frame: new THREE.MeshStandardMaterial({ color: 0x2d3337, roughness: 0.5, metalness: 0.6 }),
  grate: new THREE.MeshStandardMaterial({ color: 0x4a5054, roughness: 0.65, metalness: 0.5 }),
  yellow: new THREE.MeshStandardMaterial({ color: 0xc79a22, roughness: 0.55, metalness: 0.25 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x15191b, roughness: 0.7, metalness: 0.4 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x9fb8c4, roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.22, depthWrite: false }),
  lamp: new THREE.MeshStandardMaterial({ color: 0x552200, emissive: 0xffa040, emissiveIntensity: 2.2 }),
});

// open cage: floor, corner posts, roof frame, mid rails, gate bar; origin at floor top centre
function cage(M, w, d, h, openFront = false) {
  const g = new THREE.Group(), f = [], y = [];
  box(f, w, 0.25, d, 0, -0.125, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(f, 0.16, h, 0.16, sx * (w / 2 - 0.08), h / 2, sz * (d / 2 - 0.08));
  for (const yy of [h, 1.1]) { for (const sz of [-1, 1]) { if (openFront && yy === 1.1 && sz === -1) continue; box(y, w, 0.08, 0.08, 0, yy, sz * (d / 2 - 0.08)); } for (const sx of [-1, 1]) box(y, 0.08, 0.08, d, sx * (w / 2 - 0.08), yy, 0); }
  box(f, w, 0.12, d, 0, h, 0);                                                       // roof plate
  g.add(mesh(f, M.frame), mesh(y, M.yellow, false));
  const l = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.5), M.lamp); l.position.set(0, h - 0.08, 0); g.add(l);
  return g;
}

// ------------------------------------------------------------------ boarding lift + bridge
// T: tower centre (tx, tz), height th (8×8 lattice, corner posts at ±4). The cage rides INSIDE the tower in its
// west half; at cockpit level the rider steps east onto a landing (east half) and out onto the bridge, which
// telescopes from the east face to the visor. stopY: deck-top level; bridgeZ: bridge centre line; tipX: tip x when out.
export function buildBoardingLift(root, { tx, tz, th, stopY, bridgeZ, tipX }) {
  const M = mats(), G = new THREE.Group(); G.name = 'boardingLift'; root.add(G);
  const fixed = [], fixedY = [];
  const cx = tx - 1.8;                                                                   // shaft centre (west half)
  for (const dz of [-1.75, 1.75]) box(fixed, 0.22, th - 1, 0.22, tx - 3.55, (th - 1) / 2 + 0.6, tz + dz);   // guide rails on the west posts' line
  box(fixed, 0.6, 0.6, 3.8, tx - 3.55, th - 0.6, tz);                                    // hoist beam at the top
  box(fixed, 4.0, 0.3, 3.0, tx + 2.0, stopY - 0.15, bridgeZ);                            // landing, east half
  // landing support: east end sits on the east-face beam (y 40), west end hangs from a cross beam at y 45
  box(fixed, 0.35, 0.35, 8.8, tx + 0.1, 45, tz);
  for (const sz of [-1, 1]) {
    box(fixed, 0.12, 45 - stopY, 0.12, tx + 0.1, (45 + stopY) / 2, bridgeZ + sz * 1.35);
    box(fixed, 4.4, 0.3, 0.25, tx + 2.0, Math.min(stopY - 0.45, 40.33), bridgeZ + sz * 1.35);
    box(fixedY, 4.0, 0.08, 0.08, tx + 2.0, stopY + 1.1, bridgeZ + sz * 1.55);            // landing rails
  }
  G.add(mesh(fixed, M.frame), mesh(fixedY, M.yellow, false));

  const C = cage(M, 3.0, 3.2, 2.6); G.add(C);
  const cw = new THREE.Mesh(new THREE.BoxGeometry(0.6, 3.6, 1.2), M.dark); cw.castShadow = true; G.add(cw);   // counterweight, NW corner
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 5), M.dark); G.add(cable);

  // telescoping bridge: 3 stages sliding along +x, each a touch lower and narrower than the one before
  const x0 = tx + 4.1, span = tipX - x0, n = 3, ov = 0.8, Ls = (span + ov * (n - 1)) / n;
  const stages = [];
  for (let i = 0; i < n; i++) {
    const w = 2.8 - i * 0.22, dy = -i * 0.16, s = new THREE.Group(), f = [], y = [];
    box(f, Ls, 0.34, w, Ls / 2, dy - 0.17, 0);                                         // deck
    for (const sz of [-1, 1]) {
      box(f, Ls, 0.4, 0.14, Ls / 2, dy - 0.45, sz * (w / 2 - 0.07));                    // side stringers
      box(y, Ls, 0.08, 0.08, Ls / 2, dy + 1.1, sz * (w / 2 - 0.05));                    // handrail
      for (let k = 0; k <= 3; k++) box(y, 0.08, 1.1, 0.08, k * Ls / 3, dy + 0.55, sz * (w / 2 - 0.05));
    }
    if (i === n - 1) box(f, 0.4, 0.5, w, Ls - 0.2, dy - 0.1, 0);                        // rubber nose bumper
    if (i === 0) {                                                                       // under-truss: the root stage is a cantilever
      box(f, Ls, 0.14, 0.14, Ls / 2, -1.6, 0);
      for (let k = 0; k <= 4; k++) box(f, 0.14, 1.0, 0.14, k * Ls / 4, -1.1, 0);
    }
    s.add(mesh(f, M.grate), mesh(y, M.yellow, false));
    s.position.set(x0, stopY, bridgeZ); G.add(s); stages.push(s);
  }

  const api = { cage: 0, bridge: 1, stops: [0.3, stopY], tipX, x0, span, cageX: cx, tz, bridgeZ, landingX: tx + 2.0, cagePos: () => C.position };
  api.set = (cageT, bridgeE) => {
    api.cage = cageT; api.bridge = bridgeE;
    const y = api.stops[0] + (api.stops[1] - api.stops[0]) * cageT;
    C.position.set(cx, y, tz);
    cw.position.set(tx - 3.4, th - 2.4 - (y - api.stops[0]) * 0.92, tz + 3.0);
    const top = th - 0.9; cable.scale.y = Math.max(0.1, top - (y + 2.6)); cable.position.set(cx, (top + y + 2.6) / 2, tz);
    for (let i = 0; i < n; i++) stages[i].position.x = x0 + i * (Ls - ov) * bridgeE;
  };
  api.set(0, 1);
  api.group = G;
  return api;
}

// ------------------------------------------------------------------ control-room lift
// CR: control room box (x0,x1,z0,z1,y0); front edge of the mezzanine at zMez
export function buildControlLift(root, { x, zMez, y0, openFront = false }) {
  const M = mats(), G = new THREE.Group(); G.name = 'controlLift'; root.add(G);
  const S = 4.4, H = y0 + 7.5, z = zMez + 0.2 + S / 2;
  const f = [], gl = [], yl = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(f, 0.3, H, 0.3, x + sx * S / 2, H / 2, z + sz * S / 2);
  for (let yy = 3; yy < H; yy += 3.5) {
    for (const sz of [-1, 1]) box(f, S, 0.2, 0.2, x, yy, z + sz * S / 2);
    for (const sx of [-1, 1]) box(f, 0.2, 0.2, S, x + sx * S / 2, yy, z);
  }
  box(f, S + 0.6, 0.5, S + 0.6, x, H, z);                                              // machine-room cap
  box(f, S + 1.2, 0.4, S + 1.2, x, 0.2, z);                                            // pit plinth
  box(f, S - 0.6, 0.3, 0.6, x, y0 - 0.144, zMez + 0.1);   // +6 mm over the mezzanine                                 // landing sill to the mezzanine
  // glazing on the three open sides (back side opens onto the mezzanine)
  box(gl, S - 0.3, H - 1.2, 0.05, x, (H - 1.2) / 2 + 0.6, z + S / 2);
  for (const sx of [-1, 1]) box(gl, 0.05, H - 1.2, S - 0.3, x + sx * S / 2, (H - 1.2) / 2 + 0.6, z);
  box(yl, S + 0.2, 0.3, 0.12, x, 0.9, z + S / 2 + 0.2);                                // kick rail
  G.add(mesh(f, M.frame), mesh(yl, M.yellow, false));
  const gm = new THREE.Mesh(mergeGeometries(gl), M.glass); gm.renderOrder = 2; G.add(gm);
  const C = cage(M, S - 0.8, S - 0.8, 2.6, openFront); C.name = 'controlLiftCage'; G.add(C);
  const api = { cage: 0, stops: [0.45, y0] };
  api.set = t => { api.cage = t; C.position.set(x, api.stops[0] + (api.stops[1] - api.stops[0]) * t, z); };
  api.set(0); api.group = G;
  return api;
}

// tiny tween helper: drive any api.set(...) toward targets at a fixed speed (units of t per second)
export function liftAnimator() {
  const jobs = [];
  return {
    go(get, set, to, speed = 0.12) { jobs.push({ get, set, to, speed }); },
    update(dt) {
      for (let i = jobs.length - 1; i >= 0; i--) {
        const j = jobs[i], v = j.get(), d = j.to - v, st = j.speed * dt;
        if (Math.abs(d) <= st) { j.set(j.to); jobs.splice(i, 1); } else j.set(v + Math.sign(d) * st);
      }
    },
    busy: () => jobs.length > 0,
  };
}

// ------------------------------------------------------------------ retractable work decks (old dome "side cantilevers")
// Two-stage decks on a tower face: a fixed root stage, and a moving stage that slides out underneath it toward the
// machine. dir = +1 (decks point +x) or -1. faceX: tower face; levels: deck heights; reach: fixed stage length,
// travel: how far the moving stage runs out past the fixed one.
export function buildCantilevers(root, { faceX, z, dir, levels, reach = 5, travel = 5, width = 6.2 }) {
  const M = mats(), G = new THREE.Group(); G.name = 'cantilevers'; root.add(G);
  const fixed = [], rails = [], movers = [];
  for (const y of levels) {
    const xm = faceX + dir * reach / 2;
    box(fixed, reach, 0.4, width, xm, y, z);
    for (const dz of [-1, 1]) {
      box(rails, reach, 0.1, 0.1, xm, y + 1.0, z + dz * (width / 2));
      for (let i = 0; i <= 2; i++) box(rails, 0.1, 0.95, 0.1, faceX + dir * reach * i / 2, y + 0.5, z + dz * (width / 2));
      box(fixed, reach, 0.35, 0.3, xm, y - 0.42, z + dz * (width / 2 - 0.3));     // guide channels the mover runs in
    }
    const g = new THREE.Group(), f = [], r = [];
    box(f, travel + 0.6, 0.3, width - 0.8, dir * (travel + 0.6) / 2, 0, 0);
    for (const dz of [-1, 1]) {
      box(r, travel + 0.6, 0.1, 0.1, dir * (travel + 0.6) / 2, 1.25, dz * (width / 2 - 0.45));
      for (let i = 0; i <= 2; i++) box(r, 0.1, 1.2, 0.1, dir * (0.3 + travel * i / 2), 0.65, dz * (width / 2 - 0.45));
    }
    box(f, 0.3, 0.5, width - 0.8, dir * (travel + 0.45), 0.05, 0);                    // end bumper
    g.add(mesh(f, M.grate), mesh(r, M.yellow, false));
    g.userData = { x0: faceX, x1: faceX + dir * reach, y: y - 0.36 };
    G.add(g); movers.push(g);
  }
  G.add(mesh(fixed, M.grate), mesh(rails, M.yellow, false));
  const api = { e: 1 };
  api.set = e => { api.e = e; for (const g of movers) { const u = g.userData; g.position.set(u.x0 + (u.x1 - u.x0) * e, u.y, z); } };
  api.set(1); api.group = G;
  return api;
}

// plain lattice tower (same language as the left maintenance tower) for the right side of the bay
export function buildLatticeTower(root, { x, z, h, w = 8 }) {
  const M = mats(), f = [], y2 = [], hw = w / 2;
  box(f, w + 3, 1.4, w + 3, x, 0.7, z);
  for (const sx of [-hw, hw]) for (const sz of [-hw, hw]) box(f, 0.8, h, 0.8, x + sx, h / 2, z + sz);
  for (let y = 5; y < h; y += 5) {
    for (const sz of [-hw, hw]) box(f, w + 0.8, 0.35, 0.35, x, y, z + sz);
    for (const sx of [-hw, hw]) box(f, 0.35, 0.35, w + 0.8, x + sx, y, z);
  }
  const diag = [];
  for (let y = 5; y < h; y += 5) for (const sg of [-1, 1]) for (const sz of [-hw, hw]) {
    const g = new THREE.BoxGeometry(Math.hypot(w, 5), 0.14, 0.14); g.rotateZ(sg * Math.atan2(5, w)); g.translate(x, y - 2.5, z + sz); diag.push(g);
  }
  box(y2, 2.6, h - 2, 2.8, x + hw + 1.6, (h - 2) / 2 + 0.6, z);   // kept clear of the gantry rail at x 38                         // stair/lift column on the outer side
  box(f, 3.6, 2.8, 3.8, x, h + 1.4, z);
  const G = new THREE.Group(); G.name = 'rightTower';
  G.add(mesh([...f, ...diag], M.frame), mesh(y2, M.yellow));
  root.add(G);
  return G;
}
