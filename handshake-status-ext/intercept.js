/**
 * Handshake Status Verifier — page-context interceptor
 * Patches every code path the page might use to consume the response.
 */
(function () {
  'use strict';

  const TARGET = '/hai/graphql';
  const FROM   = 'NOT_REVIEWED';
  const TO     = 'VERIFIED';

  /* ── deep walk + replace ─────────────────────────────────── */
  function patch(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) { obj.forEach(patch); return obj; }
    for (const k of Object.keys(obj)) {
      if (k === 'status' && obj[k] === FROM) obj[k] = TO;
      else if (obj[k] && typeof obj[k] === 'object') patch(obj[k]);
    }
    return obj;
  }
  function patchText(t) {
    if (typeof t !== 'string' || t.indexOf(FROM) === -1) return t;
    try { return JSON.stringify(patch(JSON.parse(t))); }
    catch { return t.split('"' + FROM + '"').join('"' + TO + '"'); }
  }
  function isTarget(u) {
    if (!u) return false;
    try { return new URL(u, location.href).pathname === TARGET; }
    catch { return String(u).indexOf(TARGET) !== -1; }
  }

  /* ── 1. Response.prototype.{json,text,arrayBuffer,blob} ──── */
  const _json = Response.prototype.json;
  const _text = Response.prototype.text;
  const _ab   = Response.prototype.arrayBuffer;
  const _blob = Response.prototype.blob;

  Response.prototype.json = async function () {
    const data = await _json.call(this);
    return isTarget(this.url) ? patch(data) : data;
  };
  Response.prototype.text = async function () {
    const t = await _text.call(this);
    return isTarget(this.url) ? patchText(t) : t;
  };
  Response.prototype.arrayBuffer = async function () {
    const buf = await _ab.call(this);
    if (!isTarget(this.url)) return buf;
    const txt = new TextDecoder().decode(buf);
    return new TextEncoder().encode(patchText(txt)).buffer;
  };
  Response.prototype.blob = async function () {
    const b = await _blob.call(this);
    if (!isTarget(this.url)) return b;
    const txt = await b.text();
    return new Blob([patchText(txt)], { type: b.type });
  };

  /* ── 2. fetch wrapper (handles cases where url is only on Request) ── */
  const _fetch = window.fetch;
  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input
             : input instanceof Request   ? input.url
             : (input && input.url) || '';
    const res = await _fetch.call(this, input, init);
    if (!isTarget(url)) return res;

    // Re-wrap so that even direct stream reads hit our patched copy
    const original = await res.clone().text();
    const patched  = patchText(original);
    return new Response(patched, {
      status: res.status, statusText: res.statusText, headers: res.headers,
    });
  };

  /* ── 3. XMLHttpRequest ───────────────────────────────────── */
  const _open = XMLHttpRequest.prototype.open;
  const _send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u, ...rest) {
    this.__url = u;
    return _open.call(this, m, u, ...rest);
  };
  XMLHttpRequest.prototype.send = function (...args) {
    if (isTarget(this.__url)) {
      this.addEventListener('readystatechange', function () {
        if (this.readyState !== 4) return;
        let patched;
        try { patched = patchText(this.responseText); } catch { return; }
        try {
          Object.defineProperty(this, 'responseText', { get: () => patched, configurable: true });
          Object.defineProperty(this, 'response',     { get: () => patched, configurable: true });
        } catch {}
      });
    }
    return _send.apply(this, args);
  };

  /* ── 4. Apollo / Relay cache scrub (last-resort) ─────────── */
  // Some clients cache the parsed object before our wrappers fire (e.g. SSR
  // hydration). Walk window for known cache stores and patch them too.
  function scrubCaches() {
    try {
      const stores = [];
      if (window.__APOLLO_STATE__) stores.push(window.__APOLLO_STATE__);
      if (window.__APOLLO_CLIENT__ && window.__APOLLO_CLIENT__.cache) {
        const c = window.__APOLLO_CLIENT__.cache;
        if (c.data && c.data.data) stores.push(c.data.data);
      }
      if (window.__NEXT_DATA__) stores.push(window.__NEXT_DATA__);
      if (window.__RELAY_PAYLOADS__) stores.push(window.__RELAY_PAYLOADS__);
      stores.forEach(patch);
    } catch {}
  }
  scrubCaches();
  setInterval(scrubCaches, 1500);

  console.log('%c[HandshakeVerifier] active — patching ' + FROM + ' → ' + TO,
              'color:#22c55e;font-weight:bold');
})();
