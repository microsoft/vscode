# Recently Viewed Files — Clipping Strategies Specification

This document specifies the three clipping strategies used to select and truncate
recently viewed file content for inclusion in the NES/xtab prompt.

## Shared Concepts

### Inputs

| Input | Description |
|---|---|
| `recentlyViewedCodeSnippets` | Files ordered **most-recent-first**. Each entry carries content, optional focal ranges (character-offset ranges of edit locations), and an `editEntryCount` weight. |
| `totalBudget` | Maximum tokens for the entire recently-viewed-files section (`opts.recentlyViewedDocuments.maxTokens`). |
| `pageSize` | Number of lines per page for paged clipping. |
| `computeTokens` | Token counting function. |

### Paged Clipping

All strategies use page-based clipping. File content is divided into pages of
`pageSize` lines. Token costs are computed per page. Pages are included or
excluded as whole units — no partial pages.

### Output Ordering

All strategies reverse the collected snippets before returning, so the final
prompt order is **least-recent-first** (oldest file at top, most recent at
bottom).

### Budget Enforcement in `clipAroundFocalRanges`

The `AroundEditRange` and `Proportional` strategies share `clipAroundFocalRanges`
for files with focal ranges. This function enforces a strict budget: if the focal
pages alone exceed the remaining token budget, the file is **skipped** entirely
(returns `undefined`). This prevents any single file from overshooting the
budget. The caller interprets `undefined` as "nothing fit" and either breaks the
loop (greedy strategies) or carries the budget forward (proportional strategy).

### Focal Range Span Capping

When clipping around focal ranges, `selectFocalRangesWithinSpanCap` limits the
span to `pageSize × 3` lines. Focal ranges are ordered most-recent-first;
ranges are greedily included until adding the next one would exceed the span cap.
This prevents wide-scatter edits (e.g., line 10 + line 90) from causing the
initial focal span to cover the entire document.

---

## Strategy: TopToBottom

### History Collection

Uses `collectRecentDocuments`: collects the **last `nDocuments` unique
documents**, keeping only the **most recent entry** per document. Focal ranges
are **not** extracted from edit entries — all entries are treated as full
documents.

### Algorithm

Greedy, most-recent-first:

1. Process files in most-recent-first order.
2. Each file is clipped **from the top** of the file, taking pages sequentially
   until the budget is exhausted (`clipFullDocument`).
3. If a page doesn't fit, stop clipping that file. Move to the next.
4. When the budget reaches 0, stop processing files.

### Behavior

- No focal ranges are used — the clip always starts at line 0.
- The most recently touched file gets the largest share of budget (greedy).
- Files beyond the budget are silently dropped.
- Visible-range entries also use top-to-bottom clipping (no centering on the
  visible range).

---

## Strategy: AroundEditRange

### History Collection

Uses `collectRecentDocuments`: same as `TopToBottom` — **one entry per
document**, most recent only.

For edit entries, focal ranges are extracted from `edit.getNewRanges()` (the
character-offset ranges of the replacement text in the post-edit document). For
visible-range entries, the `visibleRanges` are used as focal ranges.

### Algorithm

Greedy, most-recent-first:

1. Process files in most-recent-first order.
2. For files **with** focal ranges: call `clipAroundFocalRanges`.
   - Focal ranges are span-capped to `pageSize × 3` lines.
   - The focal range is mapped to page indices, and those pages are always
     included (the "focal pages").
   - If the focal pages exceed the remaining budget, the file is **skipped**.
   - Otherwise, the remaining budget is split evenly between expanding upward
     and downward from the focal pages.
   - Expansion continues page by page in each direction until the half-budget
     is exhausted.
3. For files **without** focal ranges: fall through to `clipFullDocument`
   (top-to-bottom clipping).
4. When the budget reaches 0 or a file can't fit, stop processing.

### Behavior

- The clip is centered on the edit/visible location rather than the top of file.
- Budget is consumed greedily — the most recent file gets the most context.
- Only one entry per document is used, so if a file was edited multiple times,
  only the most recent edit location determines the clip center.

---

## Strategy: Proportional

### History Collection

Uses `collectRecentDocumentsGrouped`: collects the last `nDocuments` unique
documents, keeping **all entries** per document (not just the latest). This
allows `historyEntriesToCodeSnippet` to merge focal ranges from multiple edits
in the same file, giving the model visibility into all recent edit locations
within each document.

For older edit entries, focal ranges are transformed forward through the chain
of subsequent edits so they remain valid in the most recent content.

### Algorithm

Two-pass:

#### Pass 1 — Compute Minimum Focal Costs & Select Files

1. For each file, compute the **focal page cost** via `computeFocalPageCost`:
   the token cost of the pages containing the file's focal ranges (after
   span-capping). Files without focal ranges have a focal cost of 0.

2. Sum all focal costs. If the sum exceeds `totalBudget`, **drop files from the
   end** of the list (oldest first) until the sum fits.

3. If no files can be included, return empty.

#### Pass 2 — Distribute Expansion Budget & Clip

1. Compute `expansionBudget = totalBudget − sumFocalCosts`.

2. Compute per-file **weights** from `editEntryCount` (default 1).

3. Each included file gets an **expansion share**:
   `floor(expansionBudget × (weight / totalWeight))`.

4. Process files most-recent-first. Each file's effective budget is:
   `focalCost + expansionShare + unspentBudget` (carry-forward from previous).

5. For files **with** focal ranges: call `clipAroundFocalRanges` with the
   effective budget. The focal pages are guaranteed to fit (by construction
   from pass 1).

6. For files **without** focal ranges: call `clipFullDocument`.

7. Any unspent budget carries forward to the next file.

### Invariants

- **Budget guarantee**: The sum of raw code tokens across all included files
  never exceeds `totalBudget`. (Formatting overhead — tags, file path headers —
  is not counted against the budget, matching all strategies.)

- **Focal page guarantee**: Every included file's focal pages are present in the
  output. A file is only included if its focal cost fits within the remaining
  budget after accounting for all other included files.

- **Recency priority**: When files must be dropped, the oldest (last in the
  most-recent-first input) are dropped first.

- **Proportional fairness**: Expansion budget beyond focal pages is distributed
  proportionally to edit-entry count, so files with more edits get more
  surrounding context.

- **Carry-forward**: If a file uses less than its allocation (e.g., the file is
  small), the unspent tokens flow to the next file.

---

## Comparison

| Property | TopToBottom | AroundEditRange | Proportional |
|---|---|---|---|
| Budget allocation | Greedy, most-recent-first | Greedy, most-recent-first | Two-pass proportional |
| Clip center | Top of file | Edit/visible ranges | Edit ranges |
| File dropping | Implicit (budget exhausted) | Implicit (focal cost exceeds remaining budget) | Explicit (oldest first) |
| Multi-edit per file | Single entry per file | Single entry per file | All entries merged |
| Budget overrun risk | None | None | None |
| History collection | `collectRecentDocuments` | `collectRecentDocuments` | `collectRecentDocumentsGrouped` |

## Focal Page Cost Computation

The focal page cost for a file is computed by `computeFocalPageCost`:

1. Apply `selectFocalRangesWithinSpanCap` to cap the focal range span to
   `pageSize × 3` lines (prioritizing the most recent focal ranges).
2. Convert the character-offset range to line numbers via the content's
   transformer.
3. Map to page indices: `firstPageIdx = floor((startLine − 1) / pageSize)`,
   `lastPageIdxIncl = floor((endLine − 1) / pageSize)`.
4. Sum the token cost of all pages from `firstPageIdx` to `lastPageIdxIncl`.
