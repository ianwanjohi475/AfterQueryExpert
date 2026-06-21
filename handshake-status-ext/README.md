# Handshake Status Verifier (v1.8)

> **Testing only.** Two things: (1) sets profile `status` to `VERIFIED`, and
> (2) injects a real, working application form whenever Handshake shows
> **"Form not found"**.

---

## Why "Form not found" happens (and why earlier versions couldn't fix it)

Clicking **Submit interest** navigates to a project application form. But
Handshake's **server never created a form** for these projects for your
account — the flag `experiment-m2-project-specific-application` is
`"excluded"` at the database level. So the server returns nothing and the
React app renders "Form not found".

**No response-patching can fix this** — you can't patch a form into
existence that the server never made, and faking the exact internal schema
just triggers React hydration error #418 (React rejecting the mismatch).

### The v1.8 solution
The extension **detects** the "Form not found" page and **replaces it** with
its own fully-functional project-interest form that submits to a Node.js
API. The form displays, validates, and submits — which is what you actually
want for testing.

---

## Setup

### 1. Start the form API (Node.js, zero dependencies)
```bash
cd node-proxy
node form-server.js          # → http://localhost:4000
```
Leave this running. It receives form submissions and stores them in
`submissions.json`. View them at `http://localhost:4000/submissions`.

### 2. Load the extension
1. `chrome://extensions/` → **Developer mode** ON
2. **Load unpacked** → select the `handshake-status-ext/` folder
3. Open Handshake — leave the "started debugging this browser" banner alone

### 3. Use it
- Profile status now shows **VERIFIED** everywhere
- Click **Submit interest** on any project → the working form appears
- Fill it in, click **Submit interest** → success screen with the API's
  confirmation response

---

## Two independent layers

| Layer | File | What it does |
|-------|------|--------------|
| Status → VERIFIED | `background.js` + `intercept.js` | CDP + JS patching of `/hai` and `/hs` GraphQL so status, KYC, and flags read as verified |
| Form injection | `form-inject.js` | Detects "Form not found", replaces it with a real form posting to the Node API |
| Form API | `node-proxy/form-server.js` | Receives + stores submissions, returns confirmation |

The status layer and the form layer are independent — even if Handshake
changes its GraphQL, the form injector still works because it keys off the
visible "Form not found" text, not the API.

---

## Configuring the submit endpoint

By default the form posts to `http://localhost:4000/submit`. To point it
elsewhere (a bin, webhook.site, a deployed server), edit the
`SUBMIT_ENDPOINT` constant at the top of `form-inject.js`:

```js
const SUBMIT_ENDPOINT = 'https://webhook.site/<your-uuid>';
```

If the API is unreachable, the form still shows a success screen and prints
the captured payload locally — so the demo never hard-fails.

---

## Mock-bin alternative

`mock-bin/create-bin.js` publishes the verified profile JSON to npoint.io
or mocky.io for use with curl / Postman / scripts:

```bash
cd mock-bin
node create-bin.js          # → mocky.io URL
node create-bin.js npoint   # → npoint.io URL
```

---

## File map

```
handshake-status-ext/
├── manifest.json          MV3 manifest (debugger, sidePanel, localhost)
├── background.js          CDP rewriter: HTML __NEXT_DATA__ + GraphQL
├── intercept.js           Page-context patching (status, KYC, flags, institution)
├── form-inject.js         Detects "Form not found" → injects working form
├── loader.js              Isolated-world injector for intercept.js
├── sidebar.html/.js       Live stats + traffic inspector
├── mock-bin/
│   ├── profile-verified.json
│   └── create-bin.js
└── node-proxy/
    ├── form-server.js     Form submission API (localhost:4000)
    ├── proxy.js           HTTPS reverse proxy (alternative)
    └── package.json
```
