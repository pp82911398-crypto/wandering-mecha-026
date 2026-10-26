// Baselab 04 · outdoor port, first layout pass.
// One Jaeger, one crawler, one gate; the rest is the port: quay, sea, mountain hangar, standby pads, ships.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildMech } from './mech.js';
import { PAL } from '../finallab/paint.js';
import { SCHEMES } from '../finallab/schemes.js';
import { buildPort } from './port.js';
import { buildHangar } from './hangar.js';
import { L, PH, clamp01, smooth, span, mix } from './layout.js';
import { YOFF } from '../finallab/wear.js';

const $ = (id) => document.getElementById(id);
const Q = new URLSearchParams(location.search);
const stage = $('stage');
const loading = $('loading'), loadText = $('loadText');

function fail(msg) {
  loading.classList.remove('hide');
  loading.innerHTML = `<b>加载失败</b><span style="max-width:70vw;text-align:center;line-height:1.8">${String(msg).replace(/</g, '&lt;')}</span>`;
}
window.addEventListener('error', (e) => fail(e.message || '脚本错误'));
window.addEventListener('unhandledrejection', (e) => fail(e.reason?.message || e.reason || '未知错误'));

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
const LOW = Q.get('q') === 'low';
const USE_POST = !LOW;
const PR = Math.min(devicePixelRatio || 1, LOW ? 1 : 1.0);
renderer.setPixelRatio(PR);
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.50;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xd3e3ee, 250, 2250);

const camera = new THREE.PerspectiveCamera(36, innerWidth / innerHeight, 0.5, 6500);
camera.position.set(52, 13, 205);
camera.lookAt(10, 20, 112);

