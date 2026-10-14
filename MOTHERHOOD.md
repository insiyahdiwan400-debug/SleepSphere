# SleepSphere Motherhood — architecture and privacy boundary

An integral, optional module of the Jamea SleepSphere app. Same codebase,
same deployment, same design system, same roadmap. Not a separate product
and not a second application.

This document is the boundary. It is written before the module's interface
because the boundary is what makes the interface safe to build.

---

## 1. Status

**Collection is off.** The interface and the architecture are built; no
sensitive Motherhood value is written anywhere. That is a deliberate
application of the product owner's own rule:

> If adequate privacy protections cannot be provided, implement the
> interface and architecture without enabling sensitive-data collection
> until the limitation is resolved.

Section 4 lists exactly what has to be true before the gate opens, and
section 7 lists what is still missing.

---

## 2. What was already here

Motherhood is not greenfield. The app has touched this data since before
the module existed, and the audit found it in three places:

| Where | What |
|---|---|
| `index.html` Bio Harmony check-in | A `<select>` already offering `pregnancy`, `postpartum`, `menstrual`, `luteal`, `perimenopause/menopause` |
| `index.html` restoration need | With `settings.useCycle` on, `luteal / menstrual / pregnancy / postpartum` widen the night by 15 minutes, with a visible reason |
| `native/scripts/native-bridge.js` | The HealthKit bridge maps Apple Health `cycleContext()` onto those same values |

So the question this document answers was already live. The module
formalises an existing boundary rather than opening a new one.

What the audit also found, and what is already right: **the 50-column
research export contains no cycle or pregnancy field.** It carries
`bio_checkin_present` and seven 0–100 dimensions and nothing else. The
sensitive value lives only in the participant's own Bio Harmony CSV, which
they download for themselves. Motherhood inherits that model unchanged.

---

## 3. The four hazards the architecture has to close

Found by audit, with the evidence.

**H1 — the full-state JSON export.** `#exportStudyJson`, labelled "Export
full copy for safekeeping", serialises the entire `state` object verbatim.
It sits in the fieldwork panel directly beside "Export study data", whose
on-screen note reads *"Send both files to your researcher."* A participant
with Motherhood enabled who taps the neighbouring button hands a researcher
every Motherhood field, in a file named after their participant code.

**H2 — `shapeState` passes unknown keys through.** `{ ...clone(defaults),
...stored }` means anything added to `state` is automatically persisted,
exported, backed up and re-imported with no code change and no review.
Good for schema evolution. Wrong for this.

**H3 — the private backup.** `SleepSphere_Private_Backup.json` has the same
property as H1, and a backup file is the thing most likely to be e-mailed
to oneself or left in a shared Downloads folder.

**H4 — no lock of any kind.** One plaintext key, `sleepsphere_state_v2`.
No passcode, no encryption, no separate store. The audit grepped for all
three. Anyone holding the unlocked phone reads everything, and this is a
cohort where phones are plausibly handed around.

Not a hazard, checked and clear: `sw.js` caches only the static shell. No
state reaches Cache Storage.

---

## 4. The boundary

**B1 — a separate namespace.** Motherhood lives under its own storage key,
never inside `state`. This closes H1, H2 and H3 in one move: the two full
JSON exports serialise `state`, and `state` does not contain it.

**B2 — the opt-in flag lives in that namespace too.** Not in
`state.settings`. If the flag sat in settings it would ride both JSON
exports and tell a researcher the participant enabled the module — which is
precisely the presence signal that section 5 says requires its own consent.
The flag is part of the secret, not part of the frame around it.

**B3 — deny by default on export.** Both JSON exports pass through an
allowlist, not a denylist. A new Motherhood field added in a year's time is
excluded because it was never named, rather than included because nobody
remembered to exclude it. Proved by test, not by review.

**B4 — off means absent.** Not `hidden`, not `display:none`, not
`visibility`. When the module is off, no Motherhood element, id or label
exists in the rendered page and nothing Motherhood-shaped is readable on
screen. Someone scrolling another person's phone finds nothing.

