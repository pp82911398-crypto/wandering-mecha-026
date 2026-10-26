// Explicitly opt-in smoke test for shared-model mechanisms and shader/control compatibility.
const raf = () => new Promise(resolve => requestAnimationFrame(resolve));
while (!window.__fin && !window.__dome) await raf();
const F = window.__fin, D = window.__dome, model = F?.model || D.mech.model;
const renderer = F?.renderer || window.__lab.renderer, scene = F?.scene || window.__lab.scene, camera = F?.cam || window.__lab.camera;
const out = document.createElement('pre'); out.id = 'modelControlsCheck';
out.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:90;background:#10151eee;color:#ced9df;padding:10px;font:11px monospace'; document.body.append(out);
const result = { sliders: 0, poses: 0, model: model.signature };
const previousShaderError = renderer.debug.onShaderError;
renderer.debug.onShaderError = (gl, program, vertex, fragment) => {
  throw new Error(gl.getProgramInfoLog(program) + '\n' + gl.getShaderInfoLog(vertex) + '\n' + gl.getShaderInfoLog(fragment));
};
const draw = () => {
  renderer.setRenderTarget(null); renderer.render(scene, camera);
  scene.traverse(o => { if (o.isMesh && (!o.matrixWorld.elements.every(Number.isFinite))) throw new Error('Non-finite matrix: ' + o.name); });
};
try {
  for (const input of document.querySelectorAll('#panel input[type=range]')) {
    const original = input.value;
    for (const value of [input.min, input.max, original]) { input.value = value; input.dispatchEvent(new Event('input')); await raf(); draw(); }
    result.sliders++;
  }
  for (const pose of [[40, 0], [-40, 0], [0, 20], [0, -9], [0, 0]]) { model.NR.set(...pose); draw(); result.poses++; }
  for (const pose of [[15, 0, 0], [-15, 0, 0], [0, 12, 0], [0, -6, 0], [0, 0, 10], [0, 0, -10], [0, 0, 0]]) { model.WR.set(...pose); draw(); result.poses++; }
  const rig = model.lowerRig;
  for (const swap of [false, true]) { rig.setLowerSwap(swap); draw(); result.poses++; }
  if (D) {
    for (const wall of ['bluegray', 'dark']) { D.env.wallAppearance.set(wall); draw(); }
    for (const mode of ['standard', 'performance', 'balanced']) { D.renderQuality.set(mode); draw(); }
    for (const enabled of [false, true]) { D.surface.set(enabled); draw(); }
    for (let i = 0; i < 5; i++) { D.MC.toggleLayer(i); draw(); D.MC.toggleLayer(i); }
  }
  result.passed = true;
} catch (error) { result.passed = false; result.error = error.stack; }
renderer.debug.onShaderError = previousShaderError;
out.textContent = JSON.stringify(result); out.dataset.result = JSON.stringify(result);
