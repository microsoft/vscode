# 11 - Product review (July 2026): everything since the fork, and where to take it

This document is a full review of the fork as of `main` at PR #85 (rails as editor companions).
It sweeps all 85 merged PRs, the ~50 branches, the decision log, the verify logs, and the feature code, and turns what it finds into a ranked set of improvement opportunities.
Each opportunity points at a detailed implementation plan in [plans/](plans/) (plans 26-33), written to be executed by a senior engineer with no prior context.
The companion vision document is [12-north-star-and-future-features.md](12-north-star-and-future-features.md).

## 1. What this repo is now

Abstract (formerly Opportunity OS / Living Documents) is an AI-native word processor built as a VS Code fork.
The product thesis: documents stay bound to live data sources, an agent keeps them current, and every change lands through an auditable red/green diff a human approves.
The defensible wedge is provenance + diff + approval, not faster generation (see [00-overview.md](00-overview.md)).

Since the fork, 85 PRs have landed in a disciplined loop cadence (plans 01-25).
The headline numbers:

- **~13,300 LOC of feature code**, all inside one contribution directory (`src/vs/workbench/contrib/livingDocs/`), plus a vendored 496 KB ProseMirror bundle.
- **~6 core patches total** against upstream VS Code, all one-line/one-flag and fail-soft (builtin denylist, activity-bar width 48→76, palette/quick-open keybinding removal, sash lock, activation-toast guard), plus the standard one-line contribution import.
  The full ledger with per-seam fragility notes is [plans/03-merge-tax-ledger.md](plans/03-merge-tax-ledger.md).
- **~203 unit tests** (~2,700 LOC) covering the pure layers (format parse/serialise, service logic, orchestrator, decorations); zero unit coverage on the webview layers.
- **The core loop is real and verified end-to-end**: source change → re-derive → figure auto-applies / meaning change waits → review (rail or in-editor) → approve → audit entry → provenance dot → source-peek back to the exact CSV row.
  19 end-to-end flows are live-verified (F1-F16, F18, F19, F23 in the verify logs); templates, MCP resolution, present mode, and history are not.
- **The redesign (plans 20-25) landed at 90-96% design-match** on every scored surface: provenance gutter 94%, labeled nav 96%, reading ramp 95%, Home 90%, fan-out 92%, cross-doc review 91%.

What exists as user-visible surfaces today, and their honest state:

| Surface | State |
|---|---|
| Home (greeting, NEEDS YOU, ALL PROJECTS) | Built, real data only |
| Document editor (ProseMirror, one surface for all `.md`) | Built; no undo integration, no real dirty model |
| Chat rail (per-doc chat, ＋ Skill, @mention, working-set chips) | Built; responses do not stream |
| Review rail + in-editor review (inline diffs, approve/reject, action bar) | Built, both surfaces equal (decision 64) |
| Provenance gutter + source-peek drawer | Built (94% match) |
| Project-wide fan-out run screen (swarm grid, decisions column) | Built from real run data |
| Cross-document review screen | Built; Tweak action is partial |
| History tab | Flat audit timeline capped at 4 entries; **falls back to fabricated sample versions** and a hardcoded "WEEKLY SUMMARY.MD" header (`reviewRailView.ts:697-713`) |
| Templates screen | **"Soon" stub** |
| Knowledge screen | **"Soon" stub** |
| Agents screen | Partial (live table + Run now; no canvas) |
| MCP source kind | Parses but does not resolve |
| Present button | Unverified/unclear |

## 2. The verdict in one paragraph

The engine thesis is proven and the shell fight was won far more cheaply than predicted (~6 tiny core patches instead of the feared Cursor-scale tax).
The product now demos as a genuine calm document app.
What separates it from "a beautiful AI-native word processor" is no longer the shell: it is (a) trust infrastructure the wedge promises but the build does not yet deliver (undo, history, snapshots), (b) responsiveness (chat that hangs then dumps), (c) the two empty nav destinations (Templates, Knowledge) that make 40% of the nav a stub, and (d) spike-grade internals (serial refresh, no context budgeting, shallow provenance for API sources) that will fail the first real multi-doc workspace.
All four are addressable inside the existing architecture; none requires re-litigating fork-vs-greenfield first.

