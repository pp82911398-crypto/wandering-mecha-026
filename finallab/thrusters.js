// Propulsion: the two back thrusters swing out (hinged on the spine channel near their tops, bottoms swinging back,
// so the exhaust clears the hips), a fan of thick folding plates closing the gap on each outer side; big layered flames from the
// back nozzles, flush nozzles in both soles and in the five-finger palms; hover lifts the whole machine.
import * as THREE from 'three';
import { buildBladeFire } from './bladeFire.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { components } from './paint.js';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';

const V3 = THREE.Vector3;
const TH = { cx: 1.2, top: 2.7, front: -2.7, nozzleY: -9.2, nozzleZ: -3.55 };

// ---------- 1) lift the thrusters out of torso.js (must run before paint) ----------
// whole meshes thruster±1 / thrusterSeam±1, plus loose parts of the merged torso meshes lying entirely on one side
// inside the thruster column (|x| 0.35-2.15, y -9.6..2.8, z <= -2.62: grilles, fins, plate, bolts, nozzle, actuators)
export function extractThrusters(torso) {
  const out = { R: [], L: [], moved: 0 };
  const sideOf = (b) => { if (b.max.z > -2.62 || b.min.y < -9.6 || b.max.y > 2.8) return 0;
    if (b.min.x >= 0.35 && b.max.x <= 2.15) return 1; if (b.max.x <= -0.35 && b.min.x >= -2.15) return -1; return 0; };
  for (const name of ['thruster1', 'thrusterSeam1', 'thruster-1', 'thrusterSeam-1']) {
    const m = torso.getObjectByName(name); if (!m) continue;
    out[name.includes('-1') ? 'L' : 'R'].push({ geo: m.geometry, mat: m.material, name: m.name }); m.removeFromParent(); out.moved++;
  }
  for (const name of ['torsoClay', 'torsoDark', 'torsoRods']) {
    const m = torso.getObjectByName(name); if (!m) continue;
    let g = m.geometry; if (g.index) g = g.toNonIndexed();
    const pos = g.attributes.position, v = new V3(), take = { 1: [], [-1]: [] }, drop = new Set();
    for (const c of components(g)) {
      const b = new THREE.Box3(); for (const t of c) for (let k = 0; k < 3; k++) b.expandByPoint(v.fromBufferAttribute(pos, 3 * t + k));
      const s = sideOf(b); if (!s) continue; take[s].push(...c); c.forEach(t => drop.add(t));
    }
    const pick = (tris) => { const o = new THREE.BufferGeometry();
      for (const [an, a] of Object.entries(g.attributes)) { const n = a.itemSize, dst = new a.array.constructor(tris.length * 3 * n);
        tris.forEach((t, j) => { for (let k = 0; k < 3 * n; k++) dst[j * 3 * n + k] = a.array[t * 3 * n + k]; }); o.setAttribute(an, new THREE.BufferAttribute(dst, n)); }
      return o; };
    const keep = []; for (let t = 0; t < pos.count / 3; t++) if (!drop.has(t)) keep.push(t);
    if (take[1].length) out.R.push({ geo: pick(take[1]), mat: m.material, name: 'thrusterParts:' + name });
    if (take[-1].length) out.L.push({ geo: pick(take[-1]), mat: m.material, name: 'thrusterParts:' + name });
    m.geometry = pick(keep); out.moved += drop.size;
  }
  // re-mount each side on a gimbal at the column's top-inner corner, carried by a mast on the spine channel top:
  // splay (about z: bottom swings outward, "wings") -> back swing (about x) -> column
  out.pivots = {};
  for (const [id, s] of [['R', 1], ['L', -1]]) {
    const H = new V3(s * 0.5, 2.6, -3.2);
    const splay = new THREE.Group(); splay.name = 'thrusterSplay' + id; splay.position.copy(H);
    const pivot = new THREE.Group(); pivot.name = 'thrusterPivot' + id; splay.add(pivot);
    const inner = new THREE.Group(); inner.position.copy(H).multiplyScalar(-1); pivot.add(inner);
    for (const p of out[id]) { const m = new THREE.Mesh(p.geo, p.mat); m.name = p.name; inner.add(m); }
    torso.add(splay); out.pivots[id] = { splay, pivot, inner, s, H };
  }
  return out;
}

