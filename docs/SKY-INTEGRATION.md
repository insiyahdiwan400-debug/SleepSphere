# The sky: rendering interface, constraints, and how to integrate approved assets

Written 3 November 2026 against `build/smart-assist-nov18`.

This document exists so that when a visual direction and its assets are
approved elsewhere, they can be dropped into SleepSphere **faithfully and
without redesigning anything**. It describes what is there now, what the
contract is, what the limits are, and exactly what a delivery needs to
contain.

It proposes no visuals and changes no behaviour.

---

## 1. The short version

**SleepSphere already has a footage integration layer, built and tested.**
It is `living-sky.js`, it takes licensed video per daypart, it fails
closed to the drawn sky, and 63 assertions cover it. Approved assets do
not need new code to land — they need to satisfy the contract in §5 and
be added to one manifest.

Three things draw the sky today, stacked:

| z | Layer | What it is | Owner |
|---|---|---|---|
| 0 | **Footage** (optional, off by default) | `<video>` in `#livingSky`, one clip per daypart, with a scrim | `living-sky.js` / `living-sky.css` |
| 0 | **Gradient** | four CSS gradients on `<body>`, driven by six custom properties | `applySky()` in `index.html` |
| 1 | **Starfield** | `<canvas id="starfield">`, per-star simulation | `StarSky` in `index.html` |

The gradient and the starfield are **always** present. Footage, when
enabled and available, covers the gradient and the stars fade behind it.
**Removing either fallback is out of scope for any asset delivery** —
they are what the app shows when footage is off, unavailable, blocked,
still loading, or on a device that cannot decode it.

---

## 2. The clock that drives everything

Nothing in the sky keeps its own time. One attribute is the contract:

```
document.documentElement.dataset.sky   // 'dawn'|'morning'|'day'|'evening'|'dusk'|'night'
```

Set by `applySky()` from the device clock. The daypart boundaries are:

| key | from | label used in the UI |
|---|---|---|
| `dawn` | 04:00 | Dawn · Fajr window |
| `morning` | 07:00 | Morning light |
| `day` | 11:00 | Daytime |
| `evening` | 16:00 | Evening · wind-down |
| `dusk` | 19:00 | Dusk · first stars |
| `night` | 22:00 | Night · quiet hours |

`living-sky.js` watches that attribute with a `MutationObserver` and
swaps clips when it changes. **It never reads the clock itself.** An
asset layer should do the same: follow `data-sky`, never `Date`.

This matters beyond tidiness. The test suites drive the app with a held
or faked clock (`window.__applySky` is exposed for exactly this), and any
layer that reads the real clock becomes untestable and starts disagreeing
with the rest of the screen.

### The continuous values

`applySky()` interpolates between keyframes and publishes these on
`:root`. They are the public surface — anything may read them, and an
asset layer can use them to tint, grade or position itself so it stays in
step with the rest of the app:

| Property | Type | Meaning |
|---|---|---|
| `--sky-top` | `rgb()` | zenith colour at this instant |
| `--sky-mid` | `rgb()` | mid-sky |
| `--sky-low` | `rgb()` | horizon |
| `--sun-halo` | `rgba()` | tint of the tight glow around the light |
| `--glow-1` | `rgba()` | tint of the broad glow |
| `--stars` | `0`–`1` | how far the starfield has faded in |
| `--orb` | `rgb()` | the body's own colour |
| `--sun-at` | `x% y%` | where the light is, as a background position |
| `--dusk` | `0`–`1` | how far into the evening the app has settled |
| `--sky-scrim` | `0`–`1` | how hard the footage scrim is pulled (set by `living-sky.js`) |

`--sun-at` is worth calling out: the app already knows where the light
is. It runs a parabola between sunrise (06:00) and sunset (18:30), and
the moon walks the same arc overnight, so the glow always comes from a
body that is plausibly in the sky. **An asset that disagrees with
`--sun-at` will look wrong next to the rest of the UI**, which uses it —
Bio Harmony's ring and the night arc both do.

`skySample(hour, mode)` returns the same interpolation for any hour
without touching the DOM. The night arc and the week strip are painted
with it, which is why they can never drift away from the live
background.

### Cadence

- `applySky()` runs on mode change and on each render pass.
- `applyDusk()` runs **once a minute** (`setInterval`, 60 000 ms) and
  writes one custom property. A two-hour evening moves `--dusk` by less
  than one per cent in that time, so once a minute is far finer than the
  ramp is perceptible, and it costs one property write with no layout.
