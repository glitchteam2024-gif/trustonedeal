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

  // A repeated query param arrives as an array on Vercel (?s3=a&s3=a → ['a','a']); take the first
  // value so a coerced 'a,a' can never corrupt a forwarded slot.
  const first = (v) => (Array.isArray(v) ? v[0] : v);

  // Pull the tracking sub-id from the incoming click (any of these keys).
  const sub = (first(req.query.s1) || first(req.query.campid) || first(req.query.s2) || first(req.query.sub_id) || '').toString();

  // Forward ONLY s3 — the TikTok ad account the SPRK launcher stamps on every ad link — so the
  // per-account breakdown survives this hop instead of collapsing to s1 alone. We deliberately do
  // NOT forward s2/s4/s5: this hop routes through the sprktrax door, which authoritatively re-stamps
  // s1=aff<N>, s2=<SPK>, s4=<served offer name> and injects the click_id itself. Forwarding an
  // inbound s4 would SUPPRESS the door's offer-name stamp (it stamps only when s4 is absent), and
  // forwarding s5 (the network's click_id echo slot) risks collapsing postback dedup on a constant.
  const s3v = (first(req.query.s3) || '').toString();
  const extra = s3v ? '&s3=' + encodeURIComponent(s3v) : '';

  const dest = OFFER_BASE + encodeURIComponent(sub) + extra;

  // Never cache a redirect, and don't leak the referrer onward.
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Referrer-Policy', 'no-referrer');

  return res.redirect(302, dest);
}
