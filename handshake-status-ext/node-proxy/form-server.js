/**
 * HandshakeVerifier — Form submission API (zero dependencies)
 *
 *   node form-server.js          # listens on http://localhost:4000
 *   PORT=5000 node form-server.js
 *
 * Receives POSTs from the injected project-interest form, stores them in
 * submissions.json, and returns a confirmation. CORS-open for testing.
 */
'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT  = parseInt(process.env.PORT || '4000', 10);
const STORE = path.join(__dirname, 'submissions.json');

function load() {
  try { return JSON.parse(fs.readFileSync(STORE, 'utf8')); }
  catch { return []; }
}
function save(list) {
  fs.writeFileSync(STORE, JSON.stringify(list, null, 2));
}

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const server = http.createServer((req, res) => {
  // Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    return res.end();
  }

  // List submissions
  if (req.method === 'GET' && req.url === '/submissions') {
    res.writeHead(200, { 'Content-Type': 'application/json', ...CORS });
    return res.end(JSON.stringify(load(), null, 2));
  }

  // Receive a submission
  if (req.method === 'POST' && req.url === '/submit') {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      let data = {};
      try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch {}

      const record = {
        id: 'sub_' + Date.now().toString(36),
        receivedAt: new Date().toISOString(),
        ...data,
      };

      const list = load();
      list.push(record);
      save(list);

      console.log(`\n✓ Submission #${list.length}`);
      console.log(`  Project : ${record.projectTitle} (${record.projectId})`);
      console.log(`  From    : ${record.firstName} ${record.lastName} <${record.email}>`);
      console.log(`  Avail   : ${record.availability}`);

      res.writeHead(200, { 'Content-Type': 'application/json', ...CORS });
      res.end(JSON.stringify({
        success: true,
        message: 'Interest submitted successfully',
        confirmationId: record.id,
        receivedAt: record.receivedAt,
        totalSubmissions: list.length,
      }, null, 2));
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json', ...CORS });
  res.end(JSON.stringify({ error: 'Not found', routes: ['POST /submit', 'GET /submissions'] }));
});

server.listen(PORT, () => {
  console.log(`[FormServer] Listening on http://localhost:${PORT}`);
  console.log(`[FormServer] POST submissions → http://localhost:${PORT}/submit`);
  console.log(`[FormServer] View all         → http://localhost:${PORT}/submissions`);
  console.log(`[FormServer] Stored in        → ${STORE}`);
});
