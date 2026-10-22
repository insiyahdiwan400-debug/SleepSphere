# SleepSphere — submission package

**Submission date: 15 October 2026.** Prepared 13 October 2026 from commit
`58abc89`, which is **deployed to production**.

SleepSphere is a sleep companion for a student research cohort at Jamea. It
is a single-page progressive web app: no server, no account, no build step.
Everything a participant records stays on their own phone unless they
deliberately export it.

---

## Start here

| | |
|---|---|
| **Open the app** | **https://sleepsphere1809.netlify.app** — the live site |
| Preview with a daypart switcher | https://claude.ai/artifact/RBuC7x43HjyN47N5EixqnU |
| The app with no harness at all | https://claude.ai/artifact/7SEd9bb7h57eHPSuyPbDfc |
| **Source** | `claude/sleepsphere-integration-oct20` @ `58abc89` |
| **Opens on** | the drawn sky, about 1 MB, no video |

The preview carries a small switcher at the top left. It is **not part of
the app** — it exists so a reviewer can see a time-of-day interface without
changing their phone's clock. It shifts the clock and seeds one night plan,
nothing else. `preview.js` is not in the repository and is not in any
branch; remove it and the build is the commit.

- **Dawn / Day / Evening / Dusk / Night** — move the app's clock.
- **Live** — the real time.
- **Sky: drawn / Sky: real** — the footage layer, off by default. See
  [limitations](LIMITATIONS-AND-ROADMAP.md#the-living-sky).
- **Reset** — clear everything the preview stored.

---

## The package

| Document | What it answers |
|---|---|
| [FEATURE-INVENTORY.md](FEATURE-INVENTORY.md) | What the app does, with screenshots |
| [TEST-RESULTS.md](TEST-RESULTS.md) | What was tested and what the numbers are |
| [ARCHITECTURE-AND-PRIVACY.md](ARCHITECTURE-AND-PRIVACY.md) | How it is built and where data goes |
| [RESEARCH.md](RESEARCH.md) | The study, the schema, and the fieldwork position |
| [LIMITATIONS-AND-ROADMAP.md](LIMITATIONS-AND-ROADMAP.md) | What is not finished, and what is next |

Deeper material already in the repository, referenced rather than repeated:
[`HANDOVER.md`](../HANDOVER.md) (engineering detail),
[`MOTHERHOOD.md`](../MOTHERHOOD.md) (the privacy boundary),
[`UX.md`](../UX.md), [`DESIGN.md`](../DESIGN.md), [`WORLDS.md`](../WORLDS.md),
[`CREDITS.md`](../CREDITS.md), [`JAMEALANWAR.md`](../JAMEALANWAR.md).

---

## One thing to read before demonstrating

Playback of the bundled sky footage **has never been verified on an
iPhone**. The test environment's browser has no H.264 decoder at all, so
it cannot decode the clips even in principle. The footage layer is
therefore **off by default** and the app opens on the drawn sky, which has
been tested continuously since the start of the project.

The drawn sky is never described anywhere in the app as recorded footage.
That distinction is enforced by a test, not by discipline.

If you want to show the footage, use the **Sky: real** button — and expect
it to be the one part of the demonstration that might not work.
