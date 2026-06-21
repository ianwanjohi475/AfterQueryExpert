/**
 * HandshakeVerifier v1.4 — background service worker
 * CDP wire-level rewriter for BOTH /hai/graphql AND /hs/graphql.
 */
'use strict';

const HOST        = 'joinhandshake.com';
const GQL_GLOBS   = [
  '*joinhandshake.com/hai/graphql*',
  '*joinhandshake.com/hs/graphql*',
];
const CDP_PATTERNS = GQL_GLOBS.map(urlPattern => ({
  urlPattern, requestStage: 'Response',
}));

const attached = new Set();
const stats    = { patched: 0, seen: 0 };

// ── UTF-8 base64 ────────────────────────────────────────────────
function b64dec(s) {
  const bin   = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}
function b64enc(s) {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

// ── Patch rules (mirrors intercept.js) ──────────────────────────
const KEY_RULES = {
  'status':                                  v => v === 'NOT_REVIEWED' ? 'VERIFIED' : v,
  'hasQualifyingEducation':                  () => true,
  'showcase-projects-auto-approval':         () => true,
  'experiment-m2-project-specific-application': v => v === 'excluded' ? 'on' : v,
  'experiment-relevance-ready-form-v2':      v => v === 'excluded' ? 'on' : v,
  'experiment-hai-quick-apply-flow':         () => 'on',
  'experiment-hai-core-intent':              () => 'on',
  'experiment-hai-unified-promotion':        () => 'on',
  'experiment-hai-hub':                      v => v === 'excluded' ? 'on' : v,
  'experiment-hai-hub-link-in-nav':          v => v === 'excluded' ? 'on' : v,
  'experiment-hai-campaign-emails':          v => v === 'excluded' ? 'on' : v,
  'accessProhibited':                        () => false,
  'requiresPhoneVerification':               () => false,
  'requiresHaiPhoneVerification':            () => false,
  'requiresOnboarding':                      () => false,
  'requiresReonboarding':                    () => false,
  'requiresConfirmation':                    () => false,
  'needsVisibilitySettings':                 () => false,
};

function deepPatch(o) {
  if (!o || typeof o !== 'object') return o;
  for (const k of Object.keys(o)) {
    if (KEY_RULES[k] !== undefined) o[k] = KEY_RULES[k](o[k], o);
    if (k === 'canUse' && typeof o[k] === 'boolean' && 'hasQualifyingEducation' in o) o[k] = true;
    if (k === 'reason' && typeof o[k] === 'string' && o[k].includes('not qualify')) o[k] = 'User qualifies for onboarding';
    if (o[k] && typeof o[k] === 'object') deepPatch(o[k]);
  }
  return o;
}

function patchBody(text) {
  if (typeof text !== 'string') return text;
  if (!text.includes('NOT_REVIEWED') && !text.includes('"excluded"') &&
      !text.includes('canUse') && !text.includes('requiresPhone')) return text;
  try {
    return JSON.stringify(deepPatch(JSON.parse(text)));
  } catch {
    return text.replace(/"NOT_REVIEWED"/g, '"VERIFIED"');
  }
}

// ── Attach debugger ──────────────────────────────────────────────
async function attachTo(tabId) {
  if (attached.has(tabId)) return;
  try {
    await chrome.debugger.attach({ tabId }, '1.3');
    attached.add(tabId);
    await chrome.debugger.sendCommand({ tabId }, 'Fetch.enable', {
      patterns: CDP_PATTERNS,
    });
    updateBadge();
  } catch {}
}

chrome.tabs.onUpdated.addListener((tabId, _info, tab) => {
  if (tab.url && tab.url.includes(HOST)) attachTo(tabId);
});
chrome.tabs.query({ url: '*://*.joinhandshake.com/*' }, tabs =>
  tabs.forEach(t => attachTo(t.id))
);
chrome.tabs.onRemoved.addListener(id => { attached.delete(id); updateBadge(); });
chrome.debugger.onDetach.addListener(s => { attached.delete(s.tabId); updateBadge(); });

// ── Response interception ────────────────────────────────────────
chrome.debugger.onEvent.addListener(async (src, method, params) => {
  if (method !== 'Fetch.requestPaused') return;
  const { requestId, responseHeaders, responseStatusCode } = params;
  stats.seen++;
  try {
    const got      = await chrome.debugger.sendCommand(src, 'Fetch.getResponseBody', { requestId });
    const original = got.base64Encoded ? b64dec(got.body) : got.body;
    const patched  = patchBody(original);
    if (patched !== original) stats.patched++;
    await chrome.debugger.sendCommand(src, 'Fetch.fulfillRequest', {
      requestId,
      responseCode:    responseStatusCode || 200,
      responseHeaders: (responseHeaders || []).filter(
        h => !/^content-(length|encoding)$/i.test(h.name)
      ),
      body: b64enc(patched),
    });
    updateBadge();
  } catch {
    try { await chrome.debugger.sendCommand(src, 'Fetch.continueRequest', { requestId }); } catch {}
  }
});

// ── Side panel setup ─────────────────────────────────────────────
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(() => {});

// ── Badge ────────────────────────────────────────────────────────
function updateBadge() {
  const n = stats.patched;
  chrome.action.setBadgeText({ text: n > 0 ? String(n) : '' });
  chrome.action.setBadgeBackgroundColor({ color: '#22c55e' });
}

// ── Messaging ────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _s, reply) => {
  if (msg && msg.type === 'getStats')
    reply({ ...stats, tabs: attached.size });
  return true;
});
