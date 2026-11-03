# SleepSphere — why it reads as a prototype, and what to do about it

Written 3 November 2026 against `build/smart-assist-nov18` @ `745319b`.
This is an audit and a proposal. **Nothing in section 3 onward has been
built.** It needs your decision first, and one question in section 6
changes most of the answers.

---

## 1. The finding

SleepSphere does not *look* like a prototype. It **is** one, structurally,
and the product sits on top of it. Every cosmetic symptom below comes from
that, which is why removing the word "prototype" would not have worked.

The app currently asks a new user to:

1. read a consent notice,
2. accept or be issued a **participant code**,
3. be told *"This is a student research prototype, not medical care"*,
4. be told *"At the end of the study you choose to export your data and
   send it"*,
5. be told to open it from the Home Screen icon **"for the rest of the
   study"**.

Then it shows them a **study day counter**, an **Export study data**
button, *"Ready to export whenever your researcher asks for it"*, a
**Give feedback** screen — *"Try the three-step pathway, then give honest
feedback. You are testing the product—not being tested"* — and an
**Export feedback CSV** button.

That is not a consumer product with rough edges. It is a field-study
instrument. A person cannot "genuinely choose to use it every night"
while it is addressing them as a test subject.

### 1.1 Self-identifying prototype chrome

| Where | What it says |
|---|---|
| Browser tab / Home Screen | `SleepSphere Prototype — Bio Harmony` |
| Top bar, every screen | `V5 • TEST PROTOTYPE` pill |
| Top bar, every screen | `Share prototype` button |
| Learn | `Sources behind this prototype` |
| Travel | *"…rather than an early prototype"* |
| Data | `Load labelled demonstration data` |

### 1.2 It is a catalogue, not a place

**14 reachable screens behind 5 tabs**, plus Explore, which is literally a
list of 11 tiles. The brand mark reads `SleepSphere / The Sabat Loop` — an
internal name for the methodology, printed where a product name goes.

Screen names are engineering names: *Bio Harmony*, *Sabat Compass*,
*Experiment studio*, *Night console*, *Lazy mode*, *Step 1 of 3*.

### 1.3 Every screen explains itself

Measured across the views: **45 `helper` paragraphs**.

| Screen | Words of body copy |
|---|---|
| Learn | 613 |
| Bio Harmony | 390 |
| Morning record | 329 |
| Data | 312 |
| My Rest | 240 |

For contrast, the redesigned **My Rhythm is 28 words** and is the only
screen in the app that currently reads like a product. That is the target,
and it already exists — so this is a direction the codebase has proven it
can hold, not a hope.

### 1.4 The home screen is a control panel

Today currently shows, at once: a status line *"Night console ready"*, a
hero, **five competing buttons** (Start tonight's check-in / Start my
wind-down / Too tired — just go to bed / See my rhythm / Record morning), a
numbered **1-2-3 progress strip**, and four metric tiles reading
`Not planned`, `—`, `—`, `None`.

Four em-dashes and a numbered checklist is what a new user meets first.

---

## 2. What is genuinely good and must survive

This is not a rewrite. The engineering underneath is the strongest part of
the product and none of it is at risk:

- the Fajr/prayer engine, verified to the minute against an independent
  reference implementation;
- the verified Arabic, rendered from one source, never retyped;
- Motherhood's encrypted vault, the passcode, and the always-present
  neutral tab that discloses nothing;
- the storage guard that refuses to overwrite data it cannot parse —
  it caught my own bad seed last week;
- Smart Assist, My Rhythm's arithmetic, the Anwar photograph and grade;
- **69 suites, ~2552 assertions, green.**

---

## 3. The one structural decision

**Separate the product from the study. Do not delete the study.**

The research layer is load-bearing for your actual purpose, and the brief
has always said to preserve research integrity. So:

- **Default experience = the product.** No consent gate, no participant
  code, no study day, no feedback export, no prototype chrome.
