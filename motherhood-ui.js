/**
 * SleepSphere Motherhood — the interface.
 *
 * Opens as its own full-screen layer rather than a fifth tab in the main
 * navigation. Two reasons, both of them boundary rather than taste:
 *
 *   · Off means ABSENT (MOTHERHOOD.md B4). A layer built on demand leaves
 *     no element, id or label in the document when the module is off, and
 *     needs no change to the app's four-destination navigation to do it.
 *   · The entry point that turns the module on is byte-identical on every
 *     device, enabled or not. Finding it discloses nothing about its
 *     owner; only the enabled state would, and that is never on screen
 *     until the vault is unlocked.
 *
 * It writes only through SSMotherhood, which writes only through
 * window.__motherhood. No route from this file reaches `state`, the sleep
 * engine, a morning record or the research export.
 */
(function () {
  'use strict';

  const M = window.SSMotherhood;
  if (!M) return;

  const $ = (sel, root) => (root || document).querySelector(sel);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function btn(label, cls, onClick) {
    const b = el('button', cls, label);
    b.type = 'button';
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }
  const todayIso = () => {
    const d = new Date(), p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  };

  let layer = null;
  let toastTimer = null;

  /* ------------------------------------------------------------------
     The layer itself.
     ------------------------------------------------------------------ */
  function openLayer() {
    if (layer) return layer;
    layer = el('div', 'mh-layer');
    layer.setAttribute('role', 'dialog');
    layer.setAttribute('aria-modal', 'true');
    layer.setAttribute('aria-label', 'Private records');
    layer.innerHTML =
      '<div class="mh-bar">' +
        '<button type="button" class="mh-close" aria-label="Close">Close</button>' +
        '<span class="mh-bar-title"></span>' +
        '<button type="button" class="mh-lock" hidden>Lock</button>' +
      '</div><div class="mh-body"></div><div class="mh-toast" role="status" aria-live="polite"></div>';
    $('.mh-close', layer).addEventListener('click', closeLayer);
    $('.mh-lock', layer).addEventListener('click', () => { M.lock(); route(); });
    document.body.appendChild(layer);
    document.documentElement.classList.add('mh-open');
    layer.addEventListener('keydown', e => { if (e.key === 'Escape') closeLayer(); });
    return layer;
  }

  function closeLayer() {
    /* Locking on close is the point of a lock. Leaving the vault open
       behind a dismissed screen would make the passcode decorative. */
    M.lock();
    if (layer) layer.remove();
    layer = null;
    document.documentElement.classList.remove('mh-open');
    const entry = document.getElementById('mhEntry');
    if (entry) entry.focus();
  }

  function body() { return $('.mh-body', layer); }
  function setTitle(t) { $('.mh-bar-title', layer).textContent = t; }

  function toast(message) {
    if (!layer) return;
    const node = $('.mh-toast', layer);
    node.textContent = message;
    node.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove('on'), 2600);
  }

  function screen(title, lockable) {
    setTitle(title);
    $('.mh-lock', layer).hidden = !lockable;
    const b = body();
    b.innerHTML = '';
    b.scrollTop = 0;
    return b;
  }

  function card(parent, cls) {
    const c = el('section', 'mh-card' + (cls ? ' ' + cls : ''));
    parent.appendChild(c);
    return c;
  }

  function field(parent, labelText, inputEl, hint) {
    const wrap = el('label', 'mh-field');
    wrap.appendChild(el('span', 'mh-label', labelText));
    wrap.appendChild(inputEl);
    if (hint) wrap.appendChild(el('span', 'mh-hint', hint));
    parent.appendChild(wrap);
    return inputEl;
  }

  function input(type, attrs) {
    const i = el('input');
    i.type = type;
    Object.assign(i, attrs || {});
    return i;
  }

  /* ==================================================================
     ROUTING between the module's own screens.
     ================================================================== */
  function route() {
    if (!layer) return;
    if (!M.isEnabled()) return screenIntro();
    if (!M.isUnlocked()) return screenUnlock();
    if (!M.vault().stage) return screenStage();
    return screenHome();
  }

  /* ==================================================================
     1 · INTRO and consent. Nothing is stored until the passcode screen
     completes, so a participant can read all of this and walk away
     having left no trace.
     ================================================================== */
  function screenIntro() {
    const b = screen('Motherhood', false);

    const head = card(b, 'mh-intro');
    head.appendChild(el('h2', null, 'Sleep through pregnancy and after birth'));
    head.appendChild(el('p', 'mh-lede',
      'An optional part of SleepSphere for recording rest, energy and how you ' +
      'are doing through pregnancy and the months after birth. It is off until ' +
      'you turn it on, and nothing in it is shared with anyone.'));

    const what = card(b);
    what.appendChild(el('h3', null, 'What it keeps'));
    const list = el('ul', 'mh-list');
    [
      'Rest and broken nights, recorded as the intervals you actually had',
      'Fatigue, energy and how you are feeling',
      'Symptoms and comfort notes, in your words',
      'Feeding, if you want to record it',
      'Weight, if you want to record it — with no target and no comparison',
      'Appointments and notes for them'
    ].forEach(t => list.appendChild(el('li', null, t)));
    what.appendChild(list);

    const privacy = card(b, 'mh-privacy');
    privacy.appendChild(el('h3', null, 'Where this is kept, exactly'));
    const p1 = el('p', null,
      'On this device only, in this browser\'s storage, encrypted with a passcode ' +
      'you choose. There is no account and no server. SleepSphere has no way to ' +
      'read it and no code anywhere in this app sends it over a network.');
    const p2 = el('p', null,
      'It is kept separately from your study records. Research exports do not ' +
      'contain it — not the records, not a summary, not a flag saying you use ' +
      'this module. A researcher receiving your study files cannot tell this ' +
      'module exists on your phone.');
    const p3 = el('p', 'mh-caution',
      'Two honest limits. If you forget the passcode the records cannot be ' +
      'recovered — there is no reset, which is what makes the encryption worth ' +
      'anything. And while the module is open on screen the records are ' +
      'unlocked in memory, as they must be for you to read them; lock it or ' +
      'close it when you are done.');
    privacy.append(p1, p2, p3);

    const care = card(b, 'mh-careline');
    care.appendChild(el('h3', null, 'This is not medical care'));
    care.appendChild(el('p', null,
      'SleepSphere does not diagnose anything and cannot tell you whether ' +
      'something is wrong. It keeps what you write down. For anything that ' +
      'worries you, speak to your midwife, doctor or health visitor.'));

    const consent = card(b, 'mh-consent');
    const ack = input('checkbox', { id: 'mhConsent' });
    const ackWrap = el('label', 'mh-check');
    ackWrap.appendChild(ack);
    ackWrap.appendChild(el('span', null,
      'I have read where this is kept, and I understand a forgotten passcode ' +
      'cannot be recovered.'));
    consent.appendChild(ackWrap);

    const go = btn('Continue', 'mh-primary', () => {
      if (!ack.checked) { toast('Please confirm you have read the above.'); ack.focus(); return; }
      screenPasscode();
    });
    go.disabled = false;
    consent.appendChild(go);
    return b;
  }

  /* ==================================================================
     2 · PASSCODE. The one place a key is created.
     ================================================================== */
  function screenPasscode() {
    const b = screen('Choose a passcode', false);
    const c = card(b);
    c.appendChild(el('h2', null, 'Choose a passcode'));
    c.appendChild(el('p', 'mh-lede',
      'This unlocks your Motherhood records and nothing else. It is not your ' +
      'phone passcode and it is not stored anywhere — it is used to derive the ' +
      'key that encrypts the records.'));

    const a = field(c, 'Passcode', input('password', { autocomplete: 'new-password', inputMode: 'text' }),
      'At least six characters.');
    const bb = field(c, 'Enter it again', input('password', { autocomplete: 'new-password' }));

    const warn = el('p', 'mh-caution',
      'There is no way to reset this. If you forget it, the records are gone. ' +
      'Write it down somewhere only you can reach.');
    c.appendChild(warn);

    const create = btn('Turn on Motherhood', 'mh-primary', async () => {
      if (a.value.length < 6) { toast('Passcode needs at least six characters.'); a.focus(); return; }
      if (a.value !== bb.value) { toast('The two passcodes do not match.'); bb.focus(); return; }
      create.disabled = true;
      create.textContent = 'Setting up…';
      try {
        await M.createVault(a.value);
        a.value = bb.value = '';
        screenStage();
      } catch (err) {
        create.disabled = false;
        create.textContent = 'Turn on Motherhood';
        toast('Could not set up. ' + (err && err.message ? err.message : ''));
      }
    });
    c.appendChild(create);
    c.appendChild(btn('Back', 'mh-quiet', screenIntro));
    setTimeout(() => a.focus(), 50);
    return b;
  }

  /* ==================================================================
     3 · UNLOCK.
     ================================================================== */
  function screenUnlock() {
    const b = screen('Locked', false);
    const c = card(b);
    c.appendChild(el('h2', null, 'Enter your passcode'));
    const pass = field(c, 'Passcode', input('password', { autocomplete: 'current-password' }));
    const go = btn('Unlock', 'mh-primary', async () => {
      go.disabled = true; go.textContent = 'Unlocking…';
      try {
        await M.unlock(pass.value);
        pass.value = '';
        route();
      } catch {
        go.disabled = false; go.textContent = 'Unlock';
        toast('That passcode did not work.');
        pass.select();
      }
    });
    pass.addEventListener('keydown', e => { if (e.key === 'Enter') go.click(); });
    c.appendChild(go);
    setTimeout(() => pass.focus(), 50);
    return b;
  }

  /* ==================================================================
     4 · STAGE. Where someone is, and the move between the two.
     ================================================================== */
  function screenStage(forceSwitch) {
    const v = M.vault();
    const b = screen('Where you are', true);
    const c = card(b);
    c.appendChild(el('h2', null, forceSwitch ? 'Change stage' : 'Where are you right now?'));
    if (forceSwitch) {
      c.appendChild(el('p', 'mh-lede',
        'Everything you have already recorded stays exactly where it is. ' +
        'Changing stage only changes what this module asks you from here on.'));
    }

    const choice = el('div', 'mh-choice');
    let picked = v.stage || '';
    const mk = (value, label, sub) => {
      const o = btn('', 'mh-opt' + (picked === value ? ' on' : ''), () => {
        picked = value;
        Array.from(choice.children).forEach(n => n.classList.toggle('on', n.dataset.v === value));
        detail.hidden = false;
        renderDetail();
      });
      o.dataset.v = value;
      o.appendChild(el('strong', null, label));
      o.appendChild(el('span', null, sub));
      choice.appendChild(o);
    };
    mk('pregnancy', 'Pregnant', 'Records rest, symptoms and how you are doing');
    mk('postpartum', 'After birth', 'Records broken rest, feeding and recovery');
    c.appendChild(choice);

    const detail = el('div', 'mh-detail');
    detail.hidden = !picked;
    c.appendChild(detail);

    function renderDetail() {
      detail.innerHTML = '';
      if (picked === 'pregnancy') {
        const d = field(detail, 'Due date (optional)',
          input('date', { value: v.pregnancy.dueDate || '' }),
          'Used only to show how many weeks you are. Leave it blank if you prefer.');
        detail.dataset.key = 'dueDate';
        detail._input = d;
      } else if (picked === 'postpartum') {
        const d = field(detail, 'Date of birth (optional)',
          input('date', { value: v.postpartum.birthDate || '', max: todayIso() }),
          'Used only to show how many weeks ago. Leave it blank if you prefer.');
        detail._input = d;
        const sel = el('select');
        [['', 'Prefer not to say'], ['breast', 'Breastfeeding'], ['pump', 'Pumping'],
         ['formula', 'Formula'], ['mixed', 'Mixed']].forEach(([val, label]) => {
          const o = el('option', null, label); o.value = val;
          if (v.postpartum.feeding === val) o.selected = true;
          sel.appendChild(o);
        });
        field(detail, 'How you are feeding (optional)', sel);
        detail._feeding = sel;
      }
    }
    if (picked) renderDetail();

    const save = btn('Save', 'mh-primary', async () => {
      if (!picked) { toast('Choose one to continue.'); return; }
      const d = picked === 'pregnancy'
        ? { dueDate: (detail._input && detail._input.value) || '' }
        : { birthDate: (detail._input && detail._input.value) || '',
            feeding: (detail._feeding && detail._feeding.value) || '' };
      await M.setStage(picked, d);
      toast('Saved.');
      screenHome();
    });
    c.appendChild(save);
    if (v.stage) c.appendChild(btn('Cancel', 'mh-quiet', screenHome));
    return b;
  }

  /* ==================================================================
     5 · HOME.
     ================================================================== */
  function screenHome() {
    const v = M.vault();
    const b = screen('Motherhood', true);
    const stage = v.stage;

    /* Where you are — derived from a date the participant typed, and
       silent when they did not type one. */
    const top = card(b, 'mh-stagecard');
    if (stage === 'pregnancy') {
      const p = M.pregnancyProgress(v);
      top.appendChild(el('span', 'mh-eyebrow', 'Pregnancy'));
      if (p) {
        top.appendChild(el('h2', null, p.weeks + ' weeks'));
        top.appendChild(el('p', 'mh-sub',
          'Trimester ' + p.trimester + ' · due ' + M.prettyDate(p.due) +
          (p.daysToDue >= 0 ? ' · ' + p.daysToDue + ' days to go' : '')));
      } else {
        top.appendChild(el('h2', null, 'Pregnancy'));
        top.appendChild(el('p', 'mh-sub', 'No due date recorded.'));
      }
    } else {
      const p = M.postpartumProgress(v);
      top.appendChild(el('span', 'mh-eyebrow', 'After birth'));
      if (p) {
        top.appendChild(el('h2', null, p.weeks >= 1 ? p.weeks + (p.weeks === 1 ? ' week' : ' weeks') : p.days + (p.days === 1 ? ' day' : ' days')));
        top.appendChild(el('p', 'mh-sub', 'Since ' + M.prettyDate(p.born)));
      } else {
        top.appendChild(el('h2', null, 'After birth'));
        top.appendChild(el('p', 'mh-sub', 'No birth date recorded.'));
      }
    }

    /* Record. The actions, in the order they are actually wanted. */
    const rec = card(b);
    rec.appendChild(el('h3', null, 'Record'));
    const grid = el('div', 'mh-grid');
    const add = (label, kind) => grid.appendChild(btn(label, 'mh-tile', () => screenEntry(kind)));
    add(stage === 'postpartum' ? 'Last night’s rest' : 'Last night', 'night');
    add('How today is', 'day');
    if (stage === 'postpartum') add('A feed', 'feed');
    add('Weight', 'weight');
    add('Appointment', 'appointment');
    rec.appendChild(grid);

    /* What your own records show. Silent rather than speculative. */
    const s = M.summarise(v);
    const ins = card(b, 'mh-insight');
    ins.appendChild(el('h3', null, 'Your last seven days'));
    if (!s.totalEntries) {
      ins.appendChild(el('p', 'mh-empty',
        'Nothing recorded yet. Anything you add will show here — and only ' +
        'what you add. This module never estimates a figure you did not give it.'));
    } else {
      const rows = el('div', 'mh-stats');
      const stat = (label, value, note) => {
        const d = el('div', 'mh-stat');
        d.appendChild(el('span', 'mh-stat-k', label));
        d.appendChild(el('strong', 'mh-stat-v' + (value == null ? ' mh-none' : ''),
          value == null ? 'Not recorded' : value));
        if (note) d.appendChild(el('span', 'mh-stat-n', note));
        rows.appendChild(d);
      };
      stat('Nights recorded', s.nightsRecorded ? String(s.nightsRecorded) : null, 'of the last 7');
      stat('Typical rest held', s.meanRestMinutes != null ? M.fmtDuration(s.meanRestMinutes) : null,
        s.nightsWithRest ? 'across ' + s.nightsWithRest + ' night' + (s.nightsWithRest === 1 ? '' : 's') + ' you timed' : 'no intervals recorded');
      stat('Times woken', s.meanWakings != null ? (Math.round(s.meanWakings * 10) / 10) + ' a night' : null);
      stat('Fatigue', s.meanFatigue != null ? (Math.round(s.meanFatigue * 10) / 10) + ' of 5' : null,
        s.daysRecorded ? 'over ' + s.daysRecorded + ' day' + (s.daysRecorded === 1 ? '' : 's') : null);
      if (stage === 'postpartum') stat('Feeds recorded', s.feedsRecorded ? String(s.feedsRecorded) : null);
      ins.appendChild(rows);
      ins.appendChild(el('p', 'mh-foot',
        'These are your own entries, averaged. SleepSphere did not measure ' +
        'any of them, and a night you did not record is left out rather than ' +
        'counted as nothing.'));
    }

    /* Recent entries. */
    const live = M.liveEntries(v).slice(0, 8);
    const hist = card(b);
    hist.appendChild(el('h3', null, 'Recent entries'));
    if (!live.length) {
      hist.appendChild(el('p', 'mh-empty', 'Nothing yet.'));
    } else {
      hist.appendChild(entryList(live));
      hist.appendChild(btn('All entries', 'mh-quiet', screenHistory));
    }

    /* Reading. */
    const learn = card(b);
    learn.appendChild(el('h3', null, 'Reading'));
    (M.LESSONS[stage] || []).forEach(([title, text]) => {
      const d = el('details', 'mh-lesson');
      const sm = el('summary', null, title);
      d.appendChild(sm);
      d.appendChild(el('p', null, text));
      learn.appendChild(d);
    });

    /* When to contact someone. Never triggered by their entries. */
    const care = card(b, 'mh-careline');
    const cd = el('details');
    cd.appendChild(el('summary', null, 'When to contact someone today'));
    const cl = el('ul', 'mh-list');
    (M.SEEK_CARE[stage] || []).forEach(t => cl.appendChild(el('li', null, t)));
    cd.appendChild(cl);
    cd.appendChild(el('p', 'mh-foot',
      'This is a general list, not a judgement about you, and SleepSphere is ' +
      'not watching your entries for it. Trust yourself: if something feels ' +
      'wrong, contact your midwife, doctor, or your local emergency number.'));
    care.appendChild(cd);

    /* Your data. */
    const data = card(b);
    data.appendChild(el('h3', null, 'Your records'));
    const actions = el('div', 'mh-actions');
    actions.appendChild(btn('Change stage', 'mh-quiet', () => screenStage(true)));
    actions.appendChild(btn('Export a copy', 'mh-quiet', () => {
      const payload = M.buildExport(M.vault());
      const name = 'sleepsphere-motherhood-' + todayIso() + '.json';
      downloadJson(name, payload);
      toast('Saved to your downloads.');
    }));
    actions.appendChild(btn('Privacy', 'mh-quiet', screenPrivacy));
    actions.appendChild(btn('Delete everything', 'mh-danger', screenDelete));
    data.appendChild(actions);
    return b;
  }

  function downloadJson(name, payload) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = el('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* ------------------------------------------------------------------
     Entry list, shared by home and history.
     ------------------------------------------------------------------ */
  function entryList(entries) {
    const ul = el('ul', 'mh-entries');
    entries.forEach(e => {
      const li = el('li', 'mh-entry');
      li.appendChild(el('span', 'mh-entry-d', M.prettyDate(e.date)));
      li.appendChild(el('span', 'mh-entry-k', describe(e)));
      const del = btn('Delete', 'mh-del', async () => {
        if (!confirm('Delete this entry? This cannot be undone.')) return;
        await M.removeEntry(e.id);
        toast('Deleted.');
        route();
      });
      del.setAttribute('aria-label', 'Delete entry from ' + M.prettyDate(e.date));
      li.appendChild(del);
      ul.appendChild(li);
    });
    return ul;
  }

  function describe(e) {
    if (e.kind === 'night') {
      const n = (e.restIntervals || []).length;
      const mins = (e.restIntervals || []).reduce((sum, iv) => {
        const a = M.toMin(iv.from), b = M.toMin(iv.to);
        if (a == null || b == null) return sum;
        return sum + (b >= a ? b - a : (1440 - a) + b);
      }, 0);
      const parts = [];
      if (n) parts.push(n + ' rest interval' + (n === 1 ? '' : 's') + (mins ? ' · ' + M.fmtDuration(mins) : ''));
      else parts.push('Night recorded');
      if (typeof e.wakings === 'number') parts.push('woke ' + e.wakings + '×');
      return parts.join(' · ');
    }
    if (e.kind === 'day') {
      const parts = [];
      if (typeof e.fatigue === 'number') parts.push('fatigue ' + e.fatigue + '/5');
      if (typeof e.energy === 'number') parts.push('energy ' + e.energy + '/5');
      if ((e.symptoms || []).length) parts.push(e.symptoms.join(', '));
      return parts.length ? parts.join(' · ') : 'Day recorded';
    }
    if (e.kind === 'feed') {
      const parts = [e.at || '', e.method || ''].filter(Boolean);
      if (e.minutes) parts.push(e.minutes + ' min');
      if (e.amountValue) parts.push(e.amountValue + ' ' + (e.amountUnit || ''));
      return parts.join(' · ') || 'Feed';
    }
    if (e.kind === 'weight') return e.value + ' ' + (e.unit || '');
    if (e.kind === 'appointment') return (e.at ? e.at + ' · ' : '') + (e.title || 'Appointment');
    return e.kind;
  }

  /* ==================================================================
     6 · ENTRY FORMS.
     ================================================================== */
  function screenEntry(kind) {
    const v = M.vault();
    const titles = { night: 'Last night', day: 'Today', feed: 'A feed',
                     weight: 'Weight', appointment: 'Appointment' };
    const b = screen(titles[kind] || 'Record', true);
    const c = card(b);
    const draft = { kind, date: todayIso() };

    field(c, 'Date', input('date', { value: draft.date, max: todayIso() }))
      .addEventListener('change', e => { draft.date = e.target.value; });

    if (kind === 'night') buildNight(c, draft, v);
    if (kind === 'day') buildDay(c, draft, v);
    if (kind === 'feed') buildFeed(c, draft, v);
    if (kind === 'weight') buildWeight(c, draft, v);
    if (kind === 'appointment') buildAppointment(c, draft);

    const save = btn('Save', 'mh-primary', async () => {
      const problem = validate(kind, draft);
      if (problem) { toast(problem); return; }
      save.disabled = true;
      await M.addEntry(draft);
      toast('Saved.');
      screenHome();
    });
    c.appendChild(save);
    c.appendChild(btn('Cancel', 'mh-quiet', screenHome));
    return b;
  }

  function validate(kind, d) {
    if (kind === 'weight' && !(d.value > 0)) return 'Enter a weight, or cancel.';
    if (kind === 'appointment' && !d.title) return 'Give the appointment a name.';
    if (kind === 'night' && (d.restIntervals || []).some(iv => !iv.from || !iv.to))
      return 'Each rest interval needs a start and an end.';
    return null;
  }

  /* Rest intervals, which is the whole reason this module exists for the
     postpartum months. One bedtime and one wake time cannot describe a
     night broken into four pieces, and rounding it to a single number
     would be inventing a measurement. */
  function buildNight(c, draft, v) {
    draft.restIntervals = [];
    const wrap = el('div', 'mh-intervals');
    c.appendChild(el('span', 'mh-label', 'When you rested'));
    c.appendChild(el('span', 'mh-hint',
      'Add each stretch you lay down for, whether or not you think you slept ' +
      'through it. Leave it empty if you would rather not.'));
    c.appendChild(wrap);

    function redraw() {
      wrap.innerHTML = '';
      draft.restIntervals.forEach((iv, i) => {
        const row = el('div', 'mh-interval');
        const a = input('time', { value: iv.from || '' });
        const bb = input('time', { value: iv.to || '' });
        a.addEventListener('change', e => { iv.from = e.target.value; });
        bb.addEventListener('change', e => { iv.to = e.target.value; });
        a.setAttribute('aria-label', 'Rest ' + (i + 1) + ' start');
        bb.setAttribute('aria-label', 'Rest ' + (i + 1) + ' end');
        row.append(a, el('span', 'mh-to', 'to'), bb);
        const rm = btn('✕', 'mh-del mh-del-x', () => {
          draft.restIntervals.splice(i, 1); redraw();
        });
        rm.setAttribute('aria-label', 'Remove rest interval ' + (i + 1));
        row.appendChild(rm);
        wrap.appendChild(row);
      });
      wrap.appendChild(btn('Add a stretch', 'mh-quiet', () => {
        draft.restIntervals.push({ from: '', to: '' }); redraw();
      }));
    }
    redraw();

    const wake = input('number', { min: 0, max: 30, step: 1, inputMode: 'numeric' });
    field(c, 'Times you were woken (optional)', wake)
      .addEventListener('change', e => {
        draft.wakings = e.target.value === '' ? null : Number(e.target.value);
      });

    const comfort = el('textarea');
    comfort.rows = 2;
    comfort.placeholder = 'Anything about how you were lying, pain, heat…';
    field(c, 'Comfort notes (optional)', comfort)
      .addEventListener('input', e => { draft.comfort = e.target.value; });
  }

  function buildDay(c, draft, v) {
    draft.symptoms = [];
    c.appendChild(scale('How tired do you feel?', 1, 5, n => { draft.fatigue = n; },
      ['Not at all', 'Completely']));
    c.appendChild(scale('How much energy do you have?', 1, 5, n => { draft.energy = n; },
      ['None', 'Plenty']));

    const stage = v.stage;
    c.appendChild(el('span', 'mh-label', 'Anything you noticed (optional)'));
    const chips = el('div', 'mh-chips');
    (M.SYMPTOMS[stage] || []).forEach(name => {
      const chip = btn(name, 'mh-chip', () => {
        const i = draft.symptoms.indexOf(name);
        if (i >= 0) draft.symptoms.splice(i, 1); else draft.symptoms.push(name);
        chip.classList.toggle('on', draft.symptoms.includes(name));
        chip.setAttribute('aria-pressed', String(draft.symptoms.includes(name)));
      });
      chip.setAttribute('aria-pressed', 'false');
      chips.appendChild(chip);
    });
    c.appendChild(chips);

    const notes = el('textarea');
    notes.rows = 3;
    notes.placeholder = 'In your own words…';
    field(c, 'Notes (optional)', notes)
      .addEventListener('input', e => { draft.notes = e.target.value; });
  }

  function buildFeed(c, draft, v) {
    field(c, 'Time', input('time', { value: new Date().toTimeString().slice(0, 5) }))
      .addEventListener('change', e => { draft.at = e.target.value; });
    draft.at = new Date().toTimeString().slice(0, 5);

    const sel = el('select');
    [['breast', 'Breastfeeding'], ['pump', 'Pumping'], ['formula', 'Formula'], ['mixed', 'Mixed']]
      .forEach(([val, label]) => {
        const o = el('option', null, label); o.value = val;
        if ((v.postpartum.feeding || 'breast') === val) o.selected = true;
        sel.appendChild(o);
      });
    draft.method = sel.value;
    field(c, 'How', sel).addEventListener('change', e => { draft.method = e.target.value; });

    field(c, 'Minutes (optional)', input('number', { min: 0, max: 240, inputMode: 'numeric' }))
      .addEventListener('change', e => {
        draft.minutes = e.target.value === '' ? null : Number(e.target.value);
      });

    const amountRow = el('div', 'mh-row');
    const amount = input('number', { min: 0, max: 2000, step: 'any', inputMode: 'decimal' });
    amount.placeholder = 'Amount';
    amount.setAttribute('aria-label', 'Amount');
    const unit = el('select');
    unit.setAttribute('aria-label', 'Amount unit');
    ['ml', 'oz'].forEach(u => { const o = el('option', null, u); o.value = u; unit.appendChild(o); });
    amount.addEventListener('change', e => {
      draft.amountValue = e.target.value === '' ? null : Number(e.target.value);
      draft.amountUnit = unit.value;
    });
    unit.addEventListener('change', () => { draft.amountUnit = unit.value; });
    amountRow.append(amount, unit);
    c.appendChild(el('span', 'mh-label', 'Amount (optional)'));
    c.appendChild(amountRow);
  }

  /* No target, no range, no comparison, no chart that implies a direction
     it ought to be going. A number and a date, kept because the person
     asked for it to be kept. */
  function buildWeight(c, draft) {
    const row = el('div', 'mh-row');
    const val = input('number', { min: 0, max: 400, step: 'any', inputMode: 'decimal' });
    val.setAttribute('aria-label', 'Weight');
    const unit = el('select');
    unit.setAttribute('aria-label', 'Weight unit');
    ['kg', 'lb'].forEach(u => { const o = el('option', null, u); o.value = u; unit.appendChild(o); });
    draft.unit = 'kg';
    val.addEventListener('change', e => { draft.value = Number(e.target.value); });
    unit.addEventListener('change', e => { draft.unit = e.target.value; });
    row.append(val, unit);
    c.appendChild(el('span', 'mh-label', 'Weight'));
    c.appendChild(row);
    c.appendChild(el('p', 'mh-hint',
      'Kept as a plain record with its date. SleepSphere sets no target, draws ' +
      'no trend line, and will never tell you what this number should be.'));
  }

  function buildAppointment(c, draft) {
    field(c, 'What it is', input('text', { maxLength: 80 }))
      .addEventListener('input', e => { draft.title = e.target.value.trim(); });
    field(c, 'Time (optional)', input('time'))
      .addEventListener('change', e => { draft.at = e.target.value; });
    const note = el('textarea');
    note.rows = 3;
    note.placeholder = 'Questions to ask, what was said…';
    field(c, 'Notes (optional)', note)
      .addEventListener('input', e => { draft.note = e.target.value; });
  }

  function scale(label, min, max, onPick, ends) {
    const wrap = el('div', 'mh-scale');
    wrap.appendChild(el('span', 'mh-label', label));
    const row = el('div', 'mh-scale-row');
    row.setAttribute('role', 'radiogroup');
    row.setAttribute('aria-label', label);
    for (let n = min; n <= max; n++) {
      const b = btn(String(n), 'mh-dot', () => {
        Array.from(row.children).forEach(c => {
          c.classList.toggle('on', c.textContent === String(n));
          c.setAttribute('aria-checked', String(c.textContent === String(n)));
        });
        onPick(n);
      });
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', 'false');
      row.appendChild(b);
    }
    wrap.appendChild(row);
    if (ends) {
      const e = el('div', 'mh-ends');
      e.append(el('span', null, ends[0]), el('span', null, ends[1]));
      wrap.appendChild(e);
    }
    return wrap;
  }

  /* ==================================================================
     7 · HISTORY, PRIVACY, DELETE.
     ================================================================== */
  function screenHistory() {
    const v = M.vault();
    const b = screen('All entries', true);
    const c = card(b);
    const all = M.liveEntries(v);
    c.appendChild(el('h3', null, all.length + ' entr' + (all.length === 1 ? 'y' : 'ies')));
    if (!all.length) c.appendChild(el('p', 'mh-empty', 'Nothing recorded yet.'));
    else c.appendChild(entryList(all));
    c.appendChild(btn('Back', 'mh-quiet', screenHome));
    return b;
  }

  function screenPrivacy() {
    const b = screen('Privacy', true);
    const c = card(b);
    c.appendChild(el('h2', null, 'Where your Motherhood records are'));
    [
      ['On this device only', 'They are stored in this browser\'s local storage on this ' +
        'phone or computer. There is no account, no sync and no server copy.'],
      ['Encrypted with your passcode', 'They are encrypted with AES-GCM under a key derived ' +
        'from the passcode you chose. What is saved on the device is ciphertext — ' +
        'not the dates, not the stage, not a single field name.'],
      ['Never in a research export', 'Study exports are built from a separate store that ' +
        'does not contain any of this, and they pass through an allowlist that ' +
        'excludes anything Motherhood-shaped by default. There is no flag in them ' +
        'saying you use this module.'],
      ['Never sent anywhere', 'This module contains no network code. The only way any of ' +
        'it leaves the device is the export button, which you press, which saves a ' +
        'file to your downloads.'],
      ['Erased when you erase', 'SleepSphere\'s own "erase everything" clears this store ' +
        'too. A private store that survived the delete button would be a trap.']
    ].forEach(([h, p]) => {
      c.appendChild(el('h3', null, h));
      c.appendChild(el('p', null, p));
    });
    c.appendChild(el('h3', null, 'What this does not protect against'));
    c.appendChild(el('p', 'mh-caution',
      'While the module is open the records are decrypted in memory, because ' +
      'that is the only way to show them to you. Someone with the phone in ' +
      'their hands at that moment can read what is on screen. Lock it when you ' +
      'step away. And because SleepSphere is one file served to everyone, the ' +
      'module\'s code is in the page whether or not you use it — that reveals ' +
      'that SleepSphere has this module, never that you turned it on.'));
    c.appendChild(btn('Back', 'mh-quiet', screenHome));
    return b;
  }

  function screenDelete() {
    const b = screen('Delete everything', true);
    const c = card(b, 'mh-danger-card');
    c.appendChild(el('h2', null, 'Delete your Motherhood records'));
    c.appendChild(el('p', null,
      'This removes the encrypted store, the passcode and every entry in it ' +
      'from this device. It cannot be undone, and there is no copy anywhere ' +
      'else. Your sleep records and study data are not affected.'));
    c.appendChild(el('p', 'mh-hint',
      'If you want a copy first, go back and choose "Export a copy".'));

    const confirmIn = input('text', { placeholder: 'DELETE', autocapitalize: 'characters' });
    field(c, 'Type DELETE to confirm', confirmIn);

    const go = btn('Delete everything', 'mh-danger', async () => {
      if (confirmIn.value.trim().toUpperCase() !== 'DELETE') {
        toast('Type DELETE to confirm.'); confirmIn.focus(); return;
      }
      await M.erase();
      refreshEntry();
      closeLayer();
    });
    c.appendChild(go);
    c.appendChild(btn('Cancel', 'mh-quiet', screenHome));
    return b;
  }

  /* ==================================================================
     THE ENTRY POINT.

     Injected into the "Me" view. Identical on every device whether the
     module is on or off — which is what lets it exist at all without
     disclosing anything about whoever is holding the phone.
     ================================================================== */
  function mountEntry() {
    const host = document.getElementById('data');
    if (!host || document.getElementById('mhEntry')) return;

    const section = el('section', 'card mh-entrycard');
    section.appendChild(el('h3', null, 'Private modules'));
    section.appendChild(el('p', null,
      'Optional parts of SleepSphere that keep their records separately from ' +
      'your study data, encrypted on this device.'));
    const b = btn('Pregnancy and after birth', 'mh-entry-btn', () => {
      openLayer();
      route();
    });
    b.id = 'mhEntry';
    section.appendChild(b);
    host.appendChild(section);
  }

  function refreshEntry() { /* the entry point never changes; kept for clarity */ }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountEntry);
  } else {
    mountEntry();
  }

  /* A seam for tests, so the interface can be driven without guessing at
     class names from outside. */
  window.__mhUI = { open: () => { openLayer(); route(); }, close: closeLayer, route };
})();
