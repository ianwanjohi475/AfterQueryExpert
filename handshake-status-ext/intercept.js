/**
 * HandshakeVerifier v1.4 — page-context interceptor
 * Patches both /hai/graphql AND /hs/graphql.
 * Fixes: status, KYC eligibility, feature flags that gate the form.
 */
(function () {
  'use strict';

  // ── Endpoints to intercept ──────────────────────────────────
  const GQL_PATHS = ['/hai/graphql', '/hs/graphql'];

  function isGQL(url) {
    if (!url) return false;
    return GQL_PATHS.some(p => url.includes(p));
  }

  // ── Patch rules by key ──────────────────────────────────────
  // These are applied ANYWHERE in the response tree.
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
    'notFound':                                   () => false,
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
    'experiment-hai-campaign-emails':             v => v === 'excluded' ? 'on' : v,
    'accessProhibited':                           () => false,
    'requiresPhoneVerification':                  () => false,
    'requiresHaiPhoneVerification':               () => false,
    'requiresOnboarding':                         () => false,
    'requiresReonboarding':                       () => false,
    'requiresConfirmation':                       () => false,
    'needsVisibilitySettings':                    () => false,
    'needsToAgreeToTos':                          () => false,
    'errors':                                     v => Array.isArray(v) ? [] : v,
  };

  // ── Deep-patch ──────────────────────────────────────────────
  function patch(o) {
    if (!o || typeof o !== 'object') return o;

    for (const k of Object.keys(o)) {
      // Named rule
      if (KEY_RULES[k] !== undefined) {
        o[k] = KEY_RULES[k](o[k], o);
      }

      // Context-sensitive: canUse inside silentKycEligibility
      if (k === 'canUse' && typeof o[k] === 'boolean' &&
          'hasQualifyingEducation' in o) {
        o[k] = true;
      }

      // KYC disqualification reason
      if (k === 'reason' && typeof o[k] === 'string' &&
          o[k].includes('not qualify')) {
        o[k] = 'User qualifies for onboarding';
      }

      // Recurse
      if (o[k] && typeof o[k] === 'object') patch(o[k]);
    }

    return o;
  }

  function safeText(t) {
    if (typeof t !== 'string') return t;
    // Fast bail: only parse if any of our targets are present
    const needsPatch = ['NOT_REVIEWED', 'excluded'].some(s => t.includes(s));
    if (!needsPatch) return t;
    try   { return JSON.stringify(patch(JSON.parse(t))); }
    catch { return t.replace(/"NOT_REVIEWED"/g, '"VERIFIED"'); }
  }

  const _parse     = JSON.parse.bind(JSON);
  const _stringify = JSON.stringify.bind(JSON);

  // ── 1. JSON.parse — catches SSR __NEXT_DATA__ ───────────────
  JSON.parse = function (t, ...a) {
    const r = _parse(t, ...a);
    return (typeof t === 'string' && (t.includes('NOT_REVIEWED') || t.includes('"excluded"')))
      ? patch(r) : r;
  };

  // ── 2. Watch <script id="__NEXT_DATA__"> ────────────────────
  function patchScript(node) {
    if (!node || node.nodeType !== 1 || node.tagName !== 'SCRIPT') return;
    const txt = node.textContent || '';
    if (!txt.includes('NOT_REVIEWED') && !txt.includes('"excluded"')) return;
    try {
      const d = _parse(txt);
      patch(d);
      Object.defineProperty(node, 'textContent', {
        get: () => _stringify(d), configurable: true,
      });
    } catch {}
  }
  const scriptMO = new MutationObserver(ms =>
    ms.forEach(m => m.addedNodes.forEach(patchScript))
  );
  scriptMO.observe(document.documentElement, { childList: true, subtree: true });
  document.querySelectorAll('script').forEach(patchScript);

  // ── 3. Response prototype ────────────────────────────────────
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
    const t = new TextDecoder().decode(b);
    return new TextEncoder().encode(safeText(t)).buffer;
  };
  Response.prototype.blob = async function () {
    const b = await _rblob.call(this);
    if (!isGQL(this.url)) return b;
    return new Blob([safeText(await b.text())], { type: b.type });
  };

  // ── 4. fetch ─────────────────────────────────────────────────
  const _fetch = window.fetch;
  window.fetch = async function (input, init) {
    const url =
      typeof input === 'string' ? input
      : input instanceof Request ? input.url
      : (input && input.url) || '';
    const res = await _fetch.call(this, input, init);
    if (!isGQL(url)) return res;
    const raw = await res.clone().text();
    return new Response(safeText(raw), {
      status: res.status, statusText: res.statusText, headers: res.headers,
    });
  };

  // ── 5. XMLHttpRequest ────────────────────────────────────────
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

  // ── 6. Kill service workers (cached NOT_REVIEWED) ────────────
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

  // ── 7. Apollo / Next / Relay memory sweep ───────────────────
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

  // ── 8. DOM text scrubber (visual fallback) ───────────────────
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
      if (m.type === 'characterData' && m.target.nodeValue &&
          m.target.nodeValue.includes('NOT_REVIEWED'))
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

  console.info('%c[HV v1.4] /hai + /hs patched | flags fixed | KYC patched',
    'color:#22c55e;font-weight:bold');
})();
