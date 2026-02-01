<!--
One-line summary (PR summary):
Add ARIA hints and bug fixes for find widgets and filter inputs.
-->

# [Accessibility] Polish: ARIA Hints and Bug Fixes for Find Widgets

> Executive summary: This PR completes the user-facing polish by adding ARIA hints
> to relevant widgets and fixing critical screen reader announcement bugs. These
> changes are small, focused edits to existing widgets that significantly improve
> screen reader behavior and reduce spurious announcements. This PR depends on PR 2.

## Files Modified

- `src/vs/editor/contrib/find/browser/findWidget.ts`
  - Bug fixes: suppress "No results" announcement when search field is empty
  - Timing fix: only update `aria-label` when widget is visible to avoid stale announcements
- `src/vs/workbench/browser/parts/views/viewFilter.ts`
  - Add `aria-describedby` hints describing filter syntax and keyboard shortcuts
- `src/vs/workbench/contrib/codeEditor/browser/find/simpleFindWidget.ts`
  - Add hint announcement on focus: "Press Alt+F1 for accessibility help"
- `src/vs/workbench/contrib/search/browser/searchWidget.ts`
  - Ensure search results announcements are rate-limited to avoid duplicates
- `src/vs/workbench/contrib/terminalContrib/find/browser/terminalFindWidget.ts`
  - Terminal-specific ARIA hints and focus management improvements
- `src/vs/workbench/contrib/webview/browser/webviewFindWidget.ts`
  - Webview widget: ensure hint text is exposed via accessible name and description

## Bugs Fixed

1. Spurious "No results" announcement
   - Previously: when the find input was empty, some screen readers announced "No results" after opening the widget.
   - Fix: only compute and announce results when the search string length > 0.

2. Stale `aria-label` updates
   - Previously: `aria-label` updates occurred even when the widget was hidden, causing screen readers to re-announce unrelated information.
   - Fix: check element visibility and postpone updates until visible.

3. Duplicate announcements on rapid updates
   - Fix: rate-limit announcements to once per 300ms and collapse identical messages.

## Features / UX Improvements

- Adds succinct `aria-describedby` hints that briefly explain available filter options and keyboard shortcuts.
- Adds a consistent hint "Press Alt+F1 for accessibility help" across widgets when focused.

## Testing & Validation

1. Automated tests:
   - Added unit tests for the `aria` helper that ensures `aria-label` and `aria-describedby` are set only when visible.

2. Manual steps:
- Open editor find; focus the input; confirm no "No results" is announced when empty.
- Type a search term and confirm results announcement occurs once and with correct count.
- Toggle `workbench.accessibility.helpVerbosity` between `normal` and `verbose` and confirm hint verbosity changes.
- Test with NVDA and JAWS on Windows; VoiceOver on macOS.

## Changelog / What changed

- Small edits to existing widget files to add ARIA attributes and timing checks.
- No large API surface changes — mostly DOM attribute updates and small logic guards.

## Release Note

```
Accessibility: Improve ARIA hint announcements and fix spurious screen reader messages in find/filter widgets.
```

## Reviewers

- Primary: @isidorn, @jrieken
- Accessibility & Editor owners requested for final review

## Related
- Depends on: `feature/accessibility-help-content` (PR 2)
- Follow-ups: none planned; further tuning may be done post-merge based on feedback

<!-- End PR3 -->