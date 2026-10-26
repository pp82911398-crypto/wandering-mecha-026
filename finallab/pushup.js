// Push-up action for the 026 finishing room (8777).
// Root pivot (whole mech pitches over the toes) + per-arm palm solve:
//   1) for each arm, find the hand-local rotation that makes the palm normal point down and the
//      fingers point forward (the authored palm normal is -x, so the wrist roll is essential);
//   2) fit that arm's elbow until the lowest palm vertex sits exactly on the floor;
//   3) both arms are solved independently, so one hand no longer floats while the other clips.
// The lab's plantFeet() steps aside while window.__pushupActive is true.
import * as THREE from 'three';

const V3 = THREE.Vector3;
const R = Math.PI / 180;
const $ = id => document.getElementById(id);
const isUnder = (o, g) => { for (let p = o; p; p = p.parent) if (p === g) return true; return false; };

const state = { active: false, pivot: null, saved: null, floor: 0, table: null, raf: 0, t0: 0, dur: 2600, depth: 0 };
const P_TOP = 75, P_DOWN = 77.5;
const ARM_KEYS = ['right', 'leftFront'];

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
const handsOf = F => [F.grip.right.hand.hand, F.grip.leftFront.hand.hand];
const toeGroupsOf = F => [F.LG.legs.R.toeG, F.LG.legs.L.toeG, F.LG.legs.R.ankleG, F.LG.legs.L.ankleG];
const handMin = F => Math.min(...handsOf(F).map(minY));
const toeMin = F => Math.min(...toeGroupsOf(F).map(minY));

function bodyMin(F) {
  const hands = handsOf(F), lg = F.LG.group;
  let m = Infinity;
  F.mech.traverse(o => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return;
    if (hands.some(g => isUnder(o, g)) || isUnder(o, lg)) return;
    const p = o.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const v = new V3().fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
      if (v.y < m) m = v.y;
    }
  });
  return m;
}

function setArm(F, key, elbow, pitchOff = 0) {
  const a = F.A.arms[key], b = a.spec.pose;
  a.setPose({ ...b, pitch: b.pitch + (90 + pitchOff) * R, elbow: b.elbow + elbow * R, abd: b.abd, twist: 0, fore: 0 });
  a.update();
}
function setRearStow(F) {
  const a = F.A.arms.leftRear, b = a.spec.pose;
  a.setPose({ ...b, pitch: -0.3, elbow: 1.0, abd: 0.35, twist: 0, fore: 0 });
  a.update();
}
function setLegs(F) {
  for (const id of ['R', 'L']) F.LG.legs[id].setPose({ pitch: 0, abd: 0, yaw: 0, knee: 0, ankle: 45, toe: 35 });
}
function openGrip(F, key) {
  const g = F.grip[key];
  g.seq = null; g.dep = 0; g.target = 0; g.cur = 0; g.hand.setGrip(0);
}

// palm normal must be down, fingers must be horizontal and forward
function palmScore(n, f) {
  return (n.x * n.x + (n.y + 1) * (n.y + 1) + n.z * n.z)
    + 0.55 * (f.y * f.y) + 0.2 * Math.max(0, -f.z);
}

function solvePalm(F, key, elbow, floor, pitchOff = 0) {
  setArm(F, key, elbow, pitchOff);
  openGrip(F, key);
  F.A.arms[key].root.updateMatrixWorld(true);   // only the arm chain, not the whole 1.7k-mesh mech
  const g = F.grip[key], hand = g.hand.hand;
  if (state.handBase) hand.position.copy(state.handBase[key]);
  const parentM = hand.parent.matrixWorld.clone();
  let best = null;
  const test = (x, y, z) => {
    hand.rotation.set(x * R, y * R, z * R);
    hand.updateMatrix();
    const m = new THREE.Matrix4().multiplyMatrices(parentM, hand.matrix);
    const n = new V3(-1, 0, 0).transformDirection(m);
    const f = new V3(0, -1, 0).transformDirection(m);
    const s = palmScore(n, f);
    if (!best || s < best.s) best = { x, y, z, s };
  };
  for (let x = -85; x <= 70; x += 10)
    for (let y = -90; y <= 90; y += 10)
      for (const z of [-30, 0, 30]) test(x, y, z);
  const b0 = { ...best };
  for (let x = b0.x - 5; x <= b0.x + 5; x += 2.5)
    for (let y = b0.y - 5; y <= b0.y + 5; y += 2.5)
      for (const z of [b0.z - 7, b0.z, b0.z + 7]) test(x, y, z);
  hand.rotation.set(best.x * R, best.y * R, best.z * R);
  hand.updateMatrixWorld(true);
  const low = minY(hand);
  return { e: elbow, pitch: pitchOff, x: best.x, y: best.y, z: best.z, score: best.s, gap: low - floor };
}

