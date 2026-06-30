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

### Parts rendered by the cascade

`GlobalBudgetPart` (the parts listed in `order` and emitted by the cascade loop)
includes only:

- `recentlyViewedDocuments`
- `languageContext`
- `neighborFiles`
- `diffHistory`

### Parts that draw a share but are not rendered by the cascade

`currentFile` participates in the **allocation** (`shares`) but not in the
**render order** (`order`). It is clipped outside the cascade, around the cursor,
to its share of the pool; whatever it leaves unused seeds the cascade's initial
surplus and so donates to the first part in `order`. The set of parts that get a
`shares` entry is `GlobalBudgetSharePart = GlobalBudgetPart | 'currentFile'`.

| Part | How it relates to the pool |
| --- | --- |
| `currentFile` | Sized from the pool: clipped to `floor(totalTokens * shares.currentFile)` around the cursor / edit window by `createTaggedCurrentFileContentUsingPagedClipping` (the clip cap `currentFile.maxTokens` is overridden with that pool budget in `xtabProvider`). Its leftover seeds the cascade as `initialSurplus`. It is **not** in `order`, so the cascade loop never renders it. When `globalBudget` is `undefined` it falls back to its own `currentFile.maxTokens` cap and donates nothing. |
| `lintOptions` | Optional, formatted separately, and small. Excluded entirely — no `shares` entry. Keeps its own per-part shape. |

## Inputs

| Input | Description |
| --- | --- |
| `globalBudget.totalTokens` | The single pool size. Default `8000`. Set via the `totalTokens` field of the experiment JSON string `chat.advanced.inlineEdits.xtabProvider.globalBudget`. |
| `globalBudget.order` | Ordered list of **rendered** parts. Earlier parts get budget first; their surplus flows to later parts. `currentFile` is not listed here. |
| `globalBudget.shares` | `Record<GlobalBudgetSharePart, number>` — one fraction of `totalTokens` per rendered part **and** for `currentFile`. Must sum to `1 ± 1e-3` across `order` plus `currentFile`. |

### Defaults

`GlobalBudgetOptions.DEFAULT_ORDER`:

```javascript
['languageContext', 'recentlyViewedDocuments', 'neighborFiles', 'diffHistory']
```

