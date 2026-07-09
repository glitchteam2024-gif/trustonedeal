# Signature Demo Fixtures — one tell per file

Five neutralized dummy pages, each engineered to trip **exactly one** detector signature,
so you can watch the cloak detector name each technique in isolation. Every page redirects
to `example.com` only; there is no real tracking. These detect nothing on their own — they
are *targets* you point the detector at.

## What each file is

| File | Signature it triggers | What the page does | Static verdict |
|---|---|---|---|
| `01-dest-injection.html` | `DEST_INJECTION` | reads its destination from `?dest=` at runtime instead of hard-coding it | **FLAG** (45) |
| `02-param-gated-noop.html` | `PARAM_GATED_NOOP` | button is a dead no-op unless a secret param is present (reviewer sees a dead page) | **BLOCK** (55) |
| `03-scheme-breakout.html` | `SCHEME_BREAKOUT` | on tap, rewrites the URL to `intent://` / `x-safari-https://` to escape the in-app WebView | **BLOCK** (60) |
| `04-top-frame-breakout.html` | `TOP_FRAME_BREAKOUT` | on tap, drives `window.top` location to escape a monitored iframe | **BLOCK** (55) |
| `05-gesture-retry.html` | `GESTURE_RETRY` | retries the redirect on first `pointerdown/touchstart/click` (no auto-fire) | **FLAG** (35) |

## Run it (copy-paste)

From the project root (`cloak-testbench/`):

```bash
# Static scan of all five, pretty output (names the signature + weight per file)
node src/detector.js signature-demos

# One file at a time
node src/detector.js signature-demos/03-scheme-breakout.html

# Machine-readable
node src/detector.js --json signature-demos

# Behavioural engines (run the page under a spoofed in-app-WebView UA)
node src/harness-jsdom.js signature-demos     # portable, no browser
node src/harness.js signature-demos           # full fidelity (needs: npx playwright install chromium)
```

## Verified output (what you should see)

```
 FLAG   score=45  signature-demos/01-dest-injection.html
    [+45] DEST_INJECTION — destination read from a query param at runtime
 BLOCK  score=55  signature-demos/02-param-gated-noop.html
    [+55] PARAM_GATED_NOOP — CTA is a no-op when the expected param is absent
 BLOCK  score=60  signature-demos/03-scheme-breakout.html
    [+60] SCHEME_BREAKOUT — rewrites to an OS URL scheme to escape the in-app browser
 BLOCK  score=55  signature-demos/04-top-frame-breakout.html
    [+55] TOP_FRAME_BREAKOUT — forces navigation on the top window
 FLAG   score=35  signature-demos/05-gesture-retry.html
    [+35] GESTURE_RETRY — re-attempts the redirect on first pointer/touch/click

5 file(s): 3 BLOCK, 2 FLAG, 0 PASS
```

## Why two of them say FLAG, not BLOCK (this is correct, not a miss)

The detector has **two tiers**: `score ≥ 50 → BLOCK` (auto-block), `score ≥ 25 → FLAG`
(send to manual review). The author weighted the signals so that a *single* weak tell is
"suspicious, review it" rather than "block outright":

- `DEST_INJECTION` (45) and `GESTURE_RETRY` (35) are **FLAG** on their own — plenty of
  legitimate pages read a param or retry on tap, so blocking on one alone would false-positive.
- They become a **BLOCK** in combination, which is how real cloakers actually look. A real
  doorway reads `?dest=` **and** gates the button **and** breaks out — e.g. dest-injection
  (45) + param-gated-noop (55) = 100, a confident block. See `../fixtures/malicious/05-full-combo.html`.

So **FLAG still means "caught."** In live triage it's your manual-review queue; BLOCK is the
auto-reject pile.

## Using this on real / live ads ("catching it in real time")

The detector reads page **source**, so to check a live ad you feed it the landing page's HTML:

1. Capture the landing page (view-source / "Save page as", or your crawler's stored HTML).
2. Run `node src/detector.js path/to/captured.html`.
3. For the behavioural tells (auto-fire, differential render, breakout-on-tap), run it through
   `harness-jsdom.js` / `harness.js`, which load the page under a spoofed in-app-WebView UA.

The bench does **not** fetch live URLs itself — wiring it to your ad crawler (grab the HTML,
pipe it to `scanSource()`) is the one integration piece you'd add to make it real-time.

## One honest limit

These files prove the detector catches the **plain, un-obfuscated** form of each technique —
the easy half. A cloaker that assembles the scheme string at runtime, renames functions, or
gates the breakout behind a real tap can slip the static engine. Those evasions are
demonstrated in `../adversarial/` and analysed in `../GAP-ANALYSIS.md`. Treat a clean pass
here as "the detector recognizes the textbook forms," not "nothing gets past it."

---
*Sibling note: the `../demo/` folder contains four fixtures that were already present and were
not created in this pass; they were left untouched. This `signature-demos/` folder is the
clean, verified set.*
