/**
 * Handshake KYC Bypass — intercept.js (MAIN world, document_start)
 *
 * Belt-and-suspenders patching at the JS layer for code paths that read
 * the response before CDP can rewrite, or that read from cache:
 *   - fetch / XHR responses
 *   - Response.prototype.json/text
 *   - JSON.parse of inline bootstrap data
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
    return TARGETS.some(p => url.includes(p));
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
      if (KEY_RULES[k] !== undefined) o[k] = KEY_RULES[k](o[k], o);
      if (k === 'kycDetails' && o[k] && typeof o[k] === 'object') Object.assign(o[k], KYC_COMPLETE);
      if (o[k] && typeof o[k] === 'object') patch(o[k]);
    }
    return o;
  }

  function safeText(t) {
    if (typeof t !== 'string') return t;
    if (!/NOT_REVIEWED|PENDING|activeModal|kycDetails|BLOCKING_KYC/.test(t)) return t;
    try { return JSON.stringify(patch(JSON.parse(t))); }
    catch {
      return t
        .replace(/"NOT_REVIEWED"/g, '"VERIFIED"')
        .replace(/"PENDING"/g, '"VERIFIED"');
    }
  }

  // ── JSON.parse override (catches Next.js bootstrap data reads) ─────────
  const _parse = JSON.parse.bind(JSON);
  JSON.parse = function (t, ...a) {
    const r = _parse(t, ...a);
    if (typeof t === 'string' &&
        /NOT_REVIEWED|PENDING|activeModal|kycDetails|BLOCKING_KYC/.test(t)) {
      return patch(r);
    }
    return r;
  };

  // ── Response prototype overrides ───────────────────────────────────────
  const _rjson = Response.prototype.json;
  const _rtext = Response.prototype.text;
  Response.prototype.json = async function () {
    const d = await _rjson.call(this);
    return isTarget(this.url) ? patch(d) : d;
  };
  Response.prototype.text = async function () {
    const t = await _rtext.call(this);
    return isTarget(this.url) ? safeText(t) : t;
  };

  // ── fetch wrapper ──────────────────────────────────────────────────────
  const _fetch = window.fetch;
  window.fetch = async function (input, init) {
    const url =
      typeof input === 'string' ? input
      : input instanceof Request ? input.url
      : (input && input.url) || '';
    const res = await _fetch.call(this, input, init);
    if (!isTarget(url)) return res;
    try {
      const raw = await res.clone().text();
      return new Response(safeText(raw), {
        status: res.status, statusText: res.statusText, headers: res.headers,
      });
    } catch {
      return res;
    }
  };

  // ── XMLHttpRequest wrapper ─────────────────────────────────────────────
  const _xopen = XMLHttpRequest.prototype.open;
  const _xsend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u, ...r) {
    this.__hsu = u; return _xopen.call(this, m, u, ...r);
  };
  XMLHttpRequest.prototype.send = function (...a) {
    if (isTarget(this.__hsu)) {
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

  console.info('%c[HSKYC v1.0] page interceptor active',
    'background:#22c55e;color:#000;padding:2px 6px;font-weight:bold;border-radius:3px;');
})();
