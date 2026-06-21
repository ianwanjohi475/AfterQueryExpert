/**
 * HandshakeVerifier v1.14 — form-inject (status check + populated DOM fallback)
 *
 * The primary path is the CDP-level RSC rewriter in background.js. This
 * script is a safety net: at document_idle on /fellow/forms/* it checks
 * whether the rewrite landed and, if not, injects a full working form
 * (fields + submit handler) directly into the DOM.
 */
(function () {
  'use strict';

  if (!/\/fellow\/forms\//.test(location.href)) return;

  const SUBMIT_ENDPOINT = 'http://localhost:4000/submit';

  function buildFormHTML(projectId) {
    const inp = 'class="w-full px-3 py-2 rounded-md border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary"';
    const txt = 'class="w-full px-3 py-2 rounded-md border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-y" rows="4"';
    const lbl = 'class="block text-sm font-medium text-foreground mb-1"';
    const grp = 'class="mb-4"';
    return '' +
      '<div class="flex min-h-screen items-center justify-center bg-surface p-6">' +
        '<div class="w-full max-w-2xl rounded-xl border border-border bg-card shadow-sm overflow-hidden" data-hv-form="1" data-hv-project-id="' + projectId + '">' +
          '<div class="px-8 py-6 border-b border-border bg-surface">' +
            '<h1 class="text-2xl font-bold text-primary-foreground">Project Application</h1>' +
            '<p class="mt-1 text-sm text-muted-foreground">Submit your interest for this opportunity</p>' +
          '</div>' +
          '<form id="hv-rsc-form" class="px-8 py-6">' +
            '<div ' + grp + '><label ' + lbl + '>First name *</label><input name="firstName" type="text" required ' + inp + ' value="Nathan"></div>' +
            '<div ' + grp + '><label ' + lbl + '>Last name *</label><input name="lastName" type="text" required ' + inp + ' value="Fox"></div>' +
            '<div ' + grp + '><label ' + lbl + '>Email *</label><input name="email" type="email" required ' + inp + ' value="christianojimik55@gmail.com"></div>' +
            '<div ' + grp + '><label ' + lbl + '>Why are you interested in this project? *</label><textarea name="motivation" required ' + txt + ' placeholder="Tell us what draws you to this opportunity…"></textarea></div>' +
            '<div ' + grp + '><label ' + lbl + '>Relevant experience</label><textarea name="experience" ' + txt + ' placeholder="Briefly describe your relevant background…"></textarea></div>' +
            '<div ' + grp + '><label ' + lbl + '>Portfolio / LinkedIn URL</label><input name="portfolio" type="url" ' + inp + ' placeholder="https://"></div>' +
            '<button type="submit" class="w-full mt-2 px-4 py-3 rounded-md bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity">Submit interest</button>' +
            '<p class="mt-3 text-xs text-muted-foreground text-center">Submits to ' + SUBMIT_ENDPOINT + '</p>' +
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
        '<div style="padding:48px 32px;text-align:center;font-family:inherit;">' +
        '<div style="width:64px;height:64px;border-radius:50%;background:#dcfce7;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:32px;">✓</div>' +
        '<h2 class="text-2xl font-bold text-primary-foreground" style="margin:0 0 8px;">Interest submitted!</h2>' +
        '<p class="text-muted-foreground" style="margin:0 0 18px;">Your application was ' +
          (ok ? 'received by the API' : 'recorded locally') + '.</p>' +
        '<pre style="text-align:left;background:#0f172a;color:#94a3b8;border-radius:8px;padding:12px;font-size:11px;white-space:pre-wrap;word-break:break-all;max-height:240px;overflow:auto;">' +
          String(respText || '(no response body)').replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c])) +
        '</pre></div>';
      if (btn) { btn.disabled = false; btn.textContent = orig; }
    });
  }

  function inject() {
    const formEl = document.getElementById('hv-rsc-form');
    const bodyText = document.body ? document.body.innerText : '';
    if (formEl && formEl.querySelector('input,textarea')) {
      console.info(
        '%c[HV v1.14] ✓ RSC rewrite succeeded — form is rendered',
        'background:#22c55e;color:#000;padding:2px 6px;font-weight:bold'
      );
      // Wire submit on whichever form is in the DOM
      const card = formEl.closest('[data-hv-form]') || formEl.parentElement;
      if (card) wireSubmit(card, formEl);
      return;
    }
    if (!/form not found|doesn.?t exist or has been removed/i.test(bodyText)) return;

    console.warn(
      '%c[HV v1.14] ✗ RSC rewrite did not catch the chunk — falling back to populated DOM injection',
      'background:#ef4444;color:#fff;padding:2px 6px;font-weight:bold'
    );

    // Find the "Form not found" container and replace its contents
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    let target = null;
    while (walker.nextNode()) {
      if (/form not found/i.test(walker.currentNode.nodeValue)) {
        let el = walker.currentNode.parentElement;
        for (let i = 0; i < 6 && el && el.parentElement; i++) {
          if (el.offsetHeight > 200) break;
          el = el.parentElement;
        }
        target = el;
        break;
      }
    }
    if (!target) {
      // Last resort: append to body
      target = document.createElement('div');
      target.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:#fff;overflow:auto;';
      document.body.appendChild(target);
    }

    const projectId = (location.href.match(/\/forms\/([\w-]+)/) || [])[1] || '';
    target.innerHTML = buildFormHTML(projectId);
    const card = target.querySelector('[data-hv-form]');
    const form = target.querySelector('#hv-rsc-form');
    if (card && form) wireSubmit(card, form);
  }

  // Run once after the page has had a chance to render, then re-check
  // periodically in case React re-renders the not-found UI over our form.
  setTimeout(inject, 1200);
  let ticks = 0;
  const guard = setInterval(() => {
    ticks++;
    inject();
    if (ticks > 20) clearInterval(guard);
  }, 800);
})();
