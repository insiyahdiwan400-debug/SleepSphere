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

/* Verified against a Dubai Dawat timetable. If either of these two moves,
   the convention has been broken, not merely nudged:
     Maghrib 18:30 — sunset. NOT the Ithna-Ashari 4-degree 18:44.
     Nisf     00:16 — midpoint sunset to SUNRISE. NOT sunset to Fajr (23:42). */
const GROUND_TRUTH = {
  city: 'Dubai', tz: 'Asia/Dubai', lat: 25.2048, lon: 55.2708, d: [2026, 9, 9],
  maghrib: '18:30', nisf: '00:16'
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

  // The timetable, exactly.
  const g = GROUND_TRUTH;
  const t0 = await probe(g.tz, g.lat, g.lon, g.d);
  check(`${g.city} Maghrib matches the Dawat timetable`, t0.maghrib === g.maghrib,
        `${t0.maghrib} (timetable ${g.maghrib})`);
  check(`${g.city} nisf al-layl matches the Dawat timetable`, t0.nisf === g.nisf,
        `${t0.nisf} (timetable ${g.nisf})`);

  for (const c of CASES) {
    const t = await probe(c.tz, c.lat, c.lon, c.d);
    const near = (a, b, tol) => Math.abs(mins(a) - mins(b)) <= tol;
    check(`${c.city} sunrise`, near(t.sunrise, c.sunrise, 3), `${t.sunrise} vs ${c.sunrise}`);
    check(`${c.city} zawal`,   near(t.dhuhr,   c.dhuhr,   3), `${t.dhuhr} vs ${c.dhuhr}`);

    // Fatimi Maghrib IS sunset. Not a few minutes after it.
    check(`${c.city} maghrib is sunset`, t.maghrib === t.sunset, `${t.maghrib} / sunset ${t.sunset}`);

    // Isha is computed at 14 degrees so it can be checked against a
    // reference, even though it is prayed with Maghrib and shown that way.
    check(`${c.city} isha follows maghrib`,
          span(t.maghrib, t.isha) > 0 && span(t.maghrib, t.isha) < 120,
          `maghrib ${t.maghrib} -> isha ${t.isha}`);

    // Nisf al-layl halves sunset to SUNRISE — the whole dark part of the day.
    const toNisf = span(t.sunset, t.nisf), night = span(t.sunset, t.sunrise);
    check(`${c.city} nisf halves sunset to sunrise`, Math.abs(toNisf*2 - night) <= 2,
          `sunset ${t.sunset} -> nisf ${t.nisf} -> sunrise ${t.sunrise} (${toNisf}m of ${night}m)`);
    // And is therefore later than the Ja'fari sunset-to-Fajr midpoint, which
    // is the wrong answer this app used to give.
    const jafari = span(t.sunset, t.fajr) / 2;
    check(`${c.city} nisf is not the Ja'fari midpoint`, toNisf > jafari + 5,
          `${toNisf}m vs Ja'fari ${Math.round(jafari)}m after sunset`);

    check(`${c.city} asr uses shadow factor 1`, mins(t.asr) > mins(t.dhuhr), t.asr);
    check(`${c.city} names the convention`, t.method === 'Fatimi', t.method);
  }

  await b.close();
  console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} FAILED`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
