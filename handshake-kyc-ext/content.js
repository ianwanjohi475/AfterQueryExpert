/**
 * Handshake KYC Bypass — content.js (isolated world)
 *
 * Removes the "Identity verification incomplete" modal/banner if it slips
 * through the response patches. Runs only after document.body exists so we
 * never touch a null reference at document_start.
 */
(function () {
  'use strict';

  const BANNER_TEXT = /identity verification incomplete/i;

  function unlockScroll() {
    if (document.documentElement && document.documentElement.style) {
      document.documentElement.style.overflow = '';
    }
    if (document.body && document.body.style) {
      document.body.style.overflow = '';
      document.body.style.pointerEvents = '';
    }
  }

  function findCard(textNode) {
    let el = textNode && textNode.parentElement;
    for (let i = 0; i < 6 && el && el.parentElement; i++) {
      const cn = (el.className && String(el.className)) || '';
      if (/rounded-xl|rounded-2xl|modal|dialog|overlay|backdrop/i.test(cn)) return el;
      el = el.parentElement;
    }
    return el;
  }

  function scan(root) {
    if (!root || root.nodeType !== 1) return;
    if (!BANNER_TEXT.test(root.textContent || '')) return;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    while (walker.nextNode()) {
      if (BANNER_TEXT.test(walker.currentNode.nodeValue)) {
        const target = findCard(walker.currentNode);
        if (target) {
          target.remove();
          console.info('[HSKYC] removed identity-verification banner');
          // Also nuke any modal/dialog wrappers still hanging around
          document.querySelectorAll(
            '[role="dialog"], [aria-modal="true"], .modal-backdrop, [data-state="open"]'
          ).forEach(el => {
            if (BANNER_TEXT.test(el.textContent || '')) el.remove();
          });
          unlockScroll();
          return;
        }
      }
    }
  }

  function start() {
    if (!document.body) {
      // Try again once the body element exists
      setTimeout(start, 50);
      return;
    }
    scan(document.body);
    const mo = new MutationObserver(muts => {
      for (const m of muts) {
        m.addedNodes.forEach(n => { try { scan(n); } catch (_) {} });
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
