/**
 * HandshakeVerifier v1.7
 *
 * Three-layer interception:
 * 1. HTML document pages — patches __NEXT_DATA__ in raw HTML BEFORE the
 *    browser parses it, so SSR and client agree → no React #418 hydration error
 * 2. /hai/graphql + /hs/graphql JSON — deep-patches all gate fields
 * 3. Captures every op for sidebar inspection
 */
'use strict';

const HOST = 'joinhandshake.com';

// Intercept HTML pages on /fellow/ and /hai/ routes, PLUS both GraphQL endpoints
const CDP_PATTERNS = [
  // HTML documents — catches SSR before React even loads
  { urlPattern: '*joinhandshake.com/fellow*', requestStage: 'Response', resourceType: 'Document' },
  { urlPattern: '*joinhandshake.com/hai*',    requestStage: 'Response', resourceType: 'Document' },

  // GraphQL JSON — request stage to capture body, response stage to rewrite
  { urlPattern: '*joinhandshake.com/hai/graphql*', requestStage: 'Request'  },
  { urlPattern: '*joinhandshake.com/hai/graphql*', requestStage: 'Response' },
  { urlPattern: '*joinhandshake.com/hs/graphql*',  requestStage: 'Request'  },
  { urlPattern: '*joinhandshake.com/hs/graphql*',  requestStage: 'Response' },
];

const attached     = new Set();
const stats        = { patched: 0, seen: 0 };
const captures     = [];
const requestBodies = new Map();

