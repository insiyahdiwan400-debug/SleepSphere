# Jame al Anwar — جامع الأنور

An architectural reading of the reference material, and an honest inventory
of what it does and does not support.

This document exists because the brief says:

> Do not redesign, invent, or replace the mosque's architecture.
> …If authentic visual assets are insufficient, explain what is missing
> instead of fabricating architectural details.

So this is the explanation, written **before** any rendering code, so that
what gets built later can be checked against what was actually observed.

---

## 1. Reference status

| | |
|---|---|
| Images received | **1** |
| Provenance | Third party — watermarked `@the_radiantarts`, logo, `www.radiant-arts.com` |
| Owned by the product owner | **No** |
| Usable as an architectural reference | Yes |
| Usable as a shipped asset | **No** — redistributing it is a rights question, not a technical one |
| Daypart shown | Overcast or hazy daylight, diffuse, soft shadows |
| Viewpoint | One: standing in the sehen, arcade running left→right and receding right |

The brief asks for a progression **from daylight through golden hour to
evening**. The reference covers one daypart, from one angle. Two thirds of
the requested progression has no reference behind it at all.

---

## 2. What the reference actually shows

Read off the image, not from memory of Fatimid architecture generally.
Anything uncertain is marked as such rather than smoothed over.

**The riwaq (arcade)**
- Seven to eight bays visible before the arcade recedes out of frame.
- **Pointed arches**, two-centred, with a slight keel at the apex — the
  Fatimi profile, not a Persian or Ottoman one.
- Arches spring from **rectangular piers**, not columns. The pier face is
  broad: roughly a third of the clear opening beside it.
- **Wooden tie-beams** span each arch at springing level — dark, square in
  section, projecting slightly past the pier face. These are structural and
  they are visually prominent; a render without them reads wrong immediately.
- The arcade sits on a low plinth or step above the courtyard surface.

**Drapery**
- **Deep green** hangings in each opening, covering roughly the lower two
  thirds of the arch and gathered toward the top, so the head of each arch
  stays open and dark.
- The green reads as a strong, slightly blue-leaning green, noticeably
  saturated against the pale stone. It is the single strongest colour in the
  composition and carries the mosque's identity in the frame.

**Parapet**
- A horizontal **decorative band** runs the length of the arcade above the
  arches — geometric or inscriptional. Resolution does not let me say which,
  and I am not going to guess an inscription.
- Above it, **stepped merlons** — the characteristic stepped crenellation,
  each merlon rising in two or three steps to a point. Evenly spaced, and
  they continue around the corner.

**Openings**
- Small rectangular windows or vents in the spandrel zone above some arches.
  Spacing relative to the bays below is not reliably readable.

**Lamps**
- Wall-mounted lamps on the pier faces between arches, roughly a third of
  the way up, projecting on short brackets. Warm-toned, unlit in this frame.

**Minaret**
- Right of frame, partially cropped. Tall, pale stone, visibly older and
  more weathered than the arcade wall.
- Shaft appears square or near-square low down with horizontal banding, and
  the upper section is different in texture — but the top is **cut off by
  the frame**, so its termination is unknown from this image.

**The sehen (courtyard)**
- Large pale stone paving, **wet**, with clear reflections of the arcade,
  the drapery and the birds. The wetness is doing a great deal of the work
  in this photograph.
- Paving joints run in a regular grid; module size relative to the bays is
  not reliably readable.

**Pigeons**
- Forty-plus birds, loosely scattered, most concentrated in the mid-ground.
- Standing and walking, not flying, in this frame.
- **Scale reference, which is the useful part:** a bird is a small fraction
  of a paving unit, and the flock thins with distance rather than shrinking
  uniformly — the near birds are several times the pixel height of the far
  ones. That ratio is what makes a crowd read as depth.
- Reflections beneath each bird in the wet stone.

**Light and sky**
- Diffuse, soft-edged shadows — overcast or high haze.
- Sky pale blue-grey, light cloud, slightly washed at the horizon.

---

## 3. What is missing

Each of these is a thing that cannot be built without inventing it.

1. **Golden hour and evening.** Two of the three requested dayparts have no
   reference. The way this stone takes low warm light, how long the arcade's
   shadows run across the sehen, whether the lamps are lit and what colour
   they throw — all unknown.
2. **The rest of the courtyard.** One elevation is visible. The opposite
   riwaq, the qibla side, the entrance, and the courtyard's proportions in
   plan are all off-frame. "What it feels like to sit in the sehen" needs
   more than the wall in front of you.
3. **The minaret's top.** Cropped. Jame al Anwar's two minarets are
   distinctive and much-photographed; guessing at a termination would be
   exactly the fabrication the brief forbids.
4. **The decorative band.** Pattern unreadable at this resolution. If it is
   an inscription, inventing letterforms would be worse than omitting it.
5. **Stone texture and colour under direct sun.** The reference is flat
   light. Colour temperature and the depth of the shadows in sunlight are
   not derivable from it.
6. **Any usable asset at all.** The one image is watermarked and
   third-party.

---

## 4. What would unblock it

In order of how much each would buy:

1. **The product owner's own photographs** of the sehen — several angles,
   and ideally at more than one time of day. These were asked for in the
   brief; one third-party image arrived instead.
2. **Written permission from Radiant Arts**, if their image is to be used.
   Their watermark and site are on the file; this is their decision to give,
   not ours to assume.
3. **Openly licensed photographs.** Al-Hakim Mosque is well documented on
   Wikimedia Commons under licences that permit redistribution with
   attribution. This is the one route that needs nobody's permission and no
   new photography — and it is how the sky plates for the Flight world were
   sourced. It would not be the owner's own photographs, which the brief
   asked for, so it is a fallback rather than the intent.

---

## 5. What will not be done

- No invented arch profile, merlon pattern, minaret top or inscription.
- No "Fatimid-inspired" architecture assembled from general knowledge of the
  period and presented as this mosque.
- No golden-hour or evening scene extrapolated from a single overcast frame
  and presented as observed.
- No shipping of the watermarked reference, cropped, filtered, traced or
  otherwise laundered.

The pigeons are a separate matter. Their behaviour — walking, gathering,
startling, the way a flock thins with distance — is observable from the
reference and from life, and does not depend on architectural detail that is
missing. That part can be built honestly whenever the setting is ready for
it.
