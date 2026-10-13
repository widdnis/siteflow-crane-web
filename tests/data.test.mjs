import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { normalizeJson } from '../src/data/normalizeJson.js';
import { parseJsonText, loadLocalJson } from '../src/data/loadLocalJson.js';
import { loadJsonUrl, validateJsonUrl } from '../src/data/loadJsonUrl.js';
import { createAppState } from '../src/data/state.js';
const text = await readFile(new URL('./fixtures/viewer_data_20261012_142857_140.json',import.meta.url),'utf8');
const data = JSON.parse(text);
const copy = () => structuredClone(data);
test('latest actual data: final 3, boxes 6, GH errors 4, candidates 42, unchanged coordinates',()=>{
 const s=normalizeJson(data);
 assert.equal(s.summary.finalCranes,3); assert.equal(s.summary.materialBoxes,6);
 assert.equal(s.summary.errors.length,4); assert.equal(s.summary.candidates,42);
 assert.deepEqual(s.data.cranes[0].position,{x:102,y:0,z:84});
 assert.deepEqual(s.data,data); assert.deepEqual(s.summary.errors,data.metadata.errors);
 assert.equal(s.summary.activeMaterials,null);
 assert(s.missing.includes('schedule.active_material_count'));
 assert(s.summary.warnings.some(v=>v.includes('active schedule count')));
 assert(Object.isFrozen(s.data.cranes[0].position));
 assert.throws(()=>{s.data.cranes[0].position.x=2;},TypeError);
});
test('real sidecar records 6/8 mismatch; no fabricated count in JSON',async()=>{
 const report=await readFile(new URL('../../EXPORT_CHECK_20261012_142857_140.md',import.meta.url),'utf8');
 assert.match(report,/material boxes\/active schedule: 6\/8/);
 assert.equal(data.schedule.active_material_count,undefined);
});
test('legacy full JSON and minimal TC1 prototype are compatible',async()=>{
 for(const path of ['../../viewer_data.json','../public/data/viewer_data.json']) {
   const d=JSON.parse(await readFile(new URL(path,import.meta.url),'utf8')); assert.doesNotThrow(()=>normalizeJson(d));
 }
});
test('parse, required schema, bad numeric/geometry/id and null handling',()=>{
 assert.throws(()=>parseJsonText('{bad'),/파싱/); assert.throws(()=>normalizeJson([]),/객체/);
 for(const alter of [
  d=>delete d.schema, d=>d.units.output='millimeters', d=>d.coordinates.target='Rhino Z-up',
  d=>d.cranes[0].position.x=Infinity, d=>d.cranes[0].position.z='84',
  d=>d.cranes[0].height_m=-1, d=>d.cranes[1].id=d.cranes[0].id,
  d=>d.site.boundary.points=[{x:0,y:0,z:0}],d=>d.materials[0].corners=[]
 ]) { const d=copy(); alter(d); assert.throws(()=>normalizeJson(d)); }
 const d=copy(); d.cranes[0].height_m=null; assert(normalizeJson(d).missing.includes('cranes.TC1.height_m'));
 assert.throws(()=>parseJsonText('{"schema":{"version":"2.0.0"},"n":1e999}'),/유한/);
});
test('file cancel, read failure, valid local copy and extension errors',async()=>{
 assert.equal(await loadLocalJson(null),null);
 const s=await loadLocalJson({name:'copy.json',size:text.length,text:async()=>text});
 assert.equal(s.summary.materialBoxes,6);
 await assert.rejects(loadLocalJson({name:'bad.txt',size:1}),/json/);
 await assert.rejects(loadLocalJson({name:'bad.json',size:1,text:async()=>{throw Error();}}),/읽지/);
});
test('URL scheme, HTTP errors, invalid JSON, CORS failure and success',async()=>{
 for(const url of ['bad','file:///a.json','javascript:alert(1)','https://user:pass@example.com/a']) assert.throws(()=>validateJsonUrl(url));
 await assert.rejects(loadJsonUrl('https://example.com/a',{fetcher:async()=>new Response('',{status:404})}),/HTTP 404/);
 await assert.rejects(loadJsonUrl('https://example.com/a',{fetcher:async()=>new Response('<html>')}),/파싱/);
 await assert.rejects(loadJsonUrl('https://example.com/a',{fetcher:async()=>{throw TypeError('fetch failed');}}),/CORS/);
 const s=await loadJsonUrl('https://example.com/data.json',{fetcher:async(url,options)=>{assert.equal(options.credentials,'omit'); assert.equal(options.mode,'cors'); return new Response(text);}});
 assert.equal(s.summary.finalCranes,3);
});
test('URL cancellation and size limits',async()=>{
 const controller=new AbortController(); controller.abort();
 await assert.rejects(loadJsonUrl('https://example.com/a',{signal:controller.signal,fetcher:async(_,o)=>{if(o.signal.aborted) throw new DOMException('aborted','AbortError');}}),/취소/);
 await assert.rejects(loadJsonUrl('https://example.com/a',{fetcher:async()=>new Response('',{headers:{'content-length':String(21*1024*1024)}})}),/20 MB/);
});
test('failed and stale requests preserve last valid snapshot; UI state separate',()=>{
 const state=createAppState(), a=state.begin(), s=normalizeJson(data);
 assert(state.commit(a,s)); state.ui.tab='report'; assert.equal(s.summary.finalCranes,3);
 const b=state.begin(); state.finish(b); assert.equal(state.snapshot,s);
 const c=state.begin(), d=state.begin(); assert.equal(state.commit(c,s),false);
 state.home(); assert.equal(state.commit(d,s),false); assert.equal(state.snapshot,s);
});
