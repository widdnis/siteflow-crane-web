import { createLayoutPng } from './layout.js';
export const REPORT_SECTIONS=Object.freeze([
  ['inputs','1. 입력 조건 및 현장 개요'],
  ['crane-results','2. 크레인 후보 검토 및 최종 선정'],
  ['layout-results','3. 자재 및 물류 배치'],
  ['drawing','4. 2D 현장 배치도'],
  ['appendix','5. 상세 결과 및 검증 상태'],
]);
export const EXPORT_CHECK_REFERENCE=Object.freeze({
  source:'EXPORT_CHECK_20261012_142857_140.md',record:'실제 박스 6 / 활성 자재 8',
  scope:'별도 검증 문서의 기록입니다. 현재 입력 데이터의 수량·계산 결과·검증 결과에 포함하지 않습니다.',
});
export function escapeHtml(value) { return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
export function readField(data,path) {
  let value=data;for(const key of path.split('.')){if(value===null||typeof value!=='object'||!Object.hasOwn(value,key))return undefined;value=value[key];}return value;
}
export function fieldHtml(value) {
  if(value===undefined)return '<span class="report-badge missing" data-state="missing">미제공 (missing)</span>';
  if(value===null)return '<span class="report-badge unknown" data-state="null">미확인 (null)</span>';
  if(Array.isArray(value)&&value.length===0)return '<span class="report-badge neutral" data-state="not-applicable">해당 없음 (빈 목록)</span>';
  return '<span data-state="provided">'+escapeHtml(typeof value==='object'?JSON.stringify(value):value)+'</span>';
}
const count=value=>value==null?value:Array.isArray(value)?value.length:undefined;
const basename=value=>typeof value==='string'?value.split(/[\\/]/).pop():value;
function reportSourceName(source={}) {
  if(source.kind==='url'){try{const url=new URL(source.name);return url.host+decodeURIComponent(url.pathname);}catch{return 'URL 출처 확인 필요';}}
  return basename(source.name);
}
export function buildReportModel(snapshot) {
  const data=snapshot.data,descriptions=data.metadata?.candidate_descriptions,scores=data.metadata?.candidate_scores;
  const candidateRows=[];
  for(let i=0;i<Math.max(Array.isArray(descriptions)?descriptions.length:0,Array.isArray(scores)?scores.length:0);i++)candidateRows.push({index:i+1,description:descriptions?.[i],score:scores?.[i]});
  return {
    data,sourceName:reportSourceName(snapshot.source),
    sourceKind:snapshot.source?.kind,missing:snapshot.missing??[],routeWarnings:snapshot.routes?.warnings??[],
    summary:{buildings:count(data.buildings),materials:count(data.materials),cranes:count(data.cranes),candidates:data.metadata?.candidate_count,activeMaterials:readField(data,'schedule.active_material_count'),errors:count(data.metadata?.errors)},
    candidateRows,reference:EXPORT_CHECK_REFERENCE,
    errors:data.metadata?.errors,warnings:data.metadata?.warnings,
    unverified:['GH 원천 데이터 연계','실제 장비 모델·피벗·방향 및 운용 사양','양중 안전·하중 적합성·현장 충돌/차량 운행 안전','시간표 기반 건물 높이·미래 시공 진행','배치도 출력·인쇄 페이지·PDF 저장 결과'],
    actualPathCount:snapshot.routes?.actualPaths.length??undefined,demoIncluded:false,
  };
}
const table=(headers,rows,{caption='',className=''}={})=>'<div class="report-table-wrap"><table class="'+className+'">'+(caption?'<caption>'+escapeHtml(caption)+'</caption>':'')+'<thead><tr>'+headers.map(h=>'<th>'+escapeHtml(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(cell=>'<td>'+cell+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
const kv=rows=>'<div class="report-table-wrap"><table class="kv-table"><tbody>'+rows.map(([label,value])=>'<tr><th scope="row">'+escapeHtml(label)+'</th><td>'+fieldHtml(value)+'</td></tr>').join('')+'</tbody></table></div>';
const cards=rows=>'<div class="result-grid">'+rows.map(([label,value])=>'<div class="result-card"><div class="meta-label">'+escapeHtml(label)+'</div><strong>'+fieldHtml(value)+'</strong></div>').join('')+'</div>';
const list=(values)=>values==null?fieldHtml(values):values.length?'<ul>'+values.map(v=>'<li>'+escapeHtml(v)+'</li>').join(''):'<p>'+fieldHtml([])+'</p>';
const position=p=>p==null?fieldHtml(p):fieldHtml('('+p.x+', '+p.y+', '+p.z+')');
export function renderReportHtml(model) {
  const {data:d,summary:s}=model,rf=path=>readField(d,path);
  function inputField(key,roadKey) {
    const direct=rf('report.inputs.'+key);
    return direct!==undefined?direct:roadKey?rf('roads.widths_m.'+roadKey):undefined;
  }
  const candidateTable=rows=>table(['No.','후보 설명','원본 Score'],rows.map(r=>[fieldHtml(r.index),fieldHtml(r.description),fieldHtml(r.score)]),{className:'candidate-table'});
  const errorStatus=model.errors==null?fieldHtml(model.errors):model.errors.length
    ?'<div class="status-box warn">GH Layout Errors '+model.errors.length+'건<div class="status-sub">GH 출력 원문입니다. 웹에서 재계산하거나 안전 판정을 내리지 않습니다.</div></div>'
    :'<div class="status-box ok">Errors 출력 0건<div class="status-sub">오류 목록이 비어 있음만 의미하며 현장 안전성을 보증하지 않습니다.</div></div>';
  const sections=[];
  sections.push(`<section id="inputs"><h2>${REPORT_SECTIONS[0][1]}</h2>
    <p class="section-intro">현재 입력 JSON의 결과를 표시합니다. Viewer 조작·DEMO 차량은 계산 결과에 반영하지 않습니다.</p>
    ${cards([['건물',s.buildings],['실제 자재 박스',s.materials],['최종 선정 크레인',s.cranes],['검토 후보',s.candidates]])}
    ${kv([['입력 데이터',model.sourceName],['입력 방식',model.sourceKind],['스키마',rf('schema.version')],['데이터 명칭',rf('schema.name')],['데이터 생성 시각',rf('project.generated_at')],['Export 시각',rf('metadata.exported_at')],['GH 파일 (이름만)',basename(rf('project.grasshopper_file'))],['Rhino 파일 (이름만)',basename(rf('project.rhino_file'))],['단위',rf('units.output')],['좌표',rf('coordinates.target')],['좌표 원점',rf('coordinates.origin')],['좌표 mapping',rf('coordinates.mapping')],['현장 경계 점 수',count(rf('site.boundary.points'))],['게이트 (X,Y,Z) m',rf('site.gate')],['현재 일수',rf('schedule.current_day')],['주도로 폭, m',inputField('roadWidth','main')],['지선 도로 폭, m',inputField('branchWidth','branch')],['이격 거리, m',inputField('clearance')]])}
    <h3>건물 원본 정보</h3>${table(['ID','이름','현재 높이 m','최대 높이 m'],(d.buildings??[]).map(b=>[fieldHtml(b.id),fieldHtml(b.name),fieldHtml(b.current_height_m),fieldHtml(b.max_height_m)]))}
  </section>`);
  sections.push(`<section id="crane-results"><h2>${REPORT_SECTIONS[1][1]}</h2>
    ${cards([['후보 (감사 정보)',s.candidates],['실제 선정',s.cranes]])}
    <div class="selected-box"><strong>최종 선정 출력</strong>${kv([['sel_model',rf('metadata.final_selection.sel_model')],['sel_rank',rf('metadata.final_selection.sel_rank')],['is_empty',rf('metadata.final_selection.is_empty')]])}</div>
    <p class="scope-box">후보는 검토 메타데이터이며 실제 배치된 크레인이 아닙니다. 선정 이유·성능·안전성은 원본 근거 없이 판정하지 않습니다. Score 계산식·단위·순위 의미는 미검증입니다.</p>
    <h3>최종 선정 크레인</h3>${table(['ID','모델 (JSON)','위치 X,Y,Z m','반경 m','높이 m','Rhino 방향 °'],d.cranes.map(c=>[fieldHtml(c.id),fieldHtml(c.model),position(c.position),fieldHtml(c.working_radius_m),fieldHtml(c.height_m),fieldHtml(c.base_direction_degrees_rhino)]))}
    <h3>후보 비교 원문</h3>${model.candidateRows.length?candidateTable(model.candidateRows.slice(0,3)):'<p>'+fieldHtml(rf('metadata.candidate_descriptions'))+'</p>'}
    ${model.candidateRows.length>3?'<details data-print-expand><summary>나머지 후보 '+(model.candidateRows.length-3)+'건 · 원문 및 점수</summary>'+candidateTable(model.candidateRows.slice(3))+'</details>':''}
    <h3>하중 검토 출력 (GH 전용, 미제공 시 missing)</h3>${kv([['양중 거리',rf('report.candidates.loadDist')],['양중 한계',rf('report.candidates.loadLimit')]])}
  </section>`);
  sections.push(`<section id="layout-results"><h2>${REPORT_SECTIONS[2][1]}</h2>
    ${cards([['실제 박스',s.materials],['활성 자재 (JSON)',s.activeMaterials],['GH Layout Errors',s.errors],['Fitness (원본)',rf('metadata.fitness')]])}
    <div class="note"><strong>별도 검증 출처</strong><p>${escapeHtml(model.reference.source)}: ${escapeHtml(model.reference.record)}.</p><p>${escapeHtml(model.reference.scope)} 활성 자재는 JSON에 필드가 없는 경우 missing을 유지합니다.</p></div>
    ${errorStatus}${list(model.errors)}
    <h3>데이터 불일치·원본 GH 경고</h3>${list(model.warnings)}
    <h3>실제 자재</h3>${table(['ID / 이름','중심 X,Y,Z m','중량 t','최대 적재 높이 m','schedule_index'],(d.materials??[]).map(m=>[fieldHtml(m.id)+'<br>'+fieldHtml(m.name),position(m.center),fieldHtml(m.weight_t),fieldHtml(m.max_stack_height_m),fieldHtml(m.schedule_index)]))}
    <h3>물류·도로 자료</h3>${kv([['roads',d.roads===undefined?undefined:d.roads===null?null:'객체 제공'],['GH 선언 차량 경로 수 (DEMO 제외)',d.roads==null?d.roads:model.actualPathCount],['물류 배치 분석 요약',rf('report.layout_results.summary')],['도로·경로 검사 경고',model.routeWarnings]])}
  </section>`);
  sections.push(`<section id="drawing" class="drawing-section"><h2>${REPORT_SECTIONS[3][1]}</h2>
    <p>입력 데이터 기준 현장 배치도입니다. DEMO 차량·경로는 포함하지 않습니다.</p>
    <figure class="report-layout"><p id="report-layout-status" role="status">배치도 PNG 준비 중…</p><img id="report-layout-image" hidden alt="2D 현장 배치도, DEMO 미포함" width="2400" height="1800"><figcaption>현장 형상·작업 반경·식별자를 표시합니다. 원본 레이어·색상은 미제공이며 표시 색상은 참고용입니다.</figcaption></figure>
  </section>`);
  sections.push(`<section id="appendix"><h2>${REPORT_SECTIONS[4][1]}</h2>
    <h3>입력 데이터의 분석 결과</h3>${kv([['Fitness (원문)',rf('metadata.fitness')],['후보 원문 행 수',count(rf('metadata.candidate_descriptions'))],['후보 점수 행 수',count(rf('metadata.candidate_scores'))],['Rhino 객체 수 (메타데이터)',rf('metadata.rhino_document_object_count')],['runtime_sources (원본 역할 식별자)',rf('metadata.runtime_sources')],['건물 높이 변화 기준',rf('schedule.height_rule')],['높이 규칙 상태',rf('schedule.height_rule_status')]])}
    <h3>JSON 카탈로그 참조값</h3><p class="muted">catalog_spec / crane_catalog 원본 값이며 실제 장비 사양·운용 한계 검증이 아닙니다. rent의 화폐·기간 단위는 추정하지 않습니다.</p>
    ${kv([['카탈로그 JSON 행 수',count(d.crane_catalog)]])}
    ${table(['모델','반경 m','Root load t','Tip load t','Free height m','Max height m','rent (단위 미제공)','원천'],(d.crane_catalog??[]).map(c=>[fieldHtml(c.name),fieldHtml(c.working_radius_m),fieldHtml(c.root_load_t),fieldHtml(c.tip_load_t),fieldHtml(c.free_height_m),fieldHtml(c.max_height_m),fieldHtml(c.rent),fieldHtml(c.source)]))}
    <details data-print-expand><summary>선정 크레인 상세 사양 및 모델 정보</summary>${kv(d.cranes.flatMap(c=>[[c.id+' catalog_spec',c.catalog_spec],[c.id+' model_asset',c.model_asset],[c.id+' parts',c.parts],[c.id+' pivot',c.pivot],[c.id+' geometry_status',c.geometry_status]]))}</details>
    <h3>누락 정보 및 미확정 값</h3>${list(model.missing)}
    <h3>데이터 품질 경고 및 GH 오류</h3>${list(model.warnings)}${list(model.errors)}
    <h3><span class="report-badge unknown" data-state="unverified">미검증</span> 항목</h3>${list(model.unverified)}
    <p class="scope-box">이 보고서는 제공된 JSON의 표시 결과입니다. missing은 미제공, null은 명시된 미확인, 빈 목록은 해당 없음, 미검증은 별도 검증 미수행을 뜻합니다. 오류가 없거나 값이 있어도 안전성·최적성·실제 시공 결과로 해석하지 않습니다.</p>
  </section>`);
  return '<article class="report-paper"><header class="report-header"><div class="eyebrow">SITEFLOW · JSON RESULTS</div><h1>SiteFlow 현장 결과 보고서</h1><p class="subtitle">'+fieldHtml(model.sourceName)+' · schema '+escapeHtml(d.schema.version)+'</p></header>'+sections.join('')+'<footer>SiteFlow · 현장 결과 보고서</footer></article>';
}
export async function createReportLayout(snapshot,options) { return createLayoutPng(snapshot,options); }
