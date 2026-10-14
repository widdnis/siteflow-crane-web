import {validateTerrain} from './validateTerrain.js';
export function validateSurroundings(value) {
  const fail=message=>{throw new Error('데이터 검증 실패: surroundings.'+message);};
  if(value==null)return;
  if(typeof value!=='object'||Array.isArray(value))fail('객체 또는 null이 필요합니다.');
  let nodes=0;
  function walk(v,depth=0) {
    if(++nodes>2500000||depth>48)fail('형상 데이터 크기/중첩 제한을 초과했습니다.');
    if(typeof v==='number'&&!Number.isFinite(v))fail('유한한 숫자가 필요합니다.');
    if(Array.isArray(v)&&v.length>50000)fail('주변 형상 배열은 50,000개 이하만 지원합니다.');
    if(v&&typeof v==='object')for(const child of Object.values(v))walk(child,depth+1);
  }
  walk(value);
  let vertices=0,faces=0;
  for(const key of ['buildings','roads']) {
    const group=value[key];if(group==null)continue;
    if(!Array.isArray(group.items)||group.items.length>2000)fail(key+'.items: 2,000개 이하의 형상 배열이 필요합니다.');
    const ids=new Set();
    for(const item of group.items) {
      if(typeof item?.id!=='string'||!item.id||ids.has(item.id))fail(key+': 고유한 id가 필요합니다.');ids.add(item.id);
      try{validateTerrain(item,{maxFaces:50000});}catch(error){fail(key+'.'+item.id+': '+error.message);}
      vertices+=item.mesh?.vertices?.length??0;faces+=item.mesh?.faces?.length??0;
    }
  }
  if(vertices>500000||faces>500000)fail('전체 정점·면은 각각 500,000개 이하만 지원합니다.');
}
