const EPS=1e-9;
export function compileVehiclePath(raw) {
  if(!raw || typeof raw.id!=='string' || !raw.id.trim()) throw new Error('경로 id가 필요합니다.');
  if(!Array.isArray(raw.points) || raw.points.length<2 || raw.points.length>20000) throw new Error('경로는 2–20,000개 점이 필요합니다.');
  if(raw.closed != null && typeof raw.closed!=='boolean') throw new Error('closed는 boolean이어야 합니다.');
  const points=raw.points.map(p=>{
    if(!p || !['x','y','z'].every(k=>typeof p[k]==='number' && Number.isFinite(p[k]))) throw new Error('경로 점의 x/y/z는 유한한 숫자여야 합니다.');
    return {x:p.x,y:p.y,z:p.z};
  });
  if(raw.closed && Math.hypot(points[0].x-points.at(-1).x,points[0].y-points.at(-1).y,points[0].z-points.at(-1).z)>EPS) points.push({...points[0]});
  let length=0; const segments=[];
  for(let i=1;i<points.length;i++) {
    const a=points[i-1],b=points[i],dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,span=Math.hypot(dx,dy,dz);
    if(span<=EPS) continue;
    if(!Number.isFinite(span) || !Number.isFinite(length+span)) throw new Error('경로 길이 범위를 초과했습니다.');
    if(Math.hypot(dx,dz)<=EPS) throw new Error('수직 구간은 지상 차량 경로로 지원하지 않습니다.');
    segments.push({a,b,start:length,end:length+span,length:span,tangent:{x:dx/span,y:dy/span,z:dz/span}});
    length+=span;
  }
  if(!segments.length) throw new Error('길이가 있는 차량 경로 구간이 필요합니다.');
  return {id:raw.id,source_kind:raw.source_kind,closed:raw.closed===true,points,segments,length};
}
export function collectVehiclePaths(data) {
  const actualPaths=[],centerlinePaths=[],demoPaths=[],warnings=[];
  const raw=data.roads?.vehicle_paths;
  let status=raw==null?'missing':Array.isArray(raw)&&raw.length===0?'empty':'invalid';
  const ids=new Set();
  function add(candidate,label) {
    try {
      if(!candidate || !['gh','demo'].includes(candidate.source_kind)) throw new Error('source_kind gh 또는 demo로 원천 구분이 필요합니다.');
      if(ids.has(candidate.id)) throw new Error('중복 경로 id');
      const path=compileVehiclePath(candidate);ids.add(path.id);
      (path.source_kind==='gh'?actualPaths:demoPaths).push(path);
    } catch(error) { warnings.push(label+': '+error.message); }
  }
  if(Array.isArray(raw)) raw.forEach((path,i)=>add(path,'roads.vehicle_paths['+i+']'));
  else if(raw!=null) warnings.push('roads.vehicle_paths는 배열이어야 합니다.');
  if(Array.isArray(data.roads?.centerlines)) {
    const centerlineIds=new Set();
    data.roads.centerlines.forEach((path,i)=>{
      if(path?.vehicle_enabled===true) add(path,'roads.centerlines['+i+']');
      // Geometry preview is separate from exporter-declared vehicle routes.
      // v1.6 exports C090 centerlines without source_kind and with vehicle_enabled:false.
      // Keep those declarations intact; never promote DEMO/unknown sources or join roads.
      if(path?.source_kind!=null&&path.source_kind!=='gh')return;
      if(path?.vehicle_enabled===true&&path.source_kind==='gh')return;
      try {
        const compiled=compileVehiclePath(path);
        if(centerlineIds.has(compiled.id))throw new Error('중복 중심선 id');
        centerlineIds.add(compiled.id);
        centerlinePaths.push({...compiled,source_field:'roads.centerlines['+i+']',path_kind:'centerline'});
      } catch(error) { warnings.push('roads.centerlines['+i+']: '+error.message); }
    });
    if(centerlinePaths.length) warnings.push('JSON 중심선은 별도 미리보기로만 사용합니다. 원본 vehicle_enabled와 운용 경로 선언은 유지됩니다.');
  }
  else if(data.roads?.centerlines!=null) warnings.push('roads.centerlines는 배열이어야 합니다.');
  if(data.vehicle_paths!=null) warnings.push('루트 vehicle_paths는 지원하지 않습니다. roads.vehicle_paths 계약을 사용해주세요.');
  if(actualPaths.length||demoPaths.length)status='present';
  return {status,actualPaths,centerlinePaths,demoPaths,warnings};
}
export function sampleVehiclePath(path,distance,direction=1) {
  const d=Math.min(path.length,Math.max(0,distance));
  // Binary search keeps lookup bounded on long exported polylines.
  let lo=0,hi=path.segments.length-1;
  while(lo<hi) {
    const mid=(lo+hi)>>1;
    if(d>path.segments[mid].end || (direction>0&&d===path.segments[mid].end))lo=mid+1;else hi=mid;
  }
  const s=path.segments[lo],t=Math.min(1,Math.max(0,(d-s.start)/s.length));
  return {position:{x:s.a.x+(s.b.x-s.a.x)*t,y:s.a.y+(s.b.y-s.a.y)*t,z:s.a.z+(s.b.z-s.a.z)*t},tangent:s.tangent,distance:d};
}
export function createVehicleMotion(path) {
  let distance=0,speed=2,direction=1,running=false,status='idle',disposed=false;
  const finite=v=>{if(!Number.isFinite(v))throw new Error('유한한 차량 제어 값이 필요합니다.');return v;};
  return {
    path,
    get distance(){return distance;},get speed(){return speed;},get direction(){return direction;},
    get running(){return running;},get status(){return status;},
    get pose(){return sampleVehiclePath(path,distance,direction);},
    setSpeed(value){if(disposed)return;speed=Math.max(0,Math.min(10,finite(value)));if(speed===0){running=false;status='paused';}},
    setDirection(value){if(disposed)return;if(value!==1&&value!==-1)throw new Error('direction은 1 또는 -1입니다.');direction=value;},
    // UI-only checkpoint restoration deliberately never resumes animation.
    restore(saved){
      if(disposed)return;
      const nextDistance=Math.min(path.length,Math.max(0,finite(saved.distance)));
      const nextSpeed=Math.max(0,Math.min(10,finite(saved.speed)));
      if(saved.direction!==1&&saved.direction!==-1)throw new Error('Invalid direction');
      distance=nextDistance;speed=nextSpeed;direction=saved.direction;running=false;status='paused';
    },
    start(){if(disposed)return;const end=direction===1?distance>=path.length:distance<=0;running=!end&&speed>0;status=end?'ended':running?'running':'paused';},
    stop(){if(disposed)return;running=false;status='paused';},
    reset(){if(disposed)return;distance=0;direction=1;running=false;status='idle';},
    advance(seconds){
      if(disposed||!running)return;
      distance=Math.min(path.length,Math.max(0,distance+direction*speed*Math.max(0,finite(seconds))));
      if((direction===1&&distance>=path.length)||(direction===-1&&distance<=0)){running=false;status='ended';}
    },
    dispose(){disposed=true;running=false;status='disposed';},
  };
}
