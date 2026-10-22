/* SleepSphere prototype reporting relay.
 * Deploy ONLY on the isolated testing preview. Set SLEEPSPHERE_REPORT_WEBHOOK
 * server-side to a private HTTPS ingestion endpoint. Never put founder email
 * or credentials in client code. No sleep or Motherhood records accepted.
 */
'use strict';
const TYPES = Object.freeze({
  app_open: [], routine_started: [], routine_completed: [],
  audio_play_error: ['code'], notification_error: ['code'],
  feedback_submitted: ['rating']
});
const CODES = new Set(['playback_failed','audio_unavailable','permission_denied','delivery_failed','unknown']);
const ID = /^[a-zA-Z0-9_-]{1,40}$/;
function validate(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  if (body.consent !== true || typeof body.testerId !== 'string' || !ID.test(body.testerId)) return null;
  if (!body.event || typeof body.event !== 'object' || Array.isArray(body.event)) return null;
  const e = body.event;
  if (!Object.hasOwn(TYPES, e.type) || e.schema !== 1) return null;
  const allowed = TYPES[e.type];
  if (Object.keys(e).some(k => !['type','schema',...allowed].includes(k))) return null;
  if (allowed.includes('code') && !CODES.has(e.code)) return null;
  if (allowed.includes('rating') && (!Number.isInteger(e.rating) || e.rating < 1 || e.rating > 5)) return null;
  if (Object.keys(body).some(k => !['consent','testerId','event'].includes(k))) return null;
  return { testerId: body.testerId, event: e };
}
exports.validate = validate;
exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') return {statusCode:405,body:'Method not allowed'};
  if (!event.body || event.body.length > 2048) return {statusCode:413,body:'Payload too large'};
  let parsed;
  try { parsed = JSON.parse(event.body); } catch (_) { return {statusCode:400,body:'Invalid JSON'}; }
  const payload = validate(parsed);
  if (!payload) return {statusCode:400,body:'Invalid reporting event'};
  const webhook = process.env.SLEEPSPHERE_REPORT_WEBHOOK;
  if (!webhook || !/^https:\/\//.test(webhook)) return {statusCode:503,body:'Reporting is not configured'};
  try {
    const response = await fetch(webhook, {
      method:'POST', headers:{'content-type':'application/json'},
      body:JSON.stringify(payload), signal:AbortSignal.timeout(5000)
    });
    if (!response.ok) return {statusCode:502,body:'Reporting unavailable'};
    return {statusCode:202,body:'Accepted'};
  } catch (_) { return {statusCode:502,body:'Reporting unavailable'}; }
};
