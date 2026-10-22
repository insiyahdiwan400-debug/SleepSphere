/**
 * SleepSphere — simulated intelligence, for concept evaluation only.
 *
 * NOTHING HERE CALLS A MODEL. There is no API key, no network request, no
 * account, no recurring cost. Every function below is deterministic local
 * code: regular expressions, lookup tables and the app's own engine. It runs
 * entirely on the device and nothing it touches leaves the device.
 *
 * Why simulate at all: what is being evaluated is the INTERACTION — where
 * intelligence would reduce effort, what it would say, what it must show
 * before it writes anything, and what a person does when it is wrong. That
 * can be judged now. Which model eventually sits behind it is a later and
 * much smaller decision.
 *
 * Where a real model would be better is marked honestly in each function,
 * and summarised in CONCEPTS.md. The parser below handles the phrasings a
 * participant in this cohort actually uses; a model would handle messier
 * input, in more languages, with fewer rules. The rules are not the point.
 *
 * Two product laws are enforced here rather than left to the interface:
 *
 *   1. NEVER FABRICATE. Anything the text does not state comes back as
 *      null, flagged unknown. A guessed minute is worse than a blank.
 *   2. NEVER WRITE SILENTLY. Every function returns a *proposal*. The
 *      interface must show it and get a confirmation before any record is
 *      saved. No function here writes to state.
 */
