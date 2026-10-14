# SleepSphere 2.0 — UX architecture proposal

Proposal only. No code has changed.

> **SleepSphere knows a lot. The user has to do very little.**

---

## 1. The diagnosis, measured

The visual review was right and the fix is not visual. I drove the shipped
app at 390×844 and counted. These are measurements, not impressions.

| Screen | Visible buttons | In the first screenful | Fields | Scroll | Words | Invented terms |
|---|---|---|---|---|---|---|
| Today · dawn | 13 | 5 | 1 | 3.2 screens | 218 | 4 |
| Today · day | 13 | 5 | 1 | 3.1 screens | 212 | 4 |
| **Today · evening** | **32** | 3 | 1 | 3.3 screens | 269 | 4 |
| Today · evening (no plan) | 31 | 2 | 1 | 3.3 screens | 224 | 4 |
| **Today · night** | **1** | **1** | **0** | **1.0 screen** | **17** | **0** |
| My pattern | 5 | 3 | 0 | 3.1 screens | 281 | 6 |
| **Explore** | 18 | **0** | 0 | **6.9 screens** | **772** | 6 |
| Me | 14 | 7 | 5 | 4.0 screens | 317 | 3 |

Whole-app totals: **220 buttons, 48 inputs, 30 selects, 5 textareas, 120
cards, 409 element ids, 12 top-level views behind 4 tabs, 8 full-screen
overlays.**

Three things follow immediately.

**The evening Today screen offers 32 buttons.** Five of them read as
primary: *Build my night*, *Clear my mind*, *Record morning*, *Too tired —
just go to bed*, *Plan tonight around this*. A person arriving at 20:40 has
to decide which of five things they are doing before they can do anything.
That is the overwhelm. It is not the colour.

**Explore is 6.9 screens of reading with zero actions in the first
screenful.** It is a library that has been given a tab.

**The bedtime screen is already the product.** One button, 17 words, one
screenful, no invented vocabulary. It is the only screen in the app that
obeys the product principle — and it is the screen people consistently like.
It is not an exception to aspire away from. **It is the specification.**

### The first run

A new device meets four blocking gates before it can use anything: the
opening āyah, the welcome overlay, a six-step fieldwork onboarding, and the
install sheet. Nine-plus screens before the first useful act.

### The vocabulary

The app has invented at least sixteen proper nouns a user must learn:
Restoration Twin · Sabat Compass · Bio Harmony · Restoration need ·
Restoration gap · Personal night signature · Twin interpretation · Cautious
pattern finder · Experiment contract · Live evaluation · 60-second context
scan · Live estimate · Fajr Bridge · Lazy Mode · Leave-phone mode · One
responsive move.

Every one is a thing to be taught. The app currently teaches them with cards
titled *How the compass is calculated*, *What the twin can say*, *What it
cannot say*, *Why not a single sleep score?* — which is the tell: an
interface that needs this much explanation is an interface that is asking
too much.

---

## 2. What the user actually needs

Four things, every day, in under a minute total:

1. **Tonight is handled.** Tell me when to wind down. Don't make me design it.
2. **Last night is logged.** Three taps, no arithmetic, no clock-reading.
3. **Am I doing better?** One sentence. Not a chart I have to interpret.
4. **That won't work tonight.** Change one thing without rebuilding.

Everything else in the app is either (a) the engine doing its job invisibly,
(b) research instrumentation the participant did not ask for, or (c) a
feature that exists because it was interesting to build.

### Classification of every surface

**Keep, in the everyday interface**

| Surface | Why |
|---|---|
| Tonight's plan + wind-down time | The core promise |
| Goodnight / bedtime screen | Already correct; becomes the template |
| Morning record (short form) | 4 steps; the daily habit |
| Dua / settling ritual | Jamea-specific, loved, one tap |
| "Too tired — just go to bed" (Lazy Mode) | The honesty valve; rename |
| One progress sentence | Replaces the Twin as the everyday answer |
| Fajr handling | Invisible. Calculated, never configured |

**Demote to "Details" — reachable, never in the way**

