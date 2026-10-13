import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { normalizeJson } from '../src/data/normalizeJson.js';
import { REPORT_SECTIONS,EXPORT_CHECK_REFERENCE,buildReportModel,renderReportHtml,fieldHtml,escapeHtml,createReportLayout } from '../src/report.js';
import { prepareReportForPrint } from '../src/reportView.js';
const data=JSON.parse(await readFile(new URL('./fixtures/viewer_data_20261012_142857_140.json',import.meta.url),'utf8'));
const snapshot=normalizeJson(data,{kind:'file',name:'latest.json'});
function mockCanvas() {
 const ctx={measureText:text=>({width:String(text).length*10})};
 for(const name of ['fillRect','fillText','strokeRect','save','restore','beginPath','rect','clip','moveTo','lineTo','closePath','fill','stroke','arc','setLineDash'])ctx[name]=()=>{};
 return {getContext:()=>ctx,toBlob:callback=>callback(new Blob(['png-mock'],{type:'image/png'}))};
}
test('report 5 sections and actual counts: candidates 42/final 3/materials 6/errors 4',()=>{
 const model=buildReportModel(snapshot),html=renderReportHtml(model);
 assert.deepEqual([...html.matchAll(/<section id="([^"]+)"/g)].map(m=>m[1]),REPORT_SECTIONS.map(s=>s[0]));
 assert.equal(model.summary.candidates,42);assert.equal(model.summary.cranes,3);assert.equal(model.summary.materials,6);assert.equal(model.summary.errors,4);assert.equal(model.candidateRows.length,42);
 for(const id of ['TC1','TC2','TC3'])assert(html.includes(id));
 for(const c of data.cranes)assert(html.includes('('+c.position.x+', '+c.position.y+', '+c.position.z+')'));
 assert(html.includes('GH Layout Errors 4건'));assert(html.includes(String(data.metadata.fitness)));
 assert.deepEqual(model.data,data);assert.equal(model.demoIncluded,false);
});
test('active 8 is external document reference, not JSON count; missing/null/N/A/unverified distinct',async()=>{
 const model=buildReportModel(snapshot);assert.equal(model.summary.activeMaterials,undefined);
 const check=await readFile(new URL('../../EXPORT_CHECK_20261012_142857_140.md',import.meta.url),'utf8');assert.match(check,/material boxes\/active schedule: 6\/8/);
 assert.equal(model.reference,EXPORT_CHECK_REFERENCE);assert(renderReportHtml(model).includes('현재 입력 데이터의 수량·계산 결과·검증 결과에 포함하지 않습니다.'));
 assert(fieldHtml(undefined).includes('data-state="missing"'));assert(fieldHtml(null).includes('data-state="null"'));assert(fieldHtml([]).includes('data-state="not-applicable"'));
 assert(renderReportHtml(model).includes('data-state="unverified"'));
 assert(renderReportHtml(model).includes('미제공 (missing)'));
});
test('HTML special characters in source/candidate/name/errors/specs are escaped',()=>{
 const bad=structuredClone(data);const payload='<img src=x onerror="alert(1)">&\'';
 bad.buildings[0].name=payload;bad.metadata.errors[0]=payload;bad.metadata.candidate_descriptions[0]=payload;bad.cranes[0].catalog_spec.name=payload;
 const html=renderReportHtml(buildReportModel(normalizeJson(bad,{kind:'file',name:payload+'.json'})));
 assert(!html.includes('<img src=x'));assert(!html.includes('<script>'));assert(html.includes('&lt;img'));assert(html.includes('&amp;'));assert(html.includes('&#39;'));assert.equal(escapeHtml('<>&"\''),'&lt;&gt;&amp;&quot;&#39;');
});
test('new snapshot replaces all prior report rows and preserves source fields/immutability',()=>{
 const before=JSON.stringify(snapshot);renderReportHtml(buildReportModel(snapshot));assert.equal(JSON.stringify(snapshot),before);
 const next=normalizeJson({schema:{version:'2.0.0'},units:{output:'meters'},coordinates:{target:'Unity Y-up'},cranes:[],buildings:[],materials:[],metadata:{candidate_count:0,errors:[],warnings:[]}},{kind:'file',name:'new.json'});
 const html=renderReportHtml(buildReportModel(next));
 assert(html.includes('new.json'));assert(!html.includes('TC1'));assert(!html.includes('latest.json'));assert.equal(buildReportModel(next).summary.cranes,0);
 assert(Object.isFrozen(snapshot.data.materials[0]));
});
test('report layout reuses same snapshot PNG, correct canvas size and DEMO excluded',async()=>{
 const canvas=mockCanvas(),before=JSON.stringify(snapshot);
 const result=await createReportLayout(snapshot,{canvasFactory:()=>canvas});
 assert.equal(result.blob.type,'image/png');assert.equal(canvas.width,2400);assert.equal(canvas.height,1800);
 assert.equal(result.model.counts.materials,6);assert.equal(result.model.counts.cranes,3);assert.equal(result.model.demoIncluded,false);assert.equal(JSON.stringify(snapshot),before);
});
test('print preparation expands details and restores original state; print CSS isolates A4 report',async()=>{
 const details=[{open:false},{open:true}],restore=prepareReportForPrint({querySelectorAll:()=>details});assert(details.every(d=>d.open));restore();assert.equal(details[0].open,false);assert.equal(details[1].open,true);
 const css=await readFile(new URL('../src/style.css',import.meta.url),'utf8');assert.match(css,/@page[\s\S]*size:\s*A4/);assert(css.includes('@media print'));assert(css.includes('body.report-active .page > :not(#results)'));assert(css.includes('thead { display:table-header-group'));
 const view=await readFile(new URL('../src/reportView.js',import.meta.url),'utf8');assert(view.includes('window.print()'));assert(!view.includes('자동 파일 다운로드가 아닙니다'));assert(view.includes('PDF 저장 / 인쇄'));assert(view.includes('URL.revokeObjectURL'));
});
test('source URL query/credential omitted; no DEMO path or unsupported safety verdict included',()=>{
 const model=buildReportModel(normalizeJson(data,{kind:'url',name:'https://example.com/data.php?secret=token#frag'}));assert.equal(model.sourceName,'example.com/data.php');
 const html=renderReportHtml(model);assert(!html.includes('secret=token'));assert(!html.includes('DEMO-only'));assert(!html.includes('안전성 검증 통과'));
});