With one honest limitation, found by the boundary's own test rather than
assumed away: this is a single file with no build step, so the **module's
source is in the page for every user**, identically, whether they have ever
enabled it or not. View-source shows that SleepSphere *has* a Motherhood
module. It does not show that *this participant* uses it — the document is
byte-identical either way, which the test pins down by comparing both its
length and its Motherhood occurrence count across an enabled and a disabled
device. Against the threat this module is really for — someone picking up
an unlocked phone — that holds. Against someone in devtools it is H4, not
B4, that matters, and H4 is listed as unresolved in section 7.

**B5 — erase means erase.** The namespace is cleared by the existing
"erase everything" path. A separate store that survives the app's own
delete button is a trap, not a protection.

**B6 — the research export does not change.** 50 columns stay 50. See
section 5.

---

## 5. Research

The product owner's decision: **a presence flag only** — the research CSV
may eventually gain a 0/1 "module enabled", and no sensitive value ever
leaves the device.

That flag is **not** implemented here, deliberately:

- It makes the export 51 columns, and the governing constraint on the
  current milestone is that the 50-column export stays unchanged.
- A presence flag is still a disclosure. "This participant is in the
  Motherhood module" is, in a cohort this size, close to "this participant
  is pregnant, postpartum or caring for an infant at night". It needs its
  own consent wording, not an inherited one.
- It needs a `SCHEMA_VERSION` bump and the dictionary row that goes with it.

So it is a separate, separately approved change. Until then Motherhood
contributes **nothing** to the research export, and the tests assert that a
Motherhood-enabled device produces a byte-identical CSV to one without.

Anything beyond a presence flag is a consented sub-study with its own
columns, its own schema and its own ethics reference.

---

## 6. Data classes

All four are in scope per the product owner, in ascending sensitivity:

1. **Night waking from a child** — wake counts, duration, who got up.
   Closest to the existing recording model and to the Fajr-fragmentation
   design already drafted.
2. **Pregnancy and postpartum stage** — trimester or weeks postpartum, as
   planning context so the night adapts. Health data in the GDPR Art. 9
   sense.
3. **Feeding and night care** — night feeds, expressing, settling. Highly
   identifying in combination and the likeliest to be glanced at.
4. **Fertility and cycle** — beyond the coarse phase picker that already
   exists. The highest-risk class in the app.

Classes 2–4 stay behind the closed collection gate until section 7 is
empty. Class 1 is the first candidate to open, because it is ordinary sleep
fragmentation and the app already records fragmentation honestly.

---

## 7. What is still missing before collection opens

- **No at-rest protection.** B1–B5 control where the data goes; none of
  them stop someone reading it off an unlocked phone. A device-passcode
  gate or an encrypted namespace is the open question, and until it is
  answered classes 2–4 stay shut.
- **Consent wording** for the module, separate from the study consent.
- **`privacy.html`** has to describe the module before it can collect.
- **The presence-flag decision** in section 5, with its schema bump.

---

## 8. What may not change

Everything `DESIGN.md` section 7 protects, unchanged: `state.mornings`,
`state.morningRevisions`, correction chains, verification and provenance,
unknown sleep duration as `null`, experiment baseline links, JSON
import/export, `SCHEMA_VERSION = 3`, the 50-column research export, prayer
calculation, Fajr-aware planning, fieldwork logic and the feasibility
layer.

Motherhood is additive. It does not alter one existing participant record,
one existing calculation, or one existing column.

---

## 9. Design

The module is the same visual system — the daypart tokens, the type scale
and the Living Sphere from `DESIGN.md`, not a second identity bolted on.
Discretion is a design constraint, not only a storage one: no lock icon, no
badge, no distinct colour that marks the phone's owner out at a glance.
When it is on it looks like the rest of the app. When it is off it is not
there at all.
