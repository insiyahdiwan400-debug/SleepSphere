# Research and fieldwork documentation

Commit `2dcabbd`. This document describes what the application provides as a
research instrument, and is explicit about which parts of a research
protocol **are not in this repository**.

---

## 1. What the study is

A sleep study with a student cohort at Jamea. Participants use SleepSphere
as an ordinary sleep companion; the research data is a by-product of their
own record-keeping rather than a separate burden placed on them.

The design consequence of that choice runs through the whole product: the
app has to be worth using on a night when nobody is collecting anything.

| | |
|---|---|
| Cohort tag | `jamea-v1` |
| Schema version | **3** |
| Storage mode | local-only |
| Collection | participant-initiated export |

---

## 2. The research instrument

### The study CSV — 50 columns, frozen

The CSV is the primary research output. Its 50 columns have not been added
to, renamed, reordered or removed by any recent work, and a test asserts the
count so a future change cannot quietly break a researcher's parser.

**One row per participant-day**, holding the current authoritative version
of that day. Superseded versions are deliberately absent from the CSV and
preserved in the JSON backup under `morningRevisions`, linked by
`supersedes` / `supersededBy`.

### The data dictionary ships with it

`studyDictionaryCsv()` is exported alongside the data, so the columns are
readable by someone who did not build the app — including the researcher,
months later. It carries a `(note) corrections` row explaining the
supersession model. That note lives in the dictionary and **not** in
`STUDY_COLUMNS`, so documenting it does not change the column count.

### Provenance travels with every value

`value_basis` records how each figure came to exist — what was measured,
what was estimated, and what the participant confirmed. Recent work
**appended** clauses to it and rewrote nothing, so:

| Record type | Before | After |
|---|---|---|
| Full-form | `all entered` | identical |
| Ordinary one-tap | `measured: …; estimated: …` | `… ; verification: unverified` |
| Doubted | same | `… ; verification: …; excluded from this participant's averages; unusual: …; wake from: app-open` |

A parser matching `"all entered"` exactly is unaffected. Files already
downloaded are untouched.

### Enrolment and acknowledgement

The app records `participantId`, `cohort`, `startDate`, `enrolledAt`,
`consentAck` and `consentAt` — an in-app acknowledgement of voluntary
participation, with a timestamp.

**This is an acknowledgement, not informed consent.** It is not a substitute
for a consent process run by the institution. See section 5.

---

## 3. Fieldwork position

`test/fieldwork.js` (153 checks) covers enrolment, the study panel, export
integrity and migration — specifically that a migration **cannot lose a
study**, which is the failure that would destroy a participant's
contribution silently.

What the field design assumes:

- Participants record in the morning, not at night. The night screen is
  deliberately reduced to one action.
- A participant who misses nights is not penalised and is not shown a
  broken streak, because there are no streaks.
- A participant who gets a night wrong can correct it, and the correction
  supersedes rather than overwrites, so the research record keeps both.
- Data leaves the phone only when the participant exports it and hands it
  over.

### The Fatimi calendar work is fieldwork

The prayer-time parameters were **wrong** until a real Dubai Dawat timetable
was checked against them, and the errors were the plausible ones — the
Ithna-Ashari answers you land on by reaching for the nearest published Shia
convention:

| | app had | timetable says | error |
|---|---|---|---|
| Sihori end | 04:54 (Fajr 16°) | **04:46** (17.7°) | 8 min late |
| Maghrib | 18:44 (4° down) | **18:30** (sunset) | 14 min late, daily |
| Nisf al-layl | 23:42 (to Fajr) | **00:16** (to sunrise) | 34 min early |

They are now checked against **two independent references** and must satisfy
both — `api.aladhan.com` method 7, and an offline transcription of
PrayTimes.js so a wrong answer cannot hide behind the API being down. Full
account in [`test/README.md`](../test/README.md).

This matters to the research because a wrong Maghrib shifts every planned
night by a quarter of an hour, every day, invisibly.

---

## 4. Ethics position as built

| Principle | How the build holds it |
|---|---|
| Data minimisation | No account, no identifiers beyond a participant code |
| Participant control | Export and erase are both one control in **Me** |
| No covert collection | No network path exists; this is structural |
| Sensitive data separated | Motherhood excluded from research export by default |
| No fabricated measurement | Unknown is represented as unknown, never as a number |
| No coercive engagement | No streaks, points, badges or return rewards |

---

## 5. What is **not** here — the honest gap

**The repository contains no written research protocol, no participant
information sheet, no informed-consent form, and no ethics approval
documentation.** The application supports a study; the study's own paperwork
has not been written.

For a student research submission this is likely the largest remaining gap,
and it is **writing rather than engineering**. Specifically missing:

1. **Protocol** — research question, hypotheses, sample size and
   justification, inclusion and exclusion criteria, duration, analysis plan.
2. **Participant information sheet** — what the study involves, what is
   collected, how long it is kept, how to withdraw.
3. **Informed-consent form** — the real one. The in-app `consentAck` is an
   acknowledgement of voluntary participation and should be described as
   such, not presented as consent.
4. **Ethics approval** — whatever the institution requires, with its
   reference.
5. **Data management plan** — who holds exports after collection, where,
   for how long, and who may see them. The app guarantees data stays on the
   phone; it guarantees nothing about what happens after a participant
   hands over a CSV, and that is the part a reviewer will ask about.
6. **Analysis plan** — which of the 50 columns answer the research
   question, and how.

These need the supervisor's input and the institution's templates. They are
not something the application can supply.
