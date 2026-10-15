import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import QRCode from 'qrcode';
import { createShareLink, readSharedData, mountShareDialog } from '../src/share.js';
import { loadJsonUrl } from '../src/data/loadJsonUrl.js';
import { mainHarness, fakeDocument, FakeElement, deferred } from './qaHarness.mjs';

const page = 'https://example.com/siteflow-crane-web/?old=1#viewer';
const raw = 'https://raw.githubusercontent.com/team/repo/main/현장.json?token=a%2Bb&v=2';
const source = {kind:'url', name:raw};
const fixture = await readFile(new URL('./fixtures/viewer_data_20261012_142857_140.json', import.meta.url), 'utf8');

test('share link retains hosting subpath and round-trips nested queries, Unicode and encoded values once', () => {
  const link = createShareLink(source, page);
  assert.equal(new URL(link).pathname, '/siteflow-crane-web/');
  assert.equal(new URL(link).hash, '');
  assert.deepEqual([...new URL(link).searchParams.keys()], ['data']);
  assert.equal(readSharedData(link), new URL(raw).href);
  assert.equal(readSharedData(page), null);
  assert.equal(readSharedData('https://example.com/?data='), '');
  for (const name of ['javascript:alert(1)', 'file:///test.json', 'https://user:password@example.com/a.json', 'bad']) {
    assert.throws(() => createShareLink({kind:'url',name}, page));
  }
  assert.throws(() => createShareLink({kind:'file',name:'local.json'}, page), /공개 JSON URL/);
});

test('share link uses the current localhost or public GitHub Pages origin without uploading JSON', () => {
  for (const origin of ['http://localhost:5173', 'http://127.0.0.1:5173', 'https://widdnis.github.io']) {
    const link = createShareLink(source, origin + '/siteflow-crane-web/?data=old#viewer');
    assert.equal(new URL(link).origin, origin);
    assert.equal(new URL(link).pathname, '/siteflow-crane-web/');
    assert.equal(readSharedData(link), new URL(raw).href);
  }
});

test('shared URL startup uses existing URL loader, validation/normalization and mounts Viewer', async () => {
  let requested;
  const h = await mainHarness({pageUrl:createShareLink(source,page), urlLoader:(value,options) => loadJsonUrl(value, {
    ...options, fetcher:async (url, init) => { requested={url,init}; return new Response(fixture); },
  })});
  await h.app.initialLoad;
  assert.equal(requested.url, new URL(raw).href);
  assert.equal(requested.init.credentials, 'omit');
  assert.equal(h.nodes.get('json-url').value, new URL(raw).href);
  assert.equal(h.app.state.ui.tab, 'viewer');
  assert.equal(h.counts.mounted.viewer, 1);
  assert.equal(h.app.state.snapshot.source.kind, 'url');
  assert.equal(h.app.state.snapshot.summary.finalCranes, 3);
  assert(Object.isFrozen(h.app.state.snapshot.data));
});

test('shared URL startup failures stay on input screen with errors', async () => {
  for (const value of ['', 'javascript:alert(1)', 'https://example.com/data.json']) {
    const h = await mainHarness({pageUrl:'https://example.com/?data='+encodeURIComponent(value),
      urlLoader:(url,options)=>loadJsonUrl(url,{...options,fetcher:async()=>new Response('invalid JSON')})});
    await h.app.initialLoad;
    assert.equal(h.app.state.snapshot, null);
    assert.equal(h.nodes.get('home').hidden, false);
    assert.equal(h.nodes.get('results').hidden, true);
    assert.equal(h.nodes.get('load-error').hidden, false);
    assert(h.nodes.get('load-error').textContent.length > 0);
  }
});

function shareHarness({getSnapshot=()=>({source}),makeQr,clipboard}={}) {
  const doc=fakeDocument(), button=new FakeElement('button');
  const create=doc.createElement;
  doc.createElement=tag=>{
    const node=create(tag);
    node.showModal=()=>{node.open=true;};
    node.close=()=>{node.open=false;};
    node.removeAttribute=key=>{delete node[key];};
    node.focus=()=>{node.focused=true;};
    node.select=()=>{node.selected=true;};
    return node;
  };
  const api=mountShareDialog(button,getSnapshot,{document:doc,window:{location:{href:page}},navigator:{clipboard},makeQr});
  const dialog=doc.body.children[0];
  for (const node of dialog.nodes) {
    node.removeAttribute=function(key){delete this[key];};
    node.focus=function(){this.focused=true;};
    node.select=function(){this.selected=true;};
  }
  return {api,button,dialog,$:s=>dialog.querySelector(s)};
}

test('dialog displays exact share link/QR PNG and copies it; clipboard failure selects manual fallback', async () => {
  let encoded,copied;
  const png='data:image/png;base64,cG5n';
  const h=shareHarness({makeQr:async link=>{encoded=link;return png;},clipboard:{writeText:async value=>{copied=value;}}});
  await h.button.emit('click');
  assert.equal(h.dialog.open,true);
  assert.equal(encoded,createShareLink(source,page));
  assert.equal(h.$('#share-link').value,encoded);
  assert.equal(h.$('#share-qr').src,png);
  assert.equal(h.$('#share-download').href,png);
  assert.equal(h.$('#share-download').hidden,false);
  assert.match(h.$('#share-download').attrs,/download="siteflow-result-qr.png"/);
  await h.$('#share-copy').emit('click');assert.equal(copied,encoded);
  const fallback=shareHarness({makeQr:async()=>png});
  await fallback.button.emit('click');await fallback.$('#share-copy').emit('click');
  assert.equal(fallback.$('#share-link').selected,true);
  assert.match(fallback.$('#share-message').textContent,/Ctrl\+C/);
});

test('local file never generates QR; close/reopen discards stale QR, failure leaves copying available', async () => {
  let snapshot={source},calls=0;
  const gate=deferred();
  const h=shareHarness({getSnapshot:()=>snapshot,makeQr:()=>{calls++;return gate.promise;}});
  const pending=h.button.emit('click');h.api.close();
  snapshot={source:{kind:'file',name:'local.json'}};
  await h.button.emit('click');gate.resolve('data:image/png;base64,old');await pending;
  assert.equal(calls,1);
  assert.equal(h.$('#share-content').hidden,true);
  assert.equal(h.$('#share-qr').hidden,true);
  assert.equal(h.$('#share-download').hidden,true);
  assert.match(h.$('#share-message').textContent,/공개 JSON URL/);
  const failed=shareHarness({makeQr:async()=>{throw new Error('too long');}});
  await failed.button.emit('click');
  assert.equal(failed.$('#share-content').hidden,false);
  assert.equal(failed.$('#share-download').hidden,true);
  assert.match(failed.$('#share-message').textContent,/공유 링크를 복사/);
});

test('QR library produces a real PNG locally for the share URL', async () => {
  const png=await QRCode.toDataURL(createShareLink(source,page),{errorCorrectionLevel:'M',margin:4,scale:8,type:'image/png'});
  const bytes=Buffer.from(png.split(',')[1],'base64');
  assert.equal(bytes.subarray(1,4).toString(),'PNG');
  assert(bytes.readUInt32BE(16)>200);
});
