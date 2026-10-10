# Modern UI CSS performance

Modern UI must remain **Calm** and **Focused** without making routine workbench
updates more expensive. CSS selector changes are therefore evaluated by their
style-invalidation scope, not by selector length or specificity alone.

## Audit scope

The August 2026 audit scans all 474 stylesheets under `src/` and `extensions/`,
excluding test fixtures from production findings, with additional attention to
the Modern UI modules and the editor-tab lifecycle.

| Pattern | Inventory before this work | Risk |
| --- | ---: | --- |
| `:has(...)` | 115 uses in 39 files | Descendant mutations can invalidate each matching ancestor. Risk depends on how high and how frequently mutated the subject is. |
| `[class*="..."]`, `[class^="..."]`, `[class$="..."]` | 39 production occurrences in 27 files | Any class substring selector disables Blink's per-class invalidation for the affected element, so unrelated `classList` mutations become style-recalculation candidates. |
| Root-anchored `:has(...)` | 0 | Workbench-wide invalidation. The stylelint `has-anchor-checker` rejects these selectors. |
| Active hazards in `contrib/modernUI/browser/media/` | 0 | Modern UI itself already uses explicit root/module state classes. |

This inventory deliberately does not label long selectors as slow. Browsers
match selectors right-to-left, and shortening a selector without changing its
invalidation dependencies is not a reliable optimization.

## Fixes and correctness

### Remove non-codicon class-attribute substring selectors

Class substring selectors have a disproportionate cost because they prevent the
style engine from proving that an unrelated class mutation cannot affect the
rule. A previous editor-tab fix replaced ten generated decoration-class
substring checks with the stable `.monaco-decoration-itemColor` marker and made
a full style recalculation 2.4 times faster on a 3.7k-node workbench.

This work removes the three non-codicon production uses:

- Custom-view decoration detection now uses the stable
  `.monaco-decoration-itemColor` and `.monaco-decoration-badge` markers.
- Chat placeholder styling targets Monaco's existing after-content decoration
  class, `.ced-chat-session-detail-4`.

The 36 existing codicon-family uses (33 stylesheet selectors and three rules
emitted from TypeScript) are deliberately unchanged. They are an established,
cross-cutting styling contract; changing their match set would carry broader UI
risk than this audit should take. Stylelint grandfathers those existing
`codicon-*` substring selectors while still rejecting new non-codicon substring
selectors.

The decoration markers are applied by the same resource-label path as the
generated decoration classes. Monaco's decoration-rendering tests cover the
`-4` after-content class contract.

### Triage `:has(...)` by invalidation scope

`:has(...)` is not replaced mechanically. Adding mirrored state in TypeScript
increases lifecycle coupling and can become incorrect if one mutation path
forgets to update the marker.

The audit uses this order:

1. Root/workbench subjects are forbidden.
2. Frequently mutated layout, list-row, editor-tab, and input subjects receive
   explicit state only when the DOM owner has a single source of truth.
3. Cold, bounded component selectors remain candidates until the benchmark
   shows a meaningful contribution; selector length alone is not evidence.

The Modern UI styles currently contain no active `:has(...)` selector. Existing
module classes such as `.modern-ui`, `.modern-ui-tabs`, and
`.modern-ui-compact` are toggled directly by `ModernUIContribution`.

### Remaining `:has(...)` register

The one disconnected editor-header rule was removed. The remaining 114
pseudo-class uses across 111 selector lines in 38 stylesheets (plus six rules
emitted from TypeScript) were classified as follows:

