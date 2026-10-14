import { validateTerrain } from './validateTerrain.js';
import { validateSurroundings } from './validateSurroundings.js';
export const MAX_BYTES = 20 * 1024 * 1024;
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
export function validateJson(data) {
  const fail = message => { throw new Error('데이터 검증 실패: ' + message); };
  if (!object(data)) fail('최상위 값은 JSON 객체여야 합니다.');
  let count = 0;
  function walk(v, path = '$', depth = 0) {
    if (++count > 500000 || depth > 48) fail('데이터 크기 또는 중첩 깊이 제한을 초과했습니다.');
    if (typeof v === 'number' && !Number.isFinite(v)) fail(path + ': 유한한 숫자가 필요합니다.');
    if (Array.isArray(v) && v.length > 20000) fail(path + ': 배열은 20,000개 이하만 지원합니다.');
    if (v && typeof v === 'object') for (const [k, child] of Object.entries(v)) {
      // Surrounding meshes have their own bounded validation; keep legacy walk limits.
      if(path==='$'&&k==='surroundings')continue;
      walk(child, path + '.' + k, depth + 1);
    }
  }
  walk(data);
  validateTerrain(data.terrain);
  validateSurroundings(data.surroundings);
  if (data.schema?.version !== '2.0.0') fail('schema.version 2.0.0이 필요합니다.');
  if (data.units?.output !== 'meters') fail('units.output은 meters여야 합니다. 좌표 변환은 수행하지 않습니다.');
  if (data.coordinates?.target !== 'Unity Y-up') fail('coordinates.target은 Unity Y-up이어야 합니다.');
  const point = (v, path) => {
    if (!object(v) || !['x','y','z'].every(k => typeof v[k] === 'number' && Number.isFinite(v[k]))) fail(path + ': x/y/z 좌표가 필요합니다.');
  };
  const polygon = (v, path) => {
    if (v === null || v === undefined) return;
    if (!object(v) || v.closed !== true || !Array.isArray(v.points)) fail(path + ': 닫힌 폴리곤이 필요합니다.');
    v.points.forEach((p,i) => point(p, path + '.points[' + i + ']'));
    const unique = new Set(v.points.map(p => p.x + ',' + p.z));
    let area = 0;
    for (let i=0; i<v.points.length; i++) {
      const a=v.points[i], b=v.points[(i+1)%v.points.length]; area += a.x*b.z-b.x*a.z;
    }
    if (unique.size < 3 || Math.abs(area) < 1e-9) fail(path + ': 면적이 있는 3개 이상의 점이 필요합니다.');
  };
  const optionalObject = k => { if (data[k] != null && !object(data[k])) fail(k + ': 객체 또는 null이어야 합니다.'); };
  ['site','schedule','metadata','roads','layout','report'].forEach(optionalObject);
  ['buildings','materials','cranes','crane_catalog'].forEach(k => {
    if (data[k] != null && !Array.isArray(data[k])) fail(k + ': 배열 또는 null이어야 합니다.');
  });
  if (!Array.isArray(data.cranes)) fail('cranes 배열이 필요합니다 (빈 최종 선정도 허용).');
  const ids = new Set();
  for (const kind of ['buildings','materials','cranes']) for (const [i, item] of (data[kind] ?? []).entries()) {
    const path = kind + '[' + i + ']';
    if (!object(item) || typeof item.id !== 'string' || !item.id.trim()) fail(path + ': id가 필요합니다.');
    if (ids.has(item.id)) fail('중복 id: ' + item.id); ids.add(item.id);
    if (kind === 'cranes') {
      if (item.position != null) point(item.position, path + '.position');
      for (const k of ['height_m','working_radius_m']) if (item[k] != null && (typeof item[k] !== 'number' || item[k] <= 0)) fail(path + '.' + k + ': 양수 또는 null이 필요합니다.');
      if (item.base_direction_degrees_rhino != null && typeof item.base_direction_degrees_rhino !== 'number') fail(path + ': 방향각은 숫자 또는 null이어야 합니다.');
      polygon(item.base, path + '.base');
    } else if (kind === 'buildings') {
      polygon(item.footprint, path + '.footprint');
      if (item.current_height_m != null && (typeof item.current_height_m !== 'number' || item.current_height_m < 0)) fail(path + ': 높이는 0 이상이어야 합니다.');
    } else {
      if (item.center != null) point(item.center, path + '.center');
      if (item.corners != null) {
        if (!Array.isArray(item.corners) || item.corners.length !== 8) fail(path + ': corners는 8개 좌표여야 합니다.');
        item.corners.forEach((p,i) => point(p, path + '.corners[' + i + ']'));
      }
      polygon(item.clearance, path + '.clearance');
    }
  }
  polygon(data.site?.boundary, 'site.boundary');
  if (data.site?.gate != null) point(data.site.gate, 'site.gate');
  if (data.site?.no_go != null) {
    if (!Array.isArray(data.site.no_go)) fail('site.no_go는 배열이어야 합니다.');
    data.site.no_go.forEach((p,i) => polygon(p, 'site.no_go['+i+']'));
  }
  for (const k of ['errors','warnings','missing','candidate_descriptions']) if (data.metadata?.[k] != null && (!Array.isArray(data.metadata[k]) || data.metadata[k].some(v=>typeof v!=='string'))) fail('metadata.' + k + ': 문자열 배열이 필요합니다.');
  for (const [label,value] of [['metadata.candidate_count',data.metadata?.candidate_count],['schedule.active_material_count',data.schedule?.active_material_count]]) if (value != null && (!Number.isInteger(value) || value < 0)) fail(label + ': 0 이상의 정수가 필요합니다.');
  return data;
}
