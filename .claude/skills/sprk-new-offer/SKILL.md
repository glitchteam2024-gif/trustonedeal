---
name: sprk-new-offer
description: >-
  End-to-end checklist for adding a NEW offer to the SPRK network — offer row, tracking door,
  trustonedeal landers, creatives, network postback — with attribution locked to opaque
  SPK-XXXX-XXXX spark codes on every offer. Use whenever Migi says anything like "add the next
  offer", "new offer", "set up <brand>", "build landers for <offer>", "wire up tracking for
  <offer>", or asks why an offer-code subid (CB18-1 / TU26-3 style) is popping up in reports.
  The offer's short code (CB, TU, FC…) is a DISPLAY label only — it must never become a spark code.
---

# Adding a new offer — SPK-XXXX-XXXX attribution, end to end

Mirrored in **trustonedeal** (landers) and **SPRKNetworkAds** (offer row / doors / postback) —
if you change one copy, change the other. Sibling skills: `sprk-subid-attribution` (diagnosing
attribution that already broke), `sprk-safe-ship`, `sprk-money-audit`.

⚠️ The local SPRKNetworkAds checkout often sits on a stale `codex/*` branch — verify door /
postback behavior against **origin/main** (what Vercel deploys), never the working tree.

## Why this skill exists (the Copper "CB" incident, 2026-07-14)

Ashlyn (ashlynn.brunelle@gmail.com, AffID 18) added a Copper creative at 19:48 UTC and got the
code **`CB18-1`** — the old self-describing `<offerCode><affId>-<seq>` generator built it from
the offer's short code (`offers.code = 'CB'`) hours before the SPK-only fix (`35aeaf5`)
deployed. Her live TikTok ad carries `?s1=CB18-1` baked into the link, so "CB" keeps showing in
subid reports even though the money attributes correctly to her account. Same batch:
`TU26-1/2/3`, `GP25-1`. The generator is dead; this skill keeps every future offer clean.

## The iron rule (mint side)

**No SPRK code path may MINT a self-describing `<offerCode><affId>-<seq>` spark code for a
locked affiliate. Locked-affiliate codes are always opaque `SPK-XXXX-XXXX`.** (Team rule
2026-07-14, Migi — see `SPRKNetworkAds/api/CLAUDE.md` → "Spark codes / SubIDs".)

- `api/spark-code.js → generateSPKCode()` is the canonical generator. Any new creation path
  (bulk upload, admin tool, worker) must produce codes through it — or an exact mirror of it:
  `admin.js`'s house-copy mint carries an inline mirror (`spGen`) that must stay byte-identical.
  Never reconstruct `${offerCode}${affId}`.
- `offers.code` (e.g. `CB`, `TU`) is a reporting label. `admin.js` builds the display-only
  `affofferid` (`(offer.code||'OFF') + affId`, e.g. `CB18`) for the admin UI — it never becomes
  a spark code, and admin link-assignment rejects any link already carrying `s1=`.
- `SPK-` is a reserved prefix: custom codes starting with it are rejected (case-insensitive).
- Exception BY DESIGN: self-managed **scalers** (`role = 'scaler'`) name their own codes
  (`sub-xxxxxx` placeholder until renamed). Do not "fix" those to SPK. A scaler may legally
  pick an offer-code-lookalike name (`CB19-1` passes the validator) — check the row's
  ownership + role before assuming a generator regression.

## What the network actually sees (aff<N> wire scheme, Ricky/Monetise 2026-07-16)

The INBOUND ad link always carries `?s1=<SPK>`. The door **translates** on the way out
(`stampAffiliateSubids`, `api/_lib/tracking.js` on origin/main):

