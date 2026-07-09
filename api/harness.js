#!/usr/bin/env node
// harness.js — dynamic runtime detector.
//
// Loads each fixture in headless Chromium while SPOOFING an in-app WebView
// user-agent (e.g. TikTok/Instagram), then watches what the page tries to do
// WITHOUT any user interaction:
//   - auto-navigation to an external/OS-scheme URL (AUTO_FIRE / breakout)
//   - custom-scheme attempts: intent:// , x-safari-https:// , googlechrome://
//   - top-frame navigation from inside an iframe (TOP_FRAME_BREAKOUT)
//   - a tracking beacon fired at redirect time (REDIRECT_BEACON)
// Then it re-loads WITHOUT the ?dest= param to detect DIFFERENTIAL RENDERING
// (page is inert for a reviewer, live for real traffic).
//
// Navigation sinks are instrumented via an init script that runs before page
// code, so custom-scheme rewrites are captured even though Chromium can't
// actually follow them. Nothing is allowed to truly navigate.
//
// Requires: npm i && npx playwright install chromium

import { chromium } from "playwright";
import { pathToFileURL } from "node:url";

// A representative in-app WebView UA (TikTok Android). The point is to look
// like the environment cloakers target, not a normal desktop browser.
export const INAPP_UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/119.0.0.0 Mobile Safari/537.36 BytedanceWebview/d8a21c6 musical_ly_2023";

const INIT_SCRIPT = `
(() => {
  const log = [];
  window.__cloak = { log };
  const rec = (type, url, extra) => log.push(Object.assign({ type, url: String(url), t: Date.now() }, extra || {}));

  // Instrument beacons / pixels
  try {
    const _sb = navigator.sendBeacon && navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = (u, d) => { rec('beacon', u); return _sb ? true : true; };
  } catch (e) {}
  try {
    const ImgProto = HTMLImageElement.prototype;
    const d = Object.getOwnPropertyDescriptor(ImgProto, 'src');
    Object.defineProperty(ImgProto, 'src', {
      configurable: true, enumerable: d.enumerable,
      get() { return d.get.call(this); },
      set(v) { rec('image-pixel', v); /* swallow */ }
    });
  } catch (e) {}

  // Instrument window.open
  try { const _o = window.open; window.open = (u) => { rec('window.open', u); return null; }; } catch (e) {}

  // Instrument the Location sinks WITHOUT navigating. We can't redefine
  // window.location, but we can trap Location.prototype accessors + methods.
  function trapLocation(loc, frame) {
    try {
      const proto = Object.getPrototypeOf(loc);
      const hrefDesc = Object.getOwnPropertyDescriptor(proto, 'href');
      if (hrefDesc && hrefDesc.configurable) {
        Object.defineProperty(proto, 'href', {
          configurable: true,
          get() { return hrefDesc.get.call(this); },
          set(v) { rec('location.href', v, { frame }); /* swallow */ }
        });
      }
      for (const m of ['assign', 'replace']) {
        const orig = proto[m];
        if (typeof orig === 'function') {
          Object.defineProperty(proto, m, {
            configurable: true, writable: true,
            value: function (v) { rec('location.' + m, v, { frame }); }
          });
        }
      }
    } catch (e) {}
  }
  trapLocation(window.location, 'self');
  // Trap top-frame navigation attempts (window.top / parent).
  try {
    const t = window.top;
    if (t && t !== window && t.location) trapLocation(t.location, 'top');
  } catch (e) { rec('cross-origin-top-access', ''); }
})();
`;

// URL schemes / hosts that indicate a breakout attempt.
const SCHEME_RE = /^(intent:\/\/|x-safari-https:\/\/|googlechromes?:\/\/|firefox:\/\/|microsoft-edge)/i;

