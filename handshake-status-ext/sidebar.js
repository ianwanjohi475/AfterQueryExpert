'use strict';

let captures = [];
let filter = '';
const expanded = new Set();

// ── Tabs ────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(t => {
  t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    document.getElementById('panel-' + t.dataset.tab).classList.add('active');
    if (t.dataset.tab === 'traffic') refreshCaptures();
  });
});

// ── Stats ───────────────────────────────────────────────────────
function refreshStats() {
  chrome.runtime.sendMessage({ type: 'getStats' }, res => {
    if (chrome.runtime.lastError || !res) {
      document.getElementById('statusText').textContent = 'Background inactive';
      document.getElementById('statusSub').textContent  = 'Reload extension';
      document.getElementById('indicator').style.background = '#ef4444';
      return;
    }
    document.getElementById('patched').textContent = res.patched;
    document.getElementById('seen').textContent    = res.seen;
    document.getElementById('tabs').textContent    = res.tabs;
    document.getElementById('trafficBadge').textContent =
      res.captureCount > 0 ? ` (${res.captureCount})` : '';

    if (res.tabs > 0) {
      document.getElementById('statusText').textContent = 'Debugger attached ✓';
      document.getElementById('statusSub').textContent  =
        `${res.tabs} tab${res.tabs > 1 ? 's' : ''} · ${res.patched} patched`;
      document.getElementById('indicator').style.background = '#22c55e';
    } else {
      document.getElementById('statusText').textContent = 'No Handshake tabs';
      document.getElementById('statusSub').textContent  = 'Open ai.joinhandshake.com';
      document.getElementById('indicator').style.background = '#f59e0b';
    }
  });
}

// ── Captures ────────────────────────────────────────────────────
function refreshCaptures() {
  chrome.runtime.sendMessage({ type: 'getCaptures', limit: 30 }, res => {
    if (chrome.runtime.lastError || !res) return;
    captures = res.captures || [];
    renderCaptures();
  });
}

function tsFmt(ts) {
  const d = new Date(ts);
  return d.toTimeString().slice(0, 8);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function prettyJson(s) {
  try { return JSON.stringify(JSON.parse(s), null, 2); }
  catch { return s; }
}

function renderCaptures() {
  const list = document.getElementById('captureList');
  const q    = filter.toLowerCase().trim();
  const items = captures.filter(c => {
    if (!q) return true;
    const hay = `${c.op||''} ${c.url||''} ${c.respOriginal||''}`.toLowerCase();
    return hay.includes(q);
  });

  if (!items.length) {
    list.innerHTML = `
      <div class="empty">
        <strong>No requests captured yet</strong>
        Click "Submit interest" on Handshake to capture<br>
        the GraphQL operation that fires.
      </div>`;
    return;
  }

  list.innerHTML = items.map((c, i) => {
    const id = `${c.ts}_${i}`;
    const isExp = expanded.has(id);
    const opShort = c.url.includes('/hai/') ? '/hai' : '/hs';
    return `
      <div class="capture ${isExp ? 'expanded' : ''}" data-id="${id}">
        <div class="capture-head">
          <div class="op-name">${escapeHtml(c.op || '(no operationName)')}</div>
          <div class="op-meta">
            ${c.changed ? '<span class="badge-changed">PATCHED</span>' : ''}
            <span class="badge-status">${c.status}</span>
            <span>${opShort}</span>
            <span>${tsFmt(c.ts)}</span>
          </div>
        </div>
        <div class="op-detail">
          ${c.reqQuerySnip ? `
            <div class="detail-label">Query (snippet)</div>
            <pre>${escapeHtml(c.reqQuerySnip)}</pre>` : ''}
          ${c.reqVariables ? `
            <div class="detail-label">Variables</div>
            <pre>${escapeHtml(JSON.stringify(c.reqVariables, null, 2))}</pre>` : ''}
          <div class="detail-label">Response (original)</div>
          <pre class="original">${escapeHtml(prettyJson(c.respOriginal))}</pre>
          ${c.respPatched ? `
            <div class="detail-label">Response (patched)</div>
            <pre class="patched">${escapeHtml(prettyJson(c.respPatched))}</pre>` : ''}
        </div>
      </div>`;
  }).join('');

  list.querySelectorAll('.capture').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.id;
      if (expanded.has(id)) expanded.delete(id);
      else expanded.add(id);
      el.classList.toggle('expanded');
    });
  });
}

document.getElementById('filter').addEventListener('input', e => {
  filter = e.target.value; renderCaptures();
});
document.getElementById('refreshBtn').addEventListener('click', refreshCaptures);
document.getElementById('clearBtn').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'clearCaptures' }, () => {
    captures = []; expanded.clear(); renderCaptures();
  });
});

refreshStats();
setInterval(refreshStats, 800);
setInterval(() => {
  if (document.getElementById('panel-traffic').classList.contains('active'))
    refreshCaptures();
}, 1500);
