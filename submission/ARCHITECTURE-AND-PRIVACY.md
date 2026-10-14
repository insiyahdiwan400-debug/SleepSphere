# Technical architecture and data privacy

Commit `2dcabbd`, branch `claude/sleepsphere-integration-oct20`.

---

## 1. Shape of the thing

SleepSphere is a **progressive web app with no server component**. There is
no backend, no API, no account system, and no build step. The whole
application is static files served over HTTPS.

```
index.html      11 124 lines   the application: markup, styles, engine
motherhood.js      534 lines   sensitive-data layer and encrypted vault
motherhood-ui.js   878 lines   its interface
explore.js         644 lines   practices
insights.js        463 lines   trends
living-sky.js      392 lines   recorded-footage layer (off by default)
worlds*.js       1 795 lines   alternate interfaces
calm.js            708 lines   simplified interface
sw.js               39 lines   service worker, offline cache
```

Roughly 17 500 lines, no dependencies, no package manager, nothing to
install. This is a deliberate constraint: the app must be auditable by one
person reading it, and must keep working when nothing is maintained.

### Why one file

`index.html` carries the engine because the engine must not be able to
disagree with itself across files. The seams that do exist are the ones
where a second implementation was a real risk:

| Seam | Contract |
|---|---|
| `window.SS.engine` | Read and write records. A second interface may **call** these; it may not recompute any of them, and it may not write a record by any other route. |
| `window.__motherhood` | The privacy boundary — `{key, exportable, enabled, get, set, clear, exported}`. Testable from outside without any sensitive field existing. |
| `window.SSLivingSky` | The footage layer. Fail-closed; cannot affect the app. |
| `window.__integrity` | Exposes the thresholds the integrity layer uses, so tests assert against the real constants. |

### State

| | |
|---|---|
| Storage | `localStorage`, key `sleepsphere_state_v2` |
| Schema version | **3** — unchanged by all recent work |
| Cohort tag | `jamea-v1` |
| Offline cache | `sleepsphere-v12-livingsky-20261013` |

Schema changes are migrations, never rewrites. A state written before the
recording-integrity work reads correctly today: a record with no `verified`
field reads as `unverified` when it was a one-tap night and `entered`
otherwise, and an absent `morningRevisions` reads as "no corrections".

---

## 2. Where data goes

**Nowhere, unless the participant exports it.**

This is not a policy statement, it is a property of the build. There is no
`fetch` to a data endpoint, no analytics, no telemetry, no error reporting,
no third-party script, and no font or asset loaded from another origin. The
Content-Security-Policy in `_headers` is `default-src 'self'`, so the app
could not reach a third party even if a future change tried to.

| Question | Answer |
|---|---|
| Is there an account? | No. |
| Is anything uploaded automatically? | No. There is no upload path. |
| Can the operator read a participant's data? | No. It never leaves the device. |
| What happens if the site disappears? | Installed copies keep working offline; exports already on the phone are unaffected. |
| How does a participant delete everything? | One control in **Me**. It clears the store. |

### The one exception, and it is deliberate

The **feedback form** is the single thing that leaves the phone, and only
when a tester fills it in and taps Send. It submits five ratings, two
dropdowns, a free-text comment, an optional name and an optional device
string — and nothing else. No sleep record, no time, no plan, and nothing
from Motherhood.

The app says exactly this on the screen, above the form, before anything
is typed. The answer is also saved locally **before** the send is
attempted, so a failed submission is never a lost answer.

It is a Netlify form, which is why it only delivers on the deployed site;
anywhere else the POST fails and the app offers the mail app instead.

### Export is always deliberate

Three exports, each triggered by the participant:

| Export | Contents |
|---|---|
| Readable diary | Plain-language record of their own nights |
| Full backup (JSON) | Everything, including correction history |
| Study CSV | **50 columns**, plus a shipped data dictionary |

The CSV is the research instrument and its 50 columns are frozen — none
added, renamed, reordered or removed by any recent work. Each row is the
**current authoritative version** of a participant-day; superseded versions
are not in the CSV but are preserved in the JSON backup under
`morningRevisions`, linked by `supersedes` / `supersededBy`. This is stated
in the shipped dictionary rather than left for a researcher to discover.

---

## 3. The Motherhood boundary

Pregnancy and postpartum data is the most sensitive thing this app touches,
and it is held to a stricter rule than the rest. The full specification is
[`MOTHERHOOD.md`](../MOTHERHOOD.md); the essentials:

**Separation.** Motherhood data is **not** in the ordinary research export
by default. This is enforced structurally: `exportableState()` walks the
state tree **recursively** and deletes any key matching `/^motherhood/i`
that is not on an explicit allow-list. A recursive scrub rather than a
top-level one, because a flat filter only protects the top level and
sensitive data nests.

**Encryption at rest.** The vault uses **AES-GCM** with a key derived by
**PBKDF2-SHA-256 at 250 000 iterations**, through WebCrypto.

What this defeats: someone reading `localStorage` off a device or a backup
without the passcode.

What it does **not** defeat, stated plainly because overstating it would be
worse than not having it: a compromised device, a keylogger, a malicious
browser extension, or anyone who has the passcode. It is at-rest protection,
not a guarantee of confidentiality against an attacker present on the phone.

**No silent transmission.** There is no network path out of the module at
all, so "never silently transmitted" is structural rather than promised.

**No diagnosis.** The copy does not diagnose, predict outcomes, or make
medical promises.

**Write integrity.** Entry writes are serialised through a promise tail and
seal before publishing; a save whose vault session changed underneath it
throws rather than committing. Removing an entry walks the `supersedes`
chain in both directions so a correction cannot leave an orphan.

---

## 4. Data integrity, as an architectural property

The research value of this app depends on it never inventing a measurement.
Three mechanisms:

1. **Unknown is a value.** `sleepMinutesOf()` returns `null` when the
   inputs do not support a duration. Callers must handle it; they cannot
   receive a plausible-looking zero.
2. **Flags are derived on read, never stored.** `long-opportunity`,
   `daytime-bedtime`, `wake-inferred`, `wake-estimated`, `sleep-unknown`,
   `times-inferred`. A record already on disk is recognised without
   rewriting the evidence.
3. **Verification outranks inference, in both directions.** What the
   participant said — `confirmed`, `corrected`, `entered`, `uncertain`,
   `times-only`, `unverified` — beats what the app guessed.

The incident these exist to prevent is on record: a bed time stamped at
18:17 in daylight plus an app opened at 10:21 produced a 16 h 4 m night and
14 h 43 m of "sleep", which the trends then interpreted.

---

## 5. Offline and installation

A service worker caches the shell, so the app opens with no network. The
two sky clips are **deliberately excluded** from the install cache —
downloading 16 MB during installation would be hostile on mobile data, and
they are not needed for the app to work.

Add to Home Screen gives a standalone app with its own splash screens.

---

## 6. What this architecture gives up

Stated so the trade is visible:

- **No cross-device sync.** A participant who changes phone starts over
  unless they move a backup themselves.
- **No remote data collection.** Researchers receive data only when a
  participant hands it over. This is the correct trade for this cohort, but
  it does mean collection is manual.
- **No server-side validation.** Nothing can check a submission against
  anything else at the time it is made.
- **Browser storage is not durable.** `localStorage` can be cleared by the
  participant, by the browser under storage pressure, or by private
  browsing. The backup export is the mitigation, and participants must be
  told to use it.
