# Motherhood scenery assets

Approved design: authentic natural landscapes with restrained SleepSphere
stars, **no aviation imagery**. The scene a person picks is stored inside
the encrypted Motherhood vault, never as a separate browser preference.

## What is here

All four scenes are present, same-origin, and each has a thumbnail so the
selector does not pull full-size backgrounds to draw four small tiles.

| Scene | Background | Thumbnail | Depicts |
|---|---|---|---|
| Aurora Sanctuary | `aurora.webp` 1149×1600 · 70KB | `aurora-thumb.webp` 7KB | Aurora over a still lake, reflected, trees on the far shore |
| Celestial Lake | `starlake.webp` 1600×850 · 47KB | `starlake-thumb.webp` 7KB | Calm lake under a star-filled blue sky, distant mountains |
| First Light | `firstlight.webp` 1600×1067 · 330KB | `firstlight-thumb.webp` 28KB | Mountain valley above a sea of cloud at sunrise |
| Moonlit Meadow | `moonmeadow.webp` 1600×1067 · 164KB | `moonmeadow-thumb.webp` 14KB | Meadow and wildflowers under a deep blue starry sky |

Licences, sources and photographers are in [`../../CREDITS.md`](../../CREDITS.md).

## Rules these assets are held to

- **No aviation imagery.** No aircraft, wings, cabin windows or window
  frames, in any scene, at any crop. Checked by
  `test/motherhood-scenery.js`, which also fails if a scene's CSS points
  at a file that is not one of these.
- **Photographs, not effects.** No CSS gradient, drawn star field or
  illustrated aurora may be presented as one of these scenes.
- **Stills stay still.** No pan, zoom, parallax or cross-fade that would
  suggest the landscape is moving. Motion would have to come from a real
  video asset, and there is none.
- **Same-origin only.** Private records must never cause a third-party
  image request. The CSP in `_headers` is `img-src 'self' data:`, which
  enforces this, but the paths are written to respect it regardless.
- **The interface works without them.** Every scene carries a sampled
  background colour and a readable scrim, so a scene whose photograph
  fails to decode is a plain coloured background with legible text — never
  a broken-image icon and never an empty black screen.

## Photographs supplied but not used

An asset patch dated 19 October 2026 supplied `aurora.webp` and
`firstlight.webp` cropped from the project owner's own photographs. Both
were taken through an aircraft cabin window and retain the window frame
and an aircraft wing. They were not installed, and the reason is recorded
in `CREDITS.md` so the decision is not re-litigated from the filenames
alone.
