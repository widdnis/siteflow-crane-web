// Optional Exporter v1.5 terrain. Coordinates are already meters / web Y-up.
export function validateTerrain(terrain,{maxFaces=20000}={}) {
  const fail=message=>{throw new Error('데이터 검증 실패: terrain.'+message);};
  const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
  if(terrain==null)return;
  if(!object(terrain))fail('객체 또는 null이어야 합니다.');
  if(typeof terrain.available!=='boolean')fail('available: Boolean이 필요합니다.');
  if(!terrain.available)return; // Unavailable terrain is never rendered.
  if(terrain.units?.output!=='meters')fail('units.output: meters가 필요합니다. 좌표 변환은 수행하지 않습니다.');
  if(!object(terrain.mesh))fail('mesh: 객체가 필요합니다.');
  const {vertices,faces}=terrain.mesh;
  if(!Array.isArray(vertices)||vertices.length<3||vertices.length>20000)fail('mesh.vertices: 3–20,000개 좌표가 필요합니다.');
  if(!Array.isArray(faces)||faces.length<1||faces.length>maxFaces)fail('mesh.faces: 1–'+maxFaces+'개 삼각형이 필요합니다.');
  const points=vertices.map((v,i)=>{
    if(!object(v)||!['x','y','z'].every(k=>typeof v[k]==='number'&&Number.isFinite(v[k])&&Number.isFinite(Math.fround(v[k]))))
      fail('mesh.vertices['+i+']: GPU에서 표현 가능한 유한한 x/y/z 숫자가 필요합니다.');
    return [Math.fround(v.x),Math.fround(v.y),Math.fround(v.z)];
  });
  faces.forEach((face,i)=>{
    if(!Array.isArray(face)||face.length!==3||face.some(n=>!Number.isInteger(n)||n<0||n>=vertices.length)||new Set(face).size!==3)
      fail('mesh.faces['+i+']: 서로 다른 유효 정점 인덱스 3개가 필요합니다.');
    const [a,b,c]=face.map(n=>points[n]);
    const u=b.map((n,k)=>n-a[k]),v=c.map((n,k)=>n-a[k]);
    const cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
    // Check the actual Float32 positions used by BufferGeometry, including collapse.
    if(!cross.some(n=>n!==0)||cross.some(n=>!Number.isFinite(Math.fround(n))))
      fail('mesh.faces['+i+']: 표현 가능한 면적의 삼각형이 필요합니다.');
  });
}
