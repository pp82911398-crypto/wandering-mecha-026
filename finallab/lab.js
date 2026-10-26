// Model assembly and permanent body changes live in model.js (also consumed by domelab).
// This file owns the finishing-room UI, camera, lighting and animation controls.
// 026 finishing room: the full body from the part labs (unchanged), repainted (paint.js), with running lights and
// markings (lamps.js), PBR lighting, bloom, and a 4K still export.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { setOpen } from '../headlab/head.js';
import { LEG } from '../leglab/leg.js';
import { PAL } from './paint.js';
import { SCHEMES, applyScheme } from './schemes.js';
import { WEAR } from './wear.js';
import { ROUND } from './rounding.js';
import { setupCompare } from './roundRules.js';
import { SURF, studioEnv, detailTexture } from './surface.js';
import { buildFinishedModel } from './model.js';
import { DEFAULT_STANCE_ABD } from './lowerRig.js';
import { publishFinishedAppearance } from './appearance.js';

const $ = id => document.getElementById(id);
const status = t => $('status').textContent = t;
const Q = new URLSearchParams(location.search);
ROUND.enabled = Q.get('round') !== '0';   // 分级 R 角；?round=0 = 原版硬边对照

// ---------- build (lab materials, then repaint) ----------
status('建模中…'); await new Promise(r => setTimeout(r, 30));
const t0 = performance.now();
const scene = new THREE.Scene();
const MODEL = buildFinishedModel({ rounded: ROUND.enabled, wear: +(Q.get('wear') ?? 0.5),
  rotorSpeed: +(Q.get('spin') ?? 0), jointGlow: Q.get('jointGlow') !== '0' });
const { mech, body, HEAD, NR, WR, torso, A, LG, BLADES, THR, stats, TWEAKS, RND,
  RELIEF, STRIPES, RELIEF_ALL, DT, HC, REACTOR, ROTOR, MK, FOREHEAD, PROP, JOINT_GLOW } = MODEL;
scene.add(mech);
status(`建模+上色 ${(performance.now() - t0).toFixed(0)} ms`);

// ---------- renderer ----------
const el = $('c');
const renderer = new THREE.WebGLRenderer({ antialias: true });   // no preserveDrawingBuffer: it can make Chrome present a whole black tile for one frame
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true;
el.appendChild(renderer.domElement);
// a lost WebGL context can present as a large black tile for one or more frames; recover fast
renderer.domElement.addEventListener('webglcontextlost', e => {
  e.preventDefault(); status('显卡上下文丢失，正在恢复…');
  setTimeout(() => location.reload(), 800);
});

// ---------- sky / environment: overcast storm grey (render-stage scene comes later) ----------
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, uniforms: { top: { value: new THREE.Color(0x2c343c) }, mid: { value: new THREE.Color(0x6d7780) }, bot: { value: new THREE.Color(0x1a1e22) } },
  vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: 'uniform vec3 top, mid, bot; varying vec3 vP; void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(mid, top, smoothstep(0.0, 0.6, h)) : mix(mid, bot, smoothstep(0.0, 0.15, -h)); gl_FragColor = vec4(c, 1.0); }',
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), skyMat); sky.name = 'studioSky'; scene.add(sky);
{ // reflections: the sky plus two soft cloud-break cards
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), skyMat));
  const card = (c, i, p, s) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(s[0], s[1]), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(i), side: THREE.DoubleSide })); m.position.set(...p); m.lookAt(0, 0, 0); envScene.add(m); };
  card(0xdfe6ec, 1.4, [20, 30, 25], [30, 14]); card(0xb8c4cc, 1.0, [-30, 12, -20], [26, 10]);
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(envScene, 0.03).texture; scene.environmentIntensity = 0.65;
}
// 材质升级：摄影棚反射环境（一次性烘焙）+ 全身共用细节图；?surf=0 或面板开关 = 原版材质
const ENV_OLD = scene.environment, ENV_NEW = studioEnv(renderer, skyMat);
SURF.detail.value ||= detailTexture();
SURF.envK = 0.8;   // 新环境更亮，乘这个系数保持整体亮度不变（实测平均亮度对齐）
function setSurface(on) { SURF.on.value = on ? 1 : 0; scene.environment = on ? ENV_NEW : ENV_OLD; }
setSurface(Q.get('surf') !== '0');
scene.fog = new THREE.FogExp2(0x4c565e, 0.0045);
function studioFloorTex() {
  const S = 1024, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d');
  x.fillStyle = '#252a2d'; x.fillRect(0, 0, S, S);
  let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 2600; i++) {
    const px = rnd() * S, py = rnd() * S, rr = 1 + rnd() * 26;
    x.fillStyle = `rgba(${rnd() < 0.5 ? '12,14,15' : '150,158,160'},${0.012 + rnd() * 0.028})`;
    x.beginPath(); x.ellipse(px, py, rr, rr * (0.35 + rnd() * 0.9), rnd() * Math.PI, 0, Math.PI * 2); x.fill();
  }
  // grime streaks
  for (let i = 0; i < 26; i++) {
    const px = rnd() * S, py = rnd() * S, len = 40 + rnd() * 260;
    const g = x.createLinearGradient(0, py, 0, py + len);
    g.addColorStop(0, 'rgba(8,10,11,0.12)'); g.addColorStop(1, 'rgba(8,10,11,0)');
    x.fillStyle = g; x.fillRect(px, py, 1 + rnd() * 20, len);
  }
  // 1 m studio grid: 8 coarse cells + fine subgrid
  x.strokeStyle = 'rgba(170,180,184,0.15)'; x.lineWidth = 2;
  for (let i = 0; i <= S; i += S / 8) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, S); x.moveTo(0, i); x.lineTo(S, i); x.stroke(); }
  x.strokeStyle = 'rgba(170,180,184,0.055)'; x.lineWidth = 1;
  for (let i = 0; i <= S; i += S / 32) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, S); x.moveTo(0, i); x.lineTo(S, i); x.stroke(); }
  // painted centre marks
  x.strokeStyle = 'rgba(205,210,205,0.16)'; x.lineWidth = 6; x.strokeRect(S * 0.25, S * 0.25, S * 0.5, S * 0.5);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(24, 24); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