// ---------- finishing-room grade: bloom on the lamps, soft vignette, subtle film grain ----------
let composer = null, bloomPass = null, gradePass = null;
if (USE_POST) {
  composer = new EffectComposer(renderer);
  composer.setPixelRatio(PR);
  composer.setSize(innerWidth, innerHeight);
  composer.addPass(new RenderPass(scene, camera));
  bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.28, 0.62, 0.95);
  composer.addPass(bloomPass);
  gradePass = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uVig: { value: 0.92 }, uGrain: { value: 0.016 }, uTime: { value: 0 }, uSat: { value: 1.05 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float uVig, uGrain, uTime, uSat;
      varying vec2 vUv;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main(){
        vec4 c = texture2D(tDiffuse, vUv);
        vec3 col = c.rgb;
        float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
        col = mix(col, col * vec3(0.93, 1.0, 1.07), (1.0 - smoothstep(0.0, 0.4, l)) * 0.55);
        col = mix(col, col * vec3(1.06, 1.01, 0.93), smoothstep(0.4, 1.3, l) * 0.4);
        col = mix(vec3(l), col, uSat);
        col = (col - 0.5) * 1.05 + 0.5;
        vec2 d = vUv - 0.5;
        col *= 1.0 - dot(d, d) * uVig;
        col += (hash(vUv * 1024.0 + uTime) - 0.5) * uGrain;
        gl_FragColor = vec4(max(col, 0.0), c.a);
      }`,
  });
  composer.addPass(gradePass);
  composer.addPass(new OutputPass());
}

// ---------- sky / sun / environment ----------
const sunDir = new THREE.Vector3(0.52, 0.64, 0.48).normalize();
function makeSky(scale = 4500) {
  const s = new Sky();
  s.scale.setScalar(scale);
  const u = s.material.uniforms;
  u.turbidity.value = 2.6;
  u.rayleigh.value = 4.2;
  u.mieCoefficient.value = 0.0038;
  u.mieDirectionalG.value = 0.82;
  u.sunPosition.value.copy(sunDir);
  return s;
}
const sky = makeSky();
sky.renderOrder = -10;
scene.add(sky);

// environment light from the same sky (PMREM)
try {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envSky = makeSky(50);
  envScene.add(envSky);
  const envRT = pmrem.fromScene(envScene, 0.03, 0.1, 100);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.38;
  pmrem.dispose();
  envSky.geometry.dispose(); envSky.material.dispose();
} catch (e) { console.warn('PMREM sky failed, falling back to lights', e); }

const hemi = new THREE.HemisphereLight(0xcfe4f2, 0x6f6657, 0.24);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2e2, 3.0);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
// fixed shadow volume: hangar hall + tunnel + apron + stopping pad.
// It has to cover the hangar even when the crawler is out on the pier, otherwise the sun leaks
// through the hall walls and burns the interior.
Object.assign(sun.shadow.camera, { left: -285, right: 285, top: 285, bottom: -285, near: 1, far: 1250 });
sun.shadow.camera.updateProjectionMatrix();
sun.shadow.bias = -0.0007;
sun.shadow.normalBias = 0.14;
sun.shadow.autoUpdate = false;
sun.target.position.set(10, 12, -85);
sun.position.copy(sun.target.position).addScaledVector(sunDir, 560);
scene.add(sun, sun.target);
const fill = new THREE.DirectionalLight(0xbcd8ea, 0.2);
fill.position.set(-240, 160, -260);
scene.add(fill);

// ---------- water ----------
function waterNormalMap() {
  const S = 512;
  const H = (x, y) => Math.sin(x * 0.019 + Math.sin(y * 0.006) * 2.2) * 0.55
    + Math.sin(y * 0.024 + Math.cos(x * 0.005) * 2.6) * 0.34
    + Math.sin((x + y) * 0.045) * 0.11;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * 5.0, dy = (H(x, y + 1) - H(x, y - 1)) * 5.0;
    let nx = -dx, ny = -dy, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * S + x) * 4;
    img.data[i] = (nx * 0.5 + 0.5) * 255; img.data[i + 1] = (ny * 0.5 + 0.5) * 255; img.data[i + 2] = (nz * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 8;
  tex.repeat.set(210, 210);
  return tex;
}
const waterNrm = waterNormalMap();
const waterMat = new THREE.MeshStandardMaterial({
  color: 0x17424e, metalness: 0.18, roughness: 0.3,
  normalMap: waterNrm, normalScale: new THREE.Vector2(0.4, 0.4),
  envMapIntensity: 0.5,
});
const water = new THREE.Mesh(new THREE.PlaneGeometry(7000, 7000), waterMat);
water.rotation.x = -Math.PI / 2;
water.position.y = L.waterY;
scene.add(water);

// ---------- clouds ----------
function cloudTexture(seed) {
  const W = 512, H = 256;
  // layered value noise for the cumulus sprites
  const hash = (i, j) => { const v = Math.sin(i * 127.1 + j * 311.7 + seed * 43.7) * 43758.5453; return v - Math.floor(v); };
  const noise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
  };
  const fbm = (x, y) => { let a = 0.5, s = 0, t = 0; for (let i = 0; i < 5; i++) { s += a * noise(x, y); t += a; x *= 2.05; y *= 2.05; a *= 0.5; } return s / t; };
  return new Promise((resolve) => {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d'); const img = ctx.createImageData(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const u = x / W, v = y / H;
      const d = fbm(u * 5.5, v * 3.2) * 0.65 + fbm(u * 12.0 + 7.3, v * 7.0 + 2.1) * 0.35;
      const ex = Math.min(1, Math.min(u, 1 - u) * 5.2), ey = Math.min(1, Math.min(v, 1 - v) * 4.2);
      let a = Math.max(0, Math.min(1, (d - 0.50) / 0.16));
      a = Math.pow(a, 1.35) * ex * ey;
      const shade = 0.82 + 0.18 * (1 - v) + (d - 0.5) * 0.18;
      const i = (y * W + x) * 4;
      img.data[i] = 255 * Math.min(1, shade); img.data[i + 1] = 255 * Math.min(1, shade); img.data[i + 2] = 255 * Math.min(1, shade * 0.985 + 0.015); img.data[i + 3] = a * 255;
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    resolve(tex);
  });
}
const clouds = new THREE.Group();
scene.add(clouds);
const cloudTexs = await Promise.all([cloudTexture(1), cloudTexture(2), cloudTexture(3)]);
const cloudDefs = [
  [-950, 540, -1750, 980, 360, 0],
  [-260, 700, -2200, 1150, 430, 1],
  [980, 480, -1650, 860, 330, 2],
  [1650, 620, -450, 950, 370, 0],
  [-1900, 430, -500, 880, 330, 1],
];
for (const [x, y, z, w, h, k] of cloudDefs) {
  const mat = new THREE.SpriteMaterial({ map: cloudTexs[k], transparent: true, opacity: 0.9, depthWrite: false, fog: false, toneMapped: false });
  const sp = new THREE.Sprite(mat);
  sp.position.set(x, y, z); sp.scale.set(w, h, 1);
  clouds.add(sp);
}

// ---------- build ----------
loadText.textContent = '装配 026 成品机甲（paint / relief / details / reactor）…';
await new Promise(r => requestAnimationFrame(() => setTimeout(r, 20)));
const mech = buildMech({ scheme: 'navy', wear: 0.5 });
YOFF.value = L.crawler.deckTop + mech.groundOffset;   // keep the foot-to-waist grime band after lifting onto the crawler

loadText.textContent = '铺设码头 / 山体 / 停机台…';
await new Promise(r => requestAnimationFrame(() => setTimeout(r, 20)));
const port = buildPort();

loadText.textContent = '挖掘机库 / 组装履带平台…';
await new Promise(r => requestAnimationFrame(() => setTimeout(r, 20)));
const hangar = buildHangar(mech.feet);

hangar.crawler.add(mech.group);
mech.group.position.set(0, hangar.deckTop, 0);
scene.add(port.root, hangar.root);

// ---- additional display Jaegers in the enlarged hall (same finished mech, different schemes) ----
function schemeClone(src, schemeKey, x, z, ry, padR = 0) {
  const root = src.clone(true);
  const SC = SCHEMES[schemeKey] || SCHEMES.night;
  const map = new Map();
  root.traverse(o => {
    if (!o.isMesh || !o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const made = mats.map(m => {
      if (map.has(m)) return map.get(m);
      const c = m.clone();
      for (const [k, pm] of Object.entries(PAL)) {
        if (pm === m && SC.mat[k]) { const [col, met, rough] = SC.mat[k]; c.color.setHex(col); c.metalness = met; c.roughness = rough; }
      }
      map.set(m, c); return c;
    });
    o.material = Array.isArray(o.material) ? made : made[0];
  });
  if (!SC.stripes) root.traverse(o => { if (o.name?.startsWith('decal:红条')) o.visible = false; });
  root.position.set(x, 0, z); root.rotation.y = ry;
  root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  if (padR) {
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(10.5, 11.5, 0.5, 32), new THREE.MeshStandardMaterial({ color: 0x30373a, roughness: 0.72, metalness: 0.4 }));
    pad.position.set(x, 0.25, z); pad.receiveShadow = true; pad.castShadow = true; hangar.root.add(pad);
  }
  hangar.root.add(root);
  return root;
}

// ---------- camera / controls ----------
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.065;
controls.screenSpacePanning = true;
controls.zoomToCursor = true;
controls.minDistance = 8;
controls.maxDistance = 1600;
controls.minPolarAngle = 0.06;
controls.maxPolarAngle = Math.PI * 0.86;
controls.target.set(10, 20, 112);

const CAMS = {
  hangar: { p: [-15, 11.5, -201], t: [4, 23, -245], fov: 47 },
  hall: { p: [30, 32, -222], t: [0, 20, -326], fov: 52 },
  mech: { p: [21, 27, -209], t: [4, 26, -244], fov: 40 },   // hall fallback; the crawler follow view is used for the parked mech
  gate: { p: [58, 18, -62], t: [4, 28, -150], fov: 42 },
  wide: { p: [52, 13, 205], t: [10, 20, 112], fov: 36 },
  overview: { p: [-86, 82, 238], t: [-8, 10, 55], fov: 45 },
  sea: { p: [80, 0.4, 160], t: [10, 28, 112], fov: 48 },
};
let mode = 'wide';
let tween = null;
let autoCam = false;

function followPose() {
  const c = hangar.crawler.position;
  // lead the crawler from the front-right so the camera sees the machine, not its back frame
  return { p: [c.x + 18, 28, c.z + 64], t: [c.x, 22, c.z + 2], fov: 42 };
}
function tweenCam(p, t, fov, dur = 1.25) {
  tween = {
    p0: camera.position.clone(), p1: new THREE.Vector3(...p),
    t0: controls.target.clone(), t1: new THREE.Vector3(...t),
    f0: camera.fov, f1: fov, start: performance.now(), dur: dur * 1000,
  };
  controls.enabled = false;
}
function setActiveCam() {
  document.querySelectorAll('#cams button').forEach(b => b.classList.toggle('on', b.dataset.cam === mode));
}
function setCam(name, instant = false) {
  if (!name) name = 'free';
  mode = name;
  tween = null;
  setActiveCam();
  if (name === 'follow') {
    const f = followPose();
    if (instant) { camera.position.set(...f.p); controls.target.set(...f.t); camera.fov = f.fov; camera.updateProjectionMatrix(); controls.update(); }
    else tweenCam(f.p, f.t, f.fov, 1.1);
    controls.enabled = false;
  } else if (name === 'free') {
    controls.enabled = true; controls.update();
  } else {
    const c = CAMS[name];
    if (instant) { camera.position.set(...c.p); controls.target.set(...c.t); camera.fov = c.fov; camera.updateProjectionMatrix(); controls.update(); }
    else tweenCam(c.p, c.t, c.fov);
  }
}
function cancelToFree() {
  if (mode === 'free' && !tween) return;
  if (mode === 'follow') controls.target.set(...followPose().t);
  tween = null; mode = 'free'; controls.enabled = true;
  controls.update(); setActiveCam();
}
renderer.domElement.addEventListener('pointerdown', () => cancelToFree(), true);

// Keep the free camera inside the hangar shell. Without this, orbiting the machine in the
// 60 m hall immediately pushes the near plane through a wall and the screen fills with concrete.
function clampHangarCamera() {
  const p = camera.position, H = L.hangar, gx = L.gate.cx;
  if (p.z > L.gate.z) return;                    // outside / apron: free
  if (p.z < H.hallZ0) {                          // hall volume
    const hx = H.hallW / 2 - 3;
    p.x = Math.min(gx + hx, Math.max(gx - hx, p.x));
    p.y = Math.min(H.hallH - 3, Math.max(3, p.y));
    p.z = Math.min(H.hallZ0 - 1.5, Math.max(H.hallZ1 + 4, p.z));
  } else {                                       // tunnel volume
    const tx = H.tunnelW / 2 - 3;
    if (Math.abs(p.x - gx) < tx + 3) {
      p.x = Math.min(gx + tx, Math.max(gx - tx, p.x));
      p.y = Math.min(H.tunnelH - 3, Math.max(3, p.y));
    } else {                                     // hit a junction wall: put it back in the hall
      p.z = H.hallZ0 - 1.5;
      const hx = H.hallW / 2 - 3;
      p.x = Math.min(gx + hx, Math.max(gx - hx, p.x));
      p.y = Math.min(H.hallH - 3, Math.max(3, p.y));
    }
  }
}

// ---------- timeline ----------
const state = { t: Q.has('t') ? clamp01(+Q.get('t')) : 1, playing: false, started: false };
const playBtn = $('playBtn'), progress = $('progress'), phaseEl = $('phase'), tvalEl = $('tval');

function phaseName(t) {
  if (t < 0.100) return '机库灯亮';
  if (t < 0.320) return '防爆门开启';
  if (t < 0.880) return '履带平台出库';
  if (t < 0.900) return '停靠码头';
  if (t < 0.999) return '关闭防爆门';
  return '已停靠';
}
function applyT(t) {
  state.t = clamp01(t);
  const C = L.crawler;
  // 1) hangar lights (with a short start flicker)
  let lights = span(state.t, PH.lights[0], PH.lights[1]);
  if (state.t < PH.lights[1]) lights *= 0.55 + 0.45 * Math.abs(Math.sin(state.t * 210));
  // 2) two door layers, outer first; close again after the crawler has parked
  const open = span(state.t, PH.door[0], PH.door[1]);
  const close = span(state.t, 0.900, 1.000);
  const dp = open * (1 - close);
  const outer = span(dp, 0, 0.62), inner = span(dp, 0.38, 1);
  hangar.setDoor(outer, inner);
  // boarding bridge pulls back into its stub during the light-up phase, before the doors move; cage parked at ground
  { const back = 1 - span(state.t, PH.lights[0], PH.lights[1]); hangar.lift.set(0, back); hangar.cant.set(back); }
  // 3) drive
  const drv = span(state.t, PH.drive[0], PH.drive[1]);
  const z = mix(C.startZ, C.endZ, drv);
  const x = mix(C.startX, C.endX, span(drv, 0.72, 1));
  const moving = state.t > PH.drive[0] + 0.002 && state.t < PH.drive[1] - 0.002;
  const bob = moving ? Math.sin(state.t * 2400) * 0.045 : 0;
  hangar.crawler.position.set(x, bob, z);
  hangar.setRoll(z - C.startZ);
  const now = performance.now() / 1000;
  hangar.updateLights(lights, smooth(dp), now);
  // shadow map is static; refresh when the crawler moves (its own shadow travels with it)
  renderer.shadowMap.needsUpdate = true;
  // UI
  progress.value = String(Math.round(state.t * 1000));
  tvalEl.textContent = `${Math.round(state.t * 100)}%`;
  phaseEl.textContent = phaseName(state.t);
  if (state.playing) playBtn.textContent = '暂停';
  else if (!state.started) playBtn.textContent = '出库';
  else if (state.t >= 0.999) playBtn.textContent = '重播';
  else if (state.t <= 0.001) playBtn.textContent = '出库';
  else playBtn.textContent = '继续';
  playBtn.classList.toggle('playing', state.playing);
  // follow camera
  if (mode === 'follow' && !tween) {
    const f = followPose();
    camera.position.set(...f.p);
    controls.target.set(...f.t);
  }
}

function play() {
  if (state.playing) { state.playing = false; applyT(state.t); return; }
  if (state.t >= 0.999 || state.t <= 0.0005) { state.t = 0; }
  state.playing = true; state.started = true;
  autoCam = mode !== 'free';
  if (mode === 'wide' || mode === 'hangar' || mode === 'hall' || mode === 'mech' || mode === 'gate' || mode === 'sea' || mode === 'overview') setCam('follow');
  applyT(state.t);
}
playBtn.addEventListener('click', play);
progress.addEventListener('input', () => {
  state.playing = false; state.started = true; autoCam = false;
  applyT(+progress.value / 1000);
});
document.querySelectorAll('#cams button').forEach(b => b.addEventListener('click', () => {
  autoCam = false;
  setCam(b.dataset.cam);
  if (mode === 'follow') applyT(state.t);
}));

// URL overrides
if (Q.has('cam')) {
  const c = Q.get('cam');
  if (CAMS[c] || c === 'follow' || c === 'free') setCam(c, true);
} else setCam('wide', true);
if (Q.has('shot')) document.body.classList.add('shot');
if (Q.get('play') === '1') { state.t = 0; play(); }
applyT(state.t);

// ---------- loop ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (state.playing) {
    applyT(state.t + dt / 30);
    if (state.t >= 0.999) {
      state.playing = false;
      applyT(1);
      const doSwitch = autoCam && mode === 'follow';
      autoCam = false;
      if (doSwitch) setTimeout(() => { if (!state.playing && mode === 'follow') setCam('wide'); }, 1100);
    }
  }
  if (tween) {
    const k = clamp01((now - tween.start) / tween.dur), e = smooth(k);
    camera.position.lerpVectors(tween.p0, tween.p1, e);
    controls.target.lerpVectors(tween.t0, tween.t1, e);
    camera.fov = mix(tween.f0, tween.f1, e);
    camera.updateProjectionMatrix();
    if (k >= 1) {
      const doneFollow = mode === 'follow';
      tween = null;
      controls.enabled = !doneFollow;
      controls.update();
      if (doneFollow) { const f = followPose(); camera.position.set(...f.p); controls.target.set(...f.t); }
    }
  } else if (controls.enabled) controls.update();
  if (!tween) clampHangarCamera();
  if (mech.rotor) mech.rotor.update(dt);
  if (mech.prop) mech.prop.update(dt);
  // water / clouds drift
  waterNrm.offset.x = now * 0.0000045;
  waterNrm.offset.y = now * 0.000008;
  clouds.position.x = Math.sin(now * 0.000006) * 10;
  hangar.tick(now * 0.001);
  if (gradePass) gradePass.uniforms.uTime.value = now * 0.001;
  if (composer) composer.render();
  else renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  const pr = Math.min(devicePixelRatio || 1, LOW ? 1 : 1.6);
  renderer.setPixelRatio(pr);
  renderer.setSize(innerWidth, innerHeight);
  if (composer) { composer.setPixelRatio(pr); composer.setSize(innerWidth, innerHeight); }
});

// debug
window.__lab = { scene, camera, renderer, controls, state, mech, port, hangar, applyT, setCam, L };
window.__info = () => {
  const bb = new THREE.Box3().setFromObject(mech.group);
  return {
    t: state.t, mode, cam: camera.position.toArray().map(v => +v.toFixed(2)),
    target: controls.target.toArray().map(v => +v.toFixed(2)), fov: camera.fov,
    mechBox: [bb.min.toArray().map(v => +v.toFixed(2)), bb.max.toArray().map(v => +v.toFixed(2))],
    mechHeight: +(bb.max.y - bb.min.y).toFixed(2),
    crawler: hangar.crawler.position.toArray().map(v => +v.toFixed(2)),
    doors: [hangar.door.outerL.position.x, hangar.door.outerR.position.x, hangar.door.innerL.position.x, hangar.door.innerR.position.x].map(v => +v.toFixed(2)),
    calls: renderer.info.render.calls, tris: renderer.info.render.triangles,
    size: [renderer.domElement.width, renderer.domElement.height],
  };
};

// first render
loadText.textContent = '第一帧…';
renderer.shadowMap.needsUpdate = true;
if (composer) composer.render(); else renderer.render(scene, camera);
requestAnimationFrame(frame);
setTimeout(() => loading.classList.add('hide'), 260);
