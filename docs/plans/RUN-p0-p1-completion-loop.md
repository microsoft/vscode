# RUN - P0/P1 completion loop (paste this into a fresh chat)

This is the master orchestration prompt for completing every P0 and P1 finding from
[../11-product-review-2026-07.md](../11-product-review-2026-07.md) in one continuous, unattended run.
It uses a three-role agent architecture: one Fable 5 orchestrator (the session itself), Opus 4.8 implementer sub-agents, and independent Opus 4.8 validator sub-agents.
Paste the block below verbatim into a fresh session.

> **Bootstrap:** the plan docs (26-33) and this prompt live on the branch
> **`worktree-ux-review-plans`** (opened as a PR to `main`).
> Step 0 of the loop merges that PR (or the branch) into `main` if it has not landed yet, so the
> plans are present everywhere feature branches start from.

---

Complete every **P0 and P1** finding from `docs/11-product-review-2026-07.md` on this Abstract /
Living Documents VS Code fork, as one continuous unattended run.
Work the findings through their plan docs:

  - **P0-1** history/undo/snapshots → `docs/plans/26-history-undo-snapshots-loop.md`
  - **P0-2** streaming/cancellation → `docs/plans/27-chat-streaming-loop.md`
  - **P0-3** templates + knowledge → `docs/plans/28-templates-onramp-loop.md` + `docs/plans/29-knowledge-sources-loop.md`
  - **P1-1** deep provenance/MCP → `docs/plans/29-knowledge-sources-loop.md` (iters 3-4)
  - **P1-2** review quality + the decision-68 list-sibling data-loss bug → `docs/plans/31-review-quality-loop.md`
  - **P1-3** shell integrity/brand → `docs/plans/33-shell-integrity-loop.md`

(Plans 30 and 32 are P2 - explicitly OUT of scope for this run.)

**Step 0 (bootstrap).** If `docs/plans/26-history-undo-snapshots-loop.md` is not on `main`, merge
the branch `worktree-ux-review-plans` (its PR is docs-only) into `main` first.
All feature branches start from `main` thereafter.

## The three roles (strict)

1. **You are the ORCHESTRATOR, and nothing else.** You run on Fable 5 and you are a token budget,
   not a workforce: you never write feature code, never read large source files, never debug, and
   never verify surfaces yourself.
   You decompose plans into work units, dispatch sub-agents, adjudicate their reports, manage
   branches/PRs/merges, track the iteration count, and write the final summary.
   Every heavy artefact (code, logs, screenshots) is produced and consumed by sub-agents; you deal
   in their reports.
2. **IMPLEMENTER sub-agents - Opus 4.8.** Every implementation Agent call MUST set
   `model: "opus"` (Opus 4.8). Never implement with Fable, Sonnet or Haiku - the Fable token
   budget does not cover implementation.
   Each implementer gets: one plan iteration (or a coherent slice of one), the plan path, the repo
   rules pointer (`.claude/CLAUDE.md`), its branch name and base, its assigned ports, and any REDO
   findings from a previous cycle.
   Implementers follow the plan exactly: settle each "decision to settle" to the plan's stated
   recommendation (unattended run) and append it to `docs/07-decision-log.md`; write the tests the
   plan specifies; verify live with chrome-devtools against their own running build; save
   screenshots under `docs/plans/<NN>-verify/`; ensure `npm run typecheck-client` and
   `npm run valid-layers-check` are clean; commit (no co-author lines); push; open the PR with
   before/after images embedded and the plan's acceptance checklist in the body; then report back:
   what was built, what was verified live (with evidence paths), what was NOT verified, any
   deviation from the plan, and any core patch taken (which must also be logged in
   `docs/plans/03-merge-tax-ledger.md`).
3. **VALIDATOR sub-agents - Opus 4.8, independent.** Every validation Agent call MUST also set
   `model: "opus"`. A validator never fixes code and never talks to the implementer; it receives
   only the plan path, the branch/PR, and the implementer's claims, and its job is to try to
   refute them: check out the branch, build, run `typecheck-client` + `valid-layers-check` + the
   touched unit-test suites, launch the app itself (own ports), exercise every acceptance
   criterion live, retake its own screenshots and compare against the PR's, and audit the
   guardrails (real-data rule, no em dash, tabs, disposables registered, nls strings, core patches
   logged, no regression to the calm shell or review engine).
   Verdict format: **APPROVE** or **REDO** plus a numbered findings list (file:line, what is
   wrong, how it fails the plan), and a confidence note on anything it could not check.

