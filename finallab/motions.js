// Continuous motions for the 026 finishing room: run / box / jump.
// Procedural keyframes + a 2-bone leg IK (hip pitch, knee, ankle) that keeps the stance foot
// on the floor while the root bobs. The arms/waist/head are driven directly; the action layer
// owns the root while window.__motionActive is true (lab.js plantFeet() steps aside).
import * as THREE from 'three';

const R = Math.PI / 180;
const V3 = THREE.Vector3;
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const pulse = (p, a, b) => Math.sin(Math.PI * clamp((p - a) / (b - a), 0, 1)) ** 2;

// leg geometry from leglab.js: hip -> knee -> ankle
const HIP_Y = -13.6, HIP_Z = 0;
const L1 = Math.hypot(0.2, 10.0, 0.2);      // thigh
const L2 = Math.hypot(0.2, 9.7, 0.3);       // shin
const ANKLE0_Y = -33.3, ANKLE0_Z = -0.1;

const state = {
  active: false, mode: '', saved: null, floor: 0, baseY: 0, sole: 4.6,
  t0: 0, raf: 0, phase: 0,
};

function minY(obj) {
  let m = Infinity;
  obj.updateMatrixWorld(true);
  obj.traverse(o => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return;
    const p = o.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const v = new V3().fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
      if (v.y < m) m = v.y;
    }
  });
  return m;
}

function legPose(F, id, ankleY, ankleZ) {
  const dy = ankleY - HIP_Y, dz = ankleZ - HIP_Z;
  let d = Math.hypot(dy, dz);
  d = clamp(d, Math.abs(L1 - L2) + 0.2, L1 + L2 - 0.06);
  const base = Math.atan2(dz, -dy);
  const interior = Math.acos(clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1));
  const off = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
  const pitch = clamp((base + off) * 180 / Math.PI, -30, 40);
  const knee = clamp((Math.PI - interior) * 180 / Math.PI, 0, 110);
  const ankle = knee - pitch;                     // keeps the sole level
  const leg = F.LG.legs[id];
  leg.setPose({ pitch, knee, ankle, toe: 0, abd: 0, yaw: 0 });
  return { pitch, knee, ankle };
}
function legFootLow(F, id) {
  const l = F.LG.legs[id];
  return Math.min(minY(l.toeG), minY(l.ankleG));
}
function legIK(F, id, ankleY, ankleZ, soleTarget) {
  let y = ankleY;
  for (let i = 0; i < 2; i++) {
    const r = legPose(F, id, y, ankleZ);
    const leg = F.LG.legs[id];
    const low = Math.min(minY(leg.toeG), minY(leg.ankleG));
    y += soleTarget - low;                        // exact sole contact (the ankle-to-sole offset varies with the pose)
    if (Math.abs(soleTarget - low) < 0.01) break;
  }
  return legPose(F, id, y, ankleZ);
}

function armPose(F, key, pitch, elbow, abd = 0, twist = 0, fore = 0) {
  const a = F.A.arms[key], b = a.spec.pose;
  a.setPose({
    ...b, pitch: b.pitch + pitch * R, elbow: b.elbow + elbow * R, abd: b.abd + abd * R,
    twist: twist * R, fore: fore * R,
  });
  a.update();
}

function stowRear(F) {
  const a = F.A.arms.leftRear, b = a.spec.pose;
  a.setPose({ ...b, pitch: -0.3, elbow: 1.0, abd: 0.35, twist: 0, fore: 0 });
  a.update();
}

function handPose(F, key, grip, wrist = 0, roll = 0) {
  const g = F.grip[key];
  g.seq = null; g.dep = 0; g.target = grip; g.cur = grip; g.hand.setGrip(grip);
  g.wrist.target = wrist; g.wrist.cur = wrist;
  g.roll.target = roll; g.roll.cur = roll;
  g.hand.hand.rotation.set(-wrist * R, roll * R, 0);
}

function waist(F, twist, bend, side = 0) { F.waist.set(twist, bend, side); }
function head(F, yaw, pitch) { F.neck.set(yaw, pitch); }