const ground = new THREE.Mesh(new THREE.CircleGeometry(400, 64), new THREE.MeshStandardMaterial({
  color: 0xffffff, map: studioFloorTex(), roughness: 0.62, metalness: 0.15,
}));
ground.rotation.x = -Math.PI / 2; ground.position.y = LEG.ground - 0.01; ground.receiveShadow = true; ground.name = 'studioGround'; scene.add(ground);

// soft contact shadow: a cheap grounding blob under the display area, independent of the soft 2K shadow
{
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.62)'); g.addColorStop(0.45, 'rgba(0,0,0,0.38)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace;
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(66, 82), new THREE.MeshBasicMaterial({
    map: t, transparent: true, opacity: 0.6, depthWrite: false, color: 0x000000, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  }));
  blob.rotation.x = -Math.PI / 2; blob.position.set(0, LEG.ground + 0.02, 12); blob.renderOrder = 1; blob.name = 'studioBlob';
  scene.add(blob);
}

const key = new THREE.DirectionalLight(0xe8eef4, 2.1); key.name = 'studioKey'; key.position.set(28, 40, 34); key.castShadow = true;
Object.assign(key.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 140 }); key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.03;
key.target.position.set(0, -16, 0); scene.add(key, key.target);
const rim = new THREE.DirectionalLight(0xa9c2d6, 1.6); rim.name = 'studioRim'; rim.position.set(-30, 18, -40); scene.add(rim);
const hemi = new THREE.HemisphereLight(0x9aa8b4, 0x2a2d30, 0.6); hemi.name = 'studioHemi'; scene.add(hemi);

// ---------- camera / post ----------
const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 2000);
const VIEWS = {
  hero: { p: [30, -31, 80], t: [0, -15, 0], f: 34 },
  top: { p: [0, 60, 0.01], t: [0, -15, 0], f: 34, up: [0, 0, -1] },
  low: { p: [0, -34, 62], t: [0, -8, 0], f: 40 },
  front: { p: [0, -14, 92], t: [0, -15, 0], f: 30 },
  side: { p: [92, -14, 4], t: [0, -15, 0], f: 30 },
  back: { p: [-30, -10, -82], t: [0, -15, 0], f: 30 },
  pushup: { p: [68, -16, 50], t: [0, -29, 21], f: 36 },
};
let camYaw = 0, camPitch = 0;
const _camE = new THREE.Euler(0, 0, 0, 'YXZ');
function syncCamAngles() { _camE.setFromQuaternion(cam.quaternion, 'YXZ'); camYaw = _camE.y; camPitch = _camE.x; }
function view(k) { const v = VIEWS[k]; cam.up.set(...(v.up || [0, 1, 0])); cam.position.set(...v.p); cam.fov = v.f; cam.updateProjectionMatrix(); cam.lookAt(...v.t); syncCamAngles(); }
function viewAt(p, t, f = cam.fov) { cam.up.set(0, 1, 0); cam.position.set(p[0], p[1], p[2]); cam.fov = f; cam.updateProjectionMatrix(); cam.lookAt(t[0], t[1], t[2]); syncCamAngles(); }
view(Q.get('view') || 'front');

// game-standard free camera: click to lock the mouse, mouse look, WASD move, Q/E down/up, Shift boost, wheel FOV zoom
// two ways to look: hold left mouse and drag, or click once to lock the mouse
let dragLook = false, dragDist = 0, dragX = 0, dragY = 0;
const canvas = renderer.domElement;
canvas.style.touchAction = 'none';
canvas.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  e.preventDefault(); dragLook = true; dragDist = 0; dragX = e.clientX; dragY = e.clientY;
  canvas.setPointerCapture?.(e.pointerId); canvas.style.cursor = 'grabbing';
});
canvas.addEventListener('pointermove', e => {
  if (!dragLook || document.pointerLockElement === canvas) return;
  const dx = e.clientX - dragX, dy = e.clientY - dragY; dragX = e.clientX; dragY = e.clientY;
  dragDist += Math.abs(dx) + Math.abs(dy);
  camYaw -= dx * 0.003;
  camPitch = Math.max(-1.55, Math.min(1.55, camPitch - dy * 0.003));
  cam.quaternion.setFromEuler(new THREE.Euler(camPitch, camYaw, 0, 'YXZ'));
});
const endDragLook = e => {
  if (!dragLook) return;
  dragLook = false; canvas.style.cursor = '';
  try { canvas.releasePointerCapture?.(e.pointerId); } catch {}
};
canvas.addEventListener('pointerup', endDragLook);
canvas.addEventListener('pointercancel', endDragLook);
canvas.addEventListener('click', () => {
  if (dragDist > 4) { dragDist = 0; return; }
  if (document.pointerLockElement !== canvas) canvas.requestPointerLock?.();
});
addEventListener('mousemove', e => {
  if (document.pointerLockElement !== renderer.domElement) return;
  camYaw -= e.movementX * 0.0022;
  camPitch = Math.max(-1.55, Math.min(1.55, camPitch - e.movementY * 0.0022));
  cam.quaternion.setFromEuler(new THREE.Euler(camPitch, camYaw, 0, 'YXZ'));
});
renderer.domElement.addEventListener('wheel', e => {
  e.preventDefault();
  cam.fov = Math.max(10, Math.min(80, cam.fov + Math.sign(e.deltaY) * 2));
  cam.updateProjectionMatrix();
}, { passive: false });