// ---------- flame ----------
const FLAME_VS = `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
  void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`;
const FLAME_FS = `uniform float uT, uI, uSeed; uniform vec3 uHot, uCool; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
  float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
  void main(){
    float t = vUv.y;                                                    // 0 at the nozzle -> 1 at the tip
    float facing = abs(dot(normalize(vN), normalize(vV)));
    float body = pow(facing, 1.6) * pow(1.0 - t, 1.25);
    float turb = 0.65 + 0.35 * n(vec2(vUv.x * 9.0 + uSeed, t * 7.0 - uT * 9.0));
    float shock = 0.8 + 0.35 * pow(0.5 + 0.5 * sin(t * 34.0 - uT * 3.0), 6.0) * (1.0 - t);   // diamonds near the nozzle
    vec3 col = mix(uHot, uCool, smoothstep(0.05, 0.75, t));
    gl_FragColor = vec4(col * body * turb * shock * uI, 1.0);
  }`;
// unit flame along -y (length 1, radius ~1), lathe profile flares a little then tapers
function flameGeo(r0 = 0.55) {
  const pts = [[r0, 0], [r0 * 1.25, -0.08], [r0 * 1.35, -0.22], [r0 * 1.1, -0.5], [r0 * 0.6, -0.78], [0.02, -1.0]].map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(pts, 40);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, -g.attributes.position.getY(i));   // v = distance along
  return g;
}
const FG = flameGeo();
function makeFlame(name, width, length, hot = 0xfff1c9, cool = 0xff5a12) {
  const layer = (wk, lk, inten, h, c) => {
    const mat = new THREE.ShaderMaterial({ vertexShader: FLAME_VS, fragmentShader: FLAME_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uT: { value: 0 }, uI: { value: 0 }, uSeed: { value: Math.random() * 50 }, uHot: { value: new THREE.Color(h) }, uCool: { value: new THREE.Color(c) } } });
    const m = new THREE.Mesh(FG, mat); m.userData = { wk, lk, inten, marking: true }; m.frustumCulled = false; return m; };
  const g = new THREE.Group(); g.name = 'flame:' + name;
  const layers = [layer(1.0, 1.0, 1.1, 0xffc070, cool), layer(0.62, 0.72, 2.0, hot, 0xff8a2a), layer(0.3, 0.42, 3.2, 0xffffff, 0xffd59a)];
  layers.forEach(l => g.add(l));
  const light = new THREE.PointLight(0xff8a30, 0, length * 3.2, 2); light.position.y = -length * 0.25; g.add(light);
  g.userData = { width, length, layers, light, seed: Math.random() * 10 };
  g.update = (thrust, t) => {
    const fl = 1 + 0.06 * Math.sin(t * 37 + g.userData.seed) + 0.04 * Math.sin(t * 61 + g.userData.seed * 3);
    g.visible = thrust > 0.01;
    for (const l of layers) { const L = length * (0.35 + 0.65 * thrust) * l.userData.lk * fl, W = width * l.userData.wk * (0.8 + 0.2 * thrust);
      l.scale.set(W, L, W); l.material.uniforms.uT.value = t; l.material.uniforms.uI.value = l.userData.inten * Math.min(1, thrust * 1.6); }
    light.intensity = 30 * thrust * fl * width; light.distance = length * 3.2;
  };
  return g;
}

