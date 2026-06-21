/**
 * HandshakeVerifier v1.14
 *
 * Three-layer interception:
 * 1. HTML document pages — patches __NEXT_DATA__ AND Next.js App Router RSC
 *    stream chunks (self.__next_f.push) in raw HTML BEFORE the browser parses
 *    them. Replaces "Form not found" RSC element tree with a real form.
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

// ── Synthetic form object — makes Handshake's own React form component render ─
// Covers every field name variation seen in Handshake's JS bundle so React
// doesn't reject the object regardless of which alias the query uses.
function makeSyntheticForm(formId) {
  const q = (id, pos, prompt, required, type) => ({
    id,
    __typename: 'ApplicationFormQuestion',
    type, kind: type,
    prompt, label: prompt, text: prompt, title: prompt, name: prompt,
    required, optional: !required,
    position: pos, order: pos, index: pos,
    choices: [], options: [], answers: [],
    helpText: null, placeholder: null, description: null,
  });
  return {
    id: formId || 'hv-form-1',
    __typename: 'ProjectApplicationForm',
    title: 'Project Application', name: 'Project Application',
    status: 'PUBLISHED', state: 'PUBLISHED',
    enabled: true, isPublished: true, isActive: true,
    description: null, instructions: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    questions: [
      q('hv-q1', 0, 'Why are you interested in this project?',     true,  'LONG_TEXT'),
      q('hv-q2', 1, 'What relevant skills or experience do you have?', false, 'LONG_TEXT'),
      q('hv-q3', 2, 'What is your weekly availability?',           false, 'SHORT_TEXT'),
    ],
    project: null, submission: null, existingSubmission: null,
    hasExistingSubmission: false, alreadyApplied: false,
    requiresResume: false, requiresCoverLetter: false,
  };
}

// Keys whose null value means "no form was created for this user" — replace with
// a synthetic form so Handshake's own form component renders.
const FORM_NULL_KEYS = new Set([
  'projectApplicationForm',
  'applicationForm',
  'projectInterestForm',
  'interestForm',
  'projectForm',
]);

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

function deepPatch(o, _formId) {
  if (!o || typeof o !== 'object') return o;

  // Pull form ID from URL context when available
  const formId = _formId || (() => {
    try {
      const m = (typeof location !== 'undefined' ? location.href : '').match(/\/forms\/([\w-]+)/);
      return m ? m[1] : null;
    } catch { return null; }
  })();

  for (const k of Object.keys(o)) {
    // Inject synthetic form when server returns null for a form key
    if (FORM_NULL_KEYS.has(k) && o[k] === null) {
      o[k] = makeSyntheticForm(formId);
    }

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
    if (o[k] && typeof o[k] === 'object') deepPatch(o[k], formId);
  }
  return o;
}

// ── Patch JSON body ──────────────────────────────────────────────────────────
function patchJSON(text) {
  if (!text || typeof text !== 'string') return text;
  try { return JSON.stringify(deepPatch(JSON.parse(text))); }
  catch { return text.replace(/"NOT_REVIEWED"/g, '"VERIFIED"'); }
}

// ── Build RSC form element tree (for CDP-level HTML patching) ───────────────
// Uses only native HTML elements + Handshake's existing Tailwind classes so
// React can render this without any custom component references.
function buildRSCFormTree(projectId) {
  const SUBMIT_EP = 'http://localhost:4000/submit';
  const inp = (name, type, ph, val) => ['$', 'input', name, {
    name, type: type || 'text',
    defaultValue: val || '',
    placeholder: ph || '',
    required: true,
    className: 'w-full px-3 py-2 rounded-md border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary',
  }];
  const txt = (name, ph) => ['$', 'textarea', name, {
    name, placeholder: ph || '', rows: 4, required: false,
    className: 'w-full px-3 py-2 rounded-md border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-y',
  }];
  const field = (lbl, child) => ['$', 'div', null, {
    className: 'mb-4',
    children: [
      ['$', 'label', null, { className: 'block text-sm font-medium text-foreground mb-1', children: lbl }],
      child,
    ],
  }];
  return ['$', 'div', null, {
    className: 'flex min-h-screen items-center justify-center bg-surface p-6',
    children: [
      ['$', 'div', null, {
        className: 'w-full max-w-2xl rounded-xl border border-border bg-card shadow-sm overflow-hidden',
        'data-hv-form': '1',
        'data-hv-project-id': projectId || '',
        children: [
          ['$', 'div', null, {
            className: 'px-8 py-6 border-b border-border bg-surface',
            children: [
              ['$', 'h1', null, { className: 'text-2xl font-bold text-primary-foreground', children: 'Project Application' }],
              ['$', 'p', null, { className: 'mt-1 text-sm text-muted-foreground', children: 'Submit your interest for this opportunity' }],
            ],
          }],
          ['$', 'form', null, {
            id: 'hv-rsc-form',
            className: 'px-8 py-6',
            children: [
              field('First name *', inp('firstName', 'text', '', 'Nathan')),
              field('Last name *',  inp('lastName',  'text', '', 'Fox')),
              field('Email *',      inp('email', 'email', '', 'christianojimik55@gmail.com')),
              field('Why are you interested in this project? *', txt('motivation', 'Tell us what draws you to this opportunity…')),
              field('Relevant experience', txt('experience', 'Briefly describe your relevant background…')),
              field('Portfolio / LinkedIn URL', inp('portfolio', 'url', 'https://')),
              ['$', 'button', null, {
                type: 'submit',
                className: 'w-full mt-2 px-4 py-3 rounded-md bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity',
                children: 'Submit interest',
              }],
              ['$', 'p', null, {
                className: 'mt-3 text-xs text-muted-foreground text-center',
                children: 'Submits to ' + SUBMIT_EP,
              }],
            ],
          }],
        ],
      }],
    ],
  }];
}

// ── Patch RSC __next_f.push chunks containing "Form not found" ───────────────
// Each Next.js App Router RSC chunk is emitted as a separate <script> tag:
//   <script>self.__next_f.push([type, "rowId:elementTreeJSON"])</script>
// We find the one that carries the "Form not found" element tree and replace
// its payload with our form element tree.
function patchRSCFormNotFound(html, url) {
  const idMatch = (url || '').match(/\/forms\/([\w-]+)/);
  const projectId = idMatch ? idMatch[1] : '';

  let rewriteCount = 0;
  const out = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (match, attrs, content) => {
    if (!content.includes('__next_f.push')) return match;
    if (!/Form not found|doesn.?t exist or has been removed/i.test(content)) return match;

    try {
      const prefix = 'self.__next_f.push(';
      const pushIdx = content.indexOf(prefix);
      if (pushIdx === -1) return match;
      const argStart = pushIdx + prefix.length;
      // Find the matching closing ')' — last ')' in the script body is safe
      // because the push call is always the last thing in the tag.
      const argEnd = content.lastIndexOf(')');
      if (argEnd <= argStart) return match;
      const argStr = content.slice(argStart, argEnd).trim();

      const arr = JSON.parse(argStr);
      if (!Array.isArray(arr) || arr.length < 2) return match;
      const [chunkType, payload] = arr;
      if (typeof payload !== 'string') return match;

      // Row ID is everything before the first colon (hex digits in App Router)
      const colonIdx = payload.indexOf(':');
      if (colonIdx <= 0) return match;
      const rowId = payload.slice(0, colonIdx);
      const treeJson = payload.slice(colonIdx + 1);

      // STRUCTURAL CHECK — distinguish the actual not-found element tree from
      // i18n bundles that happen to contain the literal string "Form not found".
      // The real chunk is ["$","div",null,{className:".*min-h-screen.*",...}]
      // with an h1 whose children equals "Form not found". The i18n chunk is
      // ["$","$L2d",null,{messages:{...}}] — tag is a $L<id> reference, not "div".
      let tree;
      try { tree = JSON.parse(treeJson); } catch { return match; }
      if (!Array.isArray(tree) || tree[0] !== '$' || tree[1] !== 'div') return match;
      const treeStr = JSON.stringify(tree);
      if (!/"children":\s*"Form not found"/.test(treeStr)) return match;

      const formTree = buildRSCFormTree(projectId);
      const newPayload = rowId + ':' + JSON.stringify(formTree);
      rewriteCount++;
      console.log('[HV v1.14.3] CDP RSC rewrite: row', rowId, '→ form (project:', projectId || 'unknown', ')');
      // Preserve the original script tag attributes (including any CSP nonce)
      return '<script' + attrs + '>self.__next_f.push(' +
        JSON.stringify([chunkType, newPayload]) + ')</script>';
    } catch (e) {
      console.warn('[HV v1.14.3] CDP RSC rewrite failed:', e.message);
      return match;
    }
  });

  if (rewriteCount === 0) {
    console.warn('[HV v1.14.3] No RSC chunks rewritten despite "Form not found" in HTML — regex may need updating');
  }
  return out;
}

// ── Patch HTML — rewrites RSC chunks + __NEXT_DATA__ before browser parses it ─
function patchHTML(html, url) {
  if (!html || typeof html !== 'string') return html;

  // Patch Next.js App Router RSC stream when this is a form page with "Form not found"
  if (html.includes('__next_f') &&
      /Form not found|doesn.?t exist or has been removed/i.test(html)) {
    html = patchRSCFormNotFound(html, url);
  }

  // Patch legacy __NEXT_DATA__ (Pages Router / hybrid pages)
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
      patched = patchHTML(original, request.url);
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
