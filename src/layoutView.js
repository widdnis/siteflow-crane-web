import { renderLayoutCanvas,createLayoutPng } from './layout.js';
export function mountLayoutView(snapshot,host) {
  host.innerHTML=`<div class="layout-toolbar"><h3>2D 배치도</h3><button id="layout-download">PNG 저장</button></div>
  <p class="notice">입력 데이터 기준 현장 배치도입니다. DEMO 차량·경로는 포함하지 않습니다. 원본 색상·레이어 정보는 미제공입니다.</p>
  <p id="layout-status" role="status"></p><div class="layout-canvas-wrap"><canvas aria-label="현장 JSON 2D 배치도"></canvas></div>
  <details open><summary>누락 정보 및 데이터 경고</summary><div id="layout-notes"></div></details>`;
  const $=selector=>host.querySelector(selector);
  let disposed=false,objectUrl=null,timer=null;
  const result=renderLayoutCanvas(snapshot,$('canvas'));
  const notes=[...result.model.missing,...result.model.warnings,...(result.model.ghErrors??[]),...(result.model.ghWarnings??[])];
  const ul=document.createElement('ul');for(const text of notes){const li=document.createElement('li');li.textContent=text;ul.append(li);}$('#layout-notes').append(ul);
  $('#layout-status').textContent='건물 '+result.model.counts.buildings+' · 실제 자재 '+result.model.counts.materials+' · 최종 크레인 '+result.model.counts.cranes+' · DEMO 미포함';
  async function download(){
    const outputTime=new Date();
    const button=$('#layout-download');button.disabled=true;$('#layout-status').textContent='PNG 준비 중…';
    try {
      if(document.fonts?.ready)await document.fonts.ready;
      if(disposed)return;
      const {blob,filename}=await createLayoutPng(snapshot,{outputTime});
      if(disposed)return;
      if(objectUrl)URL.revokeObjectURL(objectUrl);clearTimeout(timer);
      objectUrl=URL.createObjectURL(blob);
      const anchor=document.createElement('a');anchor.href=objectUrl;anchor.download=filename;host.append(anchor);anchor.click();anchor.remove();
      $('#layout-status').textContent='PNG 다운로드를 요청했습니다: '+filename+' (2400×1800)';
      timer=setTimeout(()=>{if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl=null;}},30000);
    }catch(error){if(!disposed)$('#layout-status').textContent='PNG 출력 실패: '+error.message;}
    finally{if(!disposed)button.disabled=false;}
  }
  $('#layout-download').addEventListener('click',download);
  return ()=>{disposed=true;clearTimeout(timer);if(objectUrl)URL.revokeObjectURL(objectUrl);$('#layout-download')?.removeEventListener('click',download);host.replaceChildren();};
}