| Surface | Where it goes |
|---|---|
| Full morning form (10 steps) | Behind "Change something" on a record |
| Night plan editor (12 inputs, 5 selects) | Behind "Adjust" → "Set it myself" |
| Charts, 7-night axis, trend | Behind the progress sentence |
| Prayer-time settings, coordinates, high-latitude rule | You → Prayer times |
| Export, backup, erase, participant code | You → Your data |

**Move to Research mode — off for ordinary users, on for the study**

| Surface | Note |
|---|---|
| Bio Harmony (10 cards, 8 selects) | **Feeds 8 export columns — cannot be deleted** |
| Experiment studio (14 cards) | **Feeds 3 export columns — cannot be deleted** |
| Sabat Compass (14 cards) | Explanatory; no export dependency |
| Brain Day picker | Feeds `brain_day`; can be inferred or asked once a week |
| Fieldwork onboarding | Only for enrolled participants |

**Challenge — I propose cutting these from the product**

| Surface | Cost now | My recommendation |
|---|---|---|
| **Explore tab as a reading library** | 6.9 screens, 772 words, 18 buttons, 0 actions above the fold | Cut the library. Keep ~6 short answers surfaced *at the moment of the question*, not in a tab. |
| **Travel / jet-lag planner** | Own view, 6 cards, 4 inputs, 3 selects | Cut from v1. A fortnight study of student sleep does not need a jet-lag engine. Engine code stays, unreferenced. |
| **Apnea screening** | Own view, 28 buttons, 8 inputs | Cut from everyday UI. It is a clinical questionnaire wearing an app screen; it belongs behind a single "Something feels wrong" entry, if at all. |
| **Clear my mind / unload timer** | 8 buttons, 3-5-10-minute timer, note field | Cut as a destination. Keep one line in the bedtime screen: a note field, no timer, no ceremony. |
| **"60-second context scan" on Today** | The single largest contributor to the 32 buttons — it renders 1-5 scales inline | Remove from Today entirely. This is what makes the evening screen unusable. |
| **Bio Harmony as a daily ask** | 8 selects, a "visible arithmetic" formula panel | Keep the data path for the export; stop asking for it daily. |
| **"Share prototype" and the dim toggle** | Permanent chrome on every screen | Move into You. |

Cutting is removal from the interface, never from the repository: the
engines, the data and the export columns stay exactly where they are. See
section 6.

---

## 3. The four destinations

| Tab | One job | Everyday content |
|---|---|---|
| **Today** | The one thing to do right now | One sentence, one action. Nothing else. |
| **My Sleep** | Am I doing better? | One sentence, one small chart, last seven nights. |
| **Discover** | Answer the question I just had | 5–6 short answers, surfaced contextually; no reading list. |
| **You** | Settings, data, prayer times, research | Plain list. The only place with density, and nobody lives here. |

Today is a **single-decision screen in every state**. If a state needs two
actions, one of them is wrong or belongs a layer down.

---

## 4. The four journeys

Tap budgets are the acceptance criteria in section 8. Current cost measured
from the shipped app.

### A. Plan a night — target **2 taps** (now: 5 decisions across a multi-pane flow)

```
Today (evening)
  "Tonight: wind down at 9:50, asleep by 10:20."
  [ Use this ]                    ← tap 1, done
  Adjust                          ← quiet link
```

The plan is **already calculated** before the user arrives — the engine
knows their usual wake, their Fajr, their obligations. The default is
presented as a statement, not assembled through questions. The questions
the build flow asks today (brain day, obligation, after-Fajr) move to
*Adjust*, and to one weekly ask rather than a nightly one.

If nothing is unusual, the user taps once and the night is set.

### B. Record sleep — target **4 taps, under 30 seconds** (now: 4 steps short / 10 steps full)

```
Today (morning)
  "How did last night leave you?"
  ● ● ● ● ●   rested              ← tap 1
  ● ● ● ● ●   energy              ← tap 2
  ● ● ● ● ●   focus               ← tap 3
  [ Done ]                        ← tap 4
  Something was different →       ← quiet link, opens the 10-step form
```

Times come from the plan, and the record says so — the existing
`entry_method` / `value_basis` honesty applies unchanged. **No clock
arithmetic is ever asked of the user on the daily path.**

### C. Check progress — target **1 tap, no scrolling for the answer**

```
My Sleep
  "You're sleeping about 40 minutes longer than your first week,
   and waking less often."
  [ seven-night strip ]
  Last night · 7h 10m · felt 4/5
  See more →
```

