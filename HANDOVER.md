# SleepSphere — handover

Written 8 October 2026. Everything below is verified, not assumed; where
something is uncertain it says so.

---

## 1. Repository and branches

| | |
|---|---|
| Repository | https://github.com/insiyahdiwan400-debug/SleepSphere |
| **Development branch (current work)** | `claude/sleepsphere-recording-integrity` |
| Latest pushed commit | **`d5ba841`** — *Prove the round trip instead of simulating it* |
| Production branch (**deploys on push**) | `claude/sleepsphere-repo-organize-4mdjje`, at `567bd46` |
| Default branch | `main`, at `e4deb36` — unrelated manual uploads, not the app |

### Deployment rules — read before pushing anything

Netlify site **`sleepsphere1809`**, Git-connected. There is **no
`netlify.toml` and no `.github/`**, so every build rule is server-side and
cannot be read from a dev container.

Established empirically:

- Pushing `claude/sleepsphere-repo-organize-4mdjje` **deploys production
  within ~2 minutes**. Verified by byte-comparing the served `index.html`
  against the commit.
- `main--sleepsphere1809.netlify.app` → **404**. `main` exists on the remote
  and has no branch deploy, so this site does not build arbitrary branches.
- `claude-sleepsphere-recording-integrity--sleepsphere1809.netlify.app` →
  **404** after two pushes. The dev branch deploys nowhere.
- Production was byte-identical before and after every dev-branch push
  (`286b397d3669f002d5ac156bc7b717f6` throughout).
- PR #1 (`claude/sleepsphere-repo-organize-4mdjje` → `main`) is **open** and
  produces a password-protected Deploy Preview (401). It is unrelated to this
  work; do not assume it should be merged.

**Verification procedure for any future push** — do all three:

```bash
curl -s https://sleepsphere1809.netlify.app/index.html | md5sum   # before
git push origin HEAD:refs/heads/<branch>
git ls-remote --heads origin                                     # hash landed
curl -s https://sleepsphere1809.netlify.app/index.html | md5sum   # unchanged?
```

Production byte-compares to the commit plus exactly **114 bytes** of Netlify
injection: a rewritten `data-netlify` form tag and one HUD `<script>`. Four
diff lines, nothing else.

**This session's Git credentials accept `claude/*` branch refs but refuse
tag pushes with HTTP 403** (not an egress-policy denial —
`recentRelayFailures` was empty). Back work up by branch, not by tag.

---

## 2. What is complete

### Phase 1B — schedule feasibility (`567bd46`, live in production)

`buildNight()` stays pure and clock-only. Three functions, in this order,
never merged:

```
nightEvents(plan)       ideal night as ordered clock events + day offsets
nightFrame(plan, now)   those events dated inside the correct night
fitNight(plan, now)     the actionable night, from both plus now
```

**The order is the design.** A clock string cannot be dated alone: asking
"when is 19:12?" before "which night is this plan?" yields tomorrow's 19:12,
which is how a passed instruction came back wearing a future timestamp. The
night anchor is chosen **from the end** — the earliest candidate evening whose
last event is at or after `now` — so a passed event stays attached to its own
night. At 00:10 that resolves to *yesterday* evening.

There is deliberately **no `at(clock)` helper anywhere**, asserted by a
source-level test.

Four internal states, never shown to participants: `AMPLE`, `COMPRESSED`,
`LATE`, `MINIMAL`. Compression gives up settle before wind-down, never
proportionally. Bed moves later only when under `MIN_WIND` of runway remains,
and earlier only to absorb a spring-forward clock change.

### Recording integrity, Stage 1 (`03f0dec`)

Fixes the incident where a bed time stamped at 18:17 in daylight plus an app
opened at 10:21 produced a 16 h 4 m night, 14 h 43 m of "sleep", and a
Restoration Twin interpreting it.

