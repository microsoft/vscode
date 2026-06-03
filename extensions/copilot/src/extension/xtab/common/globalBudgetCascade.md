# Global Budget Cascade — Specification

This document specifies the opt-in single-pool token budget that allocates tokens
across NES/xtab prompt parts.

Implementation: [`runGlobalBudgetCascade`](./promptCrafting.ts) in this folder.
Types: [`GlobalBudgetOptions`](../../../platform/inlineEdits/common/dataTypes/xtabPromptOptions.ts).

## Motivation

By default, each prompt part has its own per-part `maxTokens` cap. Caps are
configured conservatively to fit a worst-case combined prompt, which means a
part is capped even when other parts are unused or near-empty. The cascade lets
unused budget in earlier parts donate to later parts, modeled after the
`CascadingPromptFactory` design in completions-core.

The cascade is **opt-in**. When `PromptOptions.globalBudget` is `undefined`,
`getUserPrompt` takes the legacy path and per-part caps apply.

## Scope

### Parts that participate

`GlobalBudgetPart` includes only:

- `recentlyViewedDocuments`
- `languageContext`
- `neighborFiles`
- `diffHistory`

### Parts intentionally excluded

| Part | Why |
|---|---|
| `currentFile` | Essential context for every prediction; allowing donation to/from it would either bloat the prompt or starve the most important section. Keeps its own cap (`currentFile.maxTokens`) and is clipped independently around the cursor by `createTaggedCurrentFileContentUsingPagedClipping`. |
| `lintOptions` | Optional, formatted separately, and small. Keeps its own per-part shape. |

## Inputs

| Input | Description |
|---|---|
| `globalBudget.totalTokens` | The single pool size. Default `6000`. Configurable via experiment `chat.advanced.inlineEdits.xtabProvider.globalBudget.totalTokens`. |
| `globalBudget.order` | Ordered list of parts. Earlier parts get budget first; their surplus flows to later parts. |
| `globalBudget.shares` | `Record<GlobalBudgetPart, number>`. Each part's fraction of `totalTokens`. Must sum to `1 ± 1e-3` across `order`. |

### Defaults

`GlobalBudgetOptions.DEFAULT_ORDER`:

```
['languageContext', 'recentlyViewedDocuments', 'neighborFiles', 'diffHistory']
```

