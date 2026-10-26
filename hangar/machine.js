// Machine programs from the old dome bay, rewritten for the 026 (its parts, its palette):
//  X-ray scan (armour goes to a cyan hologram shell, a scan band sweeps), back thrusters (finallab propulsion:
//  swing out, splay, test fire), neural sync (pulse rings climb the body, visor + reactor flare), thunder formation (all three weapons
//  deploy, the saw claw spins, lightning), explode / assemble by part groups, structure layers, procedural sound.
import * as THREE from 'three';
import { Sound } from '../src/audio.js';

const V3 = THREE.Vector3;
const clamp = v => Math.max(0, Math.min(1, v));
const sm = (a, b, t) => { const x = clamp((t - a) / (b - a)); return x * x * (3 - 2 * x); };

function holoMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uOn: { value: 0 }, uBand: { value: -100 }, uBandW: { value: 2.0 }, uFill: { value: 1 }, uColor: { value: new THREE.Color(0x6fd8ff) } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vW;
      void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz);
        gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float uOn, uBand, uBandW, uFill; uniform vec3 uColor; varying vec3 vN; varying vec3 vV; varying vec3 vW;
      void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.4);
        float band = exp(-pow((vW.y - uBand) / uBandW, 2.0));
        float grid = step(0.94, fract(vW.y * 1.6)) * 0.35;
        vec3 c = uColor * (f * 0.9 * uFill + grid * uFill * 0.5 + band * 1.6);
        gl_FragColor = vec4(c * uOn, 1.0); }`,
  });
}

// M: buildMech() result; deps: { scene, renderer, show, park: (retract:boolean) => void }
export function setupMachine(M, deps) {
  const { scene, renderer } = deps;
  const P = M.mats;                                   // finallab palette (shared by the whole machine)
  const root = M.group, mech = M.mech, body = M.body || mech.children[0];
  const A = M.arms.arms;
  const st = { xray: 0, xrayOn: false, section: false, cut: 0, sync: -1, thunder: false, deploy: 0, spin: 0, e: 0, eTarget: 0,
    power: 0.35, layers: [true, true, true, true, true], motion: 0, _layersDirty: true, _lastXray: -1 };

  // ---- structure layers (by material) ----
  const LAYERS = [
    { cn: '外装甲', en: 'ARMOR SHELL', mats: [P.armor, P.armor2, P.red, P.yellow] },
    { cn: '副装甲 · 子系统', en: 'SUB-ARMOR / SYSTEMS', mats: [P.recess, P.glass] },
    { cn: '驱动传动', en: 'ACTUATION', mats: [P.chrome] },
    { cn: '内骨骼', en: 'ENDOSKELETON', mats: [P.frame, P.dark] },
    { cn: '核心', en: 'CORE', mats: [P.core, P.lamp, P.visor] },
  ];
  const meshesOf = [[], [], [], [], []], allMats = new Set();
  root.traverse(o => {
    if (!o.isMesh) return;
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    ms.forEach(m => allMats.add(m));
    let li = LAYERS.findIndex(L => L.mats.includes(ms[0]));
    if (li < 0) li = /^decal:/.test(o.name) ? 0 : 1;      // decals ride with the shell; other finishing parts = systems
    meshesOf[li].push(o);
  });
  LAYERS.forEach((L, i) => L.count = meshesOf[i].length);
  const applyLayers = () => meshesOf.forEach((arr, i) => arr.forEach(m => m.visible = st.layers[i] && !(i === 0 && st.xray > 0.98)));

  // ---- X-ray: shell fades, hologram overlay + sweeping band ----
  const holo = holoMaterial();
  let holoMeshes = null;
  const ensureHolo = () => {
    if (holoMeshes) return; holoMeshes = [];
    for (const m of meshesOf[0]) { if (!m.geometry || m.isInstancedMesh) continue; const h = new THREE.Mesh(m.geometry, holo); h.renderOrder = 3; h.raycast = () => {}; h.castShadow = false; m.add(h); holoMeshes.push(h); }
  };
  const setShellFade = k => {
    for (const m of LAYERS[0].mats) {
      const want = k > 0.001;
      if (m.transparent !== want) { m.transparent = want; m.needsUpdate = true; }
      m.opacity = 1 - 0.9 * k; m.depthWrite = k < 0.5;
    }
  };

  // ---- explode groups: [object, offset at e=1, stage delay] ----
  const head = M.head || body.children[0], neck = M.neckGroup || body.children[1], torso = M.torso;
  const EX = [
    [head, new V3(0, 15, 2), 0.0], [neck, new V3(0, 9, 1), 0.08], [torso, new V3(0, 5, 0), 0.16],
    [A.right.root, new V3(7, 5, 16), 0.24], [A.leftFront.root, new V3(-7, 5, 16), 0.3], [A.leftRear.root, new V3(-6, 6, -12), 0.36],
  ].map(([o, d, delay]) => ({ o, d, delay, base: o.position.clone() }));
  const setExplode = e => { for (const x of EX) { const k = sm(x.delay, x.delay + 0.64, e); x.o.position.copy(x.base).addScaledVector(x.d, k); } };

  // ---- sound ----
  const sound = new (deps.SoundClass || Sound)();   // hangar: HangarSound (hall), outdoors: the old dome Sound (rain)

  st.thr = false; st.thrT = 0; st.thrMove = 0;
  const api = {
    LAYERS, st, sound,
    toggleXray() { st.xrayOn = !st.xrayOn; if (st.xrayOn) ensureHolo(); sound.burst('scan'); },
    toggleThrusters() {   // back thrusters: swing out, splay (wing), then a test fire; again = shut down and fold
      st.thr = !st.thr; const P = M.prop; if (!P) return;
      if (st.thr) { P.tgt.deploy = 1; st.thrT = 0; sound.burst('hiss'); } else { P.tgt.thrust = 0; P.tgt.wing = 0; st.thrT = -1; sound.burst('clank'); }
    },
    startSync() { if (st.e > 0.02) st.eTarget = 0; st.sync = 0; sound.burst('sync'); sound.burst('hiss'); },
    toggleThunder() {
      st.thunder = !st.thunder; if (st.thunder) { st.eTarget = 0; deps.park?.(true); sound.burst('pa'); }
      sound.burst(st.thunder ? 'boom' : 'hiss');
    },
    explode(v) { const was = st.eTarget; st.eTarget = clamp(v); if (st.eTarget > 0 && was === 0) sound.burst('pa'); if (st.eTarget > 0) { deps.park?.(true); if (st.thunder) api.toggleThunder(); } },
    canopy(v) { st.canopyTarget = v === undefined ? (st.canopyTarget > 0.5 ? 0 : 1) : v; if (v === undefined || v > 0.5) sound.burst('hiss'); },
    toggleLayer(i) { st.layers[i] = !st.layers[i]; st._layersDirty = true; },
    soundToggle() { return sound.toggle(); },
    state() {
      if (st.e > 0.02) return st.e > 0.98 ? 'EXPLODED' : 'SEPARATING';
      if (st.thr) return 'THRUSTERS'; if (st.xrayOn) return 'X-RAY'; if (st.sync >= 0) return 'NEURAL SYNC'; if (st.thunder) return 'COMBAT';
      return 'ASSEMBLED';
    },
    update(t, dt) {
      const U = deps.unit || 1, base = root.getWorldPosition(new V3()), H = M.height * U;
      // canopy (rear hinge: lifts, then tips back) ~4 s
      st.canopyTarget = st.canopyTarget ?? 0; st.canopyT = st.canopyT ?? 0;
      if (st.canopyT !== st.canopyTarget) { st.canopyT += Math.sign(st.canopyTarget - st.canopyT) * Math.min(Math.abs(st.canopyTarget - st.canopyT), dt * 0.25); deps.canopy?.(st.canopyT); }
      // explode (rate-limited)
      const pe = st.e; st.e += Math.sign(st.eTarget - st.e) * Math.min(Math.abs(st.eTarget - st.e), dt * 0.16);
      if (!deps.skipStaticUpdates || st._appliedExplode !== st.e) { setExplode(st.e); st._appliedExplode = st.e; }
      // x-ray fade + scan band (sweeps feet → head → feet)
      st.xray = clamp(st.xray + (st.xrayOn ? dt : -dt) * 0.9);
      if (st.xray > 0 || st.sync >= 0) {
        holo.uniforms.uOn.value = Math.max(st.xray, st.sync >= 0 ? 1 : 0);
        holo.uniforms.uFill.value = st.xray;
        holo.uniforms.uBand.value = st.sync >= 0 ? base.y + ((st.sync * 0.55) % 1) * (H + 4) : base.y + (0.5 - 0.5 * Math.cos(t * 0.7)) * (H + 2);
        holo.uniforms.uBandW.value = (st.sync >= 0 ? 1.2 : 2.0) * U;
      } else holo.uniforms.uOn.value = 0;
      if (holoMeshes) holoMeshes.forEach(h => h.visible = holo.uniforms.uOn.value > 0.001);
      const xrayChanged = st.xray !== st._lastXray;
      if (xrayChanged) { setShellFade(st.xray); st._lastXray = st.xray; }
      if (xrayChanged || st._layersDirty) { applyLayers(); st._layersDirty = false; }
      // thruster sequence (finallab propulsion): deploy -> wing after 1.2 s -> thrust after 2.6 s; shut-down folds back
      if (M.prop) {
        const P = M.prop;
        if (st.thr) { st.thrT += dt; if (st.thrT > 1.2) P.tgt.wing = 1; if (st.thrT > 2.6) P.tgt.thrust = 0.75; }
        else if (st.thrT < 0) { st.thrT -= dt; if (st.thrT < -1.4) { P.tgt.deploy = 0; st.thrT = 0; } }
        st.thrMove = Math.abs(P.deploy - P.tgt.deploy) + Math.abs(P.wing - P.tgt.wing);
      }
      // neural sync: rings climb, visor + reactor flare, ~6 s
      let flare = 0;
      if (st.sync >= 0) { st.sync += dt; flare = Math.sin(Math.min(1, st.sync / 6) * Math.PI); if (st.sync > 6) st.sync = -1; }
      P.visor.emissiveIntensity = 2.6 + flare * 6; P.core.emissiveIntensity = 3 + flare * 5;
      // thunder: weapons out, claw spins, lightning now and then
      st.deploy = clamp(st.deploy + (st.thunder ? dt : -dt) * 0.45);
      if (!deps.skipStaticUpdates || st._appliedDeploy !== st.deploy) {
        for (const a of [A.right, A.leftFront, A.leftRear]) a.deploy(st.deploy);
        st._appliedDeploy = st.deploy;
      }
      const spinRate = st.thunder && st.deploy > 0.95 ? 12 : 0;
      st.sawSpeed = (st.sawSpeed || 0) + (spinRate - (st.sawSpeed || 0)) * Math.min(1, dt * 1.5);
      if (st.sawSpeed > 0.05) { st.spin += dt * st.sawSpeed; A.leftRear.spin(st.spin); A.leftRear.update(); }
      if (st.thunder && st.deploy > 0.9 && Math.random() < dt * 0.6) { deps.show?.lightning(base.clone().add(new V3((Math.random() - 0.5) * 40 * U, H + 30 * U, (10 + Math.random() * 20) * U))); sound.burst('boom'); }
      // power for the reactor + sound
      const want = st.thunder ? 1 : st.sync >= 0 ? 0.85 : 0.35;
      st.power += (want - st.power) * Math.min(1, dt * 0.8);
      if (M.rotor) M.rotor.target = deps.rotorTarget && !st.thunder && st.sync < 0 ? deps.rotorTarget() : st.power;
      st.motion = Math.abs(st.e - pe) / Math.max(dt, 1e-3) * 0.6 + Math.abs(st.deploy - (st.lastDeploy ?? st.deploy)) / Math.max(dt, 1e-3) * 0.4; st.lastDeploy = st.deploy;
      sound.update(st.power, Math.min(1, st.motion), st.sawSpeed, deps.soundExtra?.() || {});
    },
  };
  return api;
}
