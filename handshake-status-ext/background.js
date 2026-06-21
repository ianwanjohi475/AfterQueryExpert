/**
 * HandshakeVerifier v1.5 — background service worker
 * - CDP wire-level rewriter for /hai/graphql + /hs/graphql
 * - Captures every request/response for inspection in the sidebar
 * - Aggressive null-rescue + error-array patches
 */
'use strict';

const HOST       = 'joinhandshake.com';
const CDP_PATTERNS = [
  { urlPattern: '*joinhandshake.com/hai/graphql*', requestStage: 'Response' },
  { urlPattern: '*joinhandshake.com/hs/graphql*',  requestStage: 'Response' },
];

const attached = new Set();
const stats    = { patched: 0, seen: 0 };
const captures = [];                   // last 50 ops, newest first
const requestBodies = new Map();       // requestId → request body string

// ── UTF-8 base64 ────────────────────────────────────────────────
function b64dec(s) {
  const bin = atob(s); const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return new TextDecoder('utf-8').decode(a);
}
function b64enc(s) {
  const a = new TextEncoder().encode(s); let bin = '';
  for (const b of a) bin += String.fromCharCode(b);
  return btoa(bin);
}

// ── Patch rules ─────────────────────────────────────────────────
const KEY_RULES = {
  // Status
  'status':                                     v => v === 'NOT_REVIEWED' ? 'VERIFIED' : v,

  // KYC / eligibility — true everywhere
  'hasQualifyingEducation':                     () => true,
  'isEligible':                                 () => true,
  'eligible':                                   () => true,
  'canUse':                                     () => true,
  'canApply':                                   () => true,
  'canSubmit':                                  () => true,
  'canView':                                    () => true,

  // Form / application existence
  'formNotFound':                               () => false,
  'notFound':                                   () => false,
  'formExists':                                 () => true,
  'applicationExists':                          () => true,
  'exists':                                     v => typeof v === 'boolean' ? true : v,

  // Access restrictions — all false
  'accessProhibited':                           () => false,
  'requiresPhoneVerification':                  () => false,
  'requiresHaiPhoneVerification':               () => false,
  'requiresOnboarding':                         () => false,
  'requiresReonboarding':                       () => false,
  'requiresConfirmation':                       () => false,
  'needsVisibilitySettings':                    () => false,
  'needsToAgreeToTos':                          () => false,

  // Feature flags
  'showcase-projects-auto-approval':            () => true,
  'experiment-m2-project-specific-application': v => v === 'excluded' ? 'on' : v,
  'experiment-relevance-ready-form-v2':         v => v === 'excluded' ? 'on' : v,
  'experiment-hai-quick-apply-flow':            () => 'on',
  'experiment-hai-core-intent':                 () => 'on',
  'experiment-hai-unified-promotion':           () => 'on',
  'experiment-hai-hub':                         v => v === 'excluded' ? 'on' : v,
  'experiment-hai-hub-link-in-nav':             v => v === 'excluded' ? 'on' : v,

  // GraphQL errors array — empty it
  'errors':                                     v => Array.isArray(v) ? [] : v,
};

function deepPatch(o) {
  if (!o || typeof o !== 'object') return o;
  for (const k of Object.keys(o)) {
    if (KEY_RULES[k] !== undefined) o[k] = KEY_RULES[k](o[k], o);
    if (k === 'reason' && typeof o[k] === 'string' && /not qualify|ineligible|denied/i.test(o[k]))
      o[k] = 'OK';
    if (o[k] && typeof o[k] === 'object') deepPatch(o[k]);
  }
  return o;
}

function patchBody(text) {
  if (typeof text !== 'string' || !text.length) return text;
  try {
    return JSON.stringify(deepPatch(JSON.parse(text)));
  } catch {
    return text.replace(/"NOT_REVIEWED"/g, '"VERIFIED"');
  }
}

// ── Extract op metadata ─────────────────────────────────────────
function parseOp(body) {
  if (!body) return { operationName: null, query: null, variables: null };
  try {
    const j = JSON.parse(body);
    if (Array.isArray(j)) {
      return {
        operationName: j.map(x => x.operationName).filter(Boolean).join(', ') || '[batch]',
        query:         j[0]?.query,
        variables:     j.map(x => x.variables),
      };
    }
    return {
      operationName: j.operationName || null,
      query:         (j.query || '').slice(0, 200),
      variables:     j.variables || null,
    };
  } catch {
    return { operationName: null, query: null, variables: null, raw: body.slice(0, 200) };
  }
}

