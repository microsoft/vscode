<!--
One-line summary (PR summary):
Add Accessibility Help content providers for find and filter experiences.
-->

# [Accessibility] Content: Accessibility Help Providers for Find and Filter Experiences

> Executive summary: This PR adds the concrete Accessibility Help provider implementations
> that surface contextual help dialogs when users press Alt+F1 (or platform equivalent).
> These providers contain the user-facing text, keyboard shortcut guidance, and context
> sensitive instructions for each component. This PR depends on PR 1 (foundation).

## Files Added (7 providers)

- `src/vs/workbench/contrib/codeEditor/browser/editorFindAccessibilityHelp.ts`
  - Editor find/replace content: keyboard shortcuts, regex/case/whole-word hints,
    multi-cursor notes, navigation commands, and example workflows.
- `src/vs/workbench/contrib/terminalContrib/find/browser/terminalFindAccessibilityHelp.ts`
  - Terminal find content: buffer navigation, selection vs. command-mode differences,
    and terminal-specific limitations.
- `src/vs/workbench/contrib/webview/browser/webviewFindAccessibilityHelp.ts`
  - Webview content: extension-owned webview limitations and Markdown preview notes.
- `src/vs/workbench/contrib/output/browser/outputAccessibilityHelp.ts`
  - Output filter content: channel selection, filter syntax, and common troubleshooting.
- `src/vs/workbench/contrib/markers/browser/markersAccessibilityHelp.ts`
  - Problems panel content: filter by severity/source, quick-fix navigation, and focus behaviors.
- `src/vs/workbench/contrib/debug/browser/replAccessibilityHelp.ts`
  - Debug console content: expression filtering, command history navigation, and evaluation notes.
- `src/vs/workbench/contrib/search/browser/searchAccessibilityHelp.ts`
  - Search across files content: include/exclude patterns, scope options, and results navigation.

## Features & Behavior

- All providers implement the `IAccessibilityHelpProvider` interface and register with
  the `AccessibleViewRegistry` introduced in PR 1.
- Providers produce localized markdown-like content suitable for screen readers and
  accessible dialogs; strings use `nls.localize()`.
- Providers include explicit recommended keyboard actions (e.g., `Alt+F1`, `F4`, `Enter`, `Esc`).
- Providers avoid visual-only references and provide textual equivalents for icons.

## Known Limitations & Workarounds

- Webview find support depends on extension-provided hooks; for some webviews, help may be
  advisory only — we document the limitation in the provider text.
- Terminal behavior varies by shell and buffer; some navigation shortcuts may behave differently.
  The terminal provider lists exact behavior per common shells (PowerShell, bash).

## Testing & Validation

1. Unit tests:
   - Added provider-level smoke tests ensuring `getHelp()` returns non-empty localized content.

2. Manual validation steps:

```powershell
# From repo root
# Run relevant test suites (editor, terminal, workbench)
npm run test --workspace test/editor
```

- Open each component and press `Alt+F1`.
- Verify the help dialog appears and contains the expected sections: Short summary, Keyboard shortcuts, Navigation, Examples.
- Run screen reader (NVDA/JAWS) and verify content is announced and navigable via headings/links.
- Test with `workbench.accessibility.helpVerbosity` set to `verbose` and `normal` to confirm differences in detail.

## Accessibility & Localization

- All user-visible strings localized with `nls.localize()`.
- Providers avoid hard-coded punctuation or visual-only cues.
- Content follows best practices for concise screen-reader-friendly text (short paragraphs, explicit keys, no excessive punctuation).

## Changelog / What changed

- New files: the seven provider files listed above.
- No changes to existing widgets in this PR — widget ARIA changes are in PR 3.

## Release Note

```
Accessibility: Add content providers for find/filter accessibility help (Alt+F1) across editor, terminal, webview, output, problems, debug console, and search.
```

## Reviewers

- Primary reviewer: @isidorn
- Optional: accessibility team and component owners for each provider

## Related
- Depends on: `feature/accessibility-help-foundation` (PR 1)
- Follow-up: `feature/accessibility-aria-polish` (PR 3) for widget ARIA hints and timing fixes

<!-- End PR2 -->