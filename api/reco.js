export default function handler(req, res) {
  const OFFER_BASE = 'https://montrk3.co.uk/?a=26648&c=56065&s1=';

  const sub = (req.query.s1 || req.query.campid || req.query.s2 || req.query.sub_id || '').toString();

  // Forward the other tracking slots (s3 = the TikTok ad account the SPRK launcher stamps on
  // every ad link) so per-account breakdown survives this hop. s2 is skipped when it was
  // already consumed as the s1 value above (never the same value twice).
  const extra = ['s2', 's3', 's4', 's5']
    .map((k) => [k, (req.query[k] || '').toString()])
    .filter(([k, v]) => v && !(k === 's2' && v === sub))
    .map(([k, v]) => '&' + k + '=' + encodeURIComponent(v))
    .join('');

  const dest = OFFER_BASE + encodeURIComponent(sub) + extra;

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Referrer-Policy', 'no-referrer');

  return res.redirect(302, dest);
}
