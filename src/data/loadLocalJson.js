import { MAX_BYTES } from './validateJson.js';
import { normalizeJson } from './normalizeJson.js';
export function parseJsonText(text, source) {
  if (new TextEncoder().encode(text).byteLength > MAX_BYTES) throw new Error('JSON은 20 MB 이하만 지원합니다.');
  let data;
  try { data = JSON.parse(text.replace(/^\uFEFF/, '')); }
  catch { throw new Error('JSON 파싱 실패: 올바른 JSON 파일인지 확인해주세요.'); }
  return normalizeJson(data, source);
}
export async function loadLocalJson(file) {
  if (!file) return null;
  if (!/\.json$/i.test(file.name)) throw new Error('.json 파일을 선택해주세요.');
  if (file.size > MAX_BYTES) throw new Error('JSON은 20 MB 이하만 지원합니다.');
  let text;
  try { text = await file.text(); } catch { throw new Error('파일을 읽지 못했습니다. 다시 선택해주세요.'); }
  return parseJsonText(text, { kind: 'file', name: file.name });
}
