import { createOutputFilename,jsonFilenameStem } from './outputFilename.js';
export const LAYOUT_SIZE=Object.freeze({width:2400,height:1800});
export const LAYOUT_COLORS=Object.freeze({ink:'#1f2933',muted:'#6b7885',line:'#d9e0e5',soft:'#f6f8fa',material:'#3db9ff',crane:'#d23737',gate:'#0f7d46'});
const finitePoint=p=>p && ['x','y','z'].every(k=>typeof p[k]==='number'&&Number.isFinite(p[k]));
export function topHull(points) {
  if(!Array.isArray(points)||points.some(p=>!finitePoint(p)))return [];
  const unique=[...new Map(points.map(p=>[p.x+','+p.z,{x:p.x,y:p.y,z:p.z}])).values()].sort((a,b)=>a.x-b.x||a.z-b.z);
  if(unique.length<3)return [];
  const cross=(a,b,c)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
  const half=values=>{const out=[];for(const p of values){while(out.length>=2&&cross(out.at(-2),out.at(-1),p)<=0)out.pop();out.push(p);}return out;};
  const lower=half(unique),upper=half([...unique].reverse());lower.pop();upper.pop();
  const hull=[...lower,...upper];return hull.length>=3?hull:[];
}
export function buildLayoutModel(snapshot) {
  const data=snapshot.data, shapes=[],labels=[],warnings=[];
  const missing=['Rhino 표시 객체·레이어·실시간 DrawColor/선 종류','GH SiteElements 원형 및 Preview 색','현재 MaterialBoxes Custom Preview 실시간 색'];
  const polygon=(poly,kind,id,color=LAYOUT_COLORS.ink,fill=false)=>{
    if(!poly||poly.closed!==true||!Array.isArray(poly.points)||poly.points.length<3||poly.points.some(p=>!finitePoint(p))) {warnings.push(id+': 도형 missing 또는 좌표 오류');return;}
    let area=0;for(let i=0;i<poly.points.length;i++){const a=poly.points[i],b=poly.points[(i+1)%poly.points.length];area+=a.x*b.z-b.x*a.z;}
    if(!Number.isFinite(area)||Math.abs(area)<1e-9){warnings.push(id+': X/Z 투영 면적 없음');return;}
    shapes.push({type:'polygon',kind,id,points:poly.points.map(p=>({...p})),color,fill});
  };
  polygon(data.site?.boundary,'site','site.boundary');
  (data.site?.no_go??[]).forEach((p,i)=>polygon(p,'no_go','site.no_go.'+i));
  if(finitePoint(data.site?.gate)){
    const p={...data.site.gate};shapes.push({type:'point',kind:'gate',id:'site.gate',position:p,color:LAYOUT_COLORS.gate});
    labels.push({text:'주출입구',position:{x:p.x+1.5,y:p.y,z:p.z+1.5},color:LAYOUT_COLORS.gate});
  }else warnings.push('site.gate: missing 또는 좌표 오류');
  for(const b of data.buildings??[])polygon(b.footprint,'building',b.id);
  for(const m of data.materials??[]) {
    const hull=topHull(m.corners);
    if(hull.length<3){warnings.push(m.id+': 실제 corners 투영 불가');continue;}
    shapes.push({type:'polygon',kind:'material',id:m.id,points:hull,color:LAYOUT_COLORS.material,fill:true});
  }
  for(const c of data.cranes??[]) {
    if(!finitePoint(c.position)){warnings.push(c.id+': position missing');continue;}
    const p={...c.position};
    shapes.push({type:'point',kind:'crane',id:c.id,position:p,color:LAYOUT_COLORS.crane});
    if(typeof c.working_radius_m==='number'&&Number.isFinite(c.working_radius_m)&&c.working_radius_m>0)
      shapes.push({type:'circle',kind:'radius',id:c.id,position:p,radius:c.working_radius_m,color:LAYOUT_COLORS.ink});
    else warnings.push(c.id+': working_radius_m missing');
    if(c.base)polygon(c.base,'crane_base',c.id);
    labels.push({text:c.id,position:{x:p.x+1.5,y:p.y,z:p.z+1.5},color:LAYOUT_COLORS.crane});
  }
  // Only validated, declared GH paths; user/built-in DEMO paths never enter this model.
  for(const path of snapshot.routes?.actualPaths??[])shapes.push({type:'polyline',kind:'road_path',id:path.id,points:path.points.map(p=>({...p})),color:LAYOUT_COLORS.ink});
  if(!data.roads)missing.push('도로 경계·폭·실제 차량 경로');
  if(!data.layout)missing.push('layout 확장 도형·스타일·범례 데이터');
  else missing.push('layout 추가 도형·스타일은 미지원이며 기본 현장 형상만 표시합니다.');
  let bounds=null;
  function include(x,z){if(!Number.isFinite(x)||!Number.isFinite(z))return; if(!bounds)bounds={minX:x,maxX:x,minZ:z,maxZ:z};else{bounds.minX=Math.min(bounds.minX,x);bounds.maxX=Math.max(bounds.maxX,x);bounds.minZ=Math.min(bounds.minZ,z);bounds.maxZ=Math.max(bounds.maxZ,z);}}
  for(const s of shapes) {
    if(s.points)s.points.forEach(p=>include(p.x,p.z));
    else if(s.type==='circle'){include(s.position.x-s.radius,s.position.z-s.radius);include(s.position.x+s.radius,s.position.z+s.radius);}
    else include(s.position.x,s.position.z);
  }
  labels.forEach(label=>include(label.position.x,label.position.z));
  const counts={buildings:shapes.filter(s=>s.kind==='building').length,materials:shapes.filter(s=>s.kind==='material').length,cranes:shapes.filter(s=>s.kind==='crane').length,radii:shapes.filter(s=>s.kind==='radius').length,noGo:shapes.filter(s=>s.kind==='no_go').length};
  return {shapes,labels,bounds,counts,warnings,missing,ghErrors:snapshot.summary?.errors??null,ghWarnings:snapshot.summary?.warnings??null,demoIncluded:false};
}
export function fitLayout(model,width=2400,height=1800) {
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<800||height<600)throw new Error('배치도 출력은 800×600 이상의 유한 크기가 필요합니다.');
  const u=Math.min(width/2400,height/1800),margin=64*u,legendWidth=600*u;
  const plot={x:margin,y:150*u,width:width-3*margin-legendWidth,height:height-280*u};
  const legend={x:width-margin-legendWidth,y:150*u,width:legendWidth};
  if(!model.bounds)return {plot,legend,scale:null,project:null,u};
  const b=model.bounds,padX=Math.max((b.maxX-b.minX)*.04,1),padZ=Math.max((b.maxZ-b.minZ)*.04,1);
  const spanX=Math.max(b.maxX-b.minX+2*padX,.001),spanZ=Math.max(b.maxZ-b.minZ+2*padZ,.001);
  if(![spanX,spanZ].every(Number.isFinite))throw new Error('배치도 좌표 범위가 너무 큽니다.');
  const scale=Math.min(plot.width/spanX,plot.height/spanZ);
  const centerX=b.minX+(b.maxX-b.minX)/2,centerZ=b.minZ+(b.maxZ-b.minZ)/2;
  return {plot,legend,u,scale,project:p=>({x:plot.x+plot.width/2+(p.x-centerX)*scale,y:plot.y+plot.height/2-(p.z-centerZ)*scale})};
}
export function safeLayoutFilename(source={},time=new Date()) {
  return createOutputFilename(source,'Layout',time);
}
export function renderLayoutCanvas(snapshot,canvas,{width=2400,height=1800}={}) {
  const model=buildLayoutModel(snapshot),fit=fitLayout(model,width,height);
  canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('이 브라우저는 Canvas 2D를 지원하지 않습니다.');
  const {u,plot,legend,project}=fit,colors=LAYOUT_COLORS;
  const font=size=>size*u+'px -apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR","Malgun Gothic",Arial,sans-serif';
  function text(value,x,y,size=22,color=colors.ink){ctx.font=font(size);ctx.fillStyle=color;ctx.fillText(String(value),x,y);}
  function wrap(value,x,y,maxWidth,size=20,maxLines=20) {
    ctx.font=font(size);let line='',lines=0;const words=String(value);
    for(const char of words) {if(line&&ctx.measureText(line+char).width>maxWidth){text(line,x,y,size);y+=size*1.4*u;line='';if(++lines>=maxLines){text('… (상세 내용은 화면의 원본 경고 참조)',x,y,size);return y+size*1.4*u;}}line+=char;}
    if(line){text(line,x,y,size);y+=size*1.4*u;}return y;
  }
  ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);
  text('SITEFLOW · JSON 현장 배치도',64*u,68*u,38);
  text(jsonFilenameStem(snapshot.source),64*u,110*u,20,colors.muted);
  text('2400×1800 기준 · meters · X/Z Top 투영 · 실제 JSON만 표시 / DEMO 차량·경로 미포함',64*u,height-75*u,20,colors.muted);
  text('원본 좌표: +X 오른쪽 / +Z 위쪽 · 원본 미터 유지 · GH 실시간 색/레이어는 missing',64*u,height-40*u,20,colors.muted);
  ctx.strokeStyle=colors.line;ctx.lineWidth=u;ctx.strokeRect(plot.x,plot.y,plot.width,plot.height);
  if(project) {
    ctx.save();ctx.beginPath();ctx.rect(plot.x,plot.y,plot.width,plot.height);ctx.clip();
    // Fill real material projections first; all other shapes remain explicit outlines.
    const ordered=[...model.shapes.filter(s=>s.kind==='material'),...model.shapes.filter(s=>s.kind!=='material')];
    for(const s of ordered) {
      ctx.beginPath();ctx.strokeStyle=s.color;ctx.fillStyle=s.color;ctx.lineWidth=2*u;ctx.setLineDash([]);
      if(s.points){s.points.map(project).forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));if(s.type==='polygon')ctx.closePath();if(s.fill)ctx.fill();ctx.stroke();}
      else {const p=project(s.position);ctx.arc(p.x,p.y,s.type==='circle'?s.radius*fit.scale:5*u,0,Math.PI*2);if(s.type==='point')ctx.fill();else ctx.stroke();}
    }
    ctx.restore();
    for(const label of model.labels) {
      const p=project(label.position);ctx.font=font(24);
      const labelText=String(label.text).length>64?String(label.text).slice(0,61)+'…':String(label.text);
      const textWidth=ctx.measureText(labelText).width, x=Math.max(plot.x+8*u,Math.min(p.x,plot.x+plot.width-textWidth-8*u)),y=Math.max(plot.y+28*u,Math.min(p.y,plot.y+plot.height-8*u));
      ctx.fillStyle='#fffffff0';ctx.fillRect(x-4*u,y-25*u,textWidth+8*u,31*u);text(labelText,x,y,24,label.color);
    }
    const target=plot.width/5/fit.scale,base=10**Math.floor(Math.log10(target));
    const metres=[1,2,5,10].map(n=>n*base).filter(n=>n<=target).at(-1)||base;
    const x=plot.x+16*u,y=plot.y+plot.height+36*u;
    ctx.beginPath();ctx.strokeStyle=colors.ink;ctx.lineWidth=3*u;ctx.moveTo(x,y);ctx.lineTo(x+metres*fit.scale,y);ctx.stroke();
    text(Number(metres.toPrecision(3)).toString()+' m',x,y+28*u,18);
  }else text('표시 가능한 실제 JSON 도형 없음 (missing)',plot.x+30*u,plot.y+60*u,26,colors.muted);
  text('SITEFLOW 배치도 LEGEND',legend.x,legend.y+28*u,26);
  let y=legend.y+76*u;
  const entries=[
    ['현장 경계·금지구역·건물 (GH색 missing)',colors.ink],
    ['자재 '+model.counts.materials+'개 · 참조 기준색 / 실시간 색 missing',colors.material],
    ['최종 크레인 '+model.counts.cranes+'대 · TC 식별 라벨',colors.crane],
    ['주출입구 위치 기호 (실제 크기 아님)',colors.gate],
    ['작업 반경 '+model.counts.radii+'개 · JSON radius_m',colors.ink],
  ];
  for(const [label,color]of entries){ctx.beginPath();ctx.strokeStyle=color;ctx.lineWidth=8*u;ctx.moveTo(legend.x,y-8*u);ctx.lineTo(legend.x+50*u,y-8*u);ctx.stroke();y=wrap(label,legend.x+70*u,y,legend.width-70*u,18,3)+16*u;}
  if(model.shapes.some(s=>s.kind==='road_path'))y=wrap('JSON 원천 선언 경로만 표시 · 도로 영역/폭 아님',legend.x,y,legend.width,18)+14*u;
  y=wrap('건물 '+model.counts.buildings+' · 자재 '+model.counts.materials+' · 최종 크레인 '+model.counts.cranes+' / 후보 배치 없음',legend.x,y,legend.width,21)+18*u;
  const messages=['GH Layout Errors: '+(model.ghErrors?.length??'missing'),'GH 경고: '+(model.ghWarnings?.length??'missing'),...(model.ghErrors??[]),...(model.ghWarnings??[]),'표시 색상은 참고용이며 원본 GH 색상·레이어와 다를 수 있습니다.','누락: '+model.missing.join(' · '),...model.warnings];
  let truncated=false;
  for(const message of messages){if(y>height-210*u){truncated=true;break;}y=wrap(message,legend.x,y,legend.width,18,4)+10*u;}
  if(truncated)text('일부 상세 경고 생략 · 화면에서 전체 원문 확인',legend.x,height-170*u,18,colors.muted);
  return {model,fit};
}
export async function createLayoutPng(snapshot,{canvasFactory=()=>document.createElement('canvas'),outputTime=new Date()}={}) {
  const canvas=canvasFactory(),result=renderLayoutCanvas(snapshot,canvas,LAYOUT_SIZE);
  const blob=await new Promise((resolve,reject)=>{
    if(typeof canvas.toBlob!=='function'){reject(new Error('PNG 내보내기를 지원하지 않습니다.'));return;}
    try{canvas.toBlob(value=>value&&value.type==='image/png'?resolve(value):reject(new Error('PNG 이미지 생성에 실패했습니다.')),'image/png');}catch{reject(new Error('PNG 이미지 생성에 실패했습니다.'));}
  });
  return {...result,blob,filename:safeLayoutFilename(snapshot.source,outputTime)};
}
