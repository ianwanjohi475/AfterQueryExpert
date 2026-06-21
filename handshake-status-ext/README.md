# Handshake Status Verifier  (v1.3)

> **Testing only.** Rewrites `"status": "NOT_REVIEWED"` → `"status": "VERIFIED"` on every Handshake response so the page, the React tree, and the DevTools **Network tab** all show `VERIFIED`.

---

## Why v1.0 / v1.1 / v1.2 didn't fully work

| Version | What it did | Why it wasn't enough |
|---------|-------------|----------------------|
| 1.0     | wrapped `fetch()` response body          | Apollo calls `response.json()`, not `text()` |
| 1.1     | patched `Response.prototype.json` too    | Couldn't change what Network tab displays |
| 1.2     | patched `JSON.parse` + Next SSR data     | Still cannot rewrite raw HTTPS bytes |
| **1.3** | **uses `chrome.debugger` + CDP `Fetch.fulfillRequest` to rewrite actual response bytes** | works at the wire — Network tab shows `VERIFIED` |

The trick: a normal content-script extension **cannot** modify what
DevTools shows in the Network tab, because that's the raw server
response. The only Chrome API that can is `chrome.debugger`, which gives
the extension Chrome DevTools Protocol access — the same mechanism
DevTools itself uses.

---

## Install

1. `chrome://extensions/` → **Developer mode** ON
2. **Load unpacked** → select `handshake-status-ext/`
3. Open any `https://*.joinhandshake.com` tab — Chrome will show a yellow bar:
   > "Handshake Status Verifier started debugging this browser"

   **Leave it open** — closing it detaches the debugger and the patch stops.
4. Reload the Handshake tab. Network tab will now show `"status": "VERIFIED"`.
5. Click the toolbar icon to see live patch count.

---

## How the layers stack

| Layer | File | Purpose |
|-------|------|---------|
| CDP wire rewrite       | `background.js` | rewrites HTTPS body bytes; visible in Network tab |
| Page-script intercept  | `intercept.js`  | `JSON.parse`, `Response.*`, `fetch`, `XHR`, Apollo cache, Next SSR |
| Isolated-world loader  | `loader.js`     | injects intercept.js as `<script>` to beat the bundle |
| DOM text scrubber      | `intercept.js`  | rewrites already-rendered text in real time |
| Service-worker kill    | `intercept.js`  | unregisters SWs that might cache `NOT_REVIEWED` |

---

## Mock-bin alternative (no extension)

`mock-bin/create-bin.js` publishes the patched JSON to **npoint.io** or
**mocky.io** — get a public URL you can hit from curl, Postman, Node,
Python, anything:

```bash
cd mock-bin
node create-bin.js              # → https://run.mocky.io/v3/<uuid>
node create-bin.js npoint       # → https://api.npoint.io/<token>
```

Or paste `mock-bin/profile-verified.json` manually into either site.

---

## Node.js MITM proxy (no extension, server-side)

```bash
cd node-proxy
node proxy.js              # http://localhost:3000
```

Call `http://localhost:3000/hai/graphql` — proxy forwards to Handshake
and patches the response. Works from any HTTP client.

---

## File map

```
handshake-status-ext/
├── manifest.json            MV3 manifest, debugger perm
├── background.js            CDP rewriter (the real fix)
├── intercept.js             7-layer page-context patch
├── loader.js                isolated-world injector
├── popup.html / popup.js    live stats UI
├── mock-bin/
│   ├── profile-verified.json
│   └── create-bin.js        npoint.io / mocky.io publisher
└── node-proxy/
    ├── proxy.js             zero-dep HTTPS reverse proxy
    └── package.json
```
