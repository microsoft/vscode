# Plan 28 - Templates and the new-document on-ramp

> **For agentic workers:** implement with `superpowers:subagent-driven-development`.
> Small, live-verified, stacked PRs off `main`.
> Context of record: [11-product-review-2026-07.md](../11-product-review-2026-07.md) finding P0-3; the Templates screen has been a "Soon" stub since plan 17 iter 7 (PR #45); Home already advertises "New doc from template - Weekly report, Quote, SOP..." without delivering it.

**Goal:** Templates become real: a template is a file in the project (structure + bindings + a generation brief), the Templates screen lists real templates with live previews, "Generate draft" produces a reviewable document through the existing chat/proposal engine, and the new-document flow starts from "name it or pick a template", matching Word/Docs expectations.

**Architecture:** Consistent with "the folder is the project" (decision 39): templates are `*.template.md` files - ordinary Markdown with frontmatter (`template: true`, `name:`, `description:`, optional `sources:`) whose body may contain bind links and `{{placeholder}}` slots plus prose instructions.
Generation = create a new `.md`, then drive the existing generative-chat path (insertion proposals, decision 45) with the template body as the instruction context - so a generated draft arrives as reviewable pending changes, not a silent write.
Screen work lands in `browser/screenRender.ts` (Templates screen) and `screenEditor.ts`; service additions in `livingDocsService.ts`; parsing in `common/livingDocMarkdown.ts`.
Our-surface only; 0 core patches expected.

**Tech stack:** existing contrib stack; no new dependencies.

## Global constraints

- **Real data only**: the Templates screen shows templates actually present in the folder (plus the starter set we ship in `living-docs-sample/`); empty folder → calm empty state with "Create your first template".
- Generated content routes through the review engine (decision 17); "Generate draft" never writes prose directly.
- New docs stay blank-by-default when the user picks "blank" (decision 56 holds); this plan adds choice, not ceremony.
- Template files are honest Markdown: openable/editable in the normal editor; no new format, no sidecar.
- Tokens per spec Part B; screen backgrounds `canvas #F8F9FB`, cards on `paper`; title-style capitalisation for buttons.
- Tabs; nls-externalised strings; disposables; Australian English; no em dashes.
- `typecheck-client` + `valid-layers-check` clean per PR; screenshots to `docs/plans/28-verify/`.

## Current state (exact anchors)

- Templates screen: rendered by `screenRender.ts` as a static stub; its buttons are labelled "Soon" (plan 17 iter 7 honesty rule).
- Home quick-start: `renderHome` (`screenRender.ts:205,227`) advertises "New doc from template · Weekly report, Quote, SOP..." - currently a dead promise.
- New document: tree-rail + Home create a blank file, name-on-first-save (decision 56; plan 16 iter 3 `focusPm()` on mount).
- Generative chat: `sendChatMessage` → model → `parseChatResponse` (`common/livingDocMarkdown.ts:291`) → insertion proposals (decision 45) → review rail.
- Document discovery: the service's folder scan behind `listDocuments` (see `livingDocsService.ts` discovery block) - extend, do not duplicate.

## Decisions to settle in iteration 1

- **D28-A - template file naming.** Recommendation: `<name>.template.md` in the project folder (optionally under `templates/`), discovered anywhere in the folder; excluded from the Reports list in the tree-rail (they appear only under Templates) but NOT hidden from disk.
- **D28-B - generation input.** Recommendation: on Generate, a single calm prompt sheet: document name (required), one optional free-text line ("anything specific for this one?"), and the source checklist pre-ticked from the template's `sources:`. No multi-step wizard.
- **D28-C - placeholder semantics.** `{{slot:hint}}` renders in the template preview as a muted chip; at generation time slots become part of the model brief ("fill 'executive summary' from the sources"); bind links in the template body copy through verbatim so generated docs are born bound.

## Iteration plan

### Iteration 1 - Template model + discovery

- `common/livingDocMarkdown.ts`: extend frontmatter parsing to read `template: true`, `name:`, `description:` (reuse the existing frontmatter block parser; no second parser).
- Service: `listTemplates(): Promise<readonly ITemplateInfo[]>` where `ITemplateInfo { uri: URI; name: string; description: string; sources: readonly string[]; body: string }`; discovery piggybacks on the existing folder scan; exclude `*.template.md` from `listDocuments` results (and therefore from the tree-rail Reports group and Home documents grid).
- Ship 3 starter templates in `living-docs-sample/templates/`: Weekly report (bind-linked to `metrics.csv`), Client update, Meeting notes → SOP. Each with honest `description:`.
- Tests: frontmatter parse; `listTemplates` returns the starters; `listDocuments` no longer includes them.
- Gate: unit tests green; tree-rail shows no `.template.md` entries in the live app.

### Iteration 2 - The Templates screen, real

- Replace the stub in `screenRender.ts`: a card grid (comp style: paper cards, 2-letter avatar per template, name, description, mono `N slots · M sources` line) from `listTemplates()`; card actions: **Use Template** (primary) and **Edit** (opens the `.template.md` in the normal editor - it is just Markdown).
- **New Template** creates `untitled.template.md` seeded with a commented example (frontmatter + one `{{slot}}` + one bind link) and opens it.
- Empty state: one calm line + "Create your first template".
- Remove every "Soon" label from this screen.
- Gate: live screen lists the 3 starters with true counts; Edit opens the file; New Template round-trips; screenshots to `28-verify/`.

### Iteration 3 - Generate draft through the review engine

- Service: `generateFromTemplate(templateUri: URI, docName: string, note: string): Promise<URI>` - creates `<docName>.md` containing the template's static skeleton (headings + verbatim bind links; slots left empty), opens it in the editor, then invokes the existing chat path on it with a composed instruction: template body + slot hints + the user's note + `sources:` context.
  The model's output arrives as insertion proposals in the review rail, exactly like any chat generation.
- Wire **Use Template** to the D28-B prompt sheet → `generateFromTemplate`.
- Wire Home's "New doc from template" quick-start card to the Templates screen (or directly to the sheet when there is exactly one template).
- The generated doc's frontmatter records `template: <name>` provenance (one line; the audit trail then shows "Created from Weekly report template" - the exact string the comp's History mock promised, now real).
- Tests: skeleton creation (bind links copied verbatim, slots stripped), instruction composition (snapshot-style `deepStrictEqual` on the composed prompt), no-model fallback (skeleton still created; a status message explains the draft needs the model).
- Gate: live E2E with model: Use Template → name it → draft proposals appear in review → approve all → a real bound document exists; provenance line present.

