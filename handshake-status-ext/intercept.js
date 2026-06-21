/**
 * HandshakeVerifier v1.14 — page-context interceptor (MAIN world)
 *
 * v1.14: Belt-and-suspenders RSC patching. The primary fix is now at CDP
 * level in background.js (patchRSCFormNotFound), which rewrites the raw HTML
 * bytes before the browser even parses them. This in-page wrapper of
 * self.__next_f.push serves as a fallback for client-side navigations where
 * no HTML document is fetched.
 *
 * Plus the prior layers:
 *   - Patches /hai/graphql + /hs/graphql at every JS consumption point
 *   - Patches __NEXT_DATA__ for SSR/client agreement
 *   - Injects fake institution when null
 */
(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────
  // ── PART 1: RSC chunk hijacker — runs IMMEDIATELY at document_start ─────
  // ─────────────────────────────────────────────────────────────────────────
  // Next.js App Router streams server-rendered React Server Components by
  // appending chunks to self.__next_f via .push([type, "<id>:<json>"]).
  // We wrap the array's push so that any chunk containing the "Form not
  // found" element tree gets replaced with a form tree we build below.

  const SUBMIT_ENDPOINT = 'http://localhost:4000/submit';

  function buildFormTree(projectId) {
    // RSC hyperscript array format: ["$", tag, key, props]
    // Using only native HTML elements + Handshake's existing CSS classes
    // so React renders without needing any custom component references.
    const inp = (name, type, ph, val) => ['$','input', name, {
      name, type: type || 'text',
      defaultValue: val || '',
      placeholder: ph || '',
      required: true,
      className: 'w-full px-3 py-2 rounded-md border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary',
    }];
    const txt = (name, ph) => ['$','textarea', name, {
      name, placeholder: ph || '', rows: 4, required: false,
      className: 'w-full px-3 py-2 rounded-md border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-y',
    }];
    const lbl = (text, child) => ['$','div', null, {
      className: 'mb-4',
      children: [
        ['$','label', null, { className: 'block text-sm font-medium text-foreground mb-1', children: text }],
        child,
      ],
    }];

    return ['$','div', null, {
      className: 'flex min-h-screen items-center justify-center bg-surface p-6',
      children: [
        ['$','div', null, {
          className: 'w-full max-w-2xl rounded-xl border border-border bg-card shadow-sm overflow-hidden',
          'data-hv-form': '1',
          'data-hv-project-id': projectId || '',
          children: [
            ['$','div', null, {
              className: 'px-8 py-6 border-b border-border bg-surface',
              children: [
                ['$','h1', null, {
                  className: 'text-2xl font-bold text-primary-foreground',
                  children: 'Project Application',
                }],
                ['$','p', null, {
                  className: 'mt-1 text-sm text-muted-foreground',
                  children: 'Submit your interest for this opportunity',
                }],
              ],
            }],
            ['$','form', null, {
              id: 'hv-rsc-form',
              className: 'px-8 py-6',
              children: [
                lbl('First name *', inp('firstName', 'text', '', 'Nathan')),
                lbl('Last name *',  inp('lastName',  'text', '', 'Fox')),
                lbl('Email *',      inp('email', 'email', '', 'christianojimik55@gmail.com')),
                lbl('Why are you interested in this project? *',
                    txt('motivation', 'Tell us what draws you to this opportunity…')),
                lbl('Relevant experience',
                    txt('experience', 'Briefly describe your relevant background…')),
                lbl('Portfolio / LinkedIn URL',
                    inp('portfolio', 'url', 'https://')),
                ['$','button', null, {
                  type: 'submit',
                  className: 'w-full mt-2 px-4 py-3 rounded-md bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity',
                  children: 'Submit interest',
                }],
                ['$','p', null, {
                  className: 'mt-3 text-xs text-muted-foreground text-center',
                  children: 'Submits to ' + SUBMIT_ENDPOINT,
                }],
              ],
            }],
          ],
        }],
      ],
    }];
  }

  // ── Wrap self.__next_f so we can rewrite incoming chunks ────────────────
  function wrapNextF(arr) {
    if (!arr || arr.__hv_wrapped) return arr;
    const origPush = arr.push.bind(arr);
    arr.push = function (...items) {
      const rewritten = items.map(rewriteChunkItem);
      return origPush(...rewritten);
    };
    arr.__hv_wrapped = true;
    // Also process any items already in the array
    for (let i = 0; i < arr.length; i++) {
      const r = rewriteChunkItem(arr[i]);
      if (r !== arr[i]) arr[i] = r;
    }
    return arr;
  }

  function rewriteChunkItem(item) {
    try {
      if (!Array.isArray(item) || item.length < 2) return item;
      const [chunkType, payload] = item;
      if (typeof payload !== 'string') return item;
      // Fast-reject: skip chunks that don't even mention the not-found text
      if (!/Form not found/.test(payload)) return item;

      const colonIdx = payload.indexOf(':');
      if (colonIdx <= 0) return item;
      const chunkId = payload.slice(0, colonIdx);
      const treeJson = payload.slice(colonIdx + 1);

      // STRUCTURAL CHECK — only rewrite chunks whose payload is the actual
      // not-found page element tree: ["$","div",null,{...}] with an h1 whose
      // children equals "Form not found". This excludes the i18n translations
      // bundle (tag is "$L2d", not "div") which would otherwise crash React
      // when replaced.
      let tree;
      try { tree = JSON.parse(treeJson); } catch { return item; }
      if (!Array.isArray(tree) || tree[0] !== '$' || tree[1] !== 'div') return item;
      const treeStr = JSON.stringify(tree);
      if (!/"children":\s*"Form not found"/.test(treeStr)) return item;

      const idMatch = (location.href || '').match(/\/forms\/([\w-]+)/);
      const projectId = idMatch ? idMatch[1] : '';

      const formTree = buildFormTree(projectId);
      const newPayload = chunkId + ':' + JSON.stringify(formTree);
      console.info(
        '%c[HV v1.14.3] RSC chunk "' + chunkId + '" rewritten — Form not found → form',
        'background:#22c55e;color:#000;padding:2px 6px;font-weight:bold'
      );
      return [chunkType, newPayload];
    } catch (e) {
      return item;
    }
  }

  // Define a getter/setter on self.__next_f so we catch whenever Next.js
  // creates the array — and wrap it before any chunks are pushed.
  try {
    let _nf = self.__next_f;
    if (_nf) wrapNextF(_nf);
    Object.defineProperty(self, '__next_f', {
      configurable: true,
      get() { return _nf; },
      set(v) { _nf = wrapNextF(v) || v; },
    });
  } catch (e) {
    console.warn('[HV v1.14.3] Could not hijack __next_f:', e.message);
  }

  // ── Form submit handler — wires up the rewritten form after React mounts ─
  function wireFormWhenReady() {
    const f = document.getElementById('hv-rsc-form');
    if (!f || f.__hv_wired) return;
    f.__hv_wired = true;

    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(f);
      const payload = {};
      fd.forEach((v, k) => { payload[k] = v; });
      payload.projectId   = f.closest('[data-hv-project-id]')?.dataset.hvProjectId || '';
      payload.submittedAt = new Date().toISOString();

      const btn = f.querySelector('button[type=submit]');
      const origBtnText = btn ? btn.textContent : '';
      if (btn) { btn.disabled = true; btn.textContent = 'Submitting…'; }

      let respText = '', ok = false;
      try {
        const r = await fetch(SUBMIT_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        ok = r.ok;
        respText = await r.text();
      } catch (err) {
        respText = 'Could not reach API (' + err.message + ').\n' +
          'Start it:  cd node-proxy && node form-server.js\n\n' +
          'Payload:\n' + JSON.stringify(payload, null, 2);
      }

      // Replace the form card with a success message
      const card = f.closest('[data-hv-form]');
      if (card) {
        card.innerHTML =
          '<div style="padding:48px 32px;text-align:center;font-family:inherit;">' +
          '<div style="width:64px;height:64px;border-radius:50%;background:#dcfce7;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:32px;">✓</div>' +
          '<h2 class="text-2xl font-bold text-primary-foreground" style="margin:0 0 8px;">Interest submitted!</h2>' +
          '<p class="text-muted-foreground" style="margin:0 0 18px;">Your application was ' +
            (ok ? 'received by the API' : 'recorded locally') + '.</p>' +
          '<pre style="text-align:left;background:#0f172a;color:#94a3b8;border-radius:8px;padding:12px;font-size:11px;white-space:pre-wrap;word-break:break-all;max-height:240px;overflow:auto;">' +
            String(respText || '(no response body)').replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c])) +
          '</pre></div>';
      }
      if (btn) { btn.disabled = false; btn.textContent = origBtnText; }
    });
  }
  const wireMo = new MutationObserver(wireFormWhenReady);
  function startFormWire() {
    if (!document.body) { setTimeout(startFormWire, 50); return; }
    wireMo.observe(document.body, { childList: true, subtree: true });
    wireFormWhenReady();
  }
  startFormWire();

  // ─────────────────────────────────────────────────────────────────────────
  // ── PART 2: existing GraphQL / __NEXT_DATA__ patching (unchanged) ───────
  // ─────────────────────────────────────────────────────────────────────────

  const GQL_PATHS = ['/hai/graphql', '/hs/graphql'];
  function isGQL(url) {
    if (!url) return false;
    return GQL_PATHS.some(p => url.includes(p));
  }

  // ── Fake institution ─────────────────────────────────────────
  const FAKE_INSTITUTION = {
    id: '1',
    name: 'University of London',
    type: 'university',
    __typename: 'Institution',
  };

  // ── Synthetic form (same shape as background.js) ─────────────
  function formId() {
    try { const m = location.href.match(/\/forms\/([\w-]+)/); return m ? m[1] : 'hv-form-1'; }
    catch { return 'hv-form-1'; }
  }
  function makeSyntheticForm() {
    const q = (id, pos, prompt, required, type) => ({
      id, __typename: 'ApplicationFormQuestion',
      type, kind: type,
      prompt, label: prompt, text: prompt, title: prompt, name: prompt,
      required, optional: !required,
      position: pos, order: pos, index: pos,
      choices: [], options: [], answers: [],
      helpText: null, placeholder: null, description: null,
    });
    return {
      id: formId(),
      __typename: 'ProjectApplicationForm',
      title: 'Project Application', name: 'Project Application',
      status: 'PUBLISHED', state: 'PUBLISHED',
      enabled: true, isPublished: true, isActive: true,
      description: null, instructions: null,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      questions: [
        q('hv-q1', 0, 'Why are you interested in this project?',          true,  'LONG_TEXT'),
        q('hv-q2', 1, 'What relevant skills or experience do you have?',  false, 'LONG_TEXT'),
        q('hv-q3', 2, 'What is your weekly availability?',                false, 'SHORT_TEXT'),
      ],
      project: null, submission: null, existingSubmission: null,
      hasExistingSubmission: false, alreadyApplied: false,
      requiresResume: false, requiresCoverLetter: false,
    };
  }
  const FORM_NULL_KEYS = new Set([
    'projectApplicationForm', 'applicationForm', 'projectInterestForm',
    'interestForm', 'projectForm',
  ]);

  // ── Patch rules ──────────────────────────────────────────────
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
    'showcase-projects-auto-approval':            () => true,
    'experiment-m2-project-specific-application': v => v === 'excluded' ? 'on' : v,
    'experiment-relevance-ready-form-v2':         v => v === 'excluded' ? 'on' : v,
    'experiment-hai-quick-apply-flow':            () => 'on',
    'experiment-hai-core-intent':                 () => 'on',
    'experiment-hai-unified-promotion':           () => 'on',
    'experiment-hai-hub':                         v => v === 'excluded' ? 'on' : v,
    'experiment-hai-hub-link-in-nav':             v => v === 'excluded' ? 'on' : v,
    'accessProhibited':                           () => false,
    'requiresPhoneVerification':                  () => false,
    'requiresHaiPhoneVerification':               () => false,
    'requiresOnboarding':                         () => false,
    'requiresReonboarding':                       () => false,
    'requiresConfirmation':                       () => false,
    'needsVisibilitySettings':                    () => false,
    'needsToAgreeToTos':                          () => false,
  };

  // ── Deep-patch ───────────────────────────────────────────────
  function patch(o) {
    if (!o || typeof o !== 'object') return o;

    for (const k of Object.keys(o)) {
      // Inject synthetic form when server returns null for a form key
      if (FORM_NULL_KEYS.has(k) && o[k] === null) {
        o[k] = makeSyntheticForm();
      }

      if (KEY_RULES[k] !== undefined) {
        o[k] = KEY_RULES[k](o[k], o);
      }
      // KYC canUse — only inside silentKycEligibility context
      if (k === 'canUse' && typeof o[k] === 'boolean' && 'hasQualifyingEducation' in o) {
        o[k] = true;
      }
      // Fix disqualification reason text
      if (k === 'reason' && typeof o[k] === 'string' && /not qualify|ineligible|denied/i.test(o[k])) {
        o[k] = 'OK';
      }
      // Inject fake institution when User has none (gates form access)
      if (k === '__typename' && o[k] === 'User' && ('institution' in o) && o.institution === null) {
        o.institution = FAKE_INSTITUTION;
      }
      // Recurse
      if (o[k] && typeof o[k] === 'object') patch(o[k]);
    }
    return o;
  }

  function safeText(t) {
    if (typeof t !== 'string') return t;
    const needsPatch = ['NOT_REVIEWED', '"excluded"', 'institution":null'].some(s => t.includes(s));
    if (!needsPatch) return t;
    try   { return JSON.stringify(patch(JSON.parse(t))); }
    catch { return t.replace(/"NOT_REVIEWED"/g, '"VERIFIED"'); }
  }

  const _parse     = JSON.parse.bind(JSON);
  const _stringify = JSON.stringify.bind(JSON);

  // ── 1. JSON.parse override (catches Next.js reading __NEXT_DATA__) ──
  JSON.parse = function (t, ...a) {
    const r = _parse(t, ...a);
    if (typeof t === 'string' && (t.includes('NOT_REVIEWED') || t.includes('"excluded"') || t.includes('institution":null')))
      return patch(r);
    return r;
  };

  // ── 2. Patch __NEXT_DATA__ script tag directly in the DOM ───────────
  //    This eliminates the React #418 hydration error by making SSR match
  function patchScriptNode(node) {
    if (!node || node.nodeType !== 1 || node.tagName !== 'SCRIPT') return;
    const txt = node.textContent || '';
    if (!txt.includes('NOT_REVIEWED') && !txt.includes('"excluded"') && !txt.includes('"institution":null')) return;
    try {
      const d = _parse(txt);
      patch(d);
      // Override textContent so Next.js reads the patched version
      Object.defineProperty(node, 'textContent', {
        get: () => _stringify(d), configurable: true,
      });
      // Also override innerHTML
      Object.defineProperty(node, 'innerHTML', {
        get: () => _stringify(d), configurable: true,
      });
    } catch {}
  }
  const scriptMO = new MutationObserver(ms =>
    ms.forEach(m => m.addedNodes.forEach(patchScriptNode))
  );
  scriptMO.observe(document.documentElement, { childList: true, subtree: true });
  document.querySelectorAll('script').forEach(patchScriptNode);

  // ── 3. Response prototype (all consumption paths) ───────────────────
  const _rjson = Response.prototype.json;
  const _rtext = Response.prototype.text;
  const _rab   = Response.prototype.arrayBuffer;
  const _rblob = Response.prototype.blob;

  Response.prototype.json = async function () {
    const d = await _rjson.call(this);
    return isGQL(this.url) ? patch(d) : d;
  };
  Response.prototype.text = async function () {
    const t = await _rtext.call(this);
    return isGQL(this.url) ? safeText(t) : t;
  };
  Response.prototype.arrayBuffer = async function () {
    const b = await _rab.call(this);
    if (!isGQL(this.url)) return b;
    return new TextEncoder().encode(safeText(new TextDecoder().decode(b))).buffer;
  };
  Response.prototype.blob = async function () {
    const b = await _rblob.call(this);
    if (!isGQL(this.url)) return b;
    return new Blob([safeText(await b.text())], { type: b.type });
  };

  // ── 4. fetch (re-wraps response, captures op for diagnostics) ───────
  const _fetch = window.fetch;
  window.fetch = async function (input, init) {
    const url =
      typeof input === 'string' ? input
      : input instanceof Request ? input.url
      : (input && input.url) || '';

    let reqBody = '';
    try {
      if (init && typeof init.body === 'string') reqBody = init.body;
      else if (input instanceof Request) reqBody = await input.clone().text();
    } catch {}

    const res = await _fetch.call(this, input, init);
    if (!isGQL(url)) return res;

    const raw = await res.clone().text();

    // ── HEAVY FORM-PAGE LOGGER ───────────────────────────────────────
    // When user is on /fellow/forms/*, dump EVERY GraphQL op with full
    // request + response so we can reverse-engineer the real schema.
    try {
      const onFormPage = /\/fellow\/forms\//.test(location.href);
      const op = reqBody ? JSON.parse(reqBody) : null;
      const name = op && (Array.isArray(op)
        ? op.map(x => x.operationName).join(',')
        : op.operationName);

      if (onFormPage) {
        // Log EVERYTHING on form pages, prefixed for easy filtering
        console.warn(
          '%c[HV FORM-DEBUG] ' + (name || '(unnamed)'),
          'background:#7c3aed;color:#fff;padding:2px 6px;border-radius:3px;font-weight:bold'
        );
        try {
          const opObj = Array.isArray(op) ? op[0] : op;
          console.log('  → query:    ', (opObj && opObj.query ? opObj.query.slice(0, 600) : '(no query)'));
          console.log('  → variables:', opObj && opObj.variables);
          console.log('  → response: ', JSON.parse(raw));
          console.log('  → url:      ', url);
        } catch (e) {
          console.log('  → raw response:', raw.slice(0, 2000));
        }
        // Also persist last 30 form-page ops on window for easy copy/paste
        window.__HV_FORM_DEBUG = window.__HV_FORM_DEBUG || [];
        window.__HV_FORM_DEBUG.unshift({
          ts: new Date().toISOString(),
          op: name,
          url,
          variables: (op && (Array.isArray(op) ? op[0] : op).variables) || null,
          query: (op && (Array.isArray(op) ? op[0] : op).query) || null,
          response: (() => { try { return JSON.parse(raw); } catch { return raw.slice(0, 2000); } })(),
        });
        if (window.__HV_FORM_DEBUG.length > 30) window.__HV_FORM_DEBUG.length = 30;
      } else if (name && /form|apply|interest|project|submit|application/i.test(name)) {
        const parsed = JSON.parse(raw);
        const hasNull = parsed.data && Object.values(parsed.data).some(v => v === null);
        const hasErrors = parsed.errors && parsed.errors.length;
        if (hasNull || hasErrors) {
          console.warn('[HV FORM OP]', name, parsed);
        }
      }
    } catch {}

    return new Response(safeText(raw), {
      status: res.status, statusText: res.statusText, headers: res.headers,
    });
  };

  // ── 5. XMLHttpRequest ────────────────────────────────────────────────
  const _xopen = XMLHttpRequest.prototype.open;
  const _xsend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u, ...r) {
    this.__hvu = u; return _xopen.call(this, m, u, ...r);
  };
  XMLHttpRequest.prototype.send = function (...a) {
    if (isGQL(this.__hvu)) {
      this.addEventListener('readystatechange', function () {
        if (this.readyState !== 4) return;
        try {
          const p = safeText(this.responseText);
          Object.defineProperty(this, 'responseText', { get: () => p, configurable: true });
          Object.defineProperty(this, 'response',     { get: () => p, configurable: true });
        } catch {}
      });
    }
    return _xsend.apply(this, a);
  };

  // ── 6. Kill cached service workers ──────────────────────────────────
  if (navigator.serviceWorker) {
    navigator.serviceWorker.getRegistrations()
      .then(rs => rs.forEach(r => r.unregister())).catch(() => {});
    const _reg = navigator.serviceWorker.register.bind(navigator.serviceWorker);
    navigator.serviceWorker.register = (...a) => {
      const p = _reg(...a);
      p.then(r => r.unregister()).catch(() => {});
      return p;
    };
  }

  // ── 7. Apollo / Next / Relay memory sweep ───────────────────────────
  function sweep() {
    try { patch(window.__NEXT_DATA__); } catch {}
    try { patch(window.__APOLLO_STATE__); } catch {}
    try {
      const c = window.__APOLLO_CLIENT__ && window.__APOLLO_CLIENT__.cache;
      if (c) {
        patch(c.data && c.data.data);
        patch(c.data && c.data.optimisticData && c.data.optimisticData.data);
        if (typeof c.broadcastWatches === 'function') c.broadcastWatches();
      }
    } catch {}
  }
  setInterval(sweep, 300);
  sweep();

  // ── 8. DOM text scrubber ─────────────────────────────────────────────
  function scrubText(root) {
    if (!root) return;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    const hits = [];
    while (w.nextNode()) {
      const n = w.currentNode;
      if (n.nodeValue && n.nodeValue.includes('NOT_REVIEWED')) hits.push(n);
    }
    hits.forEach(n => { n.nodeValue = n.nodeValue.split('NOT_REVIEWED').join('VERIFIED'); });
  }
  const domMO = new MutationObserver(ms => {
    ms.forEach(m => {
      m.addedNodes.forEach(n => {
        if (n.nodeType === 3 && n.nodeValue && n.nodeValue.includes('NOT_REVIEWED'))
          n.nodeValue = n.nodeValue.split('NOT_REVIEWED').join('VERIFIED');
        else if (n.nodeType === 1) scrubText(n);
      });
      if (m.type === 'characterData' && m.target.nodeValue && m.target.nodeValue.includes('NOT_REVIEWED'))
        m.target.nodeValue = m.target.nodeValue.split('NOT_REVIEWED').join('VERIFIED');
    });
  });
  function startDomScrub() {
    if (!document.body) { setTimeout(startDomScrub, 50); return; }
    scrubText(document.body);
    domMO.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  startDomScrub();
  setInterval(() => scrubText(document.body), 800);

  // Convenience helper — type HV_DUMP() in DevTools console to get a copyable JSON
  // of every form-page GraphQL op captured so far.
  try {
    Object.defineProperty(window, 'HV_DUMP', {
      configurable: true,
      get() {
        const data = window.__HV_FORM_DEBUG || [];
        const json = JSON.stringify(data, null, 2);
        console.log('%c[HV] Copy the JSON below and send it back:',
          'background:#22c55e;color:#000;padding:2px 6px;font-weight:bold');
        console.log(json);
        try { navigator.clipboard.writeText(json); console.log('[HV] (copied to clipboard)'); } catch {}
        return data;
      },
    });
    // HV_NEXT — dumps window.__NEXT_DATA__ (the SSR baked data)
    Object.defineProperty(window, 'HV_NEXT', {
      configurable: true,
      get() {
        const d = window.__NEXT_DATA__;
        const json = d ? JSON.stringify(d, null, 2) : '(no __NEXT_DATA__)';
        console.log('%c[HV] __NEXT_DATA__ — copy and send back:',
          'background:#22c55e;color:#000;padding:2px 6px;font-weight:bold');
        console.log(json);
        try { navigator.clipboard.writeText(json); console.log('[HV] (copied to clipboard)'); } catch {}
        return d;
      },
    });
  } catch {}

  // Auto-dump __NEXT_DATA__ on form pages after a short delay (no user action needed)
  if (/\/fellow\/forms\//.test(location.href)) {
    setTimeout(() => {
      try {
        const d = window.__NEXT_DATA__;
        if (d) {
          console.log('%c[HV NEXT-DATA] Auto-dump on form page:',
            'background:#7c3aed;color:#fff;padding:2px 6px;font-weight:bold');
          console.log(JSON.stringify(d, null, 2));
        } else {
          console.warn('[HV] No __NEXT_DATA__ found on form page');
        }
        // Also scan all <script> tags for any "form"-keyed JSON, since Handshake
        // may use a different bootstrap mechanism than vanilla Next.js
        document.querySelectorAll('script').forEach((s, i) => {
          const t = s.textContent || '';
          if (t.length > 200 && (t.includes('"form') || t.includes('"Form'))) {
            console.log('%c[HV SCRIPT-' + i + '] form-related script tag:',
              'background:#0891b2;color:#fff;padding:2px 6px');
            console.log(t.slice(0, 4000));
          }
        });
      } catch (e) {
        console.warn('[HV] Auto-dump failed:', e.message);
      }
    }, 1500);
  }

  console.info('%c[HV v1.14.3] HTML+GraphQL patched | type HV_DUMP or HV_NEXT in console',
    'color:#22c55e;font-weight:bold');
})();
