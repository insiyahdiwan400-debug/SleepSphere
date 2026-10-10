/**
 * SleepSphere Insights.
 *
 * Everything here is computed from records the participant actually made,
 * through the integrity helpers the app already has. It adds no new way to
 * read a record and no new idea of what a record means.
 *
 *   · `SS.engine.mornings()` — real records, demonstration data excluded.
 *   · `SS.engine.withSleepDuration()` — the records an average over sleep
 *     duration may rest on: trusted, AND carrying a duration at all.
 *   · `SS.engine.sleepMinutesOf()` — returns null for "not known", because
 *     `Number(x) || 0` reads an unknown night as a night of no sleep, and
 *     in a mean that drags down every other night too.
 *
 * The consequence runs through every number on this screen: a night that
 * was not recorded is drawn as a gap and counted as not recorded. It is
 * never zero, never interpolated, and never quietly dropped without the
 * count being shown.
 *
 * Tone is a requirement, not decoration. No score out of a hundred, no red,
 * no streak, nothing that reads as a verdict. Where two things move
 * together the screen says so and says plainly that it is a description of
 * what was written down, not a cause.
 */
(function () {
  'use strict';

  const SS = window.SS;
  if (!SS || !SS.engine) return;

  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const svg = (tag, attrs) => {
    const n = document.createElementNS(NS, tag);
    for (const k in (attrs || {})) n.setAttribute(k, attrs[k]);
    return n;
  };

  const RANGES = [[7, '7 nights'], [30, '30 nights'], [90, '90 nights']];
  let range = 30;
  let selected = null;          // the night the reader has tapped

  /* ------------------------------------------------------------------
     Clock arithmetic. Bed times straddle midnight, so 23:40 and 00:20 are
     forty minutes apart and not twenty-three hours. Shifting anything
     before noon into the next day puts them on one continuous line, which
     is what makes a spread over bedtimes mean anything at all.
     ------------------------------------------------------------------ */
  function toMinutes(hhmm) {
    if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm)) return null;
    const [h, m] = hhmm.split(':').map(Number);
    if (h > 23 || m > 59) return null;
    return h * 60 + m;
  }
  const nightMinutes = m => (m == null ? null : (m < 720 ? m + 1440 : m));
  function fmtClock(mins) {
    if (mins == null) return null;
    const m = ((Math.round(mins) % 1440) + 1440) % 1440;
    const h = Math.floor(m / 60), mm = m % 60;
    const ampm = h < 12 ? 'AM' : 'PM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return h12 + ':' + String(mm).padStart(2, '0') + ' ' + ampm;
  }
  function fmtDuration(mins) {
    if (mins == null || !isFinite(mins)) return null;
    const h = Math.floor(mins / 60), m = Math.round(mins % 60);
    return h ? (m ? h + 'h ' + m + 'm' : h + 'h') : m + 'm';
  }
  const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  function median(a) {
    if (!a.length) return null;
    const s = [...a].sort((x, y) => x - y);
    const mid = s.length >> 1;
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }
  const prettyDate = iso => {
    const d = new Date(iso + 'T12:00:00');
    return isNaN(d) ? iso : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  };

  /* ------------------------------------------------------------------
     The window of nights under discussion, as DATES rather than as a slice
     of the array — a participant with gaps has fewer records than days,
     and "the last 30 nights" has to mean thirty calendar nights or the
     "not recorded" count is a fiction.
     ------------------------------------------------------------------ */
  function windowOf(days, now = new Date()) {
    const out = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const p = n => String(n).padStart(2, '0');
      out.push(d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()));
    }
    return out;
  }

  function gather(days) {
    const all = SS.engine.mornings();
    const byDate = new Map(all.map(r => [r.date, r]));
    const trusted = new Set(SS.engine.withSleepDuration(all).map(r => r.date));
    const dates = windowOf(days);

    const nights = dates.map(date => {
      const r = byDate.get(date) || null;
      const duration = r && trusted.has(date) ? SS.engine.sleepMinutesOf(r) : null;
      return {
        date, record: r,
        /* Three separate states, deliberately. A night with no record at
           all and a night whose duration is not knowable are different
           facts, and flattening them would overstate how much is known. */
        recorded: Boolean(r),
        duration,
        durationKnown: duration !== null,
        bed: r ? nightMinutes(toMinutes(r.sleepTime || r.bedTime)) : null,
        wake: r ? toMinutes(r.wakeTime) : null,
        awake: r && typeof r.awakeMinutes === 'number' ? r.awakeMinutes : null,
        rest: r && typeof r.rest === 'number' ? r.rest : null,
        energy: r && typeof r.energy === 'number' ? r.energy : null
      };
    });

    const withDuration = nights.filter(n => n.durationKnown);
    return {
      days, nights, withDuration,
      recordedCount: nights.filter(n => n.recorded).length,
      unrecordedCount: nights.filter(n => !n.recorded).length,
      /* Recorded but not usable for a duration average — times-only, or
         flagged. Named on screen rather than silently dropped. */
      unusableCount: nights.filter(n => n.recorded && !n.durationKnown).length,
      target: (SS.state && SS.state.settings && SS.state.settings.target) || null
    };
  }

  /* ==================================================================
     THE NIGHTS CHART.
     ================================================================== */
  function durationChart(data) {
    const W = 680, H = 190, padL = 34, padR = 8, padT = 14, padB = 22;
    const n = data.nights.length;
    const maxMin = Math.max(
      600,
      data.target || 0,
      ...data.withDuration.map(d => d.duration)
    );
    const topHours = Math.ceil(maxMin / 60);
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const bw = plotW / n;
    const y = mins => padT + plotH - (mins / (topHours * 60)) * plotH;

    const s = svg('svg', {
      viewBox: '0 0 ' + W + ' ' + H, class: 'in-chart',
      preserveAspectRatio: 'none', 'aria-hidden': 'true'
    });

    /* Hour guides. Three of them, labelled, because a grid of eight is
       noise on a screen meant to be calming. */
    for (let h = 2; h <= topHours; h += 2) {
      s.appendChild(svg('line', {
        x1: padL, x2: W - padR, y1: y(h * 60), y2: y(h * 60), class: 'in-grid'
      }));
      const t = svg('text', { x: 4, y: y(h * 60) + 3.5, class: 'in-axis' });
      t.textContent = h + 'h';
      s.appendChild(t);
    }

    /* The target, where one exists. A line, not a judgement: nothing on
       this chart colours a night by whether it cleared the line. */
    if (data.target) {
      s.appendChild(svg('line', {
        x1: padL, x2: W - padR, y1: y(data.target), y2: y(data.target), class: 'in-target'
      }));
    }

    data.nights.forEach((night, i) => {
      const x = padL + i * bw;
      const w = Math.max(1.5, bw - Math.min(3, bw * 0.28));
      const cx = x + (bw - w) / 2;
      if (night.durationKnown) {
        const top = y(night.duration);
        s.appendChild(svg('rect', {
          x: cx, y: top, width: w, height: Math.max(1, padT + plotH - top),
          rx: Math.min(3, w / 2), class: 'in-bar' + (selected === night.date ? ' on' : ''),
          'data-date': night.date
        }));
      } else {
        /* A night with no usable duration is a GAP, drawn as a gap. It is
           not a zero-height bar at the baseline, because a reader scanning
           the chart would take that for a night of no sleep. */
        s.appendChild(svg('rect', {
          x: cx, y: padT + plotH - 6, width: w, height: 6, rx: 1,
          class: 'in-gap' + (selected === night.date ? ' on' : ''),
          'data-date': night.date
        }));
      }
    });

    s.appendChild(svg('line', {
      x1: padL, x2: W - padR, y1: padT + plotH, y2: padT + plotH, class: 'in-base'
    }));

    const first = svg('text', { x: padL, y: H - 6, class: 'in-axis' });
    first.textContent = prettyDate(data.nights[0].date);
    const last = svg('text', { x: W - padR, y: H - 6, class: 'in-axis', 'text-anchor': 'end' });
    last.textContent = prettyDate(data.nights[n - 1].date);
    s.append(first, last);
    return s;
  }

  /* A real table behind the picture. The SVG is aria-hidden; this is what
     a screen reader reads, and it is the same numbers. */
  function chartTable(data) {
    const wrap = el('div', 'in-sr');
    const t = el('table');
    const cap = el('caption', null, 'Sleep duration for each of the last ' + data.days + ' nights');
    t.appendChild(cap);
    const head = el('tr');
    ['Night', 'Sleep recorded'].forEach(h => head.appendChild(el('th', null, h)));
    t.appendChild(head);
    data.nights.forEach(nt => {
      const tr = el('tr');
      tr.appendChild(el('td', null, nt.date));
      tr.appendChild(el('td', null, nt.durationKnown ? fmtDuration(nt.duration)
        : nt.recorded ? 'Recorded, duration not known' : 'Not recorded'));
      t.appendChild(tr);
    });
    wrap.appendChild(t);
    return wrap;
  }

  /* ==================================================================
     CONSISTENCY. The spread of when they went to sleep and woke, which is
     the thing sleep science actually has something to say about and which
     this app has never shown.
     ================================================================== */
  function consistency(data) {
    const beds = data.nights.map(n => n.bed).filter(v => v != null);
    const wakes = data.nights.map(n => n.wake).filter(v => v != null);
    const spread = values => {
      if (values.length < 3) return null;
      const m = median(values);
      /* Median absolute deviation, not standard deviation: one unusual
         night — a flight, a newborn, an exam — should not define somebody's
         description of themselves. */
      return { median: m, mad: median(values.map(v => Math.abs(v - m))), n: values.length };
    };
    return { bed: spread(beds), wake: spread(wakes) };
  }

  /* ==================================================================
     PATTERNS. Descriptive only, and silent below a sample where the
     comparison would be noise.
     ================================================================== */
  function pattern(data) {
    const pairs = data.nights.filter(n => n.durationKnown && n.energy != null);
    if (pairs.length < 10) return { enough: false, n: pairs.length, need: 10 };
    const m = median(pairs.map(p => p.duration));
    const longer = pairs.filter(p => p.duration >= m).map(p => p.energy);
    const shorter = pairs.filter(p => p.duration < m).map(p => p.energy);
    if (!longer.length || !shorter.length) return { enough: false, n: pairs.length, need: 10 };
    return {
      enough: true, n: pairs.length,
      median: m,
      longerEnergy: mean(longer), shorterEnergy: mean(shorter),
      longerN: longer.length, shorterN: shorter.length
    };
  }

  /* ==================================================================
     RENDER.
     ================================================================== */
  function render() {
    const host = document.getElementById('insights');
    if (!host) return;
    host.innerHTML = '';

    const data = gather(range);

    const head = el('div', 'in-head');
    head.appendChild(el('h3', null, 'Your nights'));
    const picker = el('div', 'in-range');
    picker.setAttribute('role', 'group');
    picker.setAttribute('aria-label', 'How many nights to show');
    RANGES.forEach(([days, label]) => {
      const b = el('button', 'in-pill' + (range === days ? ' on' : ''), label);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(range === days));
      b.addEventListener('click', () => { range = days; selected = null; render(); });
      picker.appendChild(b);
    });
    head.appendChild(picker);
    host.appendChild(head);

    /* Nothing to show is a real state and gets a real answer, not an
       empty chart implying zero. */
    if (!data.recordedCount) {
      const empty = el('p', 'in-empty',
        'No mornings recorded in the last ' + data.days + ' nights yet. ' +
        'Once you record a morning, your nights appear here — and only the ' +
        'nights you record. SleepSphere does not estimate the ones you miss.');
      host.appendChild(empty);
      return;
    }

    const chartWrap = el('figure', 'in-figure');
    const s = durationChart(data);
    chartWrap.appendChild(s);
    chartWrap.appendChild(chartTable(data));
    host.appendChild(chartWrap);

    /* Tapping a night. One shared handler on the chart rather than a
       listener per bar. */
    s.addEventListener('click', e => {
      const date = e.target && e.target.getAttribute && e.target.getAttribute('data-date');
      if (!date) return;
      selected = selected === date ? null : date;
      render();
    });

    const readout = el('p', 'in-readout');
    if (selected) {
      const night = data.nights.find(n => n.date === selected);
      const bits = [prettyDate(night.date)];
      bits.push(night.durationKnown ? fmtDuration(night.duration) + ' asleep'
        : night.recorded ? 'recorded, sleep duration not known' : 'not recorded');
      if (night.bed != null) bits.push('to sleep ' + fmtClock(night.bed));
      if (night.wake != null) bits.push('woke ' + fmtClock(night.wake));
      if (night.awake != null && night.awake > 0) bits.push('awake ' + fmtDuration(night.awake));
      if (night.rest != null) bits.push('felt rested ' + night.rest + '/5');
      readout.textContent = bits.join(' · ');
    } else {
      readout.textContent = 'Tap a night to see it.';
      readout.classList.add('in-quiet');
    }
    host.appendChild(readout);

    /* What this chart is and is not built from. Shown always, not hidden
       behind a tooltip — the count of what was left out is part of the
       finding. */
    const counts = el('p', 'in-note');
    const parts = ['You recorded ' + data.recordedCount + ' of these ' + data.days + ' nights'];
    if (data.unusableCount) {
      parts.push(data.unusableCount + (data.unusableCount === 1 ? ' is shown as a gap because its sleep total is not knowable'
        : ' are shown as gaps because their sleep totals are not knowable'));
    }
    if (data.unrecordedCount) parts.push(data.unrecordedCount + ' were not recorded');
    counts.textContent = parts.join('. ') + '.';
    host.appendChild(counts);

    /* ---- Summary figures. */
    const stats = el('div', 'in-stats');
    const stat = (label, value, note) => {
      const d = el('div', 'in-stat');
      d.appendChild(el('span', 'in-stat-k', label));
      d.appendChild(el('strong', 'in-stat-v' + (value == null ? ' in-none' : ''),
        value == null ? 'Not enough recorded' : value));
      if (note) d.appendChild(el('span', 'in-stat-n', note));
      stats.appendChild(d);
    };

    const durations = data.withDuration.map(d => d.duration);
    stat('Typical night',
      durations.length >= 3 ? fmtDuration(median(durations)) : null,
      durations.length ? 'median of ' + durations.length + ' night' + (durations.length === 1 ? '' : 's') + ' with a known total' : null);

    const awakes = data.nights.map(n => n.awake).filter(v => v != null);
    stat('Awake in the night',
      awakes.length >= 3 ? fmtDuration(median(awakes)) : null,
      awakes.length ? 'median across ' + awakes.length + ' night' + (awakes.length === 1 ? '' : 's') : null);

    const rests = data.nights.map(n => n.rest).filter(v => v != null);
    stat('Felt rested',
      rests.length >= 3 ? (Math.round(mean(rests) * 10) / 10) + ' of 5' : null,
      rests.length ? 'average of ' + rests.length + ' morning' + (rests.length === 1 ? '' : 's') : null);

    const energies = data.nights.map(n => n.energy).filter(v => v != null);
    stat('Morning energy',
      energies.length >= 3 ? (Math.round(mean(energies) * 10) / 10) + ' of 5' : null,
      energies.length ? 'average of ' + energies.length + ' morning' + (energies.length === 1 ? '' : 's') : null);
    host.appendChild(stats);

    /* ---- Consistency. */
    const c = consistency(data);
    const cons = el('section', 'in-block');
    cons.appendChild(el('h3', null, 'When you sleep'));
    if (!c.bed && !c.wake) {
      cons.appendChild(el('p', 'in-empty',
        'Three nights with times recorded will show how steady your hours are.'));
    } else {
      const line = (label, s2, verb) => {
        if (!s2) return;
        const p = el('p', 'in-line');
        p.appendChild(el('strong', null, label + ' ' + fmtClock(s2.median)));
        const band = Math.round(s2.mad);
        p.appendChild(el('span', null,
          band <= 20 ? ' — within about ' + band + ' minutes on a typical night.'
          : ' — give or take about ' + (band >= 60 ? Math.round(band / 60 * 10) / 10 + ' hours' : band + ' minutes') + '.'));
        cons.appendChild(p);
      };
      line('You usually fall asleep around', c.bed);
      line('You usually wake around', c.wake);
      cons.appendChild(el('p', 'in-note',
        'Steadier hours tend to help more than any single long night. This is ' +
        'a description of what you recorded, not a target to hit.'));
    }
    host.appendChild(cons);

    /* ---- One pattern, carefully. */
    const p = pattern(data);
    const pat = el('section', 'in-block');
    pat.appendChild(el('h3', null, 'Sleep and how you felt'));
    if (!p.enough) {
      pat.appendChild(el('p', 'in-empty',
        'With ' + p.need + ' nights that have both a sleep total and a morning ' +
        'energy rating, this will compare your longer and shorter nights. ' +
        'You have ' + p.n + ' so far.'));
    } else {
      const longer = Math.round(p.longerEnergy * 10) / 10;
      const shorter = Math.round(p.shorterEnergy * 10) / 10;
      const sentence = el('p', 'in-line');
      sentence.appendChild(el('strong', null,
        'On your longer nights you rated your energy ' + longer + ' of 5. ' +
        'On your shorter nights, ' + shorter + '.'));
      pat.appendChild(sentence);
      pat.appendChild(el('p', 'in-note',
        'Split at your own median of ' + fmtDuration(p.median) + ', across ' + p.n +
        ' nights (' + p.longerN + ' longer, ' + p.shorterN + ' shorter). This ' +
        'describes what you wrote down. It does not show that one caused the ' +
        'other — plenty of things move both at once.'));
    }
    host.appendChild(pat);
  }

  /* ------------------------------------------------------------------
     Mount. A section appended to "My pattern", below what is already
     there: this adds a view of the same records and replaces nothing.
     ------------------------------------------------------------------ */
  function mount() {
    const host = document.getElementById('twin');
    if (!host || document.getElementById('insights')) return;
    const section = el('section', 'card in-card');
    section.id = 'insights';
    host.appendChild(section);
    render();
  }

  function boot() {
    mount();
    document.querySelectorAll('.nav button[data-view="twin"]').forEach(b =>
      b.addEventListener('click', () => setTimeout(render, 0)));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.SSInsights = { render, gather, consistency, pattern,
                        toMinutes, nightMinutes, fmtDuration, fmtClock, median, mean,
                        setRange(d) { range = d; render(); } };
})();