`GlobalBudgetOptions.DEFAULT_SHARES` (volume-neutral with today's per-part caps):

| Part | Share | Base budget at `totalTokens = 8000` |
| --- | --- | --- |
| `currentFile` | 2/8 | 2000 |
| `recentlyViewedDocuments` | 2/8 | 2000 |
| `languageContext` | 2/8 | 2000 |
| `neighborFiles` | 1/8 | 1000 |
| `diffHistory` | 1/8 | 1000 |

`GlobalBudgetOptions.DEFAULT_TOTAL_TOKENS` = `8000`.

These shares reproduce today's per-part caps exactly: `currentFile.maxTokens` 2000,
`recentlyViewedDocuments` 2000, `languageContext` 2000, `neighborFiles` 1000,
`diffHistory` 1000. The pool grew from `6000` to `8000` to fold in `currentFile`'s
2000 without shrinking any rendered part's base allocation.

The default order places `languageContext` first because it is often disabled
or empty, donating its share (and any `currentFile` surplus seeded ahead of it)
to the always-on `recentlyViewedDocuments` next in line.

`GlobalBudgetOptions.currentFileBudget(gb)` returns \`floor(totalTokens \*
shares.currentFile)\` — the single source of truth used both to override the
current-file clip cap and (after clipping) to derive the seeded surplus.

## Algorithm

```javascript
surplus ← initialSurplus           // currentFile's leftover from its pool clip (0 when no global budget governs it)
for part in order:
    budget   ← max(0, floor(surplus + totalTokens * shares[part]))
    consumed ← runSubBuilder(part, maxTokens: budget)   // sub-builder ≤ budget
    surplus  ← max(0, budget - consumed)                // → next part only
```

Notes:

- `initialSurplus` is computed by the caller that clips `currentFile` (the main
  NES path in `xtabProvider`): \`max(0, currentFileBudget(gb) − tokens(clipped
  current file))\`. Callers that don't pool-budget the current file (the legacy
  path, and the next-cursor predictor which keeps its own current-file cap) pass
  `0`, so the cascade is byte-identical to a zero seed there.
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
  cascade does not back-flow to earlier parts. `currentFile`'s surplus only
  reaches the first part in `order` (and beyond, if that part under-fills).

### Document tracking

The cascade seeds `docsInPrompt` with the active document, and the
`recentlyViewedDocuments` step adds the documents it includes. `neighborFiles`
reads this set to avoid duplicating files already present, and then `appendNeighborFileSnippets`
adds each included neighbor document to the set as well. This dependency is
why `GlobalBudgetOptions.validate` rejects orderings where `neighborFiles` precedes
`recentlyViewedDocuments`.

The accumulated `docsInPrompt` is then passed to `getEditDiffHistory`, so any
later changes to which documents are present can affect diff selection when
`diffHistory.onlyForDocsInPrompt` is enabled (the diff step only emits entries
whose document is in `docsInPrompt`).

### Output

The cascade's output mirrors the legacy `getRecentCodeSnippets` shape so the
rest of `getUserPrompt` is identical:

```javascript
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
  `currentFile` draws its own `floor(T * shares.currentFile)` slice from the pool
  (clipped externally) and may donate leftover *into* the cascade as the initial
  surplus; lint lives entirely outside the budget. So the rendered prompt is
  bounded by `T` (current file + cascade parts) plus lint and scaffolding.
- **No back-flow**: surplus at the last part is wasted.
- **No intra-part fairness**: a single large item inside one part can consume
  that part's entire allocation; the cascade only addresses cross-part donation.

## Validation

`GlobalBudgetOptions.validate` runs at the start of every cascade invocation (and
again in `xtabProvider` before the current-file clip) and throws on
misconfiguration. The config is runtime-tunable (experiments), so failing loudly
is preferable to silent under/over-allocation.

| Rule | Error |
| --- | --- |
| `order` has no duplicate parts | `globalBudget.order contains duplicate part 'X'` |
| Every part in `order` has a numeric `shares[part]` | `globalBudget.shares is missing entry for 'X'` |
| `shares.currentFile` is a number | `globalBudget.shares is missing entry for 'currentFile'` |
| If both present, `recentlyViewedDocuments` precedes `neighborFiles` | `globalBudget.order must place 'recentlyViewedDocuments' before 'neighborFiles'` |
| Sum of `shares[part]` for parts in `order` plus `shares.currentFile` ≈ 1 (epsilon `1e-3`) | `globalBudget.shares across order must sum to ~1, got ${sharesSum}` |

## Wiring

The cascade is configured by a **single experiment-driven JSON string**,
`ConfigKey.TeamInternal.InlineEditsXtabGlobalBudget`, modelled after
`modelConfigurationString`. `xtabProvider.ts` (`getGlobalBudget()`) reads it and
parses it with `GlobalBudgetOptions.fromConfigString`:

```ts
private getGlobalBudget(): GlobalBudgetOptions | undefined {
    const configString = configService.getExperimentBasedConfig(InlineEditsXtabGlobalBudget, expService);
    if (!configString) {
        return undefined; // unset/empty → disabled, identical to prod
    }
    const result = GlobalBudgetOptions.fromConfigString(configString);
    if (result.isError()) {
        telemetryService.sendMSFTTelemetryEvent('incorrectNesGlobalBudgetConfig', { errorMessage: result.err, configValue: configString });
        return undefined; // bad config → disabled, never crashes
    }
    return result.val;
}
```

The JSON value defines all three knobs together — `totalTokens`, `order`, and
`shares` — and every field is optional. Omitted fields fall back to
`DEFAULT_TOTAL_TOKENS` / `DEFAULT_ORDER` / `DEFAULT_SHARES`, so:

- `undefined` / unset / `""` → global budget **disabled** (prod default, byte-identical legacy path).
- `{}` → **enabled** with the volume-neutral defaults.
- `{"totalTokens":6000}` → enabled, only the pool size overridden.
- `{"totalTokens":12000,"order":[…],"shares":{…}}` → fully custom.

`fromConfigString` structurally validates the JSON (via `GlobalBudgetOptions.VALIDATOR`),
merges it over the defaults, then runs the semantic `GlobalBudgetOptions.validate`
(see [Validation](#validation)); any parse, structural, or semantic failure
returns a `Result.error` and disables the budget. When `shares` is provided it
must list **every** part (the rendered parts plus `currentFile`) — partial
`shares` objects are rejected so the pool stays fully allocated.

When the budget is enabled, `xtabProvider` also overrides the current-file clip
cap with `currentFileBudget(globalBudget)` before clipping, and feeds the leftover
into the cascade as `initialSurplus`.

Experiment-controlled settings:

| Setting | Default | Purpose |
| --- | --- | --- |
| `chat.advanced.inlineEdits.xtabProvider.globalBudget` | `undefined` | JSON string defining `totalTokens`, `order`, and `shares`; unset/empty disables the budget |

> **Migration note:** the old `globalBudget.enabled` (boolean) and
> `globalBudget.totalTokens` (number) settings have been **replaced** by this
> single JSON string. Any live experiment treatment that pinned those keys must
> migrate: `enabled:true` + `totalTokens:N` becomes the JSON `{"totalTokens":N}`,
> and a bare `enabled:true` becomes `{}`. Because `totalTokens` also funds
> `currentFile`, treatments that pinned the old `6000` should move to `8000`
> (or `{}`) to stay volume-neutral.

## Worked examples

All examples use `DEFAULT_ORDER`, `DEFAULT_SHARES`, and `totalTokens = 8000`.

Base allocations: `floor(8000 * share)` per part →

| Part | Base allocation |
| --- | --- |
| `currentFile` (pre-cascade, clipped externally) | 2000 |
| `languageContext` | 2000 |
| `recentlyViewedDocuments` | 2000 |
| `neighborFiles` | 1000 |
| `diffHistory` | 1000 |

Sum = 8000. The `currentFile` row is clipped before the cascade runs; whatever it
leaves unused becomes the cascade's `initialSurplus` (shown as the first
`surplus out`). The cascade itself iterates only the four rendered parts.

### Example A — small current file donates; `languageContext` disabled; recently-viewed wants a lot

| Part | surplus in | budget | consumed | surplus out |
| --- | --- | --- | --- | --- |
| `currentFile` (pre-cascade) | — | 2000 | 1200 | 800 |
| `languageContext` | 800 | 2800 | 0 | 2800 |
| `recentlyViewedDocuments` | 2800 | 4800 | 4800 | 0 |
| `neighborFiles` | 0 | 1000 | 500 | 500 |
| `diffHistory` | 500 | 1500 | 1500 | 0 |

Tokens placed: 1200 (current file) + 0 + 4800 + 500 + 1500 = **8000**. The current
file's 800 leftover plus the disabled language-context share both flowed into
recently-viewed.

### Example B — current file fills its budget (no donation); modest language context; large recently-viewed; no neighbors

| Part | surplus in | budget | consumed | surplus out |
| --- | --- | --- | --- | --- |
| `currentFile` (pre-cascade) | — | 2000 | 2000 | 0 |
| `languageContext` | 0 | 2000 | 800 | 1200 |
| `recentlyViewedDocuments` | 1200 | 3200 | 3200 | 0 |
| `neighborFiles` | 0 | 1000 | 0 | 1000 |
| `diffHistory` | 1000 | 2000 | 1800 | 200 (wasted) |

Tokens placed: 2000 + 800 + 3200 + 0 + 1800 = **7800**. The current file used its
whole share, so the cascade seed was 0; the trailing 200 from the last part is
lost (no back-flow).

### Example C — everything modest; large current-file donation

| Part | surplus in | budget | consumed | surplus out |
| --- | --- | --- | --- | --- |
| `currentFile` (pre-cascade) | — | 2000 | 500 | 1500 |
| `languageContext` | 1500 | 3500 | 400 | 3100 |
| `recentlyViewedDocuments` | 3100 | 5100 | 1500 | 3600 |
| `neighborFiles` | 3600 | 4600 | 900 | 3700 |
| `diffHistory` | 3700 | 4700 | 600 | 4100 (wasted) |

Tokens placed: 500 + 400 + 1500 + 900 + 600 = **3900**. Each later part received a
generous inflated cap (boosted by the current file's 1500 donation) but had no
material to fill it.

### Example D — large `languageContext`, current file full (no donation)

| Part | surplus in | budget | consumed | surplus out |
| --- | --- | --- | --- | --- |
| `currentFile` (pre-cascade) | — | 2000 | 2000 | 0 |
| `languageContext` | 0 | 2000 | 2000 | 0 |
| `recentlyViewedDocuments` | 0 | 2000 | 1500 | 500 |
| `neighborFiles` | 500 | 1500 | 900 | 600 |
| `diffHistory` | 600 | 1600 | 800 | 800 (wasted) |

Tokens placed: 2000 + 2000 + 1500 + 900 + 800 = **7200**. Each part stayed at or
below its floor; nothing was starved.

## Disabled parts

Parts can be disabled by configuration (`languageContext.enabled = false`,
`neighborFiles.enabled = false`) or by having no input data (e.g. no language-
context response, empty neighbor snippets, no edit history). Those parts remain
in `order` — the wired-in code always uses `DEFAULT_ORDER`/`DEFAULT_SHARES` — so
their slot still runs, just with `consumed = 0`, and their full share donates
forward. `currentFile` is never "disabled" this way: it is always clipped, and a
near-empty file simply donates more of its share as the initial surplus.

### Effective caps when both `languageContext` and `neighborFiles` are off

With `DEFAULT_ORDER` and pool `T`, applying the per-step floor at every donation
step (let `S0` be the current file's seeded surplus and \`C\_rv = floor(floor(S0 +
T·2/8) + T·2/8)\` be the effective cap on recently-viewed):

| Part | Effective cap |
| --- | --- |
| `languageContext` | 0 (consumed) |
| `recentlyViewedDocuments` | `C_rv` (current-file seed + langCtx's 2/8 + own 2/8, with per-step `floor`) |
| `neighborFiles` | 0 (consumed) |
| `diffHistory` | `floor(floor((C_rv − consumed_rv) + T·1/8) + T·1/8)` (own 1/8 + neighbors' 1/8 + recently-viewed's leftover, with per-step `floor`) |

At `T = 8000` with a fully consumed current file (`S0 = 0`, so \`C\_rv = floor(2000
+ 2000) = 4000 `and the total cascade pool ceiling is` floor(floor(4000 + 1000) +
1000) = 6000\`):

| `recentlyViewedDocuments` consumed | `diffHistory` cap |
| --- | --- |
| 4000 (fills cap) | 2000 |
| 1500 | 4500 |
| 0 | 6000 (whole cascade pool) |

Worked example with both enabled parts hungry at `T = 8000` and a full current file (`S0 = 0`):

| Part | surplus in | budget | consumed | surplus out |
| --- | --- | --- | --- | --- |
| `currentFile` (pre-cascade) | — | 2000 | 2000 | 0 |
| `languageContext` | 0 | 2000 | 0 | 2000 |
| `recentlyViewedDocuments` | 2000 | 4000 | 4000 | 0 |
| `neighborFiles` | 0 | 1000 | 0 | 1000 |
| `diffHistory` | 1000 | 2000 | 2000 | 0 |

Cascade placed: **6000** (+ 2000 current file = 8000). Recently-viewed absorbs
langCtx's donation; diff history absorbs neighbors' donation. Nothing is
permanently wasted unless the *last* part (`diffHistory`) also under-fills its
budget — diff's surplus has no next part to flow to.

### Ordering caveat

`recentlyViewedDocuments` has **first claim** on the donation pool (the current
file's seed plus `languageContext`'s share) because it sits earlier in `order`.
If recently-viewed is hungry, diff history only sees \`neighbors' 1/8 + own 1/8 =
2/8 `(2000 at` T = 8000`) — it cannot reach the seed or` languageContext\`'s share
directly.

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

`currentFile` is sized from the pool but clipped **outside** the cascade by
`createTaggedCurrentFileContentUsingPagedClipping`, which clips around the
cursor / edit window. Under a global budget, `xtabProvider` overrides the clip
cap with \`currentFileBudget(globalBudget) = floor(totalTokens \*
shares.currentFile) `(instead of the standalone` currentFile.maxTokens\`), then
computes the leftover `max(0, currentFileBudget − tokens(clipped current file))`
and threads it into `getUserPrompt` as `currentFileBudgetSurplus`, which seeds
the cascade's initial surplus. The clipped string is still passed via
`taggedCurrentDocLines` and concatenated between the cascade-managed
`recent_files` and `edit_history` blocks; the cascade does not re-clip it.

When `globalBudget` is `undefined`, none of this applies: the current file is
clipped to its own `currentFile.maxTokens` and the cascade is not run at all.

Final prompt size ≈ current-file budget + ≤ remaining `totalTokens` (cascade) +
lint + tags/scaffolding + postscript, i.e. bounded by `totalTokens` plus lint and
scaffolding.
