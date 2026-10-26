// Modal graphics settings for the dome. Opening it freezes the simulation (the render loop keeps running but
// only paints a preview when a control changes). All display/quality knobs live here instead of the dock.
const CSS = `
#qualitySettings{position:fixed;inset:0;z-index:80;display:none;align-items:center;justify-content:center;padding:24px;
  background:rgba(4,7,10,.74);backdrop-filter:blur(7px);color:#d9e2e8;font:12px/1.45 "PingFang SC","Noto Sans SC",sans-serif}
#qualitySettings.open{display:flex}
#qualitySettings .qs-card{width:min(820px,calc(100vw - 32px));max-height:88vh;overflow:auto;background:rgba(11,15,19,.985);
  border:1px solid rgba(255,171,61,.38);box-shadow:0 26px 80px rgba(0,0,0,.6);scrollbar-width:thin}
#qualitySettings .qs-head{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:12px;
  padding:13px 18px;background:rgba(11,15,19,.99);border-bottom:1px solid rgba(255,171,61,.3)}
#qualitySettings .qs-head b{font-size:15px;letter-spacing:.08em;color:#f4f1ea}
#qualitySettings .qs-en{display:block;margin-top:3px;font:9px/1 "JetBrains Mono",Menlo,monospace;letter-spacing:.18em;color:#62778a}
#qualitySettings .qs-head .qs-badge{font:9px/1 "JetBrains Mono",Menlo,monospace;letter-spacing:.14em;color:#ffab3d;border:1px solid rgba(255,171,61,.45);padding:4px 7px;margin-left:auto}
#qualitySettings .qs-close{font:18px/1 "JetBrains Mono",Menlo,monospace;background:none;border:1px solid rgba(255,255,255,.18);color:#cfd8de;width:30px;height:30px;cursor:pointer}
#qualitySettings .qs-close:hover{border-color:#ffab3d;color:#fff}
#qualitySettings .qs-body{display:grid;grid-template-columns:1fr 1fr;gap:0 28px;padding:16px 18px 18px}
#qualitySettings .qs-sec{min-width:0;padding-bottom:10px}
#qualitySettings .qs-sec.qs-wide{grid-column:1/-1;border-top:1px solid rgba(255,255,255,.08);margin-top:6px;padding-top:12px}
#qualitySettings h4{margin:2px 0 8px;padding-bottom:6px;border-bottom:1px solid rgba(255,171,61,.22);font-size:11px;font-weight:600;letter-spacing:.12em;color:#c9d6de}
#qualitySettings h4 span{margin-left:6px;font:9px "JetBrains Mono",Menlo,monospace;letter-spacing:.16em;color:#62778a;font-weight:400}
#qualitySettings .qs-row{display:grid;grid-template-columns:92px 1fr 52px;align-items:center;gap:8px;margin:7px 0;color:#9aa6ae}
#qualitySettings .qs-row.chk{grid-template-columns:18px 1fr}
#qualitySettings .qs-row.sel{grid-template-columns:92px 1fr}
#qualitySettings .qs-row.sel select{grid-column:2/3}
#qualitySettings input[type=range]{width:100%;accent-color:#ffab3d}
#qualitySettings input[type=checkbox]{accent-color:#ffab3d}
#qualitySettings select{font:inherit;padding:4px 7px;background:#171c21;border:1px solid #3a4148;color:#e4e8ea;min-width:0}
#qualitySettings b{font-family:"JetBrains Mono",Menlo,monospace;font-weight:400;color:#eef3f6;text-align:right}
#qualitySettings .qs-note{color:#6f7b84;font-size:11px;margin:6px 0 8px;line-height:1.55}
#qualitySettings .qs-btns{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin:8px 0}
#qualitySettings .qs-btns button{font:inherit;padding:7px 9px;background:#161b20;border:1px solid #333b42;color:#d9dcdf;cursor:pointer}
#qualitySettings .qs-btns button:hover{border-color:#ffab3d;color:#fff}
#qualitySettings .qs-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:4px 0 2px}
#qualitySettings .qs-stat{padding:8px 9px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.07)}
#qualitySettings .qs-stat small{display:block;font:9px/1.2 "JetBrains Mono",Menlo,monospace;letter-spacing:.12em;color:#7d8f9a;margin-bottom:4px}
#qualitySettings .qs-stat b{display:block;text-align:left;font:500 15px/1 "JetBrains Mono",Menlo,monospace;color:#eef3f6}
#qualitySettings .qs-stat b em{font-size:10px;font-style:normal;color:#8ea3af;margin-left:2px}
@media (max-width:760px){#qualitySettings{padding:10px}#qualitySettings .qs-body{grid-template-columns:1fr}#qualitySettings .qs-stats{grid-template-columns:repeat(2,1fr)}}
`;
let styled = false;
function inject() {
  if (styled) return; styled = true;
  const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s);
}

