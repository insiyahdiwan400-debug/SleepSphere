# Tonight — visual direction

Written 3 November 2026, after the home-screen rebuild was reviewed and
the visuals were not approved.

**Nothing in the app has changed.** `study.html` renders eight frames —
four hours at two sizes — and `frames/` holds them. Every time and
duration in those frames is typed in as a plausible example so the
composition can be judged; the real screen computes all of them from
`phaseAnchors()`, `tonightsPlan()` and the morning record, and would go
on doing so.

Open it at `?t=dawn`, `?t=day`, `?t=dusk`, `?t=night`.

---

## 1. The idea

**The identity stops being a sphere on a gradient and becomes the sky
itself.**

The sphere was the most prominent thing on the home screen and it knew
nothing. It was the same object at every hour, 390px across, in the
middle of the frame, and the only thing it told you was that the app
has a sphere in it.

In this direction the light is small, and it is in a different place at
every hour — low and left at dawn, high at midday, setting on the right
at dusk, a moon at night. It is the same object as the sphere, reduced
to the size of the thing it depicts, and it now carries the one piece
of information the home screen is really about: where you are in the
day.

What fills the frame instead is a place. Six values build it — zenith,
upper sky, mid sky, haze, horizon, and two ridges of land — and those
same six move through the day rather than being swapped for a different
set. That is what makes dawn, noon, dusk and midnight read as one
environment at four hours rather than four themes.

The app already interpolates a continuous day→night number (`--stars`)
and a light position (`--sun-at`). This is that machinery with more
layers on it, so the transition stays a tween and not a switch.

## 2. Why there is a horizon

Every frame is composed against it. The date and the hour sit at the
top, the line of the hour sits in the deep part of the sky directly
beneath, and everything you can act on stands on the ground.

This is the answer to the empty space. The middle of these frames is
open, and deliberately: it is sky, with a sun in it, bounded above by
the words and below by the land. A gradient with nothing in it reads as
unfinished; a sky does not.

It also solves a real problem rather than a decorative one. The
brightest part of any daytime sky is the band just above the horizon,
which is exactly where the old layout put the headline — which is how
light mode ended up at 1.2:1. Words live in the deep part of the sky in
every daypart now, which is the one place the same near-white type is
readable at all four hours.

## 3. Point by point

| Your note | What these frames do |
|---|---|
| 1. No stark white or beige dashboard. Immersive daytime, soft skies, atmospheric depth, warm restrained colour, no white cards, no flat backgrounds | There is no light theme any more. There is **daytime** — a saturated blue zenith, a warm hazy horizon, sage land — and there is not one card anywhere in the direction. The only surfaces are sky and land. |
| 2. Keep the navy and the subtle gold at night; make the transition natural | Night is unchanged in spirit: deep navy, one restrained gold. It is the same six values as noon, moved — so dusk is literally the tween between them, not a different design. |
| 3. Reduce the oversized glossy sphere; environments and changing light become the identity | The sphere becomes the sun and the moon: 18–26px, placed by the hour, carrying information. The environment is the identity. |
| 4. Reconsider the empty space in morning and night | Composed against the horizon — words at the top of the sky, actions on the ground, the open middle being sky rather than nothing. Night drops the chart entirely; at bedtime two times and a duration is the whole of what is useful. |
| 5. The afternoon's six options should not feel like a questionnaire | Six full-width rows with a radio on each is a questionnaire. The same six as a close-set grid of small tiles is a mode picker, which is what it is — and the one already chosen is simply lit, so the common case is "see it, leave it". |
| 6. Replace the dashed oval; distinguish planned from recorded | See below. |
| 7. Simplify the wording | See below. |
| 8. Preserve functionality, calculations, data integrity, accessibility, tests | Nothing here changes behaviour. The notes at the end of this file say exactly what the port would and would not touch. |

## 4. The rest ribbon

The dashed oval had two faults. A dashed box reads as a placeholder — as
something *missing* — which is the opposite of what a saved plan is. And
it gave planned and recorded the same silhouette, so the one comparison
this app exists to make was carried entirely by line style.

Now they nest:

- **Planned** is the span — a lit field with a soft gold edge, and two
  ticks below it pointing at the two times.
- **Slept** is a solid gold bar *inside* that span, notched where the
  night was broken.

Read together they are one sentence: *this is the night you set aside,
and this is the part of it you actually slept.* The shortfall is the
unfilled tint at each end — the comparison, without a number.

And because the span carries a real fill and a real glow, the evening,
where there is no record yet, shows a lit night waiting to be filled
rather than an empty dashed box.

The strip is a picture *of* the night, so it stays the night at every
hour: dusk at the left, the deep of it in the middle, first light at the
right. Its window is 6pm→10am, the same one `ARC_START` / `ARC_SPAN`
already use, so an evening plan, a whole night, a Fajr interruption and
a lie-in all fit without wrapping.

## 5. The words

| Now | Proposed |
|---|---|
| How did your night leave you? | How did you sleep? |
| Three questions. Under half a minute. | Three questions, about twenty seconds. |
| What does your brain need tomorrow? | What is tomorrow for? |
| So tonight can be built around it. | Tonight gets built around it. |
| Let's build tonight. / Tomorrow shapes tonight. It takes seconds if nothing is unusual. | No night set for tonight. / Takes about a minute. |
| Here is your night. / Everything is handled. Nothing else to decide. | Wind down at 10:00. / Asleep by 10:45, up at 6:45. |
| Your night is ready. / One tap, then put the phone somewhere else. | Time to sleep. / Put the phone down after this. |
| Start the wind-down whenever you like — the sounds, the timer and the duʿāʾ follow it. | Start wind-down |
| Too tired — just go to bed | Straight to bed |

The rule: the headline states the fact of the hour, the line under it
gives the two times that matter, and the button says what it does.

## 6. One decision I need from you

**The light/dark toggle.** There is no light theme in this direction —
there is daytime, which is bright but saturated and warm, and it is the
same environment as night rather than a second palette. That is the
whole of point 1.

So the ☾/☀ control in the top bar needs a new job. My recommendation is
**Dim**: it holds the evening's low light through the daytime hours, for
people who want a dark app at noon or who are sensitive to brightness.
Nothing is removed; the control keeps a real function and the app keeps
one identity. If you would rather keep a true light theme as well, say
so and I will build the daytime environment in two luminances.

## 7. What a port would and would not touch

Would change: the background layers, the composition of `#today`, the
mode picker's markup, the arc's drawing, and the strings in the table
above.

Would not change: `phaseAnchors()`, `tonightsPlan()`, `buildNight()`,
`fitNight()`, the prayer engine, the storage guard, the Motherhood
vault, the study gate, or any record. Every number on screen keeps
coming from the same functions. The contrast floors in `test/today.js`
apply to the new palette unchanged, and the four-daypart loop added
there already measures exactly the thing this direction has to get
right.

Not in scope, and not proposed here: My Rest, Sabat, Explore, Me, The
Rest Lab.
