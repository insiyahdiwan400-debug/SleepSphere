# SleepSphere — three concepts, evaluated

Direction-setting only. Nothing is implemented beyond the three prototypes,
production is untouched, and no participant record is written by any of them.

> Beautiful enough to make someone want to open it.
> Intelligent and effortless enough to make them want to return.

Open with `?concept=a`, `b` or `c`. Each runs on the real engine: the times
you see are the real Fajr-aware plan for Dubai, not mock data.

---

## 1. What is being compared

Three genuinely different interaction models over the same four moments —
arriving in the evening, planning tonight, recording a fragmented night,
understanding the morning. They deliberately share no component library,
because three variations of one card would not be a comparison.

| | **A · Orbit** | **B · Companion** | **C · Atlas** |
|---|---|---|---|
| Idea | An instrument, not an app | A warm, brief correspondence | A quiet, exact briefing |
| Navigation | None. Time is the only axis | None. The thread is the history | Four destinations, one card each |
| Confirming | **Hold**, not tap | Reply with a chip | Tap one primary button |
| Where AI sits | A single line under the dial | The whole surface | Behind a closed disclosure |
| Non-AI path | The ring and three time chips | Chips complete every journey | The entire concept; AI is optional |
| Feels like | A planetarium dial | Someone who knows you | iOS Settings at its best |

---

## 2. Where intelligence genuinely earns its place

Only three places survived the test of "does this remove work, or add a
surface?"

**Reading a night from a sentence.** A fragmented night is tedious as a
form and trivial to say aloud. *"Woke for Fajr, back to sleep around 5:30,
up at 7"* becomes a structured proposal in one step. This is the strongest
case in the product and the only one that removes real effort.

**Explaining a decision the engine already made.** "Why is bedtime so
early?" has a correct answer the app can always give, and a person who
understands the plan follows it. The intelligence restates; it never
decides.

**Phrasing the morning read warmly without changing the claim.** The
comparison is the app's existing honest arithmetic. Only the wording varies.

Rejected: scoring sleep, predicting tomorrow, diagnosing, chat as a
destination, and anything that would make the app feel like it is watching.

### The two laws, enforced in code

`concept-ai.js` holds these rather than leaving them to the interface:

1. **Never fabricate.** Anything the sentence does not state comes back
   `null` and is shown as *"not known — left blank"*. Verified: *"slept
   badly"* and *"awake 3 times"* both yield entirely empty proposals.
2. **Never write silently.** Every function returns a *proposal*. The
   interface must show it and get a confirmation. No function writes.

### What is simulated, and what that costs

No API key, no account, no network call, no recurring cost. Everything is
deterministic local code — regular expressions, lookup tables and the app's
own engine. **Asserted by test**: a run that drives the whole recording
journey makes zero requests to any origin other than the page itself.

The parser is honestly weaker than a model would be. Building it surfaced
three bugs worth recording, because they are the bugs rules always have:

- "at 6" matched before "6:30" and stole the time, so a 6:30 wake became 6:00.
- A fixed 42-character lookback reached past a comma and gave *"up at 7"*
  the verb from *"back to sleep"*, filing a wake time as a return to sleep.
- One field held both a clock and a yes/no, and the boolean clobbered the time.

It still mishandles *"fajr at 4:45 then back down til 6:30"* — it cannot
tell whether 6:30 is the return or the final waking, so it leaves the wake
time unknown. **That is the correct failure**: a blank, not a guess. A real
model would resolve it, handle messier input and work in more languages.
The *interaction* is what this prototype settles; the engine behind it is a
later and much smaller decision.

---

## 3. Evaluation

Measured at 390×844 on the real engine. Scroll and button counts are
measured; the judgements are mine and argued.

| | Orbit | Companion | Atlas |
|---|---|---|---|
| Screens of scroll (evening / night / morning) | 1.03 / 1.00 / 1.00 | 1.00 / 1.00 / 1.00 | 1.00 / 1.00 / 1.00 |
| Visible buttons (incl. 8 review-chrome) | 9 / 9 / 8 | 14 / 14 / 12 | 10 / 18 / 8 |
| Words on screen | 48 / 26 / 27 | 53 / 43 / 61 | 32 / 50 / 30 |
| Console errors | none | none | none |

