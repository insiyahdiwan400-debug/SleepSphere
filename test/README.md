# Checking the prayer times

The times SleepSphere prints are not taken on trust. They are checked
against a published reference implementation — **api.aladhan.com method 0,
Shia Ithna-Ashari (Leva Institute, Qum)** — which uses the parameters the
Fatimi timetable follows:

| | |
|---|---|
| Fajr | sun 16° below the horizon |
| Isha | sun 14° below the horizon |
| Maghrib | sun 4° below the horizon — *not* sunset |
| Asr | shadow factor 1 — *not* the Hanafi 2 |
| Nisf al-layl | halfway from sunset to Fajr (Ja'fari) |

## Running the checks

Serve the repository root and point the tests at it:

```bash
python3 -m http.server 8099 &
node test/verify-prayer-times.js     # against the live reference
node test/fatimi-convention.js       # the relationships, offline
```

`verify-prayer-times.js` compares **every time the app prints** — Fajr,
sunrise, Zohr, Asr, sunset, Maghrib, Isha and nisf al-layl — across twelve
cities from Colombo to Toronto, on the solstices, the equinoxes and two
ordinary days. That is 573 comparisons. It fails if any of them is more
than a minute out.

Reference responses are cached to `test/.refcache.json`, so re-runs need no
network. Delete that file to re-fetch.

`fatimi-convention.js` needs no network. It checks the relationships the
convention actually asserts — Maghrib strictly after sunset, nisf halving
sunset to Fajr, Asr on shadow factor 1 — so a regression is caught even
offline.

## If the times disagree with your timetable

Three things move them, in the order worth checking:

1. **Fajr angle.** 16° here. Some communities print 17.7° (Tehran) or 18°.
   Ten minutes of difference in Mumbai, more further north.
2. **Maghrib.** 4° of depression. A timetable showing Maghrib *at* sunset
   is following a different fiqh, not a different calculation.
3. **Nisf al-layl.** Measured sunset → Fajr. Measuring it Maghrib → Fajr
   instead moves it later by roughly half the sunset-to-Maghrib gap.

All three live in one place: the `FATIMI` constant in `index.html`. Change
a value there, re-run both scripts, and the tests will tell you what moved.
