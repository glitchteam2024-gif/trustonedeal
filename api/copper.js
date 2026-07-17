export default function handler(req, res) {
  // ===================================================================
  // Cloaked redirect for the "Copper Play & Earn" offer.
  // Kept SERVER-SIDE so trendhavenn never appears in the page source.
  // The bridge page breaks the user out to /api/copper, which 302s here.
  // ===================================================================
  const OFFER_BASE = 'https://www.trendhavenn.com/copper-play-earn.html?campid=';

  // A repeated query param arrives as an array on Vercel (?s3=a&s3=a → ['a','a']); take the first.
  const first = (v) => (Array.isArray(v) ? v[0] : v);

  // Pull the tracking sub-id from the incoming click.
  const sub = (first(req.query.campid) || first(req.query.s1) || first(req.query.sub_id) || first(req.query.s2) || '').toString();

  // Forward ONLY s3 (the TikTok ad account the SPRK launcher stamps on every ad link) so the
  // downstream bridge can carry the per-account breakdown onward. s2/s4/s5 are not forwarded:
  // this hop bridges to the sprktrax door, which re-stamps s1/s2/s4 and injects the click_id
  // itself (a forwarded s4 would suppress its authoritative offer-name stamp).
  const s3v = (first(req.query.s3) || '').toString();
  const extra = s3v ? '&s3=' + encodeURIComponent(s3v) : '';

  const dest = OFFER_BASE + encodeURIComponent(sub) + extra;

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Referrer-Policy', 'no-referrer');

  return res.redirect(302, dest);
}