### Beauty

**Orbit wins, and it is not close.** The dial is the only thing here nobody
else ships — a real 24-hour ring with your night drawn on it as an arc from
the engine's own minutes. It makes the app worth opening.

**Atlas** is handsome and utterly safe. It looks like a very good iOS app,
which is a compliment and a limitation: nothing about it is memorable.

**Companion** is the weakest visually. Chat bubbles are a solved, generic
form, and the celestial identity survives only as a background.

### Usability

**Atlas wins.** Everything is where a phone user expects it, the hierarchy
does the explaining, and there is exactly one primary action per card.

**Companion** is excellent for the fragmented-night case and mediocre for
the other three: a thread is a poor way to answer "when do I wind down",
because the answer scrolls away. It also grows downward forever.

**Orbit** is the riskiest. Hold-to-confirm is lovely and deliberate, and
undiscoverable without the label. "Turn the ring to change it" is a promise
the prototype does not yet keep.

### Accessibility

**Atlas wins on structure** — real `<details>`, real headings, 52–56px
targets, and every control reachable by keyboard in a sensible order.

**Orbit has a genuine problem.** A hold gesture is hard with a tremor, hard
one-handed, and meaningless to a screen reader. I added an Enter/Space
activation, but a gesture-led interface needs a non-gesture twin for
everything, which doubles the surface.

**Companion** is strong for screen readers (a thread is a list of messages)
and weak for anyone who finds a blank input intimidating — which is exactly
the person this app is for at 6am.

### Privacy

All three are identical today: everything on-device, nothing transmitted.
The difference is what each would *need* if a real model were added.

- **Atlas** needs the least: explanation text generated from the plan.
- **Orbit** needs one sentence of free text.
- **Companion** needs the whole conversation, which over a fortnight is an
  intimate record of someone's nights.

So the privacy ranking is the inverse of the AI ambition. A cloud model
would receive health data under GDPR Art. 9 and needs **its own consent
screen, separate from the study consent**, before a single word leaves the
phone. Research mode and the 50-column export are unaffected in all three.

### Implementation feasibility

| | Orbit | Companion | Atlas |
|---|---|---|---|
| New UI code | High — custom SVG dial, gesture layer, a11y twin | Medium — thread, input, chips | Low — reuses the calm layer |
| Risk to existing behaviour | Low | Low | Lowest |
| Weeks to production quality | ~3 | ~2 | ~1 |

All three sit on the same `SS.engine` seam and none touches recording
integrity, Fajr, the export or Motherhood.

---

## 4. Recommendation

**Atlas as the structure. Orbit's dial as its identity. Companion's parser
as one feature inside both.**

They are not really three futures — they are a frame, a face and a
capability, and the review above keeps picking a different winner per
criterion, which is the tell.

Concretely:

- **Atlas** becomes the product: navigation, hierarchy, accessibility and
  the one-decision rule. It is the cheapest and the most usable.
- **Orbit's dial** becomes the Today screen's object, replacing the sphere
  where a sphere says nothing. It is the only genuinely distinctive thing
  in all three, and as a *display* it drops the gesture problem entirely.
  Hold-to-confirm goes; a button confirms.
- **Companion's parser** becomes "describe it in your own words", folded
  inside Atlas's recording card (already prototyped there, closed by
  default). The conversation as a *destination* does not ship: it is the
  weakest on beauty, usability and privacy at once.

What this preserves: the four destinations, the bedtime screen as the
benchmark, one primary action per screen, and a complete non-AI path —
because in this arrangement the AI path is the disclosure nobody has to open.

---

## 5. Open questions for you

1. **Is the dial right for Today**, replacing the Living Sphere? It is more
   informative and less decorative, but it is a chart where there was an
   object.
2. **Does voice matter enough to design for?** The mic in Companion is
   simulated. On iOS the honest answer is the keyboard's own dictation key —
   on-device, free, already familiar — rather than a speech service.
3. **Should free-text recording ship at all in v1**, given the parser's
   limits? It can ship as the optional path with the chips as the default,
   which is how Atlas has it.
4. **Does a cloud model ever get used**, or is on-device the permanent
   answer? This decides whether a consent screen needs designing at all.

Nothing proceeds until these are settled.
