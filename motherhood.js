/**
 * SleepSphere Motherhood.
 *
 * An integral, optional module of this app — same codebase, same design
 * system, same deployment. MOTHERHOOD.md is the boundary this implements;
 * read it before changing anything here.
 *
 * Three rules govern every line below.
 *
 *   1. It writes nothing through any route but `window.__motherhood`, and
 *      it reads nothing the participant did not enter. It never touches
 *      `state`, never recomputes a sleep figure, and never writes a
 *      morning record. The sleep engine is unaffected by this module
 *      existing.
 *   2. Off means ABSENT (boundary B4). When the module is off there is no
 *      Motherhood element, id, label or nav entry in the document. The
 *      entry point that turns it ON is identical on every device, enabled
 *      or not, so finding it discloses nothing about its owner.
 *   3. Nothing here is a measurement. Every number on screen was typed by
 *      the person who owns it. Where a thing was not recorded it reads as
 *      not recorded — never as zero, never as an estimate.
 *
 * AT REST. MOTHERHOOD.md section 7 left one blocker open: the boundary
 * controls where this data goes, but nothing stopped it being read off an
 * unlocked phone. That is the actual threat this module is for, so the
 * vault is encrypted with AES-GCM under a key derived from a passcode the
 * participant chooses (PBKDF2-SHA256). localStorage holds ciphertext and
 * nothing else — no field names, no stage, no dates.
 *
 * What that honestly buys, and what it does not: it defeats someone who
 * picks up an unlocked phone and goes looking, including through devtools,
 * because there is nothing readable there. It does NOT defeat someone who
 * can run script in the page while the vault is unlocked — the key is in
 * memory then, as it must be for the screen to show anything. That is the
 * same exposure every client-side vault has, and it is stated in the
 * module's own privacy screen rather than glossed.
 */
