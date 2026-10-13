# Known limitations and roadmap

Commit `58abc89`, deployed to production on 13 October 2026. Everything here
is a limitation that exists in the build being submitted. Nothing in this
document is a plan presented as a feature.

## 0. Deployment

Production is live at **https://sleepsphere1809.netlify.app** and serves
`58abc89`. The deploy was a clean fast-forward and was byte-verified: the
served `index.html` differs from the commit by exactly **114 bytes** of
Netlify injection — a rewritten `data-netlify` form tag and one HUD script
— which is the signature the handover records.

The feedback form delivers only on this site, which is why it was deployed.

One caveat about the verification, stated because it looked alarming at
first: a browser smoke test run **from this container** reports random
subsets of assets failing with `ERR_TOO_MANY_RETRIES`, and a different
subset each run. That is the container's egress proxy, not the site. Every
asset returns 200 to `curl`, every deployed file is byte-identical to the
repository, and a smoke test against those exact mirrored bytes passes
13/13. Anyone re-running the live test from a restricted network should
expect the same noise.

---

## 1. The Living Sky

**The limitation:** playback of the two bundled sky clips **has never been
verified on an iPhone, or on any real device.**

The reason is specific and is not a defect in the files. The project's test
browser is a Chromium build **without H.264**:
`canPlayType('video/mp4; codecs="avc1.42E01E"')` returns the empty string.
It cannot decode the clips even in principle, so the one thing that matters
— that an iPhone renders them — cannot be established in this environment.

**What *is* verified:**

- Both clips are H.264 in an MP4 container, read from the `avc1` entry in
  the sample-description box of the files themselves, not from a filename
  or a site's "format" label. (A site reading "MPEG4" names the container;
  an MPEG-4 Part 2 file would carry `mp4v` and would not play on an iPhone.)
- Both are **CC BY 2.0**, credited in [`CREDITS.md`](../CREDITS.md) and on
  screen whenever a clip actually plays, because the licence requires credit
  wherever the work appears.
- The adapter's play path works against real video, proved with a WebM
  fixture the test browser *can* decode.
- The failure path degrades correctly: after a 12-second timeout the layer
  reports `unavailable`, the drawn sky remains, and all four destinations,
  the sleep engine and the Motherhood boundary are untouched.

**The mitigation:** the footage layer is **off by default**. The app opens
on the drawn sky at about 1 MB with no video element at all. Footage is one
button (`Sky: real`) or one parameter (`?sky=real`).

**The rule that is never relaxed:** the drawn sky is a fallback. It is never
described anywhere in the app as recorded footage, and `off` is kept
distinct from `unavailable` — *off* means nobody asked for footage,
*unavailable* means this daypart has no recording. A test asserts the app
makes no claim of authenticity about the drawn sky.

### Dayparts with no footage at all

`dawn`, `morning` and `day` have **no recording**. They are absent from the
manifest rather than pointed at a placeholder. Candidates were found and
rejected on honest grounds — 67.8 MB and 208 MB files with no transcoder in
this toolchain to cut them, one clip titled "Animation" that could not be
confirmed as a recording, and NC/ND licences that forbid the use or the
re-encoding. The rejections are tabulated in `CREDITS.md`.

---

## 2. Reported instability not yet reproduced

The preview has been reported as glitching on a real phone. **This has not
been reproduced and its cause is not known.** What has been ruled out:

| Suspected | Measured | Verdict |
|---|---|---|
| Frame rate | median 16.7 ms, p95 16.7 ms, 0 long tasks | not a cause here |
| `backdrop-filter` cost | 65 in the document, **2 on screen** | ruled out |
| Page weight | was 6 MB with video, now **1 075 KB** | plausible, now mitigated |
| Video compositing | removed from the default path | plausible, now mitigated |

Two of the four plausible causes were removed by making footage opt-in. The
`Sky: drawn` / `Sky: real` button exists so the fault can be isolated on the
device that actually shows it: if the trouble follows the video, it is the
video.

**This remains open** until someone reports what the glitch looks like on a
real phone.

---

## 3. Unverified on real hardware

