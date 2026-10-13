export function createAppState() {
  let snapshot = null, requestId = 0, viewerState = { saved:null };
  const ui = { screen:'home', tab:'viewer', loading:false };
  return {
    ui,
    get snapshot() { return snapshot; },
    get viewerState() { return viewerState; },
    begin() { ui.loading=true; return ++requestId; },
    isCurrent(id) { return id===requestId; },
    commit(id, next) { if (id!==requestId) return false; snapshot=next; viewerState={ saved:null }; ui.loading=false; ui.screen='results'; ui.tab='viewer'; return true; },
    finish(id) { if (id===requestId) ui.loading=false; },
    home() { ++requestId; ui.loading=false; ui.screen='home'; },
    open(tab='viewer') { if(snapshot) { ui.screen='results'; ui.tab=tab; } },
  };
}
