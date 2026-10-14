import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { loadLocalJson } from '../src/data/loadLocalJson.js';
import { normalizeJson } from '../src/data/normalizeJson.js';
import { collectVehiclePaths,sampleVehiclePath } from '../src/data/vehiclePath.js';
import { createVehicleVisual,getDemoVehiclePath } from '../src/vehicle.js';
import { buildSiteScene,disposeScene,findSiteRecord,setRecordHighlight,getViewPose } from '../src/siteScene.js';
import { FakeElement,fakeDocument,loadFunction } from './qaHarness.mjs';

const close=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const jsonPath=process.env.SITEFLOW_VEHICLE_JSON;
// Private GH output stays outside fixtures/public/dist. Run explicitly against the real file.
const text=jsonPath?await readFile(jsonPath,'utf8'):null;
const input=text?JSON.parse(text):null;
const real={skip:!jsonPath};
const loadReal=()=>loadLocalJson({name:'viewer_data_20261014_114047_920.json',size:Buffer.byteLength(text),text:async()=>text});

test('real v1.6 JSON loads two exact centerlines separately from declared routes and DEMO',real,async()=>{
  const s=await loadReal();
  assert.equal(s.source.kind,'file');assert.equal(s.data.schema.version,'2.0.0');
  assert.equal(s.routes.status,'missing');assert.equal(s.routes.actualPaths.length,0);assert.equal(s.routes.demoPaths.length,0);
  assert.equal(s.routes.centerlinePaths.length,2);assert(s.missing.includes('roads.vehicle_paths'));
  for(const [i,path] of s.routes.centerlinePaths.entries()) {
    const raw=input.roads.centerlines[i];
    assert.equal(raw.vehicle_enabled,false);assert.equal(raw.source_kind,undefined);
    assert.equal(path.source_kind,undefined);assert.equal(path.path_kind,'centerline');
    assert.equal(path.source_field,`roads.centerlines[${i}]`);
    assert.deepEqual(path.points.slice(0,raw.points.length),raw.points);
    assert.equal(path.points.length,raw.points.length+(raw.closed?1:0));
    assert(Object.isFrozen(path.points[0]));
  }
  const [ring,entry]=s.routes.centerlinePaths;
  assert.equal(ring.id,'ROAD-001');assert.equal(ring.closed,true);close(ring.length,232.03346846234203);
  assert.equal(entry.id,'ROAD-002');assert.equal(entry.closed,false);close(entry.length,51.17119660395842);
  assert.deepEqual(ring.points.at(-1),ring.points[0]);assert.deepEqual(entry.points[0],input.site.gate);
  // Entry terminates within ring segment 15, not at a ring vertex. Do not synthesize a route through it.
  const end=new THREE.Vector3(...['x','y','z'].map(k=>entry.points[1][k]));
  const segment=ring.segments[15],a=new THREE.Vector3(...['x','y','z'].map(k=>segment.a[k]));
  const b=new THREE.Vector3(...['x','y','z'].map(k=>segment.b[k]));
  const nearest=new THREE.Line3(a,b).closestPointToPoint(end,true,new THREE.Vector3());
  close(nearest.distanceTo(end),0);assert(!end.equals(a)&&!end.equals(b));
  assert.deepEqual(s.data,input);assert.equal(await readFile(jsonPath,'utf8'),text);
});