// flush round nozzle: frame ring + dark throat + hot glow disc; axis = local -y (exhaust direction)
const heatMat = new THREE.MeshStandardMaterial({ color: 0x331100, emissive: 0xff6a10, emissiveIntensity: 0, roughness: 0.6, name: 'nozzleHeat' });
function roundNozzle(name, r, depth, PAL) {
  const g = new THREE.Group(); g.name = 'nozzle:' + name;
  const ring = new THREE.LatheGeometry([[r * 0.72, -0.004], [r, -0.004], [r, depth], [r * 0.72, depth]].map(([a, b]) => new THREE.Vector2(a, b)), 32);
  const rm = new THREE.Mesh(ring, PAL.frame); rm.name = 'nozzleRing:' + name;
  const throat = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.72, r * 0.72, depth * 0.9, 24, 1, true), PAL.dark); throat.position.y = depth * 0.45; throat.name = 'nozzleThroat:' + name;
  const disc = new THREE.Mesh(new THREE.CircleGeometry(r * 0.7, 24), heatMat); disc.rotation.x = Math.PI / 2; disc.position.y = depth * 0.6; disc.name = 'nozzleHeat:' + name;
  // three guide vanes across the throat
  for (let i = 0; i < 3; i++) { const v = new THREE.Mesh(new THREE.BoxGeometry(r * 1.44, depth * 0.5, 0.03), PAL.frame); v.position.y = depth * 0.3; v.rotation.y = i * Math.PI / 3; g.add(v); }
  g.add(rm, throat, disc); g.traverse(o => { o.userData.marking = true; o.castShadow = true; });
  return g;
}

