import * as THREE from 'three';
import { createCrane, createCraneController } from './crane.js';
import { buildSurroundings } from './surroundings.js';

export function buildSiteScene(snapshot) {
  const data=snapshot.data, root=new THREE.Group(), records=[], omitted=[];
  root.name='SiteFlow Site';
  function register(object, kind, item, id=item.id) {
    const record={object,kind,data:item,id,control:null};
    object.userData.siteRecord=record; root.add(object); records.push(record); return record;
  }
  const material=(color, extra={})=>new THREE.MeshStandardMaterial({color,side:THREE.DoubleSide,...extra});
  function flatPolygon(poly,color,filled=true) {
    const group=new THREE.Group();
    const pts=poly.points.map(p=>new THREE.Vector3(p.x,p.y,p.z));
    group.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color})));
    if(filled) {
      const floor=poly.points[0].y;
      if(poly.points.some(p=>Math.abs(p.y-floor)>0.001)) { omitted.push('평면이 아닌 폴리곤의 면 채움은 미지원'); return group; }
      const shape=new THREE.Shape(poly.points.map(p=>new THREE.Vector2(p.x,-p.z)));
      const mesh=new THREE.Mesh(new THREE.ShapeGeometry(shape),material(color,{transparent:true,opacity:0.18,depthWrite:false}));
      mesh.rotation.x=-Math.PI/2; mesh.position.y=floor; group.add(mesh);
    }
    return group;
  }
  if(data.site?.boundary) register(flatPolygon(data.site.boundary,0x829ba7),'현장 경계',data.site.boundary,'site.boundary');
  else omitted.push('site.boundary: missing');
  (data.site?.no_go ?? []).forEach((p,i)=>register(flatPolygon(p,0xc39326),'금지구역',p,'site.no_go.'+i));
  if(data.site?.gate) {
    const marker=new THREE.Mesh(new THREE.SphereGeometry(1,12,8),material(0x246b45));
    marker.position.set(data.site.gate.x,data.site.gate.y,data.site.gate.z);
    register(marker,'게이트 위치 기호 (크기는 표시용)',data.site.gate,'site.gate');
  } else omitted.push('site.gate: missing');
  for(const b of data.buildings ?? []) {
    if(!b.footprint || b.current_height_m == null) { omitted.push(b.id+': 건물 형상/높이 missing'); continue; }
    const floor=b.footprint.points[0].y;
    if(b.footprint.points.some(p=>Math.abs(p.y-floor)>0.001)) { omitted.push(b.id+': 비평면 footprint 미지원'); continue; }
    const group=new THREE.Group(); group.position.y=floor;
    const shape=new THREE.Shape(b.footprint.points.map(p=>new THREE.Vector2(p.x,-p.z)));
    const geometry=new THREE.ExtrudeGeometry(shape,{depth:b.current_height_m,bevelEnabled:false,steps:1});
    geometry.rotateX(-Math.PI/2);
    const mesh=new THREE.Mesh(geometry,material(0xaabcc5)); group.add(mesh);
    const record=register(group,'건물',b);
    record.heightRatio=1;
    record.setHeight=ratio=>{ record.heightRatio=THREE.MathUtils.clamp(ratio,0,1); mesh.scale.y=record.heightRatio; };
  }
  const triangles=[0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7];
  for(const m of data.materials ?? []) {
    if(!m.corners || m.corners.length!==8) { omitted.push(m.id+': corners missing'); continue; }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(m.corners.flatMap(p=>[p.x,p.y,p.z]),3));
    geometry.setIndex(triangles); geometry.computeVertexNormals();
    register(new THREE.Mesh(geometry,material(0x3db9ff)),'실제 자재 박스',m);
  }
  for(const c of data.cranes) {
    if(!c.position || !(c.height_m>0) || !(c.working_radius_m>0) || !Number.isFinite(c.base_direction_degrees_rhino)) {
      omitted.push(c.id+': 크레인 표시 필수 값 missing'); continue;
    }
    const crane=createCrane(c), record=register(crane,'크레인 (표시용)',c);
    record.control=createCraneController(crane,c);
    const points=Array.from({length:128},(_,i)=>{const a=i/128*Math.PI*2;return new THREE.Vector3(Math.cos(a)*c.working_radius_m,0,Math.sin(a)*c.working_radius_m);});
    const ring=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:0x708f75}));
    ring.name='Working Radius'; ring.position.set(c.position.x,c.position.y+0.04,c.position.z); root.add(ring); record.radiusRing=ring;
    if(c.base) { const base=flatPolygon(c.base,0x708f75,false); root.add(base); }
  }
  let environment=null,siteCenter=null;
  if(data.terrain?.available||data.surroundings)try {
    environment=buildSurroundings(data);
    for(const record of environment.records)register(record.object,record.kind,record.data,record.id);
    omitted.push(environment.notice);
    const ring=environment.region.ring;
    siteCenter=new THREE.Vector3((Math.min(...ring.map(p=>p.x))+Math.max(...ring.map(p=>p.x)))/2,
      environment.alignment.siteReference,(Math.min(...ring.map(p=>p.z))+Math.max(...ring.map(p=>p.z)))/2);
  }catch(error){omitted.push(error.message);}
  if(data.roads == null) omitted.push('도로·차량 경로: missing (생성하지 않음)');
  else omitted.push('도로 영역은 표시하지 않습니다. 차량 경로는 차량 패널에서 확인하세요.');
  root.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(root);
  if(bounds.isEmpty()) omitted.push('표시 가능한 현장 형상 없음');
  return {root,records,omitted,bounds,environment,siteCenter};
}