const NAV = { f: 0, b: 0, l: 0, r: 0, up: 0, dn: 0, fast: false };
const NAV_KEYS = { KeyW: 'f', KeyS: 'b', KeyA: 'l', KeyD: 'r', KeyE: 'up', KeyQ: 'dn' };
const isField = el => el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);
addEventListener('keydown', e => {
  if (isField(e.target)) return;
  const k = NAV_KEYS[e.code]; if (!k) return;
  e.preventDefault(); NAV[k] = 1; NAV.fast = e.shiftKey;
});
addEventListener('keyup', e => { const k = NAV_KEYS[e.code]; if (k) { NAV[k] = 0; NAV.fast = e.shiftKey; } });
addEventListener('blur', () => { for (const k of Object.keys(NAV)) NAV[k] = 0; });
const _navF = new THREE.Vector3(), _navR = new THREE.Vector3(), _navU = new THREE.Vector3(0, 1, 0);
function navUpdate(dt) {
  const f = NAV.f - NAV.b, s = NAV.r - NAV.l, u = NAV.up - NAV.dn;
  if (!f && !s && !u) return;
  _navF.set(0, 0, -1).applyQuaternion(cam.quaternion);
  _navR.set(1, 0, 0).applyQuaternion(cam.quaternion);
  const step = (NAV.fast ? 55 : 18) * dt;
  cam.position.addScaledVector(_navF, f * step).addScaledVector(_navR, s * step).addScaledVector(_navU, u * step);
}
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, cam));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 0.4, 1.05); composer.addPass(bloom);
composer.addPass(new OutputPass());
function resize() { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h, false); composer.setSize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix(); }
new ResizeObserver(resize).observe(el); resize();

// ---------- control panel (right side, collapsible groups) ----------
const headGroup = HEAD;
// 头部转动范围（数值碰撞检查定的，见 CLAUDE.md）与环顾动作：[结束时间 s, 左右(× 上限), 俯仰°]
const HEAD_LIM = { yaw: 40, up: 20, down: 9 };
// 俯仰随转头收窄（穿模扫描结果）：[|左右转|°, 抬头上限, 低头上限]；转 40° 时脸颊擦围脖一小片，可接受
const HEAD_ENV = [[0, 20, 9], [5, 20, 9], [10, 15, 9], [15, 15, 9], [20, 12, 9], [25, 12, 9], [30, 12, 6], [35, 12, 4], [40, 12, 0]];
const headEnv = (y) => { y = Math.min(40, Math.abs(y)); for (let i = 1; i < HEAD_ENV.length; i++) { const [a, u0, d0] = HEAD_ENV[i - 1], [b, u1, d1] = HEAD_ENV[i]; if (y <= b) { const t = (y - a) / (b - a); return [u0 + (u1 - u0) * t, d0 + (d1 - d0) * t]; } } return [12, 0]; };
const HEAD_LOOK = [[0.4, 0, 0], [2.4, 0.8, -3], [2.9, 0.8, -3], [5.0, -0.8, 6], [5.6, -0.8, 6], [7.0, 0.25, -8], [7.6, 0.25, -8], [9.0, 0, 0]];
// 腰部：扭腰 / 前屈后仰 / 侧弯，同样阻尼缓动；范围由穿模扫描定（见 CLAUDE.md）
const WAIST_LIM = { twist: 15, fwd: 12, back: 6, side: 10 };   // 单向上限；多向同时走时总幅度收到 1.25（WAIST_NORM）
const WAIST_NORM = 1.25;
const WAIST_SEQ = [[1.6, 0, -5, 0], [2.4, 0, -5, 0], [4.0, 0, 11, 0], [4.6, 0, 11, 0], [6.2, 14, 2, 0], [6.8, 14, 2, 0], [8.4, -14, 2, 0], [9.0, -14, 2, 0], [10.4, 0, 0, 8], [11.0, 0, 0, 8], [12.4, 0, 0, -8], [13.0, 0, 0, -8], [14.6, 0, 0, 0]];   // [结束 s, 扭, 前屈(+)/后仰(−), 侧弯]
const WAISTCTL = { target: { twist: 0, bend: 0, side: 0 }, cur: { twist: 0, bend: 0, side: 0 }, vel: { twist: 0, bend: 0, side: 0 }, seq: null, ui: {} };
const HEADCTL = { target: { yaw: 0, pitch: 0 }, cur: { yaw: 0, pitch: 0 }, vel: { yaw: 0, pitch: 0 }, look: null, ui: {}, dirty: false };
const R2D = Math.PI / 180, fmt2 = v => (+v).toFixed(2), deg = v => Math.round(v) + '°';
const panel = $('panel');
function section(title, open = false) { const d = document.createElement('details'); d.open = open; d.innerHTML = `<summary>${title}</summary>`; const b = document.createElement('div'); b.className = 'sec'; d.appendChild(b); panel.appendChild(d); return b; }
const resetters = [];
function slider(sec, label, min, max, step, val, f, on) {
  const row = document.createElement('label'); row.className = 'row';
  row.innerHTML = `<span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${val}"><b></b>`;
  const inp = row.querySelector('input'), out = row.querySelector('b');
  const set = v => { inp.value = v; out.textContent = f(+inp.value); on(+inp.value); };
  inp.oninput = () => set(+inp.value); out.textContent = f(val); sec.appendChild(row); resetters.push(() => set(val)); return { inp, set };
}
function buttons(sec, list) { const r = document.createElement('div'); r.className = 'btns'; for (const [t, fn] of list) { const b = document.createElement('button'); b.textContent = t; b.onclick = fn; r.appendChild(b); } sec.appendChild(r); }
function check(sec, label, on, initial = false) { const r = document.createElement('label'); r.className = 'row chk'; r.innerHTML = `<input type="checkbox"><span>${label}</span>`; const c = r.querySelector('input'); c.checked = initial; c.onchange = () => on(c.checked); sec.appendChild(r); resetters.push(() => { c.checked = initial; on(initial); }); return c; }
function note(sec, t) { const p = document.createElement('p'); p.className = 'note'; p.textContent = t; sec.appendChild(p); }

