import * as THREE from 'three';
import { compileVehiclePath,createVehicleMotion } from './data/vehiclePath.js';
import { disposeScene } from './siteScene.js';

// Explicit illustrative path. Never inserted into snapshot.data or model.records.
export const DEMO_VEHICLE_PATH=Object.freeze({
  id:'DEMO-only',source_kind:'demo',closed:false,
  points:Object.freeze([[-30,0,-20],[-30,0,10],[-10,0,10],[-10,0,40]].map(([x,y,z])=>Object.freeze({x,y,z}))),
});
export function getDemoVehiclePath(){return compileVehiclePath(DEMO_VEHICLE_PATH);}
export function createVehicleVisual(path,demo=false) {
  const root=new THREE.Group();root.name=demo?'DEMO Vehicle Layer':'JSON Vehicle Path Layer';
  const motion=createVehicleMotion(path),car=new THREE.Group();car.name='Procedural Concrete Mixer Truck';
  function box(size,position,color) {
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),new THREE.MeshStandardMaterial({color}));
    mesh.position.set(...position);car.add(mesh);
  }
  const bodyColor=demo?0xc39326:0x344955;
  box([1.6,.3,3.2],[0,.52,0],bodyColor); // Chassis; pivot stays at the road point.
  box([1.5,1,1.1],[0,1.1,1.05],0xe6e9e7); // Cab at the +Z front.
  box([1.25,.4,.03],[0,1.28,1.61],0x678898); // Windscreen.
  for(const x of [-.76,.76])box([.025,.38,.65],[x,1.28,1.06],0x678898);
  box([1.2,.18,.18],[0,.75,1.65],0xf7edca); // +Z denotes vehicle front.
  box([1,.16,1.65],[0,.76,-.5],bodyColor); // Drum cradle.
  const profile=[[0,-.95],[.22,-.95],[.55,-.55],[.55,.1],[.32,.55],[0,.55]];
  const drum=new THREE.Mesh(new THREE.LatheGeometry(profile.map(([r,y])=>new THREE.Vector2(r,y)),20),new THREE.MeshStandardMaterial({color:0xe6e9e7}));
  drum.name='Mixer Drum';drum.rotation.x=Math.PI/2;drum.scale.setScalar(1.5);
  drum.position.set(0,1.67,-.4);car.add(drum); // Raise the enlarged drum above the cradle; keep clear of the cab.
  const band=new THREE.Mesh(new THREE.TorusGeometry(.53,.03,8,20),new THREE.MeshStandardMaterial({color:demo?0xc39326:0xd87732}));
  band.scale.setScalar(1.5);band.position.set(0,1.67,-.7);car.add(band);
  box([.35,.12,.45],[0,.72,-1.375],0xaabcc5); // Rear discharge chute.
  const wheelGeometry=new THREE.CylinderGeometry(.32,.32,.22,12),wheelMaterial=new THREE.MeshStandardMaterial({color:0x303840});
  for(const x of [-.85,.85])for(const z of [-1.05,-.4,1.05]){const wheel=new THREE.Mesh(wheelGeometry,wheelMaterial);wheel.rotation.z=Math.PI/2;wheel.position.set(x,.32,z);car.add(wheel);}
  // Visibility-only scale: leave the path line, road coordinates and rotation pivot untouched.
  car.scale.setScalar(2);
  const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(path.points.map(p=>new THREE.Vector3(p.x,p.y,p.z))),new THREE.LineBasicMaterial({color:demo?0xffcf55:0x246b45}));
  root.add(line,car);
  function sync() {
    const pose=motion.pose;
    car.position.set(pose.position.x,pose.position.y,pose.position.z);
    // Reverse means backing along the path, without a fabricated turn-around.
    car.rotation.y=Math.atan2(pose.tangent.x,pose.tangent.z);
  }
  sync();root.updateMatrixWorld(true);
  let disposed=false;
  return {root,car,line,motion,sync,bounds:new THREE.Box3().setFromObject(root),
    dispose(){if(disposed)return;disposed=true;motion.dispose();root.removeFromParent();disposeScene(root);},
  };
}