- **Study mode = opt-in**, entered deliberately (a link you hand a
  participant, or a switch inside Me). Everything that exists today
  survives, unchanged, behind it: consent, participant ID, study day,
  export, feedback CSV.
- **Nothing is deleted.** The research screens keep working and keep
  their tests.

One flag decides which of the two a person is in. That is a day of work,
not a redesign, and it removes roughly 70% of what makes the app read as a
prototype.

---

## 4. Screen-by-screen

### Today → **Tonight**

| | |
|---|---|
| Stays | the real sky phase, the arc, the wind-down, Easy Mode, the morning check-in |
| Goes | the 1-2-3 progress strip, *"Night console ready"*, the four em-dash metric tiles, three of the five buttons |
| Becomes | the hour, where you are in it, and **one** thing to do. Metrics appear only once they have a value. |

### My Rest

| | |
|---|---|
| Stays | the week strip, the plan-vs-morning comparison, visible arithmetic |
| Goes | *"SleepSphere signature"*, the methodology paragraph, the "Also here" chip row |
| Becomes | your nights, and one honest sentence about them |

### My Rhythm — **no change**

Already at the standard. It is the reference for the rest.

### Smart Assist — **no change to behaviour**

Only the surrounding chrome changes.

### Sabat

| | |
|---|---|
| Stays | the verse, the duʿāʾ verbatim, the provenance note, the wind-down toggle |
| Goes | the duplicated page heading |
| Becomes | quieter. It is close already. |

### Jamea al Anwar — **no change**

Architecturally authentic, photographic, graded to the hour. Stays as is.

### Explore → fold into the places it belongs

The 11-tile catalogue is the clearest "feature list" in the app. Sounds
belong to the wind-down. Body scan and Breathing belong to the evening.
Flight Mode, Living Sky and Jamea al Anwar are *environments* and belong
together under one entry. Reflection and Gratitude belong to Clear my mind.

Nothing is removed; each thing moves to the screen it is for.

### Me

| | |
|---|---|
| Stays | wake time, target, soundscape preferences, export, erase |
| Goes | participant code, study day, researcher export, feedback (to study mode) |

### Private / Motherhood — **no change**

The neutral tab is a deliberate privacy decision and stays exactly as it is.

### Learn → **The Rest Lab**

613 words of essay becomes short evidence-backed entries, each with its
source. The content is good; the format is a document.

---

## 5. The journey

**Now:** consent → participant code → storage check → install prompt →
schedule → habits → Today, where five buttons and a numbered checklist
compete.

**Proposed:** one question — *when does your day usually start?* — then
Tonight, lit for the hour, with one thing to do. Everything else is
discovered in the place it is used.

---

## 6. What I need from you before building

**The blocking question: is the field study still running, or is
SleepSphere now a product you intend people to use?**

- If the study is live → I build the mode split (section 3) and leave the
  research path completely intact.
- If the study is finished → the same split, but study mode is simply never
  entered by default, and we can be more decisive in Me and Data.
- If both at once → the split is mandatory, which is what section 3
  assumes.

**Three smaller ones:**

1. **Name in the tab and on the brand mark.** `SleepSphere Prototype —
   Bio Harmony` → `SleepSphere`. Keep `The Sabat Loop` as a subtitle, or
   drop it?
2. **Imagery.** Anwar uses one licensed photograph. Do you want the same
   treatment for Tonight — a real photographic sky graded to the hour —
   or should Tonight stay drawn? Photographs mean sourcing and licensing
   time.
3. **Scope.** Section 4 is roughly a week. Do you want all of it, or the
   mode split plus Tonight first so you can judge the direction on one
   screen before I touch the rest?

---

## 7. What I will not do without being asked

- Delete the research layer, the consent text, or the export.
- Touch the prayer engine, the Arabic, or the Motherhood vault.
- Replace working features with mockups, or invent data to fill a screen.
- Merge or deploy to production.