// ---------------------------------------------------------------------------
function applyRun(F, t) {
  const T = 0.9, ph = (t / T) % 1;
  const bob = 0.16 * Math.sin(ph * Math.PI * 4);
  F.mech.position.y = state.baseY + bob;
  const liftOf = { R: 0, L: 0 }, zOf = { R: 0, L: 0 };
  for (const [id, off] of [['R', 0], ['L', 0.5]]) {
    const p = (ph + off) % 1;
    let z, lift;
    if (p < 0.46) { const q = p / 0.46; z = 0.95 - q * 1.9; lift = 0; }
    else { const q = (p - 0.46) / 0.54; z = -0.95 + q * 1.9; lift = Math.sin(Math.PI * q) * 2.6; }
    liftOf[id] = lift; zOf[id] = z;
    const ankleY = (state.floor - F.mech.position.y) + state.sole + lift;
    legIK(F, id, ankleY, ANKLE0_Z + z, state.floor + lift);
  }
  // settle the whole root on the stance foot, then re-run the IK so the swing keeps its lift
  let gap = Infinity;
  for (const id of ['R', 'L']) if (liftOf[id] < 0.02) gap = Math.min(gap, legFootLow(F, id) - state.floor);
  if (Number.isFinite(gap) && Math.abs(gap) > 0.015) {
    F.mech.position.y -= gap;
    for (const id of ['R', 'L']) legIK(F, id, (state.floor - F.mech.position.y) + state.sole + liftOf[id], ANKLE0_Z + zOf[id], state.floor + liftOf[id]);
  }
  const sw = Math.sin(ph * Math.PI * 2);
  armPose(F, 'right', 18 + 18 * sw, 58 + 10 * Math.cos(ph * Math.PI * 2), 4);
  armPose(F, 'leftFront', 18 - 18 * sw, 58 - 10 * Math.cos(ph * Math.PI * 2), 4);
  stowRear(F);
  handPose(F, 'right', 0.45); handPose(F, 'leftFront', 0.45);
  waist(F, 3 * sw, 1, 0);
  head(F, -2 * sw, 2);
}

function applyBox(F, t) {
  const T = 2.2, ph = (t / T) % 1;
  const root = state.baseY - 0.7 + 0.08 * Math.sin(ph * Math.PI * 2);
  F.mech.position.y = root;
  for (const [id, z] of [['R', -1.1], ['L', 1.1]]) legIK(F, id, (state.floor - root) + state.sole, ANKLE0_Z + z, state.floor);
  const gb = Math.min(legFootLow(F, 'R'), legFootLow(F, 'L')) - state.floor;
  if (Math.abs(gb) > 0.015) {
    F.mech.position.y -= gb;
    for (const [id, z] of [['R', -1.1], ['L', 1.1]]) legIK(F, id, (state.floor - F.mech.position.y) + state.sole, ANKLE0_Z + z, state.floor);
  }
  const cross = pulse(ph, 0.12, 0.34);
  const jab = pulse(ph, 0.40, 0.60);
  const hook = pulse(ph, 0.66, 0.84);
  armPose(F, 'right', 24 + 56 * cross + 30 * hook, 96 - 80 * cross - 48 * hook, 4 + 8 * cross + 26 * hook);
  armPose(F, 'leftFront', 30 + 48 * jab, 96 - 78 * jab, 6 + 12 * jab);
  stowRear(F);
  handPose(F, 'right', 1); handPose(F, 'leftFront', 1);
  waist(F, -16 * cross + 12 * jab - 10 * hook, 2, 0);
  head(F, 8 * cross - 6 * jab + 6 * hook, 1);
}

function applyJump(F, t) {
  const T = 2.8, ph = (t / T) % 1;
  let rootY, air = false, tuck = 0;
  if (ph < 0.22) { rootY = -3.2 * smooth(ph / 0.22); }
  else if (ph < 0.36) { rootY = -3.2 + 9.2 * smooth((ph - 0.22) / 0.14); }
  else if (ph < 0.68) { const q = (ph - 0.36) / 0.32; rootY = 6.0 + 3.4 * Math.sin(Math.PI * q); air = true; }
  else if (ph < 0.84) { const q = (ph - 0.68) / 0.16; rootY = 6.0 - 9.2 * smooth(q); air = true; }
  else { const q = (ph - 0.84) / 0.16; rootY = -3.2 + 3.2 * smooth(q); }
  F.mech.position.y = state.baseY + rootY;
  if (air) tuck = Math.sin(Math.PI * clamp((ph - 0.36) / 0.48, 0, 1)) * 3.2;
  for (const [id, z] of [['R', -0.9], ['L', 0.9]]) {
    const ankleY = (state.floor - F.mech.position.y) + state.sole + tuck;
    legIK(F, id, ankleY, ANKLE0_Z + z + (air ? -0.6 : 0), state.floor + (air ? Math.max(0, tuck) : 0));
  }
  if (!air) {
    const gj = Math.min(legFootLow(F, 'R'), legFootLow(F, 'L')) - state.floor;
    if (Math.abs(gj) > 0.015) {
      F.mech.position.y -= gj;
      for (const [id, z] of [['R', -0.9], ['L', 0.9]]) legIK(F, id, (state.floor - F.mech.position.y) + state.sole, ANKLE0_Z + z, state.floor);
    }
  }
  const crouch = ph < 0.22 ? smooth(ph / 0.22) : (ph > 0.68 ? 1 - smooth((ph - 0.68) / 0.32) : 0);
  const lift = air ? Math.sin(Math.PI * clamp((ph - 0.36) / 0.48, 0, 1)) : 0;
  armPose(F, 'right', 6 + 42 * lift - 6 * crouch, 22 + 30 * crouch + 10 * lift, 4);
  armPose(F, 'leftFront', 6 + 42 * lift - 6 * crouch, 22 + 30 * crouch + 10 * lift, 4);
  stowRear(F);
  handPose(F, 'right', 0.6); handPose(F, 'leftFront', 0.6);
  waist(F, 0, 4 * crouch, 0);
  head(F, 0, -4 * lift + 6 * crouch);
}