// 视角 / 出图
{ const s = section('视角 · 出图', true);
  buttons(s, [['3/4', () => view('hero')], ['俯视', () => view('top')], ['仰视', () => view('low')], ['正面', () => view('front')], ['侧面', () => view('side')], ['背面', () => view('back')]]);
  note(s, '点击画面锁定鼠标，或按住左键拖动看方向 · WASD 移动 · Q/E 升降 · Shift 加速 · 滚轮缩放 · Esc 释放鼠标；按钮切固定机位');
  slider(s, '曝光', 0.4, 1.8, 0.02, 1, fmt2, v => renderer.toneMappingExposure = v).inp.id = 'exp';
  buttons(s, [['出图 4K', () => shot(3840, 2160)], ['全部复位', () => resetters.forEach(f => f())]]); }
// 涂装 / 灯光
const schemeCtx = { scene, mech, rim, key, renderer, stripes: STRIPES };
{ const s = section('涂装 · 灯光 · 做旧', true);
  const row = document.createElement('label'); row.className = 'row'; row.innerHTML = '<span>涂装</span><select></select>'; s.appendChild(row);
  const sel = row.querySelector('select'); for (const [k, S] of Object.entries(SCHEMES)) sel.add(new Option(S.cn, k));
  sel.id = 'finishScheme';
  sel.value = SCHEMES[Q.get('scheme')] ? Q.get('scheme') : 'night';
  const setS = () => { const S = applyScheme(sel.value, schemeCtx); const e = $('exp'); e.value = S.light.exp; e.nextElementSibling.textContent = fmt2(S.light.exp); };
  sel.onchange = setS; setS();
  slider(s, '全身灯光', 0, 2, 0.05, 1, fmt2, k => { PAL.lamp.emissiveIntensity = 3.2 * k; PAL.visor.emissiveIntensity = 2.6 * k; PAL.core.emissiveIntensity = 3.0 * k; ROTOR.lamp = k; }).inp.id = 'finishLight';
  const jointGlowToggle = check(s, '全身转轴光效', on => JOINT_GLOW.setEnabled(on));
  jointGlowToggle.checked = JOINT_GLOW.enabled;
  jointGlowToggle.id = 'jointGlowToggle';
  slider(s, '反应堆转速', 0, 1, 0.01, ROTOR.target, fmt2, v => ROTOR.target = v).inp.id = 'finishRotor';
  slider(s, '磨损', 0, 1, 0.01, WEAR.value, fmt2, v => WEAR.value = v).inp.id = 'finishWear';
  { const r = document.createElement('label'); r.className = 'row chk'; r.innerHTML = '<input type="checkbox" id="surfToggle"><span>材质升级（反射环境 + 表面细节 + 边缘磨损）</span>'; s.appendChild(r);
    const c = r.querySelector('input'); c.checked = !!SURF.on.value; c.onchange = () => { setSurface(c.checked); setS(); }; } }
// 头部
{ const s = section('头部');
  slider(s, '驾驶舱盖', 0, 1, 0.01, 0, v => Math.round(v * 100) + '%', v => setOpen(headGroup, v));
  { const row = document.createElement('label'); row.className = 'row'; row.innerHTML = '<span>额头标志</span><select></select>'; s.appendChild(row);
    const sel = row.querySelector('select'); for (const [k, cn] of Object.entries(FOREHEAD.styles)) sel.add(new Option(cn, k));
    sel.id = 'finishForehead'; sel.value = 'blue'; sel.onchange = () => FOREHEAD.set(sel.value); resetters.push(() => { sel.value = 'blue'; FOREHEAD.set('blue'); }); }
  // 头部转动：滑杆给目标角，头按阻尼弹簧缓动跟过去（起步和停下都有过渡，像人转头）
  HEADCTL.ui.yaw = slider(s, '左右转（+ 转向机体右侧）', -HEAD_LIM.yaw, HEAD_LIM.yaw, 1, 0, deg, v => { HEADCTL.look = null; HEADCTL.target.yaw = v; });
  HEADCTL.ui.pitch = slider(s, '抬头 / 低头', -HEAD_LIM.down, HEAD_LIM.up, 1, 0, deg, v => { HEADCTL.look = null; HEADCTL.target.pitch = v; });
  buttons(s, [['环顾', () => { HEADCTL.look = { t: 0 }; }], ['回正', () => { HEADCTL.look = null; HEADCTL.ui.yaw.set(0); HEADCTL.ui.pitch.set(0); }]]); }
// 腰部
{ const s = section('腰部');
  const W = WAISTCTL, setT = k => v => { W.seq = null; W.target[k] = v; };
  W.ui.twist = slider(s, '扭腰（+ 转向机体右侧）', -WAIST_LIM.twist, WAIST_LIM.twist, 1, 0, deg, setT('twist'));
  W.ui.bend = slider(s, '前屈 / 后仰', -WAIST_LIM.back, WAIST_LIM.fwd, 1, 0, deg, setT('bend'));
  W.ui.side = slider(s, '侧弯（+ 向机体右侧）', -WAIST_LIM.side, WAIST_LIM.side, 1, 0, deg, setT('side'));
  buttons(s, [['伸展', () => { W.seq = { t0: performance.now() }; }], ['回正', () => { W.seq = null; for (const k of ['twist', 'bend', 'side']) W.ui[k].set(0); }]]); }