One sentence first, in plain language, with the chart as evidence
underneath — not a chart with the meaning left to the reader. "Restoration
Twin", "Sabat Compass" and "night signature" do not appear.

### D. Adjust a plan — target **3 taps**

```
Today → Adjust
  What's different tonight?
  [ I'll be up later ]  [ Early start ]  [ Exam tomorrow ]  [ Set it myself ]
                                              ← tap 2
  "Then: wind down 10:40, asleep by 11:10."
  [ Use this ]                                ← tap 3
```

Four named situations cover most real cases. *Set it myself* opens the
existing full planner untouched.

---

## 5. Progressive disclosure — the rule

Three layers, and a surface may only ever show one of them at a time.

1. **The statement.** What the app has decided, in a sentence. One action.
2. **The handle.** One quiet link — *Adjust*, *Something was different*,
   *See more*. Never a row of equal-weight buttons.
3. **The detail.** The existing screens, reached deliberately, unchanged.

Rules that make it enforceable, and testable:

- **One primary action per screen.** Not two.
- **The primary action is reachable without scrolling**, at 320px width.
- **Never explain a thing before the user has met it.** Delete every "how
  this is calculated" card from the everyday path; keep them one tap down.
- **Never ask what can be derived.** Times come from the plan. Fajr comes
  from the engine. Brain Day is asked weekly, not nightly.
- **A name must be worth its tuition.** If a feature needs a card to explain
  its name, it loses the name.

### Terminology

| Now | Proposed |
|---|---|
| Restoration Twin / My pattern | **My Sleep** |
| Sabat Compass | *(removed from the interface)* |
| Bio Harmony | **Daily check-in** (research mode only) |
| Restoration need | **How much sleep you need** |
| Restoration gap | **The difference** |
| Personal night signature | *(removed)* |
| 60-second context scan | *(removed from Today)* |
| Fajr Bridge | **Sleep around Fajr** |
| Lazy Mode / "Too tired — just go to bed" | **Just go to bed** |
| Leave-phone mode | **Put the phone down** |
| Experiment / adherence / contract | **Try one change** (research mode) |

---

## 6. Migration — separating the interface from the engines

The constraint is absolute: recording integrity, Fajr calculation,
participant records, `SCHEMA_VERSION = 3`, the 50-column export, the privacy
boundaries and the Motherhood work all survive untouched. The way to
guarantee that is to **not touch them at all.**

**Step 1 — name the boundary, move nothing.** The calculation code already
exists as pure-ish functions inside the one IIFE: `buildNight`, `fitNight`,
`nightShape`, `resolvePhase`, prayer times, `recordFlags`,
`recordVerification`, `sleepMinutesOf`, `withSleepDuration`, `archiveMorning`,
`correctionChain`, `studyCsv`. Expose them through one explicit internal
surface — `SS.engine.*` — in their current location. No logic moves, no
behaviour changes, and the existing suites keep passing as the proof.

**Step 2 — build the new interface against that surface only.** The new UI
may call `SS.engine.*` and read `state`. It may not reimplement a
calculation, reach into a DOM id owned by the old UI, or write a record by
any path other than the existing one. Any new rendering that needs a number
the engine doesn't expose is a signal to extend the engine surface
deliberately, not to compute it in the view.

**Step 3 — ship both, switch with a flag.** `state.settings.ui = 'classic'`
(default) or `'calm'`. Both interfaces read the same state and write through
the same recording path, so a participant can be moved either way with no
migration and nothing to convert. **No localStorage migration, no schema
bump, no onboarding reset.**

**Step 4 — the old screens become the detail layer.** The planner, the full
morning form, Bio Harmony, the experiment studio and the compass are not
deleted. They become the destinations the quiet links point at. That is why
this proposal cuts almost nothing from the codebase while cutting most of it
from the everyday path.

**Step 5 — retire by evidence.** A demoted screen that nobody opens in a
fortnight of fieldwork is a candidate for removal in 2.1, argued from usage,
not taste.

Research-mode columns keep their sources: `bio_*` (8 columns),
`experiment_id` / `experiment_name` / `adherence` (3), `brain_day` (1) and
`factors` all still have a path. If a participant never opens research mode
those cells export blank — which is already the honest behaviour for an
unanswered field, and is what `value_basis` exists to record.

