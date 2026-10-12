import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createCrane, setCraneRotation } from './crane.js';
import './style.css';

const status=document.createElement('div'); status.id='status'; status.textContent='TC1 로딩 중…'; document.body.appendChild(status);
async function start() {
  const response=await fetch(`${import.meta.env.BASE_URL}data/viewer_data.json`);
  if (!response.ok) throw new Error(`JSON HTTP ${response.status}`);
  const data=await response.json();
  if (data.schema?.version!=='2.0.0' || data.units?.output!=='meters' || data.coordinates?.target!=='Unity Y-up') throw new Error('Unexpected schema, units or coordinates');
  const d=data.cranes?.[0]; if (d?.id!=='TC1') throw new Error('cranes[0] TC1 missing');
  const scene=new THREE.Scene(); scene.background=new THREE.Color(0x162232);
  const crane=createCrane(d); scene.add(crane);
  scene.add(new THREE.HemisphereLight(0xffffff,0x52627e,2.5));
  const light=new THREE.DirectionalLight(0xffffff,3); light.position.set(80,120,50); scene.add(light);
  const grid=new THREE.GridHelper(140,28,0x6a8098,0x34485c); grid.position.copy(crane.position); scene.add(grid);
  const renderer=new THREE.WebGLRenderer({antialias:true}); renderer.setPixelRatio(Math.min(devicePixelRatio,2)); renderer.setSize(innerWidth,innerHeight); document.body.appendChild(renderer.domElement);
  const camera=new THREE.PerspectiveCamera(45,innerWidth/innerHeight,0.1,2000);
  const bounds=new THREE.Box3().setFromObject(crane), center=bounds.getCenter(new THREE.Vector3()), diameter=bounds.getSize(new THREE.Vector3()).length();
  const controls=new OrbitControls(camera,renderer.domElement); controls.target.copy(center); controls.minDistance=5; controls.maxDistance=500;
  const fov=THREE.MathUtils.degToRad(camera.fov), limitingFov=Math.min(fov,2*Math.atan(Math.tan(fov/2)*camera.aspect));
  camera.position.copy(center).addScaledVector(new THREE.Vector3(1,0.5,1).normalize(),diameter/2/Math.sin(limitingFov/2)*1.15); controls.update();
  const render=()=>renderer.render(scene,camera); controls.addEventListener('change',render);
  const panel=document.createElement('section');
  panel.id='rotation-controls';
  panel.setAttribute('aria-label','크레인 회전 조작');
  panel.innerHTML='<label for="rotation-angle">상부 회전 <output id="rotation-value" for="rotation-angle"></output></label><input id="rotation-angle" type="range" min="0" max="360" step="0.1"><button type="button" aria-pressed="false">자동 회전 시작</button>';
  document.body.appendChild(panel);
  const slider=panel.querySelector('input'), value=panel.querySelector('output'), button=panel.querySelector('button');
  let angle=0, running=false, frame=null, previousTime=null;
  function applyAngle(degrees) {
    angle=setCraneRotation(crane,degrees);
    slider.value=angle.toFixed(1);
    value.value=`${angle.toFixed(1)}°`;
    slider.setAttribute('aria-valuetext',value.value);
    render();
  }
  function animate(time) {
    if (!running) return;
    if (previousTime!==null) applyAngle((angle+12*Math.min((time-previousTime)/1000,0.1))%360);
    previousTime=time;
    frame=requestAnimationFrame(animate);
  }
  slider.addEventListener('input',()=>applyAngle(Number(slider.value)));
  button.addEventListener('click',()=>{
    running=!running;
    button.textContent=running?'자동 회전 정지':'자동 회전 시작';
    button.setAttribute('aria-pressed',String(running));
    previousTime=null;
    if (running) frame=requestAnimationFrame(animate);
    else { cancelAnimationFrame(frame); frame=null; }
  });
  document.addEventListener('visibilitychange',()=>{previousTime=null;});
  applyAngle(THREE.MathUtils.radToDeg(crane.getObjectByName('Rotating Upper').rotation.y));
  addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth,innerHeight); render();});
  render(); status.dataset.state='ready';
  status.textContent=`${d.id} · ${d.model} · 높이 ${d.height_m} m · 반경 ${d.working_radius_m} m\n드래그: 회전 · 오른쪽 드래그: 이동 · 휠: 확대/축소`;
}
start().catch(error=>{status.dataset.state='error'; status.textContent=`표시 실패: ${error.message}`; console.error(error);});