function waistTick() {
  const W = WAISTCTL, now = performance.now(), K = ['twist', 'bend', 'side'];
  if (W.seq) {
    const t = (now - W.seq.t0) / 1000, f = WAIST_SEQ.find(x => t < x[0]);
    K.forEach((k, i) => { W.target[k] = f ? f[i + 1] : 0; const u = W.ui[k]; if (u) { u.inp.value = W.target[k]; u.inp.parentElement.querySelector('b').textContent = Math.round(W.target[k]) + '°'; } });
    if (!f) W.seq = null;
  }
  let rdt = Math.min(0.5, (now - (W.last ?? now)) / 1000); W.last = now;
  const w = 2.4, before = K.map(k => W.cur[k]);
  for (; rdt > 1e-4; rdt -= 0.016) { const st = Math.min(0.016, rdt); for (const k of K) { W.vel[k] += (-w * w * (W.cur[k] - W.target[k]) - 2 * w * W.vel[k]) * st; W.cur[k] += W.vel[k] * st; } }
  const n = Math.hypot(W.cur.twist / WAIST_LIM.twist, W.cur.bend / (W.cur.bend > 0 ? WAIST_LIM.fwd : WAIST_LIM.back), W.cur.side / WAIST_LIM.side);
  if (n > WAIST_NORM) for (const k of K) { W.cur[k] *= WAIST_NORM / n; W.vel[k] *= 0.5; }   // combined moves share the range
  if (K.some((k, i) => Math.abs(W.cur[k] - before[i]) > 1e-4)) WR.set(W.cur.twist, W.cur.bend, W.cur.side);
}
// 武器
let clawSpin = false, clawA = 0;
{ const s = section('武器');
  note(s, '展开武器时手臂会自动摆到备战姿态（会覆盖"手臂"里的角度）');
  slider(s, '全部展开', 0, 1, 0.01, 0, fmt2, t => Object.values(A.arms).forEach(a => a.deploy(t)));
  slider(s, '右臂 等离子炮', 0, 1, 0.01, 0, fmt2, t => A.arms.right.deploy(t));
  slider(s, '左前臂 刀刃', 0, 1, 0.01, 0, fmt2, t => A.arms.leftFront.deploy(t));
  slider(s, '左后臂 锯爪', 0, 1, 0.01, 0, fmt2, t => A.arms.leftRear.deploy(t));
  check(s, '锯爪旋转', v => clawSpin = v);
  slider(s, '肩部导弹舱', 0, 1, 0.01, 0, fmt2, t => Object.values(A.arms).forEach(a => a.setMissiles && a.setMissiles(t))); }
// 手掌开握（右臂、左前臂的五指手）：0 张开 · 0.3 自然 · 1 握拳；缓动跟随，展开武器时由武器动作接管
// 推进器：背部推进柱展开（底端向后外甩开，喷口避开臀部）、推力、脚底与手掌喷口、悬空
{ const s = section('推进器');
  note(s, '背部推力要等推进柱展开到位才会出火；悬空高度需要背部或脚底有推力才会升起');
  const ui = {};
  ui.deploy = slider(s, '背推展开', 0, 1, 0.01, 0, fmt2, v => PROP.tgt.deploy = v);
  ui.wing = slider(s, '展翼（外张）', 0, 1, 0.01, 0, fmt2, v => PROP.tgt.wing = v);
  ui.thrust = slider(s, '背部推力', 0, 1, 0.01, 0, fmt2, v => PROP.tgt.thrust = v);
  ui.foot = slider(s, '脚底推力', 0, 1, 0.01, 0, fmt2, v => PROP.tgt.foot = v);
  ui.palm = slider(s, '手掌推力', 0, 1, 0.01, 0, fmt2, v => PROP.tgt.palm = v);
  ui.hover = slider(s, '悬空高度', 0, 10, 0.1, 0, v => (+v).toFixed(1), v => PROP.tgt.hover = v);
  const seq = (steps) => steps.forEach(([ms, k, v]) => setTimeout(() => ui[k].set(v), ms));
  buttons(s, [['起飞', () => seq([[0, 'deploy', 1], [900, 'thrust', 0.85], [900, 'foot', 0.8], [1500, 'hover', 6]])],
              ['降落', () => seq([[0, 'hover', 0], [3500, 'thrust', 0], [3500, 'foot', 0], [4300, 'deploy', 0]])],
              ['熄火', () => ['thrust', 'foot', 'palm', 'hover'].forEach(k => ui[k].set(0))]]);
  buttons(s, [['展翼', () => seq([[0, 'deploy', 1], [700, 'wing', 1]])], ['收翼', () => seq([[0, 'wing', 0], [1400, 'deploy', 0]])]]); }