export function createQualitySettings({ onPause, onPreview }) {
  inject();
  const root = document.createElement('div');
  root.id = 'qualitySettings';
  root.innerHTML = `<div class="qs-card" role="dialog" aria-modal="true" aria-label="画质设置">
    <header class="qs-head">
      <div><b>画质设置</b><span class="qs-en">GRAPHICS · QUALITY</span></div>
      <span class="qs-badge">游戏已暂停</span>
      <button class="qs-close" type="button" aria-label="关闭设置">×</button>
    </header>
    <div class="qs-body">
      <div class="qs-sec qs-render"><h4>渲染<span>RENDER</span></h4></div>
      <div class="qs-sec qs-post"><h4>后期<span>POST</span></h4></div>
      <div class="qs-sec qs-scene"><h4>场景<span>SCENE</span></h4></div>
      <div class="qs-sec qs-wide"><h4>状态<span>STATUS</span></h4>
        <div class="qs-stats">
          <div class="qs-stat"><small>帧率</small><b id="qsFps">—</b></div>
          <div class="qs-stat"><small>帧时间</small><b id="qsMs">—</b></div>
          <div class="qs-stat"><small>绘制</small><b id="qsCalls">—</b></div>
          <div class="qs-stat"><small>渲染比例</small><b id="qsScale">—</b></div>
        </div>
        <div class="qs-note" id="qsNote"></div>
        <div class="qs-btns"><button type="button" data-reset>恢复本档默认</button><button type="button" data-close>关闭 · 继续游戏</button></div>
      </div>
    </div>
  </div>`;
  document.body.appendChild(root);

  const sec = {
    render: root.querySelector('.qs-render'),
    post: root.querySelector('.qs-post'),
    scene: root.querySelector('.qs-scene'),
  };
  const note = root.querySelector('#qsNote');
  const setStats = stats => {
    const f = (id, v) => { const el = root.querySelector('#' + id); if (el) el.textContent = v; };
    f('qsFps', stats.fps != null ? stats.fps.toFixed(1) + ' FPS' : '—');
    f('qsMs', stats.frameMs != null ? stats.frameMs.toFixed(1) + ' ms' : '—');
    f('qsCalls', stats.calls != null ? String(stats.calls) : '—');
    f('qsScale', stats.scale != null ? Math.round(stats.scale * 100) + '%' : '—');
  };
  const preview = () => { onPreview?.(); };
  const row = (parent, label) => {
    const r = document.createElement('label'); r.className = 'qs-row';
    const s = document.createElement('span'); s.textContent = label; r.appendChild(s);
    parent.appendChild(r); return r;
  };
  const api = {
    sec, setStats,
    note(text) { note.textContent = text; },
    slider(parent, label, min, max, step, value, fmt, on) {
      const r = row(parent, label);
      const i = document.createElement('input'); i.type = 'range'; i.min = min; i.max = max; i.step = step; i.value = value;
      const o = document.createElement('b'); r.append(i, o);
      const f = () => { o.textContent = fmt ? fmt(+i.value) : (+i.value).toFixed(2); on(+i.value); preview(); };
      i.oninput = f; o.textContent = fmt ? fmt(+value) : (+value).toFixed(2);
      return i;
    },
    select(parent, label, entries, value, on) {
      const r = row(parent, label); r.classList.add('sel');
      const s = document.createElement('select');
      for (const [v, t] of entries) { const op = document.createElement('option'); op.value = v; op.textContent = t; s.appendChild(op); }
      s.value = value; s.onchange = () => { on(s.value); preview(); }; r.appendChild(s);
      return s;
    },
    check(parent, label, checked, on) {
      const r = document.createElement('label'); r.className = 'qs-row chk';
      const c = document.createElement('input'); c.type = 'checkbox'; c.checked = !!checked;
      const s = document.createElement('span'); s.textContent = label;
      c.onchange = () => { on(c.checked); preview(); };
      r.append(c, s); parent.appendChild(r); return c;
    },
    button(parent, label, fn) {
      const r = document.createElement('div'); r.className = 'qs-btns';
      const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.onclick = fn;
      r.appendChild(b); parent.appendChild(r); return b;
    },
    noteLine(parent, text) { const d = document.createElement('div'); d.className = 'qs-note'; d.textContent = text; parent.appendChild(d); return d; },
  };

  let open = false;
  const close = () => {
    if (!open) return;
    open = false; root.classList.remove('open'); document.body.classList.remove('qs-open');
    onPause?.(false);
  };
  const show = () => {
    if (open) return;
    open = true; root.classList.add('open'); document.body.classList.add('qs-open');
    onPause?.(true);
  };
  root.querySelector('.qs-close').onclick = close;
  root.querySelector('[data-close]').onclick = close;
  root.querySelector('[data-reset]').onclick = () => { api.onReset?.(); preview(); };
  root.addEventListener('pointerdown', e => { if (e.target === root) close(); });
  addEventListener('keydown', e => {
    if (!open) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
  }, true);
  api.open = show; api.close = close;
  Object.defineProperty(api, 'isOpen', { get: () => open });
  return api;
}
