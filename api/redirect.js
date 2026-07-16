export default function handler(req, res) {
  // ===================================================================
  // Affiliate destination — kept SERVER-SIDE so it never appears in the
  // landing page source. The landing page only ever links to /api/redirect.
  //
  // We route through the SPRK PERMANENT universal /aff_c link (sprktrax.org).
  // It is a stable token that NEVER expires (resolved by SPRK as long as its
  // row exists — like the scaler links), so this can't silently 404 a live ad.
  // The door fills the sub-id into the hidden offer URL (montrk3 Freecash) and
  // mints a click id, then 302s. The base ends with "&s1=" so the sub-id is
  // appended; it carries lander -> /api/redirect -> /aff_c -> offer, so the
  // affiliate's SubID still tracks. SPRK cloaks the real network downstream.
  // ===================================================================
  const OFFER_BASE = 'https://sprktrax.org/aff_c?t=GnVgg3ZCi82A52juG7Clydbm&s1=';

  // Pull the tracking sub-id from the incoming click (any of these keys).
  const sub = (req.query.s1 || req.query.campid || req.query.s2 || req.query.sub_id || '').toString();

  // Forward the OTHER tracking slots too when the click carries them — s3 is the TikTok ad
  // account the SPRK launcher stamps on every ad link, s4/s5 are reserved/click-id slots —
  // so per-account breakdown survives this hop instead of being collapsed to s1 alone.
  // s2 is skipped when it was already consumed as the s1 value above (never the same value twice).
  const extra = ['s2', 's3', 's4', 's5']
    .map((k) => [k, (req.query[k] || '').toString()])
    .filter(([k, v]) => v && !(k === 's2' && v === sub))
    .map(([k, v]) => '&' + k + '=' + encodeURIComponent(v))
    .join('');

  const dest = OFFER_BASE + encodeURIComponent(sub) + extra;

  // Never cache a redirect, and don't leak the referrer onward.
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Referrer-Policy', 'no-referrer');

  return res.redirect(302, dest);
}
