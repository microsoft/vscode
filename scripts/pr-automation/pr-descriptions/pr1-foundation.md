<!--
PR 1 of 3: Foundation & Infrastructure for Accessibility Help System
Branch: feature/accessibility-help-foundation
-->

# [Accessibility] Foundation: Infrastructure and Wiring for Accessibility Help System

## Executive Summary

This PR establishes the foundational infrastructure that enables contextual accessibility help (Alt+F1) across all of VS Code's find and filter experiences. Screen reader users currently have no discoverable way to learn keyboard shortcuts and navigation patterns for find dialogs. This change introduces the platform wiring, configuration surface, and contribution registrations that subsequent PRs will build upon to deliver comprehensive accessibility help content.

**Target users:** Screen reader users (NVDA, JAWS, VoiceOver) and keyboard-first users who need discoverable help for find/filter functionality.

**Key insight from implementation:** In all find widgets (except when pressing Escape to close), focus remains in the find input when navigating between matches. This allows users to continue navigating or refine their search without having to return to the input. This behavior is now documented in the accessibility help content.

---

## Checklist

- [ ] Code follows VS Code contribution guidelines
- [ ] All user-visible strings use `nls.localize()` for localization
- [ ] TypeScript compilation passes (`npm run compile`)
- [ ] Existing tests pass (`npm run test`)
- [ ] Screen reader testing completed (NVDA/JAWS on Windows, VoiceOver on macOS)

---

## What This PR Includes

### 1. New Configuration Setting

**File:** `src/vs/workbench/contrib/accessibility/browser/accessibilityConfiguration.ts`

Added new verbosity setting for find experiences:

```typescript
export const enum AccessibilityVerbositySettingId {
    // ... existing settings ...
    Find = 'accessibility.verbosity.find'
}
```

| Setting Key | Type | Default | Description |
|-------------|------|---------|-------------|
| `accessibility.verbosity.find` | `boolean` | `true` | Provide information about how to access the find accessibility help menu when the find input is focused. |

When enabled and a screen reader is detected, find widgets will announce "Press Alt+F1 for accessibility help" on first focus.

### 3. Core Infrastructure Updates

**File:** `src/vs/editor/contrib/find/browser/findController.ts` (+6 lines)

- Imports `IAccessibilityService` for screen reader detection
- Passes accessibility service to `FindWidget` constructor
- Enables the find widget to provide context-aware accessibility hints

**File:** `src/vs/platform/accessibility/browser/accessibleView.ts` (+8 lines)

- Extended accessible view registry for find/filter context support
- Added `AccessibleViewProviderId.EditorFindHelp` identifier
- In2rastructure for help provider registration

### 4. Contribution Registrations (Wiring)

These changes register the forthcoming accessibility help providers with VS Code's contribution system. Each adds a single import/registration line that wires the help system into the component.

| File | Change | Purpose |
|------|--------|---------|
| `codeEditor.contribution.ts` | +1 line | Editor find/replace help registration |
| `terminal.find.contribution.ts` | +9 lines | Terminal find help registration |
| `webview.contribution.ts` | +5 lines | Webview find help registration |
| `output.contribution.ts` | +5 lines | Output panel filter help registration |
| `markers.contribution.ts` | +5 lines | Problems panel filter help registration |
| `search.contribution.ts` | +4 lines | Search across files help registration |
3
---

## Technical Implementation Details

### Accessible View Registry Pattern

The accessibility help system uses VS Code's established `AccessibleViewRegistry` pattern:

```typescript
// Registration pattern used in contribution files
AccessibleViewRegistry.register(new EditorFindAccessibilityHelp());
```

Each help provider implements `IAccessibleViewImplementation`:
- `priority`: Determines which provider activates when multiple match
- `name`: Unique identifier for the provider
- `when`: Context key expression defining activation conditions
- `type`: `AccessibleViewType.Help` for help content
- `getProvider()`: Factory returning the content provider

### Context Key Expressions

Help providers activate based on context keys:
- `CONTEXT_FIND_INPUT_FOCUSED` - Editor find input has focus
- `CONTEXT_REPLACE_INPUT_FOCUSED` - Editor replace input has focus
- Terminal, webview, and filter contexts have similar keys

### Verbosity Setting Integration

The verbosity setting follows the existing pattern for other VS Code accessibility verbosity settings:

```typescript
const baseVerbosityProperty: IConfigurationPropertySchema = {
    type: 'boolean',
    default: true,
    tags: ['accessibility']
};
```

---

## Testing & Validation

### Automated Testing

```powershell
# Run full test suite
npm run test

# Run accessibility-specific tests
npm run test -- --grep "accessibility"
```

### Manual Validation Steps

1. **Verify setting registration:**
   - Open Settings (Ctrl+,)
   - Search for "accessibility.verbosity.find"
   - Confirm setting appears with correct description
   - Toggle setting and verify it persists

2. **Verify contribution wiring:**
   - Open each component (Editor, Terminal, Output, Problems, Search)
   - Open the find/filter dialog
   - Press Alt+F1
   - Verify the Accessible View opens (content will be minimal until PR 2)

3. **Verify PRD accessibility:**
   - Open `FIND_ACCESSIBILITY_HELP_PRD.md` in VS Code
   - Verify document renders correctly in preview
   - Check all tables and code blocks are properly formatted

---

## Dependencies & Related PRs

| PR | Branch | Relationship |
|----|--------|--------------|
| **This PR** | `feature/accessibility-help-foundation` | Foundation (no dependencies) |
| PR 2 | `feature/accessibility-help-content` | Depends on this PR |
| PR 3 | `feature/accessibility-aria-polish` | Depends on PR 2 |

---

## Rollout Considerations

- **Feature flag:** Uses existing `accessibility.verbosity.*` pattern; no new feature flag needed
- **Telemetry:** No new telemetry in this PR
- **Performance:** Minimal impact; lazy-loaded help providers
- **Breaking changes:** None; additive changes only

---

## Release Note

```
Accessibility: Add foundational infrastructure for find/filter accessibility help (Alt+F1) - enables screen reader users to discover keyboard shortcuts and navigation patterns in find dialogs.
```

---

## Reviewers

- **Primary:** @isidorn (Accessibility), @jrieken (Editor)
- **Areas:** Editor, Terminal, Webview, Output, Problems, Search contribution files

---

## Files Changed Summary

| File | Lines | Type |
|--webview.contribution.ts` | +5 | Modified |
| `output.contribution.ts` | +5 | Modified |
| `markers.contribution.ts` | +5 | Modified |
| `search.contribution.ts` | +4 | Modified |
| **Total** | **+2,319 / -3** | **10 files** |
accessibilityConfiguration.ts` | +7 | Modified |
| `findController.ts` | +6 | Modified |
| `accessibleView.ts` | +8 | Modified |
| `codeEditor.contribution.ts` | +1 | Modified |
| `terminal.find.contribution.ts` | +9 | Modified |
| `webview.contribution.ts` | +5 | Modified |
| `output.contribution.ts` | +5 | Modified |
| `markers.contribution.ts` | +5 | Modified |
| `search.contribution.ts` | +4 | Modified |
| **Total** | **+50 / -0** | **9