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
  const motion=createVehicleMotion(path),car=new THREE.Group();car.name='Procedural Vehicle';
  function box(size,position,color) {
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),new THREE.MeshStandardMaterial({color}));
    mesh.position.set(...position);car.add(mesh);
  }
  box([1.6,.6,3.2],[0,.7,0],demo?0xc39326:0x344955);
  box([1.3,.6,1.5],[0,1.3,-.2],0xaabcc5);
  box([1.2,.18,.18],[0,.75,1.65],0xf7edca); // +Z denotes vehicle front.
  const wheelGeometry=new THREE.CylinderGeometry(.32,.32,.22,12),wheelMaterial=new THREE.MeshStandardMaterial({color:0x303840});
  for(const x of [-.85,.85])for(const z of [-1,1]){const wheel=new THREE.Mesh(wheelGeometry,wheelMaterial);wheel.rotation.z=Math.PI/2;wheel.position.set(x,.32,z);car.add(wheel);}
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
