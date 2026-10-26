// Chest reactor (turbine core) detail + honeycomb grilles for every intake.
// Turbine (torso.js): centre (0, -5.86), pocket floor z 2.96-3.02, blades r 0.8-1.85 around z 3.3-3.7,
// shroud r 1.82-1.98 z 3.0-3.9, hub r 0.8 @ z 3.9 -> 0.46 @ z 4.1 -> tip z 4.18, surround ring inner wall r 2.01, face z 4.55 (r 2.13-2.43).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PAL } from './paint.js';

const CY = -5.86;
const lathe = (pts, seg = 96) => { const g = new THREE.LatheGeometry(pts.map(([r, z]) => new THREE.Vector2(r, z)), seg); g.rotateX(Math.PI / 2); g.translate(0, CY, 0); return g; };

const GLOW = new THREE.MeshStandardMaterial({ color: 0xff9a3a, emissive: 0xff7a14, emissiveIntensity: 1.1, roughness: 0.5, name: 'reactorGlow' });
export function buildReactor(parent) {
  const grp = new THREE.Group(); grp.name = 'reactorDetail';
  const mesh = (g, m, name) => { const x = new THREE.Mesh(g, m); x.name = name; x.castShadow = x.receiveShadow = true; x.userData.marking = true; grp.add(x); return x; };
  // glowing core annulus on the pocket floor, seen through the blades (z 3.02 -> 3.05)
  mesh(lathe([[0.82, 3.05], [1.78, 3.05], [1.78, 3.0], [0.82, 3.0]]), GLOW, 'reactorCoreGlow');
  // 8 stator vanes in front of the blades: inner end buried in the hub (r 0.42), outer end in the surround wall (r 2.05)
  const vanes = [];
  for (let i = 0; i < 8; i++) {
    const g = new THREE.BoxGeometry(2.05 - 0.42, 0.07, 0.12); g.translate((2.05 + 0.42) / 2, 0, 4.02);
    g.rotateZ(i / 8 * Math.PI * 2 + Math.PI / 8); g.translate(0, CY, 0); vanes.push(g);
  }
  mesh(mergeGeometries(vanes), PAL.frame, 'reactorStatorVanes');
  // hub glow ring (just proud of the hub's dark groove at z 4.12-4.14)
  mesh(lathe([[0.3, 4.15], [0.42, 4.15], [0.42, 4.11], [0.3, 4.11]], 48), GLOW, 'reactorHubGlow');
  // bolt circle on the surround-ring face (heads half buried in the face plane z 4.55)
  const bolts = [], b0 = new THREE.CylinderGeometry(0.07, 0.07, 0.12, 6); b0.rotateX(Math.PI / 2);
  for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2, g = b0.clone(); g.translate(2.28 * Math.cos(a), CY + 2.28 * Math.sin(a), 4.55); bolts.push(g); }
  mesh(mergeGeometries(bolts), PAL.frame, 'reactorFaceBolts');
  // warm light from the core onto blades and shroud
  const L = new THREE.PointLight(0xff9a2e, 1.6, 3.2, 2); L.position.set(0, CY, 3.4); L.name = 'reactorLight'; grp.add(L);
  parent.add(grp);
  grp.userData.glow = GLOW;
  return grp;
}

// ---- honeycomb: hex cell walls clipped to a convex polygon (2D, in a plane), plus a border wall.
// poly: [[x,y]...] convex, CCW; returns geometry in (x, y) with depth along z from 0 to -depth
export function honeycomb(poly, cell = 0.1, wall = 0.015, depth = 0.06) {
  const inside = (x, y) => poly.every((A, i) => { const B = poly[(i + 1) % poly.length]; return (B[0] - A[0]) * (y - A[1]) - (B[1] - A[1]) * (x - A[0]) >= -1e-6; });
  const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const r = cell / Math.sqrt(3), dx = cell, dy = 1.5 * r, segs = new Map(), parts = [];
  const seg = (a, b) => { const k = [a, b].map(p => p.map(v => Math.round(v * 1e4)).join(',')).sort().join('|'); if (!segs.has(k)) segs.set(k, [a, b]); };
  for (let j = Math.floor(y0 / dy) - 1; j * dy <= y1 + dy; j++) for (let i = Math.floor(x0 / dx) - 1; i * dx <= x1 + dx; i++) {
    const cx = i * dx + (j & 1 ? dx / 2 : 0), cy = j * dy;
    const v = [...Array(6)].map((_, k) => { const a = Math.PI / 6 + k * Math.PI / 3; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });
    for (let k = 0; k < 6; k++) { const a = v[k], b = v[(k + 1) % 6]; if (inside(...a) && inside(...b)) seg(a, b); }
  }
  for (let i = 0; i < poly.length; i++) seg(poly[i], poly[(i + 1) % poly.length]);   // border
  const bar = (a, b, w) => { const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const g = new THREE.BoxGeometry(L + w, w, depth);
    g.rotateZ(Math.atan2(b[1] - a[1], b[0] - a[0])); g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, -depth / 2); return g; };
  for (const [a, b] of segs.values()) parts.push(bar(a, b, wall));
  return mergeGeometries(parts.map(g => g.toNonIndexed()));
}

