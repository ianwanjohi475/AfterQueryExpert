/**
 * HandshakeVerifier v1.13 — form-inject (status check only)
 *
 * The heavy work — rewriting the Next.js RSC chunk that contains
 * "Form not found" — is now done at document_start in intercept.js
 * (PART 1: RSC chunk hijacker). This file only reports whether the
 * rewrite worked, so we know whether to fall back further.
 */
(function () {
  'use strict';

  if (!/\/fellow\/forms\//.test(location.href)) return;

  setTimeout(() => {
    const formEl = document.getElementById('hv-rsc-form');
    const bodyText = document.body ? document.body.innerText : '';
    if (formEl) {
      console.info(
        '%c[HV v1.13] ✓ RSC rewrite succeeded — form is rendered',
        'background:#22c55e;color:#000;padding:2px 6px;font-weight:bold'
      );
    } else if (/form not found|doesn.?t exist or has been removed/i.test(bodyText)) {
      console.warn(
        '%c[HV v1.13] ✗ RSC rewrite did not catch the chunk — falling back to DOM injection',
        'background:#ef4444;color:#fff;padding:2px 6px;font-weight:bold'
      );
      // Last-resort DOM swap so the user is never stuck on "Form not found"
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
      let target = null;
      while (walker.nextNode()) {
        if (/form not found/i.test(walker.currentNode.nodeValue)) {
          let el = walker.currentNode.parentElement;
          for (let i = 0; i < 5 && el && el.parentElement; i++) {
            if (el.offsetHeight > 200) break;
            el = el.parentElement;
          }
          target = el;
          break;
        }
      }
      if (target) {
        const projectId = (location.href.match(/\/forms\/([\w-]+)/) || [])[1] || '';
        target.innerHTML =
          '<div class="flex min-h-screen items-center justify-center bg-surface p-6">' +
          '<div class="w-full max-w-2xl rounded-xl border border-border bg-card shadow-sm overflow-hidden" data-hv-form="1" data-hv-project-id="' + projectId + '">' +
            '<div class="px-8 py-6 border-b border-border bg-surface">' +
              '<h1 class="text-2xl font-bold text-primary-foreground">Project Application</h1>' +
              '<p class="mt-1 text-sm text-muted-foreground">Submit your interest for this opportunity</p>' +
            '</div>' +
            '<form id="hv-rsc-form" class="px-8 py-6"></form>' +
          '</div></div>';
      }
    }
  }, 1200);
})();
