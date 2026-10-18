# SleepSphere — private experience test (18–19 October 2026)

**Status:** Testing guide for a development-branch build. This file is not proof that any Netlify URL contains this revision. Do not distribute a link until the exact deployment commit is verified.

## Tester introduction

You're invited to try an early SleepSphere prototype. Some experiences are experimental, may not load on all devices, and do not yet include final narrated audio. Please explore what is available, report what actually worked, and don't enter private medical information or sensitive notes. If you prefer, skip any question or feature.

## Tonight: experience first (10–15 minutes)

1. **Living Sky:** Open the time-responsive sky. Report whether it actually moves naturally, which daypart you saw, and whether footage loaded. Do not describe still-image pans as real motion.
2. **Cinematic Worlds:** Open each available world. Note whether a real video plays, audio works, the world is blank, or only an image appears. Record the world name and device.
3. **Soundscapes:** Play rain, water, wind or other available sounds; try mixing two. Report audible/not audible, volume, pause, and whether audio continues unexpectedly.
4. **Meditation:** Open Explore → Meditation (only on a build including commit 366cf622 or later); try Body Scan, Breathing or Gratitude. These are existing on-screen practices, **not** finished narrated audio. Do not rate missing voice audio as working.
5. **Sabat / bedtime experience:** Try the calm bedtime flow. Report clarity, visual calm, and any broken buttons.
6. **Sleep recording:** Only if comfortable, record bedtime once. Avoid repeatedly tapping Goodnight while this known data-protection defect remains unfixed. Complete morning entry tomorrow if you chose to track a night.
7. **Motherhood (optional):** Only for testers who choose it. Do not ask participants to disclose pregnancy, postpartum status, or medical details.

## Feedback (copy and reply)

- Device and browser:
- Experience you tried:
- What worked:
- What did not work (include exact button/screen):
- Audio audible? Yes / No / Not tested
- Was the motion genuine video, still imagery, or unclear?
- Overall: Which experience makes SleepSphere distinctive?
- One thing to improve before release:

## Privacy and data precautions

This is a prototype. Participation is optional. Use fictional examples in journals and notes. Do not send screenshots of private entries or any health details. Testing must not erase, reset or migrate existing participant data. Do not use **Erase Everything**. Do not ask testers to uninstall/reinstall or clear browser storage. Keep feedback separate from app data.

## Maintainer release gate (must verify before sharing)

- [ ] Verify the deployment is a **preview**, not production.
- [ ] Confirm deployed Git commit includes the intended code and `meditation-chooser.js` loads successfully.
- [ ] Confirm the preview opens on iPhone Safari and at least one other browser.
- [ ] Confirm world videos actually play (not static photos or slideshows).
- [ ] Confirm sound is audible on a real device.
- [ ] Confirm Goodnight/morning recording status and disclose known defects.
- [ ] Confirm opt-in Motherhood remains optional and no existing data was modified.
- [ ] Share the exact verified preview URL with a small, consented tester group.

**Known blockers as of this guide:** Existing Netlify preview not verified against current development branch; bedtime Goodnight repeated-tap and storage-failure issues still present; mobile sound playback and cinematic video loading not device-verified. No production deployment authorized.
