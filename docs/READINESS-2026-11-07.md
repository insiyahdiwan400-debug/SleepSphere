# Readiness audit — 7 November 2026

Read-only. **No application code was changed.** Branch
`build/smart-assist-nov18` at `2f6ee7f`.

---

## 0. First: where the work was

This session began in a rebuilt container checked out on
`claude/sleepsphere-repo-organize-4mdjje`, which holds only the original
seven-file upload — no application, no tests. Nothing was lost:
`build/smart-assist-nov18` was intact on the remote at `2f6ee7f` and was
fetched back. The only casualty is the previous container's test logs,
which matters for one item in §3.

---

## 1. What is fully functional and verified

Verified by driving the application in this session, not inferred from
code:

| Area | Evidence |
|---|---|
| **First-run onboarding** | Cold open lands on the 3-step product sequence (panel 4 of 6; steps 1–3 are the study's and are never shown). No prototype, research or participant language anywhere in the text. No console errors. Three taps → `today`, `onboarded=true`, **`enrolled=false`** |
| **Consumer / research separation** | `test/study-gate.js` 24/24. `?study=1` enrols nobody, writes one key of its own, sends nothing off-origin, exports nothing without a tap, and a `?study=1 → ?study=0` round trip returns stored state byte-identically |
| **Audio lifecycle** | Context walks `none → running → suspended → running`. Stop closes the sheet. **Two rapid taps produce one session, not two.** `test/assist.js` 94/94 |
| **Wind-down across navigation** | Survives moving between views |
| **Wind-down across reload** | Sheet closes, button returns to "Start my wind-down". The app does **not** claim a session that is no longer running |
| **Saved data** | A morning record survives a full reload **byte-identically** (`save()` returns true; stored string unchanged) |
| **Private vault** | Tab reads "◉ Private". Locked on cold open. **No localStorage key names the feature**; no plaintext private words in storage. `test/motherhood*.js` 216 assertions |
| **Offline / failed network** | With **every** sibling JS and CSS request blocked, the app still renders, `window.SS` exists, and there are **zero** page errors |
| **Navigation integrity** | 15 views, 5 nav destinations, **no orphan views**, **no dead controls** |
| **Sky footage (newly verifiable)** | See §5 — it now plays, and this was previously impossible to test here |

Feature suites all green: My Rhythm 50, My Rest/Today 120, Explore 50,
Flight Mode 61 + 22, Sabat 31, duʿāʾ 83, Motherhood 216, storage 37.

---

## 2. What is incomplete or broken

### P1 — Prototype residue reachable by a consumer. Two defects, both reproduced.

**P1-a · A returning user can be shown a "Private prototype" dialog.**

`settings.welcomeSeen` defaults to `false`. `shapeState` spreads
defaults over stored settings, so **any saved state that predates that
key** — an existing user upgrading — evaluates `!welcomeSeen` as true
and opens `#welcomeOverlay`, which reads:

> **PRIVATE PROTOTYPE • ABOUT 30 SECONDS TO START**
> … This is an early research prototype, not a medical device.

It also carries the numbered "1 Check today / 2 Plan tonight / 3 Return
tomorrow" strip that was removed from the home screen.

New users are unaffected — `skipFieldwork()` sets the flag. **This is
exactly the device state a demonstration is most likely to be filmed
on**: one that already had the app installed.

*Reproduced:* deleted `welcomeSeen` from a saved state, reloaded,
overlay appeared.

**P1-b · The research validation screen is reachable from the consumer
UI.**

The `#test` view contains "Prototype validation", "Three things to
test", and "**Tester notice:** This is a functioning research
prototype, not a medical device or a finished clinical intervention."

Two controls route there. `Give feedback` is correctly
`data-study-only` and hidden. **`Try another look` (`#goVariants`) is
not gated and is visible** in the "Also here" row on My Rest.

*Reproduced:* `studyOnly=false visibleNow=true`.

### P2 — Two test-suite defects. Neither is an application fault.

**P2-a · `test/living-sky.js` asserts an environment limitation that no
longer exists.**

The suite contains a context assertion that this browser **cannot**
decode H.264. That was true when it was written. **It is no longer
true**: this container's Chromium now returns `"probably"` for
`avc1.42E01E`. The suite fails on its own premise while the application
is fine.

This is the most valuable finding in the audit, because it means the
sky footage can now actually be tested here — see §5.

**P2-b · Two suites are load-sensitive flakes.**

| suite | alone | in a full parallel run |
|---|---|---|
| `test/anwar.js` | **46/46 pass** | failed this run: "Everything that went up comes back down :: 5" |
| `test/explore.js` | passes | **passed this run**; failed the previous run |

They alternate. Both are teardown/timing races under concurrent browser
load, not product defects.

On `explore.js` specifically, I want to be accurate: **I could not
reproduce the failure**, including under deliberate concurrent load, and
the previous run's log died with the old container. Reading the code,
the *teardown* `evaluate` is guarded with `.catch(() => {})` but the
three `evaluate` calls that read tile state immediately before it are
**not** — and those run exactly where Flight Mode reloads the page. That
is the plausible mechanism and matches the suite's own comment ("roughly
one run in six"), but it is a hypothesis, not a diagnosis. `anwar.js`
failing this run rather than `explore.js` supports the general
load-race reading.

---

## 3. What I fixed

**Nothing.** The instruction was a read-only audit first, so no
application file was modified. §6 is the plan awaiting approval.

Files added this session: this document only.

---

## 4. Regression results

Full run, both suite directories, against `2f6ee7f`:

```
68 suites run
66 passed
 2 failed   test/anwar.js      (load flake — 46/46 alone)
            test/living-sky.js (stale environment assumption, not an app bug)
2470 assertions passed
```

Excluded by the runner, deliberately: `test/trailer.js` (regenerates a
tracked MP4) and `test/verify-prayer-times.js` (hits a live API; the
offline transcription in `praytimes-reference.js` runs instead and
passes).

The 2470 counts assertions printing a `PASS` line. The nineteen
`node:assert` suites in `tests/` mostly print nothing and pass by
exiting zero, so they count as suites, not assertions.

**This branch is not fully green and I am not describing it as such.**
Two suites are red. Neither indicates a broken feature, and the reasons
are above.

---

## 5. What requires testing on real devices

The ground shifted here, in a good way.

**No longer device-only.** H.264 decode was listed as unverifiable. This
container now decodes it, and the shipped footage was driven
end-to-end this session:

```
status: "playing"   currentTime: 8.87   readyState: 4   paused: false
src: "night-sky.mp4"   credit rendered   errors: none
```

So the footage layer, its fail-closed adapter and its attribution are
now **verified in a desktop browser**. That is not an iPhone, but it is
no longer a blank.

**Still genuinely device-only — none of this can be claimed from here:**

1. **Audio with the screen locked.** The single most important one for a
   sleep app. Does the wind-down keep playing when the phone locks, and
   does the timer still fade it out? Headless cannot answer this.
2. **iOS AudioContext unlock on a real tap.** Safari's gesture rules
   differ from Chromium's, and this container runs with
   `--autoplay-policy=no-user-gesture-required`.
3. **H.264 on iPhone Safari specifically.** Verified on desktop
   Chromium ≠ verified on an iPhone.
4. **PWA install, Home Screen launch, standalone mode, safe areas** on a
   notched device.
5. **Real audio output** — that sound reaches a speaker and headphones,
   at a sane level. Nothing headless hears anything.
6. **Background/foreground transitions** — returning after minutes away.
7. **Touch feel** — scroll momentum, tap targets under a real thumb.
8. **Battery over a full wind-down** on real hardware.

---

## 6. Prioritized action plan — awaiting your approval

Nothing below has been done.

### P1 — Blocks the demonstration. Small, contained.

**1. Gate the legacy welcome overlay** *(`index.html`, ~1 line)*
Treat an onboarded user as having seen the welcome. The overlay stops
appearing for upgrading users; the `?tester=1` hook is untouched.
*Risk: very low. Removes a path, adds none.*

**2. Gate "Try another look"** *(`index.html`, 1 attribute)*
Add `data-study-only` to `#goVariants`, as `Give feedback` already has.
The tester view stays in the build and stays reachable in study mode.
*Risk: very low.*

I would also propose, and will not do without a separate yes: removing
the "prototype"/"not a medical device" wording from the welcome overlay
itself, so it is safe even if some path reaches it. That is copy on a
screen carrying a **legitimate safety disclosure**, so I would rather
you decide the wording than have me rewrite a medical-adjacent
statement unilaterally.

### P2 — Test integrity. No application change.

**3. Correct `test/living-sky.js`'s environment assumption**
*(`test/living-sky.js`)*
Make the H.264 context assertion *detect* the capability instead of
asserting its absence, and run the real playback checks when it is
present. This turns a stale limitation into live coverage — the suite
would then genuinely prove the shipped footage plays.
*Risk: low; it only strengthens the suite.*

**4. Guard the unguarded `evaluate` calls in `test/explore.js`**
*(`test/explore.js`, 3 calls)*
Wrap the three tile-state reads the way the teardown already is, so a
mid-loop reload reports the tile honestly instead of failing the suite.
**Application behaviour unchanged** — Flight Mode keeps reloading,
because that is what it does.
*Caveat, stated plainly: since I cannot reproduce the failure, I cannot
promise this fixes it. I would run the suite repeatedly afterwards and
report the actual pass rate rather than declare it solved.*

**5. Investigate `test/anwar.js`'s bird-descent race**
*(`test/anwar.js`)*
Passes alone, fails under load. Likely a fixed wall-clock wait where a
poll is needed — the same class of defect already fixed in
`test/flight-cabin.js`. Diagnose before proposing a change.

### P3 — Before any release, not before the demonstration

**6. A device pass against the §5 list**, with results recorded as
measured rather than assumed. Item 1 (audio with the screen locked) is
the one I would do first; if that fails, it is a release blocker for a
sleep application.

---

## 7. What still prevents a production release

1. **The §5 device list is entirely unverified.** For a sleep app,
   audio-with-screen-locked is a genuine blocker until someone checks it.
2. **Two red suites.** Both explained, neither a feature fault, but a
   release should go out green.
3. **P1-a and P1-b** put prototype language in front of returning users.
4. **The sky is explicitly temporary** and awaiting approved footage;
   `docs/SKY-INTEGRATION.md` holds the contract.
5. **Half the day has no sky footage** — `dawn`, `morning` and `day`
   report `unavailable` and fall back to the drawn sky. Honest, and
   still a gap.

Nothing has been merged, deployed, or deleted. No user data was touched.
