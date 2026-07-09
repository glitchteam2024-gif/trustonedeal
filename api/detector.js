#!/usr/bin/env node
// detector.js — static signature scanner for cloaking + WebView breakout.
// Usage:
//   node src/detector.js <file-or-dir> [...]      pretty output
//   node src/detector.js --json <file-or-dir>     machine-readable
//
// Scans .html/.htm/.js files. Strips HTML comments before matching so that
// the "SYNTHETIC TEST SAMPLE" banners in the fixtures don't skew results.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname, relative } from "node:path";
import { SIGNATURES, BENIGN_HINTS, BLOCK_THRESHOLD, WARN_THRESHOLD } from "./signatures.js";

const SCANNABLE = new Set([".html", ".htm", ".js"]);

function walk(p, out = []) {
  const s = statSync(p);
  if (s.isDirectory()) {
    for (const name of readdirSync(p)) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      walk(join(p, name), out);
    }
  } else if (SCANNABLE.has(extname(p).toLowerCase())) {
    out.push(p);
  }
  return out;
}

// Remove HTML comments and JS block comments so banner/notes don't match.
// NOTE: JS line-comment (//) stripping is deliberately NOT done — a regex
// cannot tell a real comment from the `//` inside a regex literal or URL,
// and corrupting code causes missed detections (false negatives), which is
// far worse here than a rare comment-based false positive.
function stripComments(src) {
  return src
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ");
}

export function scanSource(src) {
  const code = stripComments(src);
  const hits = [];
  let score = 0;
  for (const sig of SIGNATURES) {
    const m = sig.any.find((re) => re.test(code));
    if (m) {
      if (sig.not && sig.not.some((re) => re.test(code))) continue;
      hits.push({ id: sig.id, weight: sig.weight, desc: sig.desc });
      score += sig.weight;
    }
  }
  const benign = BENIGN_HINTS.filter((h) => h.re.test(code)).map((h) => h.id);
  const verdict = score >= BLOCK_THRESHOLD ? "BLOCK" : score >= WARN_THRESHOLD ? "FLAG" : "PASS";
  return { score, verdict, signatures: hits, benign };
}

export function scanFile(path) {
  const src = readFileSync(path, "utf8");
  return { path, ...scanSource(src) };
}

function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const targets = args.filter((a) => a !== "--json");
  if (targets.length === 0) {
    console.error("usage: node src/detector.js [--json] <file-or-dir> ...");
    process.exit(2);
  }
  const files = targets.flatMap((t) => walk(t));
  const results = files.map(scanFile);

  if (asJson) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  const color = { BLOCK: "\x1b[41m\x1b[97m", FLAG: "\x1b[43m\x1b[30m", PASS: "\x1b[42m\x1b[30m", r: "\x1b[0m" };
  for (const r of results) {
    const tag = `${color[r.verdict]} ${r.verdict} ${color.r}`;
    console.log(`\n${tag}  score=${r.score}  ${relative(process.cwd(), r.path)}`);
    for (const s of r.signatures) console.log(`    [+${s.weight}] ${s.id} — ${s.desc}`);
    if (r.benign.length) console.log(`    (benign hints: ${r.benign.join(", ")})`);
  }
  const blocked = results.filter((r) => r.verdict === "BLOCK").length;
  const flagged = results.filter((r) => r.verdict === "FLAG").length;
  console.log(`\n${files.length} file(s): ${blocked} BLOCK, ${flagged} FLAG, ${files.length - blocked - flagged} PASS`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