- **Flags** are *derived, never stored* — `long-opportunity` (>14 h),
  `daytime-bedtime` (12:00–19:00), `wake-inferred`, `wake-estimated`,
  `sleep-unknown`, `times-inferred`. Computed on read, so a record already on
  disk is recognised without editing the evidence.
- **Verification** is what the participant said: `confirmed`, `corrected`,
  `entered`, `uncertain`, `times-only`, `unverified`. It outranks flags in
  both directions.
- **`unverified` is deliberately not `untrusted`.** Months of ordinary
  one-tap nights were never confirmed and still count; excluding them would
  erase a participant's history to fix one night.
- The morning card asks about the **times first**; the rating row does not
  exist until they are answered.
- A provisional wake time is **taken once** — dismissing with "Not now" and
  reopening the next day no longer replaces a real 10:21.
- The early-night question no longer requires a saved plan, and daylight asks
  outright.
- `trustedMornings()` replaced `realMornings()` at **nine** calculation
  sites, including `typicalLatency`/`typicalAwake`, which closes the feedback
  loop that let a bad night become the next night's estimate.

### Supersession (`518f44a`, `d5ba841`)

Correcting a night previously **deleted** the original and reused its id.

**Design decision that matters most:** superseded versions go into
`state.morningRevisions`, **out of `state.mornings` entirely**. An audit of
all **26** direct `state.mornings` readers found that the phase engine, the
arc legend, the week strip, three experiment calculations, both exports and
the import validator read the array *without* going through
`realMornings()`. Keeping archived records in it would mean teaching 20 sites
to skip them, and one missed site silently resurrects a corrected night into
a trend. Out of the array there is nothing to miss: **zero read sites
changed**, and "both versions must never count" holds structurally.

Each correction gets a **new `uid()`**; the archived copy gains
`supersededBy` + `supersededAt`; the new record carries `supersedes`.
Repeated corrections chain in both directions. Experiment `baselineIds`
follow the correction so pointers never dangle.

Participant-facing copy: *"Updated. Your patterns now use these times; the
earlier version is kept in your backup."* The word *supersede* appears
nowhere a participant can see — asserted by a test.

---

## 3. Tests

```
recording          128      fieldwork          153      storage             10
context             96      dua                 83      night               65
build-night        137      living-night        94      night-state         89
lazy-mode           26      screen-shapes       24      deep-links          17
prayer-ui           17      feedback            19      apnea-screening     16
starfield           25      fatimi-convention   43      feasibility        136

18 SUITES   1178 CHECKS   0 FAILING
```

Run one suite: `node test/<name>.js`. **A static server must be running
first:** `python3 -m http.server 8099`. Playwright lives at
`/opt/node22/lib/node_modules/playwright`, Chromium at
`/opt/pw-browsers/chromium`.

Run them in groups of 4–6; a single shell running all 18 has been killed by
background time limits in this environment.

### Test-writing traps already hit — do not repeat

1. **Don't find a CSV row by date substring.** Every row carries
   `exported_at`, so on a day whose export date equals the night's date a
   substring match silently returns day one. Parse the `date` column.
2. **Don't take "today" from the test runner** while the page clock is
   frozen. One check passed only while Node's date and the frozen date
   agreed, and broke the first time the suite ran after midnight UTC.
3. **fps thresholds must be ratios** against the same page moments earlier,
   never absolute — the identical build scored 59 fps one hour and 33 the
   next.
4. `#saveMorning` sits inside a collapsed `<details id="morningForm">`.
   Playwright sees it as not visible; set `.open = true` or use
   `page.evaluate(() => …click())`.
5. `morning` is **not** one of the four nav tabs; it is an internal view.

---

## 4. Known bugs and unfinished work

### Not bugs, but deliberate gaps