### Iteration 4 - The name-or-template on-ramp

- Replace the bare blank-create in Home's "New document" card and the tree-rail's new-doc action with a single lightweight sheet: name field (autofocused), **Blank document** (default, Enter) and the template list as secondary rows.
  Choosing blank with a name creates `<name>.md` already named (no more name-on-first-save for this path; keep the old behaviour when the name is left empty, preserving decision 56's zero-ceremony escape hatch).
- Gate: Enter-to-blank-doc is two keystrokes plus a name; template path reaches the iteration-3 flow; empty-name still works as before.

## Acceptance criteria

- [ ] `*.template.md` discovered, parsed, excluded from Reports; 3 honest starters ship. _(iter 1)_
- [ ] Templates screen: real cards, Use/Edit/New wired, zero "Soon" labels. _(iter 2)_
- [ ] Generate draft: skeleton + insertion proposals through the review rail; bind links born live; template provenance recorded. _(iter 3)_
- [ ] New-document sheet: name + blank/template choice; blank stays two keystrokes. _(iter 4)_
- [ ] No-model behaviour honest (skeleton + explanation, no fake prose).
- [ ] `typecheck-client` + `valid-layers-check` clean; **0 core patches**; Templates screen design-match >= 90% vs the comp's Templates region.

## Verify approach

`npm run watch`; web :8080 + proxy :8090; chrome-devtools drives.
E2E: fresh folder → New doc from template → Weekly report → approve draft → verify bind links resolve against `metrics.csv` → History shows "Created from ... template".
Desktop pass to prove template files round-trip on disk.
Log D28-A/B/C to `docs/07-decision-log.md`; design-match to `docs/design-audit/redesign-log.md`.
