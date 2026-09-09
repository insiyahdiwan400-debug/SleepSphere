/**
 * A faithful transcription of PrayTimes.js (praytimes.org, Hamid Zarrabi-Zadeh,
 * LGPL) — the algorithm essentially every published prayer timetable is
 * generated from.
 *
 * It exists here as an INDEPENDENT SECOND REFERENCE. The app's own engine in
 * index.html is written separately; if the two agree to the minute across
 * cities and seasons, the app's arithmetic is not merely self-consistent.
 *
 * This matters most for Asr. api.aladhan.com — the other reference — disagrees
 * with canonical PrayTimes on Asr by one to two minutes at some latitudes and
 * dates, while agreeing on everything else. Checking Asr against this file
 * pins down which of the two the app is tracking, instead of loosening a
 * tolerance until the failure disappears.
 *
 * Configured for the Fatimi parameters the app uses — which are NOT the
 * Ithna-Ashari ones for Maghrib or for nisf al-layl. See index.html.
 */
'use strict';

const sin = d => Math.sin(d * Math.PI / 180);
const cos = d => Math.cos(d * Math.PI / 180);
const tan = d => Math.tan(d * Math.PI / 180);
const arcsin = x => Math.asin(x) * 180 / Math.PI;
const arccos = x => Math.acos(x) * 180 / Math.PI;
const arctan2 = (y, x) => Math.atan2(y, x) * 180 / Math.PI;
const arccot = x => Math.atan2(1, x) * 180 / Math.PI;
const fixAngle = a => a - 360 * Math.floor(a / 360);
const fixHour  = a => a - 24 * Math.floor(a / 24);

// Fatimi: Maghrib is sunset, not the Ithna-Ashari 4 degrees of depression.
const PARAMS = { fajr: 16, isha: 14, maghrib: 0.833, asrFactor: 1 };

function julian(year, month, day) {
  if (month <= 2) { year -= 1; month += 12; }
  const a = Math.floor(year / 100), b = 2 - a + Math.floor(a / 4);
  return Math.floor(365.25 * (year + 4716)) + Math.floor(30.6001 * (month + 1)) + day + b - 1524.5;
}

function sunPosition(jd) {
  const D = jd - 2451545.0;
  const g = fixAngle(357.529 + 0.98560028 * D);
  const q = fixAngle(280.459 + 0.98564736 * D);
  const L = fixAngle(q + 1.915 * sin(g) + 0.020 * sin(2 * g));
  const e = 23.439 - 0.00000036 * D;
  const declination = arcsin(sin(e) * sin(L));
  const rightAscension = fixHour(arctan2(cos(e) * sin(L), cos(L)) / 15);
  return { declination, equation: q / 15 - rightAscension };
}

/**
 * @param {number} timezone Offset from UTC in hours, for this date.
 * @returns times as "HH:MM" on the local clock, or null where the sun never
 *          reaches the required depression.
 */
function praytimes({ latitude, longitude, year, month, day, timezone }) {
  const jd = julian(year, month, day) - longitude / 360;
  const midDay = t => fixHour(12 - sunPosition(jd + t).equation);
  const angleTime = (angle, t, ccw) => {
    const { declination } = sunPosition(jd + t);
    const value = (-sin(angle) - sin(declination) * sin(latitude))
                / (cos(declination) * cos(latitude));
    if (value > 1 || value < -1) return null;
    const v = arccos(value) / 15;
    return midDay(t) + (ccw ? -v : v);
  };
  const asrTime = t => {
    const { declination } = sunPosition(jd + t);
    return angleTime(-arccot(PARAMS.asrFactor + tan(Math.abs(latitude - declination))), t, false);
  };

  // PrayTimes runs exactly one refining pass from these crude starting hours.
  let T = { fajr: 5, sunrise: 6, dhuhr: 12, asr: 13, sunset: 18, maghrib: 18, isha: 18 };
  for (let i = 0; i < 1; i++) {
    const p = k => T[k] / 24;
    T = {
      fajr:    angleTime(PARAMS.fajr,    p('fajr'),    true),
      sunrise: angleTime(0.833,          p('sunrise'), true),
      dhuhr:   midDay(p('dhuhr')),
      asr:     asrTime(p('asr')),
      sunset:  angleTime(0.833,          p('sunset'),  false),
      maghrib: angleTime(PARAMS.maghrib, p('maghrib'), false),
      isha:    angleTime(PARAMS.isha,    p('isha'),    false)
    };
  }

  const adjust = timezone - longitude / 15;
  const clock = hours => {
    if (hours === null || !Number.isFinite(hours)) return null;
    const total = ((Math.round(fixHour(hours + adjust) * 60) % 1440) + 1440) % 1440;
    return `${String(Math.floor(total / 60)).padStart(2,'0')}:${String(total % 60).padStart(2,'0')}`;
  };

  const out = {};
  for (const key of Object.keys(T)) out[key] = clock(T[key]);
  // Nisf al-layl: the middle of the night, sunset to sunrise.
  out.nisf = (T.sunset === null || T.sunrise === null) ? null
           : clock(T.sunset + fixHour(T.sunrise - T.sunset) / 2);
  return out;
}

module.exports = { praytimes };
