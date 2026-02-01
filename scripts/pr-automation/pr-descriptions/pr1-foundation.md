<!--
One-line summary (will be used as PR summary):
Establish foundational infrastructure for the Accessibility Help System.
-->

# [Accessibility] Foundation: Infrastructure and Wiring for Accessibility Help System

> This PR establishes the foundational infrastructure that enables the Accessibility
> Help System across VS Code's find and filter experiences. It wires the help system
> into editor, terminal, webview, output, markers, and search components and
> includes configuration, localized strings, and the product requirements document.

## Checklist

- [ ] This change follows repository PR guidelines (one-line summary + description)
- [ ] All changes are localized where required (nls.localize() used for user-visible strings)
- [ ] CI (build and tests) pass
- [ ] Accessibility testing performed with NVDA and JAWS (or equivalent)
- [ ] Reviewer(s) assigned: @isidorn, @jrieken

## What this PR includes

### Core Infrastructure
- `src/vs/editor/contrib/find/browser/findController.ts`: Accessibility help trigger integration
- `src/vs/platform/accessibility/browser/accessibleView.ts`: Extended for find/filter context support
- `src/vs/workbench/contrib/accessibility/browser/accessibilityConfiguration.ts`: New configuration options for accessibility alerts

### Contribution Registrations (wiring)
- `src/vs/workbench/contrib/codeEditor/browser/codeEditor.contribution.ts`
- `src/vs/workbench/contrib/terminalContrib/find/browser/terminal.find.contribution.ts`
- `src/vs/workbench/contrib/webview/browser/webview.contribution.ts`
- `src/vs/workbench/contrib/output/browser/output.contribution.ts`
- `src/vs/workbench/contrib/markers/browser/markers.contribution.ts`
- `src/vs/workbench/contrib/search/browser/search.contribution.ts`

### Supporting Files
- `src/vs/editor/common/standaloneStrings.ts`: Localized accessibility strings
- `src/vs/workbench/contrib/accessibility/browser/editorAccessibilityHelp.ts`: Keybinding & context-aware help wiring
- `FIND_ACCESSIBILITY_HELP_PRD.md`: Product requirements document

## Testing & Validation

1. Run existing accessibility and unit test suites:

```powershell
# from repo root
npm run test
```

2. Manually validate:
- Open editor find/replace and press `Alt+F1` — ensure help dialog appears
- Open terminal find and press `Alt+F1` — ensure terminal-specific help appears
- Verify help dialogs announce correctly in NVDA/JAWS

## Rollout / Follow-ups

- PR 2 (Content) depends on this PR and will add the concrete AccessibilityHelp provider files.
- PR 3 (Polish) will add ARIA hints and widget bug fixes after PR 2 is merged.

## Release Note (Required)

Provide a short release-note line for the changelog (one line):

```
Accessibility: Add foundational infrastructure for find/filter accessibility help (Alt+F1)
```

## Related
- See `PR-Config.ps1` for expected files and reviewers
- Related PRs: PR 2 — `feature/accessibility-help-content`, PR 3 — `feature/accessibility-aria-polish`
