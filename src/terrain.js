import * as THREE from 'three';

// Input has passed validateJson/normalizeJson. No re-clipping or coordinate transform.
export function createTerrainMesh(terrain) {
  if(!terrain?.available)return null;
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(
    terrain.mesh.vertices.flatMap(p=>[p.x,p.y,p.z]),3));
  geometry.setIndex(terrain.mesh.faces.flat());
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const material=new THREE.MeshStandardMaterial({
    color:0x71805b,roughness:1,metalness:0,side:THREE.DoubleSide,
  });
  const mesh=new THREE.Mesh(geometry,material);
  mesh.name='Exterior Terrain';
  return mesh;
}
