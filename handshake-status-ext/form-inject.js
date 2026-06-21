/**
 * HandshakeVerifier v1.9 — Form Injector
 *
 * Strategy: when on /fellow/forms/* URL, mount a fixed full-viewport overlay
 * OUTSIDE React's root so React re-renders can never remove it.
 * A MutationObserver + interval guard re-mount if anything does remove it.
 */
(function () {
  'use strict';

  const SUBMIT_ENDPOINT = 'http://localhost:4000/submit';

  function isFormPage() {
    return /\/fellow\/forms\//.test(location.href);
  }

  function projectContext() {
    const url = location.href;
    const m = url.match(/\/forms\/([\w-]+)/i);
    const title = document.title.replace(/\s*[|·–-].*$/, '').trim();
    return {
      projectId:    m ? m[1] : 'unknown',
      projectTitle: title || 'Project Application',
      url,
    };
  }

  // ── Escape helper ──────────────────────────────────────────────────────────
  function esc(s) {
    return String(s).replace(/[&<>"']/g, c =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  // ── Build overlay ──────────────────────────────────────────────────────────
  function buildOverlay(ctx) {
    const el = document.createElement('div');
    el.id = 'hv-overlay-v19';
    el.setAttribute('data-hv', '1');
    el.innerHTML = `
<style>
#hv-overlay-v19{
  position:fixed;inset:0;z-index:2147483647;
  background:#f3f4f6;overflow-y:auto;
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
}
#hv-overlay-v19 .hv-wrap{
  max-width:700px;margin:40px auto;padding:0 20px 60px;
}
#hv-overlay-v19 .hv-card{
  background:#fff;border:1px solid #e5e7eb;border-radius:16px;
  box-shadow:0 4px 24px rgba(0,0,0,.07);overflow:hidden;
}
#hv-overlay-v19 .hv-head{
  background:linear-gradient(135deg,#4f46e5,#7c3aed);
  color:#fff;padding:28px 32px;
}
#hv-overlay-v19 .hv-head h2{font-size:22px;font-weight:700;margin:0 0 6px}
#hv-overlay-v19 .hv-head p{font-size:13px;opacity:.85;margin:0}
#hv-overlay-v19 .hv-badge{
  display:inline-block;background:rgba(255,255,255,.18);
  padding:3px 11px;border-radius:99px;font-size:11px;font-weight:600;margin-top:10px;
}
#hv-overlay-v19 .hv-body{padding:28px 32px}
#hv-overlay-v19 .hv-field{margin-bottom:18px}
#hv-overlay-v19 label{
  display:block;font-size:13px;font-weight:600;margin-bottom:6px;color:#374151;
}
#hv-overlay-v19 label .req{color:#ef4444}
#hv-overlay-v19 input,
#hv-overlay-v19 textarea,
#hv-overlay-v19 select{
  width:100%;padding:10px 13px;border:1px solid #d1d5db;border-radius:8px;
  font-size:14px;font-family:inherit;color:#111;background:#fff;
  box-sizing:border-box;transition:border-color .15s,box-shadow .15s;
}
#hv-overlay-v19 input:focus,
#hv-overlay-v19 textarea:focus,
#hv-overlay-v19 select:focus{
  outline:none;border-color:#7c3aed;box-shadow:0 0 0 3px rgba(124,58,237,.12);
}
#hv-overlay-v19 textarea{resize:vertical;min-height:100px}
#hv-overlay-v19 .hv-row{display:flex;gap:14px}
#hv-overlay-v19 .hv-row .hv-field{flex:1}
#hv-overlay-v19 .hv-btn{
  width:100%;padding:14px;border:none;border-radius:10px;
  background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;
  font-size:15px;font-weight:700;cursor:pointer;
  transition:opacity .15s,transform .05s;
}
#hv-overlay-v19 .hv-btn:hover{opacity:.91}
#hv-overlay-v19 .hv-btn:active{transform:translateY(1px)}
#hv-overlay-v19 .hv-btn:disabled{opacity:.5;cursor:not-allowed}
#hv-overlay-v19 .hv-note{font-size:11px;color:#9ca3af;text-align:center;margin-top:10px}
#hv-overlay-v19 .hv-err{color:#ef4444;font-size:12px;margin-top:4px;display:none}
#hv-overlay-v19 .hv-ok{
  text-align:center;padding:52px 32px;
}
#hv-overlay-v19 .hv-ok .tick{
  width:68px;height:68px;border-radius:50%;background:#dcfce7;
  display:flex;align-items:center;justify-content:center;
  margin:0 auto 18px;font-size:34px;
}
#hv-overlay-v19 .hv-ok h2{font-size:22px;margin:0 0 8px}
#hv-overlay-v19 .hv-ok p{color:#6b7280;font-size:14px;margin:0 0 18px}
#hv-overlay-v19 .hv-resp{
  text-align:left;background:#0f172a;color:#94a3b8;
  border-radius:8px;padding:12px;font-family:"SF Mono",monospace;font-size:11px;
  white-space:pre-wrap;word-break:break-all;max-height:220px;overflow:auto;
}
</style>

<div class="hv-wrap">
  <div class="hv-card">
    <div class="hv-head">
      <h2>${esc(ctx.projectTitle)}</h2>
      <p>Submit your interest for this opportunity</p>
      <span class="hv-badge">Project ID: ${esc(ctx.projectId)}</span>
    </div>

    <div class="hv-body" id="hv-body-v19">
      <form id="hv-form-v19" novalidate>
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

        <button type="submit" class="hv-btn" id="hv-btn-v19">Submit interest</button>
        <div class="hv-note">Submits to test API · ${esc(SUBMIT_ENDPOINT)}</div>
      </form>
    </div>
  </div>
</div>`;
    return el;
  }

  // ── Wire submit ────────────────────────────────────────────────────────────
  function wireForm(ctx, root) {
    const form = root.querySelector('#hv-form-v19');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      let valid = true;
      form.querySelectorAll('[required]').forEach(el => {
        const err = el.parentElement.querySelector('.hv-err');
        const bad = !el.value.trim() ||
          (el.type === 'email' && !/^[^@]+@[^@]+\.[^@]+$/.test(el.value));
        if (err) err.style.display = bad ? 'block' : 'none';
        if (bad) valid = false;
      });
      if (!valid) return;

      const btn = root.querySelector('#hv-btn-v19');
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

      let respText = '';
      let ok = false;
      try {
        const r = await fetch(SUBMIT_ENDPOINT, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(payload),
        });
        ok = r.ok;
        respText = await r.text();
      } catch (err) {
        respText =
          'Could not reach API (' + err.message + ').\n' +
          'Start the server:  cd node-proxy && node form-server.js\n\n' +
          'Payload:\n' + JSON.stringify(payload, null, 2);
      }

      const body = root.querySelector('#hv-body-v19');
      if (body) {
        body.innerHTML = `
          <div class="hv-ok">
            <div class="tick">✓</div>
            <h2>Interest submitted!</h2>
            <p>Your application for <strong>${esc(ctx.projectTitle)}</strong>
               was ${ok ? 'received by the API' : 'recorded locally'}.</p>
            <div class="hv-resp">${esc(respText || '(no response body)')}</div>
          </div>`;
      }
    });
  }

  // ── Mount overlay ──────────────────────────────────────────────────────────
  let overlay = null;

  function mount() {
    if (!isFormPage()) return;
    if (overlay && document.body && document.body.contains(overlay)) return;

    if (!document.body) { setTimeout(mount, 50); return; }

    if (overlay) { try { overlay.remove(); } catch {} }

    const ctx = projectContext();
    overlay = buildOverlay(ctx);
    document.body.appendChild(overlay);
    wireForm(ctx, overlay);

    console.info(
      '%c[HV v1.10] Overlay form mounted on ' + location.pathname
       + ' — type HV_DUMP in console to capture GraphQL for the real form',
      'color:#22c55e;font-weight:bold'
    );
  }

  // ── Guard: re-mount if overlay removed by React re-render ─────────────────
  function guard() {
    if (isFormPage() && (!overlay || !document.body || !document.body.contains(overlay))) {
      mount();
    }
  }

  // Observe DOM mutations to catch React replacing the body's children
  const mo = new MutationObserver(guard);
  function startObserver() {
    if (!document.documentElement) { setTimeout(startObserver, 50); return; }
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }
  startObserver();

  // Belt-and-suspenders: poll every 250 ms
  setInterval(guard, 250);

  // ── SPA navigation ─────────────────────────────────────────────────────────
  let lastUrl = location.href;
  setInterval(() => {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    overlay = null;
    setTimeout(mount, 350);
  }, 500);

  // Initial mount
  mount();
})();
