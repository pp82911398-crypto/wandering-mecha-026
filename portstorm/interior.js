// Interior detail layer for the port hangar: high-bay industrial lighting, a hard control room
// cut into the mountain, and idle motion for the display Jaegers / screens / warning lights.
// Pure add-on: reads window.__lab, never rebuilds the port.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildControlLift } from './lift.js';

const V3 = THREE.Vector3;
const R = Math.PI / 180;
let started = false;

function wait() {
  if (!window.__lab) return setTimeout(wait, 300);
  if (started) return;
  started = true;
  build();
}
wait();

function build() {
  const lab = window.__lab, scene = lab.scene, camera = lab.camera, controls = lab.controls;
  lab.renderer.toneMappingExposure = 1.25;
  const L = lab.L, hangar = lab.hangar;
  const H = L.hangar, gx = L.gate.cx;
  const hallZ0 = H.hallZ0, hallZ1 = H.hallZ1;
  const root = new THREE.Group(); root.name = 'interiorDetail'; scene.add(root);
  const yellow2 = new THREE.MeshStandardMaterial({ color: 0xb58a1c, roughness: 0.55, metalness: 0.3 });
  for (const l of hangar.pointLights) l.intensity = 0;
  for (const s of hangar.gateLights) s.intensity = 0;
  for (const s of hangar.crawlerSpots) s.intensity = 0;
  const stormEnv = scene.environment;
  // interior PBR environment: dark hall with warm/cool ceiling strips; this is what gives the
  // floor/metal/glass real reflections instead of flat fill light.
  let hallEnv = null;
  try {
    const es = new THREE.Scene();
    es.background = new THREE.Color(0x070b0e);
    const shell = new THREE.Mesh(new THREE.BoxGeometry(260, 120, 300), new THREE.MeshBasicMaterial({ color: 0x141b20, side: THREE.BackSide }));
    shell.position.y = 40; es.add(shell);
    const floorM = new THREE.Mesh(new THREE.PlaneGeometry(260, 300), new THREE.MeshBasicMaterial({ color: 0x0c1114 }));
    floorM.rotation.x = -Math.PI / 2; floorM.position.y = 0.5; es.add(floorM);
    for (let i = 0; i < 10; i++) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(24, 2.4), new THREE.MeshBasicMaterial({ color: i % 3 ? 0xffd9ad : 0xd8ecff }));
      strip.position.set(-80 + (i % 5) * 40, 98, i < 5 ? -40 : -180); strip.rotation.x = Math.PI / 2; es.add(strip);
    }
    const pm = new THREE.PMREMGenerator(lab.renderer);
    hallEnv = pm.fromScene(es, 0.05).texture;
  } catch (e) { console.warn('hall env failed', e); }
  const fill = new THREE.HemisphereLight(0xafc9d9, 0x2a3036, 0.95); fill.position.set(gx, H.hallH - 4, (hallZ0 + hallZ1) / 2); root.add(fill);

  // ---------------------------------------------------------------- high-bay lights
  const warm = new THREE.Color(0xffd3a0), cool = new THREE.Color(0xdfeaff);
  const housingMat = new THREE.MeshStandardMaterial({ color: 0x20272b, roughness: 0.45, metalness: 0.65 });
  const cageMat = new THREE.MeshStandardMaterial({ color: 0x4b555b, roughness: 0.35, metalness: 0.8 });
  const lensWarm = new THREE.MeshStandardMaterial({ color: 0xfff0d4, emissive: 0xffb86a, emissiveIntensity: 5.0, roughness: 0.3 });
  const lensCool = new THREE.MeshStandardMaterial({ color: 0xeaf4ff, emissive: 0xbfe0ff, emissiveIntensity: 4.2, roughness: 0.3 });

  const glowTex = (() => {
    const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,235,200,0.95)'); g.addColorStop(0.25, 'rgba(255,205,140,0.5)'); g.addColorStop(1, 'rgba(255,180,100,0)');
    x.fillStyle = g; x.fillRect(0, 0, S, S);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const glowMat = new THREE.SpriteMaterial({ map: glowTex, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });

  const fixtures = [];
  let idx = 0;
  const rowsZ = [-222, -247, -272, -297, -322], colsX = [-40, -20, 0, 20, 40];
  for (const [ri, z] of rowsZ.entries()) {
    for (const [ci, dx] of colsX.entries()) {
      const x = gx + dx, y = H.hallH - 6.5;
      const isWarm = idx % 3 !== 0;
      const g = new THREE.Group(); g.position.set(x, y, z);
      // housing, lens, protective cage, cable drop
      const hous = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.55, 1.5), housingMat); hous.castShadow = true; g.add(hous);
      const lens = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.16, 1.05), isWarm ? lensWarm : lensCool); g.add(lens);
      for (const sx of [-1.15, 1.15]) { const bar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.55, 0.08), cageMat); bar.position.set(sx, -0.32, 0); g.add(bar); }
      for (const sz of [-0.45, 0.45]) { const bar = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.08, 0.08), cageMat); bar.position.set(0, -0.28, sz); g.add(bar); }
      const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.8, 5), cageMat); cable.position.y = 1.7; g.add(cable);
      const glow = new THREE.Sprite(glowMat); glow.scale.set(5.2, 5.2, 1); glow.position.y = -0.35; g.add(glow);
      // real lights are expensive (~1.2 ms per spot per frame, every lit pixel pays for every light):
      // only 4 wide spots (2 left, 2 right, rows 2 and 5) do real lighting; every fixture also gets a
      // cheap fake floor pool below (merged additive decal, see floorPools)
      if ((ri === 1 || ri === 3) && (ci === 1 || ci === 3)) {
        const sp = new THREE.SpotLight(isWarm ? 0xffd3a0 : 0xdbeeff, 1200, 190, 1.15, 1.0, 1.2);
        sp.position.set(x, y - 0.4, z);
        sp.target.position.set(x, 0, z + 2);
        sp.userData.base = 1200;   // low general light: the old dome look is dark hall + hard back/rim light (hangar/show.js)
        sp.castShadow = ri === 1 && ci === 1;   // one shadow caster only (near the main machine)
        if (sp.castShadow) { sp.shadow.mapSize.set(1024, 1024); sp.shadow.bias = -0.0004; sp.shadow.normalBias = 0.06; }
        root.add(sp, sp.target); g.userData.spot = sp;
      }
      root.add(g); fixtures.push(g); idx++;
    }
  }
  // tunnel downlights + wall washers on both hall side walls (the tunnel had no real light at all)
  const extraSpots = [];
  for (const z of [-178]) {
    const sp = new THREE.SpotLight(0xffe2bc, 750, 100, 1.15, 1.0, 1.2);
    sp.position.set(gx, L.hangar.tunnelH - 4, z); sp.target.position.set(gx, 0, z - 2);
    sp.userData.base = 750; root.add(sp, sp.target); extraSpots.push(sp);
  }
  // fake light pools on the floor under every high-bay fixture (one merged additive mesh, no light cost)
  const poolTex = (() => {
    const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
    const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, S, S); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, color: 0xffe0b8, transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  poolMat.userData.base = 0.15;
  {
    const parts = [];
    for (const f of fixtures) { const g = new THREE.PlaneGeometry(30, 26); g.rotateX(-Math.PI / 2); g.translate(f.position.x, 0.07, f.position.z + 1); parts.push(g); }
    for (const z of [-160, -196]) { const g = new THREE.PlaneGeometry(26, 26); g.rotateX(-Math.PI / 2); g.translate(gx, 0.07, z); parts.push(g); }
    const pools = new THREE.Mesh(mergeGeometries(parts), poolMat); pools.name = 'floorPools'; pools.renderOrder = 1; root.add(pools);
  }
  // a few low wall washers on the side walls
  for (const z of [-290]) for (const s of [-1, 1]) {
    const x = gx + s * (H.hallW / 2 - 1.2);
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.8, 2.4), housingMat); p.position.set(x, 8, z); root.add(p);
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.8, 2.4), housingMat); box.position.set(x - s * 0.3, 8, z); root.add(box);
  }

  // ---------------------------------------------------------------- control room (hard, cut into the back wall)
  const CR = { x0: 34, x1: 52, z0: hallZ1 + 3, z1: hallZ1 + 15, y0: 18.5, y1: 25.5 };
  const cr = new THREE.Group(); cr.name = 'controlRoom'; root.add(cr);
  const conc = new THREE.MeshStandardMaterial({ color: 0x3a4145, roughness: 0.78, metalness: 0.15 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x252c31, roughness: 0.4, metalness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x12171a, roughness: 0.55, metalness: 0.45 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xa9c4d2, roughness: 0.04, metalness: 0.0, transmission: 0.78, thickness: 0.6, ior: 1.45, envMapIntensity: 1.2, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
  const w = CR.x1 - CR.x0, d = CR.z1 - CR.z0, cx = (CR.x0 + CR.x1) / 2, cz = (CR.z0 + CR.z1) / 2;
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; cr.add(m); return m; };
  // floor, roof, back/side walls
  add(new THREE.BoxGeometry(w, 0.5, d), steel, cx, CR.y0, cz);
  add(new THREE.BoxGeometry(w, 0.4, d), conc, cx, CR.y1, cz);
  add(new THREE.BoxGeometry(w, CR.y1 - CR.y0, 0.6), conc, cx, (CR.y0 + CR.y1) / 2, CR.z0);
  for (const x of [CR.x0, CR.x1]) add(new THREE.BoxGeometry(0.6, CR.y1 - CR.y0, d), conc, x, (CR.y0 + CR.y1) / 2, cz);
  // window wall facing the hall (+z), heavy frame
  add(new THREE.BoxGeometry(w, 0.7, 0.7), steel, cx, CR.y1 - 1.2, CR.z1);
  add(new THREE.BoxGeometry(w, 0.7, 0.7), steel, cx, CR.y0 + 0.8, CR.z1);
  for (let i = 0; i <= 4; i++) add(new THREE.BoxGeometry(0.22, CR.y1 - CR.y0 - 2.0, 0.22), steel, CR.x0 + 0.6 + i * ((w - 1.2) / 4), (CR.y0 + CR.y1) / 2, CR.z1);
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(w - 1.6, CR.y1 - CR.y0 - 2.6), glass);
  pane.position.set(cx, (CR.y0 + CR.y1) / 2, CR.z1 - 0.02); pane.rotation.y = 0; cr.add(pane);
  // consoles + screens
  const screenMats = [];
  function screenTexture() {
    const S = 256, c = document.createElement('canvas'); c.width = 512; c.height = 256;
    const x = c.getContext('2d'); x.fillStyle = '#061018'; x.fillRect(0, 0, 512, 256);
    return { c, x, tex: new THREE.CanvasTexture(c) };
  }
  for (let row = 0; row < 2; row++) {
    const z = CR.z1 - 4.2 - row * 4.6;
    const desk = add(new THREE.BoxGeometry(w - 8, 1.3, 2.4), steel, cx, CR.y0 + 0.65, z);
    for (let col = 0; col < 3; col++) {
      const sx = cx - 6.2 + col * 6.2;
      // tilted screen
      const sc = screenTexture(); sc.tex.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.MeshStandardMaterial({ map: sc.tex, emissiveMap: sc.tex, emissive: 0xffffff, emissiveIntensity: 1.35, roughness: 0.26, metalness: 0.12, toneMapped: false });
      screenMats.push({ ...sc, mat, phase: Math.random() * 10 });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 2.1), mat);
      m.position.set(sx, CR.y0 + 2.4, z - 0.45); m.rotation.x = -0.18; cr.add(m);

      const bez = new THREE.Mesh(new THREE.BoxGeometry(4.3, 2.4, 0.16), dark); bez.position.set(sx, CR.y0 + 2.4, z - 0.62); bez.rotation.x = -0.18; cr.add(bez);
      // desk clutter: keyboard, phone, cup, binder
      add(new THREE.BoxGeometry(2.0, 0.1, 0.7), dark, sx, CR.y0 + 1.38, z - 1.0);
      add(new THREE.BoxGeometry(0.5, 0.08, 0.9), dark, sx + 2.2, CR.y0 + 1.38, z - 0.9);
      add(new THREE.CylinderGeometry(0.16, 0.14, 0.35, 8), steel, sx - 2.2, CR.y0 + 1.55, z - 1.1);
    }
  }
  // operator chairs + crew
  const crewMat = new THREE.MeshStandardMaterial({ color: 0x2d3438, roughness: 0.8 });
  const vest = new THREE.MeshStandardMaterial({ color: 0xb8c34a, emissive: 0x1a1c06, emissiveIntensity: 0.4, roughness: 0.6 });
  for (let row = 0; row < 2; row++) for (let col = 0; col < 3; col++) {
    const x = cx - 6.2 + col * 6.2, z = CR.z1 - 2.4 - row * 4.6;
    const chair = add(new THREE.BoxGeometry(1.4, 0.22, 1.4), dark, x, CR.y0 + 1.55, z);
    add(new THREE.BoxGeometry(1.4, 1.8, 0.28), dark, x, CR.y0 + 2.45, z + 0.65);
    add(new THREE.CylinderGeometry(0.18, 0.22, 1.2, 8), steel, x, CR.y0 + 0.8, z);
    // crew seated
    const body = add(new THREE.BoxGeometry(0.8, 1.0, 0.55), crewMat, x, CR.y0 + 2.2, z);
    add(new THREE.BoxGeometry(0.86, 0.35, 0.6), vest, x, CR.y0 + 2.45, z);
    add(new THREE.SphereGeometry(0.26, 10, 8), new THREE.MeshStandardMaterial({ color: 0x8a6a52, roughness: 0.75 }), x, CR.y0 + 2.95, z);
    add(new THREE.BoxGeometry(0.7, 0.22, 0.3), dark, x, CR.y0 + 3.22, z);
  }
  // ceiling light bars + warning beacon + cable trays in the control room
  for (const z of [cz]) {
    const bar = add(new THREE.BoxGeometry(w - 10, 0.18, 0.35), new THREE.MeshStandardMaterial({ color: 0xdfefff, emissive: 0xaed8f6, emissiveIntensity: 5.0, roughness: 0.3 }), cx, CR.y1 - 0.5, z);
    const p = new THREE.PointLight(0xcfe6ff, 200, 30, 2); p.position.set(cx, CR.y1 - 1.0, z); cr.add(p);
  }
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), new THREE.MeshStandardMaterial({ color: 0x7a1a14, emissive: 0xff2418, emissiveIntensity: 3.0, roughness: 0.4 }));
  beacon.position.set(CR.x1 - 2.0, CR.y1 - 0.8, CR.z1 - 1.2); cr.add(beacon);
  const beaconLight = new THREE.PointLight(0xff2a1a, 8, 18, 2); beaconLight.position.copy(beacon.position); cr.add(beaconLight);
  // control-room access: glazed lift shaft in front of the mezzanine (replaces the old stair)
  const ctlLift = buildControlLift(root, { x: CR.x0 + 3, zMez: hallZ1 + 21, y0: CR.y0 });

  // ---------------------------------------------------------------- mezzanine under the booths + gate-style wall cladding
  {
    const mez = new THREE.Mesh(new THREE.BoxGeometry(30, 0.6, 20), steel); mez.position.set(43, CR.y0 - 0.45, hallZ1 + 11); mez.receiveShadow = true; root.add(mez);
    for (const [x, z] of [[30, hallZ1 + 2], [56, hallZ1 + 2], [30, hallZ1 + 20], [56, hallZ1 + 20]]) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.7, CR.y0, 0.7), steel); col.position.set(x, CR.y0 / 2, z); col.castShadow = true; root.add(col);
      const brace = new THREE.Mesh(new THREE.BoxGeometry(0.2, 6.0, 0.2), steel); brace.position.set(x, CR.y0 * 0.72, z); brace.rotation.x = 0.45; brace.rotation.z = 0.25; root.add(brace);
    }
    for (const z of [hallZ1 + 2, hallZ1 + 20]) { const beam = new THREE.Mesh(new THREE.BoxGeometry(27, 0.5, 0.5), steel); beam.position.set(43, CR.y0 - 0.9, z); root.add(beam); }
    // side cladding: vertical steel panels + ribs + girts, matching the gate's industrial language
    const clad = new THREE.MeshStandardMaterial({ color: 0x3d464b, roughness: 0.48, metalness: 0.62 });
    const cladD = new THREE.MeshStandardMaterial({ color: 0x252c31, roughness: 0.5, metalness: 0.55 });
    // merged per material (was ~250 separate meshes)
    const gClad = [], gDark = [];
    const put = (arr, w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); arr.push(g); };
    for (const sx of [-1, 1]) {
      const x = gx + sx * (H.hallW / 2 - 0.55);
      for (let z = H.hallZ0 - 8; z > H.hallZ1; z -= 6) {
        put(gClad, 0.35, H.hallH - 9, 5.7, x, (H.hallH - 9) / 2 + 4, z);
        put(gDark, 0.5, H.hallH - 8, 0.45, x - sx * 0.25, (H.hallH - 8) / 2 + 3.5, z - 2.8);
        put(gDark, 0.42, 0.35, 5.7, x - sx * 0.22, 8, z);
        put(gDark, 0.42, 0.35, 5.7, x - sx * 0.22, 34, z);
      }
      const hz = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.4, H.hallZ0 - H.hallZ1 - 16), new THREE.MeshStandardMaterial({ color: 0xb58a1c, roughness: 0.55, metalness: 0.3 }));
      hz.position.set(x - sx * 0.45, 2.2, (H.hallZ0 + H.hallZ1) / 2); root.add(hz);
    }
    { const p = new THREE.Mesh(mergeGeometries(gClad), clad); p.receiveShadow = true; root.add(p); root.add(new THREE.Mesh(mergeGeometries(gDark), cladD)); }
  }

  // ---------------------------------------------------------------- idle motion
  const displayMechs = hangar.root.children.filter(o => o.name === 'jaeger');
  const base = displayMechs.map(o => ({ y: o.position.y, ry: o.rotation.y, phase: Math.random() * Math.PI * 2 }));
  const cranks = [];
  // find the display gantry crane / trolley by name if present
  hangar.root.traverse(o => { if (/gantry|trolley|hoist/i.test(o.name || '')) cranks.push(o); });

  // maintenance cradles + pilot access for the side display mechs
  function cradleAt(x, z, ry) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; root.add(g);
    const steel2 = new THREE.MeshStandardMaterial({ color: 0x30383d, roughness: 0.42, metalness: 0.7 });
    const yellow2 = new THREE.MeshStandardMaterial({ color: 0xb58a1c, roughness: 0.55, metalness: 0.3 });
  for (const l of hangar.pointLights) l.intensity = 0;
  for (const s of hangar.gateLights) s.intensity = 0;
  for (const s of hangar.crawlerSpots) s.intensity = 0;
    const base = new THREE.Mesh(new THREE.BoxGeometry(16, 0.5, 14), steel2); base.position.y = 0.25; base.receiveShadow = true; base.castShadow = true; g.add(base);
    for (const sx of [-4.6, 4.6]) for (const sz of [-3.0, 3.0]) {
      const clamp = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9, 2.2), yellow2); clamp.position.set(sx, 0.9, sz); clamp.castShadow = true; g.add(clamp);
      const ram = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.32, 2.4, 8), steel2); ram.position.set(sx, 2.2, sz); ram.castShadow = true; g.add(ram);
      const pad = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.18, 2.6), dark); pad.position.set(sx, 3.5, sz); g.add(pad);
    }
    // side service platform + stair from the bay floor to chest height
    const platY = 19.5;
    const plat = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.3, 9.0), steel2); plat.position.set(0, platY, 0); plat.castShadow = true; plat.receiveShadow = true; g.add(plat);
    for (const sx of [-2.7, 2.7]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.05, 9.0), yellow2); rail.position.set(sx, platY + 0.65, 0); g.add(rail);
      for (let k = 0; k < 5; k++) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.05, 0.08), yellow2); p.position.set(sx, platY + 0.55, -4 + k * 2); g.add(p); }
    }
    const stairN = 12;
    // flight runs down from the platform edge (z 4.6, y platY) to the floor; treads follow the stringer line
    const sLine = z => platY * (1 - (z - 4.6) / (stairN * 1.05));
    for (let i = 0; i < stairN - 1; i++) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.2, 1.25), steel2);
      const z = 4.6 + (i + 0.5) * 1.05;
      st.position.set(0, sLine(z) - 0.15, z); st.castShadow = st.receiveShadow = true; g.add(st);
    }
    const ang = Math.atan2(platY, stairN * 1.05);
    for (const sx of [-1.45, 1.45]) {
      const str = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.4, Math.hypot(stairN * 1.05, platY)), steel2);
      str.position.set(sx, platY / 2 - 0.2, 4.6 + stairN * 1.05 * 0.5); str.rotation.x = ang; str.castShadow = true; g.add(str);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, Math.hypot(stairN * 1.05, platY)), yellow2);
      rail.position.set(sx, platY / 2 + 1.05, 4.6 + stairN * 1.05 * 0.5); rail.rotation.x = ang; g.add(rail);
    }
    const land = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.22, 2.4), steel2);
    land.position.set(0, 0.12, 4.6 + stairN * 1.05 + 1.0); land.receiveShadow = true; g.add(land);
    // umbilical bundle / service box / work lights
    const boxS = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.8, 1.2), dark); boxS.position.set(0, platY + 0.9, -4.4); g.add(boxS);
    for (let i = 0; i < 3; i++) {
      const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 4.2, 5), new THREE.MeshStandardMaterial({ color: 0x151a1d, roughness: 0.8 }));
      cable.rotation.z = Math.PI / 2 - 0.2; cable.position.set(-1.2 + i * 1.2, platY + 1.4, -3.2); g.add(cable);
    }

    return g;
  }
  // side-bay cradles (platform, foot pads, steep ladder) removed: no machines stand in those bays

  const AUTO = false;   // motion disabled: it was not the main cost, but keep the scene static by request
  let last = performance.now(), t = 0, screenT = 0;
  function drawScreen(s, tt) {
    const x = s.x, c = s.c, W = 512, H = 256;
    x.fillStyle = '#050c12'; x.fillRect(0, 0, W, H);
    // header + grid
    x.fillStyle = 'rgba(90,150,175,0.14)'; for (let i = 0; i < H; i += 16) x.fillRect(0, i, W, 1);
    x.fillStyle = '#78cfe8'; x.font = 'bold 18px monospace'; x.fillText('HANGAR 04 / BAY ' + (1 + (s.phase | 0) % 6), 16, 28);
    x.fillStyle = '#3d6b7d'; x.font = '11px monospace'; x.fillText('STRUCT / POWER / HYDRAULIC / WEATHER', 16, 46);
    // waveform
    x.strokeStyle = '#89e6b0'; x.lineWidth = 2; x.beginPath();
    for (let i = 0; i < 220; i++) { const px = 16 + i * 2.2, py = 150 + Math.sin(i * 0.09 + tt * 2.5 + s.phase) * 18 + Math.sin(i * 0.31 + tt * 5) * 5; i ? x.lineTo(px, py) : x.moveTo(px, py); }
    x.stroke();
    // bars
    for (let i = 0; i < 9; i++) {
      const h = 22 + Math.abs(Math.sin(tt * 1.4 + i * 0.8 + s.phase)) * 62;
      x.fillStyle = i % 3 ? 'rgba(120,200,220,0.55)' : 'rgba(220,170,90,0.7)';
      x.fillRect(320 + i * 18, 210 - h, 12, h);
    }
    // status text
    x.fillStyle = '#d4b060'; x.font = '12px monospace';
    x.fillText('T-' + (9 + Math.floor(tt * 0.1)) + '  //  RAIN  ' + (18 + Math.sin(tt * 0.3) * 3).toFixed(1) + ' mm/h', 16, 236);
    s.tex.needsUpdate = true;
  }
  displayMechs.forEach((m, i) => { /* initial screen draw */ });

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    if (hallEnv) {
      const inside = camera.position.z < L.gate.z && camera.position.y < H.hallH + 8;
      const want = inside ? hallEnv : stormEnv;
      if (scene.environment !== want) { scene.environment = want; scene.environmentIntensity = inside ? 1.0 : 0.8; }
    }
    // lights breathe / occasional ballast flicker
    for (let i = 0; i < fixtures.length; i++) {
      const f = fixtures[i], sp = f.userData.spot;
      if (sp) sp.intensity = 880 + Math.sin(t * 0.8 + i) * 35 + (Math.random() < 0.0008 ? -240 : 0);
    }
    // display mechs idle: tiny weight shift + head scan (root only; no rig rebuild)
    displayMechs.forEach((m, i) => {
      const b = base[i];
      m.position.y = b.y + Math.sin(t * 0.55 + b.phase) * 0.035;
      m.rotation.y = b.ry + Math.sin(t * 0.22 + b.phase) * 0.012;
    });
    // control-room screens redraw at 10 Hz
    screenT += dt;
    if (screenT > 0.2) {
      screenT = 0;
      for (const s of screenMats) drawScreen(s, t);
      beaconLight.intensity = 4 + Math.abs(Math.sin(t * 2.2)) * 10;
    }
    // gantry trolley creep if the baselab exposes one
    for (const c of cranks) c.position.x = (c.userData.baseX ?? (c.userData.baseX = c.position.x)) + Math.sin(t * 0.12) * 3.5;
  }
  for (const s of screenMats) drawScreen(s, 0);
  if (AUTO) requestAnimationFrame(frame);

  // camera preset for the control room
  const nav = document.getElementById('cams');
  if (nav) {
    const b = document.createElement('button'); b.textContent = '控制室'; b.dataset.cam = 'control';
    b.onclick = () => {
      document.querySelectorAll('#cams button').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      camera.position.set(20, 24.5, hallZ1 + 78); controls.target.set(43, 21.0, hallZ1 + 10); controls.update();
    };
    nav.appendChild(b);
  }

  window.__interior = { root, fixtures, controlRoom: cr, ctlLift, screens: screenMats, displayMechs, beacon, fill,
    setIndustrial(k) { for (const f of fixtures) if (f.userData.spot) f.userData.spot.intensity = f.userData.spot.userData.base * k; for (const sp of extraSpots) sp.intensity = sp.userData.base * k; poolMat.opacity = poolMat.userData.base * Math.min(1.6, k); },
    setControl(on) { cr.traverse(o => { if (o.isPointLight) o.intensity = on ? 320 : 0; }); },
  };
}
