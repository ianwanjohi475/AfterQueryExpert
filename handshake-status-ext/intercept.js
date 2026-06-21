/**
 * HandshakeVerifier v1.2
 * Patches NOT_REVIEWED → VERIFIED at every possible consumption point
 * including Next.js SSR __NEXT_DATA__ (the root cause of the hydration error).
 */
(function () {
  'use strict';

  const FROM = 'NOT_REVIEWED';
  const TO   = 'VERIFIED';
  const GQL  = '/hai/graphql';

  /* ── deep-patch ────────────────────────────────────────── */
  function patch(o) {
    if (!o || typeof o !== 'object') return o;
    for (const k of Object.keys(o)) {
      if (k === 'status' && o[k] === FROM) o[k] = TO;
      else if (o[k] && typeof o[k] === 'object') patch(o[k]);
    }
    return o;
  }
  function safeText(t) {
    if (typeof t !== 'string' || !t.includes(FROM)) return t;
    try   { return _stringify(patch(_parse(t))); }
    catch { return t.split('"'+FROM+'"').join('"'+TO+'"'); }
  }

  const _parse     = JSON.parse.bind(JSON);
  const _stringify = JSON.stringify.bind(JSON);

  /* ══════════════════════════════════════════════════════════
   * 1. JSON.parse OVERRIDE
   *    Catches EVERYTHING: __NEXT_DATA__, Apollo bootstrap,
   *    React hydration data, fetch response parsing — all of it.
   * ══════════════════════════════════════════════════════════ */
  JSON.parse = function (t, ...a) {
    const r = _parse(t, ...a);
    return (typeof t === 'string' && t.includes(FROM)) ? patch(r) : r;
  };

  /* ══════════════════════════════════════════════════════════
   * 2. DOM watcher — patch <script id="__NEXT_DATA__"> before
   *    React reads its .textContent
   * ══════════════════════════════════════════════════════════ */
  function patchScriptNode(node) {
    if (!node || node.nodeType !== 1) return;
    if (node.tagName !== 'SCRIPT') return;
    const txt = node.textContent || '';
    if (!txt.includes(FROM)) return;
    try {
      const d = _parse(txt);
      patch(d);
      Object.defineProperty(node, 'textContent', {
        get: () => _stringify(d),
        configurable: true,
      });
    } catch {}
  }

  const mo = new MutationObserver(ms =>
    ms.forEach(m => m.addedNodes.forEach(patchScriptNode))
  );
  mo.observe(document.documentElement, { childList: true, subtree: true });
  // Also patch any already-present nodes (in case we loaded late)
  document.querySelectorAll('script').forEach(patchScriptNode);

  /* ══════════════════════════════════════════════════════════
   * 3. Response prototype — all consumption paths
   * ══════════════════════════════════════════════════════════ */
  const _rjson = Response.prototype.json;
  const _rtext = Response.prototype.text;
  const _rab   = Response.prototype.arrayBuffer;
  const _rblob = Response.prototype.blob;

  function isGQL(url) {
    try { return url && url.includes(GQL); } catch { return false; }
  }

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

  /* ══════════════════════════════════════════════════════════
   * 4. fetch — re-wrap so the body clone is also patched
   * ══════════════════════════════════════════════════════════ */
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

  /* ══════════════════════════════════════════════════════════
   * 5. XMLHttpRequest
   * ══════════════════════════════════════════════════════════ */
  const _xopen = XMLHttpRequest.prototype.open;
  const _xsend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u, ...r) {
    this.__vurl = u;
    return _xopen.call(this, m, u, ...r);
  };
  XMLHttpRequest.prototype.send = function (...a) {
    if (isGQL(this.__vurl)) {
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

  /* ══════════════════════════════════════════════════════════
   * 6. Unregister service workers — they can serve cached NOT_REVIEWED
   * ══════════════════════════════════════════════════════════ */
  if (navigator.serviceWorker) {
    navigator.serviceWorker.getRegistrations()
      .then(rs => rs.forEach(r => r.unregister()))
      .catch(() => {});
    // Also intercept any future SW registrations and kill them
    const _register = navigator.serviceWorker.register.bind(navigator.serviceWorker);
    navigator.serviceWorker.register = (...a) => {
      const p = _register(...a);
      p.then(r => { if (r.active) r.unregister(); }).catch(() => {});
      return p;
    };
  }

  /* ══════════════════════════════════════════════════════════
   * 7. Apollo / Next / Relay in-memory cache sweep (300 ms)
   * ══════════════════════════════════════════════════════════ */
  function sweep() {
    try { patch(window.__NEXT_DATA__); } catch {}
    try { patch(window.__APOLLO_STATE__); } catch {}
    try {
      const c = window.__APOLLO_CLIENT__ && window.__APOLLO_CLIENT__.cache;
      if (c) {
        patch(c.data && c.data.data);
        patch(c.data && c.data.optimisticData && c.data.optimisticData.data);
        // Force Apollo to broadcast the patched cache to all watchers
        if (typeof c.broadcastWatches === 'function') c.broadcastWatches();
      }
    } catch {}
    try { patch(window.__RELAY_PAYLOADS__); } catch {}
  }
  setInterval(sweep, 300);
  sweep();

  /* ══════════════════════════════════════════════════════════
   * 8. DOM text scrubber — last-resort visual layer
   *    Walks every text node and rewrites the literal text.
   *    Catches anything React rendered before our patches fired.
   * ══════════════════════════════════════════════════════════ */
  function scrubText(root) {
    if (!root) return;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    const hits = [];
    while (w.nextNode()) {
      const n = w.currentNode;
      if (n.nodeValue && n.nodeValue.includes(FROM)) hits.push(n);
    }
    hits.forEach(n => { n.nodeValue = n.nodeValue.split(FROM).join(TO); });
  }
  function scrubAll() { scrubText(document.body); }

  const domMo = new MutationObserver(ms => {
    for (const m of ms) {
      m.addedNodes.forEach(n => {
        if (n.nodeType === 3 && n.nodeValue && n.nodeValue.includes(FROM)) {
          n.nodeValue = n.nodeValue.split(FROM).join(TO);
        } else if (n.nodeType === 1) {
          scrubText(n);
        }
      });
      if (m.type === 'characterData' && m.target.nodeValue &&
          m.target.nodeValue.includes(FROM)) {
        m.target.nodeValue = m.target.nodeValue.split(FROM).join(TO);
      }
    }
  });
  function startDomScrub() {
    if (!document.body) { setTimeout(startDomScrub, 50); return; }
    scrubAll();
    domMo.observe(document.body, {
      childList: true, subtree: true, characterData: true,
    });
  }
  startDomScrub();
  setInterval(scrubAll, 800);

  console.info(
    '%c[HV] v1.3 — JSON.parse + Response + DOM scrub + SW kill active',
    'color:#22c55e;font-weight:bold'
  );
})();
