import './style.css';
import { loadLocalJson } from './data/loadLocalJson.js';
import { loadJsonUrl } from './data/loadJsonUrl.js';
import { createAppState } from './data/state.js';
import { mountShareDialog, readSharedData } from './share.js';

document.body.innerHTML = `
<main class="page">
<header><div class="eyebrow">SITEFLOW · SITE PLANNING</div><h1>현장 데이터를 한눈에</h1><p class="subtitle">JSON을 불러오고 현장 데이터와 최종 선정 크레인을 확인하세요.</p></header>
<nav aria-label="화면 이동" hidden><button data-action="home">새 JSON 입력</button><button data-tab="viewer" aria-pressed="true">3D Viewer</button><button data-tab="layout" aria-pressed="false">2D 배치도</button><button data-tab="report" aria-pressed="false">Report</button></nav>
<section id="home"><h2>현장 JSON 불러오기</h2><p class="section-intro">JSON 파일을 선택하거나 JSON 파일 주소를 입력하세요.</p>
<div class="input-grid"><div class="input-card"><h3>로컬 파일</h3><label for="json-file">JSON 파일 선택</label><input id="json-file" type="file" accept=".json,application/json"><p class="muted">최대 20 MB</p></div>
<form id="url-form" class="input-card" novalidate><h3>직접 JSON URL</h3><label for="json-url">HTTP(S) 주소</label><input id="json-url" type="url" placeholder="https://example.com/data.json" required><button type="submit">URL 불러오기</button><p class="muted">JSON 파일에 직접 연결되는 주소가 필요합니다. 사이트에서 외부 접근(CORS)을 허용해야 합니다.</p></form></div>
<button id="resume" hidden>이전 유효한 데이터로 돌아가기</button></section>
<p id="load-status" role="status" aria-live="polite"></p><p id="load-error" class="notice warn" role="alert" hidden></p><button id="cancel" hidden>로딩 취소</button>
<section id="results" hidden><div class="result-heading"><h2 id="result-title">데이터 확인</h2><button id="share-result" type="button">결과 공유</button></div><p id="source" class="subtitle"></p><div id="summary" class="result-grid"></div>
<details id="issues"><summary>GH 오류·경고·누락 확인</summary><div id="issue-list"></div></details>
<div id="viewer-view"><p class="notice">현장 데이터의 시각화입니다. 표시된 크레인은 실제 장비 형상·운용 사양을 검증한 모델이 아닙니다.</p><div id="viewer-host" aria-label="현장 3D Viewer"></div><p id="viewer-error" class="notice warn" role="alert" hidden></p></div>
<div id="layout-view" hidden><div id="layout-host"></div><p id="layout-error" class="notice warn" role="alert" hidden></p></div>
<div id="report-view" hidden><div id="report-host"></div><p id="report-error" class="notice warn" role="alert" hidden></p></div></section>
<footer>SiteFlow</footer></main>`;
const $ = selector => document.querySelector(selector);
const state = createAppState();
const shareDialog = mountShareDialog($('#share-result'), () => state.snapshot);
let disposeViewer = null, disposeLayout = null, disposeReport = null, controller = null, viewVersion = 0;
function textElement(tag, text, className) { const el=document.createElement(tag); el.textContent=text; if(className) el.className=className; return el; }
function loading(value) {
  state.ui.loading=value;
  $('#json-file').disabled=value; $('#url-form button').disabled=value; $('#json-url').disabled=value;
  $('#cancel').hidden=!value; $('#home').setAttribute('aria-busy',String(value));
}
function stopViewer() { viewVersion++; disposeViewer?.(); disposeLayout?.(); disposeReport?.(); disposeReport=null; disposeLayout=null; disposeViewer=null; $('#viewer-host').replaceChildren(); $('#layout-host').replaceChildren(); $('#report-host').replaceChildren(); }
function showError(error) { $('#load-error').textContent=error.message; $('#load-error').hidden=false; }
async function request(loader) {
  controller?.abort(); controller=new AbortController();
  const id=state.begin(); loading(true); $('#load-error').hidden=true; $('#load-status').textContent='데이터 확인 중…';
  try {
    const snapshot=await loader(controller.signal);
    if (!state.isCurrent(id)) return;
    if (!snapshot) { $('#load-status').textContent='파일 선택을 취소했습니다.'; return; }
    if (state.commit(id,snapshot)) { $('#load-status').textContent='데이터를 불러왔습니다.'; await showResults(); }
  } catch(error) {
    if (state.isCurrent(id)) { showError(error); $('#load-status').textContent=state.snapshot?'이전 유효한 데이터는 유지됩니다.':'유효한 데이터가 아직 없습니다. 입력을 확인해주세요.'; }
  } finally { if(state.isCurrent(id)) { state.finish(id); loading(false); } }
}
function showHome() {
  shareDialog.close();
  controller?.abort(); state.home(); loading(false); stopViewer();
  $('#home').hidden=false; $('#results').hidden=true; $('nav').hidden=true;
  $('#resume').hidden=!state.snapshot; $('#load-error').hidden=true; $('#load-status').textContent='';
}
function renderSummary() {
  const {summary:s,source,missing}=state.snapshot;
  $('#source').textContent=source.name;
  $('#summary').replaceChildren();
  for (const [label,value] of [['최종 선정 크레인',s.finalCranes],['실제 자재 박스',s.materialBoxes],['활성 자재',s.activeMaterials],['GH Layout Errors',s.errors?.length ?? null],['건물',s.buildings],['검토 후보',s.candidates]]) {
    const card=textElement('div','', 'result-card'); card.append(textElement('div',label,'meta-label'),textElement('strong',value===null?'미제공 (missing)':String(value))); $('#summary').append(card);
  }
  $('#issue-list').replaceChildren();
  for (const [label,items] of [['GH Layout Errors',s.errors],['GH 경고',s.warnings],['누락 데이터',missing]]) {
    $('#issue-list').append(textElement('h3',label));
    if (items === null) $('#issue-list').append(textElement('p','미제공 (missing)'));
    else if (!items.length) $('#issue-list').append(textElement('p','없음'));
    else { const list=document.createElement('ul'); for(const item of items) list.append(textElement('li',item)); $('#issue-list').append(list); }
  }

}
async function showResults(tab=state.ui.tab) {
  state.open(tab); stopViewer(); const version=viewVersion;
  $('#home').hidden=true; $('#results').hidden=false; $('nav').hidden=false;
  $('#viewer-view').hidden=tab!=='viewer'; $('#layout-view').hidden=tab!=='layout'; $('#report-view').hidden=tab!=='report';
  $('#result-title').textContent=tab==='viewer'?'3D Viewer · 데이터 요약':tab==='layout'?'2D 배치도':'현장 보고서';
  document.querySelectorAll('[data-tab]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.tab===tab)));
  renderSummary(); $('#viewer-error').hidden=true;
  $('#layout-error').hidden=true;
  if(tab==='layout') {
    try {
      const {mountLayoutView}=await import('./layoutView.js');
      if(version!==viewVersion || state.ui.screen!=='results')return;
      disposeLayout=mountLayoutView(state.snapshot,$('#layout-host'));
    }catch(error){if(version===viewVersion){$('#layout-error').textContent='2D 배치도 표시 실패: '+error.message;$('#layout-error').hidden=false;}}
    return;
  }
  $('#report-error').hidden=true;
  if(tab==='report') {
    try {
      const {mountReportView}=await import('./reportView.js');
      if(version!==viewVersion || state.ui.screen!=='results')return;
      disposeReport=mountReportView(state.snapshot,$('#report-host'));
    }catch(error){if(version===viewVersion){$('#report-error').textContent='보고서 표시 실패: '+error.message;$('#report-error').hidden=false;}}
    return;
  }
  if(tab!=='viewer') return;
  try {
    const {mountSiteViewer}=await import('./viewer.js');
    if(version!==viewVersion || state.ui.screen!=='results') return;
    disposeViewer=mountSiteViewer(state.snapshot,$('#viewer-host'),state.viewerState);
  } catch(error) {
    if(version!==viewVersion) return;
    $('#viewer-error').textContent='현장 표시 실패: '+error.message; $('#viewer-error').hidden=false;
  }
}
$('#json-file').addEventListener('change',event=>{ const file=event.target.files?.[0]; event.target.value=''; if(file) request(()=>loadLocalJson(file)); });
$('#json-file').addEventListener('cancel',()=>{ $('#load-status').textContent='파일 선택을 취소했습니다. 기존 데이터는 유지됩니다.'; });
$('#url-form').addEventListener('submit',event=>{ event.preventDefault(); request(signal=>loadJsonUrl($('#json-url').value,{signal})); });
$('#cancel').addEventListener('click',()=>{ showHome(); $('#load-status').textContent='로딩을 취소했습니다. 기존 데이터는 유지됩니다.'; });
$('[data-action="home"]').addEventListener('click',showHome);
$('#resume').addEventListener('click',()=>showResults());
document.querySelectorAll('[data-tab]').forEach(button=>button.addEventListener('click',()=>showResults(button.dataset.tab)));

const sharedData = readSharedData(window.location.href);
const initialLoad = sharedData !== null ? (() => {
  $('#json-url').value = sharedData;
  return request(signal => loadJsonUrl(sharedData, { signal }));
})() : Promise.resolve();
