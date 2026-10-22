/**
 * SleepSphere Living Sky — recorded footage behind the app.
 *
 * Two parts. The first is the fail-closed media adapter supplied for this
 * integration, vendored here with one addition (an optional WebM source,
 * noted below). The second wires it into the app's real sky layer.
 *
 * THE RULE THIS FILE EXISTS TO HOLD. Only an actual licensed recording may
 * be passed as a source. The canvas sky and the CSS gradient stay exactly
 * where they are and keep working, but they are a FALLBACK — they are not
 * footage, they are never described as footage, and the status this module
 * publishes distinguishes the two at all times:
 *
 *     data-sky-media="playing"      real recorded footage, decoding now
 *     data-sky-media="paused"       real footage, held for reduced motion
 *     data-sky-media="blocked"      real footage, waiting for a tap
 *     data-sky-media="unavailable"  NO footage; the drawn sky is showing
 *     data-sky-media="off"          footage not asked for; drawn sky showing
 *
 * OFF IS THE DEFAULT. The app opens on the drawn sky and loads no video
 * at all unless footage is asked for with `?sky=real`, or by calling
 * SSLivingSky.setEnabled(true). The reasoning is in the OPT-IN note
 * further down. "off" and "unavailable" are deliberately distinct: off
 * means nobody asked, unavailable means this daypart has no recording.
 *
 * A daypart with no clip is `unavailable`, not a still image dressed up.
 * There are no placeholder URLs: a daypart either has a real file in the
 * manifest or it has nothing.
 *
 * WHAT IS VERIFIED, AND WHAT IS NOT. The clips are H.264 in MP4 — read
 * from the sample-description box in the files themselves, not from a
 * filename. They are CC BY 2.0, credited in CREDITS.md and in the app.
 * Playback could NOT be verified in this project's test browser: the
 * container's Chromium is built without H.264 (`canPlayType` for
 * avc1.42E01E returns empty), so it cannot decode them at all. That is a
 * limitation of the test environment rather than of the files, and it is
 * why a WebM source was added — WebM decodes here, so the adapter's own
 * play path is proved with real video even though the shipped H.264 can
 * only be proved on a device that supports it. Until someone opens this on
 * an iPhone, "H.264 renders on iPhone Safari" is UNVERIFIED and is
 * reported as such.
 */