function fitArm(F, key, floor) {
  let best = null;
  const take = r => { if (!best || Math.abs(r.gap) < Math.abs(best.gap)) best = r; return r; };
  // 2D: elbow + shoulder pitch. The two arms have different lengths and the palm solve is
  // sensitive to the forearm angle, so a 1D elbow search alone leaves one hand floating/clipping.
  const tryPE = (e, p) => take(solvePalm(F, key,
    Math.max(0, Math.min(100, e)), floor, Math.max(-20, Math.min(20, p))));
  for (let e = 0; e <= 100; e += 20) for (let p = -12; p <= 12; p += 6) tryPE(e, p);
  const be = best.e, bp = best.pitch;
  for (let e = be - 20; e <= be + 20; e += 4) for (let p = bp - 6; p <= bp + 6; p += 1.5) tryPE(e, p);
  const ce = best.e, cp = best.pitch;
  for (let e = ce - 4; e <= ce + 4; e += 1) for (let p = cp - 1.5; p <= cp + 1.5; p += 0.5) tryPE(e, p);
  return best;
}

function buildTable(F, pivot, floor) {
  const rows = [];
  for (const P of [P_TOP, P_DOWN]) {
    pivot.rotation.x = P * R;
    setLegs(F);
    F.mech.updateMatrixWorld(true);
    let tm = toeMin(F);
    pivot.position.y += floor - tm;
    pivot.updateMatrixWorld(true);
    F.mech.updateMatrixWorld(true);
    const arms = {};
    for (const key of ARM_KEYS) arms[key] = fitArm(F, key, floor);
    F.mech.updateMatrixWorld(true);
    const body = bodyMin(F) - floor;
    rows.push({ P, arms, body });
    console.log('[pushup]', P.toFixed(1), 'body', body.toFixed(2),
      ...ARM_KEYS.map(k => `${k}: elbow ${arms[k].e.toFixed(0)} palm gap ${arms[k].gap.toFixed(2)} rot ${arms[k].x}/${arms[k].y}/${arms[k].z}`));
  }
  return rows;
}

function applyRow(F, row, floor) {
  const pivot = state.pivot;
  pivot.rotation.x = row.P * R;
  setLegs(F);
  for (const key of ARM_KEYS) {
    const s = row.arms[key], hand = F.grip[key].hand.hand;
    setArm(F, key, s.e, s.pitch || 0);
    hand.rotation.set(s.x * R, s.y * R, s.z * R);
    if (state.handBase) {
      const q = new THREE.Quaternion();
      hand.parent.getWorldQuaternion(q);
      const local = new V3(0, -(s.gap || 0), 0).applyQuaternion(q.invert());
      hand.position.copy(state.handBase[key]).add(local);
    }
  }
  F.mech.updateMatrixWorld(true);
  const tm = toeMin(F);
  pivot.position.y += floor - tm;
  pivot.updateMatrixWorld(true);
  F.mech.updateMatrixWorld(true);
}

function refitHands(F, row, floor) {
  for (const key of ARM_KEYS) row.arms[key] = fitArm(F, key, floor);
  for (const key of ARM_KEYS) {
    const a = row.arms[key], hand = F.grip[key].hand.hand;
    setArm(F, key, a.e, a.pitch || 0);
    hand.rotation.set(a.x * R, a.y * R, a.z * R);
    const q = new THREE.Quaternion();
    hand.parent.getWorldQuaternion(q);
    const local = new V3(0, -(a.gap || 0), 0).applyQuaternion(q.invert());
    hand.position.copy(state.handBase[key]).add(local);
  }
  F.mech.updateMatrixWorld(true);
}

function framePose(F) {
  let mn = new V3(1e9, 1e9, 1e9), mx = new V3(-1e9, -1e9, -1e9);
  F.mech.updateMatrixWorld(true);
  F.mech.traverse(o => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return;
    const p = o.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) { const v = new V3().fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); mn.min(v); mx.max(v); }
  });
  const w = o => o.getWorldPosition(new V3());
  const c = new V3().add(w(F.A.arms.right.root)).add(w(F.A.arms.leftFront.root))
    .add(w(F.LG.legs.R.hipG)).add(w(F.LG.legs.L.hipG)).multiplyScalar(0.25);
  const len = Math.max(30, mx.x - mn.x, mx.y - mn.y, mx.z - mn.z);
  F.viewAt([c.x + len * 1.35, c.y + len * 0.65, c.z + len * 1.25], [c.x, c.y, c.z], 38);
}

function frame(now) {
  if (!state.active) return;
  const F = window.__fin;
  const u = ((now - state.t0) % state.dur) / state.dur;
  const d = Math.sin(Math.PI * u) ** 2;
  state.depth = d;
  const a = state.table[0], b = state.table[state.table.length - 1];
  const row = { P: a.P + (b.P - a.P) * d, arms: {} };
  for (const key of ARM_KEYS) {
    const aa = a.arms[key], bb = b.arms[key];
    row.arms[key] = {
      e: aa.e + (bb.e - aa.e) * d,
      x: aa.x + (bb.x - aa.x) * d, y: aa.y + (bb.y - aa.y) * d, z: aa.z + (bb.z - aa.z) * d,
    };
  }
  applyRow(F, row, state.floor);
  state.raf = requestAnimationFrame(frame);
}

