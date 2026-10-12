import * as THREE from 'three';

// Absolute local yaw; only the rotating upper is changed.
export function setCraneRotation(crane, degrees) {
  const upper = crane.getObjectByName('Rotating Upper');
  if (!upper || !Number.isFinite(degrees)) throw new Error('Invalid crane rotation');
  const angle = THREE.MathUtils.clamp(degrees, 0, 360);
  upper.rotation.y = THREE.MathUtils.degToRad(angle);
  return angle;
}

export function createCrane(d) {
  const r = d.working_radius_m, h = d.height_m;
  if (!d.position || !(r > 0) || !(h > 0)) throw new Error('Invalid crane dimensions');
  const root = new THREE.Group(); root.name = d.id;
  root.position.set(d.position.x, d.position.y, d.position.z);
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const materials = [0xffd329, 0xff641c, 0x29dce8, 0x954dff, 0xf0f5ff, 0xff3860].map(color => new THREE.MeshStandardMaterial({color, roughness: 0.75}));
  function group(parent, name, x=0, y=0, z=0) {
    const part = new THREE.Group(); part.name = name; part.position.set(x,y,z); parent.add(part); return part;
  }
  function box(parent, name, pos, size, color) {
    const mesh = new THREE.Mesh(geometry, materials[color]); mesh.name = name;
    mesh.position.set(...pos); mesh.scale.set(...size); parent.add(mesh); return mesh;
  }
  function beam(parent, a, b, width, color) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), delta = end.clone().sub(start);
    const mesh = box(parent, 'Brace', start.add(end).multiplyScalar(0.5).toArray(), [width,delta.length(),width], color);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), delta.normalize());
  }
  // Visual dimensions follow the Unity procedural preview, not verified model geometry.
  const upperH = Math.min(3,h*0.06), mastH = h-upperH;
  const half = THREE.MathUtils.clamp(r*0.032,1.2,1.8), jibHalf = THREE.MathUtils.clamp(half*0.6,0.7,1);
  const tower = group(root,'Fixed Tower');
  for (const x of [-1,1]) for (const z of [-1,1]) box(tower,'Mast Leg',[x*half,mastH/2,z*half],[0.45,mastH,0.45],0);
  for (let i=0;i<8;i++) {
    const bottom=mastH*i/8, top=mastH*(i+1)/8;
    for (const s of [-1,1]) {
      beam(tower,[-half,bottom,s*half],[half,top,s*half],0.27,0);
      beam(tower,[s*half,bottom,-half],[s*half,top,half],0.27,0);
      beam(tower,[-half,top,s*half],[half,top,s*half],0.3,0);
      beam(tower,[s*half,top,-half],[s*half,top,half],0.3,0);
    }
  }
  const upper = group(tower,'Rotating Upper',0,mastH,0);
  upper.rotation.y = THREE.MathUtils.degToRad(d.base_direction_degrees_rhino);
  box(upper,'Turntable',[0,0.2,0],[half*2.2,0.4,half*2.2],2);
  box(upper,'Cab',[-half*0.75,upperH*0.48,0],[half,upperH*0.55,half],2);
  const jib = group(upper,'Jib',0,upperH*0.7,0);
  for (const s of [-1,1]) {
    box(jib,'Jib Chord',[s*jibHalf,-0.4,r/2],[0.45,0.45,r],1);
    for (let i=0;i<6;i++) beam(jib,[s*jibHalf,-0.4,r*i/6],[0,0.8,r*(i+1)/6],0.34,1);
  }
  box(jib,'Upper Chord',[0,0.8,r/2],[0.35,0.35,r],1);
  const counter = group(upper,'Counter Jib',0,upperH*0.7,0), length=r*0.22;
  box(counter,'Counter Beam',[0,-0.25,-length/2],[jibHalf*2,0.7,length],2);
  box(counter,'Counterweight',[0,-0.65,-length*0.85],[jibHalf*2.3,1.2,2],2);
  // Local Z is the trolley travel axis; wire/hook inherit its translation.
  const trolley = group(jib,'Trolley',0,-0.65,r*0.6);
  box(trolley,'Trolley Body',[0,0,0],[jibHalf*2.2,0.8,1.8],3);
  const cableLength=Math.min(12,h*0.3);
  const wire=group(trolley,'Wire',0,-0.25,0);
  box(wire,'Cable',[0,-cableLength/2,0],[0.22,cableLength,0.22],4);
  const hook=group(trolley,'Hook',0,-0.25-cableLength,0);
  box(hook,'Shank',[-0.35,-0.25,0],[0.55,1.5,0.65],5);
  box(hook,'Bend',[0,-0.9,0],[1.25,0.5,0.65],5);
  box(hook,'Tip',[0.45,-0.55,0],[0.4,0.65,0.65],5);
  return root;
}
