// Info card (left) + machine / view / sound controls placed into the shared dock (ui/dock.js) by category.
// Same layout on every scene page; the page passes its dock sections. Title is the machine's number only.
import { VIEW_LIST } from './views.js';

const css = `
.hud{position:fixed;z-index:15;color:#d9e2e8;font:12px/1.35 "PingFang SC","Noto Sans SC",sans-serif}
.hud .en{font:9px/1 "JetBrains Mono",Menlo,monospace;letter-spacing:.16em;color:#62778a;margin-left:6px}
#hudL{left:12px;top:var(--hudTop,58px);width:290px;max-height:calc(100vh - var(--hudTop,58px) - var(--hudBottom,12px));overflow:auto;scrollbar-width:thin;
  background:rgba(10,13,16,.84);border:1px solid rgba(255,255,255,.09);backdrop-filter:blur(10px)}
#hudL .hd{position:sticky;top:0;display:flex;align-items:center;justify-content:space-between;padding:9px 12px;background:rgba(10,13,16,.96);border-bottom:1px solid rgba(255,171,61,.3);cursor:pointer;user-select:none;font:10px/1 "JetBrains Mono",Menlo,monospace;letter-spacing:.18em;color:#9fb0bb}
#hudL .hd b{color:#ffab3d;font-weight:400}
#hudL .bd{padding:10px 14px 12px}
#hudL.fold .bd{display:none}
#hudL .tag{font:10px/1.3 "JetBrains Mono",Menlo,monospace;letter-spacing:.12em;color:#8ea3af}
#hudL .tag i{display:inline-block;width:6px;height:6px;border-radius:50%;background:#e2483a;margin-right:8px;box-shadow:0 0 8px #e2483a}
#hudL h1{font-size:30px;font-weight:800;letter-spacing:.06em;margin:6px 0 2px;color:#f4f1ea}
#hudL .sub{font:9px/1.3 "JetBrains Mono",Menlo,monospace;letter-spacing:.2em;color:#ffab3d}
#hudL .stats{display:grid;grid-template-columns:repeat(4,auto);gap:10px;margin:12px 0 10px}
#hudL .stats div{display:flex;flex-direction:column;gap:3px}
#hudL .stats small{font:9px/1.2 "JetBrains Mono",Menlo,monospace;letter-spacing:.08em;color:#7d8f9a}
#hudL .stats b{font:500 15px/1 "JetBrains Mono",Menlo,monospace;color:#eef3f6}
#hudL .stats b em{font-size:10px;font-style:normal;color:#8ea3af;margin-left:2px}
#hudL h5{font-size:11px;font-weight:600;letter-spacing:.1em;color:#c9d6de;margin:12px 0 4px;padding-bottom:5px;border-bottom:1px solid rgba(255,171,61,.22)}
#hudL .ro{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:baseline;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.05)}
#hudL .ro span{color:#9fb0bb}#hudL .ro b{font:500 13px "JetBrains Mono",Menlo,monospace;color:#eef3f6}
#hudL .bar{height:2px;background:rgba(255,255,255,.08);margin:6px 0 2px}#hudL .bar i{display:block;height:100%;width:35%;background:#ffab3d;box-shadow:0 0 8px #ffab3d}
#hudL .layer{display:grid;grid-template-columns:24px 1fr 34px 12px;align-items:center;gap:6px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.05);cursor:pointer}
#hudL .layer .n{font:10px "JetBrains Mono",Menlo,monospace;color:#ffab3d}
#hudL .layer .c{font:10px "JetBrains Mono",Menlo,monospace;color:#7d8f9a;text-align:right}
#hudL .layer .sq{width:9px;height:9px;background:#ffab3d}
#hudL .layer.off{opacity:.38}#hudL .layer.off .sq{background:none;border:1px solid #ffab3d}
body.nohud .hud{display:none}
@media (max-width:820px){#hudL{width:220px;max-height:calc(56vh - var(--hudTop,58px) - 24px)}#hudL h1{font-size:22px}}
`;

