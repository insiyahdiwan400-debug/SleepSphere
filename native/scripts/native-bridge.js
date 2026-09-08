/**
 * SleepSphere native bridge.
 *
 * This file only ever runs inside the iOS bundle. It exposes one object,
 * window.SleepSphereNative, and guarantees three things:
 *
 *   1. Every method resolves. If HealthKit is unavailable, the user
 *      declined, or a read fails, the result is null and the app falls
 *      back to what the person typed. Health data is a convenience here,
 *      never a dependency — the app has always worked from manual entry
 *      and it still does.
 *   2. Nothing is requested until the person asks for it. Authorisation is
 *      only triggered from an explicit tap, because Apple rejects apps that
 *      show a HealthKit prompt on launch with no context.
 *   3. Nothing leaves the device. There is no network call anywhere in this
 *      file, which is what lets the App Privacy answers say "no data
 *      collected" honestly.
 */
(function () {
  'use strict';

  const cap = window.Capacitor;
  const isNative = Boolean(cap && cap.isNativePlatform && cap.isNativePlatform());
  const plugin = name => (cap && cap.Plugins && cap.Plugins[name]) || null;

  const Health = () => plugin('SleepSphereHealth');
  const Live = () => plugin('SleepSphereLiveActivity');

  const safe = async (work, fallback = null) => {
    try { return await work(); } catch (error) {
      console.warn('[SleepSphere] native call failed:', error && error.message);
      return fallback;
    }
  };

  const api = {
    isNative,

    /** True only when running on iOS with HealthKit present on the device. */
    async healthAvailable() {
      if (!isNative || !Health()) return false;
      const result = await safe(() => Health().isAvailable(), { available: false });
      return Boolean(result && result.available);
    },

    /**
     * Ask for read access. Must be called from a user gesture.
     * Returns { granted } — note that iOS deliberately does not tell an app
     * which read permissions were denied, so `granted` means "the sheet was
     * answered", not "everything was allowed". Reads still return null when
     * a specific type was refused, which is why every caller handles null.
     */
    async requestHealthAccess() {
      if (!(await api.healthAvailable())) return { granted: false };
      return safe(() => Health().requestAuthorization(), { granted: false });
    },

    /**
     * Yesterday's movement, as the 0–100 scale the Bio Harmony check-in
     * already uses, so it drops straight into the existing scoring.
     * Derived from active energy and workout minutes.
     */
    async activityLoad() {
      if (!(await api.healthAvailable())) return null;
      const result = await safe(() => Health().activitySummary({ days: 1 }));
      if (!result || typeof result.activeMinutes !== 'number') return null;
      const minutes = result.activeMinutes;
      const score = minutes >= 75 ? 100 : minutes >= 40 ? 80 : minutes >= 15 ? 55 : 25;
      return { score, activeMinutes: minutes, activeEnergy: result.activeEnergy ?? null,
               steps: result.steps ?? null, source: 'HealthKit' };
    },

    /**
     * Last night as HealthKit recorded it, in the shape the morning record
     * expects, so the flow can arrive pre-filled instead of asking.
     */
    async lastNightSleep() {
      if (!(await api.healthAvailable())) return null;
      const result = await safe(() => Health().sleepLastNight());
      if (!result || !result.inBedStart) return null;
      return {
        bedTime: result.inBedStart, sleepTime: result.asleepStart,
        wakeTime: result.inBedEnd, asleepMinutes: result.asleepMinutes ?? null,
        awakeMinutes: result.awakeMinutes ?? null, source: 'HealthKit'
      };
    },

    /**
     * Current cycle phase, mapped onto the options the check-in already
     * offers. Read only when the person has opted in, and only ever used
     * where the app says it will be.
     */
    async cyclePhase() {
      if (!(await api.healthAvailable())) return null;
      const result = await safe(() => Health().cycleContext());
      if (!result || !result.phase) return null;
      const map = { menstrual:'menstrual', follicular:'follicular', ovulatory:'ovulatory',
                    luteal:'luteal', pregnancy:'pregnancy', postpartum:'postpartum',
                    menopause:'menopause', irregular:'irregular' };
      return { cycle: map[result.phase] || 'other', dayOfCycle: result.dayOfCycle ?? null,
               source: 'HealthKit' };
    },

    /**
     * A Live Activity for tonight's wind-down, which is what surfaces in
     * the Dynamic Island and on the Lock Screen. Silently does nothing on
     * devices or OS versions without ActivityKit.
     */
    async startWindDown({ windStart, sleepStart, wakeAt, label }) {
      if (!isNative || !Live()) return { started: false };
      return safe(() => Live().start({ windStart, sleepStart, wakeAt, label }), { started: false });
    },
    async updateWindDown(payload) {
      if (!isNative || !Live()) return { updated: false };
      return safe(() => Live().update(payload), { updated: false });
    },
    async endWindDown() {
      if (!isNative || !Live()) return { ended: false };
      return safe(() => Live().end(), { ended: false });
    },

    /** A short tap when something is saved. No-op on the web. */
    async tap(style) {
      const haptics = plugin('Haptics');
      if (!isNative || !haptics) return;
      await safe(() => haptics.impact({ style: style || 'LIGHT' }));
    }
  };

  window.SleepSphereNative = api;
  if (isNative) document.documentElement.dataset.native = 'ios';
})();
