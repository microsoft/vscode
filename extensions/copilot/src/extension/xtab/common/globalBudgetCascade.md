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
**render order** (`order`). It is clipped **last** — after the cascade has run —
around the cursor / edit window, and sized to its share of the pool **plus**
whatever budget the cascade left unused. Concretely, the cascade runs first
seeded with `0` (so the current file donates nothing), and the current file is
then clipped to `currentFileBudget + cascadeFinalSurplus`. Because budget flows
in a single direction (cascade → current file, never back), the current file
"reuses" the cascade's leftover and trims less. See
[Clip the current file last](#clip-the-current-file-last).

The set of parts that get a `shares` entry is
`GlobalBudgetSharePart = GlobalBudgetPart | 'currentFile'`.

| Part | How it relates to the pool |
| --- | --- |
| `currentFile` | Sized from the pool but clipped **outside and after** the cascade: clipped to `floor(totalTokens * shares.currentFile) + cascadeFinalSurplus` around the cursor / edit window by `createTaggedCurrentFileContentUsingPagedClipping` (the clip cap `currentFile.maxTokens` is overridden with that pool budget in `xtabProvider`). It is **not** in `order`, so the cascade loop never renders it, and it absorbs the cascade's leftover rather than donating into it. When `globalBudget` is `undefined` it falls back to its own `currentFile.maxTokens` cap. |
| `lintOptions` | Optional, formatted separately, and small. Excluded entirely — no `shares` entry. Keeps its own per-part shape. |

## Inputs

| Input | Description |
| --- | --- |
| `globalBudget.totalTokens` | The single pool size. Default `7500`. Set via the `totalTokens` field of the experiment JSON string `chat.advanced.inlineEdits.xtabProvider.globalBudget`. |
| `globalBudget.order` | Ordered list of **rendered** parts. Earlier parts get budget first; their surplus flows to later parts. `currentFile` is not listed here. |
| `globalBudget.shares` | `Record<GlobalBudgetSharePart, number>` — one fraction of `totalTokens` per rendered part **and** for `currentFile`. Must sum to `1 ± 1e-3` across `order` plus `currentFile`. |

### Defaults

`GlobalBudgetOptions.DEFAULT_ORDER`:

```javascript
['languageContext', 'recentlyViewedDocuments', 'neighborFiles', 'diffHistory']
```

`GlobalBudgetOptions.DEFAULT_SHARES` (volume-neutral with today's per-part caps):

| Part | Share | Base budget at `totalTokens = 7500` |
| --- | --- | --- |
| `currentFile` | 1500/7500 | 1500 |
| `recentlyViewedDocuments` | 2000/7500 | 2000 |
| `languageContext` | 2000/7500 | 2000 |
| `neighborFiles` | 1000/7500 | 1000 |
| `diffHistory` | 1000/7500 | 1000 |

`GlobalBudgetOptions.DEFAULT_TOTAL_TOKENS` = `7500`.

These shares reproduce today's per-part caps exactly: `currentFile.maxTokens` 1500,
`recentlyViewedDocuments` 2000, `languageContext` 2000, `neighborFiles` 1000,
`diffHistory` 1000. The pool total (`7500`) is the sum of those caps, so enabling
the default global budget neither grows nor shrinks any rendered part's base
allocation.

The default order places `languageContext` first because it is often disabled
or empty, donating its share to the always-on `recentlyViewedDocuments` next in
line. Whatever the cascade does not use carries to `finalSurplus` and is handed
to the current file's clip.

`GlobalBudgetOptions.currentFileBudget(gb)` returns \`floor(totalTokens \*
shares.currentFile)\` — the single source of truth for the current file's **base**
share. The current file's actual clip cap is this base plus the cascade's
`finalSurplus`.

## Algorithm

```javascript
surplus ← 0                          // the current file never donates, so the cascade always seeds 0
for part in order:
    budget   ← max(0, floor(surplus + totalTokens * shares[part]))
    consumed ← runSubBuilder(part, maxTokens: budget)   // sub-builder ≤ budget
    surplus  ← max(0, budget - consumed)                // → next part only
// end-of-loop surplus is returned as finalSurplus and added to the current file's clip cap
```

Notes:

- The cascade is **always seeded with `0`**. The current file is clipped after the
  cascade and only ever *receives* leftover, so it has nothing to donate forward.
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
- `surplus` is **forward-only** between cascade parts. Unused tokens at the *last*
  part are **not** lost: they form `finalSurplus`, which the current file's clip
  reuses.
- The cascade returns its end-of-loop `surplus` as `CascadeResult.finalSurplus`.
  `xtabProvider` grows the current file's clip budget by exactly this amount. See
  [Clip the current file last](#clip-the-current-file-last).
- Defensive invariant: each sub-builder must report `0 ≤ tokensConsumed ≤ budget`.
  The cascade `softAsserts` this per part (it does **not** silently clamp an
  overspend down, which would hide the bug) so the conservation argument the
  current-file clip relies on holds.

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
rest of `getUserPrompt` is identical, plus the `finalSurplus` used by the
current-file clip:

```javascript
{
    codeSnippets,              // recentlyViewed + langCtx + neighbor joined by "\n\n"
    documents,                 // docsInPrompt
    neighborSnippetsResult,    // unchanged telemetry payload
    editDiffHistory,
    nDiffsInPrompt,
    subsections,               // recentlyViewed/langCtx/neighbor strings, for per-subsection token reporting
    finalSurplus,              // end-of-loop surplus, reused by the current-file clip
}
```

## Guarantees and limits

With `totalTokens = T` and shares `s_i` (validation guarantees they are finite and
non-negative — see [Validation](#validation)):

- **Per-part floor**: part at index `i` always receives at least `floor(T * s_i)`
  tokens, regardless of what earlier parts do.
- **Per-part ceiling**: part at index `i` can receive at most the running
  floored sum `floor(…floor(floor(T * s_0) + T * s_1) + … + T * s_i)` — its own
  share plus everything donated by earlier parts, with `floor` applied at every
  step. Note this is generally smaller than `floor(T * (s_0 + … + s_i))`.
- **Current-file floor**: the current file always receives at least
  `floor(T * shares.currentFile)` (its base share), and `finalSurplus ≥ 0` on top.
- **Pool ceiling**: total cascade-managed tokens ≤ the ceiling of the last part
  (always ≤ `T - floor(T * shares.currentFile)`). The current file then draws its
  own base slice plus the cascade's `finalSurplus`, so the budgeted parts together
  consume ≤ `T`; lint and scaffolding live outside the budget.
- **No back-flow between cascade parts**: surplus at the last cascade part is not
  redistributed to earlier cascade parts — it flows to the current file as
  `finalSurplus`.
- **No intra-part fairness**: a single large item inside one part can consume
  that part's entire allocation; the cascade only addresses cross-part donation.

## Validation

`GlobalBudgetOptions.validate` runs at the start of every cascade invocation (and
again in `xtabProvider` before the current-file clip) and throws on
misconfiguration. The config is runtime-tunable (experiments), so failing loudly
is preferable to silent under/over-allocation.

| Rule | Error |
| --- | --- |
| `totalTokens` is finite and `>= 0` | `globalBudget.totalTokens must be a finite, non-negative number, got X` |
| `order` has no duplicate parts | `globalBudget.order contains duplicate part 'X'` |
| Every part in `order` has a numeric `shares[part]` | `globalBudget.shares is missing entry for 'X'` |
| `shares.currentFile` is a number | `globalBudget.shares is missing entry for 'currentFile'` |
| Every share (order parts **and** `currentFile`) is finite and `>= 0` | `globalBudget.shares['X'] must be a finite, non-negative number, got Y` |
| If both present, `recentlyViewedDocuments` precedes `neighborFiles` | `globalBudget.order must place 'recentlyViewedDocuments' before 'neighborFiles'` |
| Sum of `shares[part]` for parts in `order` plus `shares.currentFile` ≈ 1 (epsilon `1e-3`) | `globalBudget.shares across order must sum to ~1, got ${sharesSum}` |

> **Why the non-negativity rule matters:** a negative share can still pass the
> "sum ≈ 1" check (e.g. one part `-0.25`, another `1.0`). At allocation time the
> negative part clamps to a `0` budget, but it still counted toward the sum, so the
> other parts over-allocate past the pool — which would let the current file's
> `finalSurplus` exceed the true leftover. Rejecting negative/non-finite shares up
> front keeps `Σ consumed ≤ totalTokens` provable.

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

The JSON value defines the budget knobs together — `totalTokens`, `order`, and
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

When the budget is enabled, `xtabProvider` gathers the cascade inputs, runs the
cascade, and then clips the current file with cap
`currentFileBudget(globalBudget) + cascade.finalSurplus` (instead of the
standalone `currentFile.maxTokens`). The already-run cascade is threaded into
`getUserPrompt` as `precomputedCascade` so it renders exactly once. See
[Clip the current file last](#clip-the-current-file-last).

Experiment-controlled settings:

| Setting | Default | Purpose |
| --- | --- | --- |
| `chat.advanced.inlineEdits.xtabProvider.globalBudget` | `undefined` | JSON string defining `totalTokens`, `order`, and `shares`; unset/empty disables the budget |

> **Migration note:** the old `globalBudget.enabled` (boolean) and
> `globalBudget.totalTokens` (number) settings have been **replaced** by this
> single JSON string. Any live experiment treatment that pinned those keys must
> migrate: `enabled:true` + `totalTokens:N` becomes the JSON `{"totalTokens":N}`,
> and a bare `enabled:true` becomes `{}`. Because `totalTokens` also funds
> `currentFile`, treatments that pinned an old total (e.g. `6000` or `8000`)
> should move to `{}` (or `7500`) to stay volume-neutral.

## Worked examples

All examples use `DEFAULT_ORDER`, `DEFAULT_SHARES`, and `totalTokens = 7500`.

Base allocations: `floor(7500 * share)` per part →

| Part | Base allocation |
| --- | --- |
| `languageContext` | 2000 |
| `recentlyViewedDocuments` | 2000 |
| `neighborFiles` | 1000 |
| `diffHistory` | 1000 |
| `currentFile` (clipped last) | 1500 |

Sum = 7500. The cascade iterates only the four rendered parts, seeded with `0`.
Its end-of-loop surplus (`finalSurplus`) is added to the current file's base
allocation, shown as the final row's `budget`.

### Example A — cascade parts modest; current file absorbs the leftover

| Part | surplus in | budget | consumed | surplus out |
| --- | --- | --- | --- | --- |
| `languageContext` | 0 | 2000 | 0 | 2000 |
| `recentlyViewedDocuments` | 2000 | 4000 | 1500 | 2500 |
| `neighborFiles` | 2500 | 3500 | 500 | 3000 |
| `diffHistory` | 3000 | 4000 | 500 | 3500 |
| `currentFile` (clipped last) | 3500 (`finalSurplus`) | 1500 + 3500 = 5000 | 5000 | 0 |

Tokens placed: 0 + 1500 + 500 + 500 + 5000 = **7500**. The cascade consumed only
2500, so its 3500 leftover flowed into the current file, which grew from its 1500
base to 5000 and trimmed less.

### Example B — empty cascade; current file reuses the whole pool

| Part | surplus in | budget | consumed | surplus out |
| --- | --- | --- | --- | --- |
| `languageContext` | 0 | 2000 | 0 | 2000 |
| `recentlyViewedDocuments` | 2000 | 4000 | 0 | 4000 |
| `neighborFiles` | 4000 | 5000 | 0 | 5000 |
| `diffHistory` | 5000 | 6000 | 0 | 6000 |
| `currentFile` (clipped last) | 6000 (`finalSurplus`) | 1500 + 6000 = 7500 | ≤ 7500 | — |

With no language context, empty history, and neighbors disabled, every cascade
part consumes `0`, so the entire non-currentFile pool (`2000 + 2000 + 1000 + 1000
= 6000`) carries to `finalSurplus`. The current file's clip cap becomes `1500 +
6000 = 7500 = T` — it effectively reuses the whole pool. This is the common case
for a file edited in isolation.

### Example C — cascade fills its pool; current file gets only its base

| Part | surplus in | budget | consumed | surplus out |
| --- | --- | --- | --- | --- |
| `languageContext` | 0 | 2000 | 2000 | 0 |
| `recentlyViewedDocuments` | 0 | 2000 | 2000 | 0 |
| `neighborFiles` | 0 | 1000 | 1000 | 0 |
| `diffHistory` | 0 | 1000 | 1000 | 0 |
| `currentFile` (clipped last) | 0 (`finalSurplus`) | 1500 + 0 = 1500 | 1500 | 0 |

Tokens placed: 2000 + 2000 + 1000 + 1000 + 1500 = **7500**. Every cascade part
filled its own share exactly, so `finalSurplus = 0` and the current file falls
back to its 1500 base — the per-part floor. The current file never shrinks below
this base.

## Disabled parts

Parts can be disabled by configuration (`languageContext.enabled = false`,
`neighborFiles.enabled = false`) or by having no input data (e.g. no language-
context response, empty neighbor snippets, no edit history). Those parts remain
in `order` — the wired-in code always uses `DEFAULT_ORDER`/`DEFAULT_SHARES` — so
their slot still runs, just with `consumed = 0`, and their full share donates
forward. Whatever reaches the end of the cascade becomes `finalSurplus` and is
reused by the current file's clip rather than wasted.

### Effective caps when both `languageContext` and `neighborFiles` are off

With `DEFAULT_ORDER` and pool `T`, applying the per-step floor at every donation
step (the cascade is seeded `0`, so let \`C\_rv = floor(floor(T·langCtxShare) + T·rvShare)\` be
the effective cap on recently-viewed):

| Part | Effective cap |
| --- | --- |
| `languageContext` | 0 (consumed) |
| `recentlyViewedDocuments` | `C_rv` (langCtx's share + own share, with per-step `floor`) |
| `neighborFiles` | 0 (consumed) |
| `diffHistory` | `floor(floor((C_rv − consumed_rv) + T·neighborShare) + T·diffShare)` (own share + neighbors' share + recently-viewed's leftover, with per-step `floor`) |

At `T = 7500`, \`C\_rv = floor(2000 + 2000) = 4000\` and the total cascade pool
ceiling is \`floor(floor(4000 + 1000) + 1000) = 6000\`. Whatever `diffHistory`
leaves becomes `finalSurplus` for the current file:

| `recentlyViewedDocuments` consumed | `diffHistory` cap | `finalSurplus` → current file |
| --- | --- | --- |
| 4000 (fills cap) | 2000 | 0 (current file at base 1500) |
| 1500 | 4500 | up to 4500 |
| 0 | 6000 (whole cascade pool) | up to 6000 (current file up to 7500) |

Worked example with both enabled parts hungry at `T = 7500`:

| Part | surplus in | budget | consumed | surplus out |
| --- | --- | --- | --- | --- |
| `languageContext` | 0 | 2000 | 0 | 2000 |
| `recentlyViewedDocuments` | 2000 | 4000 | 4000 | 0 |
| `neighborFiles` | 0 | 1000 | 0 | 1000 |
| `diffHistory` | 1000 | 2000 | 2000 | 0 |
| `currentFile` (clipped last) | 0 (`finalSurplus`) | 1500 | 1500 | 0 |

Cascade placed **6000** (recently-viewed absorbed langCtx's donation; diff history
absorbed neighbors' donation), leaving `finalSurplus = 0`, so the current file
stays at its 1500 base for a total of 7500.

### Ordering caveat

`recentlyViewedDocuments` has **first claim** on the cascade donation pool
(`languageContext`'s share) because it sits earlier in `order`. If recently-viewed
is hungry, diff history only sees \`neighbors' + own share = 2000 at T = 7500\`
— it cannot reach `languageContext`'s share directly. Whatever
diff history (the last cascade part) leaves still flows to the current file.

To make diff history share the donation, you would need to either reorder so
`diffHistory` precedes `recentlyViewedDocuments`, or rebalance `shares`. The
ordering must still satisfy the validation rule that `recentlyViewedDocuments`
precedes `neighborFiles` (because `neighborFiles` consults `docsInPrompt`
populated by recently-viewed).

A deployment could alternatively **remove** disabled parts from `order` and
rebalance `shares` to sum to 1 — the donation would then be baked in statically
rather than emerging from the cascade. The wired-in code does not do this; it
always passes `DEFAULT_ORDER` and `DEFAULT_SHARES`.

## Clip the current file last

The current file is the natural sink for the cascade's leftover because it is the
one part clipped *around* a point of interest (the cursor), so it can always
absorb more context. Rather than build the prompt, measure what is unused, then
rebuild the current file bigger (a two-pass approach that risks double-counting
the leftover), the implementation simply **clips the current file last**: run the
cascade first, then size the current file with all the budget the cascade did not
use.

### Mechanism

In `xtabProvider`, under a global budget:

1. Gather the cascade inputs (language context, neighbor snippets) — these do
   **not** depend on the current-file clip, so they can be produced first.
2. Run `runGlobalBudgetCascade(...)` (seeded with `0`; the current file donates
   nothing, so the cascade only ever *gives*).
3. Clip the current file **last** with cap
   `currentFileBudget + cascade.finalSurplus`.
4. Assemble the prompt, passing the already-computed cascade through to
   `getUserPrompt` as `precomputedCascade`. `getUserPrompt` honors
   `precomputedCascade` only when `globalBudget` is set, so the cascade runs
   exactly **once** and the rendered snippets match the sizing.

When `globalBudget` is `undefined` (prod default) none of this applies: the
current file is clipped to its own `currentFile.maxTokens`, the inputs are
gathered after, and the cascade is not run at all — byte-identical to the legacy
path.

### Conservation (proved)

Because the current file does not donate, budget flows in a single direction
(cascade → current file), so there is no double-counting. With the cascade seeded
at `0`, the end-of-loop surplus telescopes to

```
finalSurplus ≤ Σ(totalTokens · shareᵢ)        for i in order
             − Σ(consumedᵢ)                    = (T − T·share_cf) − C_cascade
```

so the current file's clip cap is

```
cfBudget = floor(T · share_cf) + finalSurplus ≤ T · (Σ all shares) − C_cascade
⇒ C_cf + C_cascade ≤ T · (Σ all shares)        (total bounded by the pool)        ✅
```

and since `finalSurplus ≥ 0`, `cfBudget ≥ floor(T · share_cf)` — the current file
**never shrinks below** its base share. Non-negative, validated shares (see
[Validation](#validation)) are what make the first inequality hold.

> **Caveat — share-sum tolerance.** `validate` accepts `|Σ shares − 1| ≤ 1e-3`, so
> the bound above is `T · (Σ shares)`, not exactly `T`. A config whose shares sum
> slightly above 1 can over-allocate by at most `~1e-3 · T` (≈ 7.5 tokens at the
> default `T = 7500`). Shares summing to exactly 1 (the defaults do) give the clean
> `≤ T` bound. Under-allocation (sum < 1) simply wastes a little budget.

> **Caveat — internal accounting, not the full rendered prompt.** "≤ `T`" is over
> the budgeted parts' *internal* token accounting (paged-clipping line cost,
> raw-snippet cost, diff-entry cost). The fully rendered prompt also carries tag
> wrappers, related-info scaffolding, lint, and the postscript, which live outside
> the pool. So the guarantee is "the budgeted parts together consume ≤ `T`", not
> "the whole prompt is ≤ `T` characters". Tests assert current-file-region
> **growth** and internal accounting, not an absolute full-prompt bound.

### Worked example

`T = 6000`, `languageContext` disabled, cascade consumes `rv 1500 + neighbor 500
+ diff 500 = 2500` (`C_cascade = 2500`), `share_cf = 1500/7500 = 1/5` ⇒ base
`currentFileBudget = floor(6000 · 1/5) = 1200`:

- The cascade is seeded `0`; its `finalSurplus = (1600 + 1600 + 800 + 800) − 2500
  = 2300`.
- The current file is clipped last to `1200 + 2300 = 3500` (= `6000 − 2500`).

The current file grows `1200 → 3500`, absorbing exactly the 2300 the cascade left
unused — matching the intuition "budget 6k, first build consumed 4k ⇒ give the
current file the remaining 2k".

### Trade-offs and caveats

- **Current file does not donate.** Budget only ever flows cascade → current file.
  When the current file is small, its base share is **not** handed to the cascade
  parts (they get only their own shares). A deployment optimizing for rich
  *neighbor/history* context (rather than current-file context) would need to
  rebalance `shares` to give those parts more.
- **Reordered awaits.** Because the cascade runs before the current-file clip,
  language-context and neighbor-snippet gathering happen before the current file is
  clipped. Any `PromptTooLarge('currentFile')` early-return / cancellation reason
  therefore fires *after* those awaits under a global budget. This is an acceptable
  consequence of the opt-in feature; the prod path keeps the legacy ordering.
- **Next-cursor predictor unaffected.** `xtabNextCursorPredictor` keeps its own
  dedicated current-file cap and never carries a global budget into its prompt, so
  it is byte-identical regardless of this feature.
