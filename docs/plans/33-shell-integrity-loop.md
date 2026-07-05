# Plan 33 - Shell integrity and brand (closing the leaks)

> **For agentic workers:** implement with `superpowers:subagent-driven-development`.
> Small, live-verified, stacked PRs off `main`.
> Context of record: [11-product-review-2026-07.md](../11-product-review-2026-07.md) finding P1-3; merge-tax rules and seam list in [03-merge-tax-ledger.md](03-merge-tax-ledger.md); plan 17's leak findings (window title, mount name).

**Goal:** No IDE or old-brand artefact survives anywhere a design partner will look: the title bar, window title, folder naming, tooltips, keyboard surface and the screen surfaces are all Abstract, all calm - and the seam checklist that keeps them that way is executable, not tribal knowledge.

**Architecture:** Almost entirely settings/CSS/our-surface, in keeping with the ledger's tier discipline (cheapest tier first: settings → theme → styleOverrides-CSS → additive-contribution → core-patch).
Any new core patch must be justified in the ledger with a fragility note; budget: at most 1 (the title-bar command centre, if settings cannot fully remove it).

**Tech stack:** workspace/config defaults in `livingDocs.contribution.ts`, `contrib/styleOverrides/browser/media/studio.css`, `screenRender.ts`/`livingDocRender.ts` copy fixes, one shell script for the seam audit.

## Global constraints

- Ledger discipline: every change logged with its tier in [03-merge-tax-ledger.md](03-merge-tax-ledger.md); core patches fail-soft only.
- Honesty rule: fixing a leak never fabricates (e.g. the folder-name fix shows the real folder name, not a prettified invention).
- Nothing in this plan may regress the working IDE escape hatches that were deliberately kept (native Explorer, decision 42; raw-Markdown footer toggle).
- Tabs; nls strings; Australian English; no em dashes.
- `typecheck-client` + `valid-layers-check` clean per PR; before/after screenshots to `docs/plans/33-verify/`.

## The leak inventory (fix list)

Compiled from the plan 17 findings, the plan 22-25 verify screenshots, and this review's sweep:

