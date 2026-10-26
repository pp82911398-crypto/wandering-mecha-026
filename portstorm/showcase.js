// Close-up views, machine programs and the info HUD from the hangar page, on the port scene.
// Sound: the old dome bay's procedural sound (rain bed) fits outdoors, so the default Sound is used here.
// The port keeps its own post chain, storm and camera system: a close-up hands the camera over to free mode
// with orbit controls paused while it moves, then gives it back.
import * as THREE from 'three';
import { setupViews } from '../hangar/views.js';
import { setupMachine } from '../hangar/machine.js';
import { setupHud } from '../hangar/hud.js';
import { setOpen } from '../headlab/head.js';
import { createDock } from '../ui/dock.js';
import { createRain } from '../src/fx.js';
import { G } from '../src/materials.js';

const V3 = THREE.Vector3;
(function wait() { if (window.__lab && window.__storm) start(); else setTimeout(wait, 300); })();

function start() {
  const lab = window.__lab, { camera, controls, mech, hangar, state } = lab;
  const headG = mech.mech.children[0].children[0];
  const focus = () => new THREE.Box3().setFromObject(mech.torso).getCenter(new V3());
  let footC = null;
  const anchors = () => {
    const c = hangar.crawler.position, box = new THREE.Box3();
    const head = box.setFromObject(headG).getCenter(new V3());
    const reactor = box.setFromObject(mech.reactor).getCenter(new V3());
    const clawO = mech.arms.arms.leftRear.root.getObjectByName('LR.spin'), claw = clawO ? clawO.getWorldPosition(new V3()) : focus();
    const fb = new THREE.Box3(); mech.group.traverse(o => { if (o.isMesh && o.userData.part === 'legR.foot') fb.expandByObject(o); });
    footC = fb.isEmpty() ? new V3(c.x + 3, 1, c.z + 2) : fb.getCenter(new V3());
    return { base: new V3(c.x, c.y, c.z), head, reactor, claw, foot: footC, height: mech.height + hangar.deckTop };
  };
  // the boarding ride only makes sense while the crawler is parked in the hall with the bridge out
  const liftProxy = new Proxy(hangar.lift, { get: (t, k) => t[k] });
  const VW = setupViews({ camera, anchors, lift: liftProxy });
  const go = VW.go, ride = VW.ride;
  let owned = false;
  const takeCamera = () => { lab.setCam('free'); controls.enabled = false; owned = true; };
  VW.go = (n, d) => { takeCamera(); go(n, d); };
  VW.ride = () => { takeCamera(); if (state.t < 0.02) { state.playing = false; ride(); } else go('head'); };
  const MC = setupMachine(mech, { scene: lab.scene, renderer: lab.renderer, show: { lightning: () => window.__storm.strike?.() }, park: () => {}, canopy: v => setOpen(headG, v) });
  // ---- unified dock: same categories as the other scene pages; the port's own controls move in ----
  const bar = document.getElementById('playbar'), barH = bar ? bar.getBoundingClientRect().height + 36 : 12;
  const D = createDock({ top: 58, bottom: barH });
  const sec = { views: D.section('视角', 'VIEWS', true), machine: D.section('机甲功能', 'MACHINE', true), scene: D.section('场景设备', 'SCENE'),
    light: D.section('灯光画质', 'LIGHT'), sound: D.section('声音显示', 'SOUND') };
  // port camera presets first (follow, hangar, quay, sea...), then the machine close-ups added by the HUD
  const cams = document.getElementById('cams');
  if (cams) {
    D.sub(sec.views, '场景机位 · SCENE CAMS'); const g = document.createElement('div'); g.className = 'btns'; cams.querySelectorAll('button').forEach(b => g.appendChild(b)); cams.remove();
    g.id = 'cams'; sec.views.appendChild(g);   // keep the id: main.js highlights the active cam via '#cams button'
    const st = document.createElement('style');
    st.textContent = '#panel #cams{position:static!important;inset:auto!important;width:auto!important;display:grid!important;grid-template-columns:1fr 1fr!important;gap:6px!important;padding:0!important;margin:6px 0!important;background:none!important;border:none!important;backdrop-filter:none!important}#panel #cams button{font:inherit!important;padding:6px 8px!important;background:#161b20!important;border:1px solid #333b42!important;color:#d9dcdf!important;text-align:left!important;height:auto!important;letter-spacing:0!important}#panel #cams button.on{border-color:#ffab3d!important;color:#ffab3d!important;background:rgba(255,171,61,.08)!important;font-weight:400!important}';
    document.head.appendChild(st);
  }
  const weather = document.getElementById('stormInfo')?.textContent?.trim();
  const HUD = setupHud({ camera, machine: MC, views: VW, show: { quality: 'std', setQuality() {} }, mech, focus, dock: D, sections: sec,
    tag: 'PPDC · 港区 04 · 出库码头' + (weather ? ' · ' + weather : ''), sub: 'JAEGER 026 · PORT 04 ROLL-OUT', top: 58, bottom: barH, quality: false });
  // scene: roll-out is the bottom timeline; here the follow toggle and a note
  D.buttons(sec.scene, [['出库 / 暂停', () => document.getElementById('playBtn')?.click()], ['跟随平台', () => document.querySelector('[data-cam=follow]')?.click()]]);
  const note = document.createElement('div'); note.className = 'note'; note.textContent = '底部进度条：灯 → 开门 → 出库 → 停靠。出库开始前登机桥和工作平台自动收回。'; sec.scene.appendChild(note);
  // light: the port's exposure slider
  const exp = document.getElementById('stormExpWrap');
  if (exp) { const inp = exp.querySelector('input'), val = exp.querySelector('span'); const r = document.createElement('label'); r.className = 'row'; const t = document.createElement('span'); t.textContent = '曝光'; r.append(t, inp, val); sec.light.appendChild(r); exp.remove(); }
  // the page title / info tags / hints are now in the info card
  for (const id of ['stormInfo', 'hint', 'scale']) { const e = document.getElementById(id); if (e) e.style.display = 'none'; }
  const hdr = document.querySelector('header'); if (hdr) hdr.style.display = 'none';
  // rain from the old dome bay: GPU streaks around the camera, lit where they cross the brightest quay spotlights
  const spots = []; lab.scene.updateMatrixWorld(true);
  lab.scene.traverse(o => {
    if (!o.isSpotLight || o.intensity <= 0) return;
    const p = o.getWorldPosition(new V3()), t = o.target.getWorldPosition(new V3());   // world space: some lamps hang on the crawler / towers
    if (p.z > lab.L.gate.z) spots.push({ position: p, target: { position: t }, angle: o.angle, intensity: o.intensity });
  });
  spots.sort((a, b) => b.intensity - a.intensity);
  const rain = createRain(lab.scene, spots.slice(0, 4).length ? spots.slice(0, 4) : [{ position: new V3(0, 60, 0), target: { position: new V3(0, 0, 0) }, angle: 0.5 }]);
  rain.mat.uniforms.uLamp.value.set(0, -1e4, 0);              // no head-lamp cone here
  if (window.__storm.rain) window.__storm.rain.visible = false;   // retire the port's flat line rain
  let rainOn = true;
  D.check(sec.light, '穹顶雨丝（被灯照亮）', on => { rainOn = on; if (window.__storm.rain) window.__storm.rain.visible = !on; }, true);
  let last = performance.now();
  (function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now;
    const busy = VW.state.tween || VW.state.ride || VW.state.tour;
    VW.update(dt);
    if (owned && !busy) { controls.target.copy(VW.state.target); controls.enabled = true; owned = false; window.__freecam?.sync?.(); }   // hand the camera back
    G.uTime.value = now * 0.001;
    rain.lines.visible = rainOn && camera.position.z > lab.L.gate.z;   // no rain inside the hangar
    MC.update(now * 0.001, dt); HUD.update();
  })(performance.now());
  window.__showcase = { VW, MC, HUD, anchors };
}
