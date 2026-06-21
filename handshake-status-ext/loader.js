/**
 * Backup loader — runs in the isolated world and injects intercept.js
 * directly into <html> as a <script src=> so the page's runtime sees it
 * before any of its own bundles execute.
 */
(function () {
  try {
    const s = document.createElement('script');
    s.src   = chrome.runtime.getURL('intercept.js');
    s.async = false;
    (document.head || document.documentElement).prepend(s);
    s.onload = () => s.remove();
  } catch (e) {
    console.warn('[HandshakeVerifier] loader failed:', e);
  }
})();
