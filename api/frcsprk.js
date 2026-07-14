<script>
(function(){
  var DEST = ${escapedDest};
  var ua   = navigator.userAgent || '';

  // ── Pull placement straight out of DEST ──────────────────────────
  function getDestParam(url, key) {
    try {
      var decoded = decodeURIComponent(url);
      var match   = decoded.match(new RegExp('[?&]' + key + '=([^&]+)'));
      return match ? decodeURIComponent(match[1]) : '';
    } catch(e) { return ''; }
  }

  var placement        = getDestParam(DEST, 'placement');
  var isTikTokPlacement = /tiktok/i.test(placement);   // catches TikTok / tiktok / TIKTOK
  // ─────────────────────────────────────────────────────────────────

  var SOCIAL_RE = /TikTok|musical_ly|musical\.ly|ByteLocX|ByteLocale|bytedance|BytedanceWebview|FBAN|FBAV|FB_IAB|FBIOS|Instagram|Snapchat|Pinterest|LinkedInApp|Line\/|Twitter|WhatsApp/i;

  var isAndroid = /Android/i.test(ua);
  var isIOS     = /iPhone|iPad|iPod/i.test(ua);

  var inIAB = (
    isTikTokPlacement ||                                  // placement is the source of truth
    SOCIAL_RE.test(ua) ||
    (/wv/.test(ua) && isAndroid) ||
    (isIOS && /AppleWebKit/.test(ua) && !/Safari\//.test(ua))
  );

  function navTo(url) {
    try { window.top.location.replace(url); } catch(e) {
      try { window.top.location.href = url; } catch(e2) {
        window.location.replace(url);
      }
    }
  }

  if (!inIAB) {
    navTo(DEST);
    return;
  }

  var _fired = false;

  function androidBreakout() {
    var intentUrl = 'intent://'
      + DEST.replace(/^https?:\/\//, '')
      + '#Intent;scheme=https;package=com.android.chrome;'
      + 'S.browser_fallback_url=' + encodeURIComponent(DEST) + ';end;';
    try { window.location.href = intentUrl; } catch(e) { navTo(DEST); }
    setTimeout(function(){ if (!document.hidden) navTo(DEST); }, 2500);
  }

  function iosBreakout() {
    try {
      window.location.href = 'googlechrome-x-callback://x-callback-url/open?url='
        + encodeURIComponent(DEST);
    } catch(e) {}

    setTimeout(function(){
      if (document.hidden) return;
      var w = null;
      try { w = window.open(DEST, '_blank'); } catch(e) {}
      if (!w || w.closed || typeof w.closed === 'undefined') {
        try {
          var a = document.createElement('a');
          a.href = DEST; a.target = '_blank'; a.rel = 'noopener noreferrer';
          a.style.cssText = 'position:absolute;opacity:0;pointer-events:none';
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
        } catch(e2) {}
      }
    }, 350);

    setTimeout(function(){
      if (document.hidden) return;
      try { window.location.href = DEST.replace(/^https:\/\//, 'safari-https://'); } catch(e) {}
    }, 1100);

    setTimeout(function(){ if (!document.hidden) navTo(DEST); }, 3000);
  }

  function fire() {
    if (_fired) return;
    _fired = true;
    if (isAndroid)  androidBreakout();
    else if (isIOS) iosBreakout();
    else            navTo(DEST);
  }

  if (isIOS) {
    document.addEventListener('touchstart', function iosHandler(){
      document.removeEventListener('touchstart', iosHandler);
      fire();
    }, { passive: true, once: true });
    setTimeout(function(){
      if (!_fired && !document.hidden) {
        try {
          window.location.href = 'googlechrome-x-callback://x-callback-url/open?url='
            + encodeURIComponent(DEST);
        } catch(e) {}
      }
    }, 800);
  }

  var autoTimer = null;
  if (isAndroid) { autoTimer = setTimeout(fire, 1200); }

  function cancelAndFire() {
    if (autoTimer) clearTimeout(autoTimer);
    fire();
  }

  var cta = document.getElementById('cta');
  if (cta) {
    cta.addEventListener('touchstart', function(e){ e.preventDefault(); cancelAndFire(); }, { passive: false, once: true });
    cta.addEventListener('click',      function(e){ e.preventDefault(); cancelAndFire(); }, { once: true });
  }

  document.getElementById('body').addEventListener('click', function(){ cancelAndFire(); }, { once: true });

  setTimeout(function(){ if (!_fired) { _fired = true; navTo(DEST); } }, 5000);

})();
</script>
