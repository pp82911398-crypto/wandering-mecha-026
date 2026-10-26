// 姿态预设：驱动控制面板上现有的滑杆（不改 lab.js），全身在约 1.8 秒内平滑过渡到目标姿态。
// 头部 / 腰部 / 手掌 / 推进器的滑杆本身是"目标值 + 缓动"，只在开始时设一次；其余（腿、手臂、武器、驾驶舱盖）逐帧插值。
// 每个预设都从"全部默认值"出发再覆盖，所以结果确定，不受上一个姿态影响。
const SECTIONS = /^(头部|腰部|武器|推进器|手掌|手臂 · |腿部 · )/;
const EASED = /^(头部|腰部|手掌|推进器)\|/;
const EXCLUDE = /脚踝外移/;

// [section | label prefix] -> value ; checkboxes: true / false
const POSES = {
  '王者站姿': {
    '腿部 · 右腿|髋 前后摆': 6, '腿部 · 右腿|膝': 4, '腿部 · 左腿|髋 前后摆': -6, '腿部 · 左腿|膝': 4,
    '腿部 · 双腿|外展': 8, '腿部 · 双腿|髋 内外旋': 8,
    '腰部|前屈 / 后仰': -5, '头部|抬头 / 低头': 8,
    '手臂 · 右臂|外展': 10, '手臂 · 右臂|肘弯': 8, '手臂 · 左前臂|外展': 8, '手臂 · 左前臂|肘弯': 8, '手臂 · 左后副臂|后举': 15,
    '手掌|右手 开合': 1, '手掌|左前手 开合': 1,
  },
  '战斗待机': {
    '武器|右臂 等离子炮': 1, '武器|左前臂 刀刃': 1, '武器|左后臂 锯爪': 1, '武器|锯爪旋转': true, '武器|肩部导弹舱': 1,
    '腿部 · 右腿|髋 前后摆': 24, '腿部 · 右腿|膝': 40, '腿部 · 左腿|髋 前后摆': 10, '腿部 · 左腿|膝': 34, '腿部 · 双腿|外展': 12,
    '腰部|前屈 / 后仰': 8, '腰部|扭腰': 6, '头部|抬头 / 低头': 4, '头部|左右转': -6,
    '推进器|背推展开': 1, '推进器|展翼': 0.6,
  },
  '炮击瞄准': {
    '武器|右臂 等离子炮': 1, '武器|肩部导弹舱': 1,
    '腿部 · 右腿|髋 前后摆': -14, '腿部 · 右腿|膝': 16, '腿部 · 左腿|髋 前后摆': 26, '腿部 · 左腿|膝': 34,
    '腿部 · 双腿|外展': 8, '腿部 · 双腿|髋 内外旋': 6,
    '腰部|扭腰': -13, '腰部|侧弯': 5, '腰部|前屈 / 后仰': 4, '头部|左右转': 14,
    '手臂 · 左前臂|抬臂': 25, '手臂 · 左前臂|肘弯': 70, '手掌|左前手 开合': 1, '手臂 · 左后副臂|后举': 20,
    '推进器|背推展开': 1,
  },
  '拔刀突进': {
    '武器|左前臂 刀刃': 1,
    '腿部 · 左腿|髋 前后摆': 38, '腿部 · 左腿|膝': 60, '腿部 · 右腿|髋 前后摆': -26, '腿部 · 右腿|膝': 18, '腿部 · 双腿|外展': 6,
    '腰部|前屈 / 后仰': 12, '腰部|扭腰': 10, '头部|抬头 / 低头': 10, '头部|左右转': -6,
    '手臂 · 右臂|抬臂': 20, '手臂 · 右臂|肘弯': 85, '手掌|右手 开合': 1, '手臂 · 左后副臂|后举': 30,
    '推进器|背推展开': 1, '推进器|背部推力': 0.8,
  },
  '悬空巡航': {
    '推进器|背推展开': 1, '推进器|展翼': 1, '推进器|背部推力': 0.9, '推进器|脚底推力': 0.9, '推进器|悬空高度': 7,
    '腿部 · 右腿|髋 前后摆': 12, '腿部 · 右腿|膝': 30, '腿部 · 左腿|髋 前后摆': -8, '腿部 · 左腿|膝': 18,
    '腿部 · 双腿|脚趾': -15, '腿部 · 双腿|外展': 4,
    '腰部|前屈 / 后仰': -3, '头部|抬头 / 低头': -6, '头部|左右转': 10,
    '手臂 · 右臂|外展': 18, '手臂 · 右臂|肘弯': 20, '手臂 · 左前臂|外展': 16, '手臂 · 左前臂|肘弯': 20, '手臂 · 左后副臂|后举': 25,
    '手掌|右手 开合': 0.15, '手掌|左前手 开合': 0.15, '手掌|右手 手腕': -20, '手掌|左前手 手腕': -20,
  },
  '登舱迎接': {
    '头部|驾驶舱盖': 1,
    '腿部 · 右腿|髋 前后摆': 34, '腿部 · 右腿|膝': 72, '腿部 · 左腿|髋 前后摆': 34, '腿部 · 左腿|膝': 72,
    '腰部|前屈 / 后仰': 10, '头部|抬头 / 低头': -9,
    '手臂 · 右臂|抬臂': 40, '手臂 · 右臂|肘弯': 50, '手掌|右手 开合': 0, '手掌|右手 手腕': 60,
  },
};