- resolved click → `s1 = aff<N>` (the affiliate's AffID) · `s2 = SPK code` (the creative) ·
  `s3 = ad account` (launcher-stamped, forwarded) · `s4 = offer name` · click_id in
  `offers.clickid_slot` (default `s5`).
- UNRESOLVED `s1` (unregistered/junk code, or a lookup blip) → fail-open: forwards byte-for-byte,
  raw `s1` intact, no owner. So junk `s1` values in network reports are expected noise, not a
  generator regression.

**`aff<N>` in the network's s1 column is CORRECT — do not "fix" it back to SPK.**

## Checklist for wiring a new offer (in order)

1. **Offer row** (Supabase `offers`): `name`, `code` (2–4 letters, display only),
   `destination_url` = the real network URL (montrk/CAKE) with its subid slots — admin-only,
   never appears in any lander or affiliate-visible surface. `clickid_slot` (default `s5`) must
   match the slot the network's postback echoes as `cid`. `affiliate_payout` is display-facing
   for MATCHED traffic (commission is % of gross), but it IS the recorded payout on UNMATCHED
   conversions — set a sane per-conversion figure, not a placeholder.
2. **Landing page row** (`landing_pages`): `slug` → the door URL is
   `https://sprktrax.org/api/link/<slug>`. Anti-framing enforcement is a PAIR of flags — flip
   BOTH or neither: `landing_pages.enforce_assignment` (per-LP: door 404s a resolved SPK owner
   with no ACTIVE `landing_page_affiliates` row) AND `offers.enforce_assignment` (postback
   holds door-bypassing conversions from unassigned affiliates). Only enable after the roster
   is fully mirrored into the assignment tables (Copper pattern — opt-in).
3. **Landers** (trustonedeal): copy the proven CR50/50TU pattern (`CR50/CR1/index.html`):
   - Inline offer-wiring script points at the DOOR (`sprktrax.org/api/link/<slug>`) and carries
     EVERY incoming query param through (esp. `?s1=<SPK>`); the real network URL never appears
     in lander markup.
   - Keep the `mc_attr` fallback, the TikTok breakout script, and the `/js/ttclid.js`
     passthrough (sprktrax.org is in its `TRACKER_HOSTS` allowlist).
   - The door hard-404s any click without `s1`/`sub1` — by design. Never link a CTA straight to
     the network URL (that's bypass failure mode C in `sprk-subid-attribution`).
4. **Creatives**: affiliates add creatives in Spark Bank → `api/spark-code.js` auto-mints
   `SPK-XXXX-XXXX`, immutable for locked affiliates. Never hand-insert `spark_codes` rows.
   ⚠️ **"Change Offer" re-links a creative WITHOUT re-minting** — a grandfathered non-SPK code
   re-pointed at the new offer rides into its reports with its old code. The SQL audit below is
   what catches this.
5. **Launcher**: nothing to configure for affiliates (resolved from `user_profiles.role` via the
   shared `resolveRoleFlags` helper, commit `2ddc6a4`): destination is resolved server-side and
   `?s1=<spk_code>` is appended (an s1 already in the resolved destination wins, but
   admin-assigned links are screened to reject embedded s1), campaign name is forced to the SPK
   code. If a launch shows a non-SPK subid, check the user's `role` — a stale `coach`/`demo`
   role doesn't just skip SPK-forcing, it actively falls back to the LEGACY `subid_value`
   column (see the role-gating memory).
6. **Network postback** (per offer or account-global):
   `…&s1=#s1#&s2=#s2#&s3=#s3#&s4=#s4#&s5=#s5#&cid=#s5#&payout=#price#&txid=#tid#` — the `cid`
   macro's slot MUST equal `offers.clickid_slot`. They are set in two places (offer row +
   network postback template); a mismatch silently kills the authoritative click match.
7. **Assignment**: assign the LP per affiliate (admin → offers). Revoked/paused
   `offer_assignments` 404 the door; caps/fallback via `conversion_cap`/`fallback_offer_id`.

## Verify before announcing it done

- **Unregistered test code**: hit the lander with `?s1=SPK-TEST-0000` → the door 302 must land
  on the network URL with `s1=SPK-TEST-0000` intact (fail-open passthrough; no click-owner).
- **Registered SPK** (a real affiliate creative): expect the production layout instead —
  `s1=aff<N>`, `s2=<SPK>`, `s4=<offer name>`, click_id in the offer's `clickid_slot`. That is
  correct; don't mistake it for broken wiring.
- A bare lander URL (no `s1`) must still render (preview), but the door must 404.
- SQL audit (read-only) — must return 0 rows for the new offer. Over-reports on purpose (an
  audit must never under-report): row-less / NULL-role owners count as locked affiliates, and
  emails join case-insensitively:

  ```sql
  select distinct s.spk_code, u.email
  from spark_codes s
  join auth.users u on u.id = s.user_id
  left join user_profiles p on lower(p.email) = lower(u.email)
  where s.offer_id = '<new-offer-id>'
    and (s.status is null or s.status <> 'deleted')
    and s.spk_code not ilike 'SPK-%'
    and coalesce(p.role, 'affiliate') <> 'scaler';
  ```

- After first real traffic: Admin → Network & Offers → Unclaimed SubIDs should stay empty for
  this offer; `conversions.match_source` on early rows tells you which leg attributed
  (`click_id` → `spk` → `subid_value` → `subid_owner` → token fallback).

## Grandfathered legacy codes — do not "fix" them

`CB18-1` (Ashlyn/Copper), `TU26-1/2/3`, `GP25-1` are LIVE attribution keys riding launched
TikTok ads. Renaming a `spk_code` does NOT remove the old label from network reports (the ad
link carries it forever) — and it's worse than useless: the door resolves owners ONLY from
`spark_codes.spk_code`, so a renamed code's clicks come in ownerless (revoke gate skipped, no
`aff<N>`/`s2` stamping, ownerless `clicks` row), leaving attribution to the weaker
`subid_owners` alias leg. Locked affiliates can't rename via the bank anyway — only admin/SQL
could, so don't.
To retire one properly: the affiliate re-adds the creative (fresh SPK auto-mints) → relaunch
the ad → soft-delete the old row only after its traffic drains. That's money-path work: hand
Migi the SQL, never write prod (standing rule).

## Close with the ELI5 recap (Migi's standing rule)

One short plain-English paragraph: what was wired, where the money flows, what to watch.
