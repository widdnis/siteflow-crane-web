import * as THREE from 'three';
import {createDisplayRegion,clipDisplayMesh,compareBoundaryElevation} from './displayRegion.js';

function outlinedMesh(data,color,name,opacity=1) {
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(data.vertices.flatMap(p=>[p.x,p.y,p.z]),3));
  geometry.setIndex(data.faces.flat());geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const object=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,roughness:1,metalness:0,
    side:THREE.DoubleSide,transparent:opacity<1,opacity,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1}));
  object.name=name;
  // Boundaries and sharp creases only; no full triangulation wireframe.
  const lines=new THREE.LineSegments(new THREE.EdgesGeometry(geometry,40),new THREE.LineBasicMaterial({color:0x6c6c6c,transparent:true,opacity:.65,depthTest:true}));
  lines.name='Environment Outlines';object.add(lines);return object;
}
export function buildSurroundings(data) {
  const region=createDisplayRegion(data.site?.boundary),alignment=compareBoundaryElevation(data.terrain,region);
  const records=[],stats={terrainFaces:0,buildingSource:0,buildingDisplayed:0,roadSource:0,roadDisplayed:0,splitFaces:0};
  if(data.terrain?.available) {
    const clipped=clipDisplayMesh(data.terrain.mesh,region,alignment.appliedOffset);
    stats.terrainFaces=clipped.faces.length;stats.splitFaces+=clipped.splitFaces;
    if(clipped.faces.length)records.push({object:outlinedMesh(clipped,0xd6d6d6,'Exterior Terrain'),kind:'외부 지형 (표고·CRS 미검증)',data:data.terrain,id:'terrain'});
  }
  for(const [key,prefix,color,kind] of [['buildings','building',0xc6c6c6,'주변 건물'],['roads','road',0x9c9c9c,'주변 도로']]) {
    const group=data.surroundings?.[key];stats[prefix+'Source']=group?.items?.length??0;
    for(const item of group?.items??[]) {
      if(!item.available)continue;
      const clipped=clipDisplayMesh(item.mesh,region,alignment.appliedOffset);stats.splitFaces+=clipped.splitFaces;
      if(!clipped.faces.length)continue;
      stats[prefix+'Displayed']++;
      records.push({object:outlinedMesh(clipped,color,item.id,key==='buildings'?.85:1),kind,data:item,id:item.id});
    }
  }
  const notice='주변 표시: 현장 외측 100m · 표고/CRS 미검증 · 수직 보정 0m (높이 차이의 원인 미확인)';
  return {records,region,alignment,stats,notice};
}