function controls() {
  const map = new Map();
  for (const d of document.querySelectorAll('#panel details')) {
    const title = d.querySelector('summary')?.textContent.trim() || '';
    if (!SECTIONS.test(title)) continue;
    for (const row of d.querySelectorAll('label.row')) {
      const label = row.querySelector('span')?.textContent.trim() || '', inp = row.querySelector('input');
      if (!inp || EXCLUDE.test(label)) continue;
      map.set(title + '|' + label, inp);
    }
  }
  return map;
}
const find = (map, key) => { if (map.has(key)) return [key, map.get(key)]; const [t, l] = key.split('|'); for (const [k, inp] of map) { const [kt, kl] = k.split('|'); if (kt === t && kl.startsWith(l)) return [k, inp]; } return [null, null]; };
// 自定义姿态：存在本机浏览器里（localStorage），刷新后还在；换浏览器/设备不共享
const STORE = 'mech026.poses';
const loadSaved = () => { try { return JSON.parse(localStorage.getItem(STORE) || '{}'); } catch { return {}; } };
const writeSaved = (o) => { try { localStorage.setItem(STORE, JSON.stringify(o)); } catch {} };
function snapshot() { const o = {}; for (const [k, inp] of controls()) { if (/蹲起深度/.test(k)) continue; o[k] = inp.type === 'checkbox' ? inp.checked : +inp.value; } return o; }
const fire = (inp, v) => {
  if (inp.type === 'checkbox') { if (inp.checked !== v) { inp.checked = v; inp.dispatchEvent(new Event('change', { bubbles: true })); } return; }
  inp.value = v; inp.dispatchEvent(new Event('input', { bubbles: true }));
};
const ease = u => u * u * (3 - 2 * u);