function recordCapture(entry) {
  captures.unshift(entry);
  while (captures.length > 50) captures.pop();
}

// ── Debugger lifecycle ──────────────────────────────────────────
async function attachTo(tabId) {
  if (attached.has(tabId)) return;
  try {
    await chrome.debugger.attach({ tabId }, '1.3');
    attached.add(tabId);
    // Intercept BOTH request and response stages
    await chrome.debugger.sendCommand({ tabId }, 'Fetch.enable', {
      patterns: [
        { urlPattern: '*joinhandshake.com/hai/graphql*', requestStage: 'Request'  },
        { urlPattern: '*joinhandshake.com/hai/graphql*', requestStage: 'Response' },
        { urlPattern: '*joinhandshake.com/hs/graphql*',  requestStage: 'Request'  },
        { urlPattern: '*joinhandshake.com/hs/graphql*',  requestStage: 'Response' },
      ],
    });
    updateBadge();
  } catch {}
}

chrome.tabs.onUpdated.addListener((tabId, _info, tab) => {
  if (tab.url && tab.url.includes(HOST)) attachTo(tabId);
});
chrome.tabs.query({ url: '*://*.joinhandshake.com/*' }, tabs =>
  tabs.forEach(t => attachTo(t.id)));
chrome.tabs.onRemoved.addListener(id => { attached.delete(id); updateBadge(); });
chrome.debugger.onDetach.addListener(s => { attached.delete(s.tabId); updateBadge(); });

// ── Intercept ───────────────────────────────────────────────────
chrome.debugger.onEvent.addListener(async (src, method, params) => {
  if (method !== 'Fetch.requestPaused') return;
  const { requestId, request, responseHeaders, responseStatusCode } = params;

  // REQUEST stage — record body and pass through
  if (params.responseStatusCode === undefined) {
    if (request && request.postData) requestBodies.set(requestId, request.postData);
    try { await chrome.debugger.sendCommand(src, 'Fetch.continueRequest', { requestId }); } catch {}
    return;
  }

  // RESPONSE stage
  stats.seen++;
  const reqBody = requestBodies.get(requestId);
  requestBodies.delete(requestId);
  const op = parseOp(reqBody);

  try {
    const got      = await chrome.debugger.sendCommand(src, 'Fetch.getResponseBody', { requestId });
    const original = got.base64Encoded ? b64dec(got.body) : got.body;
    const patched  = patchBody(original);
    const changed  = patched !== original;
    if (changed) stats.patched++;

    recordCapture({
      ts:           Date.now(),
      url:          request.url,
      status:       responseStatusCode,
      op:           op.operationName,
      changed,
      reqVariables: op.variables,
      reqQuerySnip: op.query,
      respOriginal: original.slice(0, 4000),
      respPatched:  changed ? patched.slice(0, 4000) : null,
    });

    await chrome.debugger.sendCommand(src, 'Fetch.fulfillRequest', {
      requestId,
      responseCode:    responseStatusCode || 200,
      responseHeaders: (responseHeaders || []).filter(
        h => !/^content-(length|encoding)$/i.test(h.name)
      ),
      body: b64enc(patched),
    });
    updateBadge();
  } catch (e) {
    try { await chrome.debugger.sendCommand(src, 'Fetch.continueRequest', { requestId }); } catch {}
  }
});

// ── Side panel ──────────────────────────────────────────────────
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

// ── Badge ───────────────────────────────────────────────────────
function updateBadge() {
  const n = stats.patched;
  chrome.action.setBadgeText({ text: n > 0 ? String(n) : '' });
  chrome.action.setBadgeBackgroundColor({ color: '#22c55e' });
}

// ── Messaging ───────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _s, reply) => {
  if (!msg) return false;
  if (msg.type === 'getStats') {
    reply({ ...stats, tabs: attached.size, captureCount: captures.length });
    return true;
  }
  if (msg.type === 'getCaptures') {
    reply({ captures: captures.slice(0, msg.limit || 25) });
    return true;
  }
  if (msg.type === 'clearCaptures') {
    captures.length = 0;
    reply({ ok: true });
    return true;
  }
  return false;
});
