import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { normalizeJson } from '../src/data/normalizeJson.js';
import { compileVehiclePath } from '../src/data/vehiclePath.js';
import { buildLayoutModel,fitLayout,topHull,renderLayoutCanvas,createLayoutPng,safeLayoutFilename,LAYOUT_SIZE } from '../src/layout.js';
const data=JSON.parse(await readFile(new URL('./fixtures/viewer_data_20261012_142857_140.json',import.meta.url),'utf8'));
const snapshot=normalizeJson(data,{kind:'file',name:'viewer_data_20261012_142857_140.json'});
const close=(a,b)=>assert(Math.abs(a-b)<1e-6);
function mockCanvas({blob=true,mime='image/png',context=true}={}) {
 const calls=[];const ctx={measureText:text=>({width:String(text).length*10})};
 for(const method of ['fillRect','fillText','strokeRect','save','restore','beginPath','rect','clip','moveTo','lineTo','closePath','fill','stroke','arc','setLineDash'])ctx[method]=(...args)=>calls.push({method,args});
 return {width:0,height:0,calls,getContext:()=>context?ctx:null,toBlob(callback,type){calls.push({method:'toBlob',args:[type]});callback(blob?new Blob([new Uint8Array([137,80,78,71])],{type:mime}):null);}};
}
test('actual JSON counts/geometry/radius and labels, no candidates or invented materials',()=>{
 const model=buildLayoutModel(snapshot);assert.equal(model.counts.buildings,3);assert.equal(model.counts.materials,6);assert.equal(model.counts.cranes,3);assert.equal(model.counts.radii,3);
 assert.equal(model.counts.noGo,data.site.no_go.length);assert.equal(model.ghErrors.length,4);assert.deepEqual(model.ghWarnings,data.metadata.warnings);
 assert.deepEqual(model.shapes.find(s=>s.kind==='site').points,data.site.boundary.points);
 for(const c of data.cranes){const s=model.shapes.find(s=>s.kind==='radius'&&s.id===c.id);assert.deepEqual(s.position,c.position);assert.equal(s.radius,c.working_radius_m);}
 assert.deepEqual(model.labels.filter(l=>l.text.startsWith('TC')).map(l=>l.text),['TC1','TC2','TC3']);
 assert.equal(model.labels.find(l=>l.text==='주출입구').color,'#0f7d46');assert.equal(model.labels[1].color,'#d23737');
 assert.deepEqual(model.shapes.find(s=>s.kind==='material').points.map(p=>[p.x,p.z]),topHull(data.materials[0].corners).map(p=>[p.x,p.z]));
 assert(model.missing.some(s=>s.includes('실시간')));assert.equal(model.demoIncluded,false);
});
test('X/Z projection directions, equal scale and all real shapes fit inside plot',()=>{
 const model=buildLayoutModel(snapshot),fit=fitLayout(model);
 const origin=fit.project({x:0,z:0}),x=fit.project({x:1,z:0}),z=fit.project({x:0,z:1});
 close(x.x-origin.x,fit.scale);close(origin.y-z.y,fit.scale);
 for(const s of model.shapes){
   const points=s.points??(s.type==='circle'?[{x:s.position.x-s.radius,z:s.position.z},{x:s.position.x+s.radius,z:s.position.z},{x:s.position.x,z:s.position.z-s.radius},{x:s.position.x,z:s.position.z+s.radius}]:[s.position]);
   for(const p of points){const q=fit.project(p);assert(q.x>=fit.plot.x&&q.x<=fit.plot.x+fit.plot.width);assert(q.y>=fit.plot.y&&q.y<=fit.plot.y+fit.plot.height);}
 }
 const small=fitLayout(model,1200,900),q=fit.project(data.cranes[0].position),r=small.project(data.cranes[0].position);close(q.x,r.x*2);close(q.y,r.y*2);close(fit.scale,small.scale*2);
});
test('empty and malformed shapes fail safely, actual corners hull and projection limits',()=>{
 const empty=buildLayoutModel({data:{cranes:[]},summary:{}});assert.equal(empty.bounds,null);assert.equal(fitLayout(empty).project,null);assert.doesNotThrow(()=>renderLayoutCanvas({data:{cranes:[]},summary:{}},mockCanvas()));
 const bad=structuredClone(data);bad.site.boundary.points[0].x='bad';bad.materials[0].corners[0].z=NaN;
 const model=buildLayoutModel({data:bad,summary:{}});assert(model.warnings.some(s=>s.includes('site.boundary')));assert.equal(model.counts.materials,5);
 assert.deepEqual(topHull([{x:0,y:0,z:0},{x:1,y:0,z:0},{x:2,y:0,z:0}]),[]);
 assert.throws(()=>fitLayout(empty,NaN,1800));assert.throws(()=>fitLayout(empty,10,10));
 assert.throws(()=>renderLayoutCanvas(snapshot,mockCanvas({context:false})),/Canvas/);
});
test('pure canvas renderer consumes snapshot and emits real circles; DEMO route excluded',()=>{
 const before=JSON.stringify(snapshot),canvas=mockCanvas();renderLayoutCanvas(snapshot,canvas);assert.equal(canvas.width,2400);assert.equal(canvas.height,1800);
 const circles=canvas.calls.filter(c=>c.method==='arc'&&c.args[2]>5);assert.equal(circles.length,3);
 assert.equal(JSON.stringify(snapshot),before);assert(Object.isFrozen(snapshot.data.cranes[0].position));
 const path=compileVehiclePath({id:'DEMO-test',source_kind:'demo',points:[{x:0,y:0,z:0},{x:5,y:0,z:0}]});
 const demoOnly={...snapshot,routes:{actualPaths:[],demoPaths:[path]}};assert.equal(buildLayoutModel(demoOnly).shapes.filter(s=>s.kind==='road_path').length,0);
 const actual={...snapshot,routes:{actualPaths:[{...path,source_kind:'gh'}],demoPaths:[path]}};assert.equal(buildLayoutModel(actual).shapes.filter(s=>s.kind==='road_path').length,1);
});
test('PNG workflow is independent 2400x1800, MIME/null errors and safe input-linked filename',async()=>{
 const canvas=mockCanvas();const png=await createLayoutPng(snapshot,{canvasFactory:()=>canvas,outputTime:new Date(2026,9,13,12,34,56)});
 assert.equal(png.blob.type,'image/png');assert.equal(png.filename,'viewer_data_20261012_142857_140_Layout_20261013_123456.png');
 assert.deepEqual([canvas.width,canvas.height],[LAYOUT_SIZE.width,LAYOUT_SIZE.height]);assert(canvas.calls.some(c=>c.method==='toBlob'&&c.args[0]==='image/png'));
 await assert.rejects(createLayoutPng(snapshot,{canvasFactory:()=>mockCanvas({blob:false})}),/PNG/);
 await assert.rejects(createLayoutPng(snapshot,{canvasFactory:()=>mockCanvas({mime:'image/jpeg'})}),/PNG/);
 assert.equal(safeLayoutFilename({kind:'url',name:'https://example.com/folder/data.json?token=secret#frag'},new Date(2026,9,13,12,34,56)),'data_Layout_20261013_123456.png');
 assert(!safeLayoutFilename({kind:'file',name:'../bad:<name>.json'}).includes('/'));assert(!safeLayoutFilename({kind:'file',name:'../bad:<name>.json'}).includes(':'));
});
