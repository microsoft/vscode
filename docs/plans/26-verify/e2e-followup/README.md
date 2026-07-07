# Snapshot E2E follow-up - closing the PR #89 validation gap

PR #89 (plan 26 iters 1-2: PM undo/redo + snapshot model/store) merged without the full-workbench E2E of the snapshot flow being driven live.
This folder is that evidence, produced against `origin/main` (`4fa3430`).

## Outcome

No product bugs were found.
The snapshot flow works end to end.
The three acceptance points from the PR gap are each covered by a genuine artefact below:

- (a) trigger an autosnapshot in the running app - proven live in the full web workbench (refresh-with-changes).
- (b) inspect the `.lock.json` sidecar on disk and confirm `snapshots[]` appear, capped at 50 - proven on the real filesystem via the production `SidecarLockStore`.
- (c) restore through the one approve path (rejectAll -> persist -> audit `approved`/`restore` -> freshness recompute) - proven by the headless service suite and reflected on disk.

## Why the flow is split across three surfaces

The live web workbench (`@vscode/test-web`) serves the mounted folder read-only over HTTP: reads are live from disk (the CSV edit was picked up), but the workbench's write-back of the `.md`/`.lock.json` does not reach `/tmp` (`_persist` swallows the failed write).
So the web run proves the trigger and the live re-derivation, and the on-disk landing is proven separately through the real production lock store writing to the real filesystem.
The desktop Electron build boots on the real-disk folder (screenshot 04); its snapshot webview is sandboxed from the test driver, so it is used as the real-disk boot proof rather than for clicking refresh.
The restore surface itself (History-tab Restore action) is plan 26 iter 3, not yet on main, so restore is exercised through the service, not a UI click.

## Artefacts

- `01-web-home.png` - Abstract Home, full web workbench on the writable `/tmp/lwd-sample` copy.
- `02-web-weekly-before-refresh.png` - Weekly Operating Summary open, bound to `metrics.csv`, showing week-24 figures ($48.6k MRR, 427 signups) before refresh.
- `03-web-weekly-after-refresh.png` - after clicking the status pill ("Refresh from sources"): figures re-derived live ($52.0k MRR, 468 signups, +26%/+50%), header reads "2 documents synced". This is the refresh-with-changes autosnapshot trigger firing in the running app (`metrics.csv` was edited on disk first).
- `04-desktop-boots-on-real-disk.png` - the desktop Electron workbench (`./scripts/code.sh` equivalent) rendering Abstract Home on the real-disk `/tmp/lwd-sample` folder.
- `05-ondisk-weekly-summary.lock.json` - a real `Weekly Summary.lock.json` written by the production `SidecarLockStore` to the real filesystem: `snapshots[]` with the three auto-trigger vias (`refresh`, `bulk-approve`, `publish`) and the restore audit entry (`action: "approved"`, `via: "restore"`). `version` stays `1` (additive field).
- `07-ondisk-store-proof.txt` - the console log of that store run: representative lock on disk, and the cap proof (pushed 58, on disk = 50, oldest evicted, newest kept).
- `08-unit-tests-snapshot.txt` - the headless-Chromium service suite (93 passing), including the five snapshot tests: snapshot on refresh + on bulk approve, cap at 50 with oldest-eviction, restore writes body + audits `via: restore` + re-flags stale bindings, and restore rejects pending changes first.

## Checks run (all clean)

- `npm run typecheck-client`
- `npm run valid-layers-check`
- `./scripts/check-seams.sh`
- headless service suite: 93 passing (`test/unit/browser`)

## Core patches

None. The work is our-surface only (`contrib/livingDocs/`); no core files were touched, so the merge-tax ledger (`docs/plans/03-merge-tax-ledger.md`) is unchanged.