const GRIP = {};
const WRIST_LIM = { fwd: 70, back: 85 };
const ROLL_LIM = 90;
const FOLD_LIM = 90;
// The hand is authored palm-normal -x (toward the body). Wrist x only swings the fingers;
// rotating the hand around its own y axis turns the palm down. x=-70, y=-90 = palm flat on the floor,
// fingers forward (push-up palm), confirmed on both the right and left-front hands.
// Fold z is the wrist bend across the knuckle line: palm-down at +90°, the action the palm-jet pose uses (70°).
const handRot = g => g.hand.hand.rotation.set(-g.wrist.cur * R2D, g.roll.cur * R2D, (g.foldSign ?? 1) * g.fold.cur * R2D);
PROP.grip = GRIP;
const GRIP_SEQ = [[0.9, 1], [1.7, 1], [2.7, 0], [3.3, 0], [4.3, 0.3]];   // 抓握：握紧-停-张开-停-回自然
{ const s = section('手掌');
  note(s, '折腕 = 手掌在腕部向掌心一侧折下（前臂不拧）；手掌推力的自动姿势用 70°，手动最多 90°');
  for (const [key, cn] of [['right', '右手'], ['leftFront', '左前手']]) {
    const arm = A.arms[key], g = GRIP[key] = { target: 0.3, cur: 0.3, vel: 0, dep: 0, seq: null, ui: null, hand: arm.hand, wrist: { target: 0, cur: 0, vel: 0, ui: null }, roll: { target: 0, cur: 0, vel: 0, ui: null }, fold: { target: 0, cur: 0, vel: 0, ui: null }, foldSign: PROP.foldDir?.[key] ?? 1 };
    const dep = arm.deploy; arm.deploy = t => { g.dep = t; if (t > 0) g.hand.hand.rotation.set(0, 0, 0); dep(t); if (t === 0) { g.hand.setGrip(g.cur); handRot(g); } };   // weapon owns the hand (wrist straight) while deployed
    g.ui = slider(s, cn + ' 开合', 0, 1, 0.01, 0.3, v => v < 0.05 ? '张开' : v > 0.95 ? '握拳' : Math.round(v * 100) + '%', v => { g.seq = null; g.target = v; });
    // 手腕屈伸：绕腕部原有横轴转（+ 手指朝前，像俯卧撑撑地；− 手指朝后）；前 70° / 后 85° 内不撞前臂
    g.wrist.ui = slider(s, cn + ' 手腕（+ 朝前 / − 朝后）', -WRIST_LIM.back, WRIST_LIM.fwd, 1, 0, deg, v => { g.wrist.target = v; });
    // 掌面翻转：手腕 x 只让手指前后摆，掌面法线是 -x；绕手掌 y 轴再翻 -90° 才能掌心朝下
    g.roll.ui = slider(s, cn + ' 掌面翻转', -ROLL_LIM, ROLL_LIM, 1, 0, deg, v => { g.roll.target = v; });
    // 折腕：手在腕部向掌心一侧折（0 直 · 90 掌心完全朝下）；推进姿势自动用 70°
    g.fold.ui = slider(s, cn + ' 折腕', 0, FOLD_LIM, 1, 0, deg, v => { g.fold.target = v; });
  }
  const all = fn => Object.values(GRIP).forEach(fn);
  buttons(s, [['撑掌', () => all(g => { g.seq = null; g.ui.set(0); g.wrist.ui.set(WRIST_LIM.fwd); g.roll.ui.set(-ROLL_LIM); g.fold.ui.set(0); })], ['手腕回正', () => all(g => { g.wrist.ui.set(0); g.roll.ui.set(0); g.fold.ui.set(0); })]]);
  buttons(s, [['抓握', () => all(g => g.seq = { t0: performance.now() })], ['全张开', () => all(g => g.ui.set(0))], ['全握拳', () => all(g => g.ui.set(1))], ['自然', () => all(g => g.ui.set(0.3))]]);
}
function gripTick() {
  const now = performance.now();
  for (const g of Object.values(GRIP)) {
    if (g.seq) {
      const t = (now - g.seq.t0) / 1000, k = GRIP_SEQ.find(f => t < f[0]);
      g.target = k ? k[1] : 0.3; if (!k) g.seq = null;
      g.ui.inp.value = g.target; g.ui.inp.parentElement.querySelector('b').textContent = Math.round(g.target * 100) + '%';
    }
    let rdt = Math.min(0.5, (now - (g.last ?? now)) / 1000); g.last = now;
    const w = 6.0, before = g.cur;
    for (; rdt > 1e-4; rdt -= 0.016) { const st = Math.min(0.016, rdt); g.vel += (-w * w * (g.cur - g.target) - 2 * w * g.vel) * st; g.cur += g.vel * st; }
    g.cur = Math.max(0, Math.min(1, g.cur));
    if (g.dep === 0 && Math.abs(g.cur - before) > 1e-5) g.hand.setGrip(g.cur);
    { const wr = g.wrist, rl = g.roll, fd = g.fold, b0 = wr.cur, c0 = rl.cur, f0 = fd.cur;
      let r2 = Math.min(0.5, (now - (wr.last ?? now)) / 1000); wr.last = now;
      for (; r2 > 1e-4; r2 -= 0.016) { const st = Math.min(0.016, r2); wr.vel += (-25 * (wr.cur - wr.target) - 10 * wr.vel) * st; wr.cur += wr.vel * st; }
      let r3 = Math.min(0.5, (now - (rl.last ?? now)) / 1000); rl.last = now;
      for (; r3 > 1e-4; r3 -= 0.016) { const st = Math.min(0.016, r3); rl.vel += (-20 * (rl.cur - rl.target) - 9 * rl.vel) * st; rl.cur += rl.vel * st; }
      let r4 = Math.min(0.5, (now - (fd.last ?? now)) / 1000); fd.last = now;
      for (; r4 > 1e-4; r4 -= 0.016) { const st = Math.min(0.016, r4); fd.vel += (-20 * (fd.cur - fd.target) - 9 * fd.vel) * st; fd.cur += fd.vel * st; }
      const over = !!PROP.palmOver;   // the palm-jet pose owns the hand while it is firing
      if (g.dep === 0 && !over && (Math.abs(wr.cur - b0) > 1e-4 || Math.abs(rl.cur - c0) > 1e-4 || Math.abs(fd.cur - f0) > 1e-4 || g.wasOver)) handRot(g);
      g.wasOver = over; }
  }
}
// 手臂（在下垂姿态上叠加的角度）
for (const [key, cn] of [['right', '右臂'], ['leftFront', '左前臂'], ['leftRear', '左后副臂']]) {
  const a = A.arms[key], b = a.spec.pose, o = { pitch: 0, abd: 0, elbow: 0, twist: 0, fore: 0 };
  const apply = () => { a.setPose({ ...b, pitch: b.pitch + (a.id === 'LR' ? -o.pitch : o.pitch) * R2D, abd: b.abd + o.abd * R2D, elbow: b.elbow + o.elbow * R2D, twist: (b.twist || 0) + o.twist * R2D, fore: (b.fore || 0) + o.fore * R2D }); a.update(); };
  const s = section('手臂 · ' + cn);
  slider(s, a.id === 'LR' ? '后举' : '抬臂', 0, a.id === 'LF' ? 120 : 90, 1, 0, deg, v => { o.pitch = v; apply(); });
  slider(s, '外展', -5, 30, 1, 0, deg, v => { o.abd = v; apply(); });
  slider(s, a.id === 'LR' ? '肘弯（− 上 / + 下）' : '肘弯', a.id === 'LR' ? -60 : 0, 100, 1, 0, deg, v => { o.elbow = v; apply(); });
  slider(s, '上臂自转', -30, 30, 1, 0, deg, v => { o.twist = v; apply(); });
  slider(s, '前臂自转', -60, 60, 1, 0, deg, v => { o.fore = v; apply(); });
}
// 腿部
const PLANT = { dirty: false, run: null };
const SQUAT = { auto: false, t: 0, dur: 2.6, set: null, ui: null };
{ const L = MODEL.lowerRig.L, C = MODEL.lowerRig.C;
  // 精确找脚底最低顶点：Box3 对旋转后的网格是保守包围盒，会把脚算低，导致人往下陷、脚悬空
  const footPart = /^leg[RL]\.(foot|toes)/;
  let footMeshes = null;
  const footMinY = () => {
    if (!footMeshes) {
      footMeshes = [];
      LG.group.traverse(o => { if (o.isMesh && o.userData.part && footPart.test(o.userData.part) && o.geometry.attributes.position) footMeshes.push(o); });
    }
    let min = Infinity; const v = new THREE.Vector3();
    for (const o of footMeshes) {
      const p = o.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); if (v.y < min) min = v.y; }
    }
    return min;
  };
  const plantFeet = () => {
    if (window.__pushupActive || window.__motionActive) return;   // action layers own the root height
    mech.updateMatrixWorld(true);             // one full update per frame instead of one per slider input
    const min = footMinY();
    if (Number.isFinite(min)) mech.position.y += LEG.ground - min;   // 相对移动，避免重复叠加
  };
  PLANT.run = plantFeet;
  const { ANKLE, LOWER, AG, apply, setLowerSwap } = MODEL.lowerRig;
  MODEL.lowerRig.onPlant(() => PLANT.dirty = true);
  apply();
  const stopSquat = () => { SQUAT.auto = false; };
  const show = (s, v, text) => { s.inp.value = v; const b = s.inp.parentElement?.querySelector('b'); if (b) b.textContent = text; };
  const sl = {};
  for (const [id, cn] of [['R', '右腿'], ['L', '左腿']]) {
    const s = section('腿部 · ' + cn);
    sl[id + 'pitch'] = slider(s, '髋 前后摆', -30, 40, 1, 0, deg, v => { stopSquat(); L[id].pitch = v; apply(); });
    sl[id + 'knee'] = slider(s, '膝', 0, 110, 1, 0, deg, v => { stopSquat(); L[id].knee = v; apply(); });
    sl[id + 'ankle'] = slider(s, '踝', -45, 45, 1, 0, deg, v => { stopSquat(); L[id].ankle = v; apply(); });
  }
  const s = section('腿部 · 双腿');
  const abdSl = slider(s, '外展', -10, 30, 1, DEFAULT_STANCE_ABD, deg, v => { stopSquat(); C.abd = v; apply(); });
  const yawSl = slider(s, '髋 内外旋', -20, 20, 1, 0, deg, v => { stopSquat(); C.yaw = v; apply(); });
  const toeSl = slider(s, '脚趾', -20, 35, 1, 0, deg, v => { stopSquat(); C.toe = v; apply(); });

  // 真正的蹲起：0..1 深度映射到髋 40° / 膝 100° / 踝 -40°，每帧按最低脚贴地
  const setSquat = (v) => {
    const k = Math.max(0, Math.min(1, v)), q = k * k * (3 - 2 * k);
    for (const id of ['R', 'L']) {
      const vals = { pitch: 40 * q, knee: 85 * q, ankle: 45 * q };   // 40+45-85 = 0 → 脚掌保持水平
      for (const j of ['pitch', 'knee', 'ankle']) { L[id][j] = vals[j]; show(sl[id + j], vals[j], Math.round(vals[j]) + '°'); }
    }
    C.abd = DEFAULT_STANCE_ABD * (1 - q); C.yaw = 0; C.toe = 0;   // 站直回到标准外展，深蹲时收回外展
    show(abdSl, C.abd, deg(C.abd)); show(yawSl, 0, '0°'); show(toeSl, 0, '0°');
    if (SQUAT.ui) show(SQUAT.ui, q, Math.round(q * 100) + '%');
    apply();
  };
  SQUAT.set = setSquat;
  const sq = slider(s, '蹲起深度', 0, 1, 0.01, 0, v => Math.round(v * 100) + '%', v => { stopSquat(); setSquat(v); });
  SQUAT.ui = sq;
  buttons(s, [['站立', () => { stopSquat(); sq.set(0); }],
              ['迈步', () => { stopSquat(); sq.set(0); const v = { Rpitch: 25, Rknee: 15, Rankle: 0, Lpitch: -15, Lknee: 35, Lankle: 10 }; for (const [k, x] of Object.entries(v)) sl[k].set(x); }],
              ['半蹲', () => { stopSquat(); sq.set(0.55); }],
              ['蹲起', () => { SQUAT.auto = true; SQUAT.t = 0; }]]);
  slider(s, '脚踝外移', 0, 0.8, 0.01, ANKLE.out, v => v.toFixed(2), v => { ANKLE.out = v; apply(); });
  check(s, '小腿（膝→踝）整体左右对调（标准）', v => setLowerSwap(v), true);
  setLowerSwap(true);
  const lowCk = [...document.querySelectorAll('#panel label.chk')].find(l => l.textContent.includes('整体左右对调'));
  if (lowCk) lowCk.querySelector('input').checked = true; }
