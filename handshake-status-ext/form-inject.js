/**
 * HandshakeVerifier v1.11 — form-inject (non-invasive)
 *
 * NO overlay. We rely on background.js + intercept.js injecting a synthetic
 * form object into the GraphQL response so Handshake's own React component
 * renders. This file only:
 *   1. Logs all GraphQL captures to console for debugging (HV_DUMP helper)
 *   2. After 6 s, if "Form not found" is STILL visible, shows a minimal
 *      warning banner (not a full overlay) so the user knows the extension
 *      is running but Handshake's component rejected the synthetic form.
 */
(function () {
  'use strict';

  if (!/\/fellow\/forms\//.test(location.href)) return;

  console.info('%c[HV v1.11] On form page — waiting for Handshake\'s own form to render',
    'color:#22c55e;font-weight:bold');

  // ── Last-resort banner (only if form still not found after 6 s) ────────────
  const NOT_FOUND_RX = /form not found|doesn.?t exist or has been removed/i;

  function addBanner(msg) {
    if (document.getElementById('hv-banner-v11')) return;
    const b = document.createElement('div');
    b.id = 'hv-banner-v11';
    b.style.cssText =
      'position:fixed;top:0;left:0;right:0;z-index:2147483647;' +
      'background:#7c3aed;color:#fff;font:13px/1.4 system-ui,sans-serif;' +
      'padding:10px 16px;text-align:center;';
    b.textContent = '[HV] ' + msg;
    document.body && document.body.appendChild(b);
  }

  setTimeout(() => {
    const bodyText = document.body ? document.body.innerText : '';
    if (NOT_FOUND_RX.test(bodyText)) {
      addBanner(
        'Handshake\'s own form component rejected the synthetic data. ' +
        'Type HV_DUMP in the console and share the output so we can fix the schema.'
      );
      console.warn(
        '%c[HV v1.11] Synthetic form was rejected — Handshake form component still showing "not found".',
        'background:#ef4444;color:#fff;padding:2px 6px;font-weight:bold'
      );
      console.warn('[HV] Type HV_DUMP to capture the real GraphQL ops and share them.');
    } else {
      console.info('%c[HV v1.11] Handshake\'s form rendered successfully!',
        'color:#22c55e;font-weight:bold');
    }
  }, 6000);

})();
