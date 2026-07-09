#!/usr/bin/env node
// harness-jsdom.js — dynamic runtime detector, ZERO system dependencies.
//
// Runs each page's JS inside jsdom with a spoofed in-app-WebView UA and
// watches what it does. jsdom hard-locks window.location, but it raises a
// jsdomError ("navigation to another Document") on every navigation attempt —
// that is our navigation signal. We also capture location.assign/replace,
// window.open and sendBeacon directly.
//
// Two phases per load:
//   A) NO gesture — wait for any auto-fire (setTimeout/onload) redirect.
//   B) synthetic click on the CTA — see if it navigates.
// Each page is loaded twice: WITH ?dest= (real-traffic view) and WITHOUT it
// (reviewer view). Comparing the two exposes DIFFERENTIAL RENDERING.
//
// Signals it can raise: AUTO_FIRE (nav with no gesture), DIFFERENTIAL_RENDER
// (navigates with dest, inert without), REDIRECT_BEACON. Plain navigate-on-
// click is NOT a signal (every page does that) so benign pages stay clean.
//
// Fidelity note: jsdom cannot resolve OS URL schemes (intent://,
// x-safari-https://) or real cross-origin iframes, so SCHEME_BREAKOUT and
// TOP_FRAME_BREAKOUT are the domain of the Playwright engine (harness.js) and
// the static detector. This engine exists for fast, portable CI verification.

import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { pathToFileURL } from "node:url";

export const INAPP_UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/119.0.0.0 Mobile Safari/537.36 BytedanceWebview/d8a21c6 musical_ly_2023";

const SCHEME_RE = /^(intent:\/\/|x-safari-https:\/\/|googlechromes?:\/\/|firefox:\/\/|microsoft-edge)/i;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Run one page once. Returns nav counts split by phase, plus beacon/urls.
export async function runFixture(file, { withDest = true } = {}) {
  const html = readFileSync(file, "utf8");
  const base = pathToFileURL(file).href;
  const url = withDest
    ? `${base}?dest=${encodeURIComponent("https://example.com/offer")}&ttclid=TEST123`
    : base;

  const nav = [];       // { phase, url } — url may be "" when only jsdomError is available
  let beacon = false;

  const vc = new VirtualConsole();
  let phase = "load"; // "load" (no gesture) -> "click"
  vc.on("jsdomError", (e) => {
    if (/navigation to another Document|Not implemented: navigation/i.test(e.message)) {
      nav.push({ phase, url: "" });
    }
  });

  const dom = new JSDOM(html, {
    url,
    runScripts: "dangerously",
    pretendToBeVisual: true,
    virtualConsole: vc,
    userAgent: INAPP_UA,
    beforeParse(w) {
      w.navigator.sendBeacon = (u) => { beacon = true; nav.push({ phase, url: String(u), beacon: true }); return true; };
      try {
        const P = w.HTMLImageElement.prototype, d = Object.getOwnPropertyDescriptor(P, "src");
        Object.defineProperty(P, "src", { configurable: true, get() { return d && d.get ? d.get.call(this) : ""; }, set(v) { beacon = true; } });
      } catch (e) {}
      // assign/replace/open are overridable and give us the target URL.
      try { w.location.assign = (v) => nav.push({ phase, url: String(v) }); } catch (e) {}
      try { w.location.replace = (v) => nav.push({ phase, url: String(v) }); } catch (e) {}
      w.open = (u) => { nav.push({ phase, url: String(u) }); return null; };
    }
  });

  const w = dom.window;

  // Phase A: no gesture. Let auto-fire (setTimeout ~150ms / onload) run.
  await sleep(300);
  const navNoGesture = nav.filter((n) => n.phase === "load" && !n.beacon).length;

  // Phase B: synthetic click on the CTA.
  phase = "click";
  try {
    const btn = w.document.getElementById("ctaButton") || w.document.querySelector("a,button");
    if (btn) btn.click();
  } catch (e) {}
  await sleep(120);

  dom.window.close();

  const navTotal = nav.filter((n) => !n.beacon).length;
  const schemeSeen = nav.some((n) => SCHEME_RE.test(n.url));
  return { navNoGesture, navTotal, beacon, schemeSeen, urls: nav.map((n) => n.url).filter(Boolean) };
}

export async function analyze(file) {
  const active = await runFixture(file, { withDest: true });    // real-traffic view
  const reviewer = await runFixture(file, { withDest: false });  // reviewer view

  const signals = [];
  if (active.navNoGesture > 0) signals.push("AUTO_FIRE");
  if (active.schemeSeen) signals.push("SCHEME_BREAKOUT");            // rarely visible in jsdom
  if (active.navTotal > 0 && reviewer.navTotal === 0) signals.push("DIFFERENTIAL_RENDER");
  if (active.beacon && active.navNoGesture > 0) signals.push("REDIRECT_BEACON");

  const strong = ["AUTO_FIRE", "SCHEME_BREAKOUT", "DIFFERENTIAL_RENDER"];
  const verdict = signals.some((s) => strong.includes(s)) ? "BLOCK" : signals.length ? "FLAG" : "PASS";
  return { verdict, signals, active, reviewer };
}

async function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const targets = args.filter((a) => a !== "--json");
  function walk(p, out = []) {
    const s = statSync(p);
    if (s.isDirectory()) for (const n of readdirSync(p)) { if (!n.startsWith(".")) walk(join(p, n), out); }
    else if ([".html", ".htm"].includes(extname(p))) out.push(p);
    return out;
  }
  const files = (targets.length ? targets : ["fixtures"]).flatMap((t) => walk(t));
  const out = [];
  for (const f of files) {
    const r = await analyze(f);
    out.push({ path: f, ...r });
    if (!asJson) console.log(`${r.verdict.padEnd(6)} ${f}  [${r.signals.join(", ") || "none"}]`);
  }
  if (asJson) console.log(JSON.stringify(out, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