No part of this application has been tested on a physical iPhone by the
engineering process. All browser testing was automated Chromium at an
iPhone-shaped viewport (390 × 844, 2×, touch, mobile user agent), which
exercises layout and logic but is **not** a device test. It cannot speak to
Safari-specific rendering, iOS gesture behaviour, Low Power Mode, Add to
Home Screen behaviour, or real network conditions.

---

## 3b. Soundscape, honestly

Six synthesised layers, no files and nothing licensed. Two limits worth
stating:

- **Snowfield is the weakest.** Snow mostly sounds like low wind, and a
  single bandpass cannot render "muffled" as a quality distinct from
  "quiet and low". It was separated from Night air by movement rather
  than by tone, which is audible but is the thinnest distinction of the
  six. If a tester says it is redundant, they are right and it should go.
- **There is no Forest, and no birdsong.** A filter bank cannot produce
  it. The tree layer is called Leaves because that is what it is.

Real field recordings would fix both, and would reintroduce exactly the
problems the synthesis avoids: licensing, megabytes, and a download on a
screen meant for going to sleep.

---

## 4. Incomplete features

| Item | State |
|---|---|
| **Research paperwork** | Protocol, information sheet, consent form, ethics approval, data management plan — **none written**. See [RESEARCH.md §5](RESEARCH.md#5-what-is-not-here--the-honest-gap). |
| **Space and Sanctuary worlds** | Specified in [`WORLDS.md`](../WORLDS.md) §6, **not built**. Only `plain` and `flight` are registered. |
| **Jame al Anwar** | **Blocked.** The only reference supplied is a watermarked third-party photograph. Rather than invent architecture, [`JAMEALANWAR.md`](../JAMEALANWAR.md) §5 records what will not be done without authentic references. |
| **Participant's own sky photographs** | Unused. Permission to publish or redistribute them was never given. |
| **`test/trailer.js`** | Stale. Drives `.nav button[data-view="plan"]`; the four-destination consolidation removed that view. Contributes 0 checks and fails identically at the rollback point `57ba4e5`. Not an app defect. |

---

## 5. Architectural trades, accepted

These are consequences of the design rather than bugs, listed so a reviewer
sees them as choices.

- **No cross-device sync.** Changing phone means starting over unless a
  backup is moved by hand.
- **`localStorage` is not durable.** It can be cleared by the participant,
  by the browser under storage pressure, or by private browsing. The backup
  export is the mitigation and participants must be told to use it.
- **Collection is manual.** Data reaches a researcher only when a
  participant exports and hands it over.
- **Encryption is at-rest only.** The Motherhood vault defeats someone
  reading storage off a device or a backup. It does not defeat a
  compromised device, a keylogger, a malicious extension, or anyone holding
  the passcode.

---

## 6. Roadmap

### Before submission (15 October)

1. **Recruit testers to the live site** and collect feedback. This is now
   unblocked: the form delivers, and the four interface variants are
   reachable from the tester screen so "which deserves to stay" can
   actually be answered.
2. **Write the research paperwork** with the supervisor. Largest remaining
   gap, and the one a reviewer will probe first.
3. **Open the live site on a real iPhone** and report what the reported
   glitching looks like. Still the only item that cannot be progressed
   without the device.
4. Decide whether the footage is demonstrated at all, now that it is
   optional and unverified.

### Immediately after

5. Verify H.264 on a real device; if it works, consider whether footage
   should default on, and re-tune the three scrim values — they were chosen
   against a drawn sky because the footage could not be seen.
6. Raise or make adaptive the 12-second media timeout. An 11.5 MB clip on
   mobile data may exceed it and fall back although it would have played.
7. Retire or rewrite `test/trailer.js`.

### Next development cycle

8. Source `dawn`, `morning` and `day` footage, which needs either a
   transcoder in the toolchain or smaller licensed sources.
9. Build Space and Sanctuary, already specified.
10. Jame al Anwar, if and only if authentic references can be licensed.
11. Consider an optional encrypted sync, given `localStorage` durability is
    the clearest risk to a participant's months of records.
