# Test results

Full run against commit `952b6e8` on 17 October 2026, on the development
branch `claude/sleepsphere-integration-oct20`.

# **2043 checks. 0 failures. 55 files, all green.**

| | |
|---|---:|
| Files run | **55** |
| — in `test/` | 42 |
| — in `tests/` | 13 |
| Files green | **55** |
| Checks passed (`test/`) | **2043** |
| Checks failed | **0** |

---

## Correction to the previous edition of this document

The 13 October edition of this file headlined **"29 suites, 1713 checks, 0
failures"** and printed its own command:

```sh
for f in test/*.js; do node "$f"; done
```

That glob misses the whole of `tests/`, a second directory of 13 files
added between 15 and 17 October. **Five of those 13 were failing at the
time** — four Motherhood authentication checks and one research-export
privacy check — and the headline figure was computed without them. The
number was not wrong about the files it covered; it was presented as a
total when it was a subset, which is worse.

The failures were real, and they are fixed in commit `d216b1d`: an unlock
that completed after the vault had been locked, and participant free text
reaching the research CSV. Both are described in
[`LIMITATIONS-AND-ROADMAP.md`](LIMITATIONS-AND-ROADMAP.md) and in that
commit's message.

Both directories are now run, and both are named in the command below.
A figure in this document covers every test file in the repository or it
is not printed.

---

## How these run

```sh
python3 -m http.server 8099          # serve the repository root first
for f in test/*.js tests/*.js; do node "$f"; done
```

Most files in `test/` drive a **real browser** — Chromium at an
iPhone-shaped viewport, 390 × 844 at 2×, touch events, mobile user agent —
against the application served over HTTP. They are not unit tests against
extracted functions: they open the app and use it.

The 13 files in `tests/` are `node:assert` checks that evaluate real
functions lifted out of `motherhood.js`, `motherhood-ui.js` and
`index.html` with stubbed crypto and storage. That is how a race between
key derivation and a lock is made deterministic, and it is the right tool
for it. It is not a substitute for the real thing, which is why
`test/motherhood-auth-race.js` exists alongside them and drives the real
module with the browser's own WebCrypto.

A file counts as green only if it **exits zero**. Counting `FAIL` lines
alone would let a file that crashed halfway through look successful, which
has happened on this project before and is why the check is written this
way.

---

## Per file, `test/`

| File | Checks | What it covers |
|---|---:|---|
| `fieldwork.js` | 153 | Enrolment, study panel, export, migration |
| `recording.js` | 147 | Morning records, flags, verification, supersession |
| `build-night.js` | 137 | Night construction from a wake anchor |
| `feasibility.js` | 136 | Schedule compression and the four internal states |
| `today.js` | 103 | The Today screen across dayparts |
| `context.js` | 96 | Timezone, travel, clock changes |
| `living-night.js` | 94 | The night screen |
| `night-state.js` | 89 | Night state transitions |
| `dua.js` | 83 | Duʿāʾ |
| `worlds.js` | 82 | Alternate interfaces and the shared contract |
| `variants.js` | 68 | Interface switcher, soundscape layers |
| `night.js` | 65 | Night behaviour |
| `living-sky.js` | 63 | Footage layer, licences, codecs, the opt-in default |
| `flight-cabin.js` | 61 | The Flight Mode cabin against the visual reference |
| `integration-oct20.js` | 54 | Cross-module integration and privacy |
| `motherhood.js` | 50 | Motherhood data layer |
| `explore.js` | 50 | Practices and the sound lifecycle |
| `motherhood-module.js` | 45 | The privacy boundary |
| `fatimi-convention.js` | 43 | Fatimi prayer-time conventions |
| `insights.js` | 39 | Trends |
| `hub.js` | 39 | The Sounds & Experiences hub |
| `storage.js` | 37 | Persistence, and refusing to overwrite unreadable data |
| `first-run.js` | 37 | Reachability from a cold open, counted in taps |
| `sky-cycle.js` | 27 | The sky cycle and its shortest path |
| `lazy-mode.js` | 26 | One-tap nights |
| `starfield.js` | 25 | The drawn sky |
| `screen-shapes.js` | 24 | Layout at phone widths |
| `flight-instrument.js` | 22 | The flight instrument |
| `feedback.js` | 19 | Feedback capture |
| `stacking.js` | 18 | That messages can be read and sound can be stopped |
| `prayer-ui.js` | 17 | Prayer-time interface |
| `deep-links.js` | 17 | Deep links |
| `sounds-discovery.js` | 16 | Finding a sound, and stopping it |
| `apnea-screening.js` | 16 | Apnea screening |
| `motherhood-auth-race.js` | 15 | The unlock race, real module, real WebCrypto |
| `storage-guard-patch-preview.js` | 12 | The storage guard as applied |
| `storage-guard-preflight.js` | 9 | Every shape of unreadable saved state |
| `storage-schema-guard.js` | 5 | That a refused save really writes nothing |
| `persistent-audio-lifecycle.js` | 4 | Sound outliving the screen that started it |
| `praytimes-reference.js` | 0 | Network-backed reference script, not a suite |
| `verify-prayer-times.js` | 0 | Network-backed reference script, not a suite |
| `trailer.js` | 0 | Recording script; writes the trailer, asserts nothing |
| **Total** | **2043** | |

`trailer.js` is listed at 0 because it is a **recording script**, not a
suite: it drives the app to produce `trailer/sleepsphere-trailer.webm` and
makes no assertions. The previous edition of this document listed it as
the one unclean suite and left it there. It was broken in two places, both
in the script and neither in the app — it clicked a navigation tab that
the consolidation to four destinations had removed, and it pinned the clock
to a bedtime hour at which the app correctly hides the button the trailer's
central beat clicks. Both are fixed in `952b6e8`; it now runs end to end
with no page errors.

## Per file, `tests/`

All 13 exit zero. They print a single summary line each rather than one
line per check, so they contribute no count to the total above.

| File | What it covers |
|---|---|
| `motherhood-auth-cancellation.test.js` | Lock cancels creation and unlock, at each await |
| `motherhood-unlock-lock-race.test.js` | A pending unlock never restores a locked vault |
| `motherhood-pending-background.test.js` | Backgrounding cancels authentication in flight |
| `motherhood-pending-unlock-race.test.js` | The generation token exists and is checked |
| `motherhood-background-lock.test.js` | The background-lock lifecycle |
| `motherhood-erase-lock-order.test.js` | Erase locks before it clears, and persist refuses |
| `audio-controller.test.js` | The audio controller |
| `audio-mixer-state.test.js` | The mixer never claims Playing falsely |
| `research-export-privacy.test.js` | No participant free text in the study CSV |
| `research-dashboard-csv.test.js` | The dashboard CSV parser |
| `research-dashboard-csv-hardening.test.js` | Malformed and NUL-containing fields |
| `research-dashboard-import-integrity.test.js` | Conflicting overwrites and invalid dates |
| `research-dashboard-safe.test.js` | The minimised-data dashboard drops extra columns |

---

## Verified beyond the suite

Three scripted browser passes were run against the preview build in addition
to the suite.

**These three passes are from 13 October and have not been re-run since.**
They are kept because what they measured still holds and the measurements
were real, but they are evidence for that date, not for the run at the top
of this document. The figures below should be read as such.

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
