# Jamea al Anwar

A photograph of the courtyard of al-Jami al-Anwar — the Mosque of
al-Hakim, Cairo — graded to the hour, with a few birds in the air over
it. Sourcing, licence and attribution are in [CREDITS.md](CREDITS.md).

## Why it is a photograph

The first build drew the courtyard: SVG arches, a silhouetted dome,
flat black pigeons. It was original and it was wrong. Originality is
not accuracy, and a drawing of this building is either a reconstruction
from references — which is inventing architectural detail — or a
generic arcade with the building's name on it, which is worse.

So nothing architectural is authored. The arcade, the stepped
crenellation along the parapet, the marble of the sahn, the minaret
with its mabkhara head and the several dozen pigeons standing in the
courtyard are in the frame because they are there.

## What SleepSphere adds

Light, and a handful of birds in the air. In back-to-front order:

| Layer | What it is |
|---|---|
| `.an-wash` | the same frame, pre-blurred at 640px, so colour reaches the edges of screen shapes the plate does not fill |
| `.an-plate` | the photograph, `object-fit: cover`, graded, drifting over 92s |
| `.an-haze` | city glow along the real horizon line, and atmospheric perspective on the band the far arcade occupies |
| `.an-grade` | the hour's colour, kept lightest across the arcade so the arches hold their edges |
| `.an-lamps` | warm light under the arches and spilling onto the marble |
| `.an-birds` | canvas: the birds that are in the air |
| `.an-grain` | film grain |
| `.an-vignette` | weighted towards the app's own `--sun-at` |

### The hour

`--an-night` runs 0 to 1 and is read from `--stars`, the app's own
day-to-night number, which the sky engine interpolates continuously
from the real clock. The courtyard keeps no clock of its own, so it
can never disagree with the rest of the app about what time it is.
`--stars` is tuned for how many stars to draw and peaks well below 1,
so `NIGHT_GAIN` in `anwar.js` maps it onto a full swing — one number,
one place.

### Where the architecture is

`measure()` works out where the plate actually lands after `cover`
crops it, and publishes three positions as CSS custom properties:
`--an-horizon` (the parapet), `--an-arcade` and `--an-floor`. The
lighting is positioned against those rather than against the viewport,
so the lamps sit on the arcade on a phone and on a tablet alike. The
birds read the same measurements.

### The birds

Nothing roosting is drawn — the roosting flock is photographic, which
is the whole reason the screen reads as a place. A drawn bird exists
only between leaving the courtyard and settling back into it: it
climbs, wheels on a flattened ellipse, then descends and fades out
before it reaches the marble, so a drawn bird is never seen becoming a
photographed one.

They are deliberately small. A pigeon standing in the plate is about
eight CSS pixels across and one in the air is further away, so the draw
size is pinned to that; `test/anwar.js` asserts the wingspan stays
under 26px, which is the check that caught an earlier cut reading as
paper aeroplanes.

Left alone the courtyard goes quiet: the chance of a spontaneous lift
builds only after about 26 seconds of stillness.

## Performance

No `backdrop-filter` anywhere. Blurring a live backdrop over a plate
that is always drifting is expensive on a phone, and in testing it
mis-composited — painting a copy of the bottom bar at the top of the
frame. Flat scrims and shadows do the same job for nothing.

The wash is pre-blurred at 640px rather than blurred in CSS at full
size. The three renditions total 224 KB and are in the service
worker's shell: a photographic environment that fails to load offline
is a black rectangle, not a degraded one.

Under `prefers-reduced-motion` the drift, the grain crawl, the lamp
breathing and every bird stop. The courtyard becomes a still
photograph, which is what it is.

## Replacing the plate

`PLATE` at the top of `anwar.js` is the only place the photograph is
named. It carries the sources, the credit, the licence, and four
fractions — `skyTop`, `parapet`, `floorLine`, `floorFar` — measured off
this frame. A new photograph means re-measuring those four and updating
CREDITS.md. Nothing else moves, and the on-screen credit is built from
the same record, so it cannot drift from the file.

The original is 6016 × 4000. This build ships the 1920px rendition
because that was the largest the Commons endpoint would serve at the
time; a larger plate is a drop-in.