**Adjudication (you, every cycle).** Read both reports. REDO with the validator's findings
attached (same branch, fresh implementer) when the validator refutes something material; APPROVE
and move the unit forward when the validator passes it or its objections are cosmetic-only (note
them in the PR).
If the two reports contradict on a checkable fact, dispatch a second validator scoped to that fact
rather than trusting either.
After **2 REDO cycles** on the same unit, park it: leave the PR open with an honest "known gaps"
comment, record it for the summary, and move on - do not burn the iteration budget on one unit.

## Orchestration mechanics

- **Waves (conflict-aware).** Run up to 3 implementers in parallel, each in its own git worktree
  (`isolation: "worktree"` or `git worktree add`), each with its own `npm i` + build
  (Node 24.15.0 per `.nvmrc`) and its own port pair (web 8080/8082/8084, proxy 8090/8092/8094 -
  set `livingDocs.modelProxyUrl` accordingly when non-default).
  - **Wave A:** plan 26, plan 28, plan 33 (mostly disjoint files).
  - **Wave B (after A lands):** plan 27 and plan 29 - both touch the proxy script and the
    service; run 27 first if conflicts look likely, else parallel with a merge-order plan.
  - **Wave C (after 26 lands):** plan 31 (its iteration 4 copy depends on 26; its iteration 1,
    the data-loss list bug, is the single most important fix in this whole run - never park it).
  - Within a wave, dispatch implementers as background agents; you are re-invoked as each
    finishes; adjudicate each unit as its reports arrive rather than barriering the wave.
- **Branches and PRs.** Feature branches off `main` (or off the prior stacked branch when a plan's
  iterations stack), named `<NN>-<slug>` per plan iteration or coherent slice; PRs target `main`;
  every PR embeds live screenshots (before/after) and the acceptance checklist.
  **You have standing permission to merge PRs** whose validation is APPROVED, and you must merge
  bottom-up whenever later work stacks on them (plans 18/19 learned this the hard way).
  Prefer several small merged PRs over one giant open one; everything remains reviewable from the
  PR record afterwards.
- **Iteration budget: 30.** One iteration = one dispatch-validate-adjudicate cycle for one work
  unit (a REDO cycle counts as a new iteration). Track the count; if the budget nears exhaustion,
  prioritise: 31-iter-1 (data loss) > P0s > remaining P1s, and park the rest with honest notes.
- **No checkpoints. No questions.** Never use AskUserQuestion; never pause for approval; never end
  the turn while work units remain and budget remains.
  Recover from failures yourself (build breaks, port clashes, flaky webview timing: restart
  `npm run watch`, re-poll compiled output before tests, let the service worker register).
  The only stop conditions: all P0/P1 units merged-or-parked, or 30 iterations spent.
- **Fable token discipline.** Your own turns stay short: dispatch, read reports, decide, record.
  Do not paste implementer diffs or logs into your own context; ask agents for conclusions.

## Guardrails (inherited from the plans - enforce via validators)

- Real data only; truthful empty/idle/failure states; no fabricated versions, counts or activity.
- Everything routes through the review engine; no new approve/apply paths.
- Contrib/our-surface first; any core patch minimal, fail-soft, and logged in the merge-tax ledger
  (plan 33's cap: stop at 3 new core patches and record the residue instead).
- Tabs not spaces; nls-externalised UI strings; disposables registered; Australian English; no em
  dashes; title-style caps on labels.
- Do not regress: the calm shell (16), multi-doc working set (18), editor-led review (19), the
  redesign surfaces (21-25), or the 203 existing unit tests.

## Conclude with

A single summary comment (and matching final message): every PR opened (number, title, plan,
merged/open/parked), every REDO cycle and why, every parked gap, every core patch taken, decision
log entries added, and the exact state a reviewer should look at first.
All PRs must carry their screenshots - the whole run must be reviewable from the PR record alone.

---

## Notes for whoever runs this

- Expected shape: roughly 12-18 PRs (plan 26 ≈ 3-4, 27 ≈ 3, 28 ≈ 3, 29 ≈ 3-4, 31 ≈ 3, 33 ≈ 2-3),
  most merged bottom-up during the run, all screenshot-carrying.
- The riskiest unit is plan 26 iteration 1 (PM bundle rebuild) - the recipe is
  `docs/lwd-pm-bundle-build.md`; a validator must confirm the bundle still round-trips
  (`prosemirrorBundle.test.ts`) before anything stacks on it.
- Plan 27's proxy SSE work and plan 29's proxy `/mcp` route touch the same script - whoever lands
  second rebases; the orchestrator sequences the merge.
- The model backend for verification is OpenRouter (`LWD_BACKEND=openrouter`, decision 44) to keep
  API cost sane; one Anthropic-OAuth spot-check at the end of plan 27 is enough.
