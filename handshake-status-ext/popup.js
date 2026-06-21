function refresh() {
  chrome.runtime.sendMessage({ type: 'getStats' }, res => {
    if (!res) return;
    document.getElementById('patched').textContent = res.patched ?? 0;
    document.getElementById('seen').textContent    = res.seen    ?? 0;
    document.getElementById('tabs').textContent    = res.attachedTabs ?? 0;
  });
}
refresh();
setInterval(refresh, 600);