const RUN = { job: null };
function start(name, saved = null) {
  const map = controls(), target = new Map();
  for (const [k, inp] of map) target.set(k, inp.type === 'checkbox' ? false : +inp.defaultValue);   // everything back to default ...
  for (const [key, v] of Object.entries(saved || POSES[name] || {})) { const [k] = find(map, key); if (k) target.set(k, v); else console.warn('pose key not found', key); }   // ... then the pose
  // the squat slider drives both legs at once; the presets pose each leg instead, so park it at 0 without firing it
  const [, sq] = find(map, '腿部 · 双腿|蹲起深度'); if (sq) { sq.value = 0; const b = sq.parentElement.querySelector('b'); if (b) b.textContent = '0%'; target.delete('腿部 · 双腿|蹲起深度'); }
  const lerpKeys = [];
  for (const [k, v] of target) {
    const inp = map.get(k);
    if (inp.type === 'checkbox' || EASED.test(k + '|')) fire(inp, v);            // eased controls glide on their own
    else lerpKeys.push({ inp, from: +inp.value, to: v, weapon: k.startsWith('武器|') });
  }
  lerpKeys.sort((a, b) => a.weapon - b.weapon);                                   // weapons last: their ready pose overrides the arm sliders
  RUN.job = { t0: performance.now(), dur: 1800, keys: lerpKeys, name };
}
function step() {
  const j = RUN.job; if (!j) return;
  const u = Math.min(1, (performance.now() - j.t0) / j.dur), e = ease(u);
  for (const k of j.keys) fire(k.inp, k.from + (k.to - k.from) * e);
  if (u >= 1) RUN.job = null;
}
(function loop() { step(); requestAnimationFrame(loop); })();

// panel section (top of the panel, open)
function mount() {
  const panel = document.getElementById('panel');
  if (!panel || !window.__fin) return setTimeout(mount, 300);
  const d = document.createElement('details'); d.open = true; d.innerHTML = '<summary>姿态预设</summary>';
  const sec = document.createElement('div'); sec.className = 'sec'; d.appendChild(sec);
  const btns = document.createElement('div'); btns.className = 'btns';
  for (const name of [...Object.keys(POSES), '复位']) {
    const b = document.createElement('button'); b.textContent = name; b.onclick = () => start(name === '复位' ? '' : name); btns.appendChild(b);
  }
  sec.appendChild(btns);
  // 自定义：保存当前姿态 / 已保存列表（点名字调用，× 删除）
  const tools = document.createElement('div'); tools.className = 'btns';
  const mine = document.createElement('div'); mine.className = 'btns';
  const render = () => {
    mine.innerHTML = ''; const all = loadSaved();
    for (const name of Object.keys(all)) {
      const b = document.createElement('button'); b.textContent = name; b.onclick = () => start('', all[name]); mine.appendChild(b);
      const x = document.createElement('button'); x.textContent = '×'; x.title = '删除 ' + name; x.style.minWidth = '0';
      x.onclick = () => { if (confirm('删除姿态「' + name + '」？')) { const o = loadSaved(); delete o[name]; writeSaved(o); render(); } }; mine.appendChild(x);
    }
  };
  const save = document.createElement('button'); save.textContent = '保存当前姿态';
  save.onclick = () => { const name = (prompt('给这个姿态起个名字', '我的姿态 ' + (Object.keys(loadSaved()).length + 1)) || '').trim(); if (!name) return; const o = loadSaved(); o[name] = snapshot(); writeSaved(o); render(); };
  const exp = document.createElement('button'); exp.textContent = '导出';
  exp.onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(loadSaved(), null, 1)], { type: 'application/json' })); a.download = 'mech026_poses.json'; a.click(); };
  const imp = document.createElement('button'); imp.textContent = '导入';
  imp.onclick = () => { const f = document.createElement('input'); f.type = 'file'; f.accept = '.json'; f.onchange = async () => { try { const o = JSON.parse(await f.files[0].text()); writeSaved({ ...loadSaved(), ...o }); render(); } catch { alert('文件格式不对'); } }; f.click(); };
  tools.append(save, exp, imp); sec.append(tools, mine); render();
  const p = document.createElement('p'); p.className = 'note'; p.textContent = '全身约 2 秒过渡到预设姿态；用下面各分组摆好后可“保存当前姿态”，存在本机浏览器里，可导出 / 导入文件备份'; sec.appendChild(p);
  const first = panel.querySelector('details'); panel.insertBefore(d, first ? first.nextSibling : null);   // right after 视角 · 出图
  window.__poses = { start, step, POSES, controls, snapshot };
}
mount();
