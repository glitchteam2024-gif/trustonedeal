export default function handler(req, res) {
  const OFFER_BASE = 'https://montrk3.co.uk/?a=26648&c=56065&s1=';

  const sub = (req.query.s1 || req.query.campid || req.query.s2 || req.query.sub_id || '').toString();

  const dest = OFFER_BASE + encodeURIComponent(sub);

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Referrer-Policy', 'no-referrer');

  return res.redirect(302, dest);
}
