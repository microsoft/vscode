# Plan 32 - Orchestration completion (make "living" mean living)

> **For agentic workers:** implement with `superpowers:subagent-driven-development`.
> Small, live-verified, stacked PRs off `main`.
> Context of record: [11-product-review-2026-07.md](../11-product-review-2026-07.md) finding P2-2; spec of record [09-orchestration-and-automation.md](../09-orchestration-and-automation.md); ledger entries O1-O6 in [03-merge-tax-ledger.md](03-merge-tax-ledger.md).

**Goal:** The orchestration layer stops being a proven-in-miniature demo and becomes the product's pulse: source changes ripple across the project automatically under per-edge policy, scheduled agents produce visible outcomes (Home NEEDS-YOU, run history), policies are inspectable and editable in the Agents screen, and the whole loop is observable and trustworthy.

**Architecture:** The machinery largely exists and is under-used: the reverse-edge graph + dirty queue (`browser/agentOrchestrator.ts`), cron/heartbeat ticks (`TICK_MS = 60_000`, `:32`), per-edge policy routing (ledger O3), lifecycle hooks (`_beforeExportGate` `livingDocsService.ts:1000`, `publishDocument` `:1009`, on-open freshness `:562`), and per-doc correlated source watchers (ledger F3).
This plan wires the gaps (watcher → cross-doc propagation → policy → visible outcome), surfaces state (Agents screen, run log, Home), and hardens the edges (overlap, quiet hours, error runs).
Our-surface only.

**Tech stack:** existing contrib; `IClock` seam for deterministic tests; no framework (spec 09 §8 stands: no LangChain/LangGraph).

## Global constraints

- One results destination: everything an agent produces lands as pending changes in the review engine or as drafts - never direct writes to meaning-bearing prose (spec 09 policy model; decisions 17/64).
- Policy is a safety dial, not a preference soup: exactly the three levels `auto-figures` / `ask` / `draft-only` (spec 09 §4); no per-agent bespoke flags.
- Truthful automation: a scheduled run that did nothing shows nothing (no fake activity); a run that failed says so where the user will look (Home, Agents).
- Web-build reality: timers only run while the app is open; never imply background work happened when it did not (surface "while you were away" as *computed on open*, which the on-open freshness hook already does).
- Tabs; nls strings; disposables; Australian English; no em dashes.
- `typecheck-client` + `valid-layers-check` clean per PR; screenshots to `docs/plans/32-verify/`.

## Current state (exact anchors)

- Orchestrator: default agents `weekly-refresh` (cron Mon 09:00, `auto-figures`) and `freshness-sweep` (heartbeat 6 h, `draft-only`) (`agentOrchestrator.ts:45-47`); `runDueAgents` (`:180`); dirty queue drained by heartbeat (`:222-259`); cron parsed UTC (`:30`).
- Service bridge: `_runAgent` host callback; heartbeat clears dirty per doc (`livingDocsService.ts:1145-1146`); graph propagation comment at `:699`.
- Watchers: per-doc correlated `fileService.createWatcher` on sources (ledger F3) - currently recomputes freshness; confirm whether it enqueues cross-doc dirty entries for *context* edges as well as value bindings (the `IDirtyEntry` model distinguishes them).
- Agents screen: live table (name/trigger/flow/last run/status) + Run now (plan 23); no policy editing, no run log, no canvas (decision 32 dropped the POLICY column to match the comp; policy lives per-agent).
- Skills: run per-document (`runSkill`, `applySkillFix`); the verify gate blocks a failed grader (ledger O4).

## Decisions to settle in iteration 1

- **D32-A - run persistence.** Recommendation: append agent runs to `agents.json` (`IAgentRun` already modelled: agent/via/at/docs/outcome counts), capped at the last 50 runs; the Agents screen renders the log from it. No new file.
- **D32-B - the canvas question.** The comp's workflow canvas (trigger → sources → docs → policy as a node strip) is presentation, not new machinery.
  Recommendation: build it read-only per agent (a horizontal node strip, comp style), defer any drag-editing; editing happens through small inline controls (policy select, trigger field). Settle with Tom whether read-only is enough for the validation phase.

## Iteration plan

### Iteration 1 - Event propagation, end to end

