/**
 * Handshake Status Verifier — Node.js HTTPS proxy
 *
 * Forwards every request to https://ai.joinhandshake.com
 * and patches "status":"NOT_REVIEWED" → "status":"VERIFIED"
 * in GraphQL responses.
 *
 * Usage:
 *   node proxy.js          # listens on http://localhost:3000
 *   PORT=8080 node proxy.js
 *
 * Then point your test client at http://localhost:3000/hai/graphql
 * instead of the real endpoint.
 *
 * Zero external dependencies — pure Node.js built-ins.
 */

'use strict';

const http  = require('http');
const https = require('https');
const url   = require('url');

const TARGET_HOST = 'ai.joinhandshake.com';
const PROXY_PORT  = parseInt(process.env.PORT || '3000', 10);
const GRAPHQL_PATH = '/hai/graphql';

/* ── patch helper ─────────────────────────────────────────── */

function patchObj(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  for (const k of Object.keys(obj)) {
    if (k === 'status' && obj[k] === 'NOT_REVIEWED') {
      obj[k] = 'VERIFIED';
    } else {
      patchObj(obj[k]);
    }
  }
  return obj;
}

function patchBody(text) {
  try {
    return JSON.stringify(patchObj(JSON.parse(text)));
  } catch (_) {
    return text;
  }
}

/* ── proxy handler ────────────────────────────────────────── */

const server = http.createServer((clientReq, clientRes) => {
  const parsed   = url.parse(clientReq.url);
  const isGraphQL = parsed.pathname === GRAPHQL_PATH;

  const options = {
    hostname: TARGET_HOST,
    port:     443,
    path:     clientReq.url,
    method:   clientReq.method,
    headers:  {
      ...clientReq.headers,
      host: TARGET_HOST,         // rewrite Host header
    },
  };

  // Collect client request body
  const reqChunks = [];
  clientReq.on('data', c => reqChunks.push(c));
  clientReq.on('end', () => {
    const reqBody = Buffer.concat(reqChunks);

    const proxyReq = https.request(options, proxyRes => {
      const resChunks = [];
      proxyRes.on('data', c => resChunks.push(c));
      proxyRes.on('end', () => {
        const rawBody = Buffer.concat(resChunks).toString('utf8');
        const patched = isGraphQL ? patchBody(rawBody) : rawBody;

        // Rebuild headers — drop transfer-encoding so we can set content-length
        const headers = { ...proxyRes.headers };
        delete headers['transfer-encoding'];
        delete headers['content-encoding'];   // already decoded by Node
        headers['content-length'] = Buffer.byteLength(patched).toString();
        headers['access-control-allow-origin'] = '*'; // CORS for local test

        clientRes.writeHead(proxyRes.statusCode, headers);
        clientRes.end(patched);

        if (isGraphQL) {
          console.log(`[proxy] ${clientReq.method} ${GRAPHQL_PATH} → patched`);
        }
      });
    });

    proxyReq.on('error', err => {
      console.error('[proxy] upstream error:', err.message);
      clientRes.writeHead(502);
      clientRes.end(JSON.stringify({ error: 'Bad Gateway', detail: err.message }));
    });

    if (reqBody.length) proxyReq.write(reqBody);
    proxyReq.end();
  });
});

/* ── preflight CORS (OPTIONS) ─────────────────────────────── */

server.on('request', (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin':  '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'Content-Type,Authorization,x-requested-with',
    });
    res.end();
  }
});

server.listen(PROXY_PORT, () => {
  console.log(`[HandshakeVerifier] Proxy running at http://localhost:${PROXY_PORT}`);
  console.log(`[HandshakeVerifier] GraphQL endpoint → http://localhost:${PROXY_PORT}${GRAPHQL_PATH}`);
  console.log('[HandshakeVerifier] Patches: "NOT_REVIEWED" → "VERIFIED"');
});
