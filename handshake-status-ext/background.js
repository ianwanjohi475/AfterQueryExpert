/**
 * HandshakeVerifier v1.3 — background service worker
 *
 * Uses chrome.debugger + CDP Fetch domain to rewrite the actual HTTPS
 * response bytes for /hai/graphql. This is the only Chrome API that can
 * change what the DevTools Network tab displays — content scripts cannot.
 */

'use strict';

const HOST_MATCH = 'joinhandshake.com';
const URL_GLOB   = '*joinhandshake.com/hai/graphql*';
const FROM       = 'NOT_REVIEWED';
const TO         = 'VERIFIED';

const attached = new Set();
const stats    = { patched: 0, seen: 0 };

/* ── utf-8 safe base64 helpers ─────────────────────────────── */
function b64decode(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}
function b64encode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/* ── deep patch ────────────────────────────────────────────── */
function deepPatch(obj) {
  if (!obj || typeof obj !== 'object') return;
  for (const k of Object.keys(obj)) {
    if (k === 'status' && obj[k] === FROM) obj[k] = TO;
    else if (obj[k] && typeof obj[k] === 'object') deepPatch(obj[k]);
  }
}
function patchBody(text) {
  if (typeof text !== 'string' || !text.includes(FROM)) return text;
  try {
    const j = JSON.parse(text);
    deepPatch(j);
    return JSON.stringify(j);
  } catch {
    return text.split('"' + FROM + '"').join('"' + TO + '"');
  }
}

/* ── attach debugger to handshake tabs ─────────────────────── */
async function attachTo(tabId) {
  if (attached.has(tabId)) return;
  try {
    await chrome.debugger.attach({ tabId }, '1.3');
    attached.add(tabId);
    await chrome.debugger.sendCommand({ tabId }, 'Fetch.enable', {
      patterns: [{ urlPattern: URL_GLOB, requestStage: 'Response' }],
    });
    console.log('[HV] debugger attached to tab', tabId);
  } catch (e) {
    // Already attached, or user denied — silent
  }
}

chrome.tabs.onUpdated.addListener((tabId, _info, tab) => {
  if (tab.url && tab.url.includes(HOST_MATCH)) attachTo(tabId);
});

chrome.tabs.query({ url: '*://*.joinhandshake.com/*' }, tabs =>
  tabs.forEach(t => attachTo(t.id))
);

chrome.tabs.onRemoved.addListener(tabId => attached.delete(tabId));
chrome.debugger.onDetach.addListener(src => attached.delete(src.tabId));

/* ── intercept + rewrite responses ─────────────────────────── */
chrome.debugger.onEvent.addListener(async (source, method, params) => {
  if (method !== 'Fetch.requestPaused') return;

  const { requestId, responseHeaders, responseStatusCode } = params;
  stats.seen++;

  try {
    const got = await chrome.debugger.sendCommand(
      source, 'Fetch.getResponseBody', { requestId }
    );

    const original = got.base64Encoded ? b64decode(got.body) : got.body;
    const patched  = patchBody(original);

    if (patched !== original) stats.patched++;

    await chrome.debugger.sendCommand(source, 'Fetch.fulfillRequest', {
      requestId,
      responseCode:    responseStatusCode || 200,
      responseHeaders: (responseHeaders || []).filter(
        h => !/^content-(length|encoding)$/i.test(h.name)
      ),
      body: b64encode(patched),
    });

    chrome.action.setBadgeText({ text: String(stats.patched) });
    chrome.action.setBadgeBackgroundColor({ color: '#22c55e' });
  } catch (e) {
    try {
      await chrome.debugger.sendCommand(source, 'Fetch.continueRequest', { requestId });
    } catch {}
  }
});

/* ── popup messaging ───────────────────────────────────────── */
chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
  if (msg && msg.type === 'getStats') {
    sendResponse({ ...stats, attachedTabs: attached.size });
  }
  return true;
});