| # | Leak | Where seen | Likely tier |
|---|---|---|---|
| L1 | Native title bar shows the command-centre search box ("Review Project" pill) and layout-toggle icons on screen surfaces | `24-verify/24-3-e2e-endstate.png`, `23-verify/23-4-full-c4.png` | settings (`window.commandCenter: false`, `workbench.layoutControl.enabled: false`) or styleOverrides |
| L2 | Editor-group split/toolbar icons + native ✕ visible above screens | same shots | settings/CSS per editor-group title config |
| L3 | "Toggle Secondary Side Bar (⌥⌘B)" tooltip + the keybinding it advertises | `23-4` shot | keybinding removal follows the decision-30 pattern if core-owned; try `workbench.action.*` unbinding via config first |
| L4 | Window/tab title reads "Opportunity OS" when no editor is active | plan 17 P2 finding | settings (`window.title`) + `product.json` display fields already rebranded in PR #38 - audit the residual |
| L5 | Web build greets "mount - N documents" (memfs mount point as project name) | `25-3-sweep-home.png`, Home + crumb | our-surface: derive a display name (workspace name when set; sample folders map `mount` → the sample's real name; otherwise the folder basename) in one shared helper used by `renderHome` (`screenRender.ts:205`) and the topbar crumb |
| L6 | Stray IDE keybindings beyond the removed palette/quick-open set (Cmd+B side bar, Cmd+J panel, Cmd+Shift+E/F/G/X view switches, F1 variants) | keyboard audit below | config `keybindings` where possible; the decision-30 core pattern only if a binding is core-registered and user-visible |
| L7 | Context menus on our surfaces still carry IDE items (e.g. editor-group context on screen editors) | audit | CSS-hide or contribution `when` clauses; document what remains |
| L8 | The `↗ Present` button's real behaviour unverified (possible dead-end) | review finding F21 | our-surface: either wire the existing export/present modal (ledger BO4) or label it "Soon" per the plan-17 rule until plan 26/32 makes it real |

## Iteration plan

### Iteration 1 - Title bar and window identity (L1, L2, L4)

- Add to the config-defaults block in `livingDocs.contribution.ts` (the decision-54 mechanism): `window.commandCenter: false`, `workbench.layoutControl.enabled: false`, `workbench.editor.editorActionsLocation: 'hidden'` (verify exact keys against this fork's settings registry before assuming - check `src/vs/workbench/browser/parts/titlebar/` configuration contributions).
  Anything the settings cannot reach goes to `studio.css` with a logged selector (fail-soft tier).
- Window title: set the default `window.title` template to `${rootName}${separator}Abstract`; grep the tree for remaining `Opportunity OS` strings (theme JSON name, product.json fields not covered by PR #38, sample settings) and align them.
- Gate: screen surfaces show a clean 48 px header with no command centre, no layout icons; the browser tab / window title never says Opportunity OS; before/after shots.

### Iteration 2 - Project naming (L5)

- One helper in `common/` (`projectDisplayName(workspace): string`): workspace display name if set; else folder basename; special-case the web sample mounts (`mount`, `static`) to the sample folder's own name from its first doc's frontmatter or a `.abstract-name` marker file in the sample (honest: the sample ships the marker; arbitrary folders show their real basename).
- Use it in `renderHome` (`screenRender.ts:205,227`), the topbar crumb, and the plan-22 ALL PROJECTS tiles (recent-folder labels).
- Tests: helper unit tests (workspace name, basename, mount + marker, mount without marker).
- Gate: web build Home greets with the sample's name; desktop shows the real folder name; crumb matches.

### Iteration 3 - Keyboard and menu audit (L3, L6, L7)

- Systematic audit, recorded in `33-verify/keyboard-audit.md`: walk every default chord (`Cmd+B/J/K/P/T/W`, `Cmd+Shift+B/E/F/G/H/J/M/P/U/X/Y`, F1-F12, `Ctrl+`` `) in the web build and note what each does; classify keep (typing/product), neutralise (IDE affordance), already-dead.
- Neutralise via the cheapest tier: config-level unbinding where the fork supports it; else extend the decision-30 pattern (drop the keybinding registration, keep the command) - each such change is a logged core patch with the same fail-soft note as the palette pair.
  Cap: if more than 3 new core patches would be needed, stop and record the residue in the ledger as greenfield evidence instead (the Q3 rule).
- Context menus: hide IDE items on our editor surfaces via `when` clauses/CSS; verify right-click on a screen, the doc, the rails.
- Gate: the audit doc exists with a verdict per chord; agreed neutralisations verified live; ledger updated with any core patches.

### Iteration 4 - Present honesty (L8) + the executable seam check

- Present: wire `↗ Present` to the existing Present & export modal (ledger BO4) if it still functions; otherwise a full-screen read-only render of the current doc (our webview, escape to close) - smallest honest version; "Soon"-label only as last resort.
- Seam check script: `scripts/check-seams.sh` - greps/asserts the ledger's re-pin checklist mechanically: the 5 deregistered container ids still exist upstream and remain deregistered, `ACTIVITYBAR_WIDTH === 76`, the builtin denylist ids, the palette/quick-open keybinding absence, the sash-lock call site, the `studio.css` selectors still matching (via a DOM-dump check in the web smoke run where greppable, else source-grep).
  Exit non-zero with a named seam on failure; wire it next to `valid-layers-check` in the docs' validation steps and mention it in `CLAUDE.md`'s validation section.
- Gate: script passes on `main`; deliberately break one seam locally (rename a hide-list id) and confirm it fails with the right name.

## Acceptance criteria

- [ ] Screen surfaces carry zero IDE title-bar chrome; window title and every user-visible string is Abstract. _(iters 1-2)_
- [ ] Home/crumb/tiles show truthful project names on web and desktop; helper unit-tested. _(iter 2)_
- [ ] Keyboard audit documented; agreed chords neutralised at the cheapest tier; <= 3 new core patches, all ledger-logged, else residue recorded as Q3 evidence. _(iter 3)_
- [ ] Present is real or honestly labelled; `scripts/check-seams.sh` guards every ledger seam and fails loud. _(iter 4)_
- [ ] `typecheck-client` + `valid-layers-check` + `check-seams` clean.

## Verify approach

Web :8080 sweep of all five nav surfaces + the doc editor, screenshotting each header region before/after (mirror the `25-3-sweep-*.png` naming).
Desktop pass for window-title and menu behaviour.
The keyboard audit is manual-driven via chrome-devtools key dispatch, recorded as it goes.
Ledger updates in the same PR as the change they log.
