# The living sky

Written 3 November 2026. **Nothing in the app has changed.**

`sky.html` is one file and one engine. There is no image anywhere in it:
the sky, the cloud and the stars are computed every frame from the sun's
real position, and dawn, morning, noon, golden hour, dusk and night are
the same equations with the sun somewhere else. Nothing is swapped
between times of day, because there is nothing to swap.

Open it, drag the scrubber, or let time run.

---

## How it works

Three layers, each rendered differently, because each changes at a
different rate.

### 1. The atmosphere

A single-scattering model of a real atmosphere: Rayleigh and Mie
coefficients, exponential density with altitude, Henyey–Greenstein phase
for the aerosol, marched along the view ray with an inner march toward
the light at each sample. The blue of noon, the red of sunset, the
aureole around the sun and the whole of twilight come out of that one
function — none of them is a colour anyone chose.

It runs at **one ninth of the pixels** and is upsampled. A gradient has
no detail to lose to bilinear filtering, and this is where all the
arithmetic goes. It is stored through a Reinhard curve so an 8-bit
target can hold the sun's range, and the composite pass undoes it
exactly.

**One liberty is taken with the physics**, and it is the one that makes
the engine convincing. A strict single-scatter model goes black the
moment the sun crosses the horizon, because every light ray is then
blocked by the earth — which is why so many shader skies snap from day
to night in a frame. Real twilight is lit by **multiple** scattering,
which single scattering cannot produce at all. So the earth's shadow is
applied as a soft falloff over about sixteen degrees rather than as a
hard test. That is why blue hour exists here, and why dusk takes a
quarter of an hour instead of one frame.

Moonlight is the same function at a different intensity. Physically the
moon is about a four-hundred-thousandth of the sun, which on a screen is
black; it is exposed here the way a long photographic exposure exposes
it. It is still Rayleigh scattering, which is why a moonlit night comes
out blue rather than grey.

### 2. The cloud

Two decks, at 2.3 km and 7.6 km. A deck is a plane at a fixed altitude,
and the view ray is projected onto it — which is what gives the
perspective: cloud overhead is large and sparse, cloud toward the
horizon compresses and crowds, exactly as a real sky does. Past a few
hundred kilometres it dissolves into the air, and that is the haze along
the horizon.

Each deck is fBm, drifting on its own wind and slowly wandering in its
sampling coordinate so the shapes **evolve** rather than merely slide
past. Lighting is a second, cheaper sample taken a little toward the
sun: where there is less cloud between a point and the light, that edge
brightens. It is the cheapest honest silver lining there is.

Cloud takes its colour from the sky it sits in, so it is warm at dawn,
white at noon and blue-grey at night without a single hard-coded colour,
and the bright rim appears only where the sun is behind the cloud —
which is when it happens in the air.

### 3. The stars

Three layers at different cell densities, so no lattice can emerge from
any one of them, each star with its own magnitude, its own colour
temperature and its own twinkle: its own rate, its own phase, its own
depth of modulation.

A star is drawn by its **intensity** against a radius of about a pixel,
not as a disc — that is the whole difference between a star field and a
field of circles. Magnitudes are skewed faint, because a real sky has a
few dozen stars you notice and a wash of ones you do not.

Twinkle strengthens toward the horizon, where the line of sight passes
through the most air. That is real scintillation, and it is the detail
that makes a sky feel like it is being looked through rather than at.

The whole field rotates — a degree every four minutes. Slowly, but it is
the difference between a night sky and a wallpaper.

Stars appear when the sun is between about five and fifteen degrees
down, which is when they appear, and they are washed out by sky
luminance, because the eye cannot see a sixth-magnitude star against lit
air.

### The sun and the moon

No painted halo on either. The glow around the sun **is** the Mie phase
function in the atmosphere pass doing what aerosol does in air; all that
is drawn is the body. The moon has a phase and limb darkening, because a
flat white circle is the thing that reads as a sticker.

### Grading

ACES, then gamma, then a per-pixel dither. The dither is not optional: a
sky is one long ramp and eight bits is not enough for it — without it
the whole frame bands in visible steps.

---

## Performance

The design is built around one number: **the expensive pass runs at a
ninth of the pixels.** Everything at full resolution is cheap — two fBm
evaluations and three hashed star lookups.

- One full-resolution fragment pass and one at a third. No post stack,
  no particles, no video, no per-frame allocation.
- `devicePixelRatio` capped at 2.
- Auto quality: if the frame rate sits below ~34 fps the atmosphere pass
  drops to a quarter resolution and the composite to 0.78 — once, and
  never back up. Hunting between two resolutions looks worse than the
  lower one.
- `prefers-reduced-motion` freezes the drift, the twinkle and the sky's
  rotation while leaving the sky itself live; the control also toggles
  by hand, and a change of system preference mid-session is honoured.
- Rendering stops entirely when the tab is hidden, so a phone in a
  pocket is not drawing a sky.

**I have not been able to benchmark this on a real GPU.** This container
has no graphics hardware — it rasterises in software at about 5 fps, and
that figure says nothing about an iPhone. The structure is right and the
controls are there; the number has to come from a device, and that is
the first thing to do if this direction is approved.

---

## What it is not, yet

This is the sky. It is not the home screen. The type on it is a sample
of the app's own words, at the app's own sizes, sitting where it would
sit — so the readability can be judged against a real noon sky — and the
two soft gradients at the top and foot of the frame are a contrast
floor, not panels.

Nothing here reads, writes or calculates anything of the app's. The
clock is the study's own; in SleepSphere the sun's position would come
from the same clock and the same location the prayer engine already
uses, which is why the sky above already knows when Fajr is.

## What a port would and would not touch

Would change: the background layers of `#today`, and nothing else on the
first pass.

Would not change: `phaseAnchors()`, `tonightsPlan()`, `buildNight()`,
`fitNight()`, the prayer engine, the storage guard, the Motherhood
vault, the study gate, onboarding, the audio engine, or any record.

## Open questions

1. **Does this read as the identity?** If it does, the next step is the
   device benchmark, then porting it behind the existing `--stars` and
   `--sun-at` tokens so the rest of the app inherits it unchanged.
2. **How much motion.** The drift and the twinkle are deliberately
   restrained. They can go further or quieter.
3. **The light/dark control.** With a live sky there is no light theme
   to switch to. My recommendation is that it becomes **Dim** — lowering
   exposure and the scrims without disconnecting the screen from the
   hour, so a dim afternoon is still an afternoon.