- Verify-then-wire: with two docs where doc B's `context:` names doc A, and doc C binds `metrics.csv` - edit the CSV and doc A - assert (test-first, fake clock, mocked watcher events) that: C gets a `staleBindings` flag and a dirty-queue entry; B gets `staleContext` + dirty entry (the reverse-edge walk covering *both* edge kinds, spec 09's one-rule); nothing else flags.
  Fix whatever the assertion finds (the review's reading is that value-binding propagation works and context-edge fan-out is partial).
- Policy routing on the event path: a source event under an `auto-figures` agent applies figure changes immediately (audit `via: 'auto'`), queues meaning changes; under `draft-only`, everything queues as drafts.
  Assert each with the existing policy router (ledger O3) - add tests if the event path bypasses it today.
- Gate: unit tests green; live: edit the CSV on disk while the app is open → within a tick the Review rail shows the queued meaning change, figures auto-applied, Home NEEDS-YOU count updates without a manual Refresh.

### Iteration 2 - Scheduled runs that leave a trace

- Implement D32-A: persist `IAgentRun` records from every trigger kind (cron/heartbeat/event/manual) with outcome counts (docs touched, applied, queued, failed) and a failure string when a run errors; cap 50.
- Overlap + quiet-hours hardening (spec 09 §3): a due agent whose previous run is still in flight skips with a recorded "skipped (still running)" run; runs never stack.
  Cron catch-up: if the app was closed across a cron boundary, on startup record nothing (web reality rule) but let the on-open freshness pass flag what is stale - verify this produces the correct NEEDS-YOU state.
- Home: when the latest run of any agent failed, the greeting area gains one quiet attention line ("Weekly refresh failed on Monday - view details") linking to the Agents screen.
- Gate: fake-clock tests for overlap-skip and outcome recording; live: trigger the heartbeat (temporarily set `everyHours` low), see the run recorded and Home reflect results.

### Iteration 3 - The Agents screen grows up

- Per-agent detail (in-screen drawer, G1-safe): the D32-B read-only canvas strip (trigger → sources → docs → policy → destination), inline policy select (three levels), trigger editor (cron day/time picker or heartbeat hours), and the run log (relative time, via, outcome counts, failure line; a run's "N queued" links to the review surface).
- Create/duplicate/pause agents: `agents.json` is the store (`agentStore.ts:39` seam); pause = a `disabled` flag the scheduler respects (add to `IAgentDef`, default absent).
- Cross-doc skills: a "Run skill across project" action (the P3 gap): fans `runSkill` over the folder's docs through the plan-23 run surface, results in the rail as usual.
  Reuses the existing fan-out grid; skills stay single-doc units, the orchestrator does the fanning.
- Gate: live: change `weekly-refresh` policy to `draft-only`, run it, confirm figures arrive as drafts not auto-applies; pause an agent, tick past its cron, confirm the skip; run Formatting across the ISMS sample and review flags in the rail.

### Iteration 4 - Lifecycle gates become visible

- Before-export: `_beforeExportGate` (`livingDocsService.ts:1000`) already blocks; give it a surface - the export/present flow shows the failed grader's one-line reason with "Export anyway" (audited `via: 'override'`) and "Fix first" (jumps to the flagged block). No silent blocks, no silent overrides.
- On-publish: `publishDocument` (`:1009`) pins sources; surface pins in History (plan 26's SNAPSHOT badge renders the pin, replacing the comp mock) and in source-peek ("pinned at v of <date>" line when viewing a pinned doc).
- Gate: live: fail the Financial grader deliberately (edit a figure by hand), attempt export → the gate explains; override → audit entry; publish → History shows the pinned version.

## Acceptance criteria

- [ ] One-rule propagation proven for value AND context edges with policy routing on the event path; live CSV edit ripples without manual refresh. _(iter 1)_
- [ ] Every run recorded with outcomes; overlap-skip; failure surfaces on Home. _(iter 2)_
- [ ] Agents screen: detail drawer with canvas strip, editable policy/trigger, run log, pause, create; cross-project skill runs. _(iter 3)_
- [ ] Export gate and publish pins visible, explainable, override-audited. _(iter 4)_
- [ ] No fabricated activity anywhere; web-reality rule respected in all copy.
- [ ] `typecheck-client` + `valid-layers-check` clean; **0 core patches**; Agents screen design-match >= 90%.

## Verify approach

Fake-clock unit tests carry the scheduling logic (extend `agentOrchestrator.test.ts`, `:184` suite); live verification on web :8080 with a shortened heartbeat + desktop `code.sh` for real disk watchers (editing the CSV in another editor is the honest trigger).
E2E: the full Monday story - CSV lands → auto-figures applied → meaning queued → Home NEEDS YOU → review → History snapshot.
Log D32-A/B to `docs/07-decision-log.md`.
