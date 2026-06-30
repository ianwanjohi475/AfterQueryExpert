/**
 * Handshake KYC Bypass — background.js
 *
 * Wire-level rewriter (chrome.debugger / CDP Fetch domain) for:
 *   1. /api/trpc/blockingModals.getBlockingModalRequirements
 *        activeModal -> null, kycDetails -> all-complete
 *   2. /hai/graphql + /hs/graphql
 *        Profile.status PENDING|NOT_REVIEWED -> VERIFIED
 *        hasCompletedBlockingKyc / hasCompletedRegularKyc -> true
 */
'use strict';

const HOST = 'joinhandshake.com';

const CDP_PATTERNS = [
  { urlPattern: '*joinhandshake.com/api/trpc/*',   requestStage: 'Response' },
  { urlPattern: '*joinhandshake.com/hai/graphql*', requestStage: 'Response' },
  { urlPattern: '*joinhandshake.com/hs/graphql*',  requestStage: 'Response' },
];

const attached = new Set();
const stats = { patched: 0, seen: 0 };

// ── base64 (UTF-8 safe) ─────────────────────────────────────────────────────
function b64dec(s) {
  const bin = atob(s);
  const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return new TextDecoder('utf-8').decode(a);
}
function b64enc(s) {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

// ── Status + KYC patch rules ────────────────────────────────────────────────
const KYC_COMPLETE = {
  hasCompletedBlockingKyc: true,
  hasCompletedGeneralOnboarding: true,
  blockingKycCurrentStatus: 'completed',
  hasCompletedRegularKyc: true,
};

const KEY_RULES = {
  status: v => (v === 'PENDING' || v === 'NOT_REVIEWED') ? 'VERIFIED' : v,
  activeModal: v => (v === 'BLOCKING_KYC' || v === 'KYC' || /kyc/i.test(String(v))) ? null : v,
  hasCompletedBlockingKyc:        () => true,
  hasCompletedGeneralOnboarding:  () => true,
  hasCompletedRegularKyc:         () => true,
  blockingKycCurrentStatus:       () => 'completed',
};

function deepPatch(o) {
  if (!o || typeof o !== 'object') return o;
  if (Array.isArray(o)) {
    for (let i = 0; i < o.length; i++) deepPatch(o[i]);
    return o;
  }
  for (const k of Object.keys(o)) {
    if (KEY_RULES[k] !== undefined) {
      o[k] = KEY_RULES[k](o[k], o);
    }
    if (k === 'kycDetails' && o[k] && typeof o[k] === 'object') {
      Object.assign(o[k], KYC_COMPLETE);
    }
    if (o[k] && typeof o[k] === 'object') deepPatch(o[k]);
  }
  return o;
}

function patchJSON(text) {
  if (!text || typeof text !== 'string') return text;
  try {
    return JSON.stringify(deepPatch(JSON.parse(text)));
  } catch {
    return text
      .replace(/"NOT_REVIEWED"/g, '"VERIFIED"')
      .replace(/"PENDING"/g, '"VERIFIED"');
  }
}

function getHeader(headers, name) {
  const h = (headers || []).find(h => h.name.toLowerCase() === name.toLowerCase());
  return h ? h.value : '';
}

// ── Debugger lifecycle ──────────────────────────────────────────────────────
async function attachTo(tabId) {
  if (attached.has(tabId)) return;
  try {
    await chrome.debugger.attach({ tabId }, '1.3');
    attached.add(tabId);
    await chrome.debugger.sendCommand({ tabId }, 'Fetch.enable', { patterns: CDP_PATTERNS });
    updateBadge();
    console.log('[HSKYC] attached to tab', tabId);
  } catch (e) {
    console.log('[HSKYC] attach failed', tabId, e.message);
  }
}

chrome.tabs.onUpdated.addListener((tabId, _info, tab) => {
  if (tab && tab.url && tab.url.includes(HOST)) attachTo(tabId);
});
chrome.tabs.query({ url: '*://*.joinhandshake.com/*' }, tabs =>
  tabs.forEach(t => attachTo(t.id))
);
chrome.tabs.onRemoved.addListener(id => { attached.delete(id); updateBadge(); });
chrome.debugger.onDetach.addListener(s => { attached.delete(s.tabId); updateBadge(); });

// Manual re-attach when user clicks the toolbar icon (handy if Chrome
// dismissed the debugger banner)
chrome.action.onClicked.addListener(tab => { if (tab && tab.id) attachTo(tab.id); });

// ── CDP event handler ───────────────────────────────────────────────────────
chrome.debugger.onEvent.addListener(async (src, method, params) => {
  if (method !== 'Fetch.requestPaused') return;
  const { requestId, request, responseHeaders, responseStatusCode } = params;
  stats.seen++;

  try {
    const got = await chrome.debugger.sendCommand(src, 'Fetch.getResponseBody', { requestId });
    const original = got.base64Encoded ? b64dec(got.body) : got.body;

    const patched = patchJSON(original);
    const changed = patched !== original;
    if (changed) {
      stats.patched++;
      console.log('[HSKYC] patched', request.url.split('?')[0]);
    }

    const cleanHeaders = (responseHeaders || []).filter(
      h => !/^content-(length|encoding)$/i.test(h.name)
    );

    await chrome.debugger.sendCommand(src, 'Fetch.fulfillRequest', {
      requestId,
      responseCode:    responseStatusCode || 200,
      responseHeaders: cleanHeaders,
      body:            b64enc(patched),
    });
    updateBadge();
  } catch (e) {
    try { await chrome.debugger.sendCommand(src, 'Fetch.continueRequest', { requestId }); } catch {}
  }
});

function updateBadge() {
  chrome.action.setBadgeText({ text: stats.patched > 0 ? String(stats.patched) : '' });
  chrome.action.setBadgeBackgroundColor({ color: '#22c55e' });
}
