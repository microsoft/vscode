<!--
One-line summary (will be used as PR summary):
Establish foundational infrastructure for the Accessibility Help System.
-->

# [Accessibility] Foundation: Infrastructure and Wiring for Accessibility Help System

> Executive summary: This PR delivers the foundational platform and wiring required
> to provide contextual accessibility help across VS Code's find and filter
> experiences. It focuses on infrastructure and integration points rather than
> user-facing content; content is added in subsequent PRs. Reviewers should be
> able to evaluate architectural intent and the configuration surface without
> sifting through content changes.

> Announcement / Context: This change is part of the Accessibility Help System
> initiative (Alt+F1) to make find/filter experiences discoverable to screen
> reader users and improve keyboard-first discoverability. Full announcement
> copy and the product requirements document are included below and linked in
> the `Related` section.

## Configuration (new setting)

We introduce a new accessibility verbosity setting to control how much contextual
help is announced to assistive technologies. The recommended setting key and
values are below; update the setting name if your implementation uses a
different configuration key.

- **Setting key (recommended):** `workbench.accessibility.helpVerbosity`
- **Type:** `string` (enum)
- **Allowed values:** `off`, `normal`, `verbose`
- **Default:** `normal`

Behavior:
- `off` — accessibility help is disabled; no automatic help announcements.
- `normal` — only essential contextual hints are announced (recommended default).
- `verbose` — provide expanded guidance and keyboard shortcut hints on focus.

Testing checklist for the setting is included in the Testing section below.

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
