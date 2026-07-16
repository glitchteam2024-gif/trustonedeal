export default function handler(req, res) {
  // ===================================================================
  // Cloaked redirect for the "Copper Play & Earn" offer.
  // Kept SERVER-SIDE so trendhavenn never appears in the page source.
  // The bridge page breaks the user out to /api/copper, which 302s here.
  // ===================================================================
  const OFFER_BASE = 'https://www.trendhavenn.com/copper-play-earn.html?campid=';

  // Pull the tracking sub-id from the incoming click.
  const sub = (req.query.campid || req.query.s1 || req.query.sub_id || req.query.s2 || '').toString();

  // Forward the other tracking slots (s3 = the TikTok ad account the SPRK launcher stamps on
  // every ad link) so the downstream bridge can carry per-account breakdown onward. s2 is
  // skipped when it was already consumed as the campid value above (never the same value twice).
  const extra = ['s2', 's3', 's4', 's5']
    .map((k) => [k, (req.query[k] || '').toString()])
    .filter(([k, v]) => v && !(k === 's2' && v === sub))
    .map(([k, v]) => '&' + k + '=' + encodeURIComponent(v))
    .join('');

  const dest = OFFER_BASE + encodeURIComponent(sub) + extra;

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Referrer-Policy', 'no-referrer');

  return res.redirect(302, dest);
}