// ── UTF-8 base64 ────────────────────────────────────────────────────────────
function b64dec(s) {
  const bin = atob(s); const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return new TextDecoder('utf-8').decode(a);
}
function b64enc(s) {
  const bytes = new TextEncoder().encode(s); let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

// ── Fake institution (required for form access; user has institution:null) ──
const FAKE_INSTITUTION = {
  id: '1',
  name: 'University of London',
  type: 'university',
  __typename: 'Institution',
};

// ── Patch rules ──────────────────────────────────────────────────────────────
const KEY_RULES = {
  'status':                                     v => v === 'NOT_REVIEWED' ? 'VERIFIED' : v,
  'hasQualifyingEducation':                     () => true,
  'isEligible':                                 () => true,
  'eligible':                                   () => true,
  'canUse':                                     () => true,
  'canApply':                                   () => true,
  'canSubmit':                                  () => true,
  'canView':                                    () => true,
  'formNotFound':                               () => false,
  'isFormFound':                                () => true,
  'formExists':                                 () => true,
  'applicationExists':                          () => true,
  'accessProhibited':                           () => false,
  'requiresPhoneVerification':                  () => false,
  'requiresHaiPhoneVerification':               () => false,
  'requiresOnboarding':                         () => false,
  'requiresReonboarding':                       () => false,
  'requiresConfirmation':                       () => false,
  'needsVisibilitySettings':                    () => false,
  'needsToAgreeToTos':                          () => false,
  'showcase-projects-auto-approval':            () => true,
  'experiment-m2-project-specific-application': v => v === 'excluded' ? 'on' : v,
  'experiment-relevance-ready-form-v2':         v => v === 'excluded' ? 'on' : v,
  'experiment-hai-quick-apply-flow':            () => 'on',
  'experiment-hai-core-intent':                 () => 'on',
  'experiment-hai-unified-promotion':           () => 'on',
  'experiment-hai-hub':                         v => v === 'excluded' ? 'on' : v,
  'experiment-hai-hub-link-in-nav':             v => v === 'excluded' ? 'on' : v,
};

function deepPatch(o) {
  if (!o || typeof o !== 'object') return o;
  for (const k of Object.keys(o)) {
    if (KEY_RULES[k] !== undefined) {
      o[k] = KEY_RULES[k](o[k], o);
    }
    // KYC canUse — only inside silentKycEligibility
    if (k === 'canUse' && typeof o[k] === 'boolean' && 'hasQualifyingEducation' in o) {
      o[k] = true;
    }
    // Fix disqualification reason
    if (k === 'reason' && typeof o[k] === 'string' && /not qualify|ineligible|denied/i.test(o[k])) {
      o[k] = 'OK';
    }
    // Inject fake institution when User has none
    if (k === '__typename' && o[k] === 'User' && ('institution' in o) && o.institution === null) {
      o.institution = FAKE_INSTITUTION;
    }
    // Recurse
    if (o[k] && typeof o[k] === 'object') deepPatch(o[k]);
  }
  return o;
}

// ── Patch JSON body ──────────────────────────────────────────────────────────
function patchJSON(text) {
  if (!text || typeof text !== 'string') return text;
  try { return JSON.stringify(deepPatch(JSON.parse(text))); }
  catch { return text.replace(/"NOT_REVIEWED"/g, '"VERIFIED"'); }
}

// ── Patch HTML — rewrites __NEXT_DATA__ before browser parses it ─────────────
function patchHTML(html) {
  if (!html || typeof html !== 'string') return html;
  if (!html.includes('__NEXT_DATA__')) return html;

  return html.replace(
    /(<script[^>]*id=["']__NEXT_DATA__["'][^>]*>)([\s\S]*?)(<\/script>)/i,
    (match, open, json, close) => {
      try {
        const data = JSON.parse(json);
        deepPatch(data);
        return open + JSON.stringify(data) + close;
      } catch { return match; }
    }
  );
}

// ── Detect response type ─────────────────────────────────────────────────────
function getContentType(headers) {
  const h = (headers || []).find(h => /^content-type$/i.test(h.name));
  return h ? h.value : '';
}

// ── Parse GraphQL op name from request body ──────────────────────────────────
function parseOp(body) {
  if (!body) return { operationName: null, variables: null, query: null };
  try {
    const j = JSON.parse(body);
    if (Array.isArray(j)) return {
      operationName: j.map(x => x.operationName).filter(Boolean).join(', ') || '[batch]',
      variables: j.map(x => x.variables),
      query: j[0]?.query,
    };
    return {
      operationName: j.operationName || null,
      variables: j.variables || null,
      query: (j.query || '').slice(0, 300),
    };
  } catch { return { operationName: null, variables: null, query: null }; }
}

function recordCapture(entry) {
  captures.unshift(entry);
  while (captures.length > 50) captures.pop();
}

// ── Debugger lifecycle ───────────────────────────────────────────────────────
async function attachTo(tabId) {
  if (attached.has(tabId)) return;
  try {
    await chrome.debugger.attach({ tabId }, '1.3');
    attached.add(tabId);
    await chrome.debugger.sendCommand({ tabId }, 'Fetch.enable', {
      patterns: CDP_PATTERNS,
    });
    updateBadge();
    console.log('[HV] Attached to tab', tabId);
  } catch (e) {
    console.log('[HV] Attach failed', tabId, e.message);
  }
}

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (tab.url && tab.url.includes(HOST)) attachTo(tabId);
});
chrome.tabs.query({ url: '*://*.joinhandshake.com/*' }, tabs =>
  tabs.forEach(t => attachTo(t.id))
);
chrome.tabs.onRemoved.addListener(id => { attached.delete(id); updateBadge(); });
chrome.debugger.onDetach.addListener(s => { attached.delete(s.tabId); updateBadge(); });

// ── CDP event handler ────────────────────────────────────────────────────────
chrome.debugger.onEvent.addListener(async (src, method, params) => {
  if (method !== 'Fetch.requestPaused') return;
  const { requestId, request, responseHeaders, responseStatusCode } = params;

  // REQUEST stage — record body for op capture, then continue
  if (responseStatusCode === undefined) {
    if (request && request.postData) requestBodies.set(requestId, request.postData);
    try { await chrome.debugger.sendCommand(src, 'Fetch.continueRequest', { requestId }); } catch {}
    return;
  }

  // RESPONSE stage
  stats.seen++;
  const reqBody = requestBodies.get(requestId) || '';
  requestBodies.delete(requestId);

  const ct = getContentType(responseHeaders);
  const isHTML = /text\/html/i.test(ct);
  const isJSON = /application\/json/i.test(ct) || request.url.includes('graphql');

  try {
    const got      = await chrome.debugger.sendCommand(src, 'Fetch.getResponseBody', { requestId });
    const original = got.base64Encoded ? b64dec(got.body) : got.body;

    let patched = original;
    if (isHTML) {
      patched = patchHTML(original);
    } else if (isJSON) {
      patched = patchJSON(original);
    }

    const changed = patched !== original;
    if (changed) stats.patched++;

    // Capture for sidebar (GraphQL only, not HTML pages)
    if (isJSON) {
      const op = parseOp(reqBody);
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
    }

    // Strip content-length and content-encoding so Chrome accepts our patched body
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
    // Fallthrough: let the response pass unmodified
    try { await chrome.debugger.sendCommand(src, 'Fetch.continueRequest', { requestId }); } catch {}
  }
});

// ── Side panel ───────────────────────────────────────────────────────────────
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

// ── Badge ────────────────────────────────────────────────────────────────────
function updateBadge() {
  chrome.action.setBadgeText({ text: stats.patched > 0 ? String(stats.patched) : '' });
  chrome.action.setBadgeBackgroundColor({ color: '#22c55e' });
}

// ── Messaging ────────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _s, reply) => {
  if (!msg) return false;
  if (msg.type === 'getStats')    { reply({ ...stats, tabs: attached.size, captureCount: captures.length }); return true; }
  if (msg.type === 'getCaptures') { reply({ captures: captures.slice(0, msg.limit || 25) }); return true; }
  if (msg.type === 'clearCaptures') { captures.length = 0; reply({ ok: true }); return true; }
  return false;
});
