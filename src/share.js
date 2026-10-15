import QRCode from 'qrcode';
import { validateJsonUrl } from './data/loadJsonUrl.js';

export function readSharedData(pageUrl) {
  return new URL(pageUrl).searchParams.get('data');
}

export function createShareLink(source, pageUrl) {
  if (source?.kind !== 'url') throw new Error('결과를 공유하려면 공개 JSON URL이 필요합니다. GitHub Raw 등에 JSON을 직접 게시한 뒤 URL로 불러오세요.');
  const jsonUrl = validateJsonUrl(source.name);
  const link = new URL(pageUrl);
  link.search = '';
  link.hash = '';
  link.searchParams.set('data', jsonUrl.href);
  return link.href;
}

export function mountShareDialog(button, getSnapshot, {
  document: doc = document, window: win = window, navigator: nav = navigator,
  makeQr = link => QRCode.toDataURL(link, { errorCorrectionLevel: 'M', margin: 4, scale: 8, type: 'image/png' }),
} = {}) {
  const dialog = doc.createElement('dialog');
  dialog.className = 'share-dialog';
  dialog.setAttribute('aria-labelledby', 'share-title');
  dialog.innerHTML = `<div class="share-heading"><h2 id="share-title">결과 공유</h2><button id="share-close" type="button" aria-label="공유 창 닫기">닫기</button></div>
<p id="share-message" role="status" aria-live="polite"></p>
<div id="share-content" hidden><label for="share-link">공유 링크</label><input id="share-link" type="text" readonly>
<div class="share-actions"><button id="share-copy" type="button">공유 링크 복사</button><a id="share-download" download="siteflow-result-qr.png" hidden>QR코드 PNG 저장</a></div>
<img id="share-qr" alt="SiteFlow 결과 공유 링크 QR코드" hidden>
<p class="muted">같은 JSON URL의 최신 결과를 엽니다. 받는 사람도 접근할 수 있는 공개 URL을 사용하세요.</p></div>`;
  doc.body.append(dialog);
  const $ = selector => dialog.querySelector(selector);
  let version = 0;
  const close = () => { version++; if (dialog.open) dialog.close(); };
  dialog.addEventListener('close', () => { version++; });
  $('#share-close').addEventListener('click', close);
  dialog.addEventListener('click', event => { if (event.target === dialog) close(); });
  button.addEventListener('click', async () => {
    const current = ++version;
    $('#share-content').hidden = true;
    $('#share-qr').hidden = true;
    $('#share-download').hidden = true;
    $('#share-qr').src = '';
    $('#share-download').removeAttribute('href');
    $('#share-message').textContent = '';
    if (!dialog.open) dialog.showModal();
    let link;
    try { link = createShareLink(getSnapshot()?.source, win.location.href); }
    catch (error) { $('#share-message').textContent = error.message; return; }
    $('#share-link').value = link;
    $('#share-content').hidden = false;
    $('#share-message').textContent = 'QR코드 생성 중…';
    try {
      const png = await makeQr(link);
      if (version !== current || !dialog.open) return;
      $('#share-qr').src = png;
      $('#share-qr').hidden = false;
      $('#share-download').href = png;
      $('#share-download').hidden = false;
      $('#share-message').textContent = '링크를 복사하거나 QR코드를 스캔하세요.';
    } catch {
      if (version === current && dialog.open) $('#share-message').textContent = 'QR코드를 생성하지 못했습니다. 공유 링크를 복사해 사용하세요.';
    }
  });
  $('#share-copy').addEventListener('click', async () => {
    const current = version, link = $('#share-link').value;
    try {
      await nav.clipboard.writeText(link);
      if (version === current) $('#share-message').textContent = '공유 링크를 복사했습니다.';
    } catch {
      if (version !== current || !dialog.open) return;
      $('#share-link').focus();
      $('#share-link').select();
      $('#share-message').textContent = '자동 복사를 사용할 수 없습니다. 선택된 링크를 길게 누르거나 Ctrl+C로 복사하세요.';
    }
  });
  return { close };
}
