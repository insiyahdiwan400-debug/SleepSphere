'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validate } = require('../netlify/functions/prototype-report.js');
const valid = { consent: true, testerId: 'Tester_01', event: { type: 'feedback_submitted', schema: 1, rating: 3 } };
test('accepts a consented rating', () => {
  assert.deepEqual(validate(valid), { testerId: valid.testerId, event: valid.event });
});
test('rejects reports without consent or with other event types', () => {
  assert.equal(validate({ ...valid, consent: false }), null);
  assert.equal(validate({ ...valid, event: { type: 'app_open', schema: 1 } }), null);
});
test('rejects extra sensitive fields and invalid ratings', () => {
  assert.equal(validate({ ...valid, sleepEntries: [] }), null);
  assert.equal(validate({ ...valid, motherhood: {} }), null);
  assert.equal(validate({ ...valid, event: { ...valid.event, rating: 6 } }), null);
});
