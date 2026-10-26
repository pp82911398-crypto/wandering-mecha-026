// Camera views from the old dome bay, recomputed from the 026's own anatomy (head, reactor, saw claw, foot,
// back), plus the boarding ride (cage up the tower, walk the bridge to the visor) and the cinematic tour.
// Generic: pass a function returning the anchors; the ride is optional (needs a lift API).
import * as THREE from 'three';

const V3 = THREE.Vector3;
const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export const VIEW_LIST = [
  ['head', '头部工作台'], ['ground', '地面仰视'], ['reactor', '胸腔反应堆'], ['claw', '锯刃爪'],
  ['foot', '足部维护'], ['back', '背部推进'], ['full', '全景'], ['top', '天车俯视'],
];

// anchors(): { base (crawler/stand point on the floor), head, reactor, claw, foot, height }
// unit: world units per head unit (1 here and in the port; 2.05 in the dome bay, which is built in metres)
export function setupViews({ camera, anchors, lift = null, onChange = () => {}, unit = 1 }) {
  const o = (x, y, z) => new V3(x, y, z).multiplyScalar(unit);
  const V = {
    head: A => ({ p: A.head.clone().add(o(0, 1.2, 13)), t: A.head.clone().add(o(0, 0.2, 0)), fov: 30 }),   // square on to the face
    ground: A => ({ p: A.base.clone().add(o(8, 1.7, 30)), t: A.base.clone().add(o(0, A.height * 0.6, 0)), fov: 52 }),   // in front of the crawler's nose (deck ends at +21)
    reactor: A => ({ p: A.reactor.clone().add(o(6.5, 2, 15)), t: A.reactor.clone().add(o(0, 0, 2)), fov: 32 }),
    claw: A => ({ p: A.claw.clone().add(o(-9, 3, 11)), t: A.claw.clone(), fov: 34 }),
    foot: A => ({ p: A.foot.clone().add(o(5, 1.8, 10)), t: A.foot.clone().add(o(0, 1.6, 1)), fov: 40 }),
    back: A => ({ p: A.base.clone().add(o(-16, A.height * 0.82, -30)), t: A.base.clone().add(o(0, A.height * 0.68, -2)), fov: 36 }),
    full: A => ({ p: A.base.clone().add(o(17, 7, 44)), t: A.base.clone().add(o(0, A.height * 0.5, 0)), fov: 46 }),
    top: A => ({ p: A.base.clone().add(o(14, A.height * 1.9, 26)), t: A.base.clone().add(o(0, A.height * 0.45, 0)), fov: 48 }),
  };
  const st = { active: 'full', tween: null, ride: null, tour: null, target: new V3() };
  const curTarget = () => camera.getWorldDirection(new V3()).multiplyScalar(30).add(camera.position);
  const sync = () => window.__freecam?.sync?.();
  function look(p, t, fov) { camera.position.copy(p); camera.lookAt(t); st.target.copy(t); if (fov) { camera.fov = fov; camera.updateProjectionMatrix(); } }

  function go(name, dur = 2.4) {
    st.ride = null;
    const v = V[name](anchors());
    st.tween = { p0: camera.position.clone(), t0: curTarget(), f0: camera.fov, p1: v.p, t1: v.t, f1: v.fov, k: 0, dur };
    st.active = name; onChange(name);
  }
  // boarding ride: cage up the tower with the camera inside, then walk the bridge to the visor
  function ride() {
    if (!lift) return go('head');
    st.tween = null; st.tour = st.tour || null;
    st.ride = { phase: 0, t: 0 }; st.active = 'head'; onChange('head');
  }
  function stopTour() { st.tour = null; }

  const TOUR = [['ground', 7], ['full', 7], ['@ride', 0], ['reactor', 7, 'explode'], ['claw', 8, 'thunder'], ['back', 8, 'assemble'], ['foot', 6], ['full', 8, 'calm']];
  function startTour(actions = {}) { st.tour = { i: -1, t: 0, actions }; nextTour(); }
  function nextTour() {
    const T = st.tour; T.i++;
    if (T.i >= TOUR.length) { st.tour = null; return; }
    const [v, d, act] = TOUR[T.i];
    if (v === '@ride') { ride(); T.t = 1e9; T.waitRide = true; }
    else { go(v, Math.min(4.5, d * 0.6)); T.t = d; T.waitRide = false; }
    if (act && T.actions[act]) T.actions[act]();
  }

  function update(dt) {
    if (st.tween) {
      const w = st.tween; w.k = Math.min(1, w.k + dt / w.dur); const e = ease(w.k);
      const p = w.p0.clone().lerp(w.p1, e), t = w.t0.clone().lerp(w.t1, e);
      look(p, t, w.f0 + (w.f1 - w.f0) * e);
      if (w.k >= 1) { st.tween = null; sync(); }
    }
    if (st.ride) {
      const R = st.ride, A = anchors(); R.t += dt;
      if (R.phase === 0) {                          // bridge out, cage to the ground, camera steps in
        if (lift.cage > 0.001 || lift.bridge < 0.999) { lift.set(Math.max(0, lift.cage - dt * 0.4), Math.min(1, lift.bridge + dt * 0.4)); }
        else { R.phase = 1; R.t = 0; }
        const c = lift.cagePos();
        look(new V3(c.x - 0.6, c.y + 1.75, c.z + 0.6), new V3(A.head.x, c.y + 6, A.head.z), 50);
      } else if (R.phase === 1) {                   // ride up (~11 s)
        lift.set(Math.min(1, lift.cage + dt * 0.09), 1);
        const c = lift.cagePos(), up = c.y + 1.75;
        look(new V3(c.x - 0.6, up, c.z + 0.6), new V3(A.head.x, up + 3 * (1 - lift.cage), A.head.z), 50);
        if (lift.cage >= 1) { R.phase = 2; R.t = 0; }
      } else if (R.phase === 2) {                   // walk out along the bridge, looking ahead to the head
        const k = ease(Math.min(1, R.t / 6)), y = lift.stops[1] + 1.75;
        const x = lift.landingX + (A.head.x - lift.landingX) * k;
        look(new V3(x, y, lift.bridgeZ + 0.5), A.head.clone().add(new V3(0, -0.2, 0)), 50 - 10 * k);
        if (R.t > 6.2) { R.phase = 3; R.t = 0; api.onCanopy?.(1); }
      } else if (R.phase === 3) {                   // turn square to the visor while the canopy opens
        const k = ease(Math.min(1, R.t / 2.5)), y = lift.stops[1] + 1.75;
        const from = new V3(A.head.x, y, lift.bridgeZ + 0.5), to = new V3(A.head.x, y + 0.3, lift.bridgeZ + 0.9);
        look(from.lerp(to, k), A.head.clone().add(new V3(0, 0.3 * k, 0)), 40);
        if (R.t > 5) { st.ride = null; sync(); if (st.tour?.waitRide) st.tour.t = 3; }
      }
    }
    if (st.tour && !st.ride) { st.tour.t -= dt; if (st.tour.t <= 0) nextTour(); }
  }
  const api = { go, ride, startTour, stopTour, update, state: st, views: V };
  return api;
}
