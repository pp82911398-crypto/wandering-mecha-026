// Finishing-room rig controls, adapted to the airport's machine programs and simulation clock.
import { DEFAULT_STANCE_ABD } from '../finallab/lowerRig.js';

const RAD = Math.PI / 180;
const deg = v => Math.round(v) + '°';
const pct = v => Math.round(v * 100) + '%';
const HEAD_ENV = [[0, 20, 9], [5, 20, 9], [10, 15, 9], [15, 15, 9], [20, 12, 9], [25, 12, 9], [30, 12, 6], [35, 12, 4], [40, 12, 0]];
const HEAD_LOOK = [[.4, 0, 0], [2.4, 32, -3], [2.9, 32, -3], [5, -32, 6], [5.6, -32, 6], [7, 10, -8], [7.6, 10, -8], [9, 0, 0]];
const WAIST_SEQ = [[1.6, 0, -5, 0], [2.4, 0, -5, 0], [4, 0, 11, 0], [4.6, 0, 11, 0], [6.2, 14, 2, 0], [6.8, 14, 2, 0], [8.4, -14, 2, 0], [9, -14, 2, 0], [10.4, 0, 0, 8], [11, 0, 0, 8], [12.4, 0, 0, -8], [13, 0, 0, -8], [14.6, 0, 0, 0]];
const GRIP_SEQ = [[.9, 1], [1.7, 1], [2.7, 0], [3.3, 0], [4.3, .3]];
const channel = (v = 0) => ({ target: v, cur: v, vel: 0 });
const motion = keys => ({ axes: Object.fromEntries(keys.map(k => [k, channel()])), seq: null });
function spring(c, dt, omega) {
  const before = c.cur;
  for (let left = dt; left > 1e-5; left -= .016) {
    const step = Math.min(.016, left);
    c.vel += (omega * omega * (c.target - c.cur) - 2 * omega * c.vel) * step;
    c.cur += c.vel * step;
  }
  if (Math.abs(c.target - c.cur) < 1e-5 && Math.abs(c.vel) < 1e-5) { c.cur = c.target; c.vel = 0; }
  return Math.abs(before - c.cur) > 1e-8;
}
function headEnvelope(yaw) {
  const y = Math.min(40, Math.abs(yaw));
  for (let i = 1; i < HEAD_ENV.length; i++) {
    const [a, u0, d0] = HEAD_ENV[i - 1], [b, u1, d1] = HEAD_ENV[i];
    if (y <= b) { const t = (y - a) / (b - a); return [u0 + (u1 - u0) * t, d0 + (d1 - d0) * t]; }
  }
  return [12, 0];
}