- `StarSky` runs a `requestAnimationFrame` loop, woken every 4 s, and
  parks itself when nothing is visible.

**This is the battery budget.** Any asset layer should aim for the same
shape: no per-frame work when nothing is moving, and no `getComputedStyle`
in a loop.

---

## 3. The drawn fallbacks, in detail

### 3.1 The gradient

Four stacked backgrounds on `<body>`, `background-attachment: fixed`:

```
radial-gradient(circle 20vmax at var(--sun-at), var(--sun-halo), transparent 66%)
radial-gradient(ellipse 130% 88% at var(--sun-at), var(--glow-1), transparent 78%)
radial-gradient(ellipse 58% 40% at var(--glow-2-at), var(--glow-2), transparent 70%)
linear-gradient(179deg, var(--sky-top) 0%, var(--sky-mid) 56%, var(--sky-low) 100%)
```

Keyframes live in `skyKeys` — nine per mode (`dark`, `light`), at hours
0, 4, 6, 8, 12, 16, 18.5, 20.5, 22, each carrying `top`, `mid`, `low`,
`halo`, `glow`, `stars` and `orb`. **If a new direction supplies a
palette, this table is where it lands** and nothing else has to change:
every consumer reads the interpolated properties.

### 3.2 The starfield

`StarSky` in `index.html`, mounted on two canvases:

| Canvas | Options |
|---|---|
| `#starfield` (page background) | `meteors: true`, default density |
| `.console-stars` (the night console panel) | `alwaysOn: true`, `density: 240`, `maxStars: 1300` |

Per-field options: `density` (one star per N px² of field), `maxStars`,
`minStars`, `centre`, `meteors`, `gain`, `alwaysOn`.

Notes that constrain any replacement:

- Stars are drawn at `min(2, devicePixelRatio)`.
- The field rotates about a point **on screen** (`centre`), not about an
  off-screen pole. Putting the pole off screen grows the circle that must
  be filled about tenfold, so most stars get drawn where nobody can see
  them and the visible sky comes out empty.
- `STAR_RATE` is 0.0000092 rad/ms — one revolution in ~11.5 minutes. It
  was three times slower and was reported from a real device as
  indistinguishable from wallpaper. What makes it legible is `depth`:
  near stars drift ~2.5× faster than far ones, and neighbours separating
  is what the eye catches at these speeds.
- Glow sprites are built **once** per hue into off-screen canvases.
  Creating a radial gradient per star per frame is the single most
  expensive thing this loop could do.
- `window.__starProbe` is exposed for the tests.

---

## 4. The footage layer — the actual integration point

`living-sky.js` is the adapter an approved asset set plugs into. Read
its header before changing it; the summary follows.

### 4.1 Status contract

It publishes one attribute, on both the host and `:root`:

```
document.documentElement.dataset.skyMedia
```

| value | meaning |
|---|---|
| `playing` | real footage, decoding now |
| `paused` | real footage, held still for reduced motion |
| `blocked` | real footage, waiting for a tap (autoplay refused) |
| `loading` | a real source is being fetched |
| `unavailable` | **no footage for this daypart** — the drawn sky is showing |
| `off` | footage not asked for — the drawn sky is showing |

`off` and `unavailable` are deliberately distinct and **must stay
distinct**. Off means nobody asked; unavailable means this daypart has no
recording. Conflating them hides which is true.

### 4.2 The fail-closed rule

This is the rule the module exists to hold, and it is not negotiable
without an explicit decision:

> Only an actual media URL may be passed as a source. A missing or
> non-media source is a **visible failure**, never fake footage.

The guard: a source must match `^(https://|/|\./)` **and** end in `.mp4`
or `.webm`. Anything else short-circuits to `unavailable` and the drawn
sky stays. There are no placeholder URLs anywhere in the manifest — a
daypart either has a real file or it has nothing.

A 12-second timeout fails the same way.

### 4.3 What ships today

| daypart | clip | size | credit |
|---|---|---|---|
| `evening` | `assets/sky/evening-clouds.mp4` | 11.5 MB | Chris Waits, CC BY 2.0 |
| `dusk` | `assets/sky/evening-clouds.mp4` (reused, heavier scrim) | — | as above |
| `night` | `assets/sky/night-sky.mp4` | 4.9 MB | Chris Waits, CC BY 2.0 |
| `dawn`, `morning`, `day` | **none** | — | report `unavailable` |

