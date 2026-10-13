# Test results

Full suite run against commit `2dcabbd` on 13 October 2026.

# **1679 checks. 0 failures.**

| | |
|---|---|
| Suites run | 28 |
| Suites fully clean | **27** |
| Checks passed | **1679** |
| Checks failed | **0** |
| Suites not clean | 1 — `trailer.js`, contributing 0 checks |

---

## How these run

Every suite drives a **real browser** — Chromium at an iPhone-shaped
viewport, 390 × 844 at 2×, touch events, mobile user agent — against the
application served over HTTP. They are not unit tests against extracted
functions; they open the app and use it.

A suite is counted "clean" only if it reports zero failures **and** prints
`ALL CHECKS PASSED`. Counting `FAIL` lines alone would let a suite that
crashed halfway through look successful, which has happened on this project
before and is why the check is written this way.

```sh
python3 -m http.server 8099     # serve the repository root first
for f in test/*.js; do node "$f"; done
```

`praytimes-reference.js` and `verify-prayer-times.js` are excluded from the
totals: they are network-backed reference scripts, not suites.

---

## Per suite

| Suite | Checks | What it covers |
|---|---:|---|
| `recording.js` | 147 | Morning records, flags, verification, supersession |
| `fieldwork.js` | 153 | Enrolment, study panel, export, migration |
| `build-night.js` | 137 | Night construction from a wake anchor |
| `feasibility.js` | 136 | Schedule compression and the four internal states |
| `today.js` | 103 | The Today screen across dayparts |
| `context.js` | 96 | Timezone, travel, clock changes |
| `living-night.js` | 94 | The night screen |
| `night-state.js` | 89 | Night state transitions |
| `dua.js` | 83 | Duʿāʾ |
| `worlds.js` | 80 | Alternate interfaces and the shared contract |
| `night.js` | 65 | Night behaviour |
| **`living-sky.js`** | **63** | Footage layer, licences, codecs, the opt-in default |
| `integration-oct20.js` | 54 | Cross-module integration and privacy |
| `motherhood.js` | 50 | Motherhood data layer |
| `explore.js` | 48 | Practices |
| `motherhood-module.js` | 45 | The privacy boundary |
| `fatimi-convention.js` | 43 | Fatimi prayer-time conventions |
| `insights.js` | 39 | Trends |
| `lazy-mode.js` | 26 | One-tap nights |
| `starfield.js` | 25 | The drawn sky |
| `screen-shapes.js` | 24 | Layout at phone widths |
| `feedback.js` | 19 | Feedback capture |
| `deep-links.js` | 17 | Deep links |
| `prayer-ui.js` | 17 | Prayer-time interface |
| `apnea-screening.js` | 16 | Apnea screening |
| `storage.js` | 10 | Persistence |
| `trailer.js` | **0** | See below |
| **Total** | **1679** | |

---

## The one suite that is not clean

`trailer.js` fails at startup with
`TypeError: Cannot read properties of null (reading 'click')` and
contributes **0 checks**, passed or failed.

The cause is specific and is **not a defect in the application**. The suite
drives `.nav button[data-view="plan"]`, but the consolidation to four
destinations left only `today`, `twin`, `learn` and `data`. It is a stale
test of a screen that no longer exists.

Confirmed pre-existing: the `.nav` markup is byte-identical at the rollback
point `57ba4e5` and at the submitted commit, so this suite failed the same
way before the current branch existed. It is listed in the roadmap for
retirement or rewrite.

---

## Verified beyond the suite

Three scripted browser passes were run against the preview build in addition
to the suite.

**Requirement coverage — 20 checks, 0 failures.** All four tabs render and
leave the footage layer intact; a morning record written through
`SS.engine.recordMorning` moved the store from 0 to 1 and produced a derived
duration of **390 minutes** from the entered times; a Motherhood entry
round-tripped and did **not** appear in `__motherhood.exported()`.

**Daypart coverage — 55 checks, 0 failures.** All five preview dayparts land
in the band they name, point at the correct clip, and carry the CC BY credit.
This pass found a real bug: the switcher's "Evening" button was set to 20:40,
which falls in the app's `dusk` band (19:00–22:00), so the button did not
reach the daypart it named. Fixed.

**Opt-in default — 10 checks, 0 failures.** The app opens with no video
element, downloads **no MP4 at all**, and weighs **1 075 KB** against 6 048 KB
before the change. The toggle mounts the layer on demand and takes it back
down again.

### Performance, measured

Taken over 180 animation frames at rest on the night screen:

| | |
|---|---|
| Median frame | **16.7 ms** (60 fps) |
| 95th percentile | 16.7 ms |
| Long tasks | **0** |
| `backdrop-filter` elements on screen | **2** of 65 in the document |

---

## What these numbers do not cover

Stated so the figure is not read as more than it is.

- **No test ran on a physical device.** Chromium at an iPhone-shaped
  viewport exercises layout and logic; it is not Safari and it is not iOS.
- **H.264 playback is unverified.** The test browser has no H.264 decoder,
  so the shipped clips cannot be decoded here even in principle. The
  adapter's play path was proved with a WebM fixture instead.
- **A reported glitch on a real phone is not reproduced** and therefore is
  not covered by any check in this table.
