// 分级 R 规则 + 对比条。R 用世界单位（1 单位 ≈ 2.05 m）：0.012 ≈ 2.5 cm，0.035 ≈ 7 cm，0.07 ≈ 14 cm，0.09 ≈ 18 cm。
// 每个散件的 R 最后还会被限制在“厚度 × 0.3”以内（roundParts 里做），薄件自动更小。
import { PAL } from './paint.js';

const DEG = 180 / Math.PI;
// 全身规则。分档：大 R 0.06–0.07（大型主甲）/ 小 R 0.035（中型护甲、手、脚）/ 更小 0.018（小护甲）/ 极小 0.008–0.012（螺栓、凸耳、轴端）/ 硬边
const L = { big: { r: 0.065, step: 22.5 }, mid: { r: 0.035, step: 30 }, small: { r: 0.018, step: 45 }, tiny: { r: 0.01, step: 90, merge: 12 } };
const HARD_NAMES = /^LF\.seg\d|^LR\.claw\d:clay|reactorBlade|matrixLight|^thrusterSeam|exhaust|Throat|visor|^eye/;   // 刃口、爪、风扇叶、灯、排气口
export function pickRadius(i) {
  const n = i.mesh.name || '', mat = i.mat, armor = mat === PAL.armor || mat === PAL.armor2, hw = mat === PAL.frame, chrome = mat === PAL.chrome;
  if (i.mesh.userData.noRelief) return null;                                       // 头部、颈部（已认可，不动）、腰芯
  if (HARD_NAMES.test(n)) return null;
  if (i.minInterior * DEG < 40) return null;                                       // 尖端/刃口：保留硬边
  const S = Math.max(i.size.x, i.size.y, i.size.z);
  if (chrome) return S < 0.32 ? { ...L.tiny, r: 0.008, cls: '螺栓/轴端/小机械件' } : null;   // 活塞杆、销轴是滑动/配合面：不动
  if (hw) return { ...(S < 0.7 ? L.tiny : { r: 0.022, step: 90, merge: 12 }), cls: S < 0.7 ? '螺栓/轴端/小机械件' : '关节件/机架' };
  if (!armor) return null;                                                         // 黑色接缝条、灯、玻璃等
  // ---- 腿 ----
  if (/^leg[RL]\.(thigh|shin):clay/.test(n)) {
    const front = i.bb.max.z > 1.3 && i.size.x > 1.4 && i.size.y > 0.9;
    return front ? { r: 0.07, step: 22.5, cls: '腿正面主甲' } : { r: 0.045, step: 30, cls: '腿内外侧/后侧护甲' };   // 2026-10-23 用户要求两侧护甲也加 R
  }
  if (/^leg[RL]\.(foot|toes):clay/.test(n)) return { ...L.mid, cls: '脚/手' };
  // ---- 手 ----
  if (/\.(finger\d|thumb|palm):clay/.test(n)) return { r: /palm/.test(n) ? 0.035 : 0.028, step: 45, cls: '脚/手' };
  // ---- 其余护甲按尺寸分档 ----
  if (S >= 2.5 && i.thick > 0.25) return { ...L.big, cls: '大型主甲' };
  if (S >= 0.8) return { ...L.mid, cls: '中型护甲' };
  return { ...L.small, cls: '小护甲' };
}

// ---------- 原版 / 圆角 对比：切换时重新载入页面，相机、全部面板滑杆/下拉/勾选原样恢复 ----------
const KEY = 'mech026.roundCompare';
export function setupCompare(F, info) {
  const Q = new URLSearchParams(location.search), on = Q.get('round') !== '0';
  // 一个勾选框放在“视角 · 出图”里：勾上 = 原版硬边（重新载入，相机/姿态/涂装原样保留）
  const sec = document.querySelector('#panel details .sec');
  const row = document.createElement('label'); row.className = 'row chk';
  row.innerHTML = '<input type="checkbox" id="hardEdges"><span>原版硬边（关闭分级 R 角）</span>';
  row.title = on ? '分级 R 角：' + info : '当前为原版硬边';
  const ck = row.querySelector('input'); ck.checked = !on; ck.onchange = () => go(!ck.checked);
  sec.appendChild(row);
  // restore the state saved before the reload
  let saved = null; try { saved = JSON.parse(sessionStorage.getItem(KEY) || 'null'); sessionStorage.removeItem(KEY); } catch {}
  if (saved) {
    const els = [...document.querySelectorAll('#panel input:not(#hardEdges), #panel select')];
    saved.inputs.forEach((v, i) => { const e = els[i]; if (!e || v === null) return;
      if (e.type === 'checkbox') { if (e.checked !== v) { e.checked = v; e.dispatchEvent(new Event('change')); } }
      else if (String(e.value) !== String(v)) { e.value = v; e.dispatchEvent(new Event(e.tagName === 'SELECT' ? 'change' : 'input')); } });
    for (const [k, o] of Object.entries(saved.open || {})) { const d = document.querySelectorAll('#panel details')[k]; if (d) d.open = o; }
    F.cam.position.fromArray(saved.cam.p); F.cam.quaternion.fromArray(saved.cam.q); F.cam.fov = saved.cam.f; F.cam.updateProjectionMatrix();
  }
  function go(v) {
    const els = [...document.querySelectorAll('#panel input:not(#hardEdges), #panel select')];
    const state = { inputs: els.map(e => e.type === 'checkbox' ? e.checked : e.value), open: [...document.querySelectorAll('#panel details')].map(d => d.open),
      cam: { p: F.cam.position.toArray(), q: F.cam.quaternion.toArray(), f: F.cam.fov } };
    try { sessionStorage.setItem(KEY, JSON.stringify(state)); } catch {}
    Q.set('round', v ? '1' : '0'); location.search = Q.toString();
  }
}
