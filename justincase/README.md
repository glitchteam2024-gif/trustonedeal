# justincase — archived in-app-breakout prelanders

Parked here on 2026-07-21 when the prelander step was removed from the funnel.
Nothing in this folder is wired into anything. No ad, lander, or door points at it.

## What these are

The in-app-breakout prelander (shipped `8317464`, tweaked through `7bb2a42`). It sat between the
ad and the lander, broke TikTok/Meta in-app webview traffic out into real Safari/Chrome
(iOS `x-safari-https://`, Android `intent://`), carried every incoming param
(`s1`/`s2`/`s3`/`s4`/`ttclid`) through to `DEST`, used an `inapp_ok` loop guard, and cloaked
obvious bots / ad review to `/Rewards/`.

One copy per brand — they differ only in colors and `DEST`:

| folder            | brand    | DEST (the lander it fed)     |
|-------------------|----------|------------------------------|
| `FC-prelander/`   | Freecash | `/FCTT` (same page as `/FC`) |
| `TU-prelander/`   | Testerup | `/TU`                        |
| `CB-prelander/`   | Copper   | `/CB`                        |

## Current funnel (no prelander)

    ad (?s1=<SPK>&s2&s3&s4&ttclid) -> lander -> sprktrax.org door -> offer

Every folder in `50FC/FC1-50`, `50TU/TU1-50`, `CR50/CR1-50` is a byte-identical copy of that
offer's canonical lander (`/FC`, `/TU`, `/CB`), each forwarding the full query string to its door.

## Putting the prelander back

Run from the repo root. Restores all 50 folders for one brand:

    for i in $(seq 1 50); do cp justincase/FC-prelander/index.html 50FC/FC$i/index.html; done
    for i in $(seq 1 50); do cp justincase/TU-prelander/index.html 50TU/TU$i/index.html; done
    for i in $(seq 1 50); do cp justincase/CB-prelander/index.html CR50/CR$i/index.html; done

To go back to landers again, the same loop with `FC/index.html`, `TU/index.html`, `CB/index.html`
as the source.

Check `DEST` near the top of the prelander's script before restoring — it hardcodes the lander
path, so it needs updating if a canonical lander ever moves.
