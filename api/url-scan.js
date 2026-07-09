#!/usr/bin/env node
// url-scan.js — URL-LAYER doorway / cloaking-redirector detector.
//
// Scans a LINK STRING for the structural tells of a doorway. It NEVER fetches
// or navigates to the URL — it only parses the string you give it. Use it as a
// pre-filter on ad destination URLs before (or instead of) fetching the page.
//
// It catches the "?dest=<real url with forwarded click-ID macros>" doorway
// pattern even when you don't have the landing-page HTML yet.
//
// Usage:
//   node src/url-scan.js "<url>"                 # scan one URL
//   node src/url-scan.js --file urls.txt         # one URL per line
//   node src/url-scan.js --json "<url>"          # machine-readable
//
// Verdicts: score >= 50 => BLOCK, >= 25 => FLAG, else PASS.

export const BLOCK_THRESHOLD = 50;
export const WARN_THRESHOLD = 25;

// Param names commonly used to carry the *real* destination on a doorway.
const REDIRECT_KEYS = ["dest", "url", "target", "redirect", "goto", "go", "r", "u",
  "to", "out", "click", "clickurl", "link", "u1", "landing", "lp"];

// Ad attribution / click-ID params. Lots of these on one link = tracking doorway.
const CLICKID_KEYS = ["ttclid", "gclid", "fbclid", "twclid", "msclkid", "dclid",
  "clickid", "click_id", "campaign_id", "campaign_name", "adset_id", "adset_name",
  "ad_id", "ad_name", "placement", "cid", "aid", "sub_id", "s1", "s2"];

// Unresolved macros / placeholders: {{__CLICK_ID__}}, __CAMPAIGN_ID__, encoded {{ }}.
const MACRO_RE = /(\{\{[\s\S]*?\}\}|__[A-Z0-9]+__|%7B%7B|%257B%257B|%7B%7B)/;

// In-app ad context markers.
const INAPP_RE = /(placement=(tiktok|instagram|facebook|fb|ig|snap|snapchat)\b|iab_source=|iab_click_time=|landpageshowtype=|musical_ly|bytedance)/i;

function tryDecode(s) { try { return decodeURIComponent(s); } catch (e) { return s; } }
// Peel nested URL-encoding (a URL/template encoded inside a param) up to 4 layers.
function deepDecode(s) {
  let cur = s, prev, i = 0;
  do { prev = cur; cur = tryDecode(cur); i++; } while (cur !== prev && i < 4);
  return cur;
}
function registrable(host) { // crude: last two labels (good enough to compare org)
  const p = String(host).split("."); return p.slice(-2).join(".");
}