test('real ring and entry: start/stop, every segment pose/yaw, reverse, endpoint stop and reset',real,async()=>{
  const s=await loadReal();
  for(const path of s.routes.centerlinePaths) {
    const v=createVehicleVisual(path),m=v.motion;
    assert.equal(v.root.name,'JSON Vehicle Path Layer');assert.equal(m.running,false);
    m.start();m.advance(1);v.sync();close(m.distance,2);
    m.stop();m.advance(10);close(m.distance,2);
    for(const segment of path.segments) {
      const distance=(segment.start+segment.end)/2;
      m.restore({distance,speed:2,direction:1});v.sync();
      for(const key of ['x','y','z'])close(v.car.position[key],(segment.a[key]+segment.b[key])/2);
      close(v.car.rotation.y,Math.atan2(segment.tangent.x,segment.tangent.z));
      const yaw=v.car.rotation.y;m.setDirection(-1);m.start();m.advance(.01);v.sync();
      close(m.distance,distance-.02);close(v.car.rotation.y,yaw);
      const expected=sampleVehiclePath(path,m.distance,-1).position;
      for(const key of ['x','y','z'])close(v.car.position[key],expected[key]);
      assert.equal(v.car.position.y,0); // No terrain/Z correction.
    }
    m.setDirection(1);m.start();m.advance(1000);v.sync();
    assert.equal(m.distance,path.length);assert.equal(m.running,false);assert.equal(m.status,'ended');
    for(const key of ['x','y','z'])close(v.car.position[key],path.points.at(-1)[key]);
    m.setDirection(-1);m.start();m.advance(1000);v.sync();
    assert.equal(m.distance,0);assert.equal(m.running,false);assert.equal(m.status,'ended');
    m.reset();assert.equal(m.direction,1);assert.equal(m.running,false);v.dispose();
  }
});

test('centerline preview rejects invalid geometry, duplicate IDs and DEMO/unknown provenance; no surroundings fallback',()=>{
  const a={x:0,y:0,z:0},b={x:2,y:0,z:0};
  const path={id:'R',vehicle_enabled:false,closed:false,points:[a,b]};
  for(const roads of [undefined,{centerlines:[]},{centerlines:'bad'},{centerlines:[{...path,points:[a]}]},
    {centerlines:[{...path,points:[a,a]}]},{centerlines:[{...path,points:[a,{...b,x:'2'}]}]},
    {centerlines:[{...path,source_kind:'demo'}]},{centerlines:[{...path,source_kind:'unknown'}]}]) {
    const inventory=collectVehiclePaths({roads,surroundings:{roads:{items:[path]}}});
    assert.equal(inventory.centerlinePaths.length,0);assert.equal(inventory.actualPaths.length,0);assert.equal(inventory.demoPaths.length,0);
  }
  const inventory=collectVehiclePaths({roads:{centerlines:[path,path]}});
  assert.equal(inventory.centerlinePaths.length,1);assert(inventory.warnings.some(w=>w.includes('중복')));
});

