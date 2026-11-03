# Photographic treatments — A, B, C

Written 3 November 2026, after the illustrated direction was rejected.

**Nothing in the app has changed.** `study.html` renders nine iPhone
frames — three treatments at three hours — and `frames/` holds them.
Open it at `?v=a|b|c` and `?t=dawn|day|night`; `?rec=0` shows the state
before any morning is recorded.

The three treatments share one type scale, one spacing scale, one ink
set, one accent and one chart. They differ only in how the photograph is
used. Choosing between them is choosing a composition, not a product.

---

## The three

**A — Full frame.** The photograph is the page. A scrim rises from the
foot of it and the furniture sits on that. The most immersive of the
three, and the one that most depends on the photograph being good at
every hour, because there is nowhere for a weak frame to hide.

**B — Aperture.** The photograph is an object on the page: inset,
rounded, with a hairline edge and a calm dark margin around it. The
margin is the point — it is what makes the picture read as chosen rather
than as wallpaper. The most editorial, and the most forgiving of
imagery, because the frame does some of the work.

**C — Band.** A cinematic strip of sky, one hairline rule, and a precise
field beneath it where the night is read. The sky carries the hour; the
field carries the data. The most instrument-like, and the one with the
most room for the chart to grow into.

My recommendation is **C**, with **A** as the close second. C keeps the
photography genuinely cinematic while giving the numbers a quiet,
well-lit place to live — and SleepSphere has more to show than a timer.
A is more beautiful at dawn and more demanding at every other hour.

## The chart

One scale, restrained strokes, precise alignment:

| | |
|---|---|
| **axis** | one hairline, ticks only on the hours anyone reads |
| **planned** | a 1px measurement rule with end caps — an intention has no volume, so it is drawn as a span, not a block |
| **recorded** | a solid 5px bar on the same scale, 14px beneath, broken where the night was broken |

The two rows share an x-scale, so the shortfall at each end is a
**length you can see** rather than a shade you have to interpret.
Nothing glows and nothing is dashed.

**Interruptions** are the gaps themselves, and they are explained three
ways rather than left to be noticed: a tick with a small open circle
beneath each gap, a caption in words — *2 interruptions, 25 min awake* —
and an `aria-label` on each gap giving its length. The pattern reads
without colour and without the chart.

**The recorded row is drawn only where a real record exists.** At dawn
the chart is last night, planned against recorded. Later in the day and
in the evening it is the night ahead, which has not happened: a planned
span, and no recorded row at all. Where a morning is simply missing the
row reads *Not recorded yet* — no ghost bar, no plausible number. An app
that draws a night it was never told about is worse than one that says
it does not know.

Every figure on these frames is an **example value**, typed into the
study so the chart can be judged. The app computes all of them.

## Discoverability

My Rhythm, Smart Assist, My Rest, Sabat and Explore sit on the first
screen at every hour, in all three treatments, in the weight of a route
rather than a demand. SleepSphere is not a sleep timer and the home
screen should not be able to be mistaken for one.

## The imagery

Three photographs, one per hour, all from Wikimedia Commons, all under a
licence that permits use with attribution. None carries a watermark —
one strong dawn candidate did and was dropped for that reason alone.

| | Photograph | Author | Licence |
|---|---|---|---|
| Dawn | [Altocumulus at Sunrise, 7th Brigade Park, Chermside](https://commons.wikimedia.org/wiki/File:Altocumulus_at_Sunrise_7th_Brigade_Park_Chermside_P1080034.jpg) | John Robert McPherson | CC BY-SA 4.0 |
| Day | [Altocumulus and cumulus over Gåseberg](https://commons.wikimedia.org/wiki/File:Altocumulus_and_cumulus_over_G%C3%A5seberg.jpg) | W.carter | CC BY-SA 4.0 |
| Night | [Stars 01 (MK)](https://commons.wikimedia.org/wiki/File:Stars_01_(MK).jpg) | Mathias Krumbholz | CC BY-SA 3.0 |

They were chosen as a set, not one at a time: all three are sky-dominant
with a low tree line, so they read as one place at three hours rather
than three stock pictures. `design/assets/sources.json` carries the full
record, and **CC BY-SA requires the attribution and the licence to ship
with the app**, not only with this file — a credits line in Me, which
the app already has a home for.

Grading is deliberately slight: a touch of contrast, saturation held or
pulled back a little, and a gentle vignette on the portrait crops. No
bloom, no colour push, no artificial sun. The light in these frames is
the light that was there.

**Weights**, cropped and re-encoded to WebP at 1200–1600px:

| | portrait | wide |
|---|---|---|
| dawn | 78 KB | 49 KB |
| day | 39 KB | 31 KB |
| night | 192 KB | 72 KB |

One image per screen, decoded once, no video and no parallax — so the
cost is a single static decode rather than a running loop. Shipping
would add AVIF alongside WebP and a second width for 1x screens; night
is the one to watch, because star fields are the worst case for any
block-based codec.

## What a port would and would not touch

Would change: the background layers, the composition of `#today`, the
arc's drawing, and the strings.

Would not change: `phaseAnchors()`, `tonightsPlan()`, `buildNight()`,
`fitNight()`, the prayer engine, the storage guard, the Motherhood
vault, the study gate, onboarding, or the audio engine. Every number on
screen keeps coming from the same functions, and the contrast floors in
`test/today.js` apply to the new palette unchanged.

## Open questions

1. **Which treatment.** A, B or C.
2. **The light/dark control.** There is no stark light theme in any of
   these — daytime is a real daytime photograph. My recommendation is
   that the control becomes **Dim**: it lowers the scrim and the
   luminance without disconnecting the screen from the hour, so a dim
   afternoon is still the afternoon.
3. **How far the imagery goes.** Three photographs cover dawn, day and
   night. A fuller set — six or eight, with cross-fades between
   adjacent hours — would make the transitions seamless at the cost of
   roughly 400 KB more. Worth deciding before the port, not after.

Not in scope and not proposed here: My Rest, Sabat, Explore, Me, The
Rest Lab.
