<!--
PR 3 of 3: ARIA Hints and Bug Fixes for Find Widgets
Branch: feature/accessibility-aria-polish
-->

# [Accessibility] Polish: ARIA Hints and Bug Fixes for Find Widgets

## Executive Summary

This PR completes the Accessibility Help System with critical UX polish: ARIA hint announcements that guide users to the help system, and bug fixes for spurious screen reader announcements. These changes ensure that screen reader users discover the Alt+F1 help feature and experience a clean, predictable announcement flow.

**Key improvements:**
1. **Discoverability:** All find inputs now announce "Press Alt+F1 for accessibility help" on first focus
2. **Double-speak prevention:** Hint is announced once per dialog session, not on every focus
3. **Bug fixes:** Eliminated spurious "No results" announcements and stale aria-label updates

---

## Checklist

- [ ] Code follows VS Code contribution guidelines
- [ ] All user-visible strings use `nls.localize()` for localization
- [ ] TypeScript compilation passes
- [ ] Existing tests pass
- [ ] Screen reader testing completed with NVDA/JAWS
- [ ] No regressions in existing find functionality

---

## What This PR Includes

### Bug Fixes (2 Critical Screen Reader Issues)

#### Bug 1: Spurious "No Results" Announcement

**File:** `src/vs/editor/contrib/find/browser/findWidget.ts`

**Problem:** When opening the find widget with an empty search field, screen readers would announce "No results" immediately, even though the user hadn't searched for anything yet.

**Root cause:** The `_updateMatchesCount()` method was unconditionally updating the aria-label, which triggered a screen reader announcement.

**Fix:** Only compute and announce results when `searchString.length > 0`:

```typescript
// Before (buggy)
private _getAriaLabel(label: string, currentMatch: Range | null, searchString: string): string {
    if (label === NLS_NO_RESULTS) {
        return nls.localize('ariaSearchNoResult', "{0} found for '{1}'", label, searchString);
    }
    // ...
}

// After (fixed)
private _getAriaLabel(label: string, currentMatch: Range | null, searchString: string): string {
    let result: string;
    if (label === NLS_NO_RESULTS) {
        result = searchString === ''
            ? nls.localize('ariaSearchNoResultEmpty', "{0} found", label)
            : nls.localize('ariaSearchNoResult', "{0} found for '{1}'", label, searchString);
    }
    // ...
}
```

**User impact:** Screen reader users no longer hear confusing "No results" messages when first opening find.

---

#### Bug 2: Stale aria-label Updates When Widget Hidden

**File:** `src/vs/editor/contrib/find/browser/findWidget.ts`

**Problem:** The find widget was updating its aria-label even when hidden, causing screen readers to announce stale match counts or other information unexpectedly.

**Root cause:** Match count updates were triggered by editor content changes, which could happen while the find widget was hidden.

**Fix:** Check widget visibility before updating aria-label:

```typescript
private _updateFindInputAriaLabel(): void {
    // Only update if widget is visible
    if (!this._isVisible) {
        return;
    }
    // ... proceed with aria-label update
}
```

**User impact:** No more unexpected announcements from hidden find dialogs.

---

### ARIA Hint Announcements (6 Files)

All find/filter widgets now announce "Press Alt+F1 for accessibility help" with double-speak prevention.

#### Double-Speak Prevention Pattern

Each widget implements this pattern to ensure the hint is announced exactly once per dialog session:

```typescript
private _accessibilityHelpHintAnnounced: boolean = false;

private _updateFindInputAriaLabel(): void {
    let label = NLS_FIND_INPUT_LABEL;

    // Only add hint if:
    // 1. Not yet announced this session
    // 2. Verbosity setting is enabled
    // 3. Screen reader is active
    if (!this._accessibilityHelpHintAnnounced &&
        this._configurationService.getValue(AccessibilityVerbositySettingId.Find) &&
        this._accessibilityService.isScreenReaderOptimized()) {

        const keybinding = this._keybindingService
            .lookupKeybinding('editor.action.accessibilityHelp')
            ?.getAriaLabel();

        if (keybinding) {
            const hint = nls.localize('accessibilityHelpHint',
                "Press {0} for accessibility help", keybinding);
            label = `${label}, ${hint}`;
        }

        this._accessibilityHelpHintAnnounced = true;

        // Reset to plain label after 1 second (allows re-announcement on re-reveal)
        setTimeout(() => {
            this._findInput.inputBox.ariaLabel = NLS_FIND_INPUT_LABEL;
        }, 1000);
    }

    this._findInput.inputBox.ariaLabel = label;
}

// Reset flag when widget is hidden
private _hide(): void {
    this._accessibilityHelpHintAnnounced = false;
    // ...
}
```

---

#### File-by-File Changes

| File | Widget | Change |
|------|--------|--------|
| `findWidget.ts` | Editor find | Bug fixes + hint announcement |
| `simpleFindWidget.ts` | Base widget (Terminal/Webview/Browser) | Hint announcement pattern |
| `searchWidget.ts` | Search across files | Hint announcement + `resetAccessibilityHelpHint()` |
| `terminalFindWidget.ts` | Terminal find | Inherits from simpleFindWidget |
| `webviewFindWidget.ts` | Webview find | Inherits from simpleFindWidget |
| `viewFilter.ts` | Tree filters (Output/Problems/Debug) | Hint announcement + reset method |

---

### Detailed File Changes

#### 1. `src/vs/editor/contrib/find/browser/findWidget.ts` (+48 / -12 lines)

