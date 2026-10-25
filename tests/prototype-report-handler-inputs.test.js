'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { handler } = require('../netlify/functions/prototype-report.js');

const valid = {
  consent: true,
  testerId: 'Tester_01',
  event: { type: 'feedback_submitted', schema: 1, rating: 3 }
};
const post = (body) => ({ httpMethod: 'POST', body: JSON.stringify(body) });

test('blocks unsupported methods before processing any data', async () => {
  assert.equal((await handler({ httpMethod: 'GET' })).statusCode, 405);
});

test('rejects missing, oversized, and malformed request bodies', async () => {
  assert.equal((await handler({ httpMethod: 'POST' })).statusCode, 413);
  assert.equal((await handler({ httpMethod: 'POST', body: 'x'.repeat(2049) })).statusCode, 413);
  assert.equal((await handler({ httpMethod: 'POST', body: '{' })).statusCode, 400);
});

test('rejects submissions without consent or with sensitive data', async () => {
  for (const payload of [
    { ...valid, consent: false },
    { ...valid, event: { type: 'app_open', schema: 1 } },
    { ...valid, sleepEntries: [{ bedtime: '22:00' }] },
    { ...valid, motherhood: { private: true } }
  ]) assert.equal((await handler(post(payload))).statusCode, 400);
});
