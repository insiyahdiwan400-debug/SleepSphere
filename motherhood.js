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
      scene: 'aurora',            // Encrypted preference; never stored outside vault
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
    const generation = sessionGeneration;
    const key = session.key;
    const vault = session.vault;
    const cipher = await sealVault(vault, key);
    /* Identity and generation both, because they catch different things:
       identity catches a different vault being swapped in, the counter
       catches a lock-then-unlock that happened to land on the same
       objects. Either one means these ciphertext bytes are stale. */
    if (generation !== sessionGeneration) throw new Error('locked');
    if (session.key !== key || session.vault !== vault) throw new Error('locked');
    const existing = record();
    if (!existing || !existing.kdf) throw new Error('vault erased');
    MH.set({
      enabled: true,
      v: VAULT_VERSION,
      kdf: existing.kdf,
      cipher
    });
  }

  async function createVault(passcode) {
    /* Never replace an existing encrypted vault during setup or overlapping requests. */
    if (isEnabled() || record()) throw new Error('vault already exists');
    const generation = sessionGeneration;
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveKey(passcode, salt, KDF_ITERATIONS);
    if (generation !== sessionGeneration || document.hidden) throw new Error('locked');
    /* Prepare the vault locally. A failed encryption or storage write must
       never leave a new, unsaved vault marked as unlocked in memory — the
       screen would then show an empty, working module whose contents are
       not on the device, and the first thing written into it would be lost
       without any error the person could see. */
    const vault = blankVault();
    const cipher = await sealVault(vault, key);
    /* Checked again, and before the write: a vault locked while it was
       being encrypted must not land on the device as an enabled one. */
    if (generation !== sessionGeneration || document.hidden) throw new Error('locked');
    /* Recheck after PBKDF2/encryption: another setup may have completed. */
    if (isEnabled() || record()) throw new Error('vault already exists');
    MH.set({
      enabled: true,
      v: VAULT_VERSION,
      kdf: { salt: b64(salt), iter: KDF_ITERATIONS },
      cipher
    });
    session.key = key;
    session.vault = vault;
  }

  async function unlock(passcode) {
    const rec = record();
    if (!rec || !rec.kdf || !rec.cipher) throw new Error('no vault');
    const generation = sessionGeneration;
    const key = await deriveKey(passcode, unb64(rec.kdf.salt), rec.kdf.iter || KDF_ITERATIONS);
    if (generation !== sessionGeneration || document.hidden) throw new Error('locked');
    const vault = await openVault(rec.cipher, key);   // throws on a wrong passcode
    if (generation !== sessionGeneration || document.hidden) throw new Error('locked');
    session.key = key;
    session.vault = vault;
    return vault;
  }

  /* A vault that opens AFTER it was locked is not locked.

     Key derivation is 250,000 PBKDF2 iterations, which on a phone is a
     visible pause, and the app locks this vault when it is backgrounded
     or the page is hidden. Both unlock() and createVault() awaited
     across that pause and then assigned the session unconditionally, so
     taking a call or switching apps while the passcode was being checked
     left the vault open on return — no second passcode asked for, the
     decrypted records sitting in memory. The lock was real and the
     unlock simply outlived it.

     This counter is what lock() owns, which is why it is declared here
     rather than with the session: incrementing it invalidates every
     authentication already in flight, and each await is followed by a
     check before anything is assigned or written. A hidden page counts
     as locked, because hiding the page is what triggers the lock. */
  let sessionGeneration = 0;

  function lock() {
    session.key = null;
    session.vault = null;
    sessionGeneration += 1;
  }

  /* True while an unlock or a vault creation is awaiting the key. The
     interface needs this to cancel authentication on backgrounding:
     isUnlocked() is still false at that point, so a handler that only
     checked isUnlocked() let the pending unlock through. */
  let authInFlight = 0;
  function isAuthenticating() { return authInFlight > 0; }
  function tracked(fn) {
    return async function (...args) {
      authInFlight += 1;
      try { return await fn.apply(null, args); }
      finally { authInFlight -= 1; }
    };
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

  const KINDS = ['night', 'day', 'feed', 'weight', 'appointment', 'babySleep', 'diaper'];

  /* Serialise entry writes. Two saves started close together each sealed a
     snapshot of the vault as it was when they began, and whichever finished
     last overwrote the other — so a record could be reported saved, and be
     gone. A tail promise makes each write wait for the one before it. */
  let entryWriteTail = Promise.resolve();
  function queueVaultWrite(work) {
    const operation = entryWriteTail.then(work);
    /* Keep the queue usable after a failed encryption or storage write. */
    entryWriteTail = operation.then(() => {}, () => {});
    return operation;
  }

  function liveEntries(vault, kind) {
    const superseded = new Set(vault.entries.map(e => e.supersedes).filter(Boolean));
    return vault.entries
      .filter(e => !superseded.has(e.id))
      .filter(e => !kind || e.kind === kind)
      .sort((a, b) => (b.date || '').localeCompare(a.date || '') ||
                      (b.createdAt || '').localeCompare(a.createdAt || ''));
  }

  function addEntry(entry) {
    const input = { ...entry };
    return queueVaultWrite(async () => {
      if (!isUnlocked()) throw new Error('locked');
      if (!KINDS.includes(input.kind)) throw new Error('unknown kind');
      /* Metadata belongs to the vault, not to caller-supplied form fields.
         The spread used to come LAST, so an `entry` carrying its own `id`
         silently replaced the generated one — two records could end up
         sharing an id, and a correction chain keyed on id would then point
         at the wrong thing. */
      const full = {
        ...input,
        id: uid(),
        supersedes: input.supersedes || null,
        kind: input.kind,
        date: input.date || todayIso(),
        createdAt: new Date().toISOString()
      };
      const key = session.key;
      const current = session.vault;
      const next = {
        ...current,
        entries: [...current.entries, full],
        revisions: input.supersedes
          ? [...current.revisions, input.supersedes]
          : [...current.revisions]
      };
      /* Seal first, publish second. Until the ciphertext is on the device
         the unlocked session must still describe what is actually stored,
         or a failed write leaves the screen showing a record that does not
         exist anywhere. */
      const cipher = await sealVault(next, key);
      if (session.key !== key || session.vault !== current) {
        throw new Error('vault session changed during save');
      }
      const existing = record() || {};
      MH.set({ enabled: true, v: VAULT_VERSION, kdf: existing.kdf, cipher });
      session.vault = next;
      return full;
    });
  }

  function removeEntry(id) {
    return queueVaultWrite(async () => {
      if (!isUnlocked()) throw new Error('locked');
      const key = session.key, currentVault = session.vault;
      const entries = currentVault.entries;
      const byId = new Map(entries.map(e => [e.id, e]));
      if (!byId.has(id)) return false;

      /* Remove the entire correction chain, including both ancestors and
         descendants, so deleting a correction never resurrects old data. */
      const doomed = new Set([id]);
      let current = byId.get(id);
      while (current && current.supersedes && byId.has(current.supersedes)) {
        const previous = current.supersedes;
        if (doomed.has(previous)) break;
        doomed.add(previous);
        current = byId.get(previous);
      }
      let changed;
      do {
        changed = false;
        for (const entry of entries) {
          if (entry.supersedes && doomed.has(entry.supersedes) && !doomed.has(entry.id)) {
            doomed.add(entry.id);
            changed = true;
          }
        }
      } while (changed);

      /* Seal a copy, not the live vault. If storage rejects the write,
         both the encrypted record and the unlocked session stay intact. */
      const next = {
        ...currentVault,
        entries: entries.filter(e => !doomed.has(e.id)),
        revisions: Array.isArray(currentVault.revisions)
          ? currentVault.revisions.filter(ref => !doomed.has(ref))
          : []
      };
      const cipher = await sealVault(next, key);
      if (session.key !== key || session.vault !== currentVault) {
        throw new Error('vault session changed during save');
      }
      const existing = record() || {};
      MH.set({ enabled: true, v: VAULT_VERSION, kdf: existing.kdf, cipher });
      session.vault = next;
      return true;
    });
  }

  function setStage(stage, detail) {
    return queueVaultWrite(async () => {
      if (!isUnlocked()) throw new Error('locked');
      const key = session.key;
      const current = session.vault;
      const next = {
        ...current,
        pregnancy: { ...current.pregnancy },
        postpartum: { ...current.postpartum }
      };
      next.stage = stage;
      /* Moving into postpartum keeps all pregnancy records. */
      if (stage === 'pregnancy') Object.assign(next.pregnancy, detail || {});
      if (stage === 'postpartum') Object.assign(next.postpartum, detail || {});
      const cipher = await sealVault(next, key);
      if (session.key !== key || session.vault !== current) {
        throw new Error('vault session changed during save');
      }
      const existing = record() || {};
      MH.set({ enabled: true, v: VAULT_VERSION, kdf: existing.kdf, cipher });
      session.vault = next;
    });
  }

  /* Appearance is private: scene selection is encrypted alongside the vault,
     never exposed as a separate browser preference or research field. */
  const SCENES = ['aurora', 'starlake', 'firstlight', 'moonmeadow'];
  function setScene(scene) {
    if (!SCENES.includes(scene)) return Promise.reject(new Error('unknown scene'));
    return queueVaultWrite(async () => {
      if (!isUnlocked()) throw new Error('locked');
      const key = session.key, current = session.vault;
      const next = { ...current, scene };
      const cipher = await sealVault(next, key);
      if (session.key !== key || session.vault !== current) throw new Error('locked');
      const existing = record();
      if (!existing || !existing.kdf) throw new Error('vault erased');
      MH.set({ enabled: true, v: VAULT_VERSION, kdf: existing.kdf, cipher });
      session.vault = next;
      return scene;
    });
  }

  /* ==================================================================
     INSIGHTS. Only from what is actually in the vault, and silent when
     there is not enough. No scores, no judgements, no projections.
     ================================================================== */

  function summarise(vault, now = new Date()) {
    const nights = liveEntries(vault, 'night');
    const days = liveEntries(vault, 'day');
    const feeds = liveEntries(vault, 'feed');
    /* Seven local calendar dates including today; exclude future records. */
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    start.setDate(start.getDate() - 6);
    const since = todayIso(start);
    const through = todayIso(now);
    const inWindow = entry => entry.date >= since && entry.date <= through;
    const recentNights = nights.filter(inWindow);
    const recentDays = days.filter(inWindow);

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
      feedsRecorded: feeds.filter(inWindow).length,
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
    isEnabled, isUnlocked, isAuthenticating,
    /* Wrapped so the interface can tell that a passcode is being checked
       and cancel it on backgrounding. The functions themselves are
       unchanged; tracked() only counts them in and out. */
    createVault: tracked(createVault), unlock: tracked(unlock), lock, persist,
    vault: () => session.vault,
    addEntry, removeEntry, setStage, setScene, SCENES, liveEntries,
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
