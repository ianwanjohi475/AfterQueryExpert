# Handshake Status Verifier  (v1.1)

> **Testing only.** Rewrites `"status": "NOT_REVIEWED"` → `"status": "VERIFIED"` on responses from `https://*.joinhandshake.com/hai/graphql`.

---

## What changed in 1.1
v1.0 only wrapped `fetch()` — many GraphQL clients (Apollo, Relay) call
`Response.json()` directly on the returned object, so the patched wrapper
was never read. v1.1 patches **every** consumption path:

- `Response.prototype.json / text / arrayBuffer / blob`
- `window.fetch` (re-wraps the response too)
- `XMLHttpRequest.responseText / response`
- Apollo / Next / Relay caches (`__APOLLO_STATE__`, `__APOLLO_CLIENT__`, `__NEXT_DATA__`, `__RELAY_PAYLOADS__`)

A second isolated-world `loader.js` also injects `intercept.js` as an inline
`<script>` to beat any bundle that wraps `fetch` before MAIN-world content
scripts fire.

---

## Install (Chrome / Edge / Brave)

1. `chrome://extensions/` → enable **Developer mode**
2. **Load unpacked** → pick the `handshake-status-ext/` folder
3. Reload the Handshake tab — DevTools console should show:
   ```
   [HandshakeVerifier] active — patching NOT_REVIEWED → VERIFIED
   ```

If you don't see that line, the page loaded before the extension was
installed — just hard-reload (Ctrl+Shift+R).

---

## Mock-bin fallback (npoint.io / mocky.io)

If you need a *hosted* endpoint that always returns the verified payload
(e.g. for Postman, curl, or scripts), use `mock-bin/`:

```bash
cd mock-bin
node create-bin.js              # → mocky.io URL
node create-bin.js npoint       # → npoint.io URL
```

Both providers are free, no signup, no API key. The script POSTs
`profile-verified.json` and prints back a public URL you can hit forever.

### Manual upload
You can also paste `mock-bin/profile-verified.json` into:
- https://www.npoint.io  (click "New Bin", paste, save)
- https://designer.mocky.io  (paste body, click "Generate")

---

## Local Node.js proxy

For server-side testing, the proxy in `node-proxy/` forwards traffic to
the real Handshake host and patches responses on the fly:

```bash
cd node-proxy
node proxy.js              # → http://localhost:3000
```

Then call `http://localhost:3000/hai/graphql` instead of the real URL.

---

## Folder layout

```
handshake-status-ext/
├── manifest.json          ← MV3 extension manifest
├── intercept.js           ← runs in page (MAIN world)
├── loader.js              ← isolated-world backup injector
├── popup.html             ← toolbar popup UI
├── README.md
├── mock-bin/
│   ├── profile-verified.json   ← the patched payload
│   └── create-bin.js           ← auto-publish to mocky.io / npoint.io
└── node-proxy/
    ├── proxy.js                ← zero-dep HTTPS proxy
    └── package.json
```
