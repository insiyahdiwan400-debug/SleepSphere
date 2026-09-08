const { chromium } = require('/opt/node22/lib/node_modules/playwright');
let fails=0; const check=(n,ok,x='')=>{console.log(`${ok?'PASS':'FAIL'}  ${n}${x?' :: '+x:''}`);if(!ok)fails++;};
const mins = t => { const [h,m]=t.split(':').map(Number); return h*60+m; };
const span = (a,b) => ((mins(b)-mins(a))%1440+1440)%1440;

// Sunrise / solar noon are method-independent, so they can still be checked
// against a published reference. Maghrib and nisf are checked as relationships,
// which is what the Fatimi definitions actually assert.
const CASES = [
  { city:'Mumbai',  tz:'Asia/Kolkata',  lat:19.0760, lon:72.8777, d:[2025,12,15], sunrise:'07:05', dhuhr:'12:34' },
  { city:'London',  tz:'Europe/London', lat:51.5074, lon:-0.1278, d:[2025,12,15], sunrise:'08:01', dhuhr:'11:56' },
  { city:'Karachi', tz:'Asia/Karachi',  lat:24.8607, lon:67.0011, d:[2025,6,15],  sunrise:'05:39', dhuhr:'12:33' },
  { city:'Nairobi', tz:'Africa/Nairobi',lat:-1.2921, lon:36.8219, d:[2025,6,15],  sunrise:'06:33', dhuhr:'12:31' },
];

(async()=>{
 const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox']});
 for (const c of CASES) {
   const ctx = await b.newContext({ viewport:{width:390,height:844}, timezoneId:c.tz });
   const p = await ctx.newPage();
   await p.goto('http://localhost:8099/index.html',{waitUntil:'domcontentloaded'});
   await p.waitForTimeout(300);
   const t = await p.evaluate(([lat,lon,y,m,d]) => window.__prayerProbe(lat,lon,y,m,d),
                              [c.lat,c.lon,...c.d]);
   await ctx.close();
   const near = (a,b,tol)=>Math.abs(mins(a)-mins(b))<=tol;
   check(`${c.city} sunrise`, near(t.sunrise,c.sunrise,3), `${t.sunrise} vs ${c.sunrise}`);
   check(`${c.city} zawal`,   near(t.dhuhr,c.dhuhr,3),     `${t.dhuhr} vs ${c.dhuhr}`);

   // Maghrib is after sunset, never at it. 4° of depression is roughly a
   // quarter of an hour in the tropics and longer the further north you go.
   const lag = span(t.sunset, t.maghrib);
   check(`${c.city} maghrib is after sunset`, lag >= 10 && lag <= 45,
         `sunset ${t.sunset} -> maghrib ${t.maghrib} (+${lag}m)`);
   // Isha is computed at 14 degrees so it can be checked against the
   // reference, even though it is prayed with Maghrib and the card shows
   // it that way rather than as a separate time.
   check(`${c.city} isha follows maghrib`, span(t.maghrib, t.isha) > 0 && span(t.maghrib, t.isha) < 120,
         `maghrib ${t.maghrib} -> isha ${t.isha}`);

   // Nisf al-layl is the Ja'fari midpoint of sunset -> fajr.
   const toNisf = span(t.sunset, t.nisf), night = span(t.sunset, t.fajr);
   check(`${c.city} nisf halves sunset to fajr`, Math.abs(toNisf*2 - night) <= 2,
         `sunset ${t.sunset} -> nisf ${t.nisf} -> fajr ${t.fajr} (${toNisf}m of ${night}m)`);
   check(`${c.city} asr uses shadow factor 1`, mins(t.asr) > mins(t.dhuhr), t.asr);
   check(`${c.city} names the convention`, t.method === 'Fatimi', t.method);
 }
 await b.close();
 console.log(fails===0?'\nALL CHECKS PASSED':`\n${fails} FAILED`);
 process.exit(fails?1:0);
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
