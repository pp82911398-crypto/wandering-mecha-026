// Scene switch for the finishing room.
// 成品间 stays this page. The DeepSeek scene page is the completed port/hangar scene rebuilt as a storm
// (portstorm/), not the old black deck scene.
function mount() {
  const F = window.__fin, panel = document.getElementById('panel');
  if (!F || !panel) return setTimeout(mount, 300);
  const ANGLE = { front: '正面', side: '侧面', back: '背面', low: '低角度', top: '俯视', hero: '三分之四' };
  const p = document.createElement('div'); p.className = 'sec scene-row';
  p.title = '成品间 / DeepSeek 场景搭建页面';
  const lab = document.createElement('div'); lab.className = 'scene-label'; lab.textContent = '场景';
  const btns = document.createElement('div'); btns.className = 'btns';
  const studio = document.createElement('button'); studio.textContent = '成品间'; studio.className = 'on';
  const storm = document.createElement('button'); storm.textContent = 'DeepSeek 场景搭建页面';
  storm.onclick = () => { location.href = '../portstorm/?q=low'; };
  // scene switching now lives in the shared top nav (../scenenav.js), not in this control panel

  // studio camera / exposure, kept at the bottom of the panel
  const v = document.createElement('div'); v.className = 'sec view-row';
  const vl = document.createElement('div'); vl.className = 'scene-label'; vl.textContent = '镜头';
  const as = document.createElement('select'); as.id = 'angleSel';
  for (const [k, t] of Object.entries(ANGLE)) { const o = document.createElement('option'); o.value = k; o.textContent = t; as.appendChild(o); }
  as.value = 'front'; as.onchange = () => F.view(as.value);
  const es = document.createElement('select'); es.id = 'expSel';
  for (const [val, t] of [[0.75, '暗 0.75'], [1.0, '标准 1.0'], [1.25, '亮 1.25']]) { const o = document.createElement('option'); o.value = String(val); o.textContent = t; es.appendChild(o); }
  es.value = '1';
  es.onchange = () => {
    const val = parseFloat(es.value);
    F.renderer.toneMappingExposure = val;
    const sl = document.getElementById('exp'); if (sl) sl.value = String(val);
  };
  v.append(vl, as, es); panel.appendChild(v);

  const css = document.createElement('style');
  css.textContent = '.scene-row{display:flex;align-items:center;gap:10px;padding-top:10px;margin-top:6px;border-top:1px solid rgba(255,255,255,.08)}.scene-row .btns{flex:1;margin:0}.view-row{display:flex;align-items:center;gap:8px;margin-top:6px}.view-row select{flex:1;min-width:0;background:#171c20;color:#cfd8df;border:1px solid #39454e;border-radius:4px;padding:4px 6px;font:12px/1.4 inherit}.scene-label{font-size:12px;color:#aeb8c0;white-space:nowrap}';
  document.head.appendChild(css);

  window.__scenes = { mode: 'studio', studio, storm, angle: as, exposure: es };
}
mount();