$('togglePanel').onclick = () => document.body.classList.toggle('nopanel');

function shot(W, H) {
  const w = el.clientWidth, h = el.clientHeight, pr = renderer.getPixelRatio();
  renderer.setPixelRatio(1); renderer.setSize(W, H, false); composer.setSize(W, H); cam.aspect = W / H; cam.updateProjectionMatrix();
  composer.render();
  const url = renderer.domElement.toDataURL('image/png');
  renderer.setPixelRatio(pr); renderer.setSize(w, h, false); composer.setSize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix();
  const a = document.createElement('a'); a.href = url; a.download = `026_${Date.now()}.png`; a.click();
}

let last = performance.now();
let lastShadow = 0;
// head motion: critically damped spring toward the target (ω 3.2 → about 1 s to settle), plus the look-around routine
function headTick(dt) {
  const H = HEADCTL;
  if (H.look) {
    H.look.t = (performance.now() - (H.look.t0 ??= performance.now())) / 1000;   // real time, not the capped frame step
    const k = HEAD_LOOK.find(f => H.look.t < f[0]);
    if (k) { H.target.yaw = k[1] * HEAD_LIM.yaw; H.target.pitch = k[2]; }
    else { H.look = null; H.target.yaw = 0; H.target.pitch = 0; }
    for (const a of ['yaw', 'pitch']) { const u = H.ui[a]; if (u) { u.inp.value = H.target[a]; u.inp.parentElement.querySelector('b').textContent = Math.round(H.target[a]) + '°'; } }
  }
  const w = 3.2, now = performance.now();
  let moved = false, rdt = Math.min(0.5, (now - (H.last ?? now)) / 1000); H.last = now;   // real time, in small sub-steps
  for (; rdt > 1e-4; rdt -= 0.016) {
    const st = Math.min(0.016, rdt);
    for (const a of ['yaw', 'pitch']) {
      const x = H.cur[a] - H.target[a], v = H.vel[a];
      H.vel[a] = v + (-w * w * x - 2 * w * v) * st; H.cur[a] += H.vel[a] * st;
    }
  }
  for (const a of ['yaw', 'pitch']) if (Math.abs(H.cur[a] - H.target[a]) > 0.01 || Math.abs(H.vel[a]) > 0.01) moved = true;
  const [up, dn] = headEnv(H.cur.yaw);                         // keep the path inside the clash-free envelope
  if (H.cur.pitch > up) { H.cur.pitch = up; H.vel.pitch = Math.min(0, H.vel.pitch); }
  if (H.cur.pitch < -dn) { H.cur.pitch = -dn; H.vel.pitch = Math.max(0, H.vel.pitch); }
  if (moved || H.dirty) { NR.set(H.cur.yaw, H.cur.pitch); H.dirty = false; }
}
(function loop(now) {
  now = now || performance.now(); const dt = Math.min(0.05, (now - last) / 1000); last = now;
  ROTOR.update(dt); PROP.update(dt);
  headTick(dt);
  waistTick();
  gripTick();
  if (SQUAT.auto && SQUAT.set) {
    SQUAT.t += dt / SQUAT.dur;
    const u = Math.min(1, SQUAT.t);
    SQUAT.set(Math.sin(Math.PI * u) ** 2);
    if (u >= 1) { SQUAT.auto = false; SQUAT.t = 0; }
  }
  if (clawSpin) { clawA += dt * 9; A.arms.leftRear.spin(clawA); A.arms.leftRear.update(); }
  if (PLANT.dirty) { PLANT.run(); PLANT.dirty = false; }
  if (now - lastShadow > 66) { renderer.shadowMap.needsUpdate = true; lastShadow = now; }   // 15 Hz shadow, not every frame
  navUpdate(dt); composer.render(); requestAnimationFrame(loop);
})();

