import { MAX_BYTES } from './validateJson.js';
import { parseJsonText } from './loadLocalJson.js';
export function validateJsonUrl(value) {
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error('유효한 HTTP(S) 직접 JSON URL을 입력해주세요.'); }
  if (!['http:','https:'].includes(url.protocol) || url.username || url.password) throw new Error('인증정보 없는 HTTP(S) 직접 JSON URL만 지원합니다.');
  return url;
}
export async function loadJsonUrl(value, { fetcher = fetch, signal } = {}) {
  const url = validateJsonUrl(value);
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(abort, 20000);
  try {
    const response = await fetcher(url.href, { mode: 'cors', credentials: 'omit', signal: controller.signal });
    if (!response.ok) throw new Error('JSON 요청 실패: HTTP ' + response.status);
    if (response.url && !['http:','https:'].includes(new URL(response.url).protocol)) throw new Error('HTTP(S) 응답만 지원합니다.');
    if (Number(response.headers.get('content-length')) > MAX_BYTES) throw new Error('JSON은 20 MB 이하만 지원합니다.');
    let text;
    if (response.body?.getReader) {
      const reader = response.body.getReader(), decoder = new TextDecoder(); const parts = []; let bytes = 0;
      try {
        while (true) {
          const {done,value:chunk} = await reader.read(); if (done) break;
          bytes += chunk.byteLength;
          if (bytes > MAX_BYTES) { await reader.cancel(); throw new Error('JSON은 20 MB 이하만 지원합니다.'); }
          parts.push(decoder.decode(chunk, { stream:true }));
        }
        parts.push(decoder.decode()); text = parts.join('');
      } finally { reader.releaseLock(); }
    } else text = await response.text();
    return parseJsonText(text, { kind: 'url', name: url.href });
  } catch (error) {
    if (error.name === 'AbortError') throw new Error(signal?.aborted ? 'JSON 요청을 취소했습니다.' : 'JSON 요청 시간이 초과되었습니다 (20초).');
    if (error instanceof TypeError) throw new Error('JSON URL에 접근할 수 없습니다. CORS 허용, 네트워크, HTTPS 및 직접 JSON 주소를 확인해주세요.');
    throw error;
  } finally {
    clearTimeout(timer); signal?.removeEventListener('abort', abort);
  }
}
