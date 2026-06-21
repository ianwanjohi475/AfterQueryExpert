'use strict';

let lastPatched = 0;
const logEl = document.getElementById('log');

function ts() {
  const d = new Date();
  return d.toTimeString().slice(0, 8);
}

function addLog(msg, cls = '') {
  const entry = document.createElement('div');
  entry.className = 'entry';
  entry.innerHTML = `<span class="ts">${ts()}</span><span class="${cls}">${msg}</span>`;
  if (logEl.firstChild && logEl.firstChild.style && logEl.firstChild.style.color === '#334155') {
    logEl.innerHTML = '';
  }
  logEl.prepend(entry);
  // Keep last 60 entries
  while (logEl.children.length > 60) logEl.removeChild(logEl.lastChild);
}

function refresh() {
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

    if (res.tabs > 0) {
      document.getElementById('statusText').textContent = 'Debugger attached ✓';
      document.getElementById('statusSub').textContent  =
        `${res.tabs} tab${res.tabs > 1 ? 's' : ''} · ${res.patched} response${res.patched !== 1 ? 's' : ''} patched`;
      document.getElementById('indicator').style.background = '#22c55e';
    } else {
      document.getElementById('statusText').textContent = 'No Handshake tabs';
      document.getElementById('statusSub').textContent  = 'Open ai.joinhandshake.com';
      document.getElementById('indicator').style.background = '#f59e0b';
    }

    if (res.patched > lastPatched) {
      const delta = res.patched - lastPatched;
      addLog(`Patched ${delta} response${delta > 1 ? 's' : ''} (total: ${res.patched})`, 'ok');
      lastPatched = res.patched;
    }
  });
}

refresh();
setInterval(refresh, 800);

addLog('Sidebar ready', 'ok');