// honeycomb inside every hood vent (mouth plane = local y 0, opening toward -y; x across, z = height off the plate)
export function ventHoneycombs(root) {
  let n = 0;
  root.traverse(g => {
    if (!/^vent:/.test(g.name) || !g.userData.mouth) return;
    const { w, wt, h, t } = g.userData.mouth, e = 0.004;
    const poly = [[-w / 2 + t - e, 0.005], [w / 2 - t + e, 0.005], [wt / 2 - t + e, h - t + e], [-wt / 2 + t - e, h - t + e]];
    const cell = Math.max(0.05, Math.min(0.1, w / 9));
    const geo = honeycomb(poly, cell, cell * 0.16, 0.05);
    geo.rotateX(Math.PI / 2);                    // plane (x, y) -> (x, z); depth -z -> +y (into the hood)
    geo.translate(0, 0.035, 0);
    const m = new THREE.Mesh(geo, PAL.frame); m.name = 'intakeHoneycomb'; m.userData.marking = true; m.castShadow = true; g.add(m); n++;
  });
  return n;
}

// honeycomb in the neck-front intake mouth (mesh 'exhaustThroat': mouth quad at its front, throat 0.4 deep along -z)
export function neckHoneycomb(root) {
  const th = root.getObjectByName('exhaustThroat'); if (!th) return 0;
  const p = th.geometry.attributes.position, V = [];
  for (let i = 0; i < p.count; i++) V.push(new THREE.Vector3().fromBufferAttribute(p, i));
  const zmax = Math.max(...V.map(v => v.z)); const front = [];
  for (const v of V) if (zmax - v.z < 0.2 && !front.some(f => f.distanceTo(v) < 1e-3)) front.push(v);
  // the mouth quad: front-most 4 corners (bottom pair lowest y)
  front.sort((a, b) => a.y - b.y); const bot = front.slice(0, 2).sort((a, b) => a.x - b.x), top = front.slice(-2).sort((a, b) => a.x - b.x);
  const o = bot[0].clone().add(bot[1]).multiplyScalar(0.5), tm = top[0].clone().add(top[1]).multiplyScalar(0.5);
  const X = new THREE.Vector3(1, 0, 0), Yd = tm.clone().sub(o), H = Yd.length(); Yd.normalize();
  const N = new THREE.Vector3().crossVectors(X, Yd).normalize();             // out of the mouth
  const to2 = v => { const d = v.clone().sub(o); return [d.dot(X), d.dot(Yd)]; };
  const ins = 0.03, poly = [to2(bot[0]), to2(bot[1]), to2(top[1]), to2(top[0])].map(([x, y]) => [x - Math.sign(x) * ins, Math.min(Math.max(y, ins), H - ins)]);
  const geo = honeycomb(poly, 0.12, 0.02, 0.05);   // grille frame mounted over the mouth (the throat is a dark plate flush with it)
  const m = new THREE.Mesh(geo, PAL.frame); m.name = 'intakeHoneycomb:neck'; m.userData.marking = true; m.castShadow = true;
  m.matrix.makeBasis(X, Yd, N).setPosition(o.clone().addScaledVector(N, 0.006 + 0.05)); m.matrixAutoUpdate = false;
  th.add(m);
  return { w: poly, H: +H.toFixed(2) };
}

// ======================================================================================================
// Spinning rotor. The 44 fan blades are baked into torso.js's merged 'torsoClay' mesh; they are lifted out here
// (loose parts of exactly 12 triangles lying in the blade annulus) and rebuilt with the same recipe as a rotor that
// turns about the core axis (x 0, y -5.86, along z). Hub, stator vanes and shroud stay fixed, as in a real fan.
// Light: core glow + point light follow the speed with a slight pulse; a rotating ray disc behind the blades
// (chopped by them -> strobing); a translucent blur disc fades in at speed.
// ======================================================================================================
import { components } from './paint.js';