(function () {
  'use strict';

  /* ---------------------------------------------------------------- */
  /* Time parsing                                                      */
  /* ---------------------------------------------------------------- */

  /* "5:30", "5.30", "05:30", "5 30", "5am", "half five" is deliberately
     NOT handled — ambiguity is left unresolved rather than guessed. */
  /* Three shapes, in order of confidence:
       "5:30" / "5.30"          — hour and minute
       "7am" / "11 pm"          — hour with a meridiem
       "at 7" / "til 6"         — a bare hour, but ONLY after a preposition
                                  that makes it a time rather than a count.
                                  Without that guard, "awake 3 times" reads
                                  as 03:00. */
  var TIME = /(\b\d{1,2})\s*[:.]\s*(\d{2})\s*(am|pm)?|\b(\d{1,2})\s*(am|pm)\b|\b(?:at|til|till|until|around|about|by)\s+(\d{1,2})(?![:.]\s*\d)\b(?!\s*(?:min|hour|time))/gi;

  function toClock(h, m, ap, hint) {
    h = Number(h); m = m === undefined || m === null ? 0 : Number(m);
    if (!isFinite(h) || h > 23 || m > 59) return null;
    if (ap) {
      ap = ap.toLowerCase();
      if (ap === 'pm' && h < 12) h += 12;
      if (ap === 'am' && h === 12) h = 0;
    } else if (hint === 'night' && h >= 1 && h <= 11) {
      /* "back to sleep around 5" in a sentence about the night means 05:00,
         which is what it already says. Nothing is shifted. */
      h = h;
    }
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }

  function findTimes(text) {
    var out = [];
    var m;
    TIME.lastIndex = 0;
    while ((m = TIME.exec(text)) !== null) {
      var clock = m[1] !== undefined ? toClock(m[1], m[2], m[3], 'night')
                : m[4] !== undefined ? toClock(m[4], 0, m[5], 'night')
                : toClock(m[6], 0, null, 'night');
      if (clock) out.push({ clock: clock, at: m.index, raw: m[0].trim() });
    }
    return out;
  }

  /* Durations: "about an hour", "20 minutes", "half an hour", "a couple of
     hours". Anything vaguer stays unknown. */
  function findDuration(text) {
    var t = text.toLowerCase();
    if (/\bhalf an hour|\bhalf hour/.test(t)) return 30;
    if (/\ban hour and a half|\b1\.5 hours?/.test(t)) return 90;
    if (/\bcouple of hours|\btwo hours|\b2 hours/.test(t)) return 120;
    if (/\ban hour|\b1 hour\b/.test(t)) return 60;
    var mins = t.match(/(\d{1,3})\s*(?:min|mins|minutes)\b/);
    if (mins) return Number(mins[1]);
    var hrs = t.match(/(\d{1,2})\s*(?:hr|hrs|hours?)\b/);
    if (hrs) return Number(hrs[1]) * 60;
    return null;
  }

  /* ---------------------------------------------------------------- */
  /* 1. Reading a night from free text                                 */
  /*                                                                   */
  /* The one place intelligence clearly earns its keep: a fragmented   */
  /* night is tedious to enter as a form and easy to say in a sentence.*/
  /* ---------------------------------------------------------------- */
  function readNight(text, context) {
    var t = String(text || '').toLowerCase().trim();
    var ctx = context || {};
    var times = findTimes(t);
    var proposal = {
      bedTime: null, sleepTime: null, wakeTime: null,
      /* returnedToSleep is a yes/no; returnedAt is a clock. Keeping them
         in one field meant the boolean clobbered the time. */
      returnedToSleep: null, returnedAt: null, awakeMinutes: null,
      wokeForFajr: /\bfajr\b|\bfajar\b|\bprayer\b|\bsalah\b/.test(t),
      durationUnknown: false,
      unknown: [], heard: [], notes: []
    };

    if (!t) {
      proposal.unknown = ['everything'];
      proposal.notes.push('Nothing to read yet.');
      return proposal;
    }

    /* Explicit uncertainty always wins over any number in the sentence. */
    var unsure = /\bnot sure|\bunsure|\bno idea|\bcan'?t remember|\bdon'?t remember|\bsomewhere around|\bmaybe\b/.test(t);

    /* Anchor each time to the nearest preceding verb, which is how people
       actually write these sentences. */
    function labelFor(index) {
      /* Only as far back as this clause. A fixed-width window reached past
         the comma and gave "up at 7" the verb from "back to sleep", so the
         wake time was silently filed as a return-to-sleep. Each clause owns
         its own verb. */
      var before = t.slice(0, index);
      var cut = Math.max(
        before.lastIndexOf(','), before.lastIndexOf('.'),
        before.lastIndexOf(';'), before.lastIndexOf(' then '),
        before.lastIndexOf(' and ')
      );
      before = before.slice(cut + 1);
      if (/back (to sleep|down|asleep)|returned|slept again|went back/.test(before)) return 'returnedAt';
      if (/\bup\b|\bwoke|\bawake|\bgot up|\bfinally/.test(before)) return 'wakeTime';
      if (/\bbed\b|\blay down|\bturned in|\bwent to bed/.test(before)) return 'bedTime';
      if (/\basleep|\bfell asleep|\bdropped off|\bslept/.test(before)) return 'sleepTime';
      if (/\bfajr|\bfajar|\bprayer/.test(before)) return 'fajrAt';
      return null;
    }

    times.forEach(function (time) {
      var label = labelFor(time.at);
      if (!label) return;
      if (label === 'fajrAt') { proposal.wokeForFajr = true; proposal.heard.push('Fajr at ' + time.clock); return; }
      if (proposal[label] === null || proposal[label] === undefined) {
        proposal[label] = time.clock;
        proposal.heard.push(label + ' ' + time.clock);
      }
    });

    /* Times with no verb attached, in order, only when the sentence gave
       us nothing else — and only ever as the obvious pair. */
    /* Only when the sentence gave no verbs at all. If even one time was
       understood, guessing the others from position would overwrite
       something the person actually said. */
    if (!proposal.heard.length && !proposal.bedTime && !proposal.wakeTime && times.length === 2) {
      proposal.bedTime = times[0].clock;
      proposal.wakeTime = times[1].clock;
      proposal.notes.push('Read as "in bed" then "up". Change either if that is wrong.');
    }

    var duration = findDuration(t);
    if (duration !== null && /awake|up for|lay there|couldn'?t sleep/.test(t)) {
      proposal.awakeMinutes = duration;
      proposal.heard.push('awake about ' + duration + ' minutes');
    }

    if (/back (to sleep|down|asleep)|returned|slept again|went back/.test(t)) proposal.returnedToSleep = true;
    if (proposal.returnedAt) proposal.returnedToSleep = true;
    if (/stayed up|didn'?t go back|did not go back|stayed awake/.test(t)) proposal.returnedToSleep = false;

    /* THE RULE. If the person said they are unsure, or the sentence simply
       does not contain what is needed to total the night, the duration is
       unknown and stays unknown. */
    /* Went back to sleep, but neither when nor for how long: the night
       cannot be totalled, so its length is unknown. */
    if (unsure || (proposal.returnedToSleep === true &&
                   proposal.returnedAt === null && proposal.awakeMinutes === null)) {
      proposal.durationUnknown = true;
    }
    if (!proposal.bedTime) proposal.unknown.push('when you went to bed');
    if (!proposal.wakeTime) proposal.unknown.push('when you got up');
    if (proposal.durationUnknown) proposal.unknown.push('how much of it was sleep');

    if (unsure) proposal.notes.push('You said you were not sure, so the length is left unknown rather than estimated.');
    if (proposal.wokeForFajr && ctx.fajr) proposal.notes.push('Fajr was ' + ctx.fajr + ' where you are.');

    return proposal;
  }

  /* ---------------------------------------------------------------- */
  /* 2. The morning read                                               */
  /*                                                                   */
  /* Deliberately the SAME honest logic the app already uses, phrased  */
  /* warmly. A model would vary the wording; it must not be allowed to */
  /* vary the claim. Comparisons only, never causes.                   */
  /* ---------------------------------------------------------------- */
  function readMorning(record, history, engine) {
    if (!record) return { line: 'Nothing recorded yet.', basis: [] };
    var basis = [];
    var mine = engine.sleepMinutesOf(record);

    if (mine === null) {
      return {
        line: 'The times are kept, but how much of that was sleep is not known — so there is nothing to compare this morning to.',
        basis: ['Sleep duration unknown for this night'],
        warm: 'That is a fine place to leave it. A night you cannot total is still a night that happened.'
      };
    }

    var usable = engine.withSleepDuration(history || []).filter(function (r) { return r.date !== record.date; });
    if (usable.length < 3) {
      return { line: 'Recorded. A few more nights and this will start to mean something.',
               basis: [usable.length + ' earlier nights with a known length'], warm: '' };
    }

    var nums = usable.map(engine.sleepMinutesOf).sort(function (a, b) { return a - b; });
    var median = nums[Math.floor(nums.length / 2)];
    var gap = mine - median;
    var rest = Number(record.rest);
    var restHistory = usable.map(function (r) { return Number(r.rest); })
      .filter(function (n) { return isFinite(n); }).sort(function (a, b) { return a - b; });
    var restMedian = restHistory[Math.floor(restHistory.length / 2)];
    var restGap = isFinite(rest) && isFinite(restMedian) ? rest - restMedian : 0;

    basis.push('This night: ' + engine.formatDuration(mine));
    basis.push('Your usual: ' + engine.formatDuration(median) + ' across ' + usable.length + ' nights');
    if (isFinite(restMedian)) basis.push('Felt ' + rest + '/5 against a usual ' + restMedian + '/5');

    var line, warm = '';
    if (Math.abs(gap) <= 30 && restGap <= -1) {
      line = 'About your usual length, but it left you with less than usual.';
      warm = 'Worth noticing if it happens again. One night is not a pattern.';
    } else if (Math.abs(gap) <= 30 && restGap >= 1) {
      line = 'A usual sort of night, and it treated you well.';
    } else if (gap <= -45 && restGap <= -1) {
      line = 'Shorter than your usual night, and this morning shows it.';
      warm = 'Nothing to fix. Tonight starts in a few hours.';
    } else if (gap <= -45) {
      line = 'Shorter than usual, though you seem to have carried it well.';
    } else if (gap >= 45 && restGap <= -1) {
      line = 'Longer than usual, and still not much in the tank.';
      warm = 'Length is not the whole story, and that is worth knowing about yourself.';
    } else if (gap >= 45) {
      line = 'A longer night than usual.';
    } else {
      line = 'A night much like your others.';
    }
    return { line: line, basis: basis, warm: warm };
  }

  /* ---------------------------------------------------------------- */
  /* 3. Why tonight looks like this                                    */
  /*                                                                   */
  /* Explanation of something the engine already decided. It restates; */
  /* it does not decide. A model would phrase it; the facts are the    */
  /* plan's own.                                                       */
  /* ---------------------------------------------------------------- */
  function explainPlan(plan, knowledge, engine) {
    if (!plan) return [];
    var f = function (mins) { return engine.formatTime(mins); };
    var lines = [];
    var finalWake = engine.planFinalWake(plan);
    if (finalWake) lines.push('You need to be up at ' + f(engine.toMinutes(finalWake)) + '.');
    if (plan.mode === 'fajr' && plan.fajr) {
      lines.push('Fajr is ' + f(engine.toMinutes(plan.fajr)) +
                 ', so tonight is built as two blocks rather than one.');
      lines.push('That is why bedtime is earlier than it would otherwise be — the first block has to carry most of the night.');
    }
    lines.push('Winding down from ' + f(plan.windStart) +
               ' gives you ' + (plan.wind || 30) + ' minutes before you settle.');
    lines.push('Total opportunity: ' + engine.formatDuration(plan.total) + '.');
    if (knowledge && knowledge.fajrEstimated) {
      lines.push('Fajr here is estimated for your latitude rather than measured.');
    }
    return lines;
  }

  /* ---------------------------------------------------------------- */
  /* 4. Suggested replies                                              */
  /*                                                                   */
  /* The non-AI path, and the reason the conversational concept is not */
  /* a dead end for someone who will not or cannot type.               */
  /* ---------------------------------------------------------------- */
  function chipsFor(scene) {
    if (scene === 'evening') return ['That works', 'I will be up later', 'Early start tomorrow', 'Exam tomorrow'];
    if (scene === 'record')  return ['Slept straight through', 'Up for Fajr', 'Awake a long time', 'Not sure'];
    if (scene === 'morning') return ['Why?', 'What should I do tonight?'];
    return [];
  }

  /* Canned, deterministic answers for the demo's free-text questions. A
     real model would answer anything; these answer the four things people
     in testing actually asked, and say so when they cannot. */
  var ANSWERS = [
    { match: /why.*(early|earlier|bedtime|bed time)/,
      reply: 'Because you are up for Fajr and then again at 6:30. The first block has to carry most of the night, so it starts earlier than it would if you slept straight through.' },
    { match: /why|explain/,
      reply: 'Tonight is built backwards from when you need to be up, around Fajr, with your usual eight hours as the target.' },
    { match: /(is|am i) (it|this) (ok|okay|normal|bad)|normal\?/,
      reply: 'Waking for Fajr and going back to sleep is an ordinary shape for a night, not a broken one. What matters more is that your wake time stays roughly steady.' },
    { match: /tired|exhausted|rough|bad night/,
      reply: 'That reads as a short night rather than a bad one. Nothing to fix tonight — keeping your wake time steady tomorrow does more than going to bed early tonight.' },
    { match: /tonight|what should i do/,
      reply: 'Nothing beyond what is already planned. Wind down at 9:50 and let the rest take care of itself.' }
  ];
  function answer(question) {
    var q = String(question || '').toLowerCase();
    for (var i = 0; i < ANSWERS.length; i++) if (ANSWERS[i].match.test(q)) return ANSWERS[i].reply;
    return 'I can only answer a few things in this prototype — try asking why tonight looks the way it does.';
  }

  window.ConceptAI = {
    simulated: true,
    readNight: readNight,
    readMorning: readMorning,
    explainPlan: explainPlan,
    chipsFor: chipsFor,
    answer: answer,
    /* What a real deployment would have to decide, surfaced in the UI so it
       is part of the review rather than a footnote. */
    privacy: {
      onDevice: 'Everything in these concepts runs on this device. Nothing is sent anywhere.',
      wouldSend: 'A cloud model would need the sentence you typed and your night times. That is health data, and it would need its own consent screen — separate from the study consent — before a single word left the phone.',
      alternative: 'The parsing shown here is ordinary on-device code. It is weaker than a model on messy input and stronger on privacy: there is nothing to send.'
    }
  };
})();