So **half the day has no footage**. That is the honest state, and it is
the most obvious gap for an asset delivery to fill.

### 4.4 Off by default, and why

The footage layer does not start on its own:

```js
SSLivingSky.setEnabled(true)     // or ?sky=real / ?sky=on in the URL
SSLivingSky.setEnabled(false)    // or ?sky=drawn / ?sky=off
```

The choice persists in `localStorage` under `ss_living_sky`.

Two reasons, both worth preserving unless the assets change them:

1. **H.264 playback on iPhone Safari is UNVERIFIED.** This project's
   Chromium is built without H.264 — `canPlayType('avc1.42E01E')` returns
   the empty string — so the shipped clips cannot be decoded in CI at
   all. A default that depends on an unverified decode can fail in front
   of an examiner.
2. **5–11.5 MB on first paint** of a page that otherwise weighs under a
   megabyte. On mobile data that is the difference between an app that
   opens and one that appears to hang.

### 4.5 Public API

```js
window.SSLivingSky = {
  mount(host, opts),      // the adapter itself
  FOOTAGE,                // the manifest
  dayKey(),               // current daypart key
  apply(key),             // swap to a daypart's clip
  status(),               // the dataset value above
  enabled(), setEnabled(on),
  covered(),              // which dayparts actually have a recording
  destroy()
}
```

`mount(host, opts)` options: `mp4Url`, `webmUrl`, `timeoutMs`
(default 12 000), `onStatus(kind, message)`. It returns
`{ destroy, start, getStatus }`.

### 4.6 The CSS contract

`living-sky.css` owns `#livingSky`:

- `position: fixed; inset: 0; z-index: 0`
- the video is `object-fit: cover` — **a sky fills the frame and never
  letterboxes**, so assets must tolerate being cropped at any aspect from
  a 375 px-wide phone to a 1024 px tablet
- `#livingSky::after` is the scrim, a three-stop vertical gradient over
  `rgba(4,7,14, …)` scaled by `--sky-scrim`
- crossfades are 1.6 s, and are disabled under `prefers-reduced-motion`
- `@media print` hides the whole layer

`scrim` is per clip in the manifest (0.34 for the night clip, 0.46 and
0.52 for the two evening entries). **Brighter footage needs more scrim to
keep type readable.** An asset delivery should propose a scrim value per
clip, or accept that one will be measured.

---

## 5. What an approved asset delivery needs to contain

Per daypart — `dawn`, `morning`, `day`, `evening`, `dusk`, `night`:

**Files**

- `.mp4`, **H.264** (`avc1`), `yuv420p`, `+faststart`. H.264 is the one
  with hardware decoding on an iPhone and Safari takes the first source
  it can play, so it must be listed first.
- optionally a `.webm` alongside, which is what lets playback be proved
  in CI at all.
- Dimensions at least 1170 × 2532 for the phone, or a crop-tolerant
  landscape master — remember `object-fit: cover`.
- Seamless loop. The clip plays `loop` with no crossfade of its own.

**Metadata, per clip**

| field | why |
|---|---|
| licence and attribution text | CC BY requires attribution **wherever the work is shown**, not in a file. The app renders `#skyCredit` as a visible link. |
| source URL | the credit link's target |
| proposed `scrim` (0–1) | type legibility over that clip |
| intended daypart key | must be one of the six |

**Budget** — see §6. A full six-daypart set at today's sizes would be
40–60 MB, which is more than the rest of the app by a factor of fifty.
This is the single biggest thing to settle before assets are produced.

**What a delivery must NOT require**

- Removing the drawn gradient or the starfield.
- Making footage the default without a verified iPhone decode.
- A placeholder URL for a daypart with no real clip.
- Reading the clock directly instead of `data-sky`.

---

## 6. Performance and delivery constraints

### Weight

