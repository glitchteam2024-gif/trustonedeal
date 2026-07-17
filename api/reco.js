export default function handler(req, res) {
  const OFFER_BASE = 'https://montrk3.co.uk/?a=26648&c=56065&s1=';

  // A repeated query param arrives as an array on Vercel (?s3=a&s3=a → ['a','a']); take the first.
  const first = (v) => (Array.isArray(v) ? v[0] : v);

  const sub = (first(req.query.s1) || first(req.query.campid) || first(req.query.s2) || first(req.query.sub_id) || '').toString();

  // Forward ONLY s3 (the TikTok ad account the SPRK launcher stamps on every ad link) so per-account
  // breakdown survives this hop. This hop goes DIRECT to the network tracker (no SPRK door): s2/s4
  // have no consumer here, and s5 is the network's click_id echo slot — forwarding a constant s5
  // would collapse postback dedup — so only s3 rides through.
  const s3v = (first(req.query.s3) || '').toString();
  const extra = s3v ? '&s3=' + encodeURIComponent(s3v) : '';

  const dest = OFFER_BASE + encodeURIComponent(sub) + extra;

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Referrer-Policy', 'no-referrer');

  return res.redirect(302, dest);
}
