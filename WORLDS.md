# SleepSphere Worlds — experience architecture

One engine. Many worlds. A world is a renderer and a vocabulary; it owns no
state, performs no sleep arithmetic, and cannot write a record.

Status: architecture implemented, **Flight** built and interactive, **Plain**
built as the control. Space and Sanctuary are specified here and not built.
Nothing deployed, production untouched.

---

## 1. The inversion, which is the whole design

Flighty is absorbing because you check it **during** the flight. Live
position, live ETA, a reason to open the app every twenty minutes. That loop
is the right answer for aviation and the **wrong** answer for sleep, where
the best possible night is the one where the phone is never picked up.

So this architecture takes Flighty's principles and inverts its loop:

| Flighty | SleepSphere Worlds |
|---|---|
| Rich during the journey | **Enforced empty** during the night |
| Live tracking pulls you back | No live progress exists to pull you back |
| Anticipation before departure | **Anticipation before bed** — kept, and made beautiful |
| Satisfying history afterwards | **Satisfying history in the morning** — kept, and expanded |

The pleasure is moved to where it is harmless: **before** bed and **after**
waking. The Flight world is rich at 9pm, one line at 11pm, and generous
again at 7am. That asymmetry is not a restriction bolted on afterwards — it
is enforced in the shell, below, where no world can reach it.

### What is taken from Flighty, and what is not

**Taken — the principles the brief named.** Real-time relevance: the screen
differs by daypart and the current stage is marked. Information hierarchy:
one headline, one supporting row set, one action. Meaningful progress: the
night as named stages rather than a number. Microinteraction: a single
160ms split-flap on the row that actually changed. Enjoyable history: a
logbook worth scrolling.

**Not taken — their product.** No live map, no aircraft tracking a great
circle, no flight card, no green "on time" chip, none of their palette or
iconography. Flight's references are older and public: a split-flap
departure board, a card boarding pass with a perforated stub, a pilot's
logbook, an arrival stamp.

---

## 2. The architecture

```
                    ┌──────────────────────────────┐
                    │   SS.engine  (unchanged)     │
                    │   Fajr · plans · records ·   │
                    │   supersession · export      │
                    └───────────────┬──────────────┘
                                    │ read-only
                    ┌───────────────▼──────────────┐
                    │          THE SHELL           │
                    │  night model · navigation ·  │
                    │  actions · NIGHT GUARD       │
                    └───────────────┬──────────────┘
                        model │ actions │ lexicon
            ┌─────────────────┼─────────┼─────────────────┐
            ▼                 ▼         ▼                 ▼
        ┌────────┐       ┌────────┐ ┌────────┐       ┌────────┐
        │ FLIGHT │       │ SPACE  │ │SANCTUARY│      │ PLAIN  │
        │  built │       │  spec  │ │  spec   │      │  built │
        └────────┘       └────────┘ └────────┘       └────────┘
```

### The night model

The shell reads the engine once and freezes a **world-agnostic** object:
phase, the plan, ordered `stages` each with `{key, minutes, time, state}`,
history, `needsRecord`, `settled`. No aviation words, no colours, nothing a
theme could disagree with. Every world renders this same object.

Stage keys are fixed: `wind · sleep · fajr · return · wake`. A world renames
them in its lexicon — Flight calls them GATE, DEP, WPT, CONT, ARR — but it
cannot reorder them and cannot invent one.

### The actions

The only way a world changes anything: `acceptPlan`, `answerWake`, `adjust`,
`commit`, `settle`, `wake`, `record`, `go`, `setWorld`. Each goes through
`SS.engine`, which goes through the app's own save path. **A world never
constructs a record.** It supplies answers; the engine writes.

### The night guard

```js
function nightGuard(model, world) {
  if (!model.settled) return null;
  … one line, one way back …
}
```

Once the participant says goodnight, the shell replaces whatever the world
wanted to draw. Navigation is withdrawn. There is no stage-by-stage
progress, because the world is never given the chance to render it. A world
cannot opt out — asserted by `test/worlds.js`, which confirms that with
Flight settled, zero `.f-pass`, `.f-board` or `.f-route` elements exist.

### Plain is a world

Not a fallback — a registered member of the same contract, with no theme at
all. It exists for two reasons: it proves the shared system is a system
rather than decoration with hooks, and a participant who wants none of this
must still have a complete product. Every check in the suite runs against
both.

