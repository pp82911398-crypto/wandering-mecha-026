// Third-level observation bridges: a three-stage telescoping walkway from each side platform toward the
// 026's shoulder. Retracted it is a compact housing on the landing; a roaming character can extend it with E.
// Built after the static merge so the stages keep their own transforms.
import * as THREE from 'three';
import { textTex } from '../src/materials.js';

const V3 = THREE.Vector3;
const smooth = x => x * x * (3 - 2 * x);

export function buildShoulderBridges({ env, J, scene }) {
  const m = env.observation[0].materials;
  const list = [], bySide = new Map();
  for (const side of env.observation) {
    const anchor = side.side < 0 ? J.anchors.armLHook : J.anchors.armR1Hook;
    const shoulder = anchor.getWorldPosition(new V3());
    // Use the observation level nearest the shoulder height (the third working level, 77.2 m).
    const level = side.stops.reduce((best, y) => Math.abs(y - shoulder.y) < Math.abs(best - shoulder.y) ? y : best, side.stops[0]);
    // Start at the opened X-brace portal on the tower's inner face, not on the landing behind the
    // deck railing. Tower half-width is 4 m; z=-3.5 puts the portal at the shoulder's z.
    const innerX = -side.side * 4, startLocal = new V3(innerX, level, -3.5);
    // Land on the shoulder cap, not outside it. The end is pulled in to 1.15 m from the arm hook
    // and its height is raycast from the actual armor top, so the bridge foot sits on the shoulder.
    const endX = shoulder.x + side.side * 1.15, endZ = shoulder.z;
    const surfaceMeshes = []; scene.traverse(o => { if (o.isMesh && o.visible && !/shoulderBridge|shoulderBridgePortal/.test(o.name)) surfaceMeshes.push(o); });
    const downRay = new THREE.Raycaster(new V3(endX, 120, endZ), new V3(0, -1, 0));
    const topHit = downRay.intersectObjects(surfaceMeshes, false)
      .find(h => h.point.y > shoulder.y - 2.5 && h.point.y < shoulder.y + 5);
    const surfaceY = topHit ? topHit.point.y : shoulder.y;
    const endY = surfaceY + .1;
    const endWorld = new V3(endX, endY, endZ);
    const endLocal = side.root.worldToLocal(endWorld.clone());
    const dir = endLocal.clone().sub(startLocal);
    const length = dir.length();
    const seg = Math.max(2.5, (length - .6) / 2.92), overlap = .6;
    const root = new THREE.Group(); root.name = 'shoulderBridge'; root.position.copy(startLocal);
    root.userData.collisionEnabled = false;
    side.root.add(root);
    // Point the local -Z axis at the shoulder landing. The previous hand-built basis left the stages
    // running along the tower instead of along the bridge, which is why the bridge never met the pad.
    root.lookAt(endWorld);
    root.rotateY(Math.PI);   // Object3D.lookAt points +Z at the target; the stages are built along -Z.
    // Yellow portal around the removed X-brace band; the deck rail already has a matching gap.
    const frame = new THREE.Group(); frame.name = 'shoulderBridgePortal'; side.root.add(frame);
    for (const dz of [-1.45, 1.45]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(.2, 2.7, .2), m.yellow);
      post.position.set(innerX, level + 1.35, -3.5 + dz); frame.add(post);
    }
    const header = new THREE.Mesh(new THREE.BoxGeometry(.2, .2, 3.1), m.yellow);
    header.position.set(innerX, level + 2.65, -3.5); frame.add(header);

    // Only a low threshold and a sill: the old 1.35 m housing read as a black block in the lift lobby
    // and sat in the cage travel path. The stages themselves disappear into a 2 cm stack when retracted.
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(1.75, .1, .12), m.yellow);
    mouth.position.set(0, .05, -.06); mouth.userData.collisionEnabled = false; root.add(mouth);   // low threshold only; no tall housing / cage fouling
    // A low folded bridge head plus a floating call sign: the bridge itself only appears when summoned.
    const stack = new THREE.Mesh(new THREE.BoxGeometry(1.7, .08, .4), m.beam || m.steel);
    stack.position.set(0, .04, -.22); stack.userData.collisionEnabled = false; root.add(stack);
    const lip = new THREE.Mesh(new THREE.BoxGeometry(1.76, .03, .08), m.yellow);
    lip.position.set(0, .09, -.02); lip.userData.collisionEnabled = false; root.add(lip);
    const sign = new THREE.Sprite(new THREE.SpriteMaterial({
      map: textTex([{ t: 'E · 肩桥', size: 86, y: 82, color: '#ffcf6a' }], 512, 160),
      transparent: true, depthWrite: false, toneMapped: false,
    }));
    sign.scale.set(1.55, .48, 1); sign.position.set(0, 1.35, -.32); root.add(sign);

    const stages = [];
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Group(); g.name = 'shoulderBridgeStage' + i;
      const len = seg + overlap;
      const floor = new THREE.Mesh(new THREE.BoxGeometry(1.45, .12, len), m.deck || m.grate);
      floor.position.set(0, 0, -len / 2); g.add(floor);
      const beam = new THREE.Mesh(new THREE.BoxGeometry(1.7, .16, len), m.beam || m.steel);
      beam.position.set(0, -.15, -len / 2); g.add(beam);
      for (const s of [-1, 1]) {
        const toe = new THREE.Mesh(new THREE.BoxGeometry(.07, .18, len), m.yellow);
        toe.position.set(s * .72, .12, -len / 2); g.add(toe);
        for (const h of [.55, 1.08]) {
          const rail = new THREE.Mesh(new THREE.BoxGeometry(.06, .06, len), m.yellow);
          rail.position.set(s * .72, h, -len / 2); g.add(rail);
        }
        for (let z = -.4; z > -len + .4; z -= 2.4) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(.06, 1.08, .06), m.yellow);
          post.position.set(s * .72, .54, z); g.add(post);
        }
      }
      g.position.z = 0; g.scale.z = .02; g.visible = false;
      g.userData.offset = i * seg * .96;
      root.add(g); stages.push(g);
    }

    const state = { open: 0, target: 0, level, length };
    const nearWorld = new V3();
    const api = {
      root, stages, state, side: side.side, level, length, endWorld, surfaceY, label: (side.side < 0 ? '左' : '右') + '观察台连接桥',
      setOpen(v) { state.target = THREE.MathUtils.clamp(v, 0, 1); },
      near(position) {
        if (Math.abs(position.y - level) > 2.6) return false;
        const local = side.root.worldToLocal(position.clone());
        return Math.abs(local.x - innerX) < 3.3 && Math.abs(local.z + 3.5) < 3.0;
      },
      toggle(position) {
        if (state.target > .5) {
          const local = root.worldToLocal(position.clone());
          if (local.z < -.5 && local.z > -length - 1) return false;   // someone is on the bridge
        }
        state.target = state.target > .5 ? 0 : 1; return true;
      },
      update(dt = 1 / 60) {
        // Match the head gangway's weight: ~5 s out / ~6 s back.
        const rate = state.target > state.open ? .20 : .16;
        state.open += THREE.MathUtils.clamp(state.target - state.open, -dt * rate, dt * rate);
        const t = smooth(THREE.MathUtils.clamp(state.open, 0, 1));
        for (const g of stages) {
          g.position.z = -g.userData.offset * t;
          g.scale.z = .02 + .98 * t;
          g.visible = t > .01;
        }
        root.userData.collisionEnabled = t > .985;
      },
    };
    api.update(0);
    list.push(api); bySide.set(side.side, api);
  }
  return { list, bySide, update(dt) { for (const b of list) b.update(dt); } };
}