**New imports:**
```typescript
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
```

**New constructor parameters:**
```typescript
constructor(
    // ... existing params ...
    private readonly _configurationService: IConfigurationService,
    private readonly _accessibilityService: IAccessibilityService,
)
```

**New instance variable:**
```typescript
private _accessibilityHelpHintAnnounced: boolean = false;
```

**New/modified methods:**
- `_updateFindInputAriaLabel()` - Adds hint on first reveal
- `_getAriaLabel()` - Fixed to handle empty search string
- `reveal()` - Calls `_updateFindInputAriaLabel()` after visibility
- `_hide()` - Resets `_accessibilityHelpHintAnnounced`

---

#### 2. `src/vs/workbench/contrib/codeEditor/browser/find/simpleFindWidget.ts` (+35 lines)

Base widget used by Terminal, Webview, and Browser find. Changes mirror `findWidget.ts`:
- New service dependencies: `IConfigurationService`, `IAccessibilityService`
- New `_accessibilityHelpHintAnnounced` flag
- New `_updateFindInputAriaLabel()` method
- Reset flag on close

---

#### 3. `src/vs/workbench/contrib/search/browser/searchWidget.ts` (+30 lines)

Search widget changes:
- New `_accessibilityHelpHintAnnounced` flag
- New `_updateSearchInputAriaLabel()` method
- New `resetAccessibilityHelpHint()` public method for external reset
- Hint integrated with existing aria-label logic

---

#### 4. `src/vs/workbench/contrib/terminalContrib/find/browser/terminalFindWidget.ts` (+8 lines)

Extends `SimpleFindWidget`; inherits ARIA hint behavior.
- Minor adjustments to pass services to base class

---

#### 5. `src/vs/workbench/contrib/webview/browser/webviewFindWidget.ts` (+8 lines)

Extends `SimpleFindWidget`; inherits ARIA hint behavior.
- Minor adjustments to pass services to base class

---

#### 6. `src/vs/workbench/browser/parts/views/viewFilter.ts` (+32 lines)

Used by Output, Problems, Debug Console, and Comments filters:
- New `_accessibilityHelpHintAnnounced` flag
- New `_updateFilterInputAriaLabel()` method
- New `resetAccessibilityHelpHint()` public method
- Hint announced on first focus of filter input

---

## Testing & Validation

### Bug Fix Verification

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Empty search no announcement | Open editor, Ctrl+F, do not type | No "No results" announcement |
| Search then clear | Search for "test", clear field | No announcement on clear |
| Hidden widget no update | Open find, close, edit document | No stale announcements |

### ARIA Hint Verification

| Widget | Steps | Expected Result |
|--------|-------|-----------------|
| Editor find | Ctrl+F (first time) | Hear "Find input, Press Alt+F1 for accessibility help" |
| Editor find | Tab away, Tab back | Hear "Find input" (no repeat hint) |
| Editor find | Escape, Ctrl+F again | Hear hint again (new session) |
| Terminal find | Ctrl+F in terminal | Hear hint |
| Search | Focus search input | Hear hint |
| Problems filter | Focus filter | Hear hint |

### Screen Reader Testing

**NVDA (Windows):**
```
1. Enable NVDA
2. Open VS Code
3. Ctrl+F to open find
4. Verify: "Find input, Press Alt plus F1 for accessibility help"
5. Press Tab, Shift+Tab back to find input
6. Verify: "Find input" (no repeat)
7. Press Escape, then Ctrl+F
8. Verify: Hint announced again
```

**JAWS (Windows):**
- Same verification steps
- Verify keybinding is spoken correctly ("Alt plus F1")

**VoiceOver (macOS):**
- Same verification steps
- Keybinding will be platform-adjusted ("Option F1" or similar)

---

## Dependencies

| PR | Status | Requirement |
|----|--------|-------------|
| PR 1 (Foundation) | Must be merged | Provides `AccessibilityVerbositySettingId.Find` |
| PR 2 (Content) | Must be merged | Provides the help content users access via Alt+F1 |

---

## Rollout Considerations

- **Performance:** Minimal; keybinding lookup is cached, hint only computed once per session
- **Localization:** Hint string uses `nls.localize()` with `{0}` placeholder for keybinding
- **Settings respect:** Honors `accessibility.verbosity.find` setting
- **Screen reader detection:** Only shows hint when `isScreenReaderOptimized()` is true

---

## Known Limitations

1. **Timing-sensitive:** The 1-second reset timeout is a heuristic; some screen readers may behave slightly differently
2. **Custom keybindings:** Users with remapped Alt+F1 will hear their custom binding
3. **Nested widgets:** If a widget contains sub-widgets with find, hint may announce in parent only

---

## Release Note

```
Accessibility: Add ARIA hint announcements ("Press Alt+F1 for accessibility help") to find/filter inputs with double-speak prevention; fix spurious "No results" announcements and stale aria-label updates in find widgets.

---

## Files Changed Summary

| File | Lines Changed | Type |
|------|---------------|------|
| `findWidget.ts` | +48 / -12 | Modified (bug fixes + hints) |
| `simpleFindWidget.ts` | +35 | Modified (hints) |
| `searchWidget.ts` | +30 | Modified (hints) |
| `terminalFindWidget.ts` | +8 | Modified (service wiring) |
| `webviewFindWidget.ts` | +8 | Modified (service wiring) |
| `viewFilter.ts` | +32 | Modified (hints) |
| **Total** | **+189 / -13** | **6 files** |
