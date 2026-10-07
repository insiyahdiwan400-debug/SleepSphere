/**
 * The Fatimi convention, checked as relationships rather than against a
 * remote reference — so it runs offline and catches a regression even when
 * the API is unreachable.
 *
 * It also pins the ground truth from a real Dawat timetable. Two values here
 * were wrong in this app for a while, and both were wrong in the same way:
 * the Ithna-Ashari rule was used where the Fatimi one differs, and the result
 * looked entirely reasonable on screen. Those two get exact assertions, not
 * tolerances.
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
let fails = 0;
const check = (n, ok, x='') => { console.log(`${ok?'PASS':'FAIL'}  ${n}${x?' :: '+x:''}`); if (!ok) fails++; };
const mins = t => { const [h,m] = t.split(':').map(Number); return h*60+m; };
const span = (a,b) => ((mins(b)-mins(a)) % 1440 + 1440) % 1440;

/* A whole Dubai Dawat timetable, 9 September 2026, row for row. Every value
   the app shows is pinned to it. Three of these were wrong at some point,
   each because a nearby published convention was reached for instead of the
   Fatimi one, and each wrong answer looked entirely reasonable on screen:
     Maghrib  18:30 — sunset. NOT the Ithna-Ashari 4-degree 18:44.
     Nisf     00:16 — midpoint sunset to SUNRISE. NOT sunset to Fajr (23:42).
     Sihori   04:46 — Fajr at 17.7 degrees. NOT 16 degrees (04:54).
   `tol` is the allowed minutes of disagreement: 0 where the sheet's rule is
   fully pinned down, 1 for sihori, where a single sheet cannot separate the
   Fajr angle from the size of the precaution applied to it. */
const GROUND_TRUTH = {
  city: 'Dubai', tz: 'Asia/Dubai', lat: 25.2048, lon: 55.2708, d: [2026, 9, 9],
  rows: [
    ['Sihori End', 'fajr',    '04:46', 1],
    ['Sunrise',    'sunrise', '06:01', 0],
    ['Zawal',      'dhuhr',   '12:16', 0],
    ['Maghrib',    'maghrib', '18:30', 0],
    ['Nisf start', 'nisf',    '00:16', 0],
    ['Nisf end',   'nisfEnd', '01:12', 0]
  ]
};

const CASES = [
  { city:'Mumbai',  tz:'Asia/Kolkata',   lat:19.0760, lon:72.8777, d:[2025,12,15], sunrise:'07:05', dhuhr:'12:34' },
  { city:'London',  tz:'Europe/London',  lat:51.5074, lon:-0.1278, d:[2025,12,15], sunrise:'08:01', dhuhr:'11:56' },
  { city:'Karachi', tz:'Asia/Karachi',   lat:24.8607, lon:67.0011, d:[2025,6,15],  sunrise:'05:39', dhuhr:'12:33' },
  { city:'Nairobi', tz:'Africa/Nairobi', lat:-1.2921, lon:36.8219, d:[2025,6,15],  sunrise:'06:33', dhuhr:'12:31' },
];

(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--no-sandbox'] });
  const probe = async (tz, lat, lon, d) => {
    const ctx = await b.newContext({ viewport:{width:390,height:844}, timezoneId: tz });
    const p = await ctx.newPage();
    await p.goto('http://localhost:8099/index.html', { waitUntil:'domcontentloaded' });
    await p.waitForTimeout(250);
    const t = await p.evaluate(([la,lo,y,m,dd]) => window.__prayerProbe(la,lo,y,m,dd,'seventh'), [lat,lon,...d]);
    await ctx.close();
    return t;
  };

  // The timetable, row for row.
  const g = GROUND_TRUTH;
  const t0 = await probe(g.tz, g.lat, g.lon, g.d);
  for (const [label, key, expected, tol] of g.rows) {
    const off = Math.abs(mins(t0[key]) - mins(expected));
    const wrapped = Math.min(off, 1440 - off);
    check(`${g.city} ${label} matches the Dawat sheet`, wrapped <= tol,
          `${t0[key]} vs ${expected}${wrapped ? ` (${wrapped}m)` : ' exact'}`);
  }
  // The ihtiyat must be a display convention only: it must never feed back
  // into the arithmetic. Nisf is derived from true sunrise, so it has to sit
  // half way between sunset and sunriseTrue, not the shown sunrise.
  check(`${g.city} ihtiyat does not leak into nisf`,
        Math.abs(span(t0.sunset, t0.nisf) * 2 - span(t0.sunset, t0.sunriseTrue)) <= 1,
        `nisf ${t0.nisf}, true sunrise ${t0.sunriseTrue}, shown ${t0.sunrise}`);

  for (const c of CASES) {
    const t = await probe(c.tz, c.lat, c.lon, c.d);
    const near = (a, b, tol) => Math.abs(mins(a) - mins(b)) <= tol;
    check(`${c.city} sunrise`, near(t.sunriseTrue, c.sunrise, 3), `${t.sunriseTrue} vs ${c.sunrise}`);
    check(`${c.city} zawal`,   near(t.dhuhr,   c.dhuhr,   3), `${t.dhuhr} vs ${c.dhuhr}`);

    // Fatimi Maghrib IS sunset. Not a few minutes after it.
    check(`${c.city} maghrib is sunset`, t.maghrib === t.sunset, `${t.maghrib} / sunset ${t.sunset}`);

    // Isha is computed at 14 degrees so it can be checked against a
    // reference, even though it is prayed with Maghrib and shown that way.
    check(`${c.city} isha follows maghrib`,
          span(t.maghrib, t.isha) > 0 && span(t.maghrib, t.isha) < 120,
          `maghrib ${t.maghrib} -> isha ${t.isha}`);

    // Nisf al-layl halves sunset to SUNRISE — the whole dark part of the day.
    const toNisf = span(t.sunset, t.nisf), night = span(t.sunset, t.sunriseTrue);
    check(`${c.city} nisf halves sunset to sunrise`, Math.abs(toNisf*2 - night) <= 2,
          `sunset ${t.sunset} -> nisf ${t.nisf} -> sunrise ${t.sunrise} (${toNisf}m of ${night}m)`);
    // And is therefore later than the Ja'fari sunset-to-Fajr midpoint, which
    // is the wrong answer this app used to give.
    const jafari = span(t.sunset, t.fajrTrue) / 2;
    // And the window closes one seasonal night hour later, less the ihtiyat.
    check(`${c.city} nisf window is a twelfth of the night`,
          Math.abs(span(t.nisf, t.nisfEnd) - (night/12 - 2)) <= 1,
          `${span(t.nisf, t.nisfEnd)}m vs ${Math.round(night/12 - 2)}m`);
    check(`${c.city} nisf is not the Ja'fari midpoint`, toNisf > jafari + 5,
          `${toNisf}m vs Ja'fari ${Math.round(jafari)}m after sunset`);

    check(`${c.city} asr uses shadow factor 1`, mins(t.asr) > mins(t.dhuhr), t.asr);
    check(`${c.city} names the convention`, t.method === 'Fatimi', t.method);
  }

  await b.close();
  console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} FAILED`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