---

## 3. The promise, and how it is kept

> Changing environment must not change sleep records, schedules, or preferences.

Kept **by construction**, not by care: a world is never handed the means to
touch them. The central check switches through every registered world and
back, then compares the entire stored state:

```
PASS  Switching worlds leaves the stored state byte-identical :: 2847 vs 2847 chars
PASS  Records survive a world change :: 8
PASS  The schedule survives :: 1310
PASS  Preferences survive
PASS  Schema and participant untouched
```

---

## 4. The four journeys, in every world

| Journey | Flight | Plain |
|---|---|---|
| Plan tonight | Boarding pass, route strip, split-flap board | A list of times |
| Record sleep | Arrival report, five taps, stamped | A list of times |
| Review patterns | Logbook, last seven nights | A list of nights |
| Adjust a plan | Schedule change → revised → re-file | Same, unstyled |

Measured, 390×844: every journey in both worlds is **one screenful, no
horizontal scroll, no console errors.** Flight's Tonight is 61 words and 5
visible buttons including the 4 tabs.

---

## 5. Flight — what makes it enjoyable

**The boarding pass.** A card with a perforated stub carrying the one number
worth anticipating: `8h · two blocks`. Not a progress ring, not a score.

**The route strip.** The night drawn once to scale from the model's own
minutes, with Fajr as the single amber tick. Nothing is eyeballed.

**The split-flap board.** Five stages with codes, labels and tabular times.
The current row flips once — 220ms, one element, removed entirely under
`prefers-reduced-motion`. It is a microinteraction, not an ambience.

**Daypart as a change of material, not a tint.** Afternoon is cool printed
card; evening warms; night is an unlit departure board — ink ground, amber
for the live row, pale blue for the action. Four genuinely different screens.

**The logbook.** Seven nights with duration and how they felt, unknown
lengths shown as *unknown* rather than zero. History that is interesting to
read and impossible to be scored by.

---

## 6. Not built — the other two worlds, specified

**SPACE.** The night against real sky. The architecture matters more than
the art here: astronomical position data is a **separate, optional,
clearly-labelled layer**. If a real moon phase or planet altitude is shown
it is computed on-device and marked as measured; anything artistic is marked
as artistic, and the two never share a frame without saying which is which.
Default off, because an unreal sky presented as real would break the same
honesty rule that governs sleep numbers.

**SANCTUARY.** Natural environments and gentle wind-down. One hard rule:
**no sound plays unless the participant starts it**, and anything that plays
has a visible, always-reachable stop. Audio is the one feature in this
product capable of keeping someone awake to listen, so it must obey the
night guard too — the guard stops the screen, and a sanctuary timer must
stop the sound.

Both are deliberately unbuilt. The brief asked for one; three half-built
worlds would prove less than one finished one plus a working contract.

---

## 7. Restoration over engagement — the explicit rules

1. **No live night.** Enforced in the shell, asserted by test.
2. **No notifications that pull you back.** None exist and none are proposed.
3. **No streaks, points or scores.** History is interesting; it does not grade.
4. **No ambience by default.** Sanctuary's audio is opt-in and stoppable.
5. **The night screen is measurably boring** — one action, no navigation,
   ≤30 words, one screen, nothing animating. All five checked for both worlds.

> `PASS  flight · after goodnight exactly one action remains :: 6 before, 1 after`
> `PASS  flight · under thirty words :: 25 words`

---

## 8. Preserved

Fajr engine, recording integrity, supersession, provenance, `SCHEMA_VERSION = 3`,
the 50-column export, privacy boundaries and the Motherhood architecture are
untouched — the worlds layer adds files and reads an existing seam. No live
AI provider, no transmission (asserted: zero requests leave the device), no
deployment, no migration.

---

## 9. What I need from you

1. **Is Flight the right first world** — does the boarding-pass framing earn
   its place, or does it feel like a costume over a timetable?
2. **The night guard is absolute.** Confirm you want it that strict; it is
   the single biggest difference from the app you admire.
3. **Space's sky data** — accurate-and-labelled, or artistic-only for v1?
4. **Which world ships as default.** My recommendation is Plain as the
   default with Flight offered, so nobody is themed without choosing it.
