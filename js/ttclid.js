/*!
 * TikTok ttclid passthrough — single-file include.
 *
 * What it does:
 *   1. On page load, captures `ttclid` from the page URL (TikTok auto-appends
 *      this to every ad click).
 *   2. Stores it in a first-party cookie (`_ttclid`, 30-day TTL) so it survives
 *      across our landers / quiz steps.
 *   3. Rewrites every anchor on the page that points to our trackers to include
 *      `ttclid={value}` if it's not already there.
 *   4. Also handles dynamically-added links via a MutationObserver, so CTAs
 *      built by quiz/funnel JS later in the page lifecycle still get tagged.
 *
 * Why this matters:
 *   Without ttclid in the conversion postback, TikTok's Events API can't
 *   match conversions back to the specific ad click that drove them.
 *   Match quality drops from ~85% → ~30% with ttclid missing.
 *
 * Usage (add to any lander right before </body>):
 *   <script src="/js/ttclid.js" async></script>
 *
 * Safe to include even on landers that already handle ttclid — won't double up.
 */
(function () {
  'use strict';

  // Trackers we care about. Add new hosts here as you add new offer networks.
  var TRACKER_HOSTS = [
    'trk.cs350.com',
    't.afftrackr.com',
    'trk.getplayapp.live',
    'quickflarehit.com',
    'sprktrax.org',
    'www.enjoygamestoday.live',
  ];

  var COOKIE_NAME = '_ttclid';
  var COOKIE_TTL_DAYS = 30;

  function readCookie(name) {
    var m = document.cookie.match('(?:^|; )' + name.replace(/([.*+?^${}()|[\]\\])/g, '\\$1') + '=([^;]*)');
    return m ? decodeURIComponent(m[1]) : null;
  }

  function writeCookie(name, value, days) {
    var exp = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = name + '=' + encodeURIComponent(value) +
      '; expires=' + exp + '; path=/; SameSite=Lax';
  }

  // Capture ttclid: prefer URL param, fall back to cookie if user navigated
  // internally (e.g. quiz → lander), persist URL value to cookie if fresh.
  function getTtclid() {
    try {
      var params = new URLSearchParams(window.location.search);
      var fromUrl = params.get('ttclid');
      if (fromUrl) {
        writeCookie(COOKIE_NAME, fromUrl, COOKIE_TTL_DAYS);
        return fromUrl;
      }
      return readCookie(COOKIE_NAME);
    } catch (e) {
      return null;
    }
  }

  function isTrackerLink(href) {
    if (!href) return false;
    for (var i = 0; i < TRACKER_HOSTS.length; i++) {
      if (href.indexOf(TRACKER_HOSTS[i]) !== -1) return true;
    }
    return false;
  }

  function addTtclidToLink(anchor, ttclid) {
    if (!anchor || !anchor.href || !ttclid) return;
    if (!isTrackerLink(anchor.href)) return;
    try {
      var u = new URL(anchor.href);
      // Don't clobber an explicit ttclid the lander already set.
      if (u.searchParams.has('ttclid')) return;
      u.searchParams.set('ttclid', ttclid);
      anchor.href = u.toString();
    } catch (e) {
      // If URL parsing fails (relative href / malformed), do a string append.
      var sep = anchor.href.indexOf('?') === -1 ? '?' : '&';
      anchor.href = anchor.href + sep + 'ttclid=' + encodeURIComponent(ttclid);
    }
  }

  function tagAllLinks(ttclid) {
    if (!ttclid) return;
    var anchors = document.getElementsByTagName('a');
    for (var i = 0; i < anchors.length; i++) {
      addTtclidToLink(anchors[i], ttclid);
    }
  }

  // Run once now (immediately if DOM ready, otherwise on DOMContentLoaded).
  var ttclid = getTtclid();
  function run() { tagAllLinks(ttclid); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }

  // Watch for dynamically-added links (quiz flows that build CTAs in JS).
  // We re-tag on any subtree mutation; cheap because tagAllLinks short-circuits
  // for non-tracker anchors and skips already-tagged ones.
  if (window.MutationObserver) {
    var obs = new MutationObserver(function (mutations) {
      // Re-run only if any mutation added an <a> (or contained one).
      var needs = false;
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        for (var j = 0; j < (m.addedNodes ? m.addedNodes.length : 0); j++) {
          var n = m.addedNodes[j];
          if (n.nodeType === 1 && (n.tagName === 'A' || (n.getElementsByTagName && n.getElementsByTagName('a').length))) {
            needs = true; break;
          }
        }
        if (needs) break;
      }
      if (needs) tagAllLinks(ttclid);
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
  }

  // Expose for debugging in DevTools: window.__ttclid()
  window.__ttclid = function () { return ttclid; };
})();
