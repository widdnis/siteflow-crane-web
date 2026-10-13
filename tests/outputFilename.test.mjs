import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createOutputFilename,jsonFilenameStem,localOutputTimestamp } from '../src/outputFilename.js';
import { normalizeJson } from '../src/data/normalizeJson.js';
import { createLayoutPng,renderLayoutCanvas } from '../src/layout.js';
import { buildReportModel,renderReportHtml } from '../src/report.js';
import { deferred,flush,FakeElement,fakeDocument,loadFunction } from './qaHarness.mjs';
const data=JSON.parse(await readFile(new URL('./fixtures/viewer_data_20261012_142857_140.json',import.meta.url),'utf8'));
const source={kind:'file',name:'한강 현장 A (최종) [1].JSON'};
const snapshot=(src=source)=>normalizeJson(data,src);
const time=new Date(2026,9,13,9,8,7);
function clock(){
 let now=time.getTime();
 return {Date:class extends Date{constructor(...args){super(...(args.length?args:[now]));}},advance:()=>{now+=65000;}};
}
test('shared output naming preserves Korean, spaces and valid punctuation; replaces only forbidden filename characters',()=>{
 assert.equal(jsonFilenameStem(source),'한강 현장 A (최종) [1]');
 assert.equal(createOutputFilename(source,'Layout',time),'한강 현장 A (최종) [1]_Layout_20261013_090807.png');
 assert.equal(createOutputFilename(source,'Report',time),'한강 현장 A (최종) [1]_Report_20261013_090807.pdf');
 assert.equal(jsonFilenameStem({name:'현장 /\\:*?"<>|\u0000\u001f\u007f + & # ! \' 😀.json'}),"현장 ____________ + & # ! ' 😀");
 assert.equal(jsonFilenameStem({name:'CON.json'}),'CON'); // Suffix prevents a reserved bare device name.
 assert.equal(jsonFilenameStem({name:'  현장 이름  .json'}),'  현장 이름  ');
 assert.equal(jsonFilenameStem({name:'.json'}),'siteflow');
 assert.equal(jsonFilenameStem({}),'siteflow');
 assert.throws(()=>createOutputFilename(source,'Unknown',time));assert.throws(()=>localOutputTimestamp(new Date(NaN)));
});
test('URL naming uses decoded last JSON path segment, omits credentials/query/hash and falls back neutrally',()=>{
 assert.equal(jsonFilenameStem({kind:'url',name:'https://user:pass@example.com/a/'+encodeURIComponent('서울 현장 #1.json')+'?token=secret#frag'}),'서울 현장 #1');
 assert.equal(jsonFilenameStem({kind:'url',name:'https://example.com/path/a%2Fb.json?download=file.json'}),'a_b');
 for(const name of ['https://example.com/folder/','https://example.com/api?filename=secret.json','https://example.com/%ZZ.json','bad URL','file:///tmp/data.json'])
  assert.equal(jsonFilenameStem({kind:'url',name}),'siteflow');
});
test('timestamps use local date components and current snapshot source without changing source generation time',async()=>{
 assert.equal(localOutputTimestamp(new Date(2026,0,2,3,4,5)),'20260102_030405');
 const a=snapshot(),next=snapshot({kind:'file',name:'새 현장.json'}),before=JSON.stringify(a);
 const first=await createLayoutPng(a,{canvasFactory:()=>new FakeElement('canvas'),outputTime:time});
 const second=await createLayoutPng(next,{canvasFactory:()=>new FakeElement('canvas'),outputTime:new Date(2026,9,13,9,9,12)});
 assert.equal(first.filename,'한강 현장 A (최종) [1]_Layout_20261013_090807.png');
 assert.equal(second.filename,'새 현장_Layout_20261013_090912.png');
 assert.equal(JSON.stringify(a),before);assert.equal(first.model.counts.cranes,3);
});
test('PNG click fixes output time before fonts/encoding delay and downloads 2400x1800 with the current name',async()=>{
 const doc=fakeDocument(),host=new FakeElement(),fonts=deferred(),c=clock(),anchors=[];
 doc.fonts.ready=fonts.promise;
 const create=doc.createElement;doc.createElement=tag=>{const el=create(tag);if(tag==='a')anchors.push(el);return el;};
 const api=await loadFunction('layoutView.js',['mountLayoutView'],{document:doc,Date:c.Date,renderLayoutCanvas,createLayoutPng:(s,options)=>createLayoutPng(s,{...options,canvasFactory:()=>doc.createElement('canvas')}),
 URL:{createObjectURL:()=> 'blob:mock',revokeObjectURL:()=>{}}});
 const dispose=api.mountLayoutView(snapshot(),host),pending=host.querySelector('#layout-download').emit('click');
 c.advance();fonts.resolve();await pending;
 assert.equal(anchors[0].download,'한강 현장 A (최종) [1]_Layout_20261013_090807.png');
 assert.equal(host.querySelector('canvas').width,2400);assert.equal(host.querySelector('canvas').height,1800);dispose();
});
async function reportHarness(){
 const document=fakeDocument(),window=new FakeElement(),media=new FakeElement(),host=new FakeElement(),c=clock(),titles=[];
 document.title='SiteFlow 기존 제목';
 window.matchMedia=()=>media;window.print=()=>titles.push(document.title);
 const api=await loadFunction('reportView.js',['mountReportView'],{document,window,Date:c.Date,buildReportModel,renderReportHtml,
 createReportLayout:async()=>({blob:new Blob(['PNG mock'],{type:'image/png'})}),
 URL:{createObjectURL:()=> 'blob:mock',revokeObjectURL:()=>{}}});
 return {document,window,media,host,c,titles,mount:src=>api.mountReportView(snapshot(src),host)};
}
test('PDF title suggestion: repeated print/cancel/media exit and tab disposal restore original title, new JSON replaces base',async()=>{
 const h=await reportHarness();let dispose=h.mount(source);await flush();
 const button=h.host.querySelector('#report-print');await button.emit('click');
 assert.equal(h.titles[0],'한강 현장 A (최종) [1]_Report_20261013_090807');
 await button.emit('click');assert.equal(h.titles.length,1); // No overlapping print transaction.
 await h.window.emit('beforeprint');await h.window.emit('afterprint');
 assert.equal(h.document.title,'SiteFlow 기존 제목');assert.equal(button.disabled,false);
 h.c.advance();await button.emit('click');assert.equal(h.titles[1],'한강 현장 A (최종) [1]_Report_20261013_090912');
 await h.media.emit('change',{matches:false});assert.equal(h.document.title,'SiteFlow 기존 제목');
 await button.emit('click');dispose();assert.equal(h.document.title,'SiteFlow 기존 제목');
 assert.equal(h.window.listenerCount(),0);assert.equal(h.media.listenerCount(),0);
 dispose=h.mount({kind:'url',name:'https://example.com/'+encodeURIComponent('교체 현장.json')+'?token=private'});await flush();
 await h.host.querySelector('#report-print').emit('click');assert.equal(h.titles.at(-1),'교체 현장_Report_20261013_090912');
 dispose();assert.equal(h.document.title,'SiteFlow 기존 제목');
});
test('PDF click timestamp survives fullscreen await; thrown print and disposed pending print restore/retain title',async()=>{
 const h=await reportHarness();let dispose=h.mount(source);await flush();const gate=deferred();
 h.document.fullscreenElement=h.host;h.document.exitFullscreen=()=>gate.promise;
 const pending=h.host.querySelector('#report-print').emit('click');h.c.advance();gate.resolve();await pending;
 assert.equal(h.titles[0],'한강 현장 A (최종) [1]_Report_20261013_090807');await h.window.emit('afterprint');
 h.document.fullscreenElement=null;h.window.print=()=>{throw new Error('blocked');};
 await h.host.querySelector('#report-print').emit('click');assert.equal(h.document.title,'SiteFlow 기존 제목');
 assert(h.host.querySelector('#report-action-status').textContent.includes('blocked'));dispose();
 const fonts=deferred();h.document.fonts.ready=fonts.promise;dispose=h.mount(source);
 const next=h.host.querySelector('#report-print').emit('click');dispose();fonts.resolve();await next;assert.equal(h.document.title,'SiteFlow 기존 제목');
});
test('finished UI omits internal implementation prose and keeps data/safety/DEMO warnings',async()=>{
 const html=renderReportHtml(buildReportModel(snapshot()));
 assert(!html.includes('불변'));assert(!html.includes('독립 Canvas'));assert(!html.includes('ReportExporter'));
 assert(html.includes('missing'));assert(html.includes('null'));assert(html.includes('미검증'));assert(html.includes('DEMO'));assert(html.includes('GH Layout Errors 4'));
 for(const file of ['main.js','layoutView.js','reportView.js','viewer.js']){
  const text=await readFile(new URL('../src/'+file,import.meta.url),'utf8');
  for(const phrase of ['입력 데이터의 계산 결과와 사용자 조작 상태를 분리합니다.','자동 파일 다운로드가 아닙니다.','절차적','프로토타입'])
   assert(!text.includes(phrase),file+': '+phrase);
 }
});
