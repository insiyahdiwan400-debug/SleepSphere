# SleepSphere

A sleep companion for a student research cohort at Jamea. It helps someone
plan a night around prayer times, record what actually happened in the
morning, and see their own pattern — and it is built so that the research
data is a by-product of their own record-keeping rather than a second job
asked of them.

It is a progressive web app with **no server, no account and no build
step**. Everything a participant records stays on their phone unless they
deliberately export it.

---

## Run it

There is nothing to install. Serve the repository root over HTTP and open
`index.html`:

```sh
python3 -m http.server 8099
# then open http://localhost:8099/index.html
```

A service worker and `localStorage` both need a real origin, so opening the
file directly with `file://` will not behave correctly.

### Useful URL parameters

| Parameter | Effect |
|---|---|
| `?sky=real` | Turn on the recorded-footage layer (off by default) |
| `?sky=drawn` | Turn it back off |
| `?ui=calm` | The simplified interface |
| `?world=flight` / `?world=plain` | Alternate interfaces |

---

## Test it

The suite drives a real browser against a served copy, so the server above
must be running on port 8099 first.

```sh
node test/living-sky.js          # one suite
for f in test/*.js; do node "$f"; done   # everything
```

`test/praytimes-reference.js` and `test/verify-prayer-times.js` are
reference scripts rather than suites and need network access.

Current totals and what each suite covers:
[`submission/TEST-RESULTS.md`](submission/TEST-RESULTS.md).

---

## Read it

The application is one file, `index.html`, by design: the engine must not be
able to disagree with itself across files. Separate modules exist only where
a second implementation was a genuine risk.

| Document | What it covers |
|---|---|
| [`submission/`](submission/README.md) | **The submission package. Start here.** |
| [`HANDOVER.md`](HANDOVER.md) | Engineering detail, branches, known bugs |
| [`MOTHERHOOD.md`](MOTHERHOOD.md) | The privacy boundary and its rules |
| [`UX.md`](UX.md) | The four destinations and four journeys |
| [`DESIGN.md`](DESIGN.md) | Colour, type, the dayparts |
| [`WORLDS.md`](WORLDS.md) | Alternate interfaces, built and specified |
| [`LEARN.md`](LEARN.md) | How to start working on this codebase |
| [`CREDITS.md`](CREDITS.md) | Third-party material and its licences |
| [`test/README.md`](test/README.md) | How the prayer times are verified |

---

## The rules this project holds

These are load-bearing. Several are enforced by tests rather than by
discipline.

- **Never fabricate a measurement.** Where a value is unknown the app says
  unknown. `sleepMinutesOf()` returns `null` rather than a plausible number.
- **A correction supersedes, it does not overwrite.** Both versions are
  kept; only the current one counts.
- **Sensitive data is separated by default.** Motherhood records are
  excluded from the research export by a recursive scrub, not a top-level
  filter.
- **Nothing is transmitted silently.** There is no network path out.
- **The drawn sky is never called footage.** A fallback is labelled as one.
- **Bedtime is not a game.** No streaks, points, badges, or rewards for
  staying on screen. The app should be calm enough that someone puts it
  down.
