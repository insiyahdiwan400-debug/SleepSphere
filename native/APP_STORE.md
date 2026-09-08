# SleepSphere for iOS — build and submission runbook

This directory turns the web app at the repository root into a native iOS
app with HealthKit and a Dynamic Island Live Activity, ready to archive and
upload to App Store Connect.

**What is done, and what is not.** The Xcode project, the Swift plugins, the
JS bridge, the entitlements, the privacy manifest and the Info.plist strings
are all written and in place. They have **not been compiled**, because Swift
cannot be built on Linux — the machine this was assembled on has no Xcode.
Everything below marked **[Mac]** needs a Mac, and the first build is where
compile errors, if any, will surface. Budget an hour for that, not a week:
the surface area is 5 Swift files.

The web app itself is fully tested — 75 automated checks pass against both
the deployed build and the bundle in `www/`.

---

## 0. What you need

| Item | Notes |
|---|---|
| A Mac with Xcode 15+ | Xcode 16 recommended for the current iOS SDK |
| Apple Developer Program membership | £79/$99 per year, required to ship |
| CocoaPods **not** required | This project uses Swift Package Manager |
| A privacy policy at a public URL | **Mandatory** for any app touching HealthKit |

---

## 1. Build the web bundle and open Xcode  [Mac]

```bash
cd native
npm install
npm run ios          # builds www/, syncs it into ios/, opens Xcode
```

`npm run build` alone regenerates `www/` from the repository root. Run it
after any change to `index.html`, then `npx cap sync ios`.

---

## 2. Add the source files to the right targets  [Mac]

Capacitor generates the project; these files exist on disk but Xcode needs
to be told which target owns each one.

**App target** — drag into the `App` group if not already listed:
- `App/Plugins/SleepSphereHealthPlugin.swift`
- `App/Plugins/SleepSphereLiveActivityPlugin.swift`

**Both targets** — this one matters:
- `Shared/WindDownAttributes.swift` → tick **App** *and* **WindDownWidget**
  in the File Inspector's Target Membership.

> If the Live Activity never appears, this is almost always why. Two copies
> of the attributes type compile perfectly and then never match each other.

---

## 3. Create the widget extension  [Mac]

The Live Activity has to live in a widget extension; Xcode must create it so
it gets the right build settings and bundle ID.

1. **File → New → Target → Widget Extension**
2. Name it exactly `WindDownWidget`. Untick *Include Configuration
   Intent*. Tick **Include Live Activity**.
3. Delete the placeholder files Xcode generates.
4. Add the two files already on disk to the new target:
   `WindDownWidget/WindDownLiveActivity.swift`,
   `WindDownWidget/WindDownWidgetBundle.swift`
5. Confirm `Shared/WindDownAttributes.swift` is a member of this target too.

---

## 4. Signing and capabilities  [Mac]

On the **App** target, Signing & Capabilities:

- Set your Team. Bundle identifier is `com.sleepsphere.app` — change it in
  `capacitor.config.json` first if you want a different one, then re-sync.
- **+ Capability → HealthKit.** Leave *Clinical Health Records* off; the app
  does not read them.
- Verify `App/App.entitlements` is set as the Code Signing Entitlements file.

On the **WindDownWidget** target: same Team, bundle ID
`com.sleepsphere.app.WindDownWidget`.

Deployment target: **iOS 16.2** or later (ActivityKit's Live Activity API).
The HealthKit code guards `iOS 16.0` separately for sleep stages.

---

## 5. Icons

`Assets.xcassets/AppIcon` needs a 1024×1024 with **no transparency and no
rounded corners** — Apple applies the mask. `sleepsphere-icon-512.png` at the
repository root is the source artwork; it needs regenerating at 1024.

For iOS 18+ dark and tinted variants, and the iOS 26 layered treatment, use
Xcode's **Icon Composer**. This is cosmetic and does not block submission.

---

## 6. First run checklist  [Mac, on a real device]

HealthKit returns nothing in the Simulator, and Live Activities need real
hardware, so these must be checked on a device:

- [ ] App launches, sky matches the current hour
- [ ] "Connect Apple Health" appears on the Tonight screen (it stays hidden
      on the web and in the Simulator, by design)
- [ ] Tapping it shows the Health sheet with the usage string from §7
- [ ] Declining leaves every flow working by hand
- [ ] Accepting pre-fills movement in the evening check-in and times in the
      morning flow
- [ ] Saving a night plan starts the Live Activity; check the Dynamic Island
      on a Pro device and the Lock Screen on any
- [ ] Recording the morning ends it
- [ ] Airplane mode: everything still works — there is no network call

---

## 7. App Store Connect

**App Privacy.** The honest answers, which the `PrivacyInfo.xcprivacy` file
backs up:

| Question | Answer |
|---|---|
| Data collected | **None** |
| Data linked to the user | None |
| Tracking | **No** |
| Third-party SDKs | None |

Nothing leaves the device. There is no analytics, no account, no server.
Health data is read into memory, used to pre-fill a form, and never
transmitted or written back.

**Health-app questions.** You will be asked to confirm you do not use Health
data for advertising or share it with third parties. Both are **no**.

**Age rating.** 4+. There is no medical diagnosis claim anywhere in the app,
which is deliberate — see the safety copy on the Sleep guide screen.

**Review notes** — paste this in:

> SleepSphere is an offline sleep-reflection journal. All data is stored on
> device; the app makes no network requests and has no account system.
>
> HealthKit is read-only and optional. Tapping "Connect Apple Health" on the
> Tonight screen requests read access to activity, sleep analysis and
> menstrual flow. Every feature works without it — decline the prompt and the
> app asks for the same information by hand.
>
> The Live Activity is a countdown to the settle time from a saved night
> plan. To see it: open the app, tap "Start tonight's check-in", complete the
> questions, then save a night plan on the following screen.
>
> The app does not diagnose, treat or claim to measure sleep stages. It
> records what the person tells it and shows its own arithmetic.

**Guideline 4.2 (minimum functionality).** Apps that are only a website
wrapper get rejected. This one is not, and the review notes should make that
clear: it works fully offline, stores everything locally, reads HealthKit
through a native plugin and presents a Live Activity. If a reviewer raises
4.2, point at the HealthKit integration and the Live Activity.

---

## 8. Archive and upload  [Mac]

```
Product → Destination → Any iOS Device (arm64)
Product → Archive
Distribute App → App Store Connect → Upload
```

Then in App Store Connect: screenshots (6.7" and 6.5" required), description,
keywords, support URL, **privacy policy URL**, and submit.

---

## Architecture notes

**Why Capacitor rather than a SwiftUI rewrite.** The app is roughly 5,000
lines of tested logic — the Bio Harmony scoring, the Fajr-aware planner, the
Restoration Twin, the jet-lag light model, the restoration-need engine. A
rewrite throws away all of it and every test with it, for a UI that would be
new and unproven. Capacitor keeps that logic and adds native capability
exactly where native is genuinely required. If the app succeeds and the
native surface grows, migrating screen by screen later is straightforward.

**Everything native is additive.** `native-bridge.js` resolves every call to
null on the web, when HealthKit is missing, and when the person declines, and
every caller treats those three cases identically. The manual path is never
removed. That is what lets the same `index.html` ship to both Netlify and the
App Store, and it is why the web tests still pass against the native bundle.

**The service worker is stripped from the native build.** Capacitor serves
from the app bundle; a second cache layer only produces stale-asset bugs.