| Risk | Owners | Decision |
| --- | --- | --- |
| Hot mutation paths | Sessions split-view sashes (`sessions/browser/media/workbench.css`, 12), sessions list rows (`sessionsList.css`, 14), changes rows (`changesView.css`, 3), custom view rows (`views.css`, 5), Agent Sessions rows (`agentsessionsviewer.css`, 2), streaming Chat (`chatThinkingContent.css`, 5; `chat.css`, 10), and notebook adjacent selection rules emitted by `notebookEditorWidget.ts` (3) | Follow-up candidates. Each needs a component-owned state marker and lifecycle tests before replacement. |
| Bounded interactive widgets | Action Widget, Sessions Chat input/view/widget, mobile Chat input, automation cards, Browser View, Chat debug/models/voice/dictation/feedback/code-block/confirmation/model-picker/context-usage/tunnel widgets, multi-file diff, issue reporter, and notebook toolbar | Retain until a component trace shows measurable cost. Their invalidation subject is local, while mirrored state would add mutation paths. |
| Cold or structural content | Rendered Markdown task items (1), phone/sidebar/mobile shell layout (10), account/automation/banner/blocked-session structure (4), command-center compact layout (3), surveys (6), and release-note webview rules emitted by `releaseNotesEditor.ts` (3) | Retain. These are constructed or configured infrequently and do not contribute to the measured Modern UI tab/resize workload. |

## Performance test suite

The workbench CSS benchmark runs an isolated Code OSS window with Modern UI
enabled and repeats these phases after a warmup:

1. resize the workbench through alternating wide and narrow viewport sizes;
2. toggle unreferenced probe classes on codicons, file icons, and editor labels,
   forcing style resolution after each mutation;
3. open a batch of editors;
4. switch among editor tabs;
5. close and reopen editor tabs;
6. toggle the primary side bar and panel.

Each phase records wall-clock latency and Chromium `Performance.getMetrics`
deltas, including `RecalcStyleDuration`, `LayoutDuration`,
`RecalcStyleCount`, and `LayoutCount`. Runs write `summary.json` and checkpoint
screenshots. Before/after comparisons use the same build mode, workspace,
profile, window sizes, iteration count, and operation order.

Run it from the repository root:

```bash
npm run perf:css -- \
  --skip-prelaunch \
  --output .build/css-performance/run
```

The runner always transpiles the selected checkout before launch.
`summary.json` records the commit plus a content hash when tracked or untracked
inputs are dirty, preventing stale or unidentified builds from being compared.

Because desktop scheduling noise is significant, conclusions use the median of
at least five measured rounds after warmup. Counts verify that the scenario did
the same work; duration improvements are reported separately from count
changes.

## Acceptance criteria

- No non-codicon class-attribute substring selector remains in production CSS.
- Stylelint rejects new non-codicon class-attribute substring selectors.
- Modern UI and editor-tab browser tests preserve active, inactive, hover,
  decorated-label, pinned, dirty, and high-contrast behavior.
- The benchmark completes every phase with the expected editor and layout state.
- Before/after results include raw summaries and median deltas; regressions or
  statistically inconclusive phases are reported rather than hidden.

## August 2026 results

After restoring every codicon-related change, the final comparison bracketed
the optimized run between two clean `ade8c08f496` baseline runs. Each build used
the same Electron binary, settings, workspace, operation order, three warmup
rounds, and nine measured rounds. The baseline columns below are the mean of the
two surrounding baseline medians.

| Phase | Median style recalculation before | After | Change | Median wall-clock change |
| --- | ---: | ---: | ---: | ---: |
| Unreferenced class mutations | 202.56 ms | 186.98 ms | -7.7% | -10.2% |
| Resize | 167.25 ms | 157.95 ms | -5.6% | -7.8% |
| Open tabs | 24.80 ms | 21.68 ms | -12.6% | -16.4% |
| Switch tabs | 128.83 ms | 121.73 ms | -5.5% | -13.7% |
| Close tabs | 21.15 ms | 21.63 ms | +2.3% | -4.5% |
| Toggle side bar/panel | 65.61 ms | 59.00 ms | -10.1% | -12.7% |

These are observed timings, not claimed causal gains. The targeted mutation
phase's style-recalculation count did not improve (90.5 baseline average versus
92 optimized), because the codicon substring contract remains. The lower
durations therefore overlap with host-load drift seen during repeated desktop
runs. The safe conclusion is that restoring the codicon selectors removes the
previously measured 99.2% targeted style-recalculation improvement; the retained
non-codicon fixes have no statistically isolated benefit in this workbench
scenario.
