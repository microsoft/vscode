# Mobile Diff Editors

This document is the seed design note for the mobile file diff editor and mobile multi-file diff editor in Agent Sessions. Keep it intentionally small for now; it can grow toward a fuller user-guide shape as the implementation settles.

> Quick summary: mobile diff review uses phone-native full-screen overlays instead of desktop panes. The single-file view renders one unified diff. The multi-file view renders changed files in a continuous review surface and should move toward file-level virtualization.

## Contents

- [Why](#why)
- [Current Design](#current-design)
- [How It Works](#how-it-works)
- [Next Step: Virtualization](#next-step-virtualization)

## Why

Phone review needs the same capability as desktop review, but not the same presentation.

- Desktop side-by-side diffs are too wide for phone viewports.
- Desktop auxiliary views are gated off in phone layout.
- Touch review needs full-screen surfaces, sticky context, simple back navigation, and visible controls.
- Large agent sessions need to avoid eager work for files the user has not opened or scrolled to yet.

## Current Design

There are two mobile diff surfaces:

- `MobileDiffView`: a single-file unified diff overlay with optional sibling navigation.
- `MobileMultiDiffView`: a multi-file unified diff overlay with sticky per-file headers, collapsible file bodies, and lazy loading for visible or near-visible files.

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
- The multi-file view renders file shells first, then reads, diffs, tokenizes, and mounts file bodies when they enter the viewport overscan range.
- Line changes are computed with `linesDiffComputers.getDefault()`.
- The result is shaped into unified diff hunks with a small amount of surrounding context.
- Syntax highlighting first tries Monaco tokenization through `tokenizeToString`.
- When no tokenizer is available, a small regex tokenizer provides readable fallback colors.
- Async rendering is guarded by generation counters so stale reads cannot update disposed or navigated-away views.

## Next Step: Virtualization

`MobileMultiDiffView` now avoids eager file-body work, but it should still move toward the desktop multi-diff virtualization model adapted to the mobile DOM renderer.

The important behavior to preserve is that a large file contributes its full content height to the outer virtual scroll range, but the mounted file view itself is capped to the viewport height. As the outer scroll moves through that file's range, the file body receives an internal scroll offset. Once that internal offset reaches the end, continued outer scrolling naturally advances to the next file.

The virtualized version should:

- Keep persistent item state per file: collapsed state, load state, computed content height, cached render data, vertical inner scroll offset, and horizontal scroll offset.
- Maintain one virtual scroll height for the full file list.
- Mount only viewport-intersecting file sections plus a small overscan buffer.
- Cap each mounted expanded file section to the viewport height while preserving its full virtual height in the outer scroll model.
- Translate the outer scroll position within a file into the file body's inner scroll offset.
- Keep lazy-loading and tokenizing files when they become visible or near-visible.
- Preserve scroll stability by deriving heights from known header, hunk, and row counts rather than repeated DOM measurement.
- Replace native sticky file headers with manually transformed headers, because recycled absolute-positioned sections make CSS sticky unreliable.

The next virtualization win should be full desktop-style capped item virtualization once deterministic height accounting and inner-offset rendering are in place.
