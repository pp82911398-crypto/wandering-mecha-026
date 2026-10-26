// Opt-in integration check: ?verify=walk. Exercises the actual capsule and moving lift meshes.
import * as THREE from 'three';
import { WalkerPhysics } from './collision.js?v=dome-perf-20261023ab';
import { updateEnvironment } from '../src/env.js?v=dome-crane-depth-20261023e';
const V3 = THREE.Vector3, next = () => new Promise(r => requestAnimationFrame(r));
const panel = document.createElement('pre'); panel.id = 'walkCheck';
panel.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:100;background:#10202fee;color:#cdd9df;max-width:70vw;max-height:40vh;overflow:auto;padding:8px;font:10px monospace';
document.body.append(panel);
const report = { checks: [], done: false }, save = () => { panel.dataset.result = JSON.stringify(report); panel.textContent = JSON.stringify(report, null, 1); };
const check = (name, pass, detail) => { report.checks.push({ name, pass, detail }); save(); };
try {
  while (!window.__dome || !document.querySelector('#loader.hide')) await next();
  const D = window.__dome, { scene, camera, renderer } = window.__lab, { env, access, player, visitor } = D;
  renderer.setAnimationLoop(null); D.VW.state.tween = null;
  const world = player.world, main = env.lift, dt = 1 / 30, idle = new V3();
  const environment = () => { updateEnvironment(env, D.J, 0, dt, 0); D.boarding.update(dt); access.update(dt); world.refresh(); };
  Object.assign(main, { stop: 0, y: main.stops[0].y, phase: 'idle', ext: 0, x: 0 });
  for (let i = 0; i < 40; i++) environment();
  const point = (root, a) => { root.updateWorldMatrix(true, false); return root.localToWorld(Array.isArray(a) ? new V3(...a) : a.clone()); };
  const settle = (p, n = 30) => { for (let i = 0; i < n; i++) p.update(dt, idle, 0); };
  const follow = async (name, root, points, { speed = 3, tolerance = .2 } = {}) => {
    const start = point(root, points[0]); start.y += .04;
    const p = new WalkerPhysics(world, start); settle(p);
    let reached = true, index = 0;
    for (const a of points.slice(1)) {
      const goal = point(root, a), dir = new V3(); let n = 0;
      const limit = Math.ceil((Math.hypot(goal.x-p.position.x,goal.z-p.position.z)/speed*2+6)/dt);
      for (; n < limit; n++) {
        dir.subVectors(goal, p.position); dir.y = 0;
        if (dir.length() < tolerance) break;
        p.update(dt, dir.normalize(), speed);
        if (n % 180 === 0) await next();
      }
      if (n === limit || Math.abs(p.position.y-goal.y) > .45) { reached = false; break; }
      index++;
    }
    const goal = point(root, points.at(-1));
    const blockers=[];
    if(!reached) for(const h of [.12,.4,.9,1.5]) {
      const direction=goal.clone().sub(p.position).setY(0).normalize(), ray=new THREE.Ray(p.position.clone().add(new V3(0,h,0)),direction);
      for(const e of world.entries) if(e.enabled && ray.intersectsBox(e.box)) {
        const hit=world.tree(e).raycastFirst(ray.clone().applyMatrix4(e.inverse),THREE.DoubleSide);
        if(hit && hit.point.applyMatrix4(e.matrix).distanceTo(ray.origin)<1) blockers.push({h,name:e.mesh.name,parent:e.mesh.parent.name,mat:[].concat(e.mesh.material).map(m=>m.name),point:hit.point.toArray(),part:e.mesh.userData.part});
      }
    }
    check(name, reached, { blockers,index, end: p.position.toArray().map(n=>+n.toFixed(3)), goal: goal.toArray(), error: +p.position.distanceTo(goal).toFixed(3) });
    return p;
  };
  const onlyBoarding=new URLSearchParams(location.search).has('boardingOnly');
  if(!onlyBoarding) {
  for (const [i, r] of access.routes.entries()) {
    const d = r.end.clone().sub(r.start).setY(0).normalize();
    await follow(`stairs ${i}`, r.root, [r.start.clone().addScaledVector(d,-.6), r.end]);
    await follow(`stairs descent ${i}`,r.root,[r.end,r.start.clone().addScaledVector(d,-.6)]);
    if (i < 2) {
      const side = env.observation[i], y = side.stops[0];
      await follow(`side cabin entry ${i}`, side.root, [r.end, [0,y,14], [0,y,17.4]]);
    } else await follow('central cabin entry', main.root, [[0,main.y,main.F+.35],[0,main.y,main.cz-.8]]);
  }
  for (const [i, c] of access.connectors.entries()) await follow(`cantilever connection ${i}`, c.root, c.path);
  // Mobile cabins carry a freely moving passenger, with doors shut before departure.
  for (const lift of access.lifts) {
    const p = new WalkerPhysics(world, lift.position().add(new V3(.4,.05,0))); settle(p);
    lift.go(1); let openTravel=false;
    for (let i=0;i<500;i++) { environment(); p.update(dt,idle,0); if(lift.state.moving && lift.state.gate>.001 && Math.abs(p.position.y-lift.stops[0])>.1) openTravel=true; if(i%120===0) await next(); }
    check(`mobile carry ${lift.id}`, Math.abs(p.position.y-lift.state.y)<.12 && !openTravel, {y:p.position.y, floor:lift.state.y,openTravel});
    if(lift.id!=='mobile0') await follow(`mobile tower exit ${lift.id}`,lift.root,[[0,lift.stops[1]+.025,17.4],[0,lift.stops[1],12],[0,lift.stops[1],0]]);
  }
  // Every perimeter lift: walk in, move within the cabin during ascent, then walk onto the gallery.
  for (const lift of env.visitors.lifts) {
    await follow(`gallery entry ${lift.id}`, lift.root, [[0,0,-4.3],[0,lift.stops[0]+.031,0]]);
    const p = new WalkerPhysics(world, lift.position().add(new V3(-.5,.04,0))); settle(p);
    const oldX = lift.cage.worldToLocal(p.position.clone()).x;
    lift.go(1);
    for (let i = 0; i < 240; i++) { environment(); p.update(dt, i > 80 && i < 90 ? new V3(Math.cos(lift.root.rotation.y),0,-Math.sin(lift.root.rotation.y)) : idle, 1.2); if (i%120===0) await next(); }
    const local = lift.cage.worldToLocal(p.position.clone());
    check(`gallery carry and movement ${lift.id}`, Math.abs(p.position.y-lift.state.y-.0305)<.12 && local.x-oldX>.15, { y:p.position.y, floor:lift.state.y, local:local.toArray() });
    await follow(`gallery exit ${lift.id}`, lift.root, [[0,lift.stops[1]+.031,0],[0,lift.stops[1],-4]]);
  }
  }
  // Check every upper tower landing and the central boarding route as well.
  if(!onlyBoarding) for(const side of env.observation) for(const y of side.stops.slice(2)) {
    side.state.y=y; side.state.targetY=y; side.state.moving=false;
    for(let i=0;i<35;i++) environment();
    await follow(`upper tower landing ${side.side} ${y}`,side.root,[[0,y+.025,17.4],[0,y,12],[0,y,0]]);
  }
  Object.assign(main,{stop:3,y:main.stops[3].y,phase:'idle',ext:main.stops[3].ext});
  for(let i=0;i<35;i++) environment(); D.boarding.setOpen(1); for(let i=0;i<220;i++) environment();
  D.MC.canopy(1); D.MC.update(0,4.1); world.refresh();
  const bridgeTip=point(D.boarding.root,[0,-.73,.25]);
  const bridgeStart=point(main.cage,[0,0,main.cz-.8]);
  await follow('central cabin to bridge',scene,[bridgeStart,bridgeTip]);
  const passageStart=point(D.boarding.root,[0,-.73,.1]);
  const passageEnd=point(D.boarding.root,[0,-.73+D.boarding.rise,-D.boarding.length+.3]);
  await follow('cockpit boarding passage',scene,[passageStart,passageEnd],{speed:1.3,tolerance:.12});
  const inner=point(D.mech.head,[0,D.boarding.innerFloor,.35]);
  await follow('cockpit entry sill',scene,[D.boarding.entrance.clone().add(new V3(0,0,.15)),inner],{speed:1,tolerance:.12});
  // A surface above an NPC's feet indicates a buried leg or placement inside equipment.
  const npcs = []; scene.traverse(o=> { if (o.userData.npcFeet) for (const foot of o.userData.npcFeet) npcs.push({ o, foot }); });
  const buried = [];
  const peopleEntries = world.entries.filter(e=>[].concat(e.mesh.material).some(m=>m.userData.npc));
  peopleEntries.forEach(e=>e.enabled=false);
  for (const {o,foot} of npcs) {
    const feet = point(o,[foot.x,foot.y,foot.z]), hit = world.groundBelow(feet.clone().add(new V3(0,1.1,0)),1.2);
    if (hit && hit.y-feet.y > .16) buried.push({seed:foot.seed,feet:feet.toArray(),surface:hit.y,mesh:hit.support.mesh.name});
  }
  world.refresh();
  check('NPC ground clearance', buried.length===0, {count:npcs.length,buried});
  const distance = list => Math.min(...list.flatMap((a,i)=>list.slice(i+1).map(b=>Math.hypot(a[0]-b[0],a[1]-b[1]))));
  check('distributed cones and workers', distance(env.groundLayout.cones)>4 && distance(env.groundLayout.workers)>4, {cones:env.groundLayout.cones.length,coneSpacing:distance(env.groundLayout.cones),workerSpacing:distance(env.groundLayout.workers)});
  let perimeterGlass = 0; env.visitors.root.traverse(o=> { if(o.isMesh && o.visible && [].concat(o.material).some(m=>m.name==='paleAmberLiftGlass')) perimeterGlass++; });
  check('glass only on three crawlers', access.glassLiftCount===3 && perimeterGlass===0, {crawlerLifts:access.glassLiftCount,perimeterGlass});
  // Real key listeners and actual player update, with a fixed camera facing an empty patch of floor.
  player.enter(); player.physics.position.set(10,.04,57); camera.lookAt(10,1.6,30); world.refresh();
  const key = (type,code) => document.dispatchEvent(new KeyboardEvent(type,{code,bubbles:true,cancelable:true}));
  key('keydown','KeyW'); for(let i=0;i<30;i++) player.update(dt); const walkSpeed=player.physics.velocity.length();
  key('keydown','ShiftLeft'); for(let i=0;i<30;i++) player.update(dt); const sprintSpeed=player.physics.velocity.length(), sprint=player.state.sprinting;
  key('keyup','ShiftLeft'); key('keydown','ControlLeft'); for(let i=0;i<30;i++) player.update(dt);
  check('Shift sprint / Control crouch', sprint && sprintSpeed>walkSpeed*1.3 && player.state.crouching && player.physics.height===1.5, {walkSpeed,sprintSpeed,crouch:player.state.crouching,height:player.physics.height});
  for(const code of ['KeyW','ControlLeft']) key('keyup',code); player.exit();
  player.enter();
  const lift=env.visitors.lifts[0]; player.physics.position.copy(lift.position()).add(new V3(0,.04,0));
  world.refresh(); player.update(dt); visitor.update();
  const cabinStart=player.physics.position.clone(), beforeLook=camera.quaternion.clone(), canvas=renderer.domElement;
  canvas.dispatchEvent(new PointerEvent('pointerdown',{button:0,clientX:500,clientY:400,pointerId:11,bubbles:true}));
  canvas.dispatchEvent(new PointerEvent('pointermove',{button:0,clientX:600,clientY:420,pointerId:11,bubbles:true}));
  canvas.dispatchEvent(new PointerEvent('pointerup',{button:0,clientX:600,clientY:420,pointerId:11,bubbles:true}));
  key('keydown','KeyD');for(let i=0;i<10;i++){visitor.update();player.update(dt)}key('keyup','KeyD');
  check('player can look and walk inside elevator',visitor.ride.riding===lift && player.physics.position.distanceTo(cabinStart)>.2 && Math.abs(beforeLook.dot(camera.quaternion))<.999,{moved:player.physics.position.distanceTo(cabinStart),lookDot:beforeLook.dot(camera.quaternion),lift:visitor.ride.riding?.id});
  player.exit();
  const avatar=player.avatar;avatar.update(1,0);const standing=avatar.rig.pelvis.position.y;avatar.update(1,0,{crouch:true});
  check('articulated crouch pose',standing-avatar.rig.pelvis.position.y>.24 && avatar.rig.legs.every(l=>l.knee.rotation.x>.5),{pelvisDrop:standing-avatar.rig.pelvis.position.y,knee:avatar.rig.legs[0].knee.rotation.x});
  avatar.update(1,0);
  // Render-only inspection controls; absent on ordinary visits.
  const preview = document.createElement('div'); preview.style.cssText='position:fixed;top:10px;left:50%;z-index:110'; document.body.append(preview);
  const view=(label,fn)=>{const b=document.createElement('button'); b.textContent=label;b.onclick=()=>{fn();renderer.shadowMap.needsUpdate=true;D.post.render(0)};preview.append(b)};
  view('检查漫游人物',()=>{player.avatar.root.visible=true;player.avatar.root.position.set(16,.02,57);player.avatar.root.rotation.y=0;player.avatar.update(1,0);camera.position.set(17.3,1.3,60.7);camera.fov=32;camera.lookAt(16,1,57);camera.updateProjectionMatrix()});
  view('检查圆盘标线',()=>{player.avatar.root.visible=false;camera.position.set(27,1.3,3);camera.fov=55;camera.lookAt(23.7,0,0);camera.updateProjectionMatrix()});
  const markerBounds=new THREE.Box3();env.turntable.root.traverse(o=>{if(o.isMesh && o.material.name==='turntableAmberRing')markerBounds.expandByObject(o)});
  check('raised turntable marker',markerBounds.min.y>.008,{steelTop:0,markerBottom:markerBounds.min.y,markerTop:markerBounds.max.y});
  report.done=true; report.passed=report.checks.filter(c=>c.pass).length; report.failed=report.checks.filter(c=>!c.pass).length; save();
} catch(error) { report.error=error.stack; report.done=true; save(); }
