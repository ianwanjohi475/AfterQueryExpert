# Handshake Status Verifier

> **For testing only.** Patches `"status": "NOT_REVIEWED"` → `"status": "VERIFIED"` in GraphQL responses from `https://ai.joinhandshake.com/hai/graphql`.

---

## Option A — Chrome Extension (recommended)

Works directly in the browser with no server needed.

### Install
1. Open Chrome → `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select this folder (the one containing `manifest.json`)

### How it works
- The extension injects `intercept.js` into every page on `ai.joinhandshake.com`
- It overrides both `window.fetch` **and** `XMLHttpRequest` so no request escapes
- For every response from `/hai/graphql` it deep-walks the JSON and replaces `"NOT_REVIEWED"` with `"VERIFIED"` before the page code sees it

### Verify it's working
1. Open `https://ai.joinhandshake.com/hai/graphql` (or any page that calls it)
2. Open DevTools → Console — you should see:
   ```
   [HandshakeVerifier] Interceptor active on /hai/graphql
   ```
3. Click the extension icon to see the active rules

---

## Option B — Node.js Proxy (zero dependencies)

Use this when you want to test from scripts, Postman, curl, or any HTTP client.

### Run
```bash
cd node-proxy
node proxy.js          # default port 3000
PORT=8080 node proxy.js
```

### Use it
Point your GraphQL client at:
```
http://localhost:3000/hai/graphql
```
instead of the real URL. The proxy forwards everything and patches the response.

### curl example
```bash
curl -s -X POST http://localhost:3000/hai/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"{ currentUserProfile { profile { status } } }"}' | jq .
```

---

## What gets patched

| Field   | Before          | After        |
|---------|-----------------|--------------|
| status  | NOT_REVIEWED    | VERIFIED     |

The patch is applied recursively, so it works regardless of how deeply nested `status` appears in the response.
