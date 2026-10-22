/* SleepSphere prototype reporting relay.
 * Deploy ONLY on the isolated testing preview. Set RESEND_API_KEY
 * and SLEEPSPHERE_REPORT_FROM / SLEEPSPHERE_REPORT_TO server-side. Never put founder email
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
  if (e.type !== 'feedback_submitted' || e.schema !== 1) return null;
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
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.SLEEPSPHERE_REPORT_FROM;
  const to = process.env.SLEEPSPHERE_REPORT_TO;
  if (!apiKey || !from || !to) return {statusCode:503,body:'Email delivery is not configured'};
  // All content is constructed from validated fields. No free-text input,
  // sleep records, or Motherhood data enters the email.
  const subject = 'SleepSphere tester rating';
  const lines = [
    'SleepSphere prototype feedback',
    'Tester ID: ' + payload.testerId,
    'Event: ' + payload.event.type,
    'Rating: ' + payload.event.rating + '/5'
  ];
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({from, to: [to], subject, text: lines.join('\\n')}),
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) return {statusCode:502,body:'Email delivery unavailable'};
    return {statusCode:202,body:'Accepted by email provider'};
  } catch (_) { return {statusCode:502,body:'Email delivery unavailable'}; }
};