export function scanUrl(raw) {
  const hits = [];
  let score = 0;
  const add = (id, weight, desc, detail) => { hits.push({ id, weight, desc, detail }); score += weight; };

  let u;
  try { u = new URL(raw); } catch (e) { return { score: 0, verdict: "PASS", signals: [], note: "not a parseable URL" }; }

  const landingHost = u.hostname;
  const params = u.searchParams;
  const whole = deepDecode(raw);

  // 1) A redirect param whose value is itself an http(s) URL — the doorway tell.
  let destUrl = null, destKey = null;
  for (const k of params.keys()) {
    if (REDIRECT_KEYS.includes(k.toLowerCase())) {
      const v = deepDecode(params.get(k) || "");
      if (/^https?:\/\//i.test(v)) { destUrl = v; destKey = k; break; }
    }
  }

  if (destUrl) {
    add("URL_REDIRECT_PARAM", 45,
      "A redirect param carries a full destination URL — the real landing page is injected via the link, not hosted at the ad URL.",
      `${destKey}=${destUrl.slice(0, 90)}${destUrl.length > 90 ? "…" : ""}`);

    // 2) destination host differs from the landing host (off-site / tracking host).
    let destHost = "";
    try { destHost = new URL(destUrl).hostname; } catch (e) {}
    if (destHost && destHost !== landingHost) {
      const sameOrg = registrable(destHost) === registrable(landingHost);
      add("URL_CROSS_HOST_REDIRECT", 40,
        "The injected destination points to a different host than the ad's landing domain.",
        `${landingHost} -> ${destHost}${sameOrg ? " (same registrable domain / tracking subdomain)" : " (different domain)"}`);
    }

    // 3) forwarded tracking macros in the destination = attribution laundering.
    if (MACRO_RE.test(destUrl)) {
      add("URL_PARAM_FORWARD_MACROS", 35,
        "The destination carries unresolved tracking macros ({{__CLICK_ID__}}, __CAMPAIGN_ID__) — click-IDs are laundered onto an external URL (template doorway).");
    }
  }

  // 3b) macros anywhere on the link (even without a redirect param).
  if (!hits.some((h) => h.id === "URL_PARAM_FORWARD_MACROS") && MACRO_RE.test(whole)) {
    add("URL_PARAM_FORWARD_MACROS", 35,
      "Unresolved tracking macros/placeholders present in the link — template/redirector doorway.");
  }

  // 4) click-ID fan-out: many attribution params on one link.
  const present = [...params.keys()].map((k) => k.toLowerCase()).filter((k) => CLICKID_KEYS.includes(k));
  if (present.length >= 4) {
    add("URL_CLICKID_FANOUT", 20, "Many ad click-ID / attribution params on the link.", present.join(", "));
  }

  // 5) in-app ad context markers.
  if (INAPP_RE.test(whole)) {
    add("URL_INAPP_CONTEXT", 10, "In-app ad placement markers (TikTok/IG/FB / IAB fields) — the environment cloakers target.");
  }

  // 6) nested URL-encoding: a URL/template encoded inside a parameter.
  if (/%25[0-9a-f]{2}/i.test(raw)) {
    add("URL_NESTED_ENCODING", 15, "Double-encoded sequences (%25xx) — a URL or template nested inside a parameter (doorway structure).");
  }

  const verdict = score >= BLOCK_THRESHOLD ? "BLOCK" : score >= WARN_THRESHOLD ? "FLAG" : "PASS";
  return { score, verdict, landingHost, dest: destUrl, signals: hits };
}

async function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const fileFlag = args.indexOf("--file");
  let urls = [];
  if (fileFlag !== -1) {
    const { readFileSync } = await import("node:fs");
    urls = readFileSync(args[fileFlag + 1], "utf8").split(/\r?\n/).map((s) => s.trim()).filter(Boolean).filter((s) => !s.startsWith("#"));
  } else {
    urls = args.filter((a) => !a.startsWith("--"));
  }
  if (!urls.length) { console.error('usage: node src/url-scan.js [--json] "<url>"  |  --file urls.txt'); process.exit(2); }

  const results = urls.map((raw) => ({ url: raw, ...scanUrl(raw) }));
  if (asJson) { console.log(JSON.stringify(results, null, 2)); return; }

  const color = { BLOCK: "\x1b[41m\x1b[97m", FLAG: "\x1b[43m\x1b[30m", PASS: "\x1b[42m\x1b[30m", r: "\x1b[0m" };
  for (const r of results) {
    console.log(`\n${color[r.verdict]} ${r.verdict} ${color.r}  score=${r.score}  ${r.landingHost || ""}`);
    if (r.dest) console.log(`    dest -> ${r.dest.slice(0, 100)}${r.dest.length > 100 ? "…" : ""}`);
    for (const s of (r.signals || [])) {
      console.log(`    [+${s.weight}] ${s.id} — ${s.desc}`);
      if (s.detail) console.log(`             ${s.detail}`);
    }
  }
  const blocked = results.filter((r) => r.verdict === "BLOCK").length;
  const flagged = results.filter((r) => r.verdict === "FLAG").length;
  console.log(`\n${results.length} URL(s): ${blocked} BLOCK, ${flagged} FLAG, ${results.length - blocked - flagged} PASS`);
}

import { pathToFileURL } from "node:url";
if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
