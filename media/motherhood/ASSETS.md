# Motherhood scenery assets

Approved design: authentic natural landscapes with restrained SleepSphere
stars, **no aviation imagery**. The scene a person picks is stored inside
the encrypted Motherhood vault, never as a separate browser preference.

## What is here

All four scenes are present, same-origin, and each has a thumbnail so the
selector does not pull full-size backgrounds to draw four small tiles.

| Scene | Still | Thumb | Footage | Depicts |
|---|---|---|---|---|
| Aurora Sanctuary | `aurora.webp` 18KB | 5KB | `motion/aurora.{mp4,webm}` 254/224KB | Aurora over a mountain lake |
| Celestial Lake | `starlake.webp` 35KB | 7KB | `motion/starlake.{mp4,webm}` 482/739KB | Milky Way reflected in a mountain lake |
| First Light | `firstlight.webp` 12KB | 4KB | `motion/firstlight.{mp4,webm}` 223/66KB | Sun rising behind mountains over a valley |
| Moonlit Meadow | `moonmeadow.webp` 29KB | 10KB | `motion/moonmeadow.{mp4,webm}` 514/447KB | Tall grass and the moon |

All stills and footage are 9:16, 720x1280. Total 3.1MB, of which only
one scene footage is ever fetched.

Licences, sources and photographers are in [`../../CREDITS.md`](../../CREDITS.md).

## Rules these assets are held to

- **No aviation imagery.** No aircraft, wings, cabin windows or window
  frames, in any scene, at any crop. Checked by
  `test/motherhood-scenery.js`, which also fails if a scene's CSS points
  at a file that is not one of these.
- **Photographs, not effects.** No CSS gradient, drawn star field or
  illustrated aurora may be presented as one of these scenes.
- **Motion is footage, never an effect.** The scene moves because the
  camera recorded it moving — an aurora, stars wheeling, cloud in a
  valley, grass in wind. The plate carrying it is never panned, zoomed
  or drifted, and that is checked by sampling its transform, position
  and size over a second and a half: a creeping transform would be the
  faked version whether or not a video sat on top of it. No CSS
  gradient, drawn star field or illustrated aurora may stand in for a
  scene.
- **The still is the clip first frame.** Not a different photograph of
  a similar place. The scene before the video decodes and the scene
  after it are the same scene.
- **One clip at a time.** Only the chosen scene footage is fetched, and
  the outgoing clip is torn down on a change rather than left paused
  and decoding. Changing scenery cross-fades between the two, which is
  a transition on an action the person took.
- **Motion is refused where it is not wanted.** prefers-reduced-motion,
  Save-Data, and 2g connections fetch no footage at all — not hidden
  after downloading, never requested. The still remains the scene.
- **The interface may move; the photograph may not be faked.** Cards
  rise in, tiles answer a press, the module fades open: transform and
  opacity only, all finite, all off under reduced motion.
- **Same-origin only.** Private records must never cause a third-party
  image request. The CSP in `_headers` is `img-src 'self' data:`, which
  enforces this, but the paths are written to respect it regardless.
- **The interface works without them.** The module is ivory text on a
  dark scrim over the photograph, and the floor beneath every scene is
  deep celestial blue, so a scene whose photograph never decodes is a
  plain dark screen with legible text at 14.8:1 — never a broken-image
  icon, never an unreadable one. Text contrast over each of the four
  photographs is measured from rendered pixels, not judged by eye:
  `test/motherhood-scenery.js` section 7 holds every panel to 4.5:1.

## Photographs supplied but not used

An asset patch dated 19 October 2026 supplied `aurora.webp` and
`firstlight.webp` cropped from the project owner's own photographs. Both
were taken through an aircraft cabin window and retain the window frame
and an aircraft wing. They were not installed, and the reason is recorded
in `CREDITS.md` so the decision is not re-litigated from the filenames
alone.