export async function runFixture(browser, fileUrl, { withDest = true } = {}) {
  const context = await browser.newContext({ userAgent: INAPP_UA, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();

  // Extra safety net: capture custom-scheme navigations Chromium rejects.
  const failedNavs = [];
  page.on("requestfailed", (r) => {
    const u = r.url();
    if (SCHEME_RE.test(u)) failedNavs.push(u);
  });
  page.on("framenavigated", (f) => {
    const u = f.url();
    if (u && !u.startsWith("file://") && u !== "about:blank") failedNavs.push(u);
  });

  await context.addInitScript(INIT_SCRIPT);

  const url = withDest ? `${fileUrl}?dest=${encodeURIComponent("https://example.com/offer")}&ttclid=TEST123` : fileUrl;

  const findings = { autoNavigated: false, schemeBreakout: false, topFrameBreakout: false, beacon: false, events: [] };
  try {
    await page.goto(url, { waitUntil: "load", timeout: 8000 });
  } catch (e) { /* custom-scheme goto can throw; that's itself a signal */ }

  // Wait WITHOUT interacting. Anything that happens here is gesture-less.
  await page.waitForTimeout(600);

  let log = [];
  try { log = await page.evaluate(() => (window.__cloak ? window.__cloak.log : [])); } catch (e) {}
  for (const u of failedNavs) log.push({ type: "nav", url: u, frame: "self" });

  for (const ev of log) {
    findings.events.push(ev);
    if (ev.type === "beacon" || ev.type === "image-pixel") findings.beacon = true;
    if (/^location\.|^nav$|window\.open/.test(ev.type)) {
      findings.autoNavigated = true;
      if (SCHEME_RE.test(ev.url)) findings.schemeBreakout = true;
      if (ev.frame === "top") findings.topFrameBreakout = true;
    }
  }

  await context.close();
  return findings;
}

export async function analyze(fileUrl) {
  const browser = await chromium.launch({ headless: true });
  try {
    const active = await runFixture(browser, fileUrl, { withDest: true });   // real-traffic view
    const reviewer = await runFixture(browser, fileUrl, { withDest: false }); // reviewer view (no dest)

    // Differential rendering: live behavior with dest, inert without it.
    const differential = active.autoNavigated && !reviewer.autoNavigated;

    const verdictSignals = [];
    if (active.schemeBreakout) verdictSignals.push("SCHEME_BREAKOUT");
    if (active.topFrameBreakout) verdictSignals.push("TOP_FRAME_BREAKOUT");
    if (active.autoNavigated) verdictSignals.push("AUTO_NAVIGATE_NO_GESTURE");
    if (differential) verdictSignals.push("DIFFERENTIAL_RENDER");
    if (active.beacon && active.autoNavigated) verdictSignals.push("REDIRECT_BEACON");

    const verdict = verdictSignals.some((s) =>
      ["SCHEME_BREAKOUT", "TOP_FRAME_BREAKOUT", "DIFFERENTIAL_RENDER"].includes(s))
      ? "BLOCK"
      : verdictSignals.length ? "FLAG" : "PASS";

    return { verdict, signals: verdictSignals, active, reviewer, differential };
  } finally {
    await browser.close();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const targets = args.filter((a) => a !== "--json");
  const { readdirSync, statSync } = await import("node:fs");
  const { join, extname } = await import("node:path");

  function walk(p, out = []) {
    const s = statSync(p);
    if (s.isDirectory()) for (const n of readdirSync(p)) { if (!n.startsWith(".")) walk(join(p, n), out); }
    else if ([".html", ".htm"].includes(extname(p))) out.push(p);
    return out;
  }
  const files = (targets.length ? targets : ["fixtures"]).flatMap((t) => walk(t));
  const out = [];
  for (const f of files) {
    const r = await analyze(pathToFileURL(f).href);
    out.push({ path: f, ...r });
    if (!asJson) console.log(`${r.verdict.padEnd(6)} ${f}  [${r.signals.join(", ") || "none"}]`);
  }
  if (asJson) console.log(JSON.stringify(out, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
