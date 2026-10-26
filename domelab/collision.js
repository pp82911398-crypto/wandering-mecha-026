import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

const V3 = THREE.Vector3;
const visible = o => { for (let p = o; p; p = p.parent) if (!p.visible || p.userData.collisionEnabled === false) return false; return true; };

// Bounds are cheap to refresh for moving machinery; triangle trees are cached by geometry,
// built only when a person approaches an object, and never rebuilt in the animation loop.
export class CollisionWorld {
  constructor(scene, { exclude = [] } = {}) {
    this.scene = scene; this.entries = []; this.trees = new WeakMap(); this.builtTrees = 0;
    const omitted = new Set(exclude);
    scene.updateMatrixWorld(true);
    scene.traverse(o => {
      if (!o.isMesh || !o.geometry?.attributes.position) return;
      for (let p = o; p; p = p.parent) if (omitted.has(p) || p.userData.noCollision) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      if (mats.every(m => m.isShaderMaterial || m.depthWrite === false || (m.transparent && !m.isMeshStandardMaterial))) return;
      if (o.geometry.type === 'PlaneGeometry' && o.name !== 'bayFloor') return; // labels, decals, luminous room windows
      o.geometry.computeBoundingBox();
      const add = instance => this.entries.push({ mesh: o, instance, matrix: new THREE.Matrix4(), inverse: new THREE.Matrix4(), box: new THREE.Box3(), localBox: o.geometry.boundingBox, initialized: false });
      if (o.isInstancedMesh) for (let i = 0; i < o.count; i++) add(i); else add(null);
    });
    this.instanceMatrix = new THREE.Matrix4(); this.nextMatrix = new THREE.Matrix4();
    this.bounds = new THREE.Box3(); this.localBounds = new THREE.Box3(); this.rayBounds = new THREE.Box3();
    this.segment = new THREE.Line3(); this.trianglePoint = new V3(); this.capsulePoint = new V3();
    this.delta = new V3(); this.normal = new V3(); this.origin = new V3(); this.scale = new V3(); this.candidates = [];
    this.ray = new THREE.Ray(); this.direction = new V3();
    this.refresh();
  }
  refresh() {
    this.scene.updateMatrixWorld(true);
    // One visibility walk per mesh, rather than per instance of the same mesh.
    const visibility = new Map();
    for (const e of this.entries) {
      if (!visibility.has(e.mesh)) visibility.set(e.mesh, visible(e.mesh));
      e.enabled = visibility.get(e.mesh);
      if (!e.enabled) continue;
      this.nextMatrix.copy(e.mesh.matrixWorld);
      if (e.instance !== null) { e.mesh.getMatrixAt(e.instance, this.instanceMatrix); this.nextMatrix.multiply(this.instanceMatrix); }
      // Preserve live support matrices for lifts/gates while reusing static bounds.
      if (e.initialized && e.matrix.equals(this.nextMatrix)) continue;
      e.matrix.copy(this.nextMatrix); e.initialized = true;
      e.inverse.copy(e.matrix).invert();
      e.box.copy(e.localBox).applyMatrix4(e.matrix);
    }
  }
  tree(e) {
    let tree = this.trees.get(e.mesh.geometry);
    if (!tree) { tree = new MeshBVH(e.mesh.geometry, { maxLeafTris: 12, indirect: true }); this.trees.set(e.mesh.geometry, tree); this.builtTrees++; }
    return tree;
  }
  resolve(feet, radius = .26, height = 1.78) {
    let grounded = false, support = null;
    const contacts = [];
    for (let iteration = 0; iteration < 3; iteration++) {
      this.bounds.min.set(feet.x - radius, feet.y - .015, feet.z - radius);
      this.bounds.max.set(feet.x + radius, feet.y + height, feet.z + radius);
      this.candidates.length = 0;
      for (const e of this.entries) if (e.enabled && e.box.intersectsBox(this.bounds)) this.candidates.push(e);
      let changed = false;
      for (const e of this.candidates) {
        const segment = this.segment;
        segment.start.set(feet.x, feet.y + radius, feet.z).applyMatrix4(e.inverse);
        segment.end.set(feet.x, feet.y + height - radius, feet.z).applyMatrix4(e.inverse);
        this.scale.setFromMatrixScale(e.inverse);
        const r = radius * Math.max(this.scale.x, this.scale.y, this.scale.z);
        this.localBounds.makeEmpty().expandByPoint(segment.start).expandByPoint(segment.end).expandByScalar(r);
        const before = segment.start.clone();
        this.tree(e).shapecast({
          intersectsBounds: box => box.intersectsBox(this.localBounds),
          intersectsTriangle: triangle => {
            const distance = triangle.closestPointToSegment(segment, this.trianglePoint, this.capsulePoint);
            if (distance >= r - 1e-7) return false;
            this.delta.subVectors(this.capsulePoint, this.trianglePoint);
            if (distance > 1e-7) this.delta.multiplyScalar(1 / distance);
            else { triangle.getNormal(this.delta); if (this.delta.dot(segment.end.clone().sub(this.trianglePoint)) < 0) this.delta.negate(); }
            this.normal.copy(this.delta).transformDirection(e.matrix);
            if (this.normal.y > .55) { grounded = true; support = e; }
            contacts.push(this.normal.clone());
            this.delta.multiplyScalar(r - distance + .00005);
            segment.start.add(this.delta); segment.end.add(this.delta); changed = true;
            return false;
          },
        });
        if (!segment.start.equals(before)) {
          this.delta.copy(segment.start).sub(before);
          this.origin.set(0, 0, 0).applyMatrix4(e.matrix);
          this.delta.applyMatrix4(e.matrix).sub(this.origin); feet.add(this.delta);
        }
      }
      if (!changed) break;
    }
    return { grounded, contacts, support };
  }
  move(feet, displacement, radius = .26, height = 1.78) {
    // Short steps prevent tunnelling through thin rails, even on a slow frame.
    const count = Math.max(1, Math.ceil(displacement.length() / (radius * .45)));
    const step = displacement.clone().multiplyScalar(1 / count); let grounded = false;
    const contacts = []; let support = null;
    for (let i = 0; i < count; i++) { feet.add(step); const hit = this.resolve(feet, radius, height); grounded ||= hit.grounded; support = hit.support || support; contacts.push(...hit.contacts); }
    return { grounded, contacts, support };
  }
  groundBelow(feet, distance = .34) {
    const origin = feet.clone().add(new V3(0, .02, 0)), ray = new THREE.Ray(origin, new V3(0, -1, 0));
    this.rayBounds.min.set(feet.x, feet.y - distance, feet.z);
    this.rayBounds.max.copy(origin);
    let result = null;
    for (const e of this.entries) {
      if (!e.enabled || !e.box.intersectsBox(this.rayBounds) || !ray.intersectsBox(e.box)) continue;
      this.ray.copy(ray).applyMatrix4(e.inverse);
      const hit = this.tree(e).raycastFirst(this.ray, THREE.DoubleSide); if (!hit) continue;
      const point = hit.point.applyMatrix4(e.matrix), normal = hit.face.normal.clone().transformDirection(e.matrix);
      if (normal.y < .55 || point.y > feet.y + .02 || feet.y - point.y > distance) continue;
      if (!result || point.y > result.y) result = { y: point.y, support: e, normal };
    }
    return result;
  }
  cameraDistance(from, to, padding = .18) {
    const direction = this.direction.subVectors(to, from), distance = direction.length();
    if (distance < .001) return 0;
    direction.multiplyScalar(1 / distance);
    const worldRay = new THREE.Ray(from, direction); let nearest = distance;
    this.rayBounds.makeEmpty().expandByPoint(from).expandByPoint(to);
    for (const e of this.entries) {
      if (!e.enabled || !e.box.intersectsBox(this.rayBounds) || !worldRay.intersectsBox(e.box)) continue;
      this.ray.copy(worldRay).applyMatrix4(e.inverse);
      const hit = this.tree(e).raycastFirst(this.ray, THREE.DoubleSide);
      if (hit) nearest = Math.min(nearest, hit.point.applyMatrix4(e.matrix).distanceTo(from));
    }
    return Math.max(.08, nearest - padding);
  }
}

