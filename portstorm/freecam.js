// Same view-movement rules as the finishing room, installed in the portstorm / hangar pages.
// Click canvas to lock the mouse (or hold LMB and drag), WASD move, Q/E down/up, Shift boost,
// wheel FOV zoom. Camera preset buttons still work; after a preset the free-cam re-syncs.
import * as THREE from 'three';

function install(camera, renderer, controls) {
  const canvas = renderer.domElement;
  if (controls) controls.enabled = false;
  let yaw = 0, pitch = 0, drag = false, dragDist = 0, dragX = 0, dragY = 0;
  const sync = () => {
    const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
    yaw = e.y; pitch = e.x;
  };
  sync();
  const isField = el => el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);
  // Dome passes its saved free-camera speed before install; other pages keep the original 1.0.
  let speed = Math.min(3, Math.max(.15, Number.isFinite(+window.__freecamSpeed) ? +window.__freecamSpeed : 1));

  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    e.preventDefault(); drag = true; dragDist = 0; dragX = e.clientX; dragY = e.clientY;
    try { canvas.setPointerCapture?.(e.pointerId); } catch (err) { /* synthetic pointer has no active capture */ }
    canvas.style.cursor = 'grabbing';
  });
  canvas.addEventListener('pointermove', e => {
    if (!drag || document.pointerLockElement === canvas) return;
    const dx = e.clientX - dragX, dy = e.clientY - dragY; dragX = e.clientX; dragY = e.clientY;
    dragDist += Math.abs(dx) + Math.abs(dy);
    yaw -= dx * 0.003; pitch = Math.max(-1.55, Math.min(1.55, pitch - dy * 0.003));
    camera.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
  });
  const endDrag = e => { if (!drag) return; drag = false; canvas.style.cursor = ''; try { canvas.releasePointerCapture?.(e.pointerId); } catch (err) {} };
  canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('click', () => {
    if (dragDist > 4) { dragDist = 0; return; }
    if (document.pointerLockElement !== canvas) canvas.requestPointerLock?.();
  });
  addEventListener('mousemove', e => {
    if (document.pointerLockElement !== canvas) return;
    yaw -= e.movementX * 0.0022; pitch = Math.max(-1.55, Math.min(1.55, pitch - e.movementY * 0.0022));
    camera.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
  });
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    camera.fov = Math.max(10, Math.min(80, camera.fov + Math.sign(e.deltaY) * 2));
    camera.updateProjectionMatrix();
  }, { passive: false });

  const keys = { f: 0, b: 0, l: 0, r: 0, up: 0, dn: 0, fast: false };
  const map = { KeyW: 'f', KeyS: 'b', KeyA: 'l', KeyD: 'r', KeyE: 'up', KeyQ: 'dn' };
  addEventListener('keydown', e => {
    if (isField(e.target)) return;
    const k = map[e.code]; if (!k) return;
    e.preventDefault(); keys[k] = 1; keys.fast = e.shiftKey;
  });
  addEventListener('keyup', e => { const k = map[e.code]; if (k) { keys[k] = 0; keys.fast = e.shiftKey; } });
  addEventListener('blur', () => { for (const k of Object.keys(keys)) keys[k] = 0; });

  const F = new THREE.Vector3(), R = new THREE.Vector3(), U = new THREE.Vector3(0, 1, 0);
  let last = performance.now();
  function update(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const f = keys.f - keys.b, s = keys.r - keys.l, u = keys.up - keys.dn;
    if ((f || s || u) && window.__freecam?.movementEnabled !== false) {
      F.set(0, 0, -1).applyQuaternion(camera.quaternion);
      R.set(1, 0, 0).applyQuaternion(camera.quaternion);
      const step = (keys.fast ? 55 : 18) * speed * dt;
      const d = new THREE.Vector3().addScaledVector(F, f * step).addScaledVector(R, s * step).addScaledVector(U, u * step);
      const next = camera.position.clone().add(d);
      if (window.__freecam?.constrainMove) next.copy(window.__freecam.constrainMove(camera.position, next));
      d.copy(next).sub(camera.position); camera.position.copy(next);
      // the port page keeps OrbitControls running (it re-aims at controls.target every frame): carry the target
      // along, otherwise A/D strafing turns into orbiting around a fixed point
      if (controls) controls.target.add(d);
    }
    requestAnimationFrame(update);
  }
  // camera-preset buttons (cams, control room, timeline follow) change the camera; re-sync after any UI click
  document.addEventListener('click', () => setTimeout(sync, 0), true);
  window.__freecam = {
    sync, keys, movementEnabled: true,
    get speed() { return speed; },
    setSpeed(v) { speed = Math.min(3, Math.max(.15, +v || 1)); window.__freecamSpeed = speed; },
  };
  requestAnimationFrame(update);
}

function wait() {
  if (!window.__lab) return setTimeout(wait, 300);
  install(window.__lab.camera, window.__lab.renderer, window.__lab.controls);
}
wait();
