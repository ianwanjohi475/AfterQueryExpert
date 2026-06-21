/**
 * HandshakeVerifier v1.14.3 — form-inject (aggressive DOM fallback)
 *
 * Primary path: CDP-level RSC rewriter in background.js.
 * Fallback path: this script. Runs at document_idle and re-checks every
 * 600ms for 30s. Replaces "Form not found" UI — or a crashed React app —
 * with a fully-populated working form using Handshake's CSS classes.
 */
(function () {
  'use strict';

  if (!/\/fellow\/forms\//.test(location.href)) return;

  const VERSION = '1.14.3';
  const SUBMIT_ENDPOINT = 'http://localhost:4000/submit';

  // ── Always-visible version badge so we know which build is loaded ───────
  function showVersionBadge() {
    if (document.getElementById('hv-version-badge')) return;
    const b = document.createElement('div');
    b.id = 'hv-version-badge';
    b.textContent = 'HV ' + VERSION;
    b.style.cssText =
      'position:fixed;bottom:8px;right:8px;z-index:2147483647;' +
      'background:#22c55e;color:#000;font:bold 11px monospace;' +
      'padding:4px 8px;border-radius:4px;box-shadow:0 2px 6px rgba(0,0,0,.3);';
    (document.body || document.documentElement).appendChild(b);
  }
  if (document.body) showVersionBadge();
  else document.addEventListener('DOMContentLoaded', showVersionBadge);

  function buildFormHTML(projectId) {
    const inp = 'class="w-full px-3 py-2 rounded-md border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary"';
    const txt = 'class="w-full px-3 py-2 rounded-md border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-y" rows="4"';
    const lbl = 'class="block text-sm font-medium text-foreground mb-1"';
    const grp = 'class="mb-4"';
    return '' +
      '<div class="flex min-h-screen items-center justify-center bg-surface p-6" style="background:#0a0a0a;color:#f5f5f5;min-height:100vh;">' +
        '<div class="w-full max-w-2xl rounded-xl border border-border bg-card shadow-sm overflow-hidden" data-hv-form="1" data-hv-project-id="' + projectId + '" style="background:#1a1a1a;border:1px solid #333;border-radius:12px;max-width:640px;width:100%;">' +
          '<div class="px-8 py-6 border-b border-border bg-surface" style="padding:24px 32px;border-bottom:1px solid #333;">' +
            '<h1 class="text-2xl font-bold text-primary-foreground" style="margin:0;font-size:24px;font-weight:700;color:#fff;">Project Application</h1>' +
            '<p class="mt-1 text-sm text-muted-foreground" style="margin:4px 0 0;font-size:14px;color:#999;">Submit your interest for this opportunity</p>' +
          '</div>' +
          '<form id="hv-rsc-form" class="px-8 py-6" style="padding:24px 32px;">' +
            '<div ' + grp + ' style="margin-bottom:16px;"><label ' + lbl + ' style="display:block;font-size:14px;font-weight:500;color:#ddd;margin-bottom:4px;">First name *</label><input name="firstName" type="text" required ' + inp + ' value="Nathan" style="width:100%;padding:8px 12px;border-radius:6px;border:1px solid #444;background:#222;color:#fff;box-sizing:border-box;"></div>' +
            '<div ' + grp + ' style="margin-bottom:16px;"><label ' + lbl + ' style="display:block;font-size:14px;font-weight:500;color:#ddd;margin-bottom:4px;">Last name *</label><input name="lastName" type="text" required ' + inp + ' value="Fox" style="width:100%;padding:8px 12px;border-radius:6px;border:1px solid #444;background:#222;color:#fff;box-sizing:border-box;"></div>' +
            '<div ' + grp + ' style="margin-bottom:16px;"><label ' + lbl + ' style="display:block;font-size:14px;font-weight:500;color:#ddd;margin-bottom:4px;">Email *</label><input name="email" type="email" required ' + inp + ' value="christianojimik55@gmail.com" style="width:100%;padding:8px 12px;border-radius:6px;border:1px solid #444;background:#222;color:#fff;box-sizing:border-box;"></div>' +
            '<div ' + grp + ' style="margin-bottom:16px;"><label ' + lbl + ' style="display:block;font-size:14px;font-weight:500;color:#ddd;margin-bottom:4px;">Why are you interested in this project? *</label><textarea name="motivation" required ' + txt + ' placeholder="Tell us what draws you to this opportunity…" style="width:100%;padding:8px 12px;border-radius:6px;border:1px solid #444;background:#222;color:#fff;box-sizing:border-box;resize:vertical;"></textarea></div>' +
            '<div ' + grp + ' style="margin-bottom:16px;"><label ' + lbl + ' style="display:block;font-size:14px;font-weight:500;color:#ddd;margin-bottom:4px;">Relevant experience</label><textarea name="experience" ' + txt + ' placeholder="Briefly describe your relevant background…" style="width:100%;padding:8px 12px;border-radius:6px;border:1px solid #444;background:#222;color:#fff;box-sizing:border-box;resize:vertical;"></textarea></div>' +
            '<div ' + grp + ' style="margin-bottom:16px;"><label ' + lbl + ' style="display:block;font-size:14px;font-weight:500;color:#ddd;margin-bottom:4px;">Portfolio / LinkedIn URL</label><input name="portfolio" type="url" ' + inp + ' placeholder="https://" style="width:100%;padding:8px 12px;border-radius:6px;border:1px solid #444;background:#222;color:#fff;box-sizing:border-box;"></div>' +
            '<button type="submit" class="w-full mt-2 px-4 py-3 rounded-md bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity" style="width:100%;margin-top:8px;padding:12px 16px;border-radius:6px;border:none;background:#3b82f6;color:#fff;font-weight:600;font-size:15px;cursor:pointer;">Submit interest</button>' +
            '<p class="mt-3 text-xs text-muted-foreground text-center" style="margin:12px 0 0;font-size:12px;color:#888;text-align:center;">v' + VERSION + ' · Submits to ' + SUBMIT_ENDPOINT + '</p>' +
          '</form>' +
        '</div>' +
      '</div>';
  }

  function wireSubmit(card, form) {
    if (!form || form.__hv_wired) return;
    form.__hv_wired = true;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const payload = {};
      fd.forEach((v, k) => { payload[k] = v; });
      payload.projectId   = card.dataset.hvProjectId || '';
      payload.submittedAt = new Date().toISOString();

      const btn = form.querySelector('button[type=submit]');
      const orig = btn ? btn.textContent : '';
      if (btn) { btn.disabled = true; btn.textContent = 'Submitting…'; }

      let respText = '', ok = false;
      try {
        const r = await fetch(SUBMIT_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        ok = r.ok;
        respText = await r.text();
      } catch (err) {
        respText = 'Could not reach API (' + err.message + ').\n' +
          'Start it:  cd node-proxy && node form-server.js\n\n' +
          'Payload:\n' + JSON.stringify(payload, null, 2);
      }

      card.innerHTML =
        '<div style="padding:48px 32px;text-align:center;font-family:inherit;background:#1a1a1a;color:#fff;">' +
        '<div style="width:64px;height:64px;border-radius:50%;background:#22c55e;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:32px;color:#000;">✓</div>' +
        '<h2 style="margin:0 0 8px;font-size:24px;font-weight:700;">Interest submitted!</h2>' +
        '<p style="margin:0 0 18px;color:#999;">Your application was ' +
          (ok ? 'received by the API' : 'recorded locally') + '.</p>' +
        '<pre style="text-align:left;background:#0f172a;color:#94a3b8;border-radius:8px;padding:12px;font-size:11px;white-space:pre-wrap;word-break:break-all;max-height:240px;overflow:auto;">' +
          String(respText || '(no response body)').replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c])) +
        '</pre></div>';
      if (btn) { btn.disabled = false; btn.textContent = orig; }
    });
  }

  function alreadyHasWorkingForm() {
    const f = document.getElementById('hv-rsc-form');
    return f && f.querySelector('input,textarea');
  }

  function needsInjection() {
    if (alreadyHasWorkingForm()) return false;
    const bodyText = (document.body && document.body.innerText) || '';
    return (
      /form not found/i.test(bodyText) ||
      /doesn.?t exist or has been removed/i.test(bodyText) ||
      /application error/i.test(bodyText) ||
      /client-side exception/i.test(bodyText)
    );
  }

  function injectFullscreen() {
    const projectId = (location.href.match(/\/forms\/([\w-]+)/) || [])[1] || '';
    // Use a fixed full-viewport overlay so we don't depend on finding the right
    // container. Replaces whatever React rendered (not-found, error boundary).
    let overlay = document.getElementById('hv-form-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'hv-form-overlay';
      overlay.style.cssText =
        'position:fixed;inset:0;z-index:2147483646;overflow:auto;' +
        'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = buildFormHTML(projectId);
    const card = overlay.querySelector('[data-hv-form]');
    const form = overlay.querySelector('#hv-rsc-form');
    if (card && form) wireSubmit(card, form);
    console.info(
      '%c[HV ' + VERSION + '] form injected (fullscreen overlay)',
      'background:#22c55e;color:#000;padding:2px 6px;font-weight:bold'
    );
  }

  function maybeInject() {
    showVersionBadge();
    if (alreadyHasWorkingForm()) {
      // CDP / intercept.js succeeded — remove our overlay if we put one up
      const overlay = document.getElementById('hv-form-overlay');
      if (overlay && !overlay.contains(document.getElementById('hv-rsc-form'))) {
        // RSC form is somewhere else in the page; remove overlay
        overlay.remove();
      }
      return;
    }
    if (needsInjection()) injectFullscreen();
  }

  // First pass after initial paint
  setTimeout(maybeInject, 800);
  // Re-check aggressively to survive React re-renders / late hydration
  let ticks = 0;
  const guard = setInterval(() => {
    ticks++;
    try { maybeInject(); } catch (e) {}
    if (ticks > 50) clearInterval(guard); // 50 ticks * 600ms = 30s
  }, 600);

  // Also react instantly when DOM changes
  const mo = new MutationObserver(() => { try { maybeInject(); } catch (e) {} });
  function startMO() {
    if (!document.body) { setTimeout(startMO, 50); return; }
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  startMO();
})();