- **Fragmented sleep cannot be represented.** The record is four scalars
  (`bedTime`, `sleepTime`, `wakeTime`, `awakeMinutes`) with no interval array.
  The planner *can* model a Fajr bridge (`mode:'fajr'`, `blockOne`,
  `blockTwo`, `returnSleep`, `awakeBridge`); the recorder cannot capture
  whether it happened. For the Jamea cohort that is the central measurement.
  Mitigated for now by the "I can't say how much I slept" checkbox →
  `verified: 'times-only'`, sleep figures `null`.
- **`times-only` is excluded from calculations wholesale**, even though its
  bed/wake times are known and would be valid for drift and regularity.
  Per-field trust was judged Stage 2 scope.
- **The Living Night cannot host a "Rebuild from now" control.** Measured:
  the bed time only moves inside the last 15 minutes before it, and that
  screen has given its controls row back by then — the windows overlap by
  about one minute. Rebuilding lives in the plan pane instead.

### Watch items

- `archiveMorning` mutates `state.activeExperiment` and
  `state.experimentHistory` as a side effect of saving a morning. Tested in
  three directions, but it is the piece most deserving a second pair of eyes.
- `supersedeWithoutAsking` and `finishingLazyNight` are module-level flags
  set and cleared synchronously around one `.click()`. Safe today; they would
  need rethinking if that save path ever became async.
- `nightDateFor()` and `studyToday()` key on the **UTC** date slice. Correct
  for the study's "which day is this" question, but a participant far from UTC
  waking near midnight is an edge worth re-checking.
- `morningRevisions` grows one entry per correction. Negligible in size, but
  it rides in the full JSON backup.

### The participant's October 8 record

**Not corrected — deliberately left for the participant to enter after
deployment.** When they do, the mechanism preserves:

```
archived : bed 18:17  wake 10:21  opportunity 964  sleep 883   id oct8
live     : bed 01:20  wake 09:55  opportunity 515  sleep null  verified times-only
```

Their recollection (several awakenings, approximate times) is explicitly
*not* an objectively measured record, which is why the sleep total stays
unknown rather than being computed as 8 h 35 m.

---

## 5. Research schema and compatibility

| | |
|---|---|
| `SCHEMA_VERSION` | **3** — unchanged by all of this work |
| `APP_VERSION` / cohort | `jamea-v1` |
| Study CSV columns | **50** — none added, renamed, reordered or removed |
| Storage key | `sleepsphere_state_v2` |

### Keys added (all additive and optional)

On a morning record: `verified`, `wakeSource`, `bedSource`, `supersedes`.
On an archived record, additionally: `supersededBy`, `supersededAt`.
On state: `morningRevisions: []`.

Records and states written before this work have none of them and read
correctly: a record with no `verified` reads `unverified` when `lazy`/`quick`
and `entered` otherwise; absent `morningRevisions` reads as "no corrections".

### The one value change on re-export

`value_basis` gains appended clauses. **Nothing is rewritten or removed.**

| Record type | Before | After |
|---|---|---|
| Full-form | `all entered` | `all entered` — identical |
| Ordinary one-tap | `measured: …; estimated: …` | `… ; verification: unverified` |
| Doubted | same | `… ; verification: …; excluded from this participant's averages; unusual: …; wake from: app-open` |

A parser matching `"all entered"` exactly is unaffected; one matching the
lazy string exactly will stop matching. Already-downloaded files are
untouched.

### Corrections and the CSV

**Each CSV row is the current authoritative version of a participant-day.**
Superseded versions are *not* in the CSV; the full history is in the JSON
export under `morningRevisions`, linked by `supersedes` / `supersededBy`.
This is stated in the shipped data dictionary as a `(note) corrections` row
— which lives in `studyDictionaryCsv()` and **not** in `STUDY_COLUMNS`,
because `STUDY_COLUMNS` builds the data header too and putting it there
turned a documentation line into a 51st column.

### Validated and not to be touched

