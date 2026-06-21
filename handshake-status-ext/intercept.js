/**
 * Handshake Status Verifier — content script (runs in MAIN world)
 * Intercepts fetch + XHR calls to /hai/graphql and patches
 * any "status": "NOT_REVIEWED" → "status": "VERIFIED"
 */
(function () {
  'use strict';

  const GRAPHQL_PATH = '/hai/graphql';

  /* ── helpers ─────────────────────────────────────────────── */

  function patchData(obj) {
    if (!obj || typeof obj !== 'object') return obj;

    // Walk every key recursively
    for (const key of Object.keys(obj)) {
      if (key === 'status' && obj[key] === 'NOT_REVIEWED') {
        obj[key] = 'VERIFIED';
      } else if (typeof obj[key] === 'object') {
        patchData(obj[key]);
      }
    }
    return obj;
  }

  function tryPatch(text) {
    try {
      const json = JSON.parse(text);
      return JSON.stringify(patchData(json));
    } catch (_) {
      return text; // not JSON — return as-is
    }
  }

  function isTarget(url) {
    try {
      return new URL(url, location.href).pathname === GRAPHQL_PATH;
    } catch (_) {
      return false;
    }
  }

  /* ── fetch override ───────────────────────────────────────── */

  const _fetch = window.fetch;

  window.fetch = async function (...args) {
    const url =
      typeof args[0] === 'string'
        ? args[0]
        : args[0] instanceof Request
        ? args[0].url
        : '';

    const response = await _fetch.apply(this, args);

    if (!isTarget(url)) return response;

    const original = await response.text();
    const patched  = tryPatch(original);

    return new Response(patched, {
      status:     response.status,
      statusText: response.statusText,
      headers:    response.headers,
    });
  };

  /* ── XMLHttpRequest override ──────────────────────────────── */

  const _open = XMLHttpRequest.prototype.open;
  const _send = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__interceptUrl = url;
    return _open.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    if (isTarget(this.__interceptUrl)) {
      this.addEventListener('readystatechange', function () {
        if (this.readyState !== 4) return;

        const patched = tryPatch(this.responseText);

        // Override both text and parsed response
        Object.defineProperty(this, 'responseText', {
          get: () => patched,
          configurable: true,
        });
        Object.defineProperty(this, 'response', {
          get: () => patched,
          configurable: true,
        });
      });
    }
    return _send.apply(this, args);
  };

  console.log('[HandshakeVerifier] Interceptor active on', GRAPHQL_PATH);
})();