`GlobalBudgetOptions.DEFAULT_SHARES` (volume-neutral with today's per-part caps):

| Part | Share |
|---|---|
| `recentlyViewedDocuments` | 2/6 |
| `languageContext` | 2/6 |
| `neighborFiles` | 1/6 |
| `diffHistory` | 1/6 |

`GlobalBudgetOptions.DEFAULT_TOTAL_TOKENS` = `6000`.

The default order places `languageContext` first because it is often disabled
or empty, donating its share to the always-on `recentlyViewedDocuments` next in
line.

## Algorithm

```
surplus ← 0
for part in order:
    budget   ← max(0, floor(surplus + totalTokens * shares[part]))
    consumed ← runSubBuilder(part, maxTokens: budget)   // sub-builder ≤ budget
    surplus  ← max(0, budget - consumed)                // → next part only
```

Notes:

- The cascade calls the existing sub-builder for each part, overriding only its
  `maxTokens` (other options are inherited from `opts`):
  - `recentlyViewedDocuments` → `buildCodeSnippetsUsingPagedClipping`
  - `languageContext` → `appendLanguageContextSnippets`
  - `neighborFiles` → `appendNeighborFileSnippets`
  - `diffHistory` → `getEditDiffHistory`
- Behavior of each sub-builder is unchanged.
- Each sub-builder returns `tokensConsumed` using the **same internal accounting**
  it uses to make budget decisions (paged-clipping line cost for recently-viewed,
  raw-snippet cost for appenders, per-entry diff cost for diff history). Using
  that reported value to compute `surplus` keeps the cascade aligned with how
  each part actually charges against its budget.
- `surplus` is **forward-only**. Unused tokens at the *last* part are lost — the
  cascade does not back-flow to earlier parts.

### Document tracking

The cascade seeds `docsInPrompt` with the active document, and the
`recentlyViewedDocuments` step adds the documents it includes. `neighborFiles`
reads this set to avoid duplicating files already present, and then `appendNeighborFileSnippets`
adds each included neighbor document to the set as well. This dependency is
why `validateGlobalBudget` rejects orderings where `neighborFiles` precedes
`recentlyViewedDocuments`.

The accumulated `docsInPrompt` is then passed to `getEditDiffHistory`, so any
later changes to which documents are present can affect diff selection when
`diffHistory.onlyForDocsInPrompt` is enabled (the diff step only emits entries
whose document is in `docsInPrompt`).

### Output

The cascade's output mirrors the legacy `getRecentCodeSnippets` shape so the
rest of `getUserPrompt` is identical:

```
{
    codeSnippets,              // recentlyViewed + langCtx + neighbor joined by "\n\n"
    documents,                 // docsInPrompt
    neighborSnippetsResult,    // unchanged telemetry payload
    editDiffHistory,
    nDiffsInPrompt,
    diffTokensInPrompt,
}
```

## Guarantees and limits

With `totalTokens = T` and shares `s_i` (assumed non-negative; negative shares
would be clamped to 0 by `max(0, floor(…))` in the budget computation, so the
floor guarantee below would not hold for them):

- **Per-part floor**: part at index `i` always receives at least `floor(T * s_i)`
  tokens, regardless of what earlier parts do.
- **Per-part ceiling**: part at index `i` can receive at most the running
  floored sum `floor(…floor(floor(T * s_0) + T * s_1) + … + T * s_i)` — its own
  share plus everything donated by earlier parts, with `floor` applied at every
  step. Note this is generally smaller than `floor(T * (s_0 + … + s_i))`.
- **Pool ceiling**: total cascade-managed tokens ≤ the ceiling of the last part
  (always ≤ `T`, and typically strictly less due to per-step `floor` rounding).
  `currentFile` and lint live outside this budget and add to the final prompt
  size.
- **No back-flow**: surplus at the last part is wasted.
- **No intra-part fairness**: a single large item inside one part can consume
  that part's entire allocation; the cascade only addresses cross-part donation.

## Validation

`validateGlobalBudget` runs at the start of every cascade invocation and throws
on misconfiguration. The config is runtime-tunable (experiments), so failing
loudly is preferable to silent under/over-allocation.

| Rule | Error |
|---|---|
| `order` has no duplicate parts | `globalBudget.order contains duplicate part 'X'` |
| Every part in `order` has a numeric `shares[part]` | `globalBudget.shares is missing entry for 'X'` |
| If both present, `recentlyViewedDocuments` precedes `neighborFiles` | `globalBudget.order must place 'recentlyViewedDocuments' before 'neighborFiles'` |
| Sum of `shares[part]` for parts in `order` ≈ 1 (epsilon `1e-3`) | `globalBudget.shares across order must sum to ~1, got ${sharesSum}` |

## Wiring

The cascade is enabled via `ConfigKey.TeamInternal.InlineEditsXtabGlobalBudgetEnabled`
in `xtabProvider.ts` (~L1444):

```ts
globalBudget: globalBudgetEnabled
    ? {
        totalTokens: configService.getExperimentBasedConfig(InlineEditsXtabGlobalBudgetTotalTokens, expService),
        order: GlobalBudgetOptions.DEFAULT_ORDER,
        shares: GlobalBudgetOptions.DEFAULT_SHARES,
    }
    : undefined,
```

Experiment-controlled settings:

| Setting | Default | Purpose |
|---|---|---|
| `chat.advanced.inlineEdits.xtabProvider.globalBudget.enabled` | `false` | Master switch |
| `chat.advanced.inlineEdits.xtabProvider.globalBudget.totalTokens` | `6000` | Pool size |

## Worked examples

All examples use `DEFAULT_ORDER`, `DEFAULT_SHARES`, and `totalTokens = 5000`.

Base allocations: `floor(5000 * share)` per part →

| Part | Base allocation |
|---|---|
| `languageContext` | 1666 |
| `recentlyViewedDocuments` | 1666 |
| `neighborFiles` | 833 |
| `diffHistory` | 833 |

Sum = 4998 (2 tokens lost to per-step `floor`).

### Example A — `languageContext` disabled; recently-viewed wants a lot

| Part | surplus in | budget | consumed | surplus out |
|---|---|---|---|---|
| `languageContext` | 0 | 1666 | 0 | 1666 |
| `recentlyViewedDocuments` | 1666 | 3332 | 3332 | 0 |
| `neighborFiles` | 0 | 833 | 500 | 333 |
| `diffHistory` | 333 | 1166 | 1166 | 0 |

Tokens placed: 0 + 3332 + 500 + 1166 = **4998**. The disabled language-context
share doubled what recently-viewed got.

### Example B — modest language context; large single recently-viewed file; no neighbors

| Part | surplus in | budget | consumed | surplus out |
|---|---|---|---|---|
| `languageContext` | 0 | 1666 | 800 | 866 |
| `recentlyViewedDocuments` | 866 | 2532 | 2532 | 0 |
| `neighborFiles` | 0 | 833 | 0 | 833 |
| `diffHistory` | 833 | 1666 | 1500 | 166 (wasted) |

Tokens placed: 800 + 2532 + 0 + 1500 = **4832**. The trailing 166 from the last
part is lost (no back-flow).

### Example C — everything modest

| Part | surplus in | budget | consumed | surplus out |
|---|---|---|---|---|
| `languageContext` | 0 | 1666 | 400 | 1266 |
| `recentlyViewedDocuments` | 1266 | 2932 | 1500 | 1432 |
| `neighborFiles` | 1432 | 2265 | 900 | 1365 |
| `diffHistory` | 1365 | 2198 | 600 | 1598 (wasted) |

Tokens placed: 400 + 1500 + 900 + 600 = **3400**. Each later part received a
generous inflated cap but had no material to fill it.

### Example D — large `languageContext`, no donation

| Part | surplus in | budget | consumed | surplus out |
|---|---|---|---|---|
| `languageContext` | 0 | 1666 | 1666 | 0 |
| `recentlyViewedDocuments` | 0 | 1666 | 1500 | 166 |
| `neighborFiles` | 166 | 999 | 900 | 99 |
| `diffHistory` | 99 | 932 | 800 | 132 (wasted) |

Tokens placed: 1666 + 1500 + 900 + 800 = **4866**. Each part stayed at or below
its floor; nothing was starved.

## Disabled parts

Parts can be disabled by configuration (`languageContext.enabled = false`,
`neighborFiles.enabled = false`) or by having no input data (e.g. no language-
context response, empty neighbor snippets, no edit history). Those parts remain
in `order` — the wired-in code always uses `DEFAULT_ORDER`/`DEFAULT_SHARES` — so
their slot still runs, just with `consumed = 0`, and their full share donates
forward.

### Effective caps when both `languageContext` and `neighborFiles` are off

With `DEFAULT_ORDER` and pool `T`, applying the per-step floor at every donation
step (let `C_rv = floor(floor(T·2/6) + T·2/6)` be the effective cap on
recently-viewed):

| Part | Effective cap |
|---|---|
| `languageContext` | 0 (consumed) |
| `recentlyViewedDocuments` | `C_rv` (own 2/6 + langCtx's 2/6, with per-step `floor`) |
| `neighborFiles` | 0 (consumed) |
| `diffHistory` | `floor(floor((C_rv − consumed_rv) + T·1/6) + T·1/6)` (own 1/6 + neighbors' 1/6 + recently-viewed's leftover, with per-step `floor`) |

At `T = 5000` (so `C_rv = floor(1666 + 1666.666…) = 3332` and the total
cascade pool ceiling is `floor(floor(3332 + 833.333…) + 833.333…) = 4998`,
not `5000`, because of per-step flooring):

| `recentlyViewedDocuments` consumed | `diffHistory` cap |
|---|---|
| 3332 (fills cap) | 1666 |
| 1500 | 3498 |
| 0 | 4998 (whole cascade pool) |

Worked example with both enabled parts hungry at `T = 5000`:

| Part | surplus in | budget | consumed | surplus out |
|---|---|---|---|---|
| `languageContext` | 0 | 1666 | 0 | 1666 |
| `recentlyViewedDocuments` | 1666 | 3332 | 3332 | 0 |
| `neighborFiles` | 0 | 833 | 0 | 833 |
| `diffHistory` | 833 | 1666 | 1666 | 0 |

Total placed: **4998**. Recently-viewed absorbs langCtx's donation; diff history
absorbs neighbors' donation. Nothing is permanently wasted unless the *last*
part (`diffHistory`) also under-fills its budget — diff's surplus has no next
part to flow to.

### Ordering caveat

`recentlyViewedDocuments` has **first claim** on the donation pool from
`languageContext` because it sits earlier in `order`. If recently-viewed is
hungry, diff history only sees `neighbors' 1/6 + own 1/6 = 2/6` (1666 at
`T = 5000`) — it cannot reach `languageContext`'s share directly.

To make diff history share the donation, you would need to either reorder so
`diffHistory` precedes `recentlyViewedDocuments`, or rebalance `shares`. The
ordering must still satisfy the validation rule that `recentlyViewedDocuments`
precedes `neighborFiles` (because `neighborFiles` consults `docsInPrompt`
populated by recently-viewed).

A deployment could alternatively **remove** disabled parts from `order` and
rebalance `shares` to sum to 1 — the donation would then be baked in statically
rather than emerging from the cascade. The wired-in code does not do this; it
always passes `DEFAULT_ORDER` and `DEFAULT_SHARES`.

## Composition with `currentFile`

`currentFile` is sized **outside** the cascade by
`createTaggedCurrentFileContentUsingPagedClipping`, which clips around the
cursor / edit window up to `currentFile.maxTokens`. The clipped string is
passed into `getUserPrompt` via `taggedCurrentDocLines` and concatenated
between the cascade-managed `recent_files` and `edit_history` blocks. The
cascade never sees nor influences current-file sizing.

Final prompt size ≈ `currentFile.maxTokens` + ≤ `totalTokens` (cascade) +
lint + tags/scaffolding + postscript.