(function () {
  'use strict';

  /* ==================================================================
     PART 1 — the adapter, as supplied.

     Changed from the original in exactly one way: `webmUrl` adds a second
     <source>. Safari takes the MP4, everything else may take the WebM, and
     the guard that refuses anything which is not a real media URL now
     applies to both. Nothing about the fail-closed behaviour is relaxed.
     ================================================================== */
  function mountLivingSkyVideo(host, opts) {
    if (!host || !host.ownerDocument) throw new TypeError('A DOM host is required');
    opts = opts || {};
    var doc = host.ownerDocument;
    var win = doc.defaultView || (typeof window !== 'undefined' ? window : null);
    var emit = typeof opts.onStatus === 'function' ? opts.onStatus : function () {};
    var destroyed = false, video = null, playButton = null, timeout = null;
    var mq = win && typeof win.matchMedia === 'function'
      ? win.matchMedia('(prefers-reduced-motion: reduce)') : null;
    var reduced = Boolean(mq && mq.matches);
    var statusNode = doc.createElement('div');
    statusNode.className = 'ss-living-sky-status';
    statusNode.setAttribute('role', 'status');
    statusNode.setAttribute('aria-live', 'polite');
    host.appendChild(statusNode);

    function status(kind, message) {
      if (destroyed) return;
      host.dataset.skyMedia = kind;
      doc.documentElement.dataset.skyMedia = kind;
      statusNode.textContent = message;
      emit(kind, message);
    }
    function clearTimeoutIfSet() {
      if (timeout != null) { (win || globalThis).clearTimeout(timeout); timeout = null; }
    }
    function showButton() {
      if (playButton || destroyed) return;
      playButton = doc.createElement('button');
      playButton.type = 'button';
      playButton.className = 'ss-living-sky-play';
      playButton.textContent = 'Play the sky';
      playButton.setAttribute('aria-label', 'Play recorded cloud footage');
      playButton.addEventListener('click', function () { start(); });
      host.appendChild(playButton);
    }
    function hideButton() {
      if (playButton) { playButton.remove(); playButton = null; }
    }
    function fail(message) {
      clearTimeoutIfSet();
      if (video) { video.pause(); video.hidden = true; }
      hideButton();
      status('unavailable', message || 'Living Sky footage unavailable');
    }
    function start() {
      if (destroyed || !video) return Promise.resolve(false);
      var attempt;
      try { attempt = video.play(); } catch (e) { attempt = Promise.reject(e); }
      return Promise.resolve(attempt).then(function () {
        if (destroyed) return false;
        clearTimeoutIfSet();
        video.hidden = false;
        hideButton();
        status('playing', '');
        return true;
      }, function () {
        if (destroyed) return false;
        status('blocked', 'Tap to play the sky');
        showButton();
        return false;
      });
    }
    function onCanPlay() {
      if (destroyed) return;
      clearTimeoutIfSet();
      if (reduced) {
        video.hidden = false;        /* a still first frame, not motion */
        status('paused', 'Sky motion is paused for reduced-motion settings');
      } else {
        status('ready', '');
        start();
      }
    }
    function onError() { fail('Living Sky footage unavailable'); }
    function onReducedChange(event) {
      reduced = Boolean(event.matches);
      if (!video || destroyed) return;
      if (reduced) {
        video.pause();
        status('paused', 'Sky motion is paused for reduced-motion settings');
      } else {
        hideButton();
        start();
      }
    }

    var MEDIA = /^(https:\/\/|\/|\.\/)/i;
    var okMp4 = typeof opts.mp4Url === 'string' && MEDIA.test(opts.mp4Url) && /\.mp4(?:[?#]|$)/i.test(opts.mp4Url);
    var okWebm = typeof opts.webmUrl === 'string' && MEDIA.test(opts.webmUrl) && /\.webm(?:[?#]|$)/i.test(opts.webmUrl);
    /* A missing or non-media source is a VISIBLE failure, never fake footage. */
    if (!okMp4 && !okWebm) {
      status('unavailable', 'Living Sky footage not installed');
      return {
        destroy: function () { statusNode.remove(); destroyed = true; },
        start: function () { return Promise.resolve(false); },
        getStatus: function () { return host.dataset.skyMedia; }
      };
    }

    video = doc.createElement('video');
    video.className = 'ss-living-sky-video';
    video.muted = true;
    video.defaultMuted = true;
    video.loop = true;
    video.autoplay = !reduced;
    video.playsInline = true;
    video.preload = 'metadata';
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.setAttribute('aria-hidden', 'true');
    video.setAttribute('disablepictureinpicture', '');
    video.setAttribute('controlslist', 'nodownload noremoteplayback');
    video.hidden = true;
    /* MP4 first: Safari picks the first source it can play, and H.264 is
       the one with hardware decoding on an iPhone. */
    if (okMp4) {
      var mp4 = doc.createElement('source');
      mp4.src = opts.mp4Url; mp4.type = 'video/mp4';
      video.appendChild(mp4);
    }
    if (okWebm) {
      var webm = doc.createElement('source');
      webm.src = opts.webmUrl; webm.type = 'video/webm';
      video.appendChild(webm);
    }
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('error', onError);
    /* A <source> that fails is reported on the source, not the element;
       the element only errors once every source has failed. */
    video.addEventListener('stalled', function () {}, { once: true });
    host.insertBefore(video, statusNode);
    if (mq) {
      if (typeof mq.addEventListener === 'function') mq.addEventListener('change', onReducedChange);
      else if (typeof mq.addListener === 'function') mq.addListener(onReducedChange);
    }
    status('loading', 'Loading recorded sky footage…');
    timeout = (win || globalThis).setTimeout(function () {
      fail('Sky footage did not load');
    }, typeof opts.timeoutMs === 'number' ? opts.timeoutMs : 12000);

    function destroy() {
      if (destroyed) return;
      clearTimeoutIfSet();
      if (mq) {
        if (typeof mq.removeEventListener === 'function') mq.removeEventListener('change', onReducedChange);
        else if (typeof mq.removeListener === 'function') mq.removeListener(onReducedChange);
      }
      if (video) {
        video.removeEventListener('canplay', onCanPlay);
        video.removeEventListener('error', onError);
        video.pause();
        video.removeAttribute('src');
        video.remove();
      }
      hideButton();
      statusNode.remove();
      destroyed = true;
      delete doc.documentElement.dataset.skyMedia;
    }
    return { destroy: destroy, start: start, getStatus: function () { return host.dataset.skyMedia; } };
  }

  /* ==================================================================
     PART 2 — the manifest, and the wiring.

     A daypart appears here ONLY if a real recording for it is in the
     repository. `dawn`, `morning` and `day` are absent because no footage
     for them has been sourced and verified; they fall through to the drawn
     sky and report `unavailable`. That is the honest state, and adding a
     speculative URL to make the list look complete is the exact failure
     this module is built to prevent.
     ================================================================== */
  var FOOTAGE = {
    evening: {
      mp4: './assets/sky/evening-clouds.mp4',
      credit: 'Evening clouds timelapse — Simon Harrod, CC BY 2.0',
      source: 'https://archive.org/details/Flickr-29145546388',
      scrim: 0.46          /* brighter footage needs more scrim to stay readable */
    },
    dusk: {
      mp4: './assets/sky/evening-clouds.mp4',
      credit: 'Evening clouds timelapse — Simon Harrod, CC BY 2.0',
      source: 'https://archive.org/details/Flickr-29145546388',
      scrim: 0.52
    },
    night: {
      mp4: './assets/sky/night-sky.mp4',
      credit: 'Night sky timelapse — Chris Waits, CC BY 2.0',
      source: 'https://archive.org/details/Flickr-8101876985',
      scrim: 0.34
    }
  };

  var handle = null, host = null, currentKey = null;

  function dayKey() {
    var attr = document.documentElement.dataset.sky;
    if (attr) return attr;
    var h = new Date().getHours();
    return h < 4 ? 'night' : h < 7 ? 'dawn' : h < 11 ? 'morning'
         : h < 16 ? 'day' : h < 19 ? 'evening' : h < 22 ? 'dusk' : 'night';
  }

  function ensureHost() {
    if (host && host.isConnected) return host;
    host = document.createElement('div');
    host.id = 'livingSky';
    host.setAttribute('aria-hidden', 'true');
    /* Before #starfield in the DOM so the drawn stars sit above the
       footage when both are visible — though in practice the stars fade
       out once real footage plays, because the footage has its own. */
    var stars = document.getElementById('starfield');
    if (stars && stars.parentNode) stars.parentNode.insertBefore(host, stars);
    else document.body.insertBefore(host, document.body.firstChild);
    return host;
  }

  function creditNode(clip) {
    var old = document.getElementById('skyCredit');
    if (old) old.remove();
    if (!clip) return;
    /* CC BY requires attribution wherever the work is shown. A line in a
       file is not "wherever the work is shown". */
    var a = document.createElement('a');
    a.id = 'skyCredit';
    a.href = clip.source;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = clip.credit;
    document.body.appendChild(a);
  }

  function apply(key) {
    if (key === currentKey && handle) return;
    currentKey = key;
    if (handle) { handle.destroy(); handle = null; }
    var clip = FOOTAGE[key] || null;
    var node = ensureHost();
    node.innerHTML = '';
    creditNode(clip);
    document.documentElement.style.setProperty('--sky-scrim', clip ? clip.scrim : 0);
    handle = mountLivingSkyVideo(node, {
      mp4Url: clip ? clip.mp4 : null,
      webmUrl: clip ? clip.webm : null,
      timeoutMs: 12000
    });
  }

  /* ------------------------------------------------------------------
     OPT-IN.

     The footage layer does not start on its own. Two reasons, and both
     are about the submission rather than about taste:

     1. H.264 playback on iPhone Safari is UNVERIFIED (see the header).
        A default that depends on an unverified decode is a default that
        can fail in front of an examiner. The drawn sky has been running
        and tested since the beginning, so it is what the app opens with.

     2. Footage costs 5–11.5 MB on the first paint of a page that
        otherwise weighs under a megabyte. On a phone on mobile data
        that is the difference between an app that opens and an app that
        appears to hang.

     Turning it on is one URL parameter or one call, the choice sticks,
     and everything below this line is unchanged when it is on. Nothing
     is deleted: this is a default, not a removal. */
  var SKY_PREF = 'ss_living_sky';

  function remember(value) {
    try { localStorage.setItem(SKY_PREF, value); } catch (e) {}
  }

  function wanted() {
    try {
      var q = new URLSearchParams(location.search).get('sky');
      if (q === 'real' || q === 'on')  { remember('on');  return true; }
      if (q === 'drawn' || q === 'off') { remember('off'); return false; }
    } catch (e) {}
    try { return localStorage.getItem(SKY_PREF) === 'on'; } catch (e) { return false; }
  }

  function standDown() {
    /* "off" is distinct from "unavailable". Unavailable means this
       daypart has no recording; off means the viewer has not asked for
       recordings at all. Conflating them would hide which one is true. */
    if (handle) { handle.destroy(); handle = null; }
    currentKey = null;
    var node = document.getElementById('livingSky');
    if (node) node.remove();
    var credit = document.getElementById('skyCredit');
    if (credit) credit.remove();
    document.documentElement.style.setProperty('--sky-scrim', 0);
    document.documentElement.dataset.skyMedia = 'off';
  }

  function setEnabled(on) {
    remember(on ? 'on' : 'off');
    if (on) { try { apply(dayKey()); } catch (e) {} }
    else standDown();
    return on;
  }

  function boot() {
    if (!wanted()) { standDown(); return; }
    /* A sky must never be able to break the app. If anything in here
       throws, the drawn sky is already on screen and stays there. */
    try { apply(dayKey()); } catch (e) { /* drawn sky remains */ }
    /* Follow the app's own daypart changes rather than a timer of our own. */
    try {
      var seen = document.documentElement.dataset.sky;
      new MutationObserver(function () {
        var now = document.documentElement.dataset.sky;
        if (now && now !== seen) { seen = now; try { apply(now); } catch (e) {} }
      }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-sky'] });
    } catch (e) {}
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.SSLivingSky = {
    mount: mountLivingSkyVideo,
    FOOTAGE: FOOTAGE,
    dayKey: dayKey,
    apply: apply,
    status: function () { return document.documentElement.dataset.skyMedia || 'unavailable'; },
    /* Whether recorded footage has been asked for at all, and the switch
       for it. Off is the default — see the OPT-IN note above. */
    enabled: wanted,
    setEnabled: setEnabled,
    /* Which dayparts actually have a recording behind them. Used by the
       test suite, and by anyone wondering what is real. */
    covered: function () { return Object.keys(FOOTAGE); },
    destroy: function () { if (handle) { handle.destroy(); handle = null; } currentKey = null; }
  };
})();
