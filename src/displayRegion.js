// Rendering-only convex site buffer. Input/output use the existing web meters/Y-up.
const EPS=1e-8;
const cross=(a,b,c)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
function hull(points) {
  const sorted=points.slice().sort((a,b)=>a.x-b.x||a.z-b.z),lower=[],upper=[];
  for(const p of sorted){while(lower.length>1&&cross(lower.at(-2),lower.at(-1),p)<=0)lower.pop();lower.push(p);}
  for(const p of sorted.reverse()){while(upper.length>1&&cross(upper.at(-2),upper.at(-1),p)<=0)upper.pop();upper.push(p);}
  return lower.slice(0,-1).concat(upper.slice(0,-1));
}
const planes=ring=>ring.map((a,i)=>{
  const b=ring[(i+1)%ring.length],length=Math.hypot(b.x-a.x,b.z-a.z);
  return {x:-(b.z-a.z)/length,z:(b.x-a.x)/length,c:((b.z-a.z)*a.x-(b.x-a.x)*a.z)/length};
});
const distance=(p,plane)=>plane.x*p.x+plane.z*p.z+plane.c;
export function createDisplayRegion(boundary,radius=100) {
  if(!boundary?.closed||!Array.isArray(boundary.points))throw new Error('주변 표시: 현장경계가 없습니다.');
  let ring=boundary.points.map(p=>({...p}));
  if(ring.length>1&&Math.hypot(ring[0].x-ring.at(-1).x,ring[0].z-ring.at(-1).z)<EPS)ring.pop();
  const area=ring.reduce((sum,a,i)=>{const b=ring[(i+1)%ring.length];return sum+a.x*b.z-b.x*a.z;},0);
  if(area<0)ring.reverse();
  if(ring.length<3||ring.some((a,i)=>cross(a,ring[(i+1)%ring.length],ring[(i+2)%ring.length])<=EPS))
    throw new Error('주변 100m 표시: 현재 구현은 확인된 볼록 현장경계만 지원합니다.');
  const circleSegments=256,points=[];
  for(const p of ring)for(let i=0;i<circleSegments;i++) {
    const angle=i/circleSegments*Math.PI*2;points.push({x:p.x+radius*Math.cos(angle),z:p.z+radius*Math.sin(angle)});
  }
  const outer=hull(points);
  return {ring,outer,innerPlanes:planes(ring),outerPlanes:planes(outer),radius,
    arcTolerance:radius*(1-Math.cos(Math.PI/circleSegments)),
    bounds:{minX:Math.min(...outer.map(p=>p.x)),maxX:Math.max(...outer.map(p=>p.x)),minZ:Math.min(...outer.map(p=>p.z)),maxZ:Math.max(...outer.map(p=>p.z))}};
}
function halfPlane(poly,plane,inside=true) {
  if(!poly.length)return [];
  const output=[],sign=inside?1:-1;
  for(let i=0;i<poly.length;i++) {
    const a=poly[i],b=poly[(i+1)%poly.length],da=sign*distance(a,plane),db=sign*distance(b,plane);
    const ina=da>=-EPS,inb=db>=-EPS;
    if(ina)output.push(a);
    if(ina!==inb){const t=da/(da-db);output.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t});}
  }
  return output;
}
function subtractInterior(poly,innerPlanes) {
  const exterior=[];let remainder=poly;
  for(const plane of innerPlanes) {
    if(remainder.length<3)break;
    const outside=halfPlane(remainder,plane,false);
    if(outside.length>=3)exterior.push(outside);
    remainder=halfPlane(remainder,plane,true);
  }
  return exterior;
}
export function clipDisplayMesh(mesh,region,verticalOffset=0) {
  const vertices=[],faces=[];let splitFaces=0;
  const bbox=region.bounds;
  for(const face of mesh.faces) {
    const original=face.map(i=>mesh.vertices[i]);
    if(Math.max(...original.map(p=>p.x))<bbox.minX||Math.min(...original.map(p=>p.x))>bbox.maxX||
       Math.max(...original.map(p=>p.z))<bbox.minZ||Math.min(...original.map(p=>p.z))>bbox.maxZ)continue;
    let polygon=original;
    for(const plane of region.outerPlanes){polygon=halfPlane(polygon,plane);if(polygon.length<3)break;}
    if(polygon.length<3)continue;
    const parts=subtractInterior(polygon,region.innerPlanes);
    let emitted=0;
    for(const part of parts)for(let i=1;i<part.length-1;i++) {
      const tri=[part[0],part[i],part[i+1]],a=tri[0],b=tri[1],c=tri[2];
      const u=[b.x-a.x,b.y-a.y,b.z-a.z],v=[c.x-a.x,c.y-a.y,c.z-a.z];
      if(Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])<1e-10)continue;
      const n=vertices.length;vertices.push(...tri.map(p=>({x:p.x,y:p.y+verticalOffset,z:p.z})));faces.push([n,n+1,n+2]);emitted++;
    }
    if(emitted>1)splitFaces++;
  }
  return {vertices,faces,splitFaces};
}
function pointSegmentDistance(p,a,b) {
  const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz)));
  return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz);
}
export function compareBoundaryElevation(terrain,region) {
  const siteHeights=region.ring.map(p=>p.y),boundaryHeights=new Map();
  for(const p of terrain?.mesh?.vertices??[])if(region.ring.some((a,i)=>pointSegmentDistance(p,a,region.ring[(i+1)%region.ring.length])<=0.001)) {
    const key=p.x+','+p.z;
    if(boundaryHeights.has(key)&&Math.abs(boundaryHeights.get(key)-p.y)>1e-8)
      throw new Error('주변 높이 정렬 중단: 같은 경계 XY에 서로 다른 높이가 있습니다.');
    boundaryHeights.set(key,p.y);
  }
  const samples=[...boundaryHeights.values()].sort((a,b)=>a-b);
  if(!terrain?.available||!samples.length||!samples.every(Number.isFinite))
    throw new Error('주변 높이 정렬 중단: 유효한 지형 구멍 경계 높이가 없습니다.');
  const middle=Math.floor(samples.length/2),median=samples.length%2?samples[middle]:(samples[middle-1]+samples[middle])/2;
  const appliedOffset=-median,reference=siteHeights.reduce((sum,y)=>sum+y,0)/siteHeights.length;
  // Display-only common shift; JSON coordinates and elevation provenance stay unchanged.
  return {appliedOffset,status:'DEMO_BOUNDARY_MEDIAN_SHIFT',siteReference:reference,samples:samples.length,
    terrainBoundaryMedian:median,terrainBoundaryMin:samples[0],terrainBoundaryMax:samples.at(-1),
    deltaMin:samples[0]-reference,deltaMax:samples.at(-1)-reference,
    residualMin:samples[0]+appliedOffset,residualMax:samples.at(-1)+appliedOffset};
}
