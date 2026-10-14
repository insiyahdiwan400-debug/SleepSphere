# SleepSphere 2.0 — design system

The SleepSphere Blend: celestial luxury, dreamy organic warmth, elegant
futuristic intelligence. Written before the code, and the code follows it.

What this is deliberately **not**: a cream-and-terracotta wellness dashboard,
a neon gradient hero, a grid of glowing glass cards, or a ring of numbers
pretending to be a measurement.

---

## 1. The one idea

The app already knows where the sun is. `applySky()` interpolates a sky
between nine keyframes across the day and sets `--sun-at` to the real light
position. **The Living Sphere is lit by that same light.** It is not a
decoration layered on top of the interface; it is the interface's one object,
and the time of day moves across it.

That is also why there is no second animation engine: the sphere reads tokens
the sky engine already publishes.

---

## 2. Colour — four dayparts

Retuned in `skyKeys.dark`, which the engine already interpolates, so the
transitions between dayparts are continuous rather than four flat themes.
Semantic tokens derive from it per phase.

| Daypart | Phase | Ink | Mid | Low | Orb |
|---|---|---|---|---|---|
| **Midnight** | SLEEP | `#05060f` deep ink navy | `#0a0e22` indigo | `#161033` muted violet | `#e6e8f4` moonlit silver |
| **Dawn** | WAKE | `#0f1030` | `#241a42` lavender mist | `#453056` | `#ffe6cc` warm ivory |
| **Day** | DAY | `#141d3e` | `#243063` cool lilac | `#3d558c` subtle sky | `#fff8ec` luminous pearl |
| **Evening** | EVENING | `#120c22` | `#2a1a40` twilight blue | `#4a2b52` dusky mauve | `#f0c9a8` warm violet-gold |

Accent, one per daypart, used for the primary action and the sphere's rim:

```
--accent        midnight #9fa8d8 · dawn #e8b79a · day #a6b6e8 · evening #c9a2cf
--accent-deep   midnight #5b63a8 · dawn #b9785f · day #5e74c2 · evening #8d5f9c
```

Rules: no neon, no oversaturated gradient, no backdrop blur on near-opaque
surfaces (measured at 44.7 → 59 fps in this app), no glow as a substitute for
hierarchy. One luminous object per screen, and it is the sphere.

Text: `--text` `#f2f0ec`, `--text-soft` `#c6c6d6`, `--text-quiet` `#8e90a8`.
Every pairing above is ≥ 4.5:1 on its own daypart ground; asserted by test
rather than assumed.

---

## 3. Typography

**No webfont.** The CSP is `font-src 'self'`, so Google Fonts cannot load at
all — a linked face would fail silently and fall back. That constraint turns
out to be a gift on an iPhone-first PWA: `ui-serif` resolves to **New York**,
Apple's screen-optimised serif, which is more distinctive than anything we
would have shipped and costs zero bytes.

```
--font-display  ui-serif, "New York", "Iowan Old Style", Palatino, Georgia, serif
--font-body     -apple-system, BlinkMacSystemFont, "SF Pro Text",
                ui-sans-serif, system-ui, "Segoe UI", sans-serif
--font-arabic   Amiri Naskh (shipped locally, single weight — never bold)
```

| Role | Face | Size | Weight | Tracking | Line |
|---|---|---|---|---|---|
| Daypart eyebrow | body | 11px | 700 | `.16em` caps | 1 |
| Greeting | display | `clamp(19px, 5.4vw, 23px)` | 400 | `-.005em` | 1.25 |
| The ask | display | `clamp(27px, 8vw, 36px)` | 400 | `-.015em` | 1.14 |
| Why / sub | body | 15px | 400 | `0` | 1.55 |
| Action | body | 16px | 650 | `.01em` | 1 |
| Quiet link | body | 13.5px | 550 | `.01em` | 1 |

Headings get `text-wrap: balance`. Running text stays under ~34ch on the
sphere composition so no line reads as a paragraph.

---

## 4. Space, shape, motion

```
--s1 4  --s2 8  --s3 12  --s4 16  --s5 24  --s6 32  --s7 48
--r-card 28px   --r-pill 999px
--ease cubic-bezier(.22,.61,.36,1)
```

- Touch targets ≥ 48px; the primary action is 54px tall and full-bleed-ish.
- 20px page gutter, no horizontal scroll at 320px.
- UI motion 200–260ms. Atmosphere motion 20–46s — slow enough to be felt
  rather than watched.