export function setRecordHighlight(record,on) {
  record.object.traverse(object=>{
    for(const material of [].concat(object.material ?? [])) {
      if(!material.color) continue;
      if(!material.userData.baseColor) material.userData.baseColor=material.color.clone();
      material.color.copy(material.userData.baseColor);
      if(on) material.color.lerp(new THREE.Color(0xffcf55),0.6);
    }
  });
}
export function findSiteRecord(object) {
  for(let current=object;current;current=current.parent) if(current.userData.siteRecord) return current.userData.siteRecord;
  return null;
}
export function getViewPose(bounds,view,aspect=1,siteCenter=null) {
  const center=siteCenter?.clone()??(bounds.isEmpty()?new THREE.Vector3():bounds.getCenter(new THREE.Vector3()));
  const size=bounds.isEmpty()?new THREE.Vector3(1,1,1):bounds.getSize(new THREE.Vector3());
  const radius=siteCenter&&!bounds.isEmpty()?Math.max(1,...[bounds.min,bounds.max].map(p=>p.distanceTo(center))):Math.max(1,size.length()/2), fov=THREE.MathUtils.degToRad(45);
  const limit=Math.min(fov,2*Math.atan(Math.tan(fov/2)*Math.max(0.01,aspect)));
  const distance=radius/Math.sin(limit/2)*1.15;
  const directions={Top:[0,1,0],Front:[0,0,-1],Side:[-1,0,0],Free:[1,0.7,1]};
  const direction=new THREE.Vector3(...directions[view]).normalize();
  const span=Math.max(size.z,size.x/Math.max(0.01,aspect),1)*1.15;
  return {center,position:center.clone().addScaledVector(direction,distance),distance,radius,span,orthographic:view==='Top'};
}
export function disposeScene(root) {
  const geometries=new Set(),materials=new Set();
  root.traverse(object=>{ if(object.geometry) geometries.add(object.geometry); for(const m of [].concat(object.material ?? [])) materials.add(m); });
  geometries.forEach(g=>g.dispose()); materials.forEach(m=>{for(const value of Object.values(m)) if(value?.isTexture) value.dispose();m.dispose();});
  root.clear();
}
