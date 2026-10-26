// Shared default lower-leg assembly and its live mechanisms (finallab / domelab).
import * as THREE from 'three';
import { buildAnkleGears } from './ankleGear.js';

export const DEFAULT_STANCE_ABD = 3;

export function createLowerRig(LG, PAL) {
  const R2D = Math.PI / 180;
  const L = { R: { pitch: 0, knee: 0, ankle: 0 }, L: { pitch: 0, knee: 0, ankle: 0 } };
  const C = { abd: DEFAULT_STANCE_ABD, yaw: 0, toe: 0 };
  let onPlant = () => {};
  // 脚掌找平：记录相对下肢根组的静止朝向，保留机场转台施加的整体转向。
  const footRest = {};
  const recomputeFootRest = () => {
    const inverseFrame = LG.group.getWorldQuaternion(new THREE.Quaternion()).invert();
    for (const id of ['R', 'L']) {
      const leg = LG.legs[id];
      leg.setPose();
      leg.hipG.updateMatrixWorld(true);
      footRest[id] = leg.ankleG.getWorldQuaternion(new THREE.Quaternion()).premultiply(inverseFrame);
    }
  };
  // 整节小腿对调测试：把每条腿的 kneeG 整棵子树（小腿装甲 + 踝/脚 + 液压杆 + 软管）移到对侧髋
  const lowerRefs = {};
  const kneeLinks = { R: [], L: [] };
  for (const id of ['R', 'L']) {
    const leg = LG.legs[id];
    lowerRefs[id] = { knee: leg.kneeG, ankle: leg.ankleG, toe: leg.toeG, rams: leg.rams, hoses: leg.hoses };
    // rams/hoses that go hip→knee are the ones that cross after a lower swap; remember their original endpoints
    for (const o of [...leg.rams, ...leg.hoses]) {
      const hipEnd = o.objA === leg.hipG ? 'A' : o.objB === leg.hipG ? 'B' : null;
      const kneeEnd = o.objA === leg.kneeG ? 'A' : o.objB === leg.kneeG ? 'B' : null;
      if (hipEnd && kneeEnd) {
        o._origA = { obj: o.objA, p: o.pA.clone(), t: o.tA ? o.tA.clone() : null };
        o._origB = { obj: o.objB, p: o.pB.clone(), t: o.tB ? o.tB.clone() : null };
        kneeLinks[id].push(o);
      }
    }
  }
  const LOWER = { on: false };
  const ANKLE = { out: 0 };
  for (const id of ['R', 'L']) { LG.legs[id]._ankle0x = LG.legs[id].ankleG.position.x; LG.legs[id]._knee0x = LG.legs[id].kneeG.position.x; }
  const flipEnd = (o, side, hip) => {
    const p = o['p' + side].clone(); p.x *= -1;
    o['obj' + side] = hip; o['p' + side] = p;
    if (o['t' + side]) { const t = o['t' + side].clone(); t.x *= -1; o['t' + side] = t; }
  };
  const restoreLinks = (id) => {
    for (const o of kneeLinks[id]) {
      for (const side of ['A', 'B']) {
        const orig = o['_orig' + side];
        o['obj' + side] = orig.obj; o['p' + side] = orig.p.clone();
        if (orig.t) o['t' + side] = orig.t.clone();
      }
    }
  };
  const apply = () => {
    const frame = LG.group.getWorldQuaternion(new THREE.Quaternion());
    for (const id of ['R', 'L']) {
      const leg = LG.legs[id];
      const yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), leg.s * C.yaw * R2D);   // each foot turns with its own hip
      leg.setPose({ ...L[id], ...C });
      leg.ankleG.position.x = leg._ankle0x + leg.s * ANKLE.out;   // 脚踝/脚掌整体外移
      leg.hipG.updateMatrixWorld(true);
      const parentQ = new THREE.Quaternion(); leg.kneeG.getWorldQuaternion(parentQ);
      const desired = frame.clone().multiply(yawQ).multiply(footRest[id]);
      leg.ankleG.quaternion.copy(parentQ.invert().multiply(desired));
    }
    // Foot position/orientation is final only here. Refresh the mechanisms after
    // that correction so their eyes and hose ends stay on the actual mounts.
    LG.group.updateMatrixWorld(true);
    for (const leg of Object.values(LG.legs)) for (const link of [...leg.rams, ...leg.hoses]) link.update();
    AG.update(LOWER.on);
    onPlant();
  };
  // 踝部大轴鼓（ankleGear.js）：居中在脚的踝轴上，脚绕它前后转，鼓随脚左右侧倾（四向）；小腿原踝颊板/踝盘不再生成
  let footMat = PAL.armor;
  lowerRefs.R.ankle.traverse(o => { if (o.isMesh && o.userData.part === 'legR.foot' && o.material !== PAL.dark) footMat = Array.isArray(o.material) ? o.material[0] : o.material; });
  const AG = buildAnkleGears(['R', 'L'].map(id => ({ id, s: LG.legs[id].s, kneeG: lowerRefs[id].knee, ankleG: lowerRefs[id].ankle })),
    { armor: footMat, frame: PAL.frame, chrome: PAL.chrome, dark: PAL.dark, lamp: PAL.lamp });
  window.__ankle = AG;
  const setLowerSwap = (on) => {
    if (on === LOWER.on) return;
    restoreLinks('R'); restoreLinks('L');
    for (const [to, from] of [['R', 'L'], ['L', 'R']]) {
      const leg = LG.legs[to], ref = lowerRefs[on ? from : to];
      leg.hipG.add(ref.knee);
      ref.knee.position.x = leg._knee0x;   // knee axle stays on this thigh's knee (the swapped shin used to sit 0.4 outboard -> knock-kneed look)
      leg.kneeG = ref.knee; leg.ankleG = ref.ankle; leg.toeG = ref.toe; leg.rams = ref.rams; leg.hoses = ref.hoses;
      if (on) {
        const srcHip = LG.legs[from].hipG, dstHip = leg.hipG;
        for (const o of kneeLinks[from]) {
          if (o.objA === srcHip) flipEnd(o, 'A', dstHip);
          else if (o.objB === srcHip) flipEnd(o, 'B', dstHip);
        }
      }
    }
    LOWER.on = on;
    for (const id of ['R', 'L']) {
      for (const o of [...LG.legs[id].rams, ...LG.legs[id].hoses]) o.update(); }
    recomputeFootRest(); apply();
  };
  recomputeFootRest();

  setLowerSwap(true);
  return { L, C, ANKLE, LOWER, AG, apply, setLowerSwap,
    onPlant(fn) { onPlant = fn; } };
}
