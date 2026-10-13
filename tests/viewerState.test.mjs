import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { normalizeJson } from '../src/data/normalizeJson.js';
import { createAppState } from '../src/data/state.js';
import { createVehicleMotion } from '../src/data/vehiclePath.js';
import { createVehicleVisual,getDemoVehiclePath } from '../src/vehicle.js';
import { buildSiteScene,disposeScene,findSiteRecord,setRecordHighlight,getViewPose } from '../src/siteScene.js';
import { FakeElement,fakeDocument,loadFunction,mainHarness } from './qaHarness.mjs';
const data=JSON.parse(await readFile(new URL('./fixtures/viewer_data_20261012_142857_140.json',import.meta.url),'utf8'));
const snapshot=()=>normalizeJson(data,{kind:'file',name:'latest.json'});

async function viewerHarness(){
 const document=fakeDocument(),window=new FakeElement(),models=[],vehicles=[],orbits=[],frames=new Map();
 let id=0,renderedCamera=null,rendererDisposals=0,observerDisposals=0;
 class Renderer {
  constructor(){this.domElement=new FakeElement('canvas');}
  setPixelRatio(){} setSize(){} render(scene,camera){renderedCamera=camera;}
  dispose(){rendererDisposals++;} forceContextLoss(){}
 }
 class Orbit {
  constructor(camera){this.camera=camera;this.target=new THREE.Vector3();this.events=new FakeElement();this.disposed=false;orbits.push(this);}
  addEventListener(...args){this.events.addEventListener(...args);}
  update(){this.camera.lookAt(this.target);}
  dispose(){this.disposed=true;this.events.listeners.clear();}
 }
 const api=await loadFunction('viewer.js',['mountSiteViewer'],{
  THREE:{...THREE,WebGLRenderer:Renderer},OrbitControls:Orbit,document,window,devicePixelRatio:1,
  ResizeObserver:class{observe(){}disconnect(){observerDisposals++;}},
  requestAnimationFrame:fn=>{frames.set(++id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id),
  buildSiteScene:s=>{const m=buildSiteScene(s);models.push(m);return m;},
  createVehicleVisual:(...args)=>{const v=createVehicleVisual(...args);vehicles.push(v);return v;},
  disposeScene,findSiteRecord,setRecordHighlight,getViewPose,getDemoVehiclePath,
 });
 const host=new FakeElement(),cache={saved:null},s=snapshot(),before=JSON.stringify(s);
 const mount=()=>api.mountSiteViewer(s,host,cache);
 const tick=time=>{const batch=[...frames.values()];frames.clear();batch.forEach(fn=>fn(time));};
 return {host,cache,s,before,mount,tick,models,vehicles,orbits,frames,document,window,
  get camera(){return renderedCamera;},get rendererDisposals(){return rendererDisposals;},get observerDisposals(){return observerDisposals;}};
}
test('Viewer real lifecycle: repeated re-entry restores crane/vehicle/camera after defaults, paused with no leaked listeners/RAF',async()=>{
 const h=await viewerHarness();let dispose=h.mount();const $=s=>h.host.querySelector(s);
 $('#vehicle-demo').checked=true;await $('#vehicle-demo').emit('change');
 $('#vehicle-speed').value='4.5';await $('#vehicle-speed').emit('input');
 await $('#vehicle-start').emit('click');await $('#auto-rotate').emit('click');h.tick(0);h.tick(100);
 assert.equal(h.frames.size,1);
 const records=h.models.at(-1).records,cranes=records.filter(r=>r.control);
 for(const [i,r] of cranes.entries()){r.control.setRotation(121.5+i*30);r.control.setTrolley(11+i);r.control.setHookHeight(r.control.minHookHeight+3+i);}
 $('#object-select').value=String(records.indexOf(cranes[2]));await $('#object-select').emit('change');
 await $('#auto-rotate').emit('click');
 $('#vehicle-direction').value='-1';await $('#vehicle-direction').emit('change');
 const orbit=h.orbits.at(-1);h.camera.position.set(200,150,180);orbit.target.set(60,10,50);h.camera.zoom=1.7;orbit.update();
 const vehicle=h.vehicles.at(-1),distance=vehicle.motion.distance,angle=cranes[2].control.angle;
 dispose();dispose();
 assert.equal(vehicle.motion.running,false);assert(cranes.every(r=>!r.control.autoRotating));
 assert.equal(h.frames.size,0);assert.equal(h.document.events.listenerCount(),0);assert.equal(h.window.listenerCount(),0);
 const expected=JSON.stringify(h.cache.saved);
 for(let i=0;i<3;i++){
  dispose=h.mount();
  assert.equal($('#vehicle-demo').checked,true);assert.equal($('#rotation-angle').value,angle);
  assert.equal(h.vehicles.at(-1).motion.distance,distance);assert.equal(h.vehicles.at(-1).motion.speed,4.5);assert.equal(h.vehicles.at(-1).motion.direction,-1);
  assert.equal(h.vehicles.at(-1).motion.running,false);assert.equal(h.frames.size,0);
  assert.deepEqual(h.camera.position.toArray(),[200,150,180]);assert.equal(h.camera.zoom,1.7);
  assert.deepEqual(h.orbits.at(-1).target.toArray(),[60,10,50]);
  assert(h.models.at(-1).records.filter(r=>r.control).every(r=>!r.control.autoRotating));
  dispose();assert.equal(JSON.stringify(h.cache.saved),expected);
  assert.equal(h.document.events.listenerCount(),0);assert.equal(h.window.listenerCount(),0);
 }
 dispose=h.mount();await $('#vehicle-start').emit('click');await $('#auto-rotate').emit('click');h.tick(200);h.tick(250);
 assert(h.vehicles.at(-1).motion.distance<distance);assert(h.models.at(-1).records.find(r=>r.id==='TC3').control.angle>angle);
 await $('#vehicle-reset').emit('click');assert.equal(h.vehicles.at(-1).motion.distance,0);assert.equal(h.vehicles.at(-1).motion.direction,1);assert.equal(h.vehicles.at(-1).motion.running,false);
 dispose();assert.equal(h.frames.size,0);assert(h.orbits.every(o=>o.disposed));
 assert.equal(h.rendererDisposals,5);assert.equal(h.observerDisposals,5);assert.equal(JSON.stringify(h.s),h.before);
});
test('Viewer orthographic camera, deselection, building height and radius visibility survive re-entry',async()=>{
 const h=await viewerHarness();let dispose=h.mount();const $=s=>h.host.querySelector(s);
 await h.host.querySelectorAll('[data-view]').find(b=>b.dataset.view==='Top').emit('click');
 const records=h.models.at(-1).records,building=records.find(r=>r.setHeight);
 $('#object-select').value=String(records.indexOf(building));await $('#object-select').emit('change');
 $('#building-height').value='.4';await $('#building-height').emit('input');
 $('#show-radius').checked=false;await $('#show-radius').emit('change');
 $('#object-select').value='';await $('#object-select').emit('change');
 h.camera.position.set(45,200,55);h.camera.zoom=2.5;h.orbits.at(-1).target.set(45,0,55);h.orbits.at(-1).update();
 dispose();dispose=h.mount();assert.equal(h.camera.isOrthographicCamera,true);assert.equal(h.camera.zoom,2.5);
 assert.deepEqual(h.camera.position.toArray(),[45,200,55]);assert.deepEqual(h.camera.up.toArray(),[0,0,-1]);
 assert.equal($('#object-select').value,'');assert.equal($('#rotation-controls').hidden,true);
 assert.equal(h.models.at(-1).records.find(r=>r.id===building.id).heightRatio,.4);
 assert(h.models.at(-1).records.filter(r=>r.radiusRing).every(r=>!r.radiusRing.visible));dispose();
});
test('App tabs/home retain checkpoint; only successful JSON replacement discards it, including late old disposal',async()=>{
 const h=await mainHarness(),s=snapshot();await h.app.request(async()=>s);
 const original=h.app.state.viewerState;original.saved={distance:12};
 for(let i=0;i<3;i++){await h.app.showResults('layout');await h.app.showResults('report');h.app.showHome();await h.app.showResults('viewer');assert.equal(h.seen.at(-1).persistence,original);}
 await h.app.request(async()=>{throw new Error('invalid input');});assert.equal(h.app.state.viewerState,original);
 await h.app.request(async()=>snapshot());const replacement=h.app.state.viewerState;
 assert.notEqual(replacement,original);assert.equal(replacement.saved,null);assert.equal(h.seen.at(-1).persistence,replacement);
 original.saved={distance:99};assert.equal(replacement.saved,null);h.app.showHome();
 const state=createAppState(),old=state.begin(),newer=state.begin();const cache=state.viewerState;
 assert.equal(state.commit(old,s),false);assert.equal(state.viewerState,cache);assert.equal(state.commit(newer,s),true);assert.notEqual(state.viewerState,cache);
});
test('Vehicle restoration validates/clamps checkpoint, remains paused, resumes distance and retains explicit reset',()=>{
 const path=getDemoVehiclePath(),motion=createVehicleMotion(path);
 motion.restore({distance:12,speed:3,direction:-1});motion.advance(2);assert.equal(motion.distance,12);assert.equal(motion.running,false);
 motion.start();motion.advance(2);assert.equal(motion.distance,6);motion.stop();
 motion.restore({distance:1e6,speed:100,direction:1});assert.equal(motion.distance,path.length);assert.equal(motion.speed,10);motion.start();assert.equal(motion.running,false);
 assert.throws(()=>motion.restore({distance:NaN,speed:3,direction:1}));assert.throws(()=>motion.restore({distance:1,speed:3,direction:0}));
 motion.reset();assert.equal(motion.distance,0);assert.equal(motion.direction,1);assert.equal(motion.running,false);
});
test('WebGL failure during re-entry does not overwrite the saved checkpoint',async()=>{
 const h=await viewerHarness();h.mount()();const saved=h.cache.saved;
 const api=await loadFunction('viewer.js',['mountSiteViewer'],{THREE:{...THREE,WebGLRenderer:class{constructor(){throw new Error('unavailable');}}},
 buildSiteScene,disposeScene,document:fakeDocument(),cancelAnimationFrame:()=>{}});
 assert.throws(()=>api.mountSiteViewer(h.s,new FakeElement(),h.cache),/unavailable/);assert.equal(h.cache.saved,saved);
});
test('Fresh JSON checkpoint starts at original crane/camera defaults with DEMO off',async()=>{
 const h=await viewerHarness();let dispose=h.mount();
 h.host.querySelector('#vehicle-demo').checked=true;await h.host.querySelector('#vehicle-demo').emit('change');
 h.models.at(-1).records.find(r=>r.id==='TC1').control.setRotation(275);dispose();
 h.cache.saved=null;dispose=h.mount();
 assert.equal(h.host.querySelector('#vehicle-demo').checked,false);
 assert.equal(h.models.at(-1).records.find(r=>r.id==='TC1').control.angle,194);
 assert.equal(h.host.querySelector('#object-select').value,String(h.models.at(-1).records.findIndex(r=>r.id==='TC1')));
 assert.equal(h.frames.size,0);assert.equal(h.camera.zoom,1);dispose();
});