window.__fin = { env: { sky, ground, blob: scene.getObjectByName('studioBlob'), key, rim, hemi, groundY: LEG.ground, fog: scene.fog, environment: scene.environment, environmentIntensity: scene.environmentIntensity, exposure: renderer.toneMappingExposure }, ticks: { head: headTick, waist: waistTick, grip: gripTick }, waist: WR, waistCtl: WAISTCTL, grip: GRIP, neck: NR, head: HEADCTL, scene, mech, A, LG, PAL, stats, tweaks: TWEAKS, relief: RELIEF, reliefAll: RELIEF_ALL, marks: MK, details: DT, thr: THR, prop: PROP, forehead: FOREHEAD, applyScheme: k => applyScheme(k, schemeCtx), blades: BLADES, rotor: ROTOR, honeycomb: HC, cam, view, viewAt, renderer, squat: SQUAT, nav: NAV };
console.log('paint', stats, '\n' + MK.log.join('\n'));
window.__fin.round = RND;
import('./rounding.js').then(R => { window.__roundCheck = () => R.checkDetails(mech); });
setupCompare(window.__fin, RND ? `${RND.parts.rounded} 个散件倒圆 + ${RND.shells.filter(l => l[0] === '✓').length} 块肩甲外壳；三角面 +${Math.round(RND.parts.trisAfter - RND.parts.trisBefore)}；绘制网格数不变` : '');
window.__fin.model = MODEL;
renderer.domElement.dataset.modelSignature = JSON.stringify(MODEL.signature);
publishFinishedAppearance(() => ({ scheme: $('finishScheme').value, wear: +$('finishWear').value,
  bodyLight: +$('finishLight').value, rotorSpeed: +$('finishRotor').value,
  forehead: $('finishForehead').value, jointGlow: JOINT_GLOW.enabled, surface: !!SURF.on.value, rounded: ROUND.enabled }));
if (Q.get('verify') === 'controls') import('../tools/model-controls-check.js?v=20261023b');
