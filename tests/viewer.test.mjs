import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { normalizeJson } from '../src/data/normalizeJson.js';
import { buildSiteScene,disposeScene,setRecordHighlight,findSiteRecord,getViewPose } from '../src/siteScene.js';
import { createCrane,setCraneRotation,createCraneController } from '../src/crane.js';
const raw=await readFile(new URL('./fixtures/viewer_data_20261012_142857_140.json',import.meta.url),'utf8');
const data=JSON.parse(raw);
const close=(a,b)=>assert(Math.abs(a-b)<1e-4, a+' != '+b);
test('actual snapshot renders only 3 final cranes, 6 corner boxes, 3 footprints and actual site',()=>{
 const snap=normalizeJson(data), model=buildSiteScene(snap);
 assert.equal(model.records.filter(r=>r.control).length,3); assert.equal(model.records.filter(r=>r.kind==='실제 자재 박스').length,6);
 assert.equal(model.records.filter(r=>r.kind==='건물').length,3);
 assert(model.records.some(r=>r.id==='site.boundary')); assert(model.records.some(r=>r.id==='site.gate'));
 assert.equal(model.records.filter(r=>r.kind==='금지구역').length,data.site.no_go.length);
 assert.deepEqual(model.records.filter(r=>r.control).map(r=>r.id),['TC1','TC2','TC3']);
 assert.equal(snap.summary.errors.length,4); assert.equal(snap.summary.materialBoxes,6); assert.equal(snap.summary.candidates,42);
 for(const r of model.records.filter(r=>r.control)) {
   assert.deepEqual(r.object.position.toArray(),[r.data.position.x,r.data.position.y,r.data.position.z]);
   assert.equal(r.control.radius,r.data.working_radius_m);
   assert.equal(r.radiusRing.geometry.attributes.position.count,128);
   close(Math.hypot(...[r.radiusRing.geometry.attributes.position.getX(0),r.radiusRing.geometry.attributes.position.getZ(0)]),r.data.working_radius_m);
 }
 for(const r of model.records.filter(r=>r.kind==='실제 자재 박스')) {
   const p=r.object.geometry.attributes.position;
   r.data.corners.forEach((c,i)=>{close(p.getX(i),c.x);close(p.getY(i),c.y);close(p.getZ(i),c.z);});
 }
 for(const r of model.records.filter(r=>r.kind==='건물')) {
   const b=new THREE.Box3().setFromObject(r.object); close(b.max.y-b.min.y,r.data.current_height_m);
   close(b.min.x,Math.min(...r.data.footprint.points.map(p=>p.x)));close(b.min.z,Math.min(...r.data.footprint.points.map(p=>p.z)));
 }
 assert.deepEqual(snap.data,data); assert(model.omitted.some(s=>s.includes('도로')));
 disposeScene(model.root);
});
test('each crane independent rotation/trolley/hoist, bounds and immutable source',()=>{
 const snapshot=normalizeJson(data), model=buildSiteScene(snapshot);
 for(const r of model.records.filter(r=>r.control)) {
   const c=r.control,original=JSON.stringify(r.data);
   close(c.angle,((r.data.base_direction_degrees_rhino%360)+360)%360);
   c.setRotation(90);close(r.object.getObjectByName('Rotating Upper').rotation.y,Math.PI/2);
   c.setTrolley(1e4);close(c.trolleyDistance,r.data.working_radius_m);close(r.object.getObjectByName('Trolley').position.z,r.data.working_radius_m);
   c.setHookHeight(c.minHookHeight);close(c.hookHeight,c.minHookHeight);
   model.root.updateMatrixWorld(true);close(r.object.getObjectByName('Hook').getWorldPosition(new THREE.Vector3()).y,c.hookHeight);
   c.setCableLength(1e4);close(c.cableLength,c.maxCableLength);
   c.setRotation(361);close(c.angle,1);assert.equal(JSON.stringify(r.data),original);
 }
 const a=model.records.find(r=>r.id==='TC1'),b=model.records.find(r=>r.id==='TC2');a.control.setRotation(45);close(b.control.angle,1);
 disposeScene(model.root);
});
test('TC1 legacy clamp and hierarchy preserved',()=>{
 const crane=createCrane(data.cranes[0]);assert.equal(setCraneRotation(crane,400),360);
 assert.equal(setCraneRotation(crane,-1),0);assert.throws(()=>setCraneRotation(crane,NaN));
 for(const name of ['Fixed Tower','Rotating Upper','Jib','Trolley','Wire','Hook'])assert(crane.getObjectByName(name));
 const c=createCraneController(crane,data.cranes[0]);c.setTrolley(10);assert.equal(crane.getObjectByName('Hook').parent,crane.getObjectByName('Trolley'));
 disposeScene(crane);
});
test('building visual height anchored at original floor, selection/hilite not mutating JSON',()=>{
 const model=buildSiteScene(normalizeJson(data)),r=model.records.find(r=>r.kind==='건물');
 const floor=new THREE.Box3().setFromObject(r.object).min.y;r.setHeight(.5);const b=new THREE.Box3().setFromObject(r.object);
 close(b.min.y,floor);close(b.max.y-b.min.y,r.data.current_height_m*.5);assert.equal(r.data.current_height_m,data.buildings[0].current_height_m);
 const mesh=r.object.children[0],color=mesh.material.color.clone();
 setRecordHighlight(r,true);assert(!mesh.material.color.equals(color));setRecordHighlight(r,false);assert(mesh.material.color.equals(color));assert.equal(findSiteRecord(mesh),r);
 disposeScene(model.root);
});
test('camera 4 views and aspect fit, disposal and replacement',()=>{
 const model=buildSiteScene(normalizeJson(data));
 for(const view of ['Top','Front','Side','Free'])for(const aspect of [.5,2]) {
   const p=getViewPose(model.bounds,view,aspect);assert(p.distance>p.radius);assert.equal(p.orthographic,view==='Top');assert(p.position.toArray().every(Number.isFinite));
 }
 let geometryDisposed=0,materialDisposed=0;
 const mesh=model.records.find(r=>r.kind==='실제 자재 박스').object;
 mesh.geometry.addEventListener('dispose',()=>geometryDisposed++);mesh.material.addEventListener('dispose',()=>materialDisposed++);
 disposeScene(model.root);assert.equal(model.root.children.length,0);assert.equal(geometryDisposed,1);assert.equal(materialDisposed,1);
 const replacement=buildSiteScene(normalizeJson(data));assert.equal(replacement.records.filter(r=>r.control).length,3);disposeScene(replacement.root);
});
test('missing crane values skipped; no invented objects; TC1 legacy sample still renders',async()=>{
 const partial=structuredClone(data);partial.cranes[1].position=null;const model=buildSiteScene(normalizeJson(partial));
 assert.equal(model.records.filter(r=>r.control).length,2);assert(model.omitted.some(s=>s.includes('TC2')));disposeScene(model.root);
 const legacy=JSON.parse(await readFile(new URL('../public/data/viewer_data.json',import.meta.url),'utf8'));
 const preview=buildSiteScene(normalizeJson(legacy));assert.equal(preview.records.filter(r=>r.control).length,1);disposeScene(preview.root);
});

test('CPU raycast resolves mesh to exact selectable object; snapshot source remains frozen',()=>{
 const snapshot=normalizeJson(data), model=buildSiteScene(snapshot);
 const material=model.records.find(r=>r.kind==='실제 자재 박스');
 model.root.updateMatrixWorld(true);
 const center=new THREE.Box3().setFromObject(material.object).getCenter(new THREE.Vector3());
 const ray=new THREE.Raycaster(center.clone().add(new THREE.Vector3(0,100,0)),new THREE.Vector3(0,-1,0));
 const hits=ray.intersectObject(material.object,true);assert(hits.length>0);assert.equal(findSiteRecord(hits[0].object),material);
 assert(Object.isFrozen(material.data));assert(Object.isFrozen(material.data.corners[0]));
 disposeScene(model.root);
});
