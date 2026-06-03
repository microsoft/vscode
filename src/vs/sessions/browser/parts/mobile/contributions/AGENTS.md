# Mobile Diff Editors

This document is the seed design note for the mobile file diff editor and mobile multi-file diff editor in Agent Sessions. Keep it intentionally small for now; it can grow toward a fuller user-guide shape as the implementation settles.

> Quick summary: mobile diff review uses phone-native full-screen overlays instead of desktop panes. The single-file view renders one unified diff. The multi-file view renders changed files in a continuous review surface with file-level and body-level virtualization.

## Contents

- [Why](#why)
- [Current Design](#current-design)
- [How It Works](#how-it-works)
- [Body Virtualization](#body-virtualization)
- [Rendering Ideas](#rendering-ideas)

## Why

Phone review needs the same capability as desktop review, but not the same presentation.

- Desktop side-by-side diffs are too wide for phone viewports.
- Desktop auxiliary views are gated off in phone layout.
- Touch review needs full-screen surfaces, sticky context, simple back navigation, and visible controls.
- Large agent sessions need to avoid eager work for files the user has not opened or scrolled to yet.

## Current Design

There are two mobile diff surfaces:

- `MobileDiffView`: a single-file unified diff overlay with optional sibling navigation.
- `MobileMultiDiffView`: a virtualized multi-file unified diff overlay with per-file headers, collapsible file bodies, and lazy loading for visible or near-visible files.

Both views use a lightweight diff payload:

```ts
interface IFileDiffViewData {
	readonly originalURI: URI | undefined;
	readonly modifiedURI: URI | undefined;
	readonly identical: boolean;
	readonly added: number;
	readonly removed: number;
}
```

This supports added, deleted, modified, and no-op files without importing desktop multi-diff workbench types into the mobile browser layer.

## How It Works

- File content is read from `ITextFileService`, with `IFileService` as a fallback in the multi-file view.
- The multi-file view keeps persistent per-file state, reserves virtual height from known diff stats, and only mounts file sections that intersect the viewport overscan range.
- File content is read, diffed, tokenized, and mounted incrementally as virtualized items become visible.
- Test/demo hosts can pass an async `computeDiff` hook; the Vite mobile multi-diff page uses this to compute diffs in a worker and better mimic VS Code's worker-backed diff environment.
- Virtualization owns mounted range and deterministic height accounting; native CSS owns sticky file-header behavior.
- Keep file sections anchored at their virtual top so headers can use `position: sticky`; do not emulate sticky headers by moving sections on every scroll frame.
- Lazy loading may defer file work, but visible file bodies must never be blank; unloaded or loading bodies need a stable placeholder that remains visible during native scrolling.
- Prefetch can warm one near-boundary file's render data, but it should not mount DOM for that file and visible loads must keep priority over background work.
- Loaded multi-file diff bodies flatten hunk headers and line rows into deterministic body entries, then render only the visible body range plus overscan.
- Line changes are computed with `linesDiffComputers.getDefault()`.
- The result is shaped into unified diff hunks with a small amount of surrounding context.
- Syntax highlighting first tries Monaco tokenization through `tokenizeToString`.
- When no tokenizer is available, a small regex tokenizer provides readable fallback colors.
- Async rendering is guarded by generation counters so stale reads cannot update disposed or navigated-away views.

## Body Virtualization

`MobileMultiDiffView` uses two virtualization layers.

- The outer layer virtualizes file sections and keeps each file's full height in the scroll range.
- The body layer virtualizes hunk headers and line rows within a loaded file.

The important behavior to preserve is that a large file contributes its full content height to the outer virtual scroll range. File sections stay anchored in that range, and the browser handles sticky file headers. Avoid JS-driven header pinning; it can drift during fast compositor scrolling.

The body layer should keep reusing cached diff/tokenization data, render only the visible hunk/line slice, and keep height accounting deterministic so outer scroll position remains stable as bodies load.

One remaining polish item is preserving horizontal scroll state per file when a virtualized section unmounts and remounts.

## Rendering Ideas

Useful ideas to borrow from Monaco/editor virtualization:

- Applied: reuse visible row DOM instead of clearing and rebuilding the whole visible body slice on every range change.
- Applied: batch newly visible row runs, building markup in one pass before inserting it.
- Applied: keep mounted file sections in DOM order without re-appending them on every scroll layout update.
- Prefetch and cache render data for near-visible files, but do not pre-render their DOM.
- Keep loaded rows positioned with absolute `top`; avoid transform-driven scrolling for loaded content because native sticky headers depend on stable section positioning.
- Preserve horizontal scroll state per file across virtualized unmount/remount cycles.
