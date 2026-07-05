# Plan 26 - History, undo and snapshots (the trust spine)

> **For agentic workers:** implement with `superpowers:subagent-driven-development`.
> Small, live-verified, stacked PRs off `main`.
> Context of record: [11-product-review-2026-07.md](../11-product-review-2026-07.md) finding P0-1; format spec [08](../08-living-documents-format-spec.md); vision [12](../12-north-star-and-future-features.md) §3.1.

**Goal:** Make the product's trust promise real at the surface: working undo in the editor, a truthful History tab with named versions, snapshot-on-meaningful-event, and one-click restore - all derived from data the lock file already records.

**Architecture:** Everything lands in `contrib/livingDocs/` (our-surface, 0 core patches expected).
We do NOT integrate VS Code's `IUndoRedoService`/text-model machinery: document persistence deliberately bypasses it (`saveRawText`, `common/livingDocs.ts:236`), and deep-integrating would couple us to the fork ahead of the Q3 decision.
Instead: (a) ProseMirror's own `prosemirror-history` (already inside the vendored bundle) gives keystroke-level undo inside a version; (b) a snapshot store in the lock gives document-level versions with restore.
This keeps the whole feature portable to a greenfield build.

**Tech stack:** TypeScript (contrib), the vendored PM bundle (`browser/prosemirrorBundle.ts`, rebuild recipe in [../lwd-pm-bundle-build.md](../lwd-pm-bundle-build.md)), lock JSON via `SidecarLockStore` (`browser/livingDocLockStore.ts`).

## Global constraints

- **Real data only** (plan-17 rule): the History tab must never show the fabricated v14/v13 sample rows again.
- **Lock stays rebuildable**: snapshots live in the lock but the `.md` remains the canonical document; deleting the lock loses history but never the document (format-spec invariant).
- **No new sidecar files** without settling D26-A below; hide any new artifact via `files.exclude` like `.lock.json` (decision 57).
- **One approve path**: restore routes through the existing service and writes an audit entry; no bypass writes.
- Tabs not spaces; strings for UI externalised via `vs/nls`; disposables registered (`DisposableStore`); Australian English in copy; no em dashes.
- `npm run typecheck-client` + `npm run valid-layers-check` clean per PR; screenshots to `docs/plans/26-verify/`.

## Current state (exact anchors)

- Audit entries: `IAuditEntry` (`common/livingDocsModel.ts:136`, list at `:444` usage) - action / docTitle / blockId / oldText / newText / via / confidence / time. Appended on every approve/reject/auto-apply (`browser/livingDocsService.ts:1957` area) and on publish (`:1025`).
- Pins: `lock.pins` (`common/livingDocsModel.ts:133,143`) written by `publishDocument` (`browser/livingDocsService.ts:1009-1027`) behind `_beforeExportGate` (`:1000`).
- History tab: `_renderHistory` → `historyHtml` (`browser/reviewRailView.ts:255,697-713`) - caps at 4 real entries, falls back to fabricated samples, hardcoded doc name.
- Editor toolbar shows a mock `Saved · v14` chip (decision 59, honest residual).
- PM bundle API: `window.LWDPM = { mount, toMarkdown, cmd, destroy, setDoc, setDecorations, roundTrip, docJSON }`; `prosemirror-history` is bundled but undo/redo are not exposed as commands, and Cmd+Z inside the webview is at the mercy of the default keymap.

## Decisions to settle in iteration 1

- **D26-A - where snapshots live.** Recommendation: a `snapshots` array in the lock (`{ id, label, at, via, body, auditIndex }`), body stored as the full serialised Markdown, capped at 50 with oldest-eviction, ~1-5 KB each for beachhead docs.
  Alternative (if docs grow large): a `.history/` folder of full `.md` copies.
  Start with in-lock; the store goes behind an `ISnapshotStore` seam (mirroring `ILockStore`) so the backing can change without touching callers.
- **D26-B - what triggers an automatic snapshot.** Recommendation: (1) any refresh/agent run that applies at least one change (one snapshot per run, labelled from the trigger, e.g. "Weekly refresh"); (2) any bulk approve (`approveAll`/`approveAllPending`); (3) publish (already pins sources; now also snapshots the body). Single manual "Save version..." action in the History tab. Plain typing does NOT snapshot (PM undo covers it).

## Iteration plan (each iteration = one stacked PR off `main`)

### Iteration 1 - PM undo/redo (keystroke level)

- Rebuild the PM bundle exposing history: in `lwdpm-entry.js` add `undo`/`redo` from `prosemirror-history` to the command map used by `LWDPM.cmd`, include `history()` in plugins (verify it is already there), and bind Mod-z / Mod-Shift-z / Mod-y in the keymap ahead of baseKeymap.
  Follow [../lwd-pm-bundle-build.md](../lwd-pm-bundle-build.md) exactly; regenerate `prosemirrorBundle.ts`; update `prosemirrorBundle.test.ts` round-trip expectations if the bundle version string changes.
