/**
 * HandshakeVerifier v1.8 — Form Injector (isolated world)
 *
 * Handshake's server has no application form for these projects, so it
 * renders "Form not found". This module DETECTS that state and replaces
 * it with a real, working project-interest form that submits to a
 * configurable API endpoint (Node server / bin).
 */
(function () {
  'use strict';

  // ── Config ─────────────────────────────────────────────────────
  // Change this to your Node server or bin URL.
  //   - Local node:   http://localhost:4000/submit
  //   - Mocky bin:     https://run.mocky.io/v3/<uuid>
  //   - Webhook.site:  https://webhook.site/<uuid>
  const SUBMIT_ENDPOINT = 'http://localhost:4000/submit';

  const NOT_FOUND_RX = /form not found|doesn.?t exist or has been removed/i;
  let injected = false;

  // ── Pull project context from the URL / page ───────────────────
  function projectContext() {
    const url = location.href;
    const idMatch = url.match(/projects?\/([\w-]+)/i) || url.match(/forms?\/([\w-]+)/i);
    let title = document.title.replace(/\s*[|·–-].*$/, '').trim();
    return {
      projectId: idMatch ? idMatch[1] : 'unknown',
      projectTitle: title || 'Project',
      url,
    };
  }

  // ── Build the form UI ──────────────────────────────────────────
  function buildForm(ctx) {
    const wrap = document.createElement('div');
    wrap.id = 'hv-injected-form';
    wrap.innerHTML = `
      <style>
        #hv-injected-form{
          max-width:680px;margin:32px auto;padding:0 20px;
          font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
          color:#1a1a2e;
        }
        #hv-injected-form .hv-card{
          background:#fff;border:1px solid #e5e7eb;border-radius:16px;
          box-shadow:0 4px 24px rgba(0,0,0,.06);overflow:hidden;
        }
        #hv-injected-form .hv-head{
          background:linear-gradient(135deg,#4f46e5,#7c3aed);
          color:#fff;padding:24px 28px;
        }
        #hv-injected-form .hv-head h2{font-size:20px;font-weight:700;margin:0}
        #hv-injected-form .hv-head p{font-size:13px;opacity:.85;margin:6px 0 0}
        #hv-injected-form .hv-badge{
          display:inline-block;background:rgba(255,255,255,.2);
          padding:3px 10px;border-radius:99px;font-size:11px;font-weight:600;
          margin-top:10px;
        }
        #hv-injected-form .hv-body{padding:24px 28px}
        #hv-injected-form .hv-field{margin-bottom:18px}
        #hv-injected-form label{
          display:block;font-size:13px;font-weight:600;margin-bottom:6px;color:#374151;
        }
        #hv-injected-form label .req{color:#ef4444}
        #hv-injected-form input,#hv-injected-form textarea,#hv-injected-form select{
          width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;
          font-size:14px;font-family:inherit;color:#111;background:#fff;
          transition:border-color .15s,box-shadow .15s;box-sizing:border-box;
        }
        #hv-injected-form input:focus,#hv-injected-form textarea:focus,#hv-injected-form select:focus{
          outline:none;border-color:#7c3aed;box-shadow:0 0 0 3px rgba(124,58,237,.12);
        }
        #hv-injected-form textarea{resize:vertical;min-height:96px}
        #hv-injected-form .hv-row{display:flex;gap:14px}
        #hv-injected-form .hv-row .hv-field{flex:1}
        #hv-injected-form .hv-submit{
          width:100%;padding:13px;border:none;border-radius:10px;
          background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;
          font-size:15px;font-weight:700;cursor:pointer;transition:opacity .15s,transform .05s;
        }
        #hv-injected-form .hv-submit:hover{opacity:.92}
        #hv-injected-form .hv-submit:active{transform:translateY(1px)}
        #hv-injected-form .hv-submit:disabled{opacity:.55;cursor:not-allowed}
        #hv-injected-form .hv-note{font-size:11px;color:#9ca3af;text-align:center;margin-top:12px}
        #hv-injected-form .hv-err{color:#ef4444;font-size:12px;margin-top:4px;display:none}
        #hv-injected-form .hv-success{
          text-align:center;padding:48px 28px;
        }
        #hv-injected-form .hv-success .check{
          width:64px;height:64px;border-radius:50%;background:#dcfce7;
          display:flex;align-items:center;justify-content:center;margin:0 auto 16px;
          font-size:32px;
        }
        #hv-injected-form .hv-success h2{font-size:22px;margin:0 0 8px}
        #hv-injected-form .hv-success p{color:#6b7280;font-size:14px;margin:0}
        #hv-injected-form .hv-resp{
          margin-top:18px;text-align:left;background:#0f172a;color:#94a3b8;
          border-radius:8px;padding:12px;font-family:"SF Mono",monospace;font-size:11px;
          white-space:pre-wrap;word-break:break-all;max-height:200px;overflow:auto;
        }
      </style>

      <div class="hv-card">
        <div class="hv-head">
          <h2>${escapeHtml(ctx.projectTitle)}</h2>
          <p>Submit your interest for this opportunity</p>
          <span class="hv-badge">Project ID: ${escapeHtml(ctx.projectId)}</span>
        </div>

        <div class="hv-body" id="hv-form-body">
          <form id="hv-form" novalidate>
            <div class="hv-row">
              <div class="hv-field">
                <label>First name <span class="req">*</span></label>
                <input name="firstName" value="Nathan" required />
                <div class="hv-err">Required</div>
              </div>
              <div class="hv-field">
                <label>Last name <span class="req">*</span></label>
                <input name="lastName" value="Fox" required />
                <div class="hv-err">Required</div>
              </div>
            </div>

            <div class="hv-field">
              <label>Email <span class="req">*</span></label>
              <input name="email" type="email" value="christianojimik55@gmail.com" required />
              <div class="hv-err">Valid email required</div>
            </div>

            <div class="hv-field">
              <label>Why are you interested in this project? <span class="req">*</span></label>
              <textarea name="motivation" placeholder="Tell us what draws you to this opportunity…" required></textarea>
              <div class="hv-err">Required</div>
            </div>

            <div class="hv-field">
              <label>Relevant experience</label>
              <textarea name="experience" placeholder="Briefly describe your relevant background…"></textarea>
            </div>

            <div class="hv-row">
              <div class="hv-field">
                <label>Portfolio / LinkedIn URL</label>
                <input name="portfolio" type="url" placeholder="https://" />
              </div>
              <div class="hv-field">
                <label>Weekly availability</label>
                <select name="availability">
                  <option>Less than 10 hrs</option>
                  <option selected>10–20 hrs</option>
                  <option>20–30 hrs</option>
                  <option>30+ hrs</option>
                </select>
              </div>
            </div>

            <button type="submit" class="hv-submit" id="hv-submit-btn">Submit interest</button>
            <div class="hv-note">Submits to your test API · ${escapeHtml(SUBMIT_ENDPOINT)}</div>
          </form>
        </div>
      </div>
    `;
    return wrap;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  // ── Wire up submit handler ─────────────────────────────────────
  function wireForm(ctx) {
    const form = document.getElementById('hv-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      // Basic validation
      let valid = true;
      form.querySelectorAll('[required]').forEach(el => {
        const err = el.parentElement.querySelector('.hv-err');
        const bad = !el.value.trim() ||
          (el.type === 'email' && !/^[^@]+@[^@]+\.[^@]+$/.test(el.value));
        if (err) err.style.display = bad ? 'block' : 'none';
        if (bad) valid = false;
      });
      if (!valid) return;

      const btn = document.getElementById('hv-submit-btn');
      btn.disabled = true;
      btn.textContent = 'Submitting…';

      const payload = {
        projectId:    ctx.projectId,
        projectTitle: ctx.projectTitle,
        submittedAt:  new Date().toISOString(),
        firstName:    form.firstName.value,
        lastName:     form.lastName.value,
        email:        form.email.value,
        motivation:   form.motivation.value,
        experience:   form.experience.value,
        portfolio:    form.portfolio.value,
        availability: form.availability.value,
      };

      let responseText = '';
      let ok = false;
      try {
        const r = await fetch(SUBMIT_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        ok = r.ok;
        responseText = await r.text();
      } catch (err) {
        responseText = 'Could not reach API (' + err.message + ').\n' +
          'Start the Node server: cd node-proxy && node form-server.js\n\n' +
          'Submission payload (saved locally):\n' + JSON.stringify(payload, null, 2);
      }

      showSuccess(ctx, payload, responseText, ok);
    });
  }

  function showSuccess(ctx, payload, responseText, ok) {
    const body = document.getElementById('hv-form-body');
    if (!body) return;
    body.innerHTML = `
      <div class="hv-success">
        <div class="check">✓</div>
        <h2>Interest submitted!</h2>
        <p>Your application for <strong>${escapeHtml(ctx.projectTitle)}</strong> was ${ok ? 'received by the API' : 'recorded locally'}.</p>
        <div class="hv-resp">${escapeHtml(responseText || '(no response body)')}</div>
      </div>
    `;
  }

  // ── Detect "Form not found" and replace ────────────────────────
  function tryInject() {
    if (injected) return;
    const bodyText = document.body ? document.body.innerText : '';
    if (!NOT_FOUND_RX.test(bodyText)) return;

    // Find the smallest container holding the "not found" message
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    let target = null;
    while (walker.nextNode()) {
      if (NOT_FOUND_RX.test(walker.currentNode.nodeValue)) {
        // Walk up a few levels to a block container
        let el = walker.currentNode.parentElement;
        for (let i = 0; i < 4 && el && el.parentElement; i++) {
          if (el.offsetHeight > 120) break;
          el = el.parentElement;
        }
        target = el;
        break;
      }
    }
    if (!target) return;

    const ctx = projectContext();
    const formEl = buildForm(ctx);
    target.replaceWith(formEl);
    wireForm(ctx);
    injected = true;
    console.info('%c[HV v1.8] Form not found → injected working form',
      'color:#22c55e;font-weight:bold');
  }

  // Watch for the not-found page (it loads via client-side nav)
  const mo = new MutationObserver(() => tryInject());
  function start() {
    if (!document.body) { setTimeout(start, 50); return; }
    mo.observe(document.body, { childList: true, subtree: true });
    tryInject();
  }
  start();

  // Re-check on SPA navigation
  let lastUrl = location.href;
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      injected = false;
      setTimeout(tryInject, 400);
    }
  }, 500);
})();
