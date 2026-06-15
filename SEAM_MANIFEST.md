# Seam manifest — agent-aware terminal selector

> The honest, checked-in accounting of **every upstream line this fork touches.**
> Governing contract: **AX-TERMINAL-AGENT-TABS**. On every rebase, re-apply and
> re-verify each row below; nothing outside this list may edit an upstream file.
> See [`docs/REBASE_RUNBOOK.md`](docs/REBASE_RUNBOOK.md) and the source plan
> `agent-terminal-selector-implementation-plan.md`.

Base: upstream `microsoft/vscode` `main` (synced; pin to a release tag such as
`1.124.2` for the patch stack — see the runbook).

---

## Upstream files edited: **1**

### `src/vs/workbench/contrib/terminal/browser/terminalView.ts`  (~10 insertions, 3 deletions)

| # | Location | Change | Why |
|---|---|---|---|
| 1 | after the `TerminalTabbedView` import (line ~31) | add 3 imports: `ITerminalTabsView`, `AgentTerminalTabbedView`, `TerminalAgentTabsSettingId` (all from `./agentTabs/…`) | bring the seam interface, the alternate view, and the flag id into scope |
| 2 | field + public getter `_terminalTabbedView` / `terminalTabbedView` (lines ~59–60) | retype `TerminalTabbedView` → `ITerminalTabsView` | let the pane hold *either* view; the public getter's only external consumers (`terminalGroupService.ts`, `terminalEditingService.ts`) call `focusTabs()`, `focusHover()`, `setEditable()` — all covered by the interface |
| 3 | `_createTabsView()` `createInstance` call (line ~241) | branch on `terminal.integrated.agentTabs.enabled`: flag-on → `AgentTerminalTabbedView`, flag-off → stock `TerminalTabbedView` | the actual swap; flag-off path is byte-identical to upstream |

**Rebase risk:** low–med. `terminalView.ts` changes occasionally, but the three
edits are localized and the flag is a fallback. This is the only commit that can
conflict on rebase (the "seam" commit).

### Why no second upstream edit (no barrel import)

The plan budgeted for an optional one-line import in a contribution barrel to pull
the self-registering flag into the module graph. It proved unnecessary:
`terminal.contribution.ts` already statically imports `TerminalViewPane`
(`terminalView.js`), which now statically imports `agentTabsContribution.js` for
the flag id — so the configuration registers eagerly at workbench startup through
the existing import chain. Upstream footprint is therefore a **single file**.

---

## New files (zero conflict surface — upstream has never seen them)

All under `src/vs/workbench/contrib/terminal/browser/agentTabs/`:

| File | Role |
|---|---|
| `ITerminalTabsView.ts` | the seam interface; includes a compile-time assertion that the stock `TerminalTabbedView` satisfies it **structurally** (so we never edit `terminalTabbedView.ts`) |
| `agentTerminalSelectorRows.ts` | pure, dependency-free merge/de-dupe/sectioning logic — unit-tested without a build |
| `agentTerminalSelectorModel.ts` | DOM-free model: single consumer of `ITerminalGroupService` + `ITerminalChatService`, fans their events into one `onDidChange`, delegates to the pure rows logic |
| `agentTerminalTabbedView.ts` | Phase-2 skeleton view (`implements ITerminalTabsView`) that renders the merged, sectioned rows |
| `agentTabsContribution.ts` | self-registering experimental flag `terminal.integrated.agentTabs.enabled` (default `false`) |
| `test/agentTerminalSelectorModel.test.ts` | red→green unit test for the merge logic (`node --test`) |

Supporting (repo root / tooling), also new files:

| File | Role |
|---|---|
| `scripts/sync-upstream.sh` | wire `upstream`, fetch, report the next rebase target |
| `scripts/verify-seam.sh` | binary guard: flag defaults off + flag-off path uses the stock view |
| `docs/REBASE_RUNBOOK.md` | the "kept in sync" methodology |
| `.github/workflows/upstream-sync.yml` *(lives on `main`, not this PR — kept out so the inherited engineering-system guard passes; see AX-WORKFLOW-UPSTREAM-SYNC)* | CI: rebase the patch stack onto upstream tags and run the fast checks |

---

## Verification

```bash
scripts/verify-seam.sh                                   # seam guard — exits 0 (no build needed)
# Unit test (merge/de-dupe/sectioning logic). The test file follows the VS Code
# `.js`-import convention so it builds with the rest of src/; run it from out/:
npm run compile   # or the watch task; produces out/
node --test out/vs/workbench/contrib/terminal/browser/agentTabs/test/agentTerminalSelectorModel.test.js
```

The remaining risk is **interface drift** in `ITerminalGroupService` /
`ITerminalChatService` (a *compile* error, not a silent conflict) — caught by the
full `npm run compile` in CI on each upstream tag.
