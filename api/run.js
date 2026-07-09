#!/usr/bin/env node
// run.js — orchestrator + scorecard.
//
// Runs BOTH engines over every fixture and fuses them: the pipeline verdict is
// the more severe of {static, dynamic} (defense in depth — either engine can
// block). Then it compares the pipeline verdict to fixtures/expected.json and
// prints a confusion matrix so you can regression-test your review pipeline.
//
//   node src/run.js                 # static + jsdom dynamic (portable)
//   node src/run.js --playwright    # static + Playwright dynamic (full)
//   node src/run.js --static-only
//
// Exit code is non-zero if any malicious fixture is not BLOCKed or any benign
// fixture is BLOCKed — so this can gate CI.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { scanFile } from "./detector.js";

const RANK = { PASS: 0, FLAG: 1, BLOCK: 2 };
const worse = (a, b) => (RANK[a] >= RANK[b] ? a : b);

function walk(p, out = []) {
  const s = statSync(p);
  if (s.isDirectory()) for (const n of readdirSync(p)) { if (!n.startsWith(".")) walk(join(p, n), out); }
  else if ([".html", ".htm"].includes(extname(p))) out.push(p);
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const usePlaywright = args.includes("--playwright");
  const staticOnly = args.includes("--static-only");
  const root = args.find((a) => !a.startsWith("--")) || "fixtures";

  const expected = JSON.parse(readFileSync(join(root, "expected.json"), "utf8"));
  const files = walk(root);

  let dyn = null;
  if (!staticOnly) {
    dyn = usePlaywright ? await import("./harness.js") : await import("./harness-jsdom.js");
  }

  const rows = [];
  for (const f of files) {
    const rel = relative(root, f).split("\\").join("/");
    const st = scanFile(f);
    const dy = dyn ? await dyn.analyze(usePlaywright ? pathToFileURL(f).href : f) : { verdict: "PASS", signals: [] };
    const pipeline = worse(st.verdict, dy.verdict);
    const exp = expected[rel];
    const expectBlock = exp ? exp.label === "malicious" : null;
    let outcome = "—";
    if (expectBlock !== null) {
      if (expectBlock) outcome = pipeline === "BLOCK" ? "TP" : "FN";       // malicious
      else outcome = pipeline === "BLOCK" ? "FP" : "TN";                    // benign
    }
    rows.push({ rel, label: exp ? exp.label : "?", static: st.verdict, dynamic: dy.verdict, pipeline, outcome,
      sigs: [...new Set([...st.signatures.map((s) => s.id), ...(dy.signals || [])])] });
  }

  const pad = (s, n) => String(s).padEnd(n);
  console.log(`\nEngine: static + ${staticOnly ? "(none)" : usePlaywright ? "playwright" : "jsdom"}\n`);
  console.log(pad("FIXTURE", 42), pad("LABEL", 10), pad("STATIC", 7), pad("DYNAMIC", 8), pad("PIPE", 6), "RESULT");
  console.log("-".repeat(92));
  for (const r of rows) {
    console.log(pad(r.rel, 42), pad(r.label, 10), pad(r.static, 7), pad(r.dynamic, 8), pad(r.pipeline, 6), r.outcome);
  }

  const c = { TP: 0, TN: 0, FP: 0, FN: 0 };
  for (const r of rows) if (c[r.outcome] !== undefined) c[r.outcome]++;
  const total = c.TP + c.TN + c.FP + c.FN;
  console.log("\nConfusion matrix (pipeline vs. labels):");
  console.log(`  True Positives  (malicious blocked): ${c.TP}`);
  console.log(`  True Negatives  (benign passed):     ${c.TN}`);
  console.log(`  False Positives (benign blocked):    ${c.FP}`);
  console.log(`  False Negatives (malicious missed):  ${c.FN}`);
  const prec = c.TP / (c.TP + c.FP || 1), rec = c.TP / (c.TP + c.FN || 1);
  console.log(`  Precision: ${(prec * 100).toFixed(1)}%   Recall: ${(rec * 100).toFixed(1)}%   Accuracy: ${(((c.TP + c.TN) / (total || 1)) * 100).toFixed(1)}%`);

  const failed = c.FP + c.FN;
  console.log(failed === 0 ? "\n✅ PASS — all fixtures classified correctly." : `\n❌ FAIL — ${failed} misclassified.`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
