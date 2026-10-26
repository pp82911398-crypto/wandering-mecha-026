// Opt-in browser verification: ?verify=materials. No work runs on normal visits.
import * as THREE from 'three';
const panel = document.createElement('pre'); panel.id = 'surfaceVerification';
panel.style.cssText = 'position:fixed;bottom:8px;left:8px;z-index:80;max-width:55vw;max-height:35vh;overflow:auto;background:#10151eee;color:#ced9df;font:10px monospace;padding:8px';
document.body.append(panel);
const next = () => new Promise(resolve => requestAnimationFrame(resolve));
while (!window.__dome || !document.querySelector('#loader.hide')) await next();
const { renderer, scene, camera } = window.__lab, dome = window.__dome;
const report = { viewport: [innerWidth, innerHeight], mode: dome.renderQuality.mode, views: {} };
const save = () => { panel.textContent = JSON.stringify(report); panel.dataset.result = JSON.stringify(report); };
const resources = () => {
  let meshes = 0, lights = 0; const materials = new Set();
  scene.traverse(o => { if (o.isLight) lights++; if (o.isMesh) { meshes++; for (const m of [].concat(o.material)) materials.add(m); } });
  return { meshes, lights, materials: materials.size, programs: renderer.info.programs.length,
    passes: dome.post.composer.passes.length };
};
const luma = () => {
  const cv = document.createElement('canvas'); cv.width = 160; cv.height = 100;
  const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(renderer.domElement, 0, 0, 160, 100);
  const px = cx.getImageData(0, 0, 160, 100).data; let sum = 0, clipped = 0;
  for (let i = 0; i < px.length; i += 4) { const l = .2126 * px[i] + .7152 * px[i + 1] + .0722 * px[i + 2]; sum += l; if (l > 235) clipped++; }
  return { mean: sum / 16000, clipped };
};
const gpu = (n = 30) => {
  const gl = renderer.getContext(); renderer.setRenderTarget(null); renderer.render(scene, camera); gl.finish();
  const start = performance.now(); for (let i = 0; i < n; i++) renderer.render(scene, camera);
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  return (performance.now() - start) / n;
};
// Measure the running scene first, then freeze animation so A/B is the same instant.
const frames = []; let prev;
for (let i = 0; i < 181; i++) { const now = await new Promise(resolve => requestAnimationFrame(resolve)); if (prev) frames.push(now - prev); prev = now; }
frames.sort((a, b) => a - b); report.raf = { median: frames[90], p95: frames[171] };
renderer.setAnimationLoop(null); dome.VW.state.tween = null;
const placements = {
  full: { p: [0, 40, 82], t: [0, 39, 0], f: 60 },
  steel: { p: [8, 4.6, dome.env.lift.TZ + 10], t: [1, 2.6, dome.env.lift.TZ], f: 48 },
  floor: { p: [65, 2.8, 40], t: [68, 0, 30], f: 55 },
  roof: { p: [25, dome.env.HW - 46, dome.env.CZ + 38], t: [0, dome.env.HW + 18, dome.env.CZ], f: 78 },
};
for (const [name, v] of Object.entries(placements)) {
  camera.up.set(0, 1, 0); camera.position.fromArray(v.p); camera.fov = v.f; camera.updateProjectionMatrix(); camera.lookAt(...v.t);
  dome.env.roof.uplights.forEach(l => l.visible = name === 'roof');
  renderer.shadowMap.needsUpdate = true; renderer.render(scene, camera); renderer.shadowMap.needsUpdate = false;
  const samples = {};
  for (const enabled of dome.surface ? [false, true, false, true] : [false, false]) {
    dome.surface?.set(enabled);
    dome.wet.render(renderer, scene, camera);
    renderer.setRenderTarget(null); renderer.render(scene, camera); const raw = luma();
    dome.post.render(1); const composed = luma();
    const ms = gpu(); const key = enabled ? 'on' : 'off';
    if (!samples[key] || ms < samples[key].gpuMs) samples[key] = { gpuMs: ms, raw, composed, resources: resources() };
    await next();
  }
  report.views[name] = samples; save();
}
dome.surface?.set(true);
report.complete = true; report.surface = dome.surface?.stats;
report.model = dome.mech.model?.signature;
let soleY = Infinity; const soleVertex = new THREE.Vector3(); scene.updateMatrixWorld(true);
dome.mech.group.traverse(o => {
  if (!o.isMesh || !/^leg[RL]\.(foot|toes)/.test(o.userData.part || '')) return;
  const positions = o.geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) { soleVertex.fromBufferAttribute(positions, i).applyMatrix4(o.matrixWorld); soleY = Math.min(soleY, soleVertex.y); }
});
report.ground = { actualSoleY: soleY, pass: Math.abs(soleY) < 1e-5 };
save();
