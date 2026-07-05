# Plan 31 - Review-loop quality (Tweak, rationale, and the list bug)

> **For agentic workers:** implement with `superpowers:subagent-driven-development`.
> Small, live-verified, stacked PRs off `main`.
> Context of record: [11-product-review-2026-07.md](../11-product-review-2026-07.md) finding P1-2; spec Part C2 of [20-abstract-ui-redesign-handoff.md](20-abstract-ui-redesign-handoff.md); the list-sibling bug is decision 68's known finding (plan 19).

**Goal:** Reviewing a change becomes a complete conversation: every proposal explains itself (kind, confidence, rationale, source), the reviewer can **Tweak** a proposal inline instead of accept-or-reject-only, and chat edits on list items no longer drop sibling items.

**Architecture:** All in `contrib/livingDocs/`.
The proposal model (`IProposedChange`, `common/livingDocsModel.ts:388-406` region) already carries `kind`, `confidence`, `rationale`, `sourceQuote`, `sourceLine` - the data is modelled; this plan surfaces it (decorations, rail, cross-doc cards) and adds one new state transition (amend-before-approve).
The list bug is a diff-anchoring fix in the PM decoration/apply path.

**Tech stack:** existing contrib; PM decorations via `buildPmDecorationSpec` (`common/livingDocPmDecorations.ts:106`); possibly one PM bundle rebuild if the widget DOM needs a new node type (avoid if possible - widgets are built host-side).

## Global constraints

- One approve path: Tweak amends the pending change then approves through the existing `approve(changeId)` (`common/livingDocs.ts:297`); no parallel apply route.
- Truthful confidence: `● High` only when the change is figure-derived or source-quoted; model-inferred prose is `◐ Inferred`. Never decorative.
- Fix the data-loss bug (iteration 1) before shipping any polish - it is the only known way the product destroys user content.
- Tabs; nls strings; disposables; Australian English; no em dashes.
- `typecheck-client` + `valid-layers-check` clean per PR; screenshots to `docs/plans/31-verify/`.

## Current state (exact anchors)

- Proposal fields: `IProposedChange` - docId / blockId / oldText / newText / kind ('figure' | 'meaning') / confidence / rationale / sourceQuote / sourceLine (`common/livingDocsModel.ts`).
- Inline rendering: word-diff + Approve/Reject widgets as PM decorations (decision 47/52); spec built host-side in `buildPmDecorationSpec` and shipped to the webview via `LWDPM.setDecorations`.
- Rail cards: `reviewRailView.ts` grouped by doc (`IProposedChange` usage `:221`); cross-doc cards: `screenRender.ts:800-891` with source + confidence chips already partially rendered (plan 24, 91% match).
- Cross-doc Tweak: navigates to the doc only (plan 24 iter 2 note) - no inline amend.
- Known bug (decision 68): a chat edit targeting one bulleted-list item can drop sibling items on apply.
  Anchoring context: whitespace-collapse matching landed in plan 19 iter 2 (decision 65); `findQuoteLine` was hardened against short-line false matches (plan 23 iter 4) - the list case is the remaining hole: block-level replace where the model's `oldText` spans one `<li>` but the applied replace consumes the parent block.

## Decisions to settle in iteration 1

- **D31-A - Tweak interaction shape.** Recommendation: in-place editing of the *proposed* text - the widget's green segment becomes a contenteditable span with `Save & Approve` / `Cancel`; on the cross-doc cards, the same affordance inside the card.
  Rejected alternative: a modal composer (breaks the "review where it lands" principle).
- **D31-B - amend semantics.** Recommendation: `amendChange(changeId, newText)` mutates the pending change's `newText` and appends `via: 'tweaked'` to its eventual audit entry (so the trail shows the human modified the agent's words - a trust feature, not bookkeeping).

## Iteration plan

### Iteration 1 - Fix the list-sibling drop (data loss)

- Reproduce first, E2E: sample doc with a 4-item bulleted list → chat "rewrite the second bullet to mention X" → approve → observe siblings vanish.
  Capture the failing case as a unit test at the apply layer (the service-side replace that turns an approved `IProposedChange` into new raw text) and at `buildPmDecorationSpec` (where the anchor is located) - whichever layer is wrong, per the systematic-debugging pass.