| | |
|---|---|
| `index.html` | 727 KB |
| all other JS/CSS | ~300 KB |
| existing media (`media/`) | 3.3 MB (Anwar's plate and Motherhood) |
| **existing sky footage** | **17 MB for three dayparts** |

The service worker (`sw.js`, cache `sleepsphere-v16-anwar-20261102`)
pre-caches a `SHELL` list on install. **`living-sky.js` and
`living-sky.css` are in it; the MP4s are not.** Anwar's 224 KB plate is,
on the grounds that a photographic environment that fails to load offline
is a black rectangle rather than a degraded one.

Whether sky footage joins the shell is a real decision with a real cost:
pre-caching a six-daypart set would mean a 40–60 MB install. The
alternative — leaving it network-first — means the sky is the drawn one
when offline, which is exactly what the fallback is for.

Everything else is **network-first with cache as the offline fallback**.
That policy exists because cache-first delivered new HTML running old
scripts after a deploy, which broke the Private tab twice. Do not revert
it.

### Decode and battery

- One `<video>` at a time; `apply()` destroys the previous handle before
  mounting the next.
- `preload: 'metadata'` — the clip is not fetched in full until it can
  play.
- `muted`, `playsinline`, `disablepictureinpicture`, no remote playback.
- `prefers-reduced-motion` shows **a still first frame**, not a black
  rectangle, and reports `paused`.
- The drawn starfield parks its rAF loop when nothing is visible; the
  video layer should likewise not run when the tab is hidden.

### Devices to check

The layout is tested at six viewports in `test/rhythm-layout.js`: iPhone
SE 375 × 667, 13 mini 375 × 812, 15 390 × 844, 15 Pro 393 × 852, 15 Pro
Max 430 × 932, iPad 1024 × 1366. An asset set should be checked against
the two extremes at minimum — 375 × 667 and 1024 × 1366 — because
`object-fit: cover` crops hardest there.

### What cannot be verified in this container

- **H.264 decode.** Chromium here has no H.264. Any claim that a clip
  plays on an iPhone is unverified until someone opens it on one.
- **GPU performance.** There is no graphics hardware; it rasterises in
  software. Frame rates measured here mean nothing for a device.

Both are environment limits, not code limits, and both should be stated
as unverified in any report rather than assumed.

---

## 7. Tests that already guard this

| suite | assertions | what it holds |
|---|---|---|
| `test/living-sky.js` | 63 | the shipped files really are H.264 (read from the `avc1` sample-description box, not the filename); the adapter builds the right element for iPhone; it actually plays a real video (via a WebM fixture); **every failure path degrades to the drawn sky** |
| `test/starfield.js` | 25 | the drawn field's density, rotation and parking |
| `test/sky-cycle.js` | 27 | the keyframe interpolation across the day |
| `test/night.js` | 65 | nothing animates on a screen whose purpose is to be put down |
| `test/today.js` | 120 | includes contrast floors for type over the sky at all four dayparts, in both modes |

An asset integration should keep all of these green. The contrast floors
in `test/today.js` are the ones most likely to be disturbed by new
imagery: they measure the real rendered ground, and they were added
because a previous change put near-white type on a pale sky at 1.2 : 1.

---

## 8. Frozen state

As of commit `6e070aa` on `build/smart-assist-nov18`:

- The application is unchanged by any of the visual studies. Every study
  lives in `design/` and is loaded by nothing.
- `design/direction-2/`, `design/direction-3/`, `design/sky/` and
  `design/night/` are **rejected proposals, retained as a record**. None
  is referenced by `index.html`, the service worker, or any test.
- The current sky implementation — gradient, starfield and the footage
  adapter — is untouched and is not to be replaced.

### Regression at the freeze, 3 November 2026

Both suite directories, against the tree at `4eb04ae`:

```
67 suites passed, 2529 assertions
 1 suite  failed: test/explore.js
```

`test/explore.js` **passes on its own** and fails only under the load of
a full parallel run. It is a known race, documented earlier in its own
file: Flight's wind-down reloads the page and the suite's teardown can
beat the reload. It is a test-harness defect, not an application one,
and it is the only red in the run.

The six suites that guard the sky were all green:

| | |
|---|---|
| `test/today.js` | 120 |
| `test/living-night.js` | 94 |
| `test/living-sky.js` | 63 |
| `test/night.js` | 65 |
| `test/sky-cycle.js` | 27 |
| `test/starfield.js` | 25 |

Two suites are excluded from the run by the runner, deliberately:
`test/trailer.js` (regenerates a tracked MP4) and
`test/verify-prayer-times.js` (hits the Aladhan API; the offline
transcription in `praytimes-reference.js` runs in its place and passes).

The 2529 figure counts assertions that print a `PASS` line. The nineteen
`node:assert` suites in `tests/` mostly print nothing and pass by exiting
zero, so they are counted as suites rather than as individual
assertions.

Nothing has been merged or deployed.