// ---------------------------------------------------------------------------
function loop(now) {
  if (!state.active) return;
  const F = window.__fin;
  const t = (now - state.t0) / 1000;
  if (state.mode === 'run') applyRun(F, t);
  else if (state.mode === 'box') applyBox(F, t);
  else if (state.mode === 'jump') applyJump(F, t);
  state.raf = requestAnimationFrame(loop);
}

function start(mode) {
  const F = window.__fin;
  if (!F) return;
  if (state.active) stop(false);
  if (window.__pushup?.state.active) window.__pushup.exit();
  state.saved = {
    pos: F.mech.position.clone(),
    quat: F.mech.quaternion.clone(),
    pose: window.__poses?.snapshot?.() || null,
  };
  state.floor = minY(F.LG.group);
  state.baseY = F.mech.position.y;
  state.sole = ANKLE0_Y - (state.floor - state.baseY);
  state.mode = mode;
  state.active = true;
  state.t0 = performance.now();
  window.__motionActive = true;
  for (const a of Object.values(F.A.arms)) if (a.deploy) a.deploy(0);
  stowRear(F);
  handPose(F, 'right', 0.45);
  handPose(F, 'leftFront', 0.45);
  waist(F, 0, 0, 0);
  head(F, 0, 0);
  F.viewAt([44, 8, 76], [0, -6, 0], 54);
  state.raf = requestAnimationFrame(loop);
  updateUI();
}

function stop(restore = true) {
  if (!state.active) return;
  state.active = false;
  cancelAnimationFrame(state.raf);
  window.__motionActive = false;
  const F = window.__fin, s = state.saved;
  if (restore && s) {
    F.mech.position.copy(s.pos);
    F.mech.quaternion.copy(s.quat);
    if (s.pose && window.__poses) window.__poses.start('', s.pose);
    F.view('front');
  }
  state.saved = null;
  state.mode = '';
  updateUI();
}

let runBtn = null, boxBtn = null, jumpBtn = null, stopBtn = null;
function updateUI() {
  if (!runBtn) return;
  for (const [b, m] of [[runBtn, 'run'], [boxBtn, 'box'], [jumpBtn, 'jump']]) {
    b.textContent = ({ run: '跑步', box: '拳击', jump: '跳跃' })[m] + (state.active && state.mode === m ? ' · 进行中' : '');
    b.disabled = state.active && state.mode === m;
  }
  stopBtn.disabled = !state.active;
}

function mount() {
  const panel = $('panel');
  if (!panel || !window.__fin) return setTimeout(mount, 300);
  const pose = [...panel.querySelectorAll('details')].find(d => d.querySelector('summary')?.textContent.trim() === '姿态预设');
  if (!pose) return setTimeout(mount, 300);
  const host = pose.querySelector('.sec') || pose;
  const d = document.createElement('details'); d.open = false;
  d.innerHTML = '<summary>连续动作</summary>';
  const sec = document.createElement('div'); sec.className = 'sec';
  const btns = document.createElement('div'); btns.className = 'btns';
  runBtn = document.createElement('button'); runBtn.textContent = '跑步'; runBtn.onclick = () => start('run');
  boxBtn = document.createElement('button'); boxBtn.textContent = '拳击'; boxBtn.onclick = () => start('box');
  jumpBtn = document.createElement('button'); jumpBtn.textContent = '跳跃'; jumpBtn.onclick = () => start('jump');
  stopBtn = document.createElement('button'); stopBtn.textContent = '停止'; stopBtn.onclick = () => stop(true); stopBtn.disabled = true;
  btns.append(runBtn, boxBtn, jumpBtn, stopBtn); sec.appendChild(btns);
  const note = document.createElement('p'); note.className = 'note';
  note.textContent = '跑步：两段腿 IK 踩地、手臂反向摆；拳击：刺拳/直拳/摆拳组合；跳跃：下蹲—起跳—腾空—落地。停止恢复进入前的姿态。';
  sec.appendChild(note); d.appendChild(sec);
  host.appendChild(d);
  window.__motions = { start, stop, state, legIK };
  updateUI();
}
mount();