export function createMechControls({ mech, machine: MC, dock: D, fold, parent, onMove = () => {} }) {
  const arms = mech.arms.arms, P = mech.prop, lower = mech.model.lowerRig;
  const head = motion(['yaw', 'pitch']), waist = motion(['twist', 'bend', 'side']);
  const grips = {}, weapons = {}, weaponUi = {}, propUi = {};
  let propSeq = null, clawSpin = false, plantDirty = false, uiElapsed = 0;
  const note = (sec, text) => { const p = document.createElement('p'); p.className = 'note'; p.textContent = text; sec.append(p); };
  const slider = (sec, label, min, max, step, value, fmt, on) => {
    const input = D.slider(sec, label, min, max, step, value, fmt, on);
    const output = input.parentElement.querySelector('b');
    const show = v => { if (document.activeElement !== input) { input.value = v; output.textContent = fmt(v); } };
    return { input, show, set(v) { input.value = v; input.oninput(); } };
  };
  const stopWeapons = () => {
    // Manual sliders take ownership without folding the other weapons on the next MC frame.
    MC.st.thunder = false; MC.st.deploy = 0; MC.st._appliedDeploy = 0; MC.st.sawSpeed = 0;
  };
  const stopPropProgram = () => { MC.st.thr = false; MC.st.thrT = 0; propSeq = null; };
  const setProp = (key, v) => { P.tgt[key] = v; propUi[key]?.show(v); };
  const startProp = steps => { stopPropProgram(); onMove(); propSeq = { t: 0, next: 0, steps }; };
  const setMotion = (ctl, key, v) => { ctl.seq = null; ctl.axes[key].target = v; onMove(); };
  const resetMotion = ctl => { ctl.seq = null; for (const c of Object.values(ctl.axes)) { c.target = 0; c.ui.show(0); } onMove(); };
  const sequence = (ctl, frames) => { ctl.seq = { t: 0, frames }; onMove(); };
  const tickSequence = (ctl, dt) => {
    if (!ctl.seq) return;
    ctl.seq.t += dt;
    const frame = ctl.seq.frames.find(f => ctl.seq.t < f[0]);
    Object.values(ctl.axes).forEach((c, i) => c.target = frame ? frame[i + 1] : 0);
    if (!frame) ctl.seq = null;
  };
  const handRot = g => g.hand.hand.rotation.set(-g.wrist.cur * RAD, g.roll.cur * RAD, 0);
  // Propulsion opens the fingers before firing the palms, just as in the finishing room.
  P.grip = grips;
  for (const key of ['right', 'leftFront']) {
    grips[key] = { ...channel(.3), dep: 0, seq: null, hand: arms[key].hand, wrist: channel(), roll: channel() };
  }
  for (const [key, arm] of Object.entries(arms)) {
    weapons[key] = MC.st.deploy;
    const deploy = arm.deploy;
    arm.deploy = value => {
      weapons[key] = value;
      const g = grips[key];
      if (g) { g.dep = value; if (value > 0) g.hand.hand.rotation.set(0, 0, 0); }
      deploy(value);
      if (g && value === 0) { g.hand.setGrip(g.cur); handRot(g); }
    };
  }

  const hs = fold(parent, '头部');
  const canopy = slider(hs, '驾驶舱盖', 0, 1, .01, 0, pct, v => { if (v < 1) onMove(); MC.canopy(v); });
  const foreheadRow = document.createElement('label'); foreheadRow.className = 'row';
  const foreheadLabel = document.createElement('span'); foreheadLabel.textContent = '额头标志';
  const forehead = document.createElement('select'); forehead.setAttribute('aria-label', '额头标志');
  for (const [key, text] of Object.entries(mech.model.FOREHEAD.styles)) forehead.add(new Option(text, key));
  forehead.value = 'blue'; forehead.onchange = () => mech.model.FOREHEAD.set(forehead.value);
  foreheadRow.append(foreheadLabel, forehead); hs.append(foreheadRow);
  head.axes.yaw.ui = slider(hs, '左右转头', -40, 40, 1, 0, deg, v => setMotion(head, 'yaw', v));
  head.axes.pitch.ui = slider(hs, '抬头 / 低头', -9, 20, 1, 0, deg, v => setMotion(head, 'pitch', v));
  D.buttons(hs, [['环顾', () => sequence(head, HEAD_LOOK)], ['回正', () => resetMotion(head)]]);

  const ws = fold(parent, '腰部');
  for (const [key, label, min, max] of [['twist', '扭腰', -15, 15], ['bend', '前屈 / 后仰', -6, 12], ['side', '侧弯', -10, 10]]) {
    waist.axes[key].ui = slider(ws, label, min, max, 1, 0, deg, v => setMotion(waist, key, v));
  }
  D.buttons(ws, [['伸展', () => sequence(waist, WAIST_SEQ)], ['回正', () => resetMotion(waist)]]);

  const bs = fold(parent, '武器');
  note(bs, '展开时自动摆到备战姿态；刀刃完全展开后点燃刃缘。手动调整会接管武器程序。');
  const allWeapons = slider(bs, '全部展开', 0, 1, .01, 0, pct, v => { stopWeapons(); onMove(); Object.values(arms).forEach(a => a.deploy(v)); });
  for (const [key, label] of [['right', '右臂 等离子炮'], ['leftFront', '左前臂 刀刃'], ['leftRear', '左后臂 锯爪']]) {
    weaponUi[key] = slider(bs, label, 0, 1, .01, 0, pct, v => { stopWeapons(); onMove(); arms[key].deploy(v); });
  }
  const spinCheck = D.check(bs, '锯爪旋转', on => { stopWeapons(); clawSpin = on; if (on) onMove(); });
  const missiles = slider(bs, '肩部导弹舱', 0, 1, .01, 0, pct, v => Object.values(arms).forEach(a => a.setMissiles?.(v)));

  const ps = fold(parent, '推进器');
  note(ps, '背推展开到位后出火，有背部或脚底推力时才能升起；机体活动时连接桥自动收回。');
  for (const [key, label] of [['deploy', '背推展开'], ['wing', '展翼（外张）'], ['thrust', '背部推力'], ['foot', '脚底推力'], ['palm', '手掌推力'], ['hover', '悬空高度']]) {
    propUi[key] = slider(ps, label, 0, key === 'hover' ? 10 : 1, key === 'hover' ? .1 : .01, P.tgt[key], key === 'hover' ? v => (v * mech.group.scale.y).toFixed(1) + ' m' : pct,
      v => { stopPropProgram(); onMove(); setProp(key, v); });
  }
  D.buttons(ps, [['起飞', () => startProp([[0, 'deploy', 1], [.9, 'thrust', .85], [.9, 'foot', .8], [1.5, 'hover', 6]])],
    ['降落', () => startProp([[0, 'hover', 0], [3.5, 'thrust', 0], [3.5, 'foot', 0], [4.3, 'deploy', 0]])],
    ['熄火', () => { stopPropProgram(); for (const key of ['thrust', 'foot', 'palm', 'hover']) setProp(key, 0); }]]);
  D.buttons(ps, [['展翼', () => startProp([[0, 'deploy', 1], [.7, 'wing', 1]])], ['收翼', () => startProp([[0, 'wing', 0], [1.4, 'deploy', 0]])]]);

  const gs = fold(parent, '手掌');
  note(gs, '武器收起时可调整手掌；武器展开时由武器动作接管。');
  for (const [key, cn] of [['right', '右手'], ['leftFront', '左前手']]) {
    const g = grips[key];
    g.ui = slider(gs, cn + ' 开合', 0, 1, .01, .3, v => v < .05 ? '张开' : v > .95 ? '握拳' : pct(v), v => { g.seq = null; g.target = v; });
    g.wrist.ui = slider(gs, cn + ' 手腕', -85, 70, 1, 0, deg, v => g.wrist.target = v);
    g.roll.ui = slider(gs, cn + ' 掌面翻转', -90, 90, 1, 0, deg, v => g.roll.target = v);
  }
  const allHands = fn => Object.values(grips).forEach(fn);
  D.buttons(gs, [['撑掌', () => allHands(g => { g.ui.set(0); g.wrist.ui.set(70); g.roll.ui.set(-90); })],
    ['手腕回正', () => allHands(g => { g.wrist.ui.set(0); g.roll.ui.set(0); })]]);
  D.buttons(gs, [['抓握', () => allHands(g => g.seq = { t: 0 })], ['全张开', () => allHands(g => g.ui.set(0))],
    ['全握拳', () => allHands(g => g.ui.set(1))], ['自然', () => allHands(g => g.ui.set(.3))]]);

  const ls = fold(parent, '腿部 · 双腿');
  lower.onPlant(() => plantDirty = true);
  const abd = slider(ls, '外展', -10, 30, 1, lower.C.abd, deg, v => { onMove(); lower.C.abd = v; lower.apply(); });
  const stand = () => {
    onMove();
    for (const leg of Object.values(lower.L)) Object.assign(leg, { pitch: 0, knee: 0, ankle: 0 });
    Object.assign(lower.C, { abd: DEFAULT_STANCE_ABD, yaw: 0, toe: 0 }); lower.ANKLE.out = 0;
    lower.setLowerSwap(true); lower.apply(); abd.show(DEFAULT_STANCE_ABD);
  };
  D.buttons(ls, [['标准站姿 · 外展 3°', stand]], 1);
  const reset = () => {
    resetMotion(head); resetMotion(waist); MC.canopy(0); canopy.show(0);
    stopWeapons(); clawSpin = false; spinCheck.checked = false; allWeapons.set(0); missiles.set(0);
    stopPropProgram(); for (const key of Object.keys(propUi)) setProp(key, 0);
    allHands(g => { g.ui.set(.3); g.wrist.ui.set(0); g.roll.ui.set(0); }); stand();
  };
  D.buttons(parent, [['机体动作复位', reset]], 1);

  function update(dt) {
    tickSequence(head, dt); tickSequence(waist, dt);
    const [targetUp, targetDown] = headEnvelope(head.axes.yaw.target);
    head.axes.pitch.target = Math.max(-targetDown, Math.min(targetUp, head.axes.pitch.target));
    let headMoved = false, waistMoved = false;
    for (const c of Object.values(head.axes)) headMoved = spring(c, dt, 3.2) || headMoved;
    const H = head.axes, [up, down] = headEnvelope(H.yaw.cur);
    const pitch = Math.max(-down, Math.min(up, H.pitch.cur));
    if (pitch !== H.pitch.cur) { H.pitch.cur = pitch; H.pitch.vel = 0; headMoved = true; }
    if (headMoved) mech.neck.set(H.yaw.cur, H.pitch.cur);
    const W = waist.axes;
    // Combined axes share the same safe movement envelope as the finishing room.
    const n = Math.hypot(W.twist.target / 15, W.bend.target / (W.bend.target > 0 ? 12 : 6), W.side.target / 10);
    if (n > 1.25) for (const c of Object.values(W)) c.target *= 1.25 / n;
    for (const c of Object.values(W)) waistMoved = spring(c, dt, 2.4) || waistMoved;
    if (waistMoved) mech.waist.set(W.twist.cur, W.bend.cur, W.side.cur);
    if (MC.st.thr) propSeq = null;
    if (propSeq) {
      propSeq.t += dt;
      while (propSeq.next < propSeq.steps.length && propSeq.steps[propSeq.next][0] <= propSeq.t) {
        const [, key, value] = propSeq.steps[propSeq.next++]; setProp(key, value);
      }
      if (propSeq.next === propSeq.steps.length) propSeq = null;
    }
    if (clawSpin && !MC.st.thunder && !(MC.st.sawSpeed > .05)) {
      MC.st.spin += dt * 9; arms.leftRear.spin(MC.st.spin); arms.leftRear.update();
    }
    for (const g of Object.values(grips)) {
      if (g.seq) {
        g.seq.t += dt; const frame = GRIP_SEQ.find(f => g.seq.t < f[0]);
        g.target = frame ? frame[1] : .3; if (!frame) g.seq = null;
      }
      if (P.palm > .05) { g.seq = null; g.target = 0; }
      const moved = spring(g, dt, 6);
      g.cur = Math.max(0, Math.min(1, g.cur));
      const wristMoved = spring(g.wrist, dt, 5), rollMoved = spring(g.roll, dt, Math.sqrt(20));
      if (g.dep === 0) { if (moved) g.hand.setGrip(g.cur); if (wristMoved || rollMoved) handRot(g); }
    }
    if (headMoved || waistMoved || MC.st.thunder || MC.st.thr || P.hover > .01 || P.tgt.hover > 0) onMove();
    if (plantDirty) { mech.plantFeet(); plantDirty = false; }
    uiElapsed += dt;
    if (uiElapsed >= .1) {
      uiElapsed = 0; canopy.show(MC.st.canopyTarget ?? 0);
      for (const c of [...Object.values(H), ...Object.values(W)]) c.ui.show(c.target);
      for (const [key, value] of Object.entries(weapons)) weaponUi[key]?.show(value);
      const deployed = Object.values(weapons);
      // A mixed per-arm pose has no single "all" value; show its average until the next collective input.
      allWeapons.show(deployed.reduce((a, b) => a + b, 0) / deployed.length);
      for (const [key, ui] of Object.entries(propUi)) ui.show(P.tgt[key]);
      for (const g of Object.values(grips)) { g.ui.show(g.target); g.wrist.ui.show(g.wrist.target); g.roll.ui.show(g.roll.target); }
    }
  }
  return { update, reset, stand, head, waist, grips, weapons,
    syncAppearance(value) { if (value.forehead) forehead.value = value.forehead; } };
}
