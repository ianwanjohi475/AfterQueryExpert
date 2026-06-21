/**
 * Auto-create a hosted JSON bin that returns the VERIFIED profile.
 *
 *   node create-bin.js              # uses mocky.io (no signup)
 *   node create-bin.js npoint       # uses npoint.io (no signup)
 *
 * Prints the public URL on success — paste it anywhere you need a stub.
 */

'use strict';

const https = require('https');
const fs    = require('fs');
const path  = require('path');

const body = fs.readFileSync(path.join(__dirname, 'profile-verified.json'), 'utf8');
const provider = (process.argv[2] || 'mocky').toLowerCase();

function post(opts, payload) {
  return new Promise((resolve, reject) => {
    const req = https.request(opts, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

(async () => {
  try {
    if (provider === 'mocky') {
      const payload = JSON.stringify({
        status: 200,
        content: body,
        content_type: 'application/json',
        charset: 'UTF-8',
        secret: 'verifier',
        expiration: '365_DAYS',
      });
      const res = await post({
        hostname: 'designer.mocky.io',
        path: '/api/mock',
        method: 'POST',
        headers: { 'Content-Type': 'application/json',
                   'Content-Length': Buffer.byteLength(payload) },
      }, payload);
      const data = JSON.parse(res.body);
      console.log('\nMocky.io bin created:');
      console.log('  URL  →', `https://run.mocky.io/v3/${data.id}`);
      console.log('  ID   →', data.id, '\n');
    }
    else if (provider === 'npoint') {
      const res = await post({
        hostname: 'www.npoint.io',
        path: '/documents',
        method: 'POST',
        headers: { 'Content-Type': 'application/json',
                   'Content-Length': Buffer.byteLength(body) },
      }, body);
      const data = JSON.parse(res.body);
      console.log('\nnpoint.io bin created:');
      console.log('  URL  →', `https://api.npoint.io/${data.token}`);
      console.log('  Edit →', `https://www.npoint.io/docs/${data.token}`);
      console.log('  Token→', data.token, '\n');
    }
    else {
      console.error('Unknown provider:', provider, '(use "mocky" or "npoint")');
      process.exit(1);
    }
  } catch (err) {
    console.error('Failed to create bin:', err.message);
    process.exit(1);
  }
})();
