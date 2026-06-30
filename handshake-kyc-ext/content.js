/**
 * Handshake KYC Bypass — content.js (isolated world, document_start)
 *
 * Last-resort DOM scrubber: removes the "Identity verification incomplete"
 * modal/banner if it still slips through after the response patches.
 */
(function () {
  'use strict';

  const BANNER_TEXT = /identity verification incomplete/i;

  function removeBannerNode(node) {
    if (!node || node.nodeType !== 1) return false;
    const txt = node.textContent || '';
    if (!BANNER_TEXT.test(txt)) return false;

    // Walk up to find the card container (round, has padding) — typically
    // 3–5 ancestors above the text node.
    let target = node;
    for (let i = 0; i < 6 && target && target.parentElement; i++) {
      const cn = (target.className && String(target.className)) || '';
      if (/rounded-xl|rounded-2xl|modal|dialog|overlay|backdrop/i.test(cn)) break;
      target = target.parentElement;
    }
    if (target) {
      target.remove();
      console.info('[HSKYC] removed identity-verification banner');
      // Also nuke any fixed-position backdrop / dialog wrapper still in DOM
      document.querySelectorAll(
        '[role="dialog"], [aria-modal="true"], .modal-backdrop, [data-state="open"]'
      ).forEach(el => {
        const t = el.textContent || '';
        if (BANNER_TEXT.test(t)) el.remove();
      });
      // Unlock body scroll if the modal locked it
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
      document.body.style.pointerEvents = '';
      return true;
    }
    return false;
  }

  function scan(root) {
    if (!root || root.nodeType !== 1) return;
    if (!BANNER_TEXT.test(root.textContent || '')) return;
    // Find the deepest element containing only this banner's text
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    while (walker.nextNode()) {
      if (BANNER_TEXT.test(walker.currentNode.nodeValue)) {
        if (removeBannerNode(walker.currentNode.parentElement)) return;
      }
    }
  }

  function startObserver() {
    if (!document.body) { setTimeout(startObserver, 50); return; }
    scan(document.body);
    const mo = new MutationObserver(muts => {
      for (const m of muts) {
        m.addedNodes.forEach(n => {
          if (n.nodeType === 1) scan(n);
        });
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }
  startObserver();
})();
