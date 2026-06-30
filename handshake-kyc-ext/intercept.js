/**
 * Handshake KYC Bypass — intercept.js (MAIN world, document_start)
 *
 * Belt-and-suspenders patching at the JS layer for code paths that read
 * the response before CDP can rewrite, or that read from cache:
 *   - fetch / XHR responses
 *   - Response.prototype.json/text
 *   - JSON.parse of inline bootstrap data
 *
 * v1.0.1: every override is wrapped in try/catch so a thrown error here can
 * never blank the page. On any failure we fall through to the original
 * behaviour.
 */
(function () {
  'use strict';

  const TARGETS = [
    '/hai/graphql',
    '/hs/graphql',
    '/api/trpc/blockingModals',
    '/api/trpc/',
  ];
  function isTarget(url) {
    if (!url) return false;
    try { return TARGETS.some(p => url.indexOf(p) !== -1); }
    catch (_) { return false; }
  }

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

  function patch(o) {
    if (!o || typeof o !== 'object') return o;
    if (Array.isArray(o)) { for (let i = 0; i < o.length; i++) patch(o[i]); return o; }
    for (const k of Object.keys(o)) {
      try {
        if (KEY_RULES[k] !== undefined) o[k] = KEY_RULES[k](o[k], o);
        if (k === 'kycDetails' && o[k] && typeof o[k] === 'object') Object.assign(o[k], KYC_COMPLETE);
        if (o[k] && typeof o[k] === 'object') patch(o[k]);
      } catch (_) {}
    }
    return o;
  }

  function safeText(t) {
    if (typeof t !== 'string') return t;
    if (!/NOT_REVIEWED|PENDING|activeModal|kycDetails|BLOCKING_KYC/.test(t)) return t;
    try { return JSON.stringify(patch(JSON.parse(t))); }
    catch (_) {
      try {
        return t
          .replace(/"NOT_REVIEWED"/g, '"VERIFIED"')
          .replace(/"PENDING"/g, '"VERIFIED"');
      } catch (__) { return t; }
    }
  }

  // ── JSON.parse override (catches Next.js bootstrap data reads) ─────────
  try {
    const _parse = JSON.parse.bind(JSON);
    JSON.parse = function (t, ...a) {
      const r = _parse(t, ...a);
      try {
        if (typeof t === 'string' &&
            /NOT_REVIEWED|PENDING|activeModal|kycDetails|BLOCKING_KYC/.test(t)) {
          return patch(r);
        }
      } catch (_) {}
      return r;
    };
  } catch (_) {}

  // ── Response prototype overrides ───────────────────────────────────────
  try {
    const _rjson = Response.prototype.json;
    const _rtext = Response.prototype.text;
    Response.prototype.json = async function () {
      const d = await _rjson.call(this);
      try { return isTarget(this.url) ? patch(d) : d; }
      catch (_) { return d; }
    };
    Response.prototype.text = async function () {
      const t = await _rtext.call(this);
      try { return isTarget(this.url) ? safeText(t) : t; }
      catch (_) { return t; }
    };
  } catch (_) {}

  // ── fetch wrapper ──────────────────────────────────────────────────────
  try {
    const _fetch = window.fetch;
    window.fetch = async function (input, init) {
      let url = '';
      try {
        url =
          typeof input === 'string' ? input
          : input instanceof Request ? input.url
          : (input && input.url) || '';
      } catch (_) {}
      const res = await _fetch.call(this, input, init);
      if (!isTarget(url)) return res;
      try {
        const raw = await res.clone().text();
        return new Response(safeText(raw), {
          status: res.status, statusText: res.statusText, headers: res.headers,
        });
      } catch (_) {
        return res;
      }
    };
  } catch (_) {}

  // ── XMLHttpRequest wrapper ─────────────────────────────────────────────
  try {
    const _xopen = XMLHttpRequest.prototype.open;
    const _xsend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (m, u, ...r) {
      try { this.__hsu = u; } catch (_) {}
      return _xopen.call(this, m, u, ...r);
    };
    XMLHttpRequest.prototype.send = function (...a) {
      try {
        if (isTarget(this.__hsu)) {
          this.addEventListener('readystatechange', function () {
            if (this.readyState !== 4) return;
            try {
              const p = safeText(this.responseText);
              Object.defineProperty(this, 'responseText', { get: () => p, configurable: true });
              Object.defineProperty(this, 'response',     { get: () => p, configurable: true });
            } catch (_) {}
          });
        }
      } catch (_) {}
      return _xsend.apply(this, a);
    };
  } catch (_) {}

  try {
    console.info('%c[HSKYC v1.0.1] page interceptor active',
      'background:#22c55e;color:#000;padding:2px 6px;font-weight:bold;border-radius:3px;');
  } catch (_) {}
})();
