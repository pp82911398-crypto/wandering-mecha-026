// Lighting control panel for the port storm: exposure, industrial high-bay level, warm/cool
// balance, control-room and port/ship light groups, plus three presets.
import * as THREE from 'three';

let started = false;
function wait() {
  if (!window.__lab || !window.__storm || !window.__interior) return setTimeout(wait, 300);
  if (started) return;
  started = true;
  build();
}
wait();

function build() {
  const lab = window.__lab, storm = window.__storm, it = window.__interior;
  const renderer = lab.renderer;
  const backdrop = document.getElementById('stormExpWrap');
  if (backdrop) backdrop.style.display = 'none';   // merged into the lighting panel

  const css = document.createElement('style');
  css.textContent = `
  #lightPanel{right:26px;bottom:236px;width:268px;background:rgba(12,18,22,.82);border:1px solid rgba(190,210,225,.2);backdrop-filter:blur(12px);padding:12px 14px;font:11px/1.5 var(--mono);color:#b9c9d4;z-index:20}
  #lightPanel h4{font:600 12px/1.2 var(--cn);letter-spacing:.14em;color:#eef4f8;margin-bottom:10px;display:flex;justify-content:space-between}
  #lightPanel h4 span{color:#6f8fa3;font-weight:400}
  #lightPanel .lr{display:flex;align-items:center;gap:8px;margin:7px 0}
  #lightPanel .lr label{flex:0 0 64px;color:#9fb3bf}
  #lightPanel .lr input[type=range]{flex:1;min-width:0;accent-color:#d86a2a}
  #lightPanel .lr b{min-width:36px;text-align:right;color:#e9eef2;font-weight:500}
  #lightPanel .chk{display:flex;align-items:center;gap:8px;margin:6px 0;color:#c3d2da;cursor:pointer}
  #lightPanel .chk input{accent-color:#d86a2a}
  #lightPanel .presets{display:flex;gap:6px;margin-top:10px}
  #lightPanel .presets button{flex:1;font:inherit;padding:6px 0;color:#d6e1e8;background:rgba(255,255,255,.04);border:1px solid rgba(190,210,225,.18);cursor:pointer}
  #lightPanel .presets button:hover{border-color:#d86a2a;color:#fff}
  #lightPanel .presets button.on{background:#d86a2a;border-color:#d86a2a;color:#151719;font-weight:700}
  `;
  document.head.appendChild(css);

  const p = document.createElement('div'); p.id = 'lightPanel';
  p.innerHTML = `
    <h4>灯光 <span>LIGHT RIG</span></h4>
    <div class="lr"><label>曝光</label><input id="lpExp" type="range" min="0.55" max="1.85" step="0.01" value="1.0"><b id="lpExpV">1.00</b></div>
    <div class="lr"><label>工业灯</label><input id="lpInd" type="range" min="0" max="2" step="0.01" value="1"><b id="lpIndV">1.00</b></div>
    <div class="lr"><label>色温</label><input id="lpWarm" type="range" min="-1" max="1" step="0.01" value="0"><b id="lpWarmV">0</b></div>
    <label class="chk"><input id="lpCr" type="checkbox" checked> 控制室灯</label>
    <label class="chk"><input id="lpPort" type="checkbox" checked> 港口 / 舰船灯</label>
    <div class="presets"><button data-preset="bright">明亮</button><button data-preset="standard" class="on">标准</button><button data-preset="cinema">电影</button></div>
  `;
  document.body.appendChild(p);

  const $ = id => document.getElementById(id);
  const exp = $('lpExp'), expV = $('lpExpV'), ind = $('lpInd'), indV = $('lpIndV');
  const warm = $('lpWarm'), warmV = $('lpWarmV'), cr = $('lpCr'), port = $('lpPort');
  const state = { exp: 1.0, ind: 1, warm: 0, cr: true, port: true };

  // colour balance: interpolate each fixture's spot between cool and warm
  const warmC = new THREE.Color(0xffc98c), coolC = new THREE.Color(0xbfe0ff);
  function applyWarm(v) {
    for (const f of it.fixtures) {
      const sp = f.userData.spot; if (!sp) continue;
      const k = (v + 1) / 2;
      sp.color.copy(coolC).lerp(warmC, k);
    }
  }
  function apply() {
    renderer.toneMappingExposure = state.exp;
    exp.value = String(state.exp); expV.textContent = state.exp.toFixed(2);
    it.setIndustrial(state.ind);
    ind.value = String(state.ind); indV.textContent = state.ind.toFixed(2);
    applyWarm(state.warm);
    warm.value = String(state.warm); warmV.textContent = state.warm.toFixed(1);
    it.setControl(state.cr);
    if (it.fill) it.fill.intensity = 0.25 * (0.55 + state.ind * 0.45);
    if (storm.lights) storm.lights.visible = state.port;
    cr.checked = state.cr; port.checked = state.port;
    // sync the old top-left exposure slider if it exists
    const se = document.getElementById('stormExp'), sv = document.getElementById('stormExpVal');
    if (se) { se.value = String(state.exp); if (sv) sv.textContent = state.exp.toFixed(2); }
    document.querySelectorAll('#lightPanel .presets button').forEach(b => b.classList.toggle('on', b.dataset.preset === lastPreset));
  }
  let lastPreset = 'standard';
  exp.oninput = () => { state.exp = +exp.value; lastPreset = ''; apply(); };
  ind.oninput = () => { state.ind = +ind.value; lastPreset = ''; apply(); };
  warm.oninput = () => { state.warm = +warm.value; lastPreset = ''; apply(); };
  cr.onchange = () => { state.cr = cr.checked; lastPreset = ''; apply(); };
  port.onchange = () => { state.port = port.checked; lastPreset = ''; apply(); };
  const presets = {
    bright: { exp: 1.3, ind: 1.6, warm: 0.1, cr: true, port: true },
    standard: { exp: 1.0, ind: 1.0, warm: 0, cr: true, port: true },
    cinema: { exp: 0.85, ind: 0.7, warm: -0.25, cr: true, port: true },
  };
  document.querySelectorAll('#lightPanel .presets button').forEach(b => b.onclick = () => {
    lastPreset = b.dataset.preset; Object.assign(state, presets[lastPreset]); apply();
  });
  apply();

  // the initial interior already has its own exposure; force the panel value.
  window.__lightPanel = { state, apply };
}