function enter() {
  const F = window.__fin;
  if (!F || state.active) return;
  const mech = F.mech, scene = F.scene;
  state.saved = {
    parent: mech.parent,
    pos: mech.position.clone(),
    quat: mech.quaternion.clone(),
    pose: window.__poses?.snapshot?.() || null,
  };
  state.handBase = { right: F.grip.right.hand.hand.position.clone(), leftFront: F.grip.leftFront.hand.hand.position.clone() };
  const floor = minY(F.LG.group);
  state.floor = floor;
  const pivot = new THREE.Group();
  pivot.name = 'pushupPivot';
  scene.add(pivot);
  pivot.position.set(0, floor, 0);
  mech.parent.remove(mech);
  pivot.add(mech);
  mech.position.y -= floor;
  state.pivot = pivot;
  window.__pushupActive = true;

  for (const a of Object.values(F.A.arms)) if (a.deploy) a.deploy(0);
  setRearStow(F);
  setLegs(F);
  for (const key of ARM_KEYS) {
    const g = F.grip[key];
    g.wrist.target = 70; g.wrist.cur = 70; g.roll.target = -90; g.roll.cur = -90;
    openGrip(F, key);
  }
  state.table = buildTable(F, pivot, floor);
  const top = state.table[0];
  applyRow(F, top, floor);
  refitHands(F, top, floor);
  framePose(F);
  state.active = true;
  state.depth = 0;
  updateUI();
}

function exit() {
  if (!state.active) return;
  state.active = false;
  cancelAnimationFrame(state.raf);
  const F = window.__fin, s = state.saved, pivot = state.pivot;
  window.__pushupActive = false;
  if (pivot && s) {
    pivot.remove(F.mech);
    s.parent.add(F.mech);
    F.mech.position.copy(s.pos);
    F.mech.quaternion.copy(s.quat);
    F.scene.remove(pivot);
  }
  if (state.handBase) {
    F.grip.right.hand.hand.position.copy(state.handBase.right);
    F.grip.leftFront.hand.hand.position.copy(state.handBase.leftFront);
    state.handBase = null;
  }
  state.pivot = null; state.table = null; state.saved = null;
  if (s?.pose && window.__poses) window.__poses.start('', s.pose);
  F.view('front');
  updateUI();
}

let enterBtn = null, exitBtn = null, upBtn = null, downBtn = null;
function setDepth(d) {
  if (!state.active || !state.table) return;
  const F = window.__fin, row = state.table[d ? state.table.length - 1 : 0];
  state.depth = d ? 1 : 0;
  applyRow(F, row, state.floor);
  refitHands(F, row, state.floor);
  framePose(F);
  updateUI();
}
function updateUI() {
  if (!enterBtn) return;
  enterBtn.textContent = state.active ? '俯卧撑中…' : '俯卧撑';
  enterBtn.disabled = state.active;
  exitBtn.disabled = !state.active;
  if (upBtn) { upBtn.disabled = !state.active; downBtn.disabled = !state.active; }
}

function mount() {
  const panel = $('panel');
  if (!panel || !window.__fin) return setTimeout(mount, 300);
  const pose = [...panel.querySelectorAll('details')].find(d => d.querySelector('summary')?.textContent.trim() === '姿态预设');
  if (!pose) return setTimeout(mount, 300);
  const host = pose.querySelector('.sec') || pose;
  const d = document.createElement('details'); d.open = false;
  d.innerHTML = '<summary>动作</summary>';
  const sec = document.createElement('div'); sec.className = 'sec';
  const btns = document.createElement('div'); btns.className = 'btns';
  enterBtn = document.createElement('button'); enterBtn.textContent = '俯卧撑'; enterBtn.onclick = enter;
  exitBtn = document.createElement('button'); exitBtn.textContent = '起身'; exitBtn.onclick = exit; exitBtn.disabled = true;
  upBtn = document.createElement('button'); upBtn.textContent = '撑起'; upBtn.onclick = () => setDepth(0); upBtn.disabled = true;
  downBtn = document.createElement('button'); downBtn.textContent = '下压'; downBtn.onclick = () => setDepth(1); downBtn.disabled = true;
  btns.append(enterBtn, upBtn, downBtn, exitBtn); sec.appendChild(btns);
  const note = document.createElement('p'); note.className = 'note';
  note.textContent = '整机绕脚趾俯下；左右手掌分别解掌面朝向与肘角，掌心朝下、手指朝前贴地。用「下压 / 撑起」切换两个已解算好的姿态；起身恢复进入前的姿态。';
  sec.appendChild(note); d.appendChild(sec);
  host.appendChild(d);
  window.__pushup = { enter, exit, state, P_TOP, P_DOWN };
  updateUI();
}
mount();
