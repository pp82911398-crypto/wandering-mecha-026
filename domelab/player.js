import * as THREE from 'three';
import { buildVisitorAvatar } from './avatar.js?v=dome-walk-20261023c';
export { buildVisitorAvatar } from './avatar.js?v=dome-walk-20261023c';
import { CollisionWorld, WalkerPhysics } from './collision.js?v=dome-perf-20261023ab';

const V3 = THREE.Vector3;
export function createPlayerController({ scene, camera, controls, views, visitor, env, boarding, bridges = [], onEnter = null }) {
  const world = new CollisionWorld(scene), physics = new WalkerPhysics(world), avatar = buildVisitorAvatar();
  scene.add(avatar.root); avatar.root.visible = false;
  const state = { active: false, firstPerson: true, crouching: false, sprinting: false }, keys = new Set();
  // The third-person camera can be inside one of the open lift cages. Its horizontal crossbars are
  // legitimate geometry, but letting camera collision see them makes the view snap at every beam while
  // the cage rises. Detect the support's cage ancestor and hold a camera distance there instead.
  const inLiftCage = () => {
    let o = physics.support?.mesh;
    while (o) {
      if (o === env.lift?.cage || o.name === 'controlLiftCage' || o.name === 'liftCage') return true;
      o = o.parent;
    }
    return false;
  };
  const facing = new V3(), right = new V3(), direction = new V3(), eye = new V3(), desired = new V3();
  let jump = false, previousCamera = null, previousTarget = null, button, lastForward = -1, autoSprint = false, eyeHeight = 1.6;
  let savedPosition = null, camDist = 4.2, cageCamUntil = 0;
  const bar = document.createElement('div'); bar.id = 'visitorWalkHelp';
  bar.style.cssText = 'position:fixed;left:50%;bottom:8px;transform:translateX(-50%);color:#c6d1da;background:#111a22dc;padding:7px 12px;font:11px sans-serif;z-index:18;display:none';
  const help = 'WASD 行走 · Shift 加速 · Ctrl / Control 蹲下 · 空格跳跃 · V / F5 视角 · E 呼叫 / 操作电梯';
  bar.textContent = help; document.body.append(bar);
  const actor = {
    freeWalking: true,
    getPosition(out) { return out.copy(physics.position); },
    setPosition(p) { physics.position.copy(p); physics.velocity.set(0, 0, 0); },
    begin() { views.state.tween = null; views.state.ride = null; views.stopTour(); keys.clear(); jump = false; document.exitPointerLock?.(); },
    end() { physics.velocity.set(0, 0, 0); },
  };
  function enter() {
    onEnter?.();
    visitor.ride.release();
    previousCamera = { p: camera.position.clone(), q: camera.quaternion.clone(), fov: camera.fov }; previousTarget = controls.target.clone();
    views.stopTour(); views.state.tween = null; views.state.ride = null;
    if (savedPosition) physics.position.copy(savedPosition); else physics.position.set(18, .04, 59);
    physics.velocity.set(0, 0, 0); world.refresh(); world.resolve(physics.position);
    state.active = true; avatar.root.visible = true; bar.style.display = 'block';
    controls.enabled = false; camera.fov = 60; camera.updateProjectionMatrix();
    camera.position.copy(physics.position).add(new V3(0, 2.5, 4.5)); camera.lookAt(new V3(0, 20, 0)); window.__freecam?.sync?.();
    visitor.ride.setActor(actor); keys.clear(); if (button) button.textContent = '退出人物漫游';
  }
  function exit(keep = false) {
    if (keep && state.active) savedPosition = physics.position.clone();
    if (!keep) savedPosition = null;
    visitor.ride.release();
    state.active = false; avatar.root.visible = false; bar.style.display = 'none'; keys.clear();
    visitor.ride.setActor(visitor.cameraActor);
    if (previousCamera) { camera.position.copy(previousCamera.p); camera.quaternion.copy(previousCamera.q); camera.fov = previousCamera.fov; camera.updateProjectionMatrix(); controls.target.copy(previousTarget); }
    window.__freecam?.sync?.(); if (button) button.textContent = '进入人物漫游';
  }
  document.addEventListener('keydown', e => {
    if (!state.active || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyR', 'ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight', 'Space', 'F5'].includes(e.code)) { keys.add(e.code); e.preventDefault(); e.stopPropagation(); }
    if (e.code === 'KeyW' && !e.repeat) { const now = performance.now(); if (now - lastForward < 300) autoSprint = true; lastForward = now; }
    if (e.code === 'Space' && !e.repeat) jump = true;
    if (e.code === 'KeyE' && !e.repeat) {
      const bridge = bridges.find(b => b.near(physics.position));
      if (bridge) { bridge.toggle(physics.position); e.preventDefault(); e.stopPropagation(); }
      else if (boarding?.near(physics.position)) { boarding.toggle(physics.position); e.preventDefault(); e.stopPropagation(); }
    }
    if ((e.code === 'KeyV' || e.code === 'F5') && !e.repeat) { state.firstPerson = !state.firstPerson; e.preventDefault(); }
  });
  document.addEventListener('keyup', e => { keys.delete(e.code); if (e.code === 'KeyW') autoSprint = false; });
  addEventListener('blur', () => { keys.clear(); jump = false; });
  const api = { world, physics, avatar, state, enter, exit, keys, get savedPosition() { return savedPosition; },
    mount(parent) { button = document.createElement('button'); button.textContent = '进入人物漫游'; button.onclick = () => state.active ? exit(false) : enter(); parent.append(button); },
    update(dt) {
      const free = window.__freecam;
      if (free) {
        free.movementEnabled = !state.active && !visitor.ride.riding && !visitor.ride.waiting;
        if (!free.constrainMove) free.constrainMove = (from, to) => { world.refresh(); const feet = from.clone().add(new V3(0, -.2, 0)); world.move(feet, to.clone().sub(from), .18, .4); return feet.add(new V3(0, .2, 0)); };
      }
      if (!state.active) return;
      const bridge = bridges.find(b => b.near(physics.position));
      bar.textContent = bridge
        ? `E · ${bridge.state.target > .5 ? '收回' : '展开'}${bridge.label} · 桥上有人时禁止收回`
        : boarding?.near(physics.position) ? `E · ${boarding.state.target > .5 ? '收回' : '展开'}登机过道 · 过道上有人时禁止收回` : help;
      world.refresh();
      {
        camera.getWorldDirection(facing); facing.y = 0; facing.normalize(); right.crossVectors(facing, new V3(0, 1, 0));
        direction.set(0, 0, 0).addScaledVector(facing, +keys.has('KeyW') - +keys.has('KeyS')).addScaledVector(right, +keys.has('KeyD') - +keys.has('KeyA')).normalize();
        let crouch = keys.has('ControlLeft') || keys.has('ControlRight');
        if (!crouch && physics.height < 1.78) {
          const standing = physics.position.clone(); world.resolve(standing, physics.radius, 1.78);
          if (standing.y < physics.position.y - .01 || Math.hypot(standing.x - physics.position.x, standing.z - physics.position.z) > .04) crouch = true;
        }
        const sprint = !crouch && (autoSprint || keys.has('KeyR') || keys.has('ShiftLeft') || keys.has('ShiftRight'));
        state.crouching = crouch; state.sprinting = sprint;
        physics.height = crouch ? 1.5 : 1.78;
        physics.update(dt, direction, crouch ? 1.35 : sprint ? 6.2 : 4.3, jump); jump = false;
        camera.fov = THREE.MathUtils.damp(camera.fov, sprint && direction.lengthSq() > .01 ? 67 : 60, 7, dt); camera.updateProjectionMatrix();
        if (direction.lengthSq() > .01) {
          const angle = Math.atan2(direction.x, direction.z) - avatar.root.rotation.y;
          avatar.root.rotation.y += Math.atan2(Math.sin(angle), Math.cos(angle)) * (1 - Math.exp(-10 * dt));
        }
      }
      if (physics.position.y < -10) { physics.position.set(18, .04, 59); physics.velocity.set(0, 0, 0); }
      avatar.root.position.copy(physics.position); avatar.root.visible = !state.firstPerson;
      avatar.update(dt, Math.hypot(physics.velocity.x, physics.velocity.z), { crouch: state.crouching,
        running: state.sprinting, grounded: physics.grounded, vertical: physics.velocity.y });
      eyeHeight = THREE.MathUtils.damp(eyeHeight, physics.height - .18, 12, dt);
      eye.copy(physics.position).add(new V3(0, eyeHeight, 0));
      if (state.firstPerson) camera.position.copy(eye);
      else {
        camera.getWorldDirection(facing); desired.copy(eye).addScaledVector(facing, -4.2);
        // Inside a lift cage, third-person collision against every crossbeam causes a visible jump at
        // each beam. Hold a fixed distance while riding and damp the collision distance elsewhere.
        if (inLiftCage()) cageCamUntil = performance.now() + 1500;
        const riding = !!visitor.ride?.riding || performance.now() < cageCamUntil;
        const target = riding ? 2.7 : world.cameraDistance(eye, desired);
        camDist = THREE.MathUtils.damp(camDist, target, riding ? 10 : (target < camDist ? 16 : 6), dt);
        camera.position.copy(eye).addScaledVector(facing, -camDist);
        avatar.root.visible = camDist > .55;
      }
      controls.target.copy(eye); views.state.tween = null; views.state.ride = null;
    },
  };
  return api;
}