- `prefers-reduced-motion: reduce` removes **all** atmosphere animation and
  leaves a composed static frame, not a broken one.

---

## 5. The Living Sphere

One inline SVG, ~200px, three layers:

1. **Limb light** — a radial gradient positioned from `--sun-at`, so the lit
   edge genuinely tracks the sun through the day and the moon through the
   night. Opposite it, a second gradient darkens the far limb. That
   terminator is not decoration: the body gradient is built from the sky
   tokens, so at midnight the sphere and the sky behind it are by
   construction the same colour and without it the sphere disappears.
2. **Atmosphere** — a soft outer halo in the daypart's accent, below the
   sphere in the stacking order so it reads as air around it, not a glow
   stuck on it. Lit from `--sun-at`, so it is off-centre and still carries
   colour where its box ends; the layer is therefore masked to nothing at
   the inscribed circle. Without that mask the cut shows as a hard arc or a
   hard rectangle — a ring drawn around the sphere instead of air.
3. **Interior** — two very slow counter-drifting bands, low contrast, giving
   the sphere depth without pattern. Blurred, because the bands meet the
   circular clip as hard diagonal chords otherwise and it reads as a
   striped ball.

Animation: `breathe` 22s on scale (1 → 1.015), `drift` 46s on the interior.
Both removed under reduced motion; the static frame keeps the limb light and
the halo, which is the composition.

**Motion ends with the day.** The sphere breathes in WAKE and DAY and is
perfectly still in EVENING and SLEEP, and under any open overlay. This is the
app's existing rule — *"the sky is one canvas; anything else animating behind
a screen whose whole purpose is to be put down is a battery leak"*
(`test/night.js`) — and the sphere obeys it rather than being the exception
to it. It is also the behaviour: motion drains out of the screen as bedtime
approaches, so the last thing the participant sees is completely still.

**It is not a measurement.** No number on it, no ring, no percentage, no
colour-coded verdict. It reflects the time of day and the chosen context —
nothing about the participant's body. Its `aria-hidden` is `true` and the
screen's meaning lives in the text beside it.

---

## 6. Today

One prominent action for the current context, and nothing competing.

```
atmosphere wash (daypart)
      ◯        Living Sphere
   DAYPART     eyebrow
   Good evening[, name]
   The one ask            ← display serif
   One line of why
  [ Primary action ]      ← 54px
   quiet secondary row
─────────────────────────
   existing cards, unchanged
```

Order is load-bearing: the primary action sits **within the first viewport at
390×844** so nobody scrolls past decoration to reach the thing they came for.
Verified by screenshot, not by intention.

Four variants, mapped to phases the app already resolves — no new state
machine, and nothing in `resolvePhase()` changes:

| Phase | Eyebrow | Ask | Action |
|---|---|---|---|
| WAKE | Dawn | How did your night leave you? | Record this morning |
| DAY | Today | *(brain day question or confirmation)* | Choose / Change |
| EVENING | This evening | Let's build tonight / Here is your night | Build my night |
| SLEEP | Tonight | Your night is ready / Time to stop | Goodnight |

**The sphere yields to the night it was standing in for.** In EVENING, once
the night has actually been built, the Living Night's own lit sky *is* the
celestial object on the screen; a second sphere above it both competes with
it and pushes tonight's three actions below the fold, which the brief forbids
outright. So the sphere steps out for exactly that one state and returns at
bedtime, when the Living Night has faded away: sphere → the night itself →
sphere. Measured, not intended: `test/today.js` asserts Change tonight, Why
this night and Clear my mind all sit inside a 390×844 viewport and are the
topmost element at their own centre.

Navigation stays exactly four tabs: Today / My Pattern / Explore / Me.

Greeting: time-of-day plus the name **only if they gave one**. No "we", no
"let's get you to sleep", no implied relationship.

---

## 7. What may not change

Recording integrity is not a visual concern and is not touched:
`state.mornings`, `state.morningRevisions`, correction chains, verification
and provenance, unknown sleep duration as `null`, experiment baseline links,
JSON import/export, `SCHEMA_VERSION = 3`, the 50-column research export.
Prayer calculation, fieldwork logic and the feasibility layer likewise.

No localStorage migration, no onboarding reset, no invented measurement, no
personalised insight that the data does not support.