// sections: { views, machine, sound, light } dock section bodies; dock: createDock() helpers
export function setupHud({ camera, machine, views, show, mech, focus, dock, sections, tag = 'PPDC · 机库 04 · 03 号维护位', sub = 'JAEGER 026 · HARDENED HANGAR 04', top = 58, bottom = 12, quality = true, title = '机甲 026', metersPerUnit = 2.05, viewList = VIEW_LIST, extraViews = true, programs = null, fps = null, layers = true }) {
  const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
  const parts = (() => { let n = 0; mech.group.traverse(o => { if (o.isMesh) n++; }); return n; })();
  let pilots = 0; mech.group.traverse(o => { if (/^rig/.test(o.name) && o.parent?.name === 'cockpit') pilots++; });
  const pilotCount = mech.pilotCount ?? (pilots || 2);
  const L = document.createElement('div'); L.id = 'hudL'; L.className = 'hud';
  L.style.setProperty('--hudTop', top + 'px'); L.style.setProperty('--hudBottom', bottom + 'px');
  L.innerHTML = `<div class="hd">机体信息 · INFO<b>▾</b></div><div class="bd">
    <div class="tag"><i></i>${tag}</div><h1>${title}</h1><div class="sub">${sub}</div>
    <div class="stats">
      <div><small>身高</small><b>${(mech.height * 2.05).toFixed(1)}<em>m</em></b></div>
      <div><small>重量</small><b>1,940<em>t</em></b></div>
      <div><small>驾驶员</small><b>${String(pilotCount).padStart(2, '0')}</b></div>
      <div><small>部件</small><b>${parts}</b></div>
    </div>
    <h5>实时读数<span class="en">TELEMETRY</span></h5>
    <div class="ro"><span>镜头高度</span><b id="hEye">—</b></div>
    ${fps ? '<div class="ro"><span>帧率</span><b id="hFps">—</b></div>' : ''}
    <div class="ro"><span>目标距离</span><b id="hRange">—</b></div>
    <div class="ro"><span>反应堆输出</span><b id="hPow">—</b></div>
    <div class="bar"><i id="hBar"></i></div>
    <div class="ro"><span>结构状态</span><b id="hState">—</b></div>
    ${layers ? `<h5>结构层级<span class="en">LAYERS · 点击隐藏</span></h5>
    ${machine.LAYERS.map((ly, i) => `<div class="layer" data-i="${i}"><span class="n">L${i}</span><span>${ly.cn}</span><span class="c">${ly.count}</span><span class="sq"></span></div>`).join('')}` : ''}
  </div>`;
  document.body.appendChild(L);
  { const hd = L.querySelector('.hd'), mark = hd.querySelector('b'), key = 'hud.fold.info';
    const set = f => { L.classList.toggle('fold', f); mark.textContent = f ? '▸' : '▾'; try { localStorage.setItem(key, f ? '1' : '0'); } catch (e) {} };
    let f0 = false; try { f0 = localStorage.getItem(key) === '1'; } catch (e) {} set(f0); hd.onclick = () => set(!L.classList.contains('fold')); }
  L.querySelectorAll('.layer').forEach(d => d.onclick = () => { machine.toggleLayer(+d.dataset.i); d.classList.toggle('off', !machine.st.layers[+d.dataset.i]); });

  // ---- dock: views ----
  const tourActions = { explode: () => machine.explode(1), assemble: () => machine.explode(0), thunder: () => machine.toggleThunder(), calm: () => { if (machine.st.thunder) machine.toggleThunder(); } };
  const view = k => { views.stopTour(); if (k === '@ride') views.ride(); else if (k === '@tour') views.startTour(tourActions); else views.go(k); };
  const vb = {};
  if (sections.views) {
    dock.sub(sections.views, '机甲特写 · CLOSE-UPS');
    dock.buttons(sections.views, viewList.map(([k, cn], i) => [cn, () => view(k), String(i + 1)])).forEach((b, i) => vb[viewList[i][0]] = b);
    if (extraViews) { const [r, t] = dock.buttons(sections.views, [['登机跟拍', () => view('@ride'), 'B'], ['电影巡游', () => view('@tour'), '9']]);
    vb['@ride'] = r; vb['@tour'] = t; }
  }
  // ---- dock: machine programs + assemble / disassemble ----
  const pb = {};
  const prog = { xray: () => machine.toggleXray(), sync: () => machine.startSync(), thunder: () => machine.toggleThunder(), canopy: () => machine.canopy(), thr: () => machine.toggleThrusters() };
  const PROGRAMS = { xray: ['X 光扫描', 'X'], sync: ['神经同步', 'N'], thunder: ['雷云阵型', 'T'], canopy: ['驾驶舱盖', 'O'], thr: ['背部推进器', 'P'] };
  const progKeys = (programs || Object.keys(PROGRAMS)).filter(k => PROGRAMS[k] && prog[k]);
  if (sections.machine) {
    dock.sub(sections.machine, '功能 · PROGRAMS');
    const list = progKeys.map(k => [k, ...PROGRAMS[k]]);
    dock.buttons(sections.machine, list.map(([k, cn, key]) => [cn, prog[k], key])).forEach((b, i) => pb[list[i][0]] = b);
    dock.sub(sections.machine, '拆解 · 重组 · DISASSEMBLY');
    pb.slider = dock.slider(sections.machine, '分离程度', 0, 1, 0.01, 0, v => String(Math.round(v * 100)).padStart(3, '0') + '%', v => machine.explode(v));
    dock.buttons(sections.machine, [['◀ 重组', () => machine.explode(0)], ['拆解 ▶', () => machine.explode(1)]]);
  }
  // ---- dock: sound + display ----
  if (sections.sound) {
    const [sb] = dock.buttons(sections.sound, [['声音 关', () => { const on = machine.soundToggle(); sb.querySelector('span').textContent = on ? '声音 开' : '声音 关'; sb.classList.toggle('on', on); }]], 1);
    dock.check(sections.sound, '隐藏信息卡（H）', on => document.body.classList.toggle('nohud', on));
  }
  // ---- dock: quality (into the light section) ----
  let qb = [];
  const syncQ = () => { if (qb.length) { qb[0].classList.toggle('on', show.quality === 'std'); qb[1].classList.toggle('on', show.quality === 'cinema'); } };
  if (quality && sections.light) { dock.sub(sections.light, '画质 · QUALITY'); qb = dock.buttons(sections.light, [['标准画质', () => { show.setQuality('std'); syncQ(); }], ['电影画质', () => { show.setQuality('cinema'); syncQ(); }]]); }
  syncQ();

  addEventListener('keydown', ev => {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName)) return;
    const k = ev.key.toLowerCase();
    const active = new Set(progKeys);
    if (k === 'x' && active.has('xray')) prog.xray(); else if (k === 'n' && active.has('sync')) prog.sync();
    else if (k === 't' && active.has('thunder')) prog.thunder(); else if (k === 'o' && active.has('canopy')) prog.canopy();
    else if (k === 'p' && active.has('thr')) prog.thr();
    else if (k === 'b' && extraViews) view('@ride'); else if (k === '9' && extraViews) view('@tour'); else if (k === 'h') document.body.classList.toggle('nohud');
    else if (/^[1-8]$/.test(k) && viewList[+k - 1]) view(viewList[+k - 1][0]);
  });

  const $ = id => document.getElementById(id);
  return {
    update() {
      const f = focus();
      $('hEye').textContent = (camera.position.y * metersPerUnit).toFixed(1) + ' M';
      if (fps) { const f = fps(); const b = $('hFps'); if (f) { b.textContent = `${f.fps.toFixed(1)} FPS · ${f.frameMs.toFixed(1)} ms`; b.style.color = f.fps < 28 ? '#e2483a' : f.fps < 30 ? '#ffab3d' : '#eef3f6'; } }
      $('hRange').textContent = (camera.position.distanceTo(f) * metersPerUnit).toFixed(1) + ' M';
      $('hPow').textContent = Math.round(machine.st.power * 100) + ' %';
      $('hState').textContent = machine.state();
      $('hBar').style.width = Math.round(machine.st.power * 100) + '%';
      if (pb.slider && document.activeElement !== pb.slider) { pb.slider.value = machine.st.e; pb.slider.nextElementSibling.textContent = String(Math.round(machine.st.e * 100)).padStart(3, '0') + '%'; }
      const on = { xray: machine.st.xrayOn, sync: machine.st.sync >= 0, thunder: machine.st.thunder, canopy: (machine.st.canopyTarget || 0) > 0.5, thr: machine.st.thr };
      for (const k in on) pb[k]?.classList.toggle('on', !!on[k]);
      for (const k in vb) vb[k].classList.toggle('on', k === views.state.active || (k === '@tour' && !!views.state.tour));
    },
  };
}
