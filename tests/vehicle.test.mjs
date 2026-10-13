import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { compileVehiclePath,collectVehiclePaths,createVehicleMotion,sampleVehiclePath } from '../src/data/vehiclePath.js';
import { normalizeJson } from '../src/data/normalizeJson.js';
import { createVehicleVisual,getDemoVehiclePath } from '../src/vehicle.js';
import { buildSiteScene,disposeScene } from '../src/siteScene.js';
const data=JSON.parse(await readFile(new URL('./fixtures/viewer_data_20261012_142857_140.json',import.meta.url),'utf8'));
const raw={id:'GH-test-only',source_kind:'gh',points:[{x:0,y:0,z:0},{x:3,y:0,z:0},{x:3,y:0,z:4}]};
const close=(a,b)=>assert(Math.abs(a-b)<1e-8,a+' != '+b);
test('actual sample stays missing, no DEMO injected into snapshot or scene records',()=>{
 const s=normalizeJson(data),roads=collectVehiclePaths(s.data),before=JSON.stringify(s.data);
 assert.equal(roads.status,'missing');assert.equal(roads.actualPaths.length,0);assert.equal(s.routes.actualPaths.length,0);
 assert(s.missing.includes('roads.vehicle_paths'));assert.equal(s.data.roads,undefined);
 const model=buildSiteScene(s),demo=createVehicleVisual(getDemoVehiclePath(),true);
 assert.equal(model.records.filter(r=>r.control).length,3);assert.equal(model.records.filter(r=>r.kind==='실제 자재 박스').length,6);
 assert(!model.records.some(r=>r.id.includes('DEMO')));demo.motion.start();demo.motion.advance(1);demo.sync();
 assert.equal(JSON.stringify(s.data),before);assert.equal(demo.root.name,'DEMO Vehicle Layer');demo.dispose();disposeScene(model.root);
});
test('road absence, empty, one point, bad coordinates and duplicate zero-length points',()=>{
 assert.equal(collectVehiclePaths({roads:{vehicle_paths:[]}}).status,'empty');
 for(const points of [[],[{x:0,y:0,z:0}],[{x:0,y:0,z:0},{x:'3',y:0,z:0}],[{x:0,y:0,z:0},{x:Infinity,y:0,z:0}],[{x:0,y:0,z:0},{x:0,y:0,z:0}]]) {
  assert.throws(()=>compileVehiclePath({...raw,points}));
 }
 const bad=collectVehiclePaths({roads:{vehicle_paths:[{...raw,points:[{x:0,y:0,z:0}]}]}});
 assert.equal(bad.status,'invalid');assert.equal(bad.actualPaths.length,0);assert(bad.warnings.length);
 const d=structuredClone(data);d.roads={vehicle_paths:[{...raw,points:[{x:0,y:0,z:0},{x:'bad',y:0,z:0}]}]};assert.equal(normalizeJson(d).routes.status,'invalid');
 const duplicate=compileVehiclePath({...raw,points:[raw.points[0],raw.points[0],...raw.points.slice(1)]});assert.equal(duplicate.length,7);
});
test('distance-based multi-segment motion, corner tangent, reverse and endpoint stop',()=>{
 const path=compileVehiclePath(raw),m=createVehicleMotion(path);assert.equal(path.length,7);
 m.setSpeed(2);m.start();m.advance(2);assert.equal(m.distance,4);assert.deepEqual(m.pose.position,{x:3,y:0,z:1});
 assert.deepEqual(m.pose.tangent,{x:0,y:0,z:1});
 m.setDirection(-1);m.advance(.75);close(m.distance,2.5);assert.deepEqual(m.pose.position,{x:2.5,y:0,z:0});
 m.advance(100);assert.equal(m.distance,0);assert.equal(m.running,false);assert.equal(m.status,'ended');
 m.setDirection(1);m.start();m.advance(100);assert.equal(m.distance,7);assert.equal(m.running,false);assert.deepEqual(m.pose.position,raw.points[2]);
 m.setDirection(-1);m.start();m.advance(.5);assert.equal(m.distance,6);
 m.stop();m.advance(10);assert.equal(m.distance,6);m.reset();assert.equal(m.distance,0);assert.equal(m.direction,1);assert.equal(m.running,false);
});
test('frame rate independent distance, speed zero, control validation and disposal',()=>{
 const p=compileVehiclePath(raw),a=createVehicleMotion(p),b=createVehicleMotion(p);a.start();b.start();
 a.advance(1);for(let i=0;i<60;i++)b.advance(1/60);close(a.distance,b.distance);
 a.setSpeed(0);a.start();assert.equal(a.running,false);
 assert.throws(()=>a.setSpeed(NaN));assert.throws(()=>a.setDirection(0));
 b.dispose();const before=b.distance;b.advance(10);b.start();assert.equal(b.distance,before);assert.equal(b.running,false);assert.equal(b.status,'disposed');
});
test('provenance separation and explicitly enabled centerline only',()=>{
 const result=collectVehiclePaths({roads:{vehicle_paths:[raw,{...raw,id:'demo',source_kind:'demo'},{...raw,id:'unknown',source_kind:undefined}]}});
 assert.equal(result.actualPaths.length,1);assert.equal(result.demoPaths.length,1);assert.equal(result.warnings.length,1);
 assert.equal(collectVehiclePaths({roads:{centerlines:[raw]}}).actualPaths.length,0);
 assert.equal(collectVehiclePaths({roads:{centerlines:[{...raw,vehicle_enabled:true}]}}).actualPaths.length,1);
 const d=structuredClone(data);d.roads={vehicle_paths:[raw]};const s=normalizeJson(d);assert.equal(s.routes.actualPaths.length,1);assert(Object.isFrozen(s.routes.actualPaths[0].points[0]));assert.deepEqual(s.data.roads.vehicle_paths[0],raw);
});
test('closed route has closing segment but stops, Y coordinates preserved and vertical route rejected',()=>{
 const p=compileVehiclePath({...raw,closed:true});assert.equal(p.length,12);
 const m=createVehicleMotion(p);m.start();m.advance(100);assert.equal(m.running,false);assert.deepEqual(m.pose.position,raw.points[0]);
 const slope=compileVehiclePath({...raw,points:[{x:0,y:2,z:0},{x:3,y:6,z:0}]});assert.equal(slope.length,5);assert.deepEqual(sampleVehiclePath(slope,2.5).position,{x:1.5,y:4,z:0});
 assert.throws(()=>compileVehiclePath({...raw,points:[{x:0,y:0,z:0},{x:0,y:1,z:0}]}),/수직/);
});
test('visual follows exact route, reverse does not create turn-around, dispose and rebuild',()=>{
 const path=compileVehiclePath(raw),v=createVehicleVisual(path),before=JSON.stringify(raw);
 v.motion.start();v.motion.advance(1);v.sync();assert.deepEqual(v.car.position.toArray(),[2,0,0]);close(v.car.rotation.y,Math.PI/2);
 v.motion.setDirection(-1);v.motion.advance(.5);v.sync();assert.deepEqual(v.car.position.toArray(),[1,0,0]);close(v.car.rotation.y,Math.PI/2);
 assert.equal(JSON.stringify(raw),before);let disposed=0;v.line.geometry.addEventListener('dispose',()=>disposed++);
 v.dispose();assert.equal(v.root.children.length,0);assert.equal(disposed,1);assert.equal(v.motion.status,'disposed');
 const next=createVehicleVisual(path);assert.equal(next.motion.distance,0);next.dispose();
});