- Critical interaction: `setDoc` (service-driven body reset after approve, `browser/livingDocRender.ts`) must NOT leave the undo stack pointing at pre-approve text, or Cmd+Z would silently revert an approved change without an audit entry.
  On `setDoc`, close the history (recreate state with fresh plugins), so undo is scoped to the current editing session between service writes.
  Write a headless bundle test: mount → type → setDoc → `cmd(view,'undo')` is a no-op.
- Gate: in the live editor, type a sentence, Cmd+Z removes it, Cmd+Shift+Z restores it; approve a proposal, Cmd+Z does not un-approve it; `pmEdit` debounce (300 ms, `livingDocRender.ts`) still persists the undone state.

### Iteration 2 - Snapshot model + store

- Add to `common/livingDocsModel.ts`: `ISnapshotEntry { id: string; label: string; at: string; via: 'refresh' | 'bulk-approve' | 'publish' | 'manual'; body: string; auditIndex: number }` and `snapshots: ISnapshotEntry[]` on `ILivingDocLock` (bump nothing: additive field, absent = empty; keep `LOCK_VERSION` 1).
- Service API on `ILivingDocsService` (`common/livingDocs.ts`): `getSnapshots(resource): readonly ISnapshotEntry[]`, `saveSnapshot(resource, label, via): Promise<void>`, `restoreSnapshot(resource, snapshotId): Promise<void>`.
- `restoreSnapshot` implementation: reject any pending changes for the doc first (`rejectAll`), write the snapshot body through the existing persist path, append an audit entry `action: 'approved', via: 'restore'` recording old/new, then `_recomputeFreshness` (`livingDocsService.ts:645`) so stale bindings re-flag (restored old figures may now be stale - that is correct and visible).
- Wire D26-B triggers: one `saveSnapshot` call each in the refresh/agent-run completion path (`livingDocsService.ts:1145` area), in `approveAll`/`approveAllPending`, and in `publishDocument`.
- Tests (in `test/browser/livingDocsService.test.ts`, follow the existing suite style, prefer one `deepStrictEqual` snapshot assertion): snapshot created on bulk approve with correct label/via; cap-and-evict at 50; restore writes body + audit entry + re-flags stale bindings; restore with pending changes rejects them first.
- Gate: unit tests green; a bulk approve in the live app produces a lock with a `snapshots` entry (inspect the `.lock.json`).

### Iteration 3 - The truthful History tab

- Rewrite `historyHtml` (`reviewRailView.ts:697`): delete the fabricated `sample` array entirely; header derives from the active doc title; timeline renders (newest first) an interleave of snapshots (version rows: label, via icon, relative time, `CURRENT` badge on the live state) and the audit entries since each snapshot (change rows: verb, block, via, time), grouped under their version.
- Empty state: "No versions yet - changes you approve will appear here." (calm, one line).
- Each version row gets a quiet `Restore` action → confirm dialog (native `IDialogService`) stating what will happen ("Replaces the current body. Pending changes will be rejected. This is recorded in the audit trail.") → `restoreSnapshot`.
- Cap display at the 20 most recent rows with a mono "N earlier versions" line (data stays in the lock; no silent truncation of the record itself).
- Gate: with a real run + approvals, History shows true versions and changes only; restore round-trips live and the editor re-renders the restored body; screenshots before/after to `26-verify/`.

### Iteration 4 - Honest version chip + design match

- Replace the toolbar's mock `Saved · v14` with real state: `Saved` after persist, `Saving...` during the debounce window, and `· vN` where N = snapshot count (absent when 0). Source the count via the existing service events (`onDidChange`, `common/livingDocs.ts:144`).
- Design-match the History tab against the comp's History region (`Abstract - UI Redesign.dc.html`) to >= 90%: 10px mono `VERSION HISTORY` header, timeline dots/connectors per `timelineRow` (`reviewRailView.ts:690`), `SNAPSHOT` amber badge style for pinned/published versions.
- Gate: no fabricated string remains (grep the contrib for `v14`, `v13`, `just now`); design-match score logged to `docs/design-audit/redesign-log.md`.

## Acceptance criteria

- [ ] Cmd+Z / Cmd+Shift+Z work for typing in the PM surface; undo never crosses a service write (cannot un-approve). _(iter 1)_
- [ ] Snapshots auto-create on refresh-with-changes, bulk approve, publish; manual "Save version..." exists. _(iter 2)_
- [ ] `restoreSnapshot` round-trips: body replaced, audit entry written, pending rejected, staleness recomputed. _(iter 2)_
- [ ] History tab: real versions + changes only, correct doc name, calm empty state, working Restore with confirm. _(iter 3)_
- [ ] `Saved · vN` chip is real; the v14 mock is gone everywhere. _(iter 4)_
- [ ] ~15 new unit tests across model/service; `typecheck-client` + `valid-layers-check` clean; **0 core patches**; History design-match >= 90%.

## Verify approach

`npm run watch`; `./scripts/code-web.sh ./living-docs-sample` (:8080) + proxy :8090; drive with chrome-devtools MCP.
Exercise: run a project instruction (plan 23 flow) → bulk approve → check History; restore the pre-run version; confirm staleness re-flags; screenshot each state.
Desktop `./scripts/code.sh` once to prove lock writes on real disk.
Log decisions D26-A/D26-B from the current tail of `docs/07-decision-log.md`.
