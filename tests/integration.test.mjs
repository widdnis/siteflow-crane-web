import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { normalizeJson } from '../src/data/normalizeJson.js';
import { loadLocalJson } from '../src/data/loadLocalJson.js';
import { loadJsonUrl } from '../src/data/loadJsonUrl.js';
import { buildSiteScene,disposeScene,findSiteRecord,setRecordHighlight,getViewPose } from '../src/siteScene.js';
import { createVehicleVisual,getDemoVehiclePath } from '../src/vehicle.js';
import { buildLayoutModel,renderLayoutCanvas } from '../src/layout.js';
import { buildReportModel,renderReportHtml,createReportLayout } from '../src/report.js';
import { mainHarness,deferred,flush,FakeElement,fakeDocument,loadFunction } from './qaHarness.mjs';
const text=await readFile(new URL('./fixtures/viewer_data_20261012_142857_140.json',import.meta.url),'utf8');
const data=JSON.parse(text);
const snapshot=()=>normalizeJson(data,{kind:'file',name:'latest.json'});

test('API-simulated UI: cancellation during deferred Viewer import returns home and blocks stale mount',async()=>{
 const h=await mainHarness(),gate=deferred();h.modules.set('viewer',gate.promise);
 const pending=h.app.request(async()=>snapshot());await flush();
 assert.equal(h.nodes.get('results').hidden,false);await h.nodes.get('cancel').emit('click');
 assert.equal(h.app.state.ui.screen,'home');assert.equal(h.nodes.get('home').hidden,false);assert.equal(h.nodes.get('results').hidden,true);
 assert.equal(h.nodes.get('resume').hidden,false);gate.resolve(h.mounts);await pending;
 assert.equal(h.counts.mounted.viewer??0,0);assert.equal(h.app.state.ui.loading,false);
});
test('API-simulated UI: first invalid input must not claim a previous valid snapshot exists',async()=>{
 const h=await mainHarness();await h.app.request(async()=>{throw new Error('bad JSON');});
 assert.equal(h.app.state.snapshot,null);assert(h.nodes.get('load-status').textContent.includes('유효한 데이터가 아직 없습니다'));
 assert.equal(h.nodes.get('load-error').hidden,false);assert.equal(h.nodes.get('home').hidden,false);
});
test('API-simulated UI: repeated tabs/home balance disposers and mount the identical frozen snapshot',async()=>{
 const h=await mainHarness(),s=snapshot();await h.app.request(async()=>s);
 for(let i=0;i<3;i++){await h.app.showResults('layout');await h.app.showResults('report');assert(h.document.body.classList.contains('report-active'));h.app.showHome();assert(!h.document.body.classList.contains('report-active'));await h.app.showResults('viewer');}
 h.app.showHome();
 for(const tab of ['viewer','layout','report'])assert.equal(h.counts.mounted[tab],h.counts.disposed[tab]);
 assert(h.seen.every(({snapshot:seen})=>seen===s&&Object.isFrozen(seen.data)));
 assert.equal(h.nodes.get('viewer-host').children.length,0);assert.equal(h.nodes.get('layout-host').children.length,0);assert.equal(h.nodes.get('report-host').children.length,0);
});
test('API-simulated UI: out-of-order JSON/import responses cannot overwrite newer snapshot/tab',async()=>{
 const h=await mainHarness(),old=deferred(),s=snapshot(),pending=h.app.request(()=>old.promise);
 const fresh=normalizeJson({...data,materials:[]},{kind:'file',name:'replacement.json'});
 await h.app.request(async()=>fresh);old.resolve(s);await pending;assert.equal(h.app.state.snapshot,fresh);
 const gate=deferred();h.modules.set('layoutView',gate.promise);const layout=h.app.showResults('layout');await flush();await h.app.showResults('report');gate.resolve(h.mounts);await layout;
 assert.equal(h.app.state.ui.tab,'report');assert.equal(h.counts.mounted.layout??0,0);h.app.showHome();
});
test('API-simulated UI: WebGL mount error leaves snapshot and other tabs usable',async()=>{
 const h=await mainHarness();h.failure.viewer='WebGL unavailable';
 await h.app.request(async()=>snapshot());assert.equal(h.nodes.get('viewer-error').hidden,false);assert(h.nodes.get('viewer-error').textContent.includes('WebGL unavailable'));
 assert.equal(h.app.state.snapshot.summary.finalCranes,3);await h.app.showResults('layout');assert.equal(h.counts.mounted.layout,1);h.app.showHome();
});
test('same real data via file/URL reaches 3D/Canvas/report with 42/3/6/4, no conversions or DEMO data',async()=>{
 const file=await loadLocalJson({name:'local.json',size:text.length,text:async()=>text});
 const url=await loadJsonUrl('https://example.com/input.json',{fetcher:async()=>new Response(text)});
 assert.deepEqual(file.data,url.data);const before=JSON.stringify(file.data);
 const scene=buildSiteScene(file),layout=buildLayoutModel(file),report=buildReportModel(file);
 assert.equal(scene.records.filter(r=>r.control).length,3);assert.equal(layout.counts.cranes,3);assert.equal(report.summary.cranes,3);
 assert.equal(scene.records.filter(r=>r.kind==='실제 자재 박스').length,6);assert.equal(layout.counts.materials,6);assert.equal(report.summary.materials,6);
 assert.equal(file.summary.candidates,42);assert.equal(report.candidateRows.length,42);assert.equal(layout.ghErrors.length,4);assert.equal(report.errors.length,4);assert(file.missing.length);
 const demo=createVehicleVisual(getDemoVehiclePath(),true),tc=scene.records.find(r=>r.id==='TC2');
 demo.motion.start();demo.motion.advance(1);demo.sync();tc.control.setRotation(123);tc.control.setTrolley(20);tc.control.setHookHeight(tc.control.minHookHeight);
 assert(demo.motion.running);assert.equal(tc.control.angle,123);assert.equal(JSON.stringify(file.data),before);assert.equal(buildLayoutModel(file).demoIncluded,false);assert(!renderReportHtml(report).includes('DEMO-only'));
 demo.dispose();disposeScene(scene.root);
});
test('API-simulated WebGL constructor failure disposes real geometries and clears Viewer host',async()=>{
 const doc=fakeDocument(),host=new FakeElement(),roots=[];
 const api=await loadFunction('viewer.js',['mountSiteViewer'],{THREE:{...THREE,WebGLRenderer:class{constructor(){throw new Error('WebGL disabled');}}},
  buildSiteScene,disposeScene:root=>{roots.push(root);disposeScene(root);},findSiteRecord,setRecordHighlight,getViewPose,
  createVehicleVisual,getDemoVehiclePath,document:doc,devicePixelRatio:1,cancelAnimationFrame:()=>{}});
 assert.throws(()=>api.mountSiteViewer(snapshot(),host),/WebGL disabled/);
 assert.equal(roots.length,1);assert.equal(roots[0].children.length,0);assert.equal(host.nodes.length,0);assert(!host.classList.contains('site-viewer'));
});
test('API-simulated Canvas: leaving while fonts are pending prevents stale PNG generation',async()=>{
 const fonts=deferred(),doc=fakeDocument(),host=new FakeElement();doc.fonts.ready=fonts.promise;let generated=0;
 const api=await loadFunction('layoutView.js',['mountLayoutView'],{document:doc,renderLayoutCanvas,createLayoutPng:async()=>{generated++;return {blob:new Blob(['mock'],{type:'image/png'}),filename:'mock.png'};}});
 const dispose=api.mountLayoutView(snapshot(),host),pending=host.querySelector('#layout-download').emit('click');
 dispose();fonts.resolve();await pending;assert.equal(generated,0);assert.equal(host.nodes.length,0);
});
test('API-simulated Report: PNG image preparation, print events/details and Blob cleanup',async()=>{
 const doc=fakeDocument(),win=new FakeElement(),host=new FakeElement();let created=0,revoked=0,printed=0;
 win.print=()=>{printed++;};
 const api=await loadFunction('reportView.js',['mountReportView'],{document:doc,window:win,buildReportModel,renderReportHtml,createReportLayout:async()=>({blob:new Blob(['API mock'],{type:'image/png'})}),
  URL:{createObjectURL:()=>{created++;return 'blob:mock';},revokeObjectURL:()=>{revoked++;}}});
 const dispose=api.mountReportView(snapshot(),host);await flush();assert.equal(host.querySelector('#report-print').disabled,false);assert.equal(host.querySelector('#report-layout-image').hidden,false);
 const details=host.querySelectorAll('details[data-print-expand]');assert(details.some(d=>!d.open));
 await host.querySelector('#report-print').emit('click');assert.equal(printed,1);assert(details.every(d=>d.open));
 await win.emit('afterprint');assert(details.some(d=>!d.open));
 dispose();assert.equal(win.listenerCount(),0);assert.equal(doc.events.listenerCount(),0);assert.equal(created,revoked);assert(!doc.body.classList.contains('report-active'));
});
