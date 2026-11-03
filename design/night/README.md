# One night

Written 3 November 2026, after the shader study was rejected for looking
unprofessional. **Nothing in the app has changed.**

This is one screen, not an engine: the night, art-directed, with the
controls, the frame rate and the explanations taken out of it. The day
is not built and will not be until the quality of this is agreed.

---

## What was actually wrong, measured

I stopped guessing and measured six night photographs — all licensed,
all listed at the end. Three numbers came back, and two of them said the
previous build was not slightly off but inverted.

| | Measured in the references | What the shader did |
|---|---|---|
| **Sky colour** | `#286ba0` at the moon falling to `#0a3455`, luminance 0.136 → 0.032 | luminance ≈ 0.002, desaturated — about fifty times too dark. A black screen with dots on it. |
| **Cloud against sky** | cloud occupies the **bottom** decile of luminance (0.006); open sky the top (0.15) | bright cloud painted on a dark sky — **the relationship upside down**. This is most of why it read as synthetic. |
| **Star magnitudes** | brilliant : bright : mid : faint ≈ **1 : 6 : 24 : 90** | roughly uniform — which is the definition of noise: many dots of one brightness |

The second is the important one. At night a cloud is a **shadow with a
lit edge**, not a bright object. Every reference shows it and the shader
had it backwards.

## The art direction

**A moonlit night, not a starfield.** The moon is the light source and
the composition's anchor: small, upper right, with one wide gentle
aureole and no ring, no flare, nothing with an edge to it.

**Luminous, deep blue — never black.** The sky is darkest at the top
away from the moon, lifts into a pool of light around it, and warms very
slightly along the horizon, which every real night frame has and no
black screen does.

**Cloud as sculpted shadow.** Two decks: a thin veil crossing just under
the moon so something passes in front of the light and the frame has a
back plane, and a heavier band low down. Bodies sit at roughly a third
of the sky's luminance; only what faces the moon comes above it.

**Stars on the measured curve.** Magnitude is `r⁶`, so the faint
outnumber the brilliant about ninety to one. Only the top few per cent
carry a glint, and it is two soft spikes rather than a cross — a
four-point star is a graphic, not a light. They thin into the haze near
the horizon and are eaten by the moon's glare near it, as they are in
the plates.

**Open sky.** Roughly two thirds of the frame is clear, because the
words have to live there and because a frame packed with cloud has
nowhere for the eye to rest.

**Grain.** Fine, and not optional: a night frame without it is the one
thing that always reads as computer-generated.

## How the cloud is actually made

Two earlier attempts failed from opposite ends, and the answer is
neither of them.

1. **Pure fBm** gave shapes nobody chose. That is what "synthetic"
   meant.
2. **Authored ellipses** gave placement but no form. That looked like
   clip art — flat white plates with hard edges.

Neither had the thing that makes a cloud look like a cloud: **light
travelling through it.**

So the silhouette comes from noise inside a *composed vertical
envelope* — the band is placed by hand, the shape is natural — and the
shading comes from marching four steps toward the moon and accumulating
density. Where little cloud lies between a point and the moon, that
point glows; where a lot does, it goes dark.

That one integral is the whole of the dimensionality. It is why the
interior has gradients instead of a flat fill with a bright rim painted
along one side, and it is the difference between the second image and
the third in this file's history.

The noise is also **anisotropic** — sampled about twice as finely
vertically as horizontally — because cloud decks are wide and thin, and
sampling them isotropically is why the first build's cloud looked like
smoke.

## How it animates

Nothing moves quickly and nothing loops visibly. Four motions, all
independent, none of them a cycle you can catch:

| | What moves | Rate |
|---|---|---|
| **Cloud drift** | the two decks translate at different speeds | near deck crosses the frame in about four minutes, far deck in about ten — the difference is the parallax, and it is what gives the two decks distance from each other |
| **Cloud evolution** | the noise field the silhouette is cut from translates slowly inside the deck | a shape changes recognisably over about a minute, so cloud forms and dissolves rather than only sliding |
| **Twinkle** | every star has its own rate (0.45–1.95 Hz), its own phase and its own depth | amplitude 5–15%, never more; the depth is per-star, so no two pulse together |
| **The sky turns** | the whole star field rotates about a pole off the left edge | half a degree a minute. Imperceptible as motion over ten seconds, unmistakable over ten minutes, and the difference between a night sky and a wallpaper |

The moon does not pulse and the glow does not breathe. Both would be
inventions, and both are the first thing that gives away a screensaver.

**Reduced motion** freezes all four and leaves the sky itself exactly as
it is — the still frame is composed, so there is nothing to lose.

## Performance

One fragment pass. The cost is the cloud: two decks at five octaves,
plus four light samples each at three octaves — about thirty-four noise
evaluations a pixel. That is real but not large, and it is the whole
budget; there is no second pass, no post stack, no particles and nothing
allocated per frame.

`devicePixelRatio` is capped at 2 and rendering stops when the tab is
hidden.

**This container has no GPU** — it rasterises in software — so the frame
rate here says nothing about an iPhone. If the look is approved, the
device measurement is the first thing to do, and the first lever is the
light march: four samples to three, or the far deck's march dropped
entirely, costs very little of the look.

## References

Studied and measured, not used. Nothing here ships an image.

| | Photograph | Author | Licence |
|---|---|---|---|
| Sky colour, moon glow | [Waxing half moon over Brofjorden](https://commons.wikimedia.org/wiki/File:Waxing_half_moon_over_Brofjorden_1.jpg) | W.carter | CC0 |
| Cloud against sky | [Clouds over Brofjorden at blue hour](https://commons.wikimedia.org/wiki/File:Clouds_over_Brofjorden_at_blue_hour_1.jpg) | W.carter | CC0 |
| Moonlit cloud form | [Moonlit Night Sky with Clouds and Kans Grass, Savar](https://commons.wikimedia.org/wiki/File:Moonlit_Night_Sky_with_Clouds_and_Kans_Grass,_Savar,_Dhaka.jpg) | Tanvir Rahat | CC BY-SA 4.0 |
| Star magnitudes | [Milky Way over Brod, Dragash](https://commons.wikimedia.org/wiki/File:Milky_Way_over_Brod,_Dragash_%E2%80%93_Long-Exposure_Astrophotography.jpg) | Astroclubkosova | CC0 |
| Star magnitudes | [Milky Way over the Garden of Eden](https://commons.wikimedia.org/wiki/File:Milky_Way_over_the_Garden_of_Eden_(21135225700).jpg) | Arches National Park | Public domain |

`measure.js` in the working notes produced the three tables above from
them.

## What I am not doing until this is approved

Building the day. Dawn, morning, golden hour and dusk are the same
structure with the light somewhere else and a different palette per
hour, but there is no point authoring five more until this one is
right.

## Open questions

1. **Is this the quality?** If parts of it are and parts are not, the
   three that move most independently are: how dark the sky sits, how
   much cloud is in frame, and how bright the moonward edges get.
2. **How much cloud.** Two decks is a calm night. A fourth of the frame
   could be given to a third deck for a more dramatic one, and the hour
   could choose between them.
3. **The moon's place in the composition** is fixed here. In the app it
   would follow the real moon, which means the composition changes
   through the month — worth deciding whether that is a feature or a
   risk.