(function () {
  'use strict';

  const MH = window.__motherhood;
  if (!MH || !window.crypto || !window.crypto.subtle) return;

  const VAULT_VERSION = 1;
  const KDF_ITERATIONS = 250000;

  /* ------------------------------------------------------------------
     Small helpers. `esc` exists because every string below came from a
     person typing into a textarea, and this module builds markup.
     ------------------------------------------------------------------ */
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const uid = () => Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  const todayIso = (d = new Date()) => {
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  };
  const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

  /* A date the participant typed, shown the way they would say it. */
  function prettyDate(iso) {
    if (!iso) return '';
    const d = new Date(iso + 'T12:00:00');
    if (isNaN(d)) return iso;
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  /* ==================================================================
     THE VAULT — encryption.
     ================================================================== */

  async function deriveKey(passcode, salt, iterations) {
    const base = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(passcode), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  async function sealVault(vault, key) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = new TextEncoder().encode(JSON.stringify(vault));
    const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
    return { iv: b64(iv), data: b64(cipher) };
  }

  /* A wrong passcode fails the GCM authentication tag, so `decrypt` throws
     rather than returning plausible rubbish. That is the whole check —
     there is no stored hash of the passcode to attack separately. */
  async function openVault(cipher, key) {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: unb64(cipher.iv) }, key, unb64(cipher.data));
    return JSON.parse(new TextDecoder().decode(plain));
  }

  /* ==================================================================
     SESSION — the unlocked vault lives here and nowhere else.
     ================================================================== */
  const session = { key: null, vault: null };

  const isEnabled = () => { try { return MH.enabled(); } catch { return false; } };
  const record = () => { try { return MH.get() || null; } catch { return null; } };
  const isUnlocked = () => Boolean(session.key && session.vault);

  function blankVault() {
    return {
      v: VAULT_VERSION,
      stage: '',                 // 'pregnancy' | 'postpartum' | ''
      pregnancy: { dueDate: '' },
      postpartum: { birthDate: '', feeding: '' },
      entries: [],
      revisions: [],             // superseded entries, never deleted silently
      hideFromNav: false,
      createdAt: new Date().toISOString()
    };
  }

  async function persist() {
    if (!isUnlocked()) throw new Error('locked');
    const cipher = await sealVault(session.vault, session.key);
    const existing = record() || {};
    MH.set({
      enabled: true,
      v: VAULT_VERSION,
      kdf: existing.kdf,
      cipher
    });
  }

  async function createVault(passcode) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveKey(passcode, salt, KDF_ITERATIONS);
    session.key = key;
    session.vault = blankVault();
    const cipher = await sealVault(session.vault, key);
    MH.set({
      enabled: true,
      v: VAULT_VERSION,
      kdf: { salt: b64(salt), iter: KDF_ITERATIONS },
      cipher
    });
  }

  async function unlock(passcode) {
    const rec = record();
    if (!rec || !rec.kdf || !rec.cipher) throw new Error('no vault');
    const key = await deriveKey(passcode, unb64(rec.kdf.salt), rec.kdf.iter || KDF_ITERATIONS);
    const vault = await openVault(rec.cipher, key);   // throws on a wrong passcode
    session.key = key;
    session.vault = vault;
    return vault;
  }

  function lock() {
    session.key = null;
    session.vault = null;
  }

  /* ==================================================================
     STAGE — derived, never stored. A trimester computed from a due date
     the participant typed is arithmetic on their own figure; a trimester
     STORED is a second source of truth that goes stale every week.
     ================================================================== */

  function pregnancyProgress(vault, now = new Date()) {
    const due = vault.pregnancy && vault.pregnancy.dueDate;
    if (!due) return null;
    const daysToDue = daysBetween(todayIso(now), due);
    /* 40 weeks from the last period is the convention a due date is set
       by, so weeks completed counts back from it. */
    const weeks = Math.floor((280 - daysToDue) / 7);
    if (weeks < 0 || weeks > 45) return null;
    const trimester = weeks < 13 ? 1 : weeks < 27 ? 2 : 3;
    return { weeks, daysToDue, trimester, due };
  }

  function postpartumProgress(vault, now = new Date()) {
    const born = vault.postpartum && vault.postpartum.birthDate;
    if (!born) return null;
    const days = daysBetween(born, todayIso(now));
    if (days < 0 || days > 1100) return null;
    return { days, weeks: Math.floor(days / 7), born };
  }

  /* ==================================================================
     ENTRIES. Append-only with a correction chain, which is how the rest
     of this app treats a record the participant may revise — see
     `state.morningRevisions`. Editing supersedes; it does not overwrite.
     ================================================================== */

  const KINDS = ['night', 'day', 'feed', 'weight', 'appointment'];

  function liveEntries(vault, kind) {
    const superseded = new Set(vault.entries.map(e => e.supersedes).filter(Boolean));
    return vault.entries
      .filter(e => !superseded.has(e.id))
      .filter(e => !kind || e.kind === kind)
      .sort((a, b) => (b.date || '').localeCompare(a.date || '') ||
                      (b.createdAt || '').localeCompare(a.createdAt || ''));
  }

  async function addEntry(entry) {
    if (!isUnlocked()) throw new Error('locked');
    if (!KINDS.includes(entry.kind)) throw new Error('unknown kind');
    const full = {
      id: uid(),
      supersedes: entry.supersedes || null,
      kind: entry.kind,
      date: entry.date || todayIso(),
      createdAt: new Date().toISOString(),
      ...entry
    };
    session.vault.entries.push(full);
    if (entry.supersedes) session.vault.revisions.push(entry.supersedes);
    await persist();
    return full;
  }

  async function removeEntry(id) {
    if (!isUnlocked()) throw new Error('locked');
    const before = session.vault.entries.length;
    session.vault.entries = session.vault.entries.filter(e => e.id !== id);
    if (session.vault.entries.length === before) return false;
    await persist();
    return true;
  }

  async function setStage(stage, detail) {
    if (!isUnlocked()) throw new Error('locked');
    session.vault.stage = stage;
    /* A transition keeps everything. Someone who moves from pregnancy to
       postpartum has nine months of their own records in here, and losing
       them at the moment of the birth would be indefensible. */
    if (stage === 'pregnancy') Object.assign(session.vault.pregnancy, detail || {});
    if (stage === 'postpartum') Object.assign(session.vault.postpartum, detail || {});
    await persist();
  }

  /* ==================================================================
     INSIGHTS. Only from what is actually in the vault, and silent when
     there is not enough. No scores, no judgements, no projections.
     ================================================================== */

  function summarise(vault, now = new Date()) {
    const nights = liveEntries(vault, 'night');
    const days = liveEntries(vault, 'day');
    const feeds = liveEntries(vault, 'feed');
    const since = todayIso(new Date(now.getTime() - 7 * 86400000));
    const recentNights = nights.filter(n => n.date >= since);
    const recentDays = days.filter(d => d.date >= since);

    /* Rest held, not "sleep". These are intervals the participant typed,
       so the honest name for the total is the time they said they rested —
       never "you slept", which would be a measurement this app did not
       make. Nights without intervals contribute nothing and are counted
       as not recorded rather than as zero. */
    const withRest = recentNights.filter(n => Array.isArray(n.restIntervals) && n.restIntervals.length);
    const restMinutes = withRest.map(n => n.restIntervals.reduce((sum, iv) => {
      const a = toMin(iv.from), b = toMin(iv.to);
      if (a == null || b == null) return sum;
      return sum + (b >= a ? b - a : (1440 - a) + b);
    }, 0));

    const mean = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
    const num = (arr, f) => arr.map(f).filter(v => typeof v === 'number' && !isNaN(v));

    return {
      nightsRecorded: recentNights.length,
      nightsWithRest: withRest.length,
      meanRestMinutes: mean(restMinutes),
      meanWakings: mean(num(recentNights, n => n.wakings)),
      meanFatigue: mean(num(recentDays, d => d.fatigue)),
      meanEnergy: mean(num(recentDays, d => d.energy)),
      daysRecorded: recentDays.length,
      feedsRecorded: feeds.filter(f => f.date >= since).length,
      totalEntries: liveEntries(vault).length
    };
  }

  function toMin(hhmm) {
    if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm)) return null;
    const [h, m] = hhmm.split(':').map(Number);
    if (h > 23 || m > 59) return null;
    return h * 60 + m;
  }

  function fmtDuration(mins) {
    if (mins == null || isNaN(mins)) return null;
    const h = Math.floor(mins / 60), m = Math.round(mins % 60);
    return h ? (m ? h + 'h ' + m + 'm' : h + 'h') : m + 'm';
  }

  /* ==================================================================
     EXPORT. The participant's own copy, never the researcher's. It is
     built here, from the decrypted vault, and it is the ONLY route by
     which any of this leaves the device — initiated by the person, as a
     download, with no network call anywhere in this file.
     ================================================================== */

  function buildExport(vault) {
    return {
      file: 'sleepsphere-motherhood',
      note: 'Your private Motherhood records. This file is not part of any ' +
            'research export and was never sent anywhere. Keep it somewhere safe.',
      exportedAt: new Date().toISOString(),
      vaultVersion: vault.v,
      stage: vault.stage,
      pregnancy: vault.pregnancy,
      postpartum: vault.postpartum,
      entries: liveEntries(vault)
    };
  }

  function download(name, text) {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* ==================================================================
     CONTENT. Educational material and the warning signs.

     Every line below is general information of the kind a midwife or a
     public health leaflet gives, phrased so it cannot be read as a
     judgement about this person. Nothing here diagnoses, and nothing
     here promises an outcome.
     ================================================================== */

  const SYMPTOMS = {
    pregnancy: ['Heartburn', 'Nausea', 'Back or hip pain', 'Leg cramps',
      'Restless legs', 'Short of breath', 'Up to the bathroom', 'Tightenings',
      'Vivid dreams', 'Too hot'],
    postpartum: ['Afterpains', 'Soreness', 'Engorgement', 'Night sweats',
      'Low mood', 'Anxious', 'Hair loss', 'Headache', 'Too hot', 'Back pain']
  };

  const LESSONS = {
    pregnancy: [
      ['Side-lying gets easier with support',
       'From the second trimester onward most guidance suggests settling on your side ' +
       'rather than flat on your back, because the weight of the uterus can press on a ' +
       'large vein when you lie face up. A pillow between the knees and one supporting ' +
       'the bump takes the strain off the hips and lower back. If you wake up on your ' +
       'back, simply turn over — the advice is about how you settle, not about ' +
       'policing yourself through the night.'],
      ['Broken sleep in late pregnancy is ordinary',
       'Waking several times a night becomes common as pregnancy goes on — to turn ' +
       'over, for the bathroom, because of heartburn or because the baby is moving. ' +
       'This is not a sign that something is wrong with your sleep, and it is not ' +
       'something to fix by trying harder. Protecting the opportunity to rest matters ' +
       'more than the number of unbroken hours.'],
      ['Heartburn and the last meal',
       'Lying flat soon after eating makes reflux more likely, and reflux is one of the ' +
       'most common reasons for waking in later pregnancy. Leaving a couple of hours ' +
       'between the last substantial meal and lying down, and raising the head of the ' +
       'bed slightly, are the usual first suggestions. Persistent heartburn is worth ' +
       'mentioning to your midwife — there are safe options.'],
      ['Restless legs is worth mentioning',
       'An urge to move the legs in the evening that eases when you move them is ' +
       'common in pregnancy and is sometimes linked to iron levels. It is a reasonable ' +
       'thing to raise at an appointment rather than something to endure quietly.']
    ],
    postpartum: [
      ['Fragmented sleep is not failed sleep',
       'Newborn sleep comes in short cycles, and yours will follow it. Total rest ' +
       'across the whole day matters more in these months than any single unbroken ' +
       'stretch, which is why this module records intervals rather than one bedtime ' +
       'and one wake time. A night of four broken stretches is a real night of rest.'],
      ['Sharing the night where you can',
       'Where there is another adult, alternating who handles a waking — or taking a ' +
       'first and second shift — gives each person one longer stretch rather than two ' +
       'equally broken ones. A longer stretch is worth more than its length suggests.'],
      ['Rest is not only sleep',
       'Lying down without sleeping still lowers the physical load, and in the early ' +
       'weeks that counts. This module lets you record a rest interval whether or not ' +
       'you think you slept through it, because you cannot reliably tell and should ' +
       'not have to try.'],
      ['Mood in the early weeks',
       'Tearfulness and mood swings in the first two weeks are common and usually ' +
       'settle. Low mood, anxiety or a flatness that lasts beyond that, or that stops ' +
       'you doing what you need to do, is worth raising with your midwife, health ' +
       'visitor or doctor. It is common, it is treatable, and asking early is not an ' +
       'overreaction.']
    ]
  };

  /* Presented as "contact someone today", never as a diagnosis, and never
     computed from anything the participant recorded — this module does not
     watch their entries and decide they are unwell. It is a reference list
     they can open when they want it. */
  const SEEK_CARE = {
    pregnancy: [
      'Bleeding from the vagina',
      'Severe or persistent headache, especially with visual changes or spots',
      'Sudden swelling of the face, hands or feet',
      'Pain under the ribs on the right side',
      'The baby moving less than usual, or a change in the pattern of movement',
      'Fever, or feeling generally very unwell',
      'Severe abdominal pain, or waters breaking'
    ],
    postpartum: [
      'Bleeding that soaks a pad in an hour, or passing large clots',
      'Fever, chills, or wound or stitches that are hot, swollen or leaking',
      'A red, painful area on the breast with flu-like symptoms',
      'Pain, swelling or redness in one calf',
      'Chest pain or difficulty breathing',
      'Severe headache, or visual changes',
      'Thoughts of harming yourself or your baby, or feeling unable to cope'
    ]
  };

  /* ==================================================================
     Expose a tested seam. The interface below is one consumer of it; the
     test suite is another, so the data layer can be proved without
     driving the DOM.
     ================================================================== */
  window.SSMotherhood = {
    VAULT_VERSION,
    isEnabled, isUnlocked,
    createVault, unlock, lock, persist,
    vault: () => session.vault,
    addEntry, removeEntry, setStage, liveEntries,
    pregnancyProgress, postpartumProgress, summarise,
    buildExport,
    KINDS, SYMPTOMS, LESSONS, SEEK_CARE,
    toMin, fmtDuration, prettyDate,
    /* Erase. The vault, the key, the flag and the namespace — all of it,
       in one call, reachable from inside the module and from the app's own
       "erase everything" path (boundary B5). */
    async erase() {
      lock();
      try { MH.clear(); } catch {}
    }
  };
})();