- Likely fix shape: anchor and replace at the list-item node boundary, not the paragraph/block text (the anchor matcher must treat each `li`'s text as its own searchable unit; the replace must splice only the matched item's range back into the serialised Markdown).
  Add sibling-preservation assertions: apply an edit to item 2 of 4 → items 1/3/4 byte-identical.
- Cover the neighbours: ordered lists, nested lists (one level), a list item containing a bound figure atom.
- Gate: the reproduction passes live; unit tests for all four cases; no regression in the existing decoration tests (`livingDocPmDecorations.test.ts`).

### Iteration 2 - Rationale + confidence framing on every surface

- Inline widget (spec Part C2): above the word-diff, one quiet line: kind tag (`MEANING CHANGE · needs your call` in attention tokens / `FIGURE` in ok tokens), confidence chip (`● High` / `◐ Inferred` per the truthfulness rule), then the rationale sentence when present; source chip (`metrics.csv · line 12`) links to source-peek via the existing `sourceLine`.
  Extend the decoration spec model (`IPmEditDecoration`) with the framing fields; render host-side strings, webview just places them.
- Rail cards and cross-doc cards: same framing, same order, same tokens (cross-doc already has chips - align exactly; rail lacks rationale - add it).
- When the model supplies no rationale, show nothing (no "AI suggested this" filler).
- Gate: the three surfaces render identical framing for the same change; design-match the inline widget against the comp's proposal region >= 90%; screenshots.

### Iteration 3 - Tweak (amend-before-approve)

- Service: `amendChange(changeId: string, newText: string): void` per D31-B on `ILivingDocsService`; fires `onDidChange`; audit `via: 'tweaked'` on the subsequent approve.
- Inline widget: an `Edit` (pencil) action beside Approve/Reject → D31-A in-place editing of the proposed segment → `Save & Approve` calls `amendChange` then `approve`; `Cancel` restores.
  The contenteditable span is inside the widget decoration (host-provided DOM), not the PM document, so the document itself stays read-only until approval - no interaction with the doc's undo stack.
- Cross-doc cards: wire the existing Tweak button to the same flow inside the card; keep the secondary behaviour (click-through to the doc) as the card title link.
- Guard: amended text goes through the same serialisation used by approve today (no new persist path); an amend on a `figure` proposal is disallowed (figures come from sources; the affordance hides for kind 'figure').
- Tests: amend → approve writes amended text + `tweaked` audit; amend then reject discards cleanly; figure proposals expose no amend.
- Gate: live E2E on both surfaces: tweak one word of a meaning change, approve, verify the document, the audit entry, and History (plan 26) all show the tweaked result.

### Iteration 4 - Bulk-action safety net

- `Approve all` / `Approve all everywhere` (`approveAll`/`approveAllPending`, `common/livingDocs.ts:299-301`) get a one-line confirm when the set contains any `meaning` change ("Approve 6 changes including 2 meaning changes?") - figures-only bulk approves stay one-click (the auto-apply class does not deserve friction).
- If plan 26 has landed, note in the confirm copy that a version snapshot is taken; if not, take no dependency (copy without the mention).
- Gate: counts in the confirm are real; figures-only path unchanged; screenshots.

## Acceptance criteria

- [ ] List-sibling drop fixed with reproduction + 4 anchoring unit tests; no existing test regresses. _(iter 1)_
- [ ] Kind/confidence/rationale/source framing identical on inline, rail and cross-doc surfaces; truthful confidence rule enforced. _(iter 2)_
- [ ] Tweak: in-place amend → approve on inline widget and cross-doc card; `tweaked` audit trail; hidden for figures. _(iter 3)_
- [ ] Meaning-inclusive bulk approves confirm with real counts. _(iter 4)_
- [ ] `typecheck-client` + `valid-layers-check` clean; **0 core patches**; inline proposal design-match >= 90%.

## Verify approach

`npm run watch`; web :8080 + proxy :8090; chrome-devtools drives.
E2E order mirrors the iterations: reproduce the list bug before touching anything; then a full chat → propose → tweak → approve → History pass on the sample folder; then the ISMS cross-doc flow for card-side Tweak.
Log D31-A/B to `docs/07-decision-log.md`; design-match to `docs/design-audit/redesign-log.md`.
