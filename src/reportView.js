import { createOutputFilename } from './outputFilename.js';
import { buildReportModel,renderReportHtml,createReportLayout } from './report.js';
export function prepareReportForPrint(root) {
  const states=[...root.querySelectorAll('details[data-print-expand]')].map(detail=>[detail,detail.open]);
  states.forEach(([detail])=>{detail.open=true;});
  return ()=>states.forEach(([detail,open])=>{detail.open=open;});
}
export function mountReportView(snapshot,host) {
  host.innerHTML='<div class="report-tools"><button id="report-print" disabled>PDF 저장 / 인쇄</button><button id="report-fullscreen">보고서 전체 화면</button><p id="report-action-status" role="status">보고서를 준비하고 있습니다.</p></div>'+renderReportHtml(buildReportModel(snapshot));
  const $=selector=>host.querySelector(selector);
  let disposed=false,url=null,restorePrint=null,restoreTitle=null,printPending=false;
  document.body.classList.add('report-active');
  const ready=(async()=>{
    try {
      if(document.fonts?.ready)await document.fonts.ready;
      if(disposed)return;
      const {blob}=await createReportLayout(snapshot);
      if(disposed)return;
      url=URL.createObjectURL(blob);const image=$('#report-layout-image');image.src=url;image.hidden=false;
      if(image.decode)await image.decode();
      else await new Promise((resolve,reject)=>{if(image.complete&&image.naturalWidth>0)resolve();else{image.onload=resolve;image.onerror=reject;}});
      if(disposed)return;
      $('#report-layout-status').textContent='현장 배치도 · 2400×1800 · DEMO 미포함';
    }catch(error){
      if(!disposed){$('#report-layout-image').hidden=true;$('#report-layout-status').textContent='배치도 삽입 실패: '+(error?.message??'이미지 준비 오류')+' · 나머지 보고서는 인쇄할 수 있습니다.';}
    }finally{
      if(!disposed){$('#report-print').disabled=false;$('#report-action-status').textContent='보고서가 준비되었습니다.';}
    }
  })();
  function beforePrint(){if(disposed)return;if(!restorePrint)restorePrint=prepareReportForPrint(host);document.body.classList.add('printing-report');}
  function afterPrint(){
    restorePrint?.();restorePrint=null;
    if(restoreTitle!==null){document.title=restoreTitle;restoreTitle=null;}
    printPending=false;document.body.classList.remove('printing-report');
    if(!disposed)$('#report-print').disabled=false;
  }
  async function print(){
    if(disposed||printPending)return;
    // Freeze local time at the click, before fonts/images/fullscreen can delay printing.
    const filename=createOutputFilename(snapshot.source,'Report',new Date());
    printPending=true;$('#report-print').disabled=true;
    await ready;if(disposed)return;
    try {
      if(document.fullscreenElement===host)await document.exitFullscreen();if(disposed)return;
      $('#report-print').disabled=true;restoreTitle=document.title;
      // Browsers typically append .pdf to the title; the final choice belongs to the user.
      document.title=filename.replace(/\.pdf$/i,'');
      beforePrint();window.print();
    } catch(error){
      if(disposed)return;
      afterPrint();$('#report-action-status').textContent='인쇄 대화상자 열기 실패: '+error.message;
    }
  }
  const printMedia=window.matchMedia?.('print');
  function printMediaChanged(event){if(!event.matches)afterPrint();}
  printMedia?.addEventListener?.('change',printMediaChanged);
  async function fullscreen(){
    try{if(document.fullscreenElement===host)await document.exitFullscreen();else if(host.requestFullscreen)await host.requestFullscreen();else throw new Error('전체 화면 미지원');}
    catch(error){if(!disposed)$('#report-action-status').textContent='보고서 전체 화면 실패: '+error.message;}
  }
  function fullscreenChanged(){if(!disposed)$('#report-fullscreen').textContent=document.fullscreenElement===host?'전체 화면 종료':'보고서 전체 화면';}
  $('#report-print').addEventListener('click',print);$('#report-fullscreen').addEventListener('click',fullscreen);
  window.addEventListener('beforeprint',beforePrint);window.addEventListener('afterprint',afterPrint);document.addEventListener('fullscreenchange',fullscreenChanged);
  return ()=>{
    disposed=true;afterPrint();printMedia?.removeEventListener?.('change',printMediaChanged);document.body.classList.remove('report-active');
    window.removeEventListener('beforeprint',beforePrint);window.removeEventListener('afterprint',afterPrint);document.removeEventListener('fullscreenchange',fullscreenChanged);
    $('#report-print')?.removeEventListener('click',print);$('#report-fullscreen')?.removeEventListener('click',fullscreen);
    if(document.fullscreenElement===host)document.exitFullscreen?.().catch(()=>{});
    if(url)URL.revokeObjectURL(url);host.replaceChildren();
  };
}
