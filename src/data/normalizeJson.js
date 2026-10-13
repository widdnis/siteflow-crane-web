import { collectVehiclePaths } from './vehiclePath.js';
import { validateJson } from './validateJson.js';
export function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); Object.values(value).forEach(deepFreeze); }
  return value;
}
export function normalizeJson(input, source = {}) {
  validateJson(input);
  const data = structuredClone(input);
  const missing = new Set(data.metadata?.missing ?? []);
  const fields = ['site','buildings','materials','cranes','crane_catalog','schedule','metadata','roads','layout','report'];
  const availability = {};
  for (const field of fields) {
    availability[field] = data[field] == null ? 'missing' : 'present';
    if (data[field] == null) missing.add(field);
  }
  for (const field of ['errors','warnings','missing','final_selection','candidate_count']) if (data.metadata?.[field] == null) missing.add('metadata.' + field);
  function markNulls(value, path='') {
    if (value === null) { missing.add(path); return; }
    if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) markNulls(child, path ? path + '.' + key : key);
  }
  markNulls(data);
  if (data.site?.boundary == null) missing.add('site.boundary');
  if (data.schedule?.active_material_count == null) missing.add('schedule.active_material_count');
  for (const crane of data.cranes) for (const field of ['position','height_m','working_radius_m','base_direction_degrees_rhino','model_asset','parts','pivot']) if (crane[field] == null) missing.add('cranes.' + crane.id + '.' + field);
  const routes=collectVehiclePaths(data);
  availability['roads.vehicle_paths']=routes.status;
  if(!routes.actualPaths.length) missing.add('roads.vehicle_paths');
  return deepFreeze({
    data, routes, source: structuredClone(source), availability, missing: [...missing],
    summary: {
      finalCranes: data.cranes.length,
      buildings: data.buildings?.length ?? null,
      materialBoxes: data.materials?.length ?? null,
      activeMaterials: data.schedule?.active_material_count ?? null,
      candidates: data.metadata?.candidate_count ?? null,
      errors: data.metadata?.errors ?? null,
      warnings: data.metadata?.warnings ?? null,
    },
  });
}