The Fatimi prayer convention — Fajr 17.7°, Maghrib at sunset, nisf al-layl
to sunrise, ~2 min ihtiyat on end times — is verified against a Dubai Dawat
timetable and two independent references. 43 checks in
`test/fatimi-convention.js`. Fajr must come only from that engine; the
feasibility layer contains no prayer arithmetic, asserted at source level.

---

## 6. Exact next development steps

1. **Deploy the recording-integrity work** — needs the participant's
   approval. It is a fast-forward: merge
   `claude/sleepsphere-recording-integrity` into
   `claude/sleepsphere-repo-organize-4mdjje` and push. That **will** deploy
   production. Verify by byte-comparing served bytes to the commit, then have
   the participant fully close and reopen the Home Screen app once (the
   service worker is network-first with `cache: 'no-store'` for navigations,
   so one reopen suffices; `sw.js` is unchanged, so no activation wait).
2. **Participant enters the October 8 correction themselves** and confirms
   the archived original is preserved.
3. **Stage 2 — Fajr-aware fragmented sleep.** Designed and approved in
   direction, *not* implemented. Interval model:
   `segments: [{from, to, kind: 'asleep'|'awake'|'unknown', certainty:
   'reported'|'estimated'}]`, with *time in bed*, *sleep opportunity*,
   *reported sleep*, *estimated sleep*, *known awake* and *unknown* all
   derived separately and never conflated. Morning flow: show the timeline,
   "Are these times right?", then only on a Fajr-planned night "Did you wake
   for Fajr and return to sleep?". "I don't remember" must be a recordable
   answer that exports as unknown. This is where a schema change becomes
   unavoidable — it needs `SCHEMA_VERSION` 4, new dictionary rows, and a
   decision about new CSV columns.
4. **Then, and only then:** Phase 1C, Travel, Women's Space, Parent Mode,
   Living Dawn, notifications. None started.

**Fieldwork starts 20 October 2026.** Recording integrity was prioritised
over features for that reason.

---

## 7. Working practices this project expects

- **Audit before changing.** Every fix in this work began with a
  reproduction, not a hypothesis. The 18:17 incident was reproduced to six
  matching values before a line was edited.
- **Never rewrite a test to get green.** Two existing tests in this work
  encoded the defect as intended behaviour — `test/night-state.js` literally
  asserted that no early-night question was asked at 18:17 with no plan. Both
  were inverted *with the old reasoning kept in the file* so nobody restores
  them. A third was found to have silently stopped running (a WCAG contrast
  check returned `null` for a hidden element) and was repaired as a bug.
- **Verify deploys by comparing served bytes to the commit**, never by
  trusting that a push succeeded.
- **No medical or therapeutic claims.** No copy may promise the participant
  will wake fresh, restored, recovered or focused. Thresholds like
  `MIN_NIGHT = 120` are documented as product/UX conventions, explicitly not
  sleep-science thresholds.
- **The container is ephemeral.** Commit `9bd2c46` was lost when a container
  was reclaimed before it was pushed, and had to be reconstructed. Push to
  the dev branch early.

### Key constants

```js
MIN_WIND = 15                  // smallest wind-down the product offers
SHORTFALL_TOLERANCE = 15       // the plan's own granularity; not a health figure
MIN_NIGHT = 120                // existing checkLazyMorning convention
MINIMAL_FLOOR = 135
MAX_PLAUSIBLE_OPPORTUNITY = 840
DAYTIME_BED_FROM = 720, DAYTIME_BED_TO = 1140
```

### Test hooks on `window`

`__phase` `__anchors` `__dusk` `__dua` `__buildNight` `__nightKnowledge`
`__nightShape` `__planFinalWake` `__planRequiredBy` `__nightEvents`
`__nightFrame` `__fitNight` `__recordFlags` `__recordVerification`
`__recordTrusted` `__trustedMornings` `__nightIsEarly` `__integrity`
`__revisions` `__chain` `__intention` `__journeyText` `__provenance`
`__deepLink` `__starProbe` `__prayerProbe` `__applySky`