## 3. Findings, ranked

Severity bands: **P0** = undermines the product promise or first impression; **P1** = visible quality/trust gap; **P2** = will bite at scale or in edge cases; **P3** = polish and hygiene.

### P0-1 · No undo, no dirty model, no history (trust promise unmet)

The wedge is "a document you can trust", yet Cmd+Z does nothing after an approve, there is no unsaved state, and History is a facade.
Both ProseMirror edits and approved proposals write straight through `IFileService` via `saveRawText` (`common/livingDocs.ts:236`), bypassing VS Code's text-model/dirty/undo/autosave machinery entirely (known since [04-risks-and-predictions.md](04-risks-and-predictions.md)).
The History tab shows at most the last 4 audit entries and, when the audit is empty, silently falls back to the comp's fabricated sample versions ("v14 · just now · Tom") under a header hardcoded to "WEEKLY SUMMARY.MD" (`reviewRailView.ts:697-713`) - a direct violation of the plan-17 "real data only" rule.
A user who bulk-approves 14 changes across 4 documents (the plan-23 hero flow) has no way back.
This is the single highest-leverage fix: it converts the existing audit data into the product's visible spine.
→ **[Plan 26 - History, undo and snapshots](plans/26-history-undo-snapshots-loop.md)**

### P0-2 · Chat hangs, then dumps a blob

Model calls are non-streaming; the composer shows a pulse indicator, then the full response lands at once (streaming explicitly deferred in decision 58).
Errors surface as a flat "the agent model errored" with a single silent retry (~80% recovery on OpenRouter).
There is no cancel, and a project-wide fan-out (plan 23) cannot be stopped once started.
Against the daily texture of Claude/ChatGPT/Cursor, this is the most-felt quality gap in the product.
→ **[Plan 27 - Streaming, cancellation and model-call UX](plans/27-chat-streaming-loop.md)**

### P0-3 · Templates and Knowledge are dead nav destinations