---

## 7. The prototype

Not static screens. **A real clickable prototype, running on the real
engine**, because a mock cannot tell us whether two taps is actually
achievable with the real calculations and the real content.

- A separate entry point (`calm.html`) on a prototype branch, loading the
  same `index.html` engine surface from step 1.
- Real content: a real calculated night for a real Dubai Fajr, real
  seven-night history, real plan adaptation when the clock passes wind-down.
- Fully clickable for all four journeys end to end, including the quiet
  links down to the existing detail screens.
- Driven on-device through the daypart switcher already built on
  `claude/sleepsphere-2-preview`, so all four dayparts are reviewable
  without touching the phone's clock.
- Instrumented: it counts taps, time-to-complete and scroll distance per
  journey and shows them in a debug panel, so section 8 is measured rather
  than asserted.

Nothing in the prototype writes to a participant record until the
architecture is approved; it runs against the synthetic preview state.

---

## 8. Acceptance criteria

Measured the same way as section 1, so the before/after is directly
comparable.

**Density — per everyday screen**

| Metric | Now (worst) | Target |
|---|---|---|
| Visible buttons on Today | 32 | **≤ 4** including the 4 tabs |
| Primary actions on Today | 5 | **1** |
| Interactive elements in the first screenful | 5 | **≤ 3** |
| Scroll to reach the primary action | yes | **0** at 320×568 |
| Scroll depth, any everyday tab | 6.9 screens | **≤ 2.0** |
| Invented proper nouns, everyday path | 16 | **0** |
| Words on Today | 269 | **≤ 60** |

**Journeys — median, unaided, on a real iPhone**

| Journey | Taps | Time |
|---|---|---|
| Plan a night (nothing unusual) | ≤ 2 | ≤ 10s |
| Record sleep (daily path) | ≤ 4 | ≤ 30s |
| Check progress | ≤ 1 | ≤ 15s to say whether they improved |
| Adjust a plan | ≤ 3 | ≤ 20s |
| First run to first useful act | ≤ 6 | ≤ 60s |

**Comprehension** — after one week, ≥ 80% of testers can state in their own
words what the app decided for them last night, without using an app term.

**Success** — ≥ 90% task completion unaided; SUS ≥ 80; zero participants
who cannot find how to record a night.

**Non-regression** — the full suite (1,350 checks) stays green, the export
stays byte-identical for a participant who never opens research mode, and
`SCHEMA_VERSION` stays 3.

---

## 9. iPhone testing plan

**Who** — 6–8 testers: 4–5 from the Jamea cohort, 2–3 who have never seen
the app (the second group is what catches inherited vocabulary).

**How** — on their own iPhones in Safari, via the preview branch, Home
Screen install included. Four sessions of about 25 minutes.

**Session shape**
1. Cold open, no instructions, no explanation. *"Show me what you'd do."*
   Silence from the facilitator for the first 90 seconds.
2. Four timed tasks in the daypart switcher: plan tonight · record this
   morning · tell me whether you slept better this week · you'll be up two
   hours later tonight.
3. Think-aloud; recorded taps, time and every hesitation over 3 seconds.
4. Two questions at the end: *What did the app decide for you last night?*
   and *What is one thing you'd remove?*

**Instrumented automatically** — taps, time-to-complete, scroll distance,
dead taps, back-outs, and every screen reached. The same harness that
produced section 1, so the numbers are comparable.

**Pass bar** — section 8, met by the median tester, not the best one.

---

## 10. What I need from you

1. **Approve or redirect the four destinations** and the one-primary-action
   rule — everything else follows from it.
2. **Rule on the cuts** in section 2, especially Explore-as-a-library, the
   travel planner, apnea screening and the context scan. These are the
   decisions that make the difference between a reskin and a simplification.
3. **Confirm research mode is acceptable** as the home for Bio Harmony and
   the experiment studio, given that 11 export columns depend on them.
4. **Confirm the flag-based migration** — both interfaces shipping together,
   `classic` default, no data migration.

On approval I will build the clickable prototype first, measure it against
section 8, and bring you the numbers before any of it reaches the app.