export function extractBlades(torso) {
  const m = torso.getObjectByName('torsoClay'); if (!m) return 0;
  let g = m.geometry; if (g.index) g = g.toNonIndexed();
  const pos = g.attributes.position, v = new THREE.Vector3(), drop = new Set();
  for (const c of components(g)) {
    if (c.length !== 12) continue;
    let ok = true;
    for (const t of c) for (let k = 0; k < 3 && ok; k++) { v.fromBufferAttribute(pos, 3 * t + k); const r = Math.hypot(v.x, v.y - CY); if (r < 0.7 || r > 1.9 || v.z < 3.1 || v.z > 3.9) ok = false; }
    if (ok) c.forEach(t => drop.add(t));
  }
  const keep = [], nT = pos.count / 3; for (let t = 0; t < nT; t++) if (!drop.has(t)) keep.push(t);
  const out = new THREE.BufferGeometry();
  for (const [name, a] of Object.entries(g.attributes)) {
    const n = a.itemSize, dst = new a.array.constructor(keep.length * 3 * n);
    keep.forEach((t, j) => { for (let k = 0; k < 3 * n; k++) dst[j * 3 * n + k] = a.array[t * 3 * n + k]; });
    out.setAttribute(name, new THREE.BufferAttribute(dst, n));
  }
  m.geometry = out;
  return drop.size / 12;
}

export function buildRotor(reactor) {
  const rotor = new THREE.Group(); rotor.name = 'reactorRotor'; rotor.position.set(0, CY, 0);
  const NB = 44, parts = [];
  for (let i = 0; i < NB; i++) { const g = new THREE.BoxGeometry(1.05, 0.05, 0.42); g.rotateX(0.55); g.translate(1.32, 0, 3.5); g.rotateZ(i / NB * Math.PI * 2); parts.push(g.toNonIndexed()); }
  // blade root ring (blades are carried by it; it sits inside the fixed hub radius 0.8 behind the hub face)
  const ring = new THREE.CylinderGeometry(0.84, 0.84, 0.36, 48, 1, true); ring.rotateX(Math.PI / 2); ring.translate(0, 0, 3.5);
  const blades = new THREE.Mesh(mergeGeometries(parts), PAL.armor2); blades.name = 'reactorBlades'; blades.castShadow = blades.receiveShadow = true;
  const root = new THREE.Mesh(ring, PAL.frame); root.name = 'reactorBladeRoot';
  rotor.add(blades, root);

  // rotating ray disc behind the blades (additive, drives bloom)
  const rays = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uAng: { value: 0 }, uI: { value: 0 }, uT: { value: 0 } },
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float uAng, uI, uT; varying vec2 vP;
      void main(){ float r = length(vP), a = atan(vP.y, vP.x);
        float rays = pow(0.5 + 0.5 * cos(6.0 * (a - uAng)), 6.0) + 0.5 * pow(0.5 + 0.5 * cos(11.0 * (a + uAng * 0.6) + 1.3), 10.0);
        float band = smoothstep(0.75, 0.95, r) * (1.0 - smoothstep(1.55, 1.85, r));
        float pulse = 0.85 + 0.15 * sin(uT * 7.0 + r * 9.0);
        vec3 c = vec3(1.0, 0.55, 0.16) * (0.35 + rays) * band * pulse * uI;
        gl_FragColor = vec4(c, 1.0); }`,
  });
  const rayDisc = new THREE.Mesh(new THREE.CircleGeometry(1.86, 96), rays); rayDisc.name = 'reactorRays'; rayDisc.position.set(0, CY, 3.07); rayDisc.userData.marking = true;
  // speed blur: translucent disc in the blade plane
  const blurMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.6, roughness: 0.4, transparent: true, opacity: 0, depthWrite: false });
  const blur = new THREE.Mesh(new THREE.RingGeometry(0.84, 1.84, 96), blurMat); blur.name = 'reactorBlur'; blur.position.set(0, CY, 3.52); blur.userData.marking = true;
  reactor.add(rotor, rayDisc, blur);

  const glow = reactor.userData.glow, light = reactor.getObjectByName('reactorLight');
  const S = { target: 0.6, speed: 0, ang: 0, t: 0, lamp: 1 };
  S.update = (dt) => {
    S.t += dt;
    S.speed += (S.target - S.speed) * Math.min(1, dt * 0.8);                 // slow spool up / down
    const w = S.speed * 14;                                                  // rad/s at full speed (~2.2 rev/s)
    S.ang += w * dt; rotor.rotation.z = -S.ang;
    const pulse = 1 + 0.06 * Math.sin(S.t * 5.3) + 0.03 * Math.sin(S.ang * 44);
    const lvl = (0.4 + 0.4 * S.speed) * pulse * S.lamp;
    glow.emissiveIntensity = 1.1 * lvl;
    light.intensity = 1.1 * lvl;
    rays.uniforms.uAng.value = -S.ang * 0.5; rays.uniforms.uT.value = S.t; rays.uniforms.uI.value = (0.1 + 0.5 * S.speed * S.speed) * S.lamp;
    blurMat.opacity = 0.5 * Math.max(0, S.speed - 0.35) / 0.65;
  };
  reactor.userData.rotor = S;
  return S;
}