export class WalkerPhysics {
  constructor(world, position = new V3(18, .04, 59)) {
    this.world = world; this.position = position.clone(); this.velocity = new V3(); this.grounded = false; this.radius = .26; this.height = 1.78;
    this.support = null; this.supportPoint = new V3(); this.supportMatrix = new THREE.Matrix4();
  }
  update(dt, direction, speed = 2.4, jump = false) {
    if (this.support?.enabled) {
      const carried = this.position.clone().applyMatrix4(this.supportMatrix.clone().invert()).applyMatrix4(this.support.matrix);
      if (carried.distanceTo(this.position) < 2) this.position.copy(carried);
    }
    const n = Math.max(1, Math.ceil(dt / (1 / 90))), step = dt / n;
    for (let i = 0; i < n; i++) {
      this.velocity.x = THREE.MathUtils.damp(this.velocity.x, direction.x * speed, 14, step);
      this.velocity.z = THREE.MathUtils.damp(this.velocity.z, direction.z * speed, 14, step);
      if (jump && this.grounded && i === 0) this.velocity.y = 6.6;
      this.velocity.y = Math.max(-18, this.velocity.y - 18 * step);
      const before = this.position.clone(), displacement = this.velocity.clone().multiplyScalar(step);
      let hit = this.world.move(this.position, displacement, this.radius, this.height);
      // A low lip is stepped over; walls and railings still block the capsule.
      if (this.grounded && new V3(this.position.x - before.x, 0, this.position.z - before.z).length() < Math.hypot(displacement.x, displacement.z) * .55 && direction.lengthSq() > .01) {
        const raised = before.clone().add(new V3(0, .3, 0));
        const up = this.world.resolve(raised, this.radius, this.height);
        const candidate = raised.clone(); this.world.move(candidate, new V3(displacement.x, 0, displacement.z), this.radius, this.height);
        const landing = this.world.groundBelow(candidate, .34);
        if (landing && Math.abs(raised.y - before.y - .3) < .01 && Math.hypot(candidate.x - before.x, candidate.z - before.z) > Math.hypot(this.position.x - before.x, this.position.z - before.z) + .001) {
          candidate.y = landing.y + .0001; this.position.copy(candidate);
          hit = { grounded: true, support: landing.support, contacts: [landing.normal] };
        }
      }
      this.grounded = hit.grounded;
      this.support = hit.support;
      for (const normal of hit.contacts) { const into = this.velocity.dot(normal); if (into < 0) this.velocity.addScaledVector(normal, -into); }
      if (this.grounded && this.velocity.y < 0) this.velocity.y = 0;
    }
    if (this.support) this.supportMatrix.copy(this.support.matrix);
  }
}
