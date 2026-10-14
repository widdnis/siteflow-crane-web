import { createVehicleVisual,getDemoVehiclePath } from './vehicle.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildSiteScene, setRecordHighlight, findSiteRecord, getViewPose, disposeScene } from './siteScene.js';

export function mountSiteViewer(snapshot,host,persistence={saved:null}) {
  const saved=persistence.saved;
  const model=buildSiteScene(snapshot), scene=new THREE.Scene(); scene.background=new THREE.Color(0x162232); scene.add(model.root);
  scene.add(new THREE.HemisphereLight(0xffffff,0x52627e,2.5));
  const light=new THREE.DirectionalLight(0xffffff,3); light.position.set(80,120,50); scene.add(light);
  host.classList.add('site-viewer');
  host.innerHTML=`<div class="viewer-toolbar" role="toolbar" aria-label="카메라 시점">
    <button data-view="Top">Top</button><button data-view="Front">Front</button><button data-view="Side">Side</button><button data-view="Free" aria-pressed="true">Free</button><button id="viewer-fullscreen">전체 화면</button>
    <label class="radius-toggle"><input id="show-radius" type="checkbox" checked>작업 반경</label></div>
    <div class="viewer-columns"><div class="viewer-stage" aria-label="현장 3D 장면"><div id="status" role="status"></div><div class="demo-badge" hidden>DEMO · 실제 도로 아님</div></div>
    <aside class="viewer-panel">
    <section class="vehicle-controls" aria-label="차량 경로 제어">
    <h3>경로 차량</h3><p id="vehicle-path-status"></p>
    <label class="radius-toggle"><input id="vehicle-centerline" type="checkbox">JSON 현장 중심선 주행 미리보기</label>
    <p id="vehicle-centerline-note" class="notice" hidden>JSON 중심선 좌표 그대로 주행합니다. 원본 vehicle_enabled 및 운용 경로 선언을 변경하지 않습니다. 중심선 간 자동 연결은 하지 않습니다.</p>
    <label class="demo-toggle"><input id="vehicle-demo" type="checkbox">DEMO 경로 켜기 (실제 도로 아님)</label>
    <p id="vehicle-demo-note" class="notice warn" hidden>DEMO · 별도 예시 경로입니다. 실제 현장·주행 안전 검증에 사용하지 마세요.</p>
    <label for="vehicle-route">주행 경로</label><select id="vehicle-route"></select>
    <label for="vehicle-direction">주행 방향</label><select id="vehicle-direction"><option value="1">전진</option><option value="-1">후진</option></select>
    <label for="vehicle-speed">설정 속도 <output id="vehicle-speed-value">2.0 m/s</output></label><input id="vehicle-speed" type="range" min="0" max="10" step="0.1" value="2">
    <div class="vehicle-actions"><button id="vehicle-start">시작</button><button id="vehicle-stop">정지</button><button id="vehicle-reset">초기화</button></div>
    <p id="vehicle-state" role="status" aria-live="off"></p><p class="muted">표시용 차량입니다. 실제 차량의 크기·속도·운용 사양을 나타내지 않습니다.</p>
    </section><label for="object-select">현장 객체 선택</label><select id="object-select"><option value="">선택 해제</option></select>
    <p id="selection-title">객체를 클릭하거나 목록에서 선택하세요.</p>
    <div id="building-controls" hidden><label for="building-height">건물 높이 시각화 <output id="building-value"></output></label><input id="building-height" type="range" min="0" max="1" step="0.01"><p class="muted">0–현재 JSON 높이의 100%. 시공 일정·미래 높이 예측을 나타내지 않습니다.</p></div>
    <section id="rotation-controls" hidden><h3>선택 크레인 3축 제어</h3>
    <label for="rotation-angle">붐 Y축 회전 <output id="rotation-value"></output></label><input id="rotation-angle" type="range" min="0" max="360" step="0.1">
    <label for="trolley-distance">트롤리 거리 <output id="trolley-value"></output></label><input id="trolley-distance" type="range" min="0" step="0.1">
    <label for="hook-height">후크 높이 (Y) <output id="hook-value"></output></label><input id="hook-height" type="range" step="0.1">
    <button id="auto-rotate" aria-pressed="false">자동 회전 시작</button><p class="muted">표시된 이동 범위는 실제 장비의 운용 한계로 검증되지 않았습니다.</p></section>
    <details id="json-properties"><summary>선택 객체 원본 JSON 속성</summary><pre id="object-properties"></pre></details>
    <details><summary>GH 오류·경고 (원본)</summary><div id="viewer-gh"></div></details>
    <details><summary>표시 한계·미지원</summary><ul id="viewer-limitations"></ul></details>
    <p class="viewer-message" role="status" aria-live="polite"></p></aside></div>`;
  const $=selector=>host.querySelector(selector), stage=$('.viewer-stage');
  const labels=[];
  let vehicle=null,vehicleDemo=false,vehicleCenterline=false,viewBounds=model.bounds.clone();
  let renderer, observer, controls, camera, selected=null, frame=null, previous=null, disposed=false, view='Free';
  let checkpoint=null;
  const listeners=[];
  const listen=(target,event,handler,options)=>{target.addEventListener(event,handler,options); listeners.push(()=>target.removeEventListener(event,handler,options));};
  const width=()=>Math.max(1,stage.clientWidth), height=()=>Math.max(1,stage.clientHeight);
  function dispose() {
    if(disposed) return; disposed=true;
    model.records.forEach(r=>{if(r.control)r.control.autoRotating=false;});
    vehicle?.motion.stop();
    if(checkpoint)persistence.saved=checkpoint();
    vehicle?.dispose();vehicle=null;
    cancelAnimationFrame(frame); observer?.disconnect(); listeners.forEach(remove=>remove()); controls?.dispose();
    if(document.fullscreenElement===host) document.exitFullscreen?.().catch(()=>{});
    disposeScene(scene); renderer?.dispose(); renderer?.forceContextLoss(); host.replaceChildren(); host.classList.remove('site-viewer','demo-active');
  }
  try {
    renderer=new THREE.WebGLRenderer({antialias:true}); renderer.setPixelRatio(Math.min(devicePixelRatio,2)); renderer.setSize(width(),height()); stage.appendChild(renderer.domElement);
    const perspective=new THREE.PerspectiveCamera(45,width()/height(),0.1,2000);
    const ortho=new THREE.OrthographicCamera(-1,1,1,-1,0.1,2000);
    function render(){
      if(disposed || !camera)return;
      renderer.render(scene,camera);
      for(const {record,element} of labels) {
        const p=new THREE.Vector3(record.data.position.x,record.data.position.y+record.data.height_m,record.data.position.z).project(camera);
        element.hidden=p.z < -1 || p.z > 1 || Math.abs(p.x)>1 || Math.abs(p.y)>1;
        element.style.left=((p.x+1)/2*width())+'px'; element.style.top=((-p.y+1)/2*height())+'px';
      }
    }
    function setView(next) {
      view=next; const pose=getViewPose(viewBounds,view,width()/height(),model.siteCenter);
      camera=pose.orthographic?ortho:perspective;
      camera.up.set(0,view==='Top'?0:1,view==='Top'?-1:0); camera.position.copy(pose.position); camera.zoom=1;
      camera.near=Math.max(0.01,pose.radius*.001); camera.far=Math.max(1000,pose.distance+pose.radius*40);
      controls?.dispose(); camera.lookAt(pose.center); controls=new OrbitControls(camera,renderer.domElement); controls.target.copy(pose.center);
      controls.minDistance=Math.max(0.5,pose.radius*.02); controls.maxDistance=Math.max(500,pose.distance*20);
      controls.minZoom=.1; controls.maxZoom=50; controls.addEventListener('change',render);
      resize(); controls.update();
      host.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)));
    }
    function resize() {
      const aspect=width()/height();
      perspective.aspect=aspect; perspective.updateProjectionMatrix();
      const span=getViewPose(viewBounds,'Top',aspect,model.siteCenter).span;
      ortho.left=-span*aspect/2; ortho.right=span*aspect/2; ortho.top=span/2; ortho.bottom=-span/2; ortho.updateProjectionMatrix();
      renderer.setSize(width(),height()); render();
    }
    function syncCraneControls() {
      const c=selected?.control; if(!c)return;
      $('#rotation-angle').value=c.angle; $('#rotation-value').value=c.angle.toFixed(1)+'°';
      $('#trolley-distance').max=c.radius; $('#trolley-distance').value=c.trolleyDistance; $('#trolley-value').value=c.trolleyDistance.toFixed(1)+' / '+c.radius+' m';
      $('#hook-height').min=c.minHookHeight; $('#hook-height').max=c.maxHookHeight; $('#hook-height').value=c.hookHeight; $('#hook-value').value=c.hookHeight.toFixed(1)+' m';
      $('#auto-rotate').textContent=c.autoRotating?'자동 회전 정지':'자동 회전 시작'; $('#auto-rotate').setAttribute('aria-pressed',String(c.autoRotating));
    }
    function select(record) {
      if(selected) { setRecordHighlight(selected,false); if(selected.control)selected.control.autoRotating=false; }
      selected=record; $('#object-select').value=record?String(model.records.indexOf(record)):'';
      $('#rotation-controls').hidden=!record?.control; $('#building-controls').hidden=!record?.setHeight; $('#json-properties').hidden=!record;
      $('#selection-title').textContent=record?record.id+' · '+record.kind:'객체를 클릭하거나 목록에서 선택하세요.';
      $('#object-properties').textContent=record?JSON.stringify(record.data,null,2):'';
      if(record) setRecordHighlight(record,true);
      if(record?.setHeight) { $('#building-height').value=record.heightRatio; $('#building-value').value=(record.data.current_height_m*record.heightRatio).toFixed(1)+' / '+record.data.current_height_m+' m'; }
      syncCraneControls(); render();
    }
    for(const [i,record] of model.records.entries()) { const option=document.createElement('option'); option.value=i; option.textContent=record.id+' · '+(record.data.name??record.kind); $('#object-select').append(option); }
    for(const record of model.records.filter(r=>r.control)) {
      const element=document.createElement('button');element.className='crane-label';element.textContent=record.id;stage.append(element);
      listen(element,'click',()=>select(record));labels.push({record,element});
    }
    const limitations=[...model.omitted,'크레인 형상·회전 중심·운용 사양은 실제 장비 기준으로 검증되지 않았습니다.','회전각은 입력 데이터 기준이며 실제 장비 방향과의 일치는 미검증입니다.','게이트는 위치만 표시합니다. 실제 크기·형상은 미제공입니다.','금지구역은 평면으로 표시합니다. 검토 후보는 현장에 배치하지 않습니다.'];
    for(const text of limitations) {const li=document.createElement('li');li.textContent=text;$('#viewer-limitations').append(li);}
    for(const [title,items] of [['GH Layout Errors',snapshot.summary.errors],['GH 경고',snapshot.summary.warnings]]) {
      const heading=document.createElement('strong');heading.textContent=title;$('#viewer-gh').append(heading);
      if(items===null){const p=document.createElement('p');p.textContent='미제공 (missing)';$('#viewer-gh').append(p);}
      else if(!items.length){const p=document.createElement('p');p.textContent='없음';$('#viewer-gh').append(p);}
      else {const list=document.createElement('ul');for(const text of items){const li=document.createElement('li');li.textContent=text;list.append(li);}$('#viewer-gh').append(list);}
    }
    const count=kind=>model.records.filter(r=>r.kind===kind).length;
    $('#status').textContent='최종 크레인 '+model.records.filter(r=>r.control).length+' · 실제 자재 '+count('실제 자재 박스')+' · 건물 '+count('건물')+'\n드래그: Orbit · 오른쪽 드래그: Pan · 휠: Zoom\nGH 오류 '+(snapshot.summary.errors?.length??'missing')+' · 원본 경고 '+(snapshot.summary.warnings?.length??'missing')+' (정보 패널의 GH 오류·경고에서 확인)';
    if(snapshot.data.terrain?.available) $('#status').textContent+='\n외부 지형 · 표고/CRS 미검증 · '+snapshot.data.terrain.mesh.vertices.length+' 정점 / '+snapshot.data.terrain.mesh.faces.length+' 면';
    if(model.environment) $('#status').textContent+='\n주변 100m · 건물 '+model.environment.stats.buildingDisplayed+' / '+model.environment.stats.buildingSource+' · 도로 '+model.environment.stats.roadDisplayed+' / '+model.environment.stats.roadSource+' · 공통 높이 보정 '+model.environment.alignment.appliedOffset.toFixed(6)+'m (경계 중앙값 기준)';
    listen($('#object-select'),'change',()=>select($('#object-select').value===''?null:model.records[Number($('#object-select').value)]));
    host.querySelectorAll('[data-view]').forEach(button=>listen(button,'click',()=>setView(button.dataset.view)));
    listen($('#show-radius'),'change',()=>{model.records.forEach(r=>{if(r.radiusRing)r.radiusRing.visible=$('#show-radius').checked;});render();});
    listen($('#building-height'),'input',()=>{ if(!selected?.setHeight)return; selected.setHeight(Number($('#building-height').value)); $('#building-value').value=(selected.data.current_height_m*selected.heightRatio).toFixed(1)+' / '+selected.data.current_height_m+' m'; render();});
    listen($('#rotation-angle'),'input',()=>{selected?.control?.setRotation(Number($('#rotation-angle').value));syncCraneControls();render();});
    listen($('#trolley-distance'),'input',()=>{selected?.control?.setTrolley(Number($('#trolley-distance').value));syncCraneControls();render();});
    listen($('#hook-height'),'input',()=>{selected?.control?.setHookHeight(Number($('#hook-height').value));syncCraneControls();render();});

    const routeInventory=snapshot.routes;
    const centerlinePaths=routeInventory.centerlinePaths??[];
    function selectedVehiclePaths() {
      return vehicleDemo?[getDemoVehiclePath(),...routeInventory.demoPaths]:vehicleCenterline?centerlinePaths:routeInventory.actualPaths;
    }
    function syncVehicle() {
      if(!vehicle){$('#vehicle-state').textContent='주행 불가: 선택한 모드에 유효한 차량 경로 없음';return;}
      vehicle.sync();
      const m=vehicle.motion, names={idle:'초기화 / 정지',running:'주행 중',paused:'정지',ended:'경로 끝에서 정지'};
      $('#vehicle-speed').value=m.speed;$('#vehicle-speed-value').value=m.speed.toFixed(1)+' m/s';
      $('#vehicle-direction').value=String(m.direction);
      $('#vehicle-state').textContent=(vehicleDemo?'DEMO · ':vehicleCenterline?'JSON 중심선 미리보기 · ':'JSON 선언 경로 · ')+(names[m.status]??m.status)+' · '+(m.direction===1?'전진':'후진')+' · 현재 '+(m.running?m.speed:0).toFixed(1)+' m/s · '+m.distance.toFixed(1)+' / '+m.path.length.toFixed(1)+' m';
      $('#vehicle-start').disabled=m.running;$('#vehicle-stop').disabled=!m.running;
    }
    function queueFrame() { if(frame===null&&!disposed)frame=requestAnimationFrame(animate); }
    function changeVehicleRoute() {
      vehicle?.dispose();vehicle=null;
      const paths=selectedVehiclePaths();
      const path=paths[Number($('#vehicle-route').value)];
      if(path){vehicle=createVehicleVisual(path,vehicleDemo);scene.add(vehicle.root);}
      for(const id of ['vehicle-direction','vehicle-speed','vehicle-start','vehicle-stop','vehicle-reset'])$('#'+id).disabled=!vehicle;
      viewBounds=model.bounds.clone();if(vehicle)viewBounds.union(vehicle.bounds);
      syncVehicle();setView(view);
    }
    function changeVehicleMode(routeId=null) {
      vehicleDemo=$('#vehicle-demo').checked;
      vehicleCenterline=!vehicleDemo&&$('#vehicle-centerline').checked;
      const paths=selectedVehiclePaths();
      $('#vehicle-route').replaceChildren();$('#vehicle-route').disabled=!paths.length;
      for(const [i,path]of paths.entries()){const option=document.createElement('option');option.value=i;option.textContent=(vehicleDemo?'DEMO · ':vehicleCenterline?'JSON 중심선 · ':'JSON 선언 · ')+path.id+' · '+path.length.toFixed(1)+' m'+(path.closed?' · 폐곡선':' · 열린 구간');$('#vehicle-route').append(option);}
      $('#vehicle-demo-note').hidden=!vehicleDemo;$('.demo-badge').hidden=!vehicleDemo;host.classList.toggle('demo-active',vehicleDemo);
      $('#vehicle-centerline-note').hidden=!vehicleCenterline;
      $('#vehicle-centerline').disabled=!centerlinePaths.length;
      $('#vehicle-path-status').textContent='JSON 선언 차량 경로 '+routeInventory.actualPaths.length+'개 · 현장 중심선 미리보기 '+centerlinePaths.length+'개 · 선언 상태 '+routeInventory.status+(routeInventory.warnings.length?' · '+routeInventory.warnings.join(' / '):'')+(!routeInventory.actualPaths.length&&!centerlinePaths.length?' · 실제 JSON 주행 불가':'');
      const index=paths.findIndex(path=>path.id===routeId);
      $('#vehicle-route').value=String(index<0?0:index);
      changeVehicleRoute();
    }
    listen($('#vehicle-demo'),'change',()=>{if($('#vehicle-demo').checked)$('#vehicle-centerline').checked=false;changeVehicleMode();});
    listen($('#vehicle-centerline'),'change',()=>{if($('#vehicle-centerline').checked)$('#vehicle-demo').checked=false;changeVehicleMode();});
    listen($('#vehicle-route'),'change',changeVehicleRoute);
    listen($('#vehicle-direction'),'change',()=>{vehicle?.motion.setDirection(Number($('#vehicle-direction').value));syncVehicle();render();});
    listen($('#vehicle-speed'),'input',()=>{vehicle?.motion.setSpeed(Number($('#vehicle-speed').value));syncVehicle();render();});
    listen($('#vehicle-start'),'click',()=>{vehicle?.motion.start();syncVehicle();queueFrame();});
    listen($('#vehicle-stop'),'click',()=>{vehicle?.motion.stop();syncVehicle();render();});
    listen($('#vehicle-reset'),'click',()=>{vehicle?.motion.reset();syncVehicle();render();});
    function animate(time) {
      frame=null;if(disposed)return;
      const active=model.records.filter(r=>r.control?.autoRotating);
      if(!active.length&&!vehicle?.motion.running){previous=null;return;}
      if(previous!==null) {
        const delta=Math.min((time-previous)/1000,.1);
        for(const r of active)r.control.setRotation(r.control.angle+12*delta);
        vehicle?.motion.advance(delta);
      }
      previous=time;syncCraneControls();syncVehicle();render();
      if(active.length||vehicle?.motion.running)queueFrame();else previous=null;
    }
    listen($('#auto-rotate'),'click',()=>{if(!selected?.control)return;selected.control.autoRotating=!selected.control.autoRotating;previous=null;syncCraneControls();if(selected.control.autoRotating)queueFrame();});
    listen(document,'visibilitychange',()=>{previous=null;});
    const raycaster=new THREE.Raycaster();raycaster.params.Line.threshold=1;
    let press=null;
    listen(renderer.domElement,'pointerdown',event=>{if(event.button===0)press={x:event.clientX,y:event.clientY,id:event.pointerId};});
    listen(renderer.domElement,'pointercancel',()=>{press=null;});
    listen(renderer.domElement,'pointerup',event=>{
      const down=press;press=null;if(!down||down.id!==event.pointerId||Math.hypot(event.clientX-down.x,event.clientY-down.y)>5)return;
      const rect=renderer.domElement.getBoundingClientRect();
      raycaster.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),camera);
      const hit=raycaster.intersectObjects(model.records.map(r=>r.object),true).map(h=>findSiteRecord(h.object)).find(Boolean);
      select(hit??null);
    });
    listen($('#viewer-fullscreen'),'click',async()=>{
      try { if(document.fullscreenElement===host)await document.exitFullscreen();else if(host.requestFullscreen)await host.requestFullscreen();else throw new Error('이 브라우저는 전체 화면을 지원하지 않습니다.'); }
      catch(error){if(!disposed)$('.viewer-message').textContent='전체 화면 실패: '+error.message;}
    });
    listen(document,'fullscreenchange',()=>{if(disposed)return;$('#viewer-fullscreen').textContent=document.fullscreenElement===host?'전체 화면 종료':'전체 화면';resize();});
    listen(window,'resize',resize);observer=new ResizeObserver(resize);observer.observe(stage);
    // Restore after defaults/route setup; no subsequent initialization may reset pose.
    $('#vehicle-demo').checked=saved?.vehicle?.demo??false;
    $('#vehicle-centerline').checked=saved?.vehicle?.centerline??(!routeInventory.actualPaths.length&&centerlinePaths.length>0&&!$('#vehicle-demo').checked);
    changeVehicleMode(saved?.vehicle?.routeId);
    if(saved) {
      for(const record of model.records) {
        const c=saved.cranes.find(item=>item.id===record.id);
        if(c&&record.control) {
          record.control.setRotation(c.angle);record.control.setTrolley(c.trolley);
          record.control.setHookHeight(c.hookHeight);record.control.autoRotating=false;
        }
        const building=saved.buildings.find(item=>item.id===record.id);
        if(building&&record.setHeight)record.setHeight(building.ratio);
        if(record.radiusRing)record.radiusRing.visible=saved.showRadius;
      }
      $('#show-radius').checked=saved.showRadius;
      if(vehicle&&vehicle.motion.path.id===saved.vehicle?.routeId&&vehicleDemo===saved.vehicle.demo&&vehicleCenterline===(saved.vehicle.centerline??false))vehicle.motion.restore(saved.vehicle);
      select(model.records.find(record=>record.id===saved.selectedId)??null);
      setView(saved.camera.view);
      camera.position.fromArray(saved.camera.position);camera.up.fromArray(saved.camera.up);
      camera.zoom=saved.camera.zoom;controls.target.fromArray(saved.camera.target);
      camera.updateProjectionMatrix();controls.update();syncVehicle();render();
    } else select(model.records.find(r=>r.id==='TC1')??null);
    checkpoint=()=>({
      cranes:model.records.filter(r=>r.control).map(r=>({id:r.id,angle:r.control.angle,trolley:r.control.trolleyDistance,hookHeight:r.control.hookHeight})),
      buildings:model.records.filter(r=>r.setHeight).map(r=>({id:r.id,ratio:r.heightRatio})),
      selectedId:selected?.id??null,showRadius:$('#show-radius').checked,
      vehicle:vehicle?{demo:vehicleDemo,centerline:vehicleCenterline,routeId:vehicle.motion.path.id,distance:vehicle.motion.distance,direction:vehicle.motion.direction,speed:vehicle.motion.speed}:null,
      camera:{view,position:camera.position.toArray(),up:camera.up.toArray(),target:controls.target.toArray(),zoom:camera.zoom},
    });
    if(model.bounds.isEmpty())$('.viewer-message').textContent='표시 가능한 형상이 없습니다. 입력 데이터와 missing 항목을 확인해주세요.';
    return dispose;
  } catch(error) { dispose(); throw error; }
}