async function harness(snapshot) {
  const document=fakeDocument(),window=new FakeElement(),host=new FakeElement(),vehicles=[],frames=new Map();
  let id=0,scene;
  class Renderer {
    constructor(){this.domElement=new FakeElement('canvas');}
    setPixelRatio(){} setSize(){} render(value){scene=value;} dispose(){} forceContextLoss(){}
  }
  class Orbit {
    constructor(camera){this.camera=camera;this.target=new THREE.Vector3();}
    addEventListener(){} update(){this.camera.lookAt(this.target);} dispose(){}
  }
  const api=await loadFunction('viewer.js',['mountSiteViewer'],{
    THREE:{...THREE,WebGLRenderer:Renderer},OrbitControls:Orbit,document,window,devicePixelRatio:1,
    ResizeObserver:class{observe(){}disconnect(){}},
    requestAnimationFrame:fn=>{frames.set(++id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id),
    buildSiteScene,disposeScene,findSiteRecord,setRecordHighlight,getViewPose,getDemoVehiclePath,
    createVehicleVisual:(...args)=>{const v=createVehicleVisual(...args);vehicles.push(v);return v;},
  });
  const cache={saved:null};
  return {host,vehicles,frames,cache,get scene(){return scene;},
    mount:()=>api.mountSiteViewer(snapshot,host,cache),
    tick(time){const batch=[...frames.values()];frames.clear();batch.forEach(fn=>fn(time));}};
}

test('real JSON viewer controls and RAF drive exactly one actual car; mode switch and re-entry keep DEMO explicit',real,async()=>{
  const s=await loadReal(),before=JSON.stringify(s),h=await harness(s);
  let dispose=h.mount();const $=selector=>h.host.querySelector(selector);
  assert.equal($('#vehicle-demo').checked,false);assert.equal($('#vehicle-centerline').checked,true);
  assert.equal($('#vehicle-centerline-note').hidden,false);assert.equal($('.demo-badge').hidden,true);
  assert.equal(h.vehicles.length,1);assert.equal(h.vehicles[0].motion.path.id,'ROAD-001');
  assert.equal($('#vehicle-route').children.length,2);assert.equal(h.frames.size,0);
  await $('#vehicle-start').emit('click');h.tick(0);h.tick(100);
  const first=h.vehicles.at(-1);close(first.motion.distance,.2);assert.match($('#vehicle-state').textContent,/JSON 중심선 미리보기/);
  await $('#vehicle-stop').emit('click');h.tick(200);close(first.motion.distance,.2);
  $('#vehicle-direction').value='-1';await $('#vehicle-direction').emit('change');
  await $('#vehicle-start').emit('click');h.tick(300);h.tick(400);close(first.motion.distance,0);
  assert.equal(first.motion.running,false);
  $('#vehicle-route').value='1';await $('#vehicle-route').emit('change');
  assert.equal(first.motion.status,'disposed');assert.equal(first.root.parent,null);
  assert.equal(h.vehicles.at(-1).motion.path.id,'ROAD-002');
  assert.equal(h.scene.children.filter(o=>o.name==='JSON Vehicle Path Layer').length,1);
  await $('#vehicle-start').emit('click');h.tick(500);h.tick(600);
  close(h.vehicles.at(-1).motion.distance,.2);
  dispose();assert.equal(h.frames.size,0);dispose=h.mount();
  assert.equal(h.vehicles.at(-1).motion.path.id,'ROAD-002');close(h.vehicles.at(-1).motion.distance,.2);
  assert.equal(h.vehicles.at(-1).motion.running,false);assert.equal($('#vehicle-demo').checked,false);
  $('#vehicle-demo').checked=true;await $('#vehicle-demo').emit('change');
  assert.equal($('#vehicle-centerline').checked,false);assert.equal($('.demo-badge').hidden,false);
  assert.equal(h.vehicles.at(-1).motion.path.id,'DEMO-only');
  $('#vehicle-demo').checked=false;await $('#vehicle-demo').emit('change');
  assert.equal($('#vehicle-start').disabled,true);assert.match($('#vehicle-state').textContent,/주행 불가/);
  assert.equal(h.scene.children.filter(o=>o.name.includes('Vehicle Path Layer')||o.name==='DEMO Vehicle Layer').length,0);
  $('#vehicle-centerline').checked=true;await $('#vehicle-centerline').emit('change');
  assert.equal(h.vehicles.at(-1).motion.path.id,'ROAD-001');assert.equal($('#vehicle-demo').checked,false);
  dispose();assert.equal(JSON.stringify(s),before);assert.equal(await readFile(jsonPath,'utf8'),text);
});

test('real JSON with no usable site road disables driving and never auto-enables DEMO',real,async()=>{
  for(const roads of [undefined,{centerlines:[{id:'bad',points:[]}]}]) {
    const d=structuredClone(input);d.roads=roads;
    const h=await harness(normalizeJson(d)),dispose=h.mount(),$=selector=>h.host.querySelector(selector);
    assert.equal(h.vehicles.length,0);assert.equal($('#vehicle-demo').checked,false);
    assert.equal($('#vehicle-start').disabled,true);assert.equal($('#vehicle-route').disabled,true);
    assert.match($('#vehicle-path-status').textContent,/실제 JSON 주행 불가/);assert.match($('#vehicle-state').textContent,/주행 불가/);
    assert.equal(h.frames.size,0);dispose();
  }
});