Two of the five nav items land on "Soon" stubs (honest labelling from plan 17, but still stubs).
Templates is not a side feature: the beachhead is recurring, data-linked reports, and a template (structure + bindings + skills) is precisely how a recurring report is born.
Knowledge is the natural home for the source library the engine already models (`sources:`/`context:` frontmatter, the lock's context entries).
→ **[Plan 28 - Templates and the new-document on-ramp](plans/28-templates-onramp-loop.md)** and **[Plan 29 - Knowledge, sources and real MCP](plans/29-knowledge-sources-loop.md)**

### P1-1 · Provenance is shallow for anything that is not a CSV

`revealSource` opens the bound CSV and highlights the synced row; for `api` blocks it falls back to the CSV, and `mcp` blocks do not resolve at all.
Bound figures carry no data-age signal (no "from metrics.csv, synced 2 h ago" without opening source-peek).
For a product whose wedge is provenance, every bound atom should answer "where is this from and how fresh is it" on hover.
→ **Plan 29** (source registry, MCP resolution, freshness affordances)

### P1-2 · The review loop lacks Tweak, rationale and confidence framing

The cross-doc review spec (plan 24 / spec Part C5) calls for Accept / **Tweak** / Reject; Tweak currently just navigates to the doc.
The comp's proposal framing ("Meaning change · needs your call" + a rationale line) is specified in the spec (Part C2) but unbuilt, so proposals justify themselves less than the design intends.
One known data-loss bug sits here too: a chat edit on a bulleted-list item can drop sibling items (decision 68).
→ **[Plan 31 - Review-loop quality](plans/31-review-quality-loop.md)**

### P1-3 · IDE chrome still leaks on the screen surfaces

The verify screenshots for plans 23/24 show the native title bar with the command-centre search box, editor-group split/layout icons, and "Toggle Secondary Side Bar (⌥⌘B)" tooltips above our screens.
The old brand ("Opportunity OS") appears in the window title when no editor is active, and the web build greets with the memfs mount name ("mount - 3 documents") instead of a project name (plan 17 findings, still visible in the plan 22-25 shots).
Each is small; together they break the "calm by construction" spell exactly where a design partner will look.
→ **[Plan 33 - Shell integrity and brand](plans/33-shell-integrity-loop.md)**

### P2-1 · Refresh and fan-out are serial and unbounded

`refreshFromSources()` iterates every discovered doc sequentially; the orchestrator runs agents sequentially; a network call per `api` block and a model call per narrative block, no concurrency limit, no cache, no incremental (changed-source-only) derivation ([04-risks-and-predictions.md](04-risks-and-predictions.md), confirmed in `livingDocsService.ts`).
The plan-18 single-model-call fan-out (decision 62) sends all doc bodies in one request with no context budgeting; a 50-doc folder will silently truncate or fail.
Fine for the 14-doc ISMS sample; not for the first real customer folder.
→ **[Plan 30 - Performance and scale](plans/30-performance-scale-loop.md)**

### P2-2 · Cross-document propagation and scheduled triggers are designed but not wired

The orchestration spec ([09-orchestration-and-automation.md](09-orchestration-and-automation.md)) defines the one-rule reverse-edge walk, heartbeat drain, before-export verify gate and on-publish snapshot.
The orchestrator scaffolding exists (`agentOrchestrator.ts`, cron/heartbeat ticks, dirty queue) but source-watcher → graph-walk → cross-doc dirty marking is not connected, and the lifecycle hooks are unbuilt.
The "living" in Living Documents currently requires a human to press Refresh.
→ **[Plan 32 - Orchestration completion](plans/32-orchestration-completion-loop.md)**

### P2-3 · Zero test coverage on the webview layers

`livingDocEditor.ts`, `screenEditor.ts`, `reviewRailView.ts`, `treeRailView.ts` (~2,000 LOC of the most user-facing code) have no unit tests; they are verified only by the manual chrome-devtools loop.
The mount-once-then-message webview lifecycle is exactly the kind of timing-sensitive code that regresses silently.
→ folded into **Plan 30** (harness) with per-plan test gates in each plan.

### P3 · Smaller items (routed into the plans above)

- "Saved · v14" version chip in the editor toolbar is an honest-residual mock (decision 59); becomes real with plan 26 snapshots.
- New-document on-ramp is a blank file with name-on-first-save (decision 56); Word/Docs users expect name-or-template first. → plan 28.
- Skills are document-scoped only; no cross-doc skill run. → plan 32.
- Agents screen lacks the designed workflow canvas. → plan 32 (stretch).
- No source auth story (public endpoints only). → plan 29.
- Chat has no structured access to the audit trail ("what did we change last week?"). → plan 26 exposes snapshots; a chat tool over audit is listed in doc 12 futures.

## 4. Feasibility notes (fork-vs-greenfield, revisited)

Nothing found in this review changes the [plans/03](plans/03-merge-tax-ledger.md) recommendation: keep the fork for the validation phase.
Two observations sharpen it:

1. **The remaining work is almost all our-surface.** Plans 26-32 land inside `contrib/livingDocs/` and the proxy script; only plan 33 touches the seam list, and it mostly *removes* reliance on fragile CSS by consolidating what already exists.
   The fork keeps proving cheaper than predicted.
2. **The one genuinely fork-flavoured risk is undo.** Plan 26 deliberately builds document history at the product layer (snapshots + audit + PM history) rather than deep-integrating VS Code's `IUndoRedoService`, precisely so the work survives a later greenfield move.
   Every plan in this set states its portability posture.

## 5. Suggested execution order

1. **Plan 26** (history/undo/snapshots) - trust spine; unblocks the "Saved · vN" chip and bulk-approve safety.
2. **Plan 27** (streaming/cancel) - the most-felt daily quality gap; small blast radius.
3. **Plan 31** (review quality) - includes the list-sibling data-loss fix; do the bug first if scheduling slips.
4. **Plan 28** (templates/on-ramp) then **Plan 29** (knowledge/sources) - completes the nav, unlocks the beachhead story.
5. **Plan 30** (performance/scale) - before the first >20-doc pilot folder.
6. **Plan 32** (orchestration) - turns "refresh on demand" into "living".
7. **Plan 33** (shell integrity) - cheap, high-polish; can run any time as a filler loop.

Dependencies are stated per plan; 26 → 31 and 29 → 32 are the only hard orderings.
