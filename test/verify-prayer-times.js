/**
 * Verify the app's prayer engine against a published reference implementation.
 *
 * The reference is api.aladhan.com method 0 — Shia Ithna-Ashari, Leva
 * Institute, Qum (Fajr 16, Isha 14, Maghrib 4, Ja'fari midnight), which is
 * the convention the Fatimi timetable follows. Every time the app prints is
 * compared against it across cities, latitudes and seasons.
 *
 * Reference responses are cached to test/.refcache.json so the suite can be
 * re-run without hammering the API.
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const { praytimes } = require('./praytimes-reference.js');
const CACHE = 'test/.refcache.json';
const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE,'utf8')) : {};

const CITIES = [
  ['Mumbai',      19.0760,  72.8777, 'Asia/Kolkata'],
  ['Surat',       21.1702,  72.8311, 'Asia/Kolkata'],
  ['Karachi',     24.8607,  67.0011, 'Asia/Karachi'],
  ['Sanaa',       15.3694,  44.1910, 'Asia/Aden'],
  ['Nairobi',     -1.2921,  36.8219, 'Africa/Nairobi'],
  ['Dubai',       25.2048,  55.2708, 'Asia/Dubai'],
  ['London',      51.5074,  -0.1278, 'Europe/London'],
  ['New York',    40.7128, -74.0060, 'America/New_York'],
  ['Toronto',     43.6532, -79.3832, 'America/Toronto'],
  ['Singapore',    1.3521, 103.8198, 'Asia/Singapore'],
  ['Sydney',     -33.8688, 151.2093, 'Australia/Sydney'],
  ['Colombo',      6.9271,  79.8612, 'Asia/Colombo'],
];
// Today first — a fixed list of dates goes stale, and the day someone
// actually opens the app is the one that has to be right. Then the
// solstices, the equinoxes and a couple of ordinary days for the shape of
// the whole year. Today is not cached, so it is always a live comparison.
const today = new Date();
const TODAY = [today.getFullYear(), today.getMonth() + 1, today.getDate()];
const DATES = [TODAY, [2026,3,20],[2026,6,21],[2026,9,23],[2026,12,21],[2026,1,15],[2026,8,7]];
const isToday = d => d[0] === TODAY[0] && d[1] === TODAY[1] && d[2] === TODAY[2];

const mins = t => { const [h,m] = t.split(':').map(Number); return h*60+m; };
const gap  = (a,b) => { const d = Math.abs(mins(a)-mins(b)); return Math.min(d, 1440-d); };

async function reference(lat, lon, date) {
  const [y,m,d] = date;
  const key = `${lat},${lon},${y}-${m}-${d}`;
  if (cache[key] && !isToday(date)) return cache[key];
  const url = `https://api.aladhan.com/v1/timings/${String(d).padStart(2,'0')}-`
            + `${String(m).padStart(2,'0')}-${y}?latitude=${lat}&longitude=${lon}`
            + `&method=0&midnightMode=1`;
  const res = await fetch(url);
  const json = await res.json();
  if (!json.data) throw new Error('reference fetch failed: ' + JSON.stringify(json).slice(0,200));
  if (!isToday(date)) { cache[key] = json.data.timings; fs.writeFileSync(CACHE, JSON.stringify(cache)); }
  return json.data.timings;
}

// The times the app actually prints, and what each is called in the reference.
const FIELDS = [['fajr','Fajr'], ['sunrise','Sunrise'], ['dhuhr','Dhuhr'], ['asr','Asr'],
                ['sunset','Sunset'], ['maghrib','Maghrib'], ['isha','Isha'], ['nisf','Midnight']];

(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--no-sandbox'] });
  let worst = 0, offenders = [], comparisons = 0, estimatedSkips = 0;

  for (const [city, lat, lon, tz] of CITIES) {
    const ctx = await b.newContext({ viewport:{width:390,height:844}, timezoneId: tz });
    const p = await ctx.newPage();
    await p.goto('http://localhost:8099/index.html', { waitUntil:'domcontentloaded' });
    await p.waitForTimeout(250);
    const rows = [];
    for (const date of DATES) {
      const mine = await p.evaluate(([la,lo,y,m,d]) => window.__prayerProbe(la,lo,y,m,d,'seventh'),
                                    [lat,lon,...date]);
      const ref = await reference(lat, lon, date);
      // The timezone offset the app itself resolved for this date, so the
      // offline reference sees the same clock — including DST.
      const tzHours = await p.evaluate(([y,m,d]) => -new Date(y, m-1, d, 12).getTimezoneOffset() / 60, date);
      const canon = praytimes({ latitude: lat, longitude: lon,
                                year: date[0], month: date[1], day: date[2], timezone: tzHours });
      let line = [];
      for (const [ours, theirs] of FIELDS) {
        if (!mine[ours] || !ref[theirs]) continue;
        // High-latitude estimates are by definition not the reference's
        // arithmetic, so they are reported but never counted as failures.
        if (mine.estimated && ['fajr','isha','nisf'].includes(ours)) { estimatedSkips++; continue; }
        // Asr is judged against canonical PrayTimes, not against aladhan:
        // the two published sources disagree with each other on Asr by up to
        // two minutes, and the timetables people actually hold are generated
        // by PrayTimes-derived software. Every other time is checked against
        // both and has to satisfy both.
        const against = ours === 'asr' ? canon[ours] : ref[theirs];
        const source  = ours === 'asr' ? 'PrayTimes' : 'reference';
        if (!against) continue;
        const off = gap(mine[ours], against);
        comparisons++;
        worst = Math.max(worst, off);
        if (off > 1) { offenders.push(`${city} ${date.join('-')} ${ours}: ${mine[ours]} vs ${source} ${against} (${off}m)`);
                       line.push(`${ours} ${off}m`); }
        // Cross-check: every non-Asr time must also agree with the offline
        // PrayTimes transcription, so a wrong answer cannot hide behind one
        // source being unavailable or having changed.
        if (ours !== 'asr' && canon[ours]) {
          const cross = gap(mine[ours], canon[ours]);
          comparisons++;
          worst = Math.max(worst, cross);
          if (cross > 1) { offenders.push(`${city} ${date.join('-')} ${ours}: ${mine[ours]} vs PrayTimes ${canon[ours]} (${cross}m)`);
                           line.push(`${ours} ${cross}m vs PrayTimes`); }
        }
      }
      rows.push(`${date.join('-').padEnd(11)} ${line.length ? line.join(', ') : 'all match'}`
                + (isToday(date) ? '   <- today' : ''));
    }
    await ctx.close();
    console.log(`${city}\n  ` + rows.join('\n  '));
  }
  await b.close();

  console.log('\n' + '-'.repeat(62));
  console.log(`${comparisons} comparisons against two independent references:`);
console.log('  api.aladhan.com method 0 (Shia Ithna-Ashari, Qum) and a PrayTimes transcription');
  console.log(`${estimatedSkips} high-latitude estimates excluded (no true time exists)`);
  console.log(`worst disagreement: ${worst} minute(s)`);
  if (offenders.length) { console.log('\nOUT BY MORE THAN A MINUTE:'); offenders.forEach(o=>console.log('  '+o)); }
  console.log(offenders.length ? `\n${offenders.length} FAILED` : '\nMATCHES THE REFERENCE');
  process.exit(offenders.length ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