// ---------- 2) build the rig ----------
export function buildPropulsion({ THR, mech, LG, A, PAL }) {
  const S = { deploy: 0, wing: 0, thrust: 0, foot: 0, palm: 0, hover: 0, tgt: { deploy: 0, wing: 0, thrust: 0, foot: 0, palm: 0, hover: 0 }, t: 0, grip: null };
  const ray = new THREE.Raycaster(), log = [];

  // back thrusters: hinge pins + brackets, side rams, nozzle heat, flames
  const rams = [], flames = [];
  for (const id of ['R', 'L']) {
    const P = THR.pivots[id], s = P.s, torso = P.splay.parent;
    // gimbal: z pin (splay) half in the mast, half in the yoke; x pin (back swing) through the yoke into the column top
    const zpin = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.9, 16).rotateX(Math.PI / 2), PAL.chrome); zpin.name = 'thrusterSplayPin' + id;
    zpin.position.copy(P.H); torso.add(zpin);
    const yoke = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.55, 0.62), PAL.frame); yoke.name = 'thrusterYoke' + id; yoke.position.set(s * 0.17, 0, 0); P.splay.add(yoke);
    const xpin = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.6, 16).rotateZ(Math.PI / 2), PAL.chrome); xpin.name = 'thrusterHingePin' + id; xpin.position.set(s * 0.3, 0, 0); P.splay.add(xpin);
    // outer fan-fold side armour on the splay frame (follows the wing), plates turning about x with the back swing:
    // plate 0 stays at the splayed vertical, plate 5 rides with the column; V-notched lower edge when open
    const NP = 6, TMAX = 34, W = (TMAX / (NP - 1) + 4) * Math.PI / 180, r0 = 0.45, r1 = 10.6, rN = 7.0, layer = 0.1;
    // left side: the left-rear arm's mount block and shoulder shell (fixed, x -2.2..-4.2, y -4..0 behind the back) occupy this
    // space, so the left column gets no outer fan (the rear arm's shoulder covers that side). Right side: fan on the torso at
    // the gimbal; plate i takes i/5 of both the wing and the back-swing angle, plate 0 is fixed to the back, plate 5 = column.
    const fanRoot = new THREE.Group(); fanRoot.name = 'thrusterFan' + id; fanRoot.position.copy(P.H); torso.add(fanRoot); fanRoot.visible = s > 0;
    const plates = [];
    const SPAN = TMAX * Math.PI / 180 + W, APEX = 0.4 * SPAN, rEdge = f => f <= APEX ? r1 + (rN - r1) * f / APEX : rN + (r1 - rN) * (f - APEX) / (SPAN - APEX);
    for (let i = 0; i < NP; i++) {
      const fi = TMAX * Math.PI / 180 * i / (NP - 1), th = layer - 0.008;
      const fs = [0, W]; if (APEX > fi && APEX < fi + W) fs.splice(1, 0, APEX - fi);
      const shp = new THREE.Shape(); shp.moveTo(0, -r0);
      for (const f of fs) { const r = rEdge(fi + f); shp.lineTo(r * Math.sin(f), -r * Math.cos(f)); }
      shp.lineTo(r0 * Math.sin(W), -r0 * Math.cos(W)); shp.closePath();
      const geo = new THREE.ExtrudeGeometry(shp, { depth: th, bevelEnabled: false });
      geo.applyMatrix4(new THREE.Matrix4().makeBasis(new V3(0, 0, -1), new V3(0, 1, 0), new V3(1, 0, 0)));   // u -> -z, depth -> +x
      const xin = 2.25 + i * layer - 0.5;                                                              // world |x| 2.25.. relative to the gimbal at |x| 0.5
      geo.translate(s > 0 ? xin : -xin - th, 0, 0);
      const plate = new THREE.Mesh(geo, i % 2 ? PAL.armor2 : PAL.armor); plate.name = `thrusterFanPlate${id}${i}`; plate.castShadow = plate.receiveShadow = true;
      const g = new THREE.Group(); g.rotation.order = 'ZXY'; g.add(plate); fanRoot.add(g); plates.push(g);
    }
    // axle through the fan stack (inner end inside the column top, which turns on this same x axis)
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.25, 20).rotateZ(Math.PI / 2), PAL.frame); axle.name = 'thrusterFanAxle' + id; axle.position.set(s * 1.8, 0, 0); P.splay.add(axle);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.08, 20).rotateZ(Math.PI / 2), PAL.chrome); cap.name = 'thrusterFanCap' + id; cap.position.set(s * 2.39, 0, 0); P.splay.add(cap);
    if (s < 0) { axle.visible = cap.visible = false; }
    else for (const y of [-3.6, -6.4]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.45, 0.48), PAL.frame); b.name = 'thrusterFanBracket' + id; b.position.set(2.2925, y, -3.06); torso.add(b); }   // bracket only within plate 0's layer
    rams.push({ plates, NP, TMAX, s, on: s > 0 });
    // nozzle heat plate inside the 2D nozzle + the flame
    const heat = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.04, 1.2), heatMat); heat.position.set(s * TH.cx, -8.86, TH.nozzleZ); heat.name = 'thrusterNozzleHeat' + id; P.inner.add(heat);
    const f = makeFlame('back' + id, 1.3, 12.0); f.position.set(s * TH.cx, TH.nozzleY - 0.05, TH.nozzleZ); P.inner.add(f); flames.push({ f, k: 'thrust' });
  }
  // mast on top of the spine channel carrying both gimbals (x ±0.5, y 1.6..2.75, z -3.65..-2.85; channel top at y 1.8)
  const torsoG = THR.pivots.R.splay.parent;
  const mast = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.15, 0.8), PAL.frame); mast.name = 'thrusterMast'; mast.position.set(0, 2.175, -3.25); torsoG.add(mast);
  const updRams = (th, ph) => { for (const r of rams) r.plates.forEach((g, i) => { const k = i / (r.NP - 1); g.rotation.set(th * k, 0, r.s * ph * k); }); };

  // sole nozzles: two per foot (heel + forefoot), found by rays from below, flush with the sole (never below the ground line)
  for (const id of ['R', 'L']) {
    const foot = LG.group.getObjectByName(`leg${id}.foot:clay`); if (!foot) continue;
    const host = foot.parent, s = id === 'R' ? 1 : -1;
    for (const [nm, z] of [['rear', -0.35], ['front', 1.15]]) {      // the two sole arches (recessed 0.28 above the ground line)
      ray.set(new V3(s * 2.95, -40, z), new V3(0, 1, 0));
      const hit = ray.intersectObject(LG.group, true).find(h => !h.object.userData.marking && h.object.visible);
      if (!hit) { log.push(`× 脚底 ${id}${nm}`); continue; }
      const n = roundNozzle(`sole${id}-${nm}`, 0.42, 0.22, PAL);
      // ring body rises into the sole (+y); its face sits 0.012 below the sole face but never below the ground line
      n.position.set(s * 2.95, Math.max(hit.point.y - 0.012, -35.99) + 0.004, z);
      host.updateMatrixWorld(true); host.worldToLocal(n.position);
      host.add(n);
      const f = makeFlame(`sole${id}-${nm}`, 0.55, 6.0); f.position.copy(n.position); host.add(f); flames.push({ f, k: 'foot' });
      log.push(`✓ 脚底 ${id}${nm} → ${hit.object.name} @y ${hit.point.y.toFixed(2)}`);
    }
  }

  // palm nozzles (five-finger hands): ray onto the palm from its open side (hand-local -x)
  for (const key of ['right', 'leftFront']) {
    const arm = A.arms[key], hand = arm && arm.hand && arm.hand.hand; if (!hand) continue;
    hand.updateMatrixWorld(true);
    let palm = null; hand.traverse(o => { if (o.isMesh && /\.palm/.test(o.name) && !palm) palm = o; });
    const box = new THREE.Box3().setFromObject(palm), c = box.getCenter(new V3());
    const dir = new V3(-1, 0, 0).transformDirection(hand.matrixWorld);
    ray.set(c.clone().addScaledVector(dir, 4), dir.clone().negate());
    const hit = ray.intersectObject(palm, false)[0];
    if (!hit) { log.push(`× 手掌 ${key}`); continue; }
    const n = roundNozzle('palm' + key, 0.32, 0.14, PAL);
    const local = hand.worldToLocal(hit.point.clone());
    n.position.copy(local); n.quaternion.setFromUnitVectors(new V3(0, -1, 0), new V3(-1, 0, 0));   // exhaust along hand-local -x
    hand.add(n);
    const f = makeFlame('palm' + key, 0.42, 4.5); f.position.copy(n.position); f.quaternion.copy(n.quaternion); hand.add(f); flames.push({ f, k: 'palm' });
    log.push(`✓ 手掌 ${key} → ${palm.name}`);
  }

  // Iron-Man palm pose: fold the hand at its wrist (about the hand-local z, the knuckle line) so the palm faces down
  // while the forearm keeps its normal roll; the arms hang at the sides with a small outward angle. The wrist pin runs
  // along the palm normal, so this fold is a separate hand action. The fold sign and the exhaust direction are measured
  // per hand (the left arm is a mirror).
  const palmPose = {}, foldDir = {};
  const D2R = Math.PI / 180, PALM_FOLD = 70 * D2R, PALM_ABD = 10 * D2R, PALM_ELBOW = 5 * D2R;   // absolute arm angles in the pose
  for (const { f, k } of flames) if (k === 'palm') {
    const key = f.name.replace('flame:palm', ''), a = A.arms[key]; if (!a) continue;
    const hand = a.hand && a.hand.hand; if (!hand) continue;
    const b = a.spec.pose;
    a.setPose({ ...b, abd: PALM_ABD, elbow: PALM_ELBOW }); a.update();
    let best = 1, by = 9;
    for (const dir of [1, -1]) {
      hand.rotation.set(0, 0, dir * PALM_FOLD); a.root.updateMatrixWorld(true);
      const d = new V3(0, -1, 0).transformDirection(f.matrixWorld);
      if (d.y < by) { by = d.y; best = dir; }
    }
    hand.rotation.set(0, 0, 0); a.setPose(b); a.update();
    foldDir[key] = best;
    palmPose[key] = { a, hand, b, dir: best, q: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, best * PALM_FOLD)), base: null, down: +by.toFixed(2) };
    log.push(`✓ 手掌姿势 ${key} → 外摆 ${(PALM_ABD / D2R).toFixed(0)}° · 肘 ${(PALM_ELBOW / D2R).toFixed(0)}° · 折腕 ${(PALM_FOLD / D2R).toFixed(0)}° · 喷向 y ${by.toFixed(2)}`);
  }
  S.palmPose = palmPose; S.foldDir = foldDir; S.palmOver = false;
  // Shared weapon FX: the studio, hangar and dome all update propulsion each frame.
  S.bladeFire = buildBladeFire(A.arms.leftFront);
  const base = mech.position.y;
  S.update = (dt) => {
    S.t += dt;
    S.bladeFire?.update(S.t);
    const ease = (k, rate) => { S[k] += (S.tgt[k] - S[k]) * Math.min(1, dt * rate); };
    ease('deploy', 2.2); ease('wing', 1.8); ease('thrust', 3.0); ease('foot', 3.0); ease('palm', 3.0); ease('hover', 0.9);
    // back thrusters swing: bottoms back 34°
    const e = S.deploy * S.deploy * (3 - 2 * S.deploy), ew = S.wing * S.wing * (3 - 2 * S.wing);
    const gate = Math.min(1, Math.max(0, (e - 0.7) / 0.25));                    // wings only once the columns are pulled clear of the back
    const th = e * 34 * Math.PI / 180, ph = ew * gate * 14 * Math.PI / 180;
    for (const id of ['R', 'L']) { const P = THR.pivots[id]; P.pivot.rotation.x = th; P.splay.rotation.z = P.s * ph; }
    // the left-rear arm steps out of the way of the left wing
    if (Math.abs(ew * gate - (S._ew ?? -1)) > 1e-4 && A.arms.leftRear) { const a = A.arms.leftRear, b = a.spec.pose;
      a.setPose({ ...b, abd: b.abd + ew * gate * 35 * Math.PI / 180, pitch: b.pitch - ew * gate * 12 * Math.PI / 180 }); a.update(); S._ew = ew * gate; }
    updRams(th, ph);
    // flames: back thrust only once the thrusters are out of the way
    const backT = S.thrust * Math.min(1, Math.max(0, (S.deploy - 0.6) / 0.35));
    for (const { f, k } of flames) f.update(k === 'thrust' ? backT : S[k], S.t);
    heatMat.emissiveIntensity = 2.2 * Math.max(backT, S.foot, S.palm);
    // hover: lift needs thrust; gentle bob when airborne
    const lift = S.hover * Math.min(1, (backT + S.foot) / 0.8);
    mech.position.y = base + lift + (lift > 0.2 ? 0.12 * Math.sin(S.t * 1.7) + 0.05 * Math.sin(S.t * 3.1) : 0);
    { const kp = Math.min(1, S.palm * 1.4), ke = kp * kp * (3 - 2 * kp);
      S.palmOver = ke > 0.001;
      if (Math.abs(ke - (S._kp ?? -1)) > 1e-4) { for (const p of Object.values(palmPose)) { p.a.setPose({ ...p.b, abd: p.b.abd + ke * (PALM_ABD - p.b.abd), elbow: p.b.elbow + ke * (PALM_ELBOW - p.b.elbow) }); p.a.update(); } S._kp = ke; }
      for (const p of Object.values(palmPose)) {
        if ((p.a.t ?? 0) > 0.05) { p.base = null; continue; }       // the weapon owns the hand while it is deployed
        if (ke > 1e-4) { if (!p.base) p.base = p.hand.quaternion.clone(); p.hand.quaternion.slerpQuaternions(p.base, p.q, ke); }
        else if (p.base) { p.hand.quaternion.copy(p.base); p.base = null; }
      }
    }
    // palms open while firing (existing finishing-room behaviour); put the user's grip back once the flame stops
    if (S.grip) for (const g of Object.values(S.grip)) {
      if (S.palm > 0.05) { if (g.palmGrip == null) g.palmGrip = g.target; g.target = 0; }
      else if (g.palmGrip != null) { g.target = g.palmGrip; g.palmGrip = null; }
    }
  };
  S.fanAngles = () => rams.map(r => r.plates.map(g => +(g.rotation.x * 180 / Math.PI).toFixed(1)));
  S.log = log;
  return S;
}
