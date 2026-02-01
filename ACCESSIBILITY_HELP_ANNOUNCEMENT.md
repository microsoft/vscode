# Comprehensive Accessibility Help for Find and Filter Experiences

## Overview

This document provides a complete guide to the new accessibility help system for find and filter experiences across VS Code. Users can now press **Alt+F1** (or the configured accessibility help keybinding) when focused in any find or filter input to receive context-specific, detailed help.

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Editor Find/Replace Help](#editor-findreplace-help)
3. [Terminal Find Help](#terminal-find-help)
4. [Webview Find Help](#webview-find-help)
5. [Output Panel Filter Help](#output-panel-filter-help)
6. [Problems Panel Filter Help](#problems-panel-filter-help)
7. [Debug Console Help](#debug-console-help)
8. [Search Across Files Help](#search-across-files-help)
9. [Key Features](#key-features)
10. [Settings and Configuration](#settings-and-configuration)
11. [Implementation Notes for Developers](#implementation-notes-for-developers)

---

## Executive Summary

### What Changed

- **New Accessible Help Feature**: Users can press Alt+F1 in any find or filter input to receive comprehensive, context-specific help.
- **Context-Aware Keybindings**: Help text correctly displays keyboard shortcuts based on current focus context (e.g., F3 vs Enter for navigation).
- **Unified Pattern**: All find/filter experiences follow the same accessibility help architecture for consistency.
- **Complete Documentation**: Each help screen includes search status, keyboard navigation, available options, relevant settings, and focus behavior explanation.

### Who Benefits

- **Screen Reader Users**: Detailed spoken information about dialog behavior, keyboard navigation, and current search state
- **Keyboard-Only Users**: Clear documentation of all available keyboard shortcuts
- **New Users**: Guided introduction to find/filter functionality without needing to open external documentation
- **Accessibility-Focused Teams**: Consistent, comprehensive accessibility support across the entire application

---

## Editor Find/Replace Help

### How to Access

When the find input or replace input is focused in an editor, press **Alt+F1** to open the accessibility help.

### Find Mode - Sample Help Text

```
Accessibility Help: Editor Find

You are in the Find dialog for the active editor. This dialog is where you type 
what you want to locate. The editor is a separate surface that shows each match 
and its surrounding context.

CURRENT SEARCH STATUS:
No search text entered yet. Start typing to find matches in the editor.

INSIDE THE FIND DIALOG (WHAT IT DOES):
While you are in the Find dialog, your focus stays in the input. You can keep 
typing, edit your search text, or move through matches without leaving the 
dialog. When you navigate to a match from here, the editor updates in the 
background, but your focus remains in the Find dialog.

WHAT YOU HEAR EACH TIME YOU MOVE TO A MATCH:
Each navigation step gives you a complete spoken update so you always know where 
you are. The order is consistent:

1) The full line that contains the match is read first, so you get immediate context.
2) Your position among the matches is announced, so you know how far you are through 
   the results.
3) The exact line and column are announced, so you know precisely where the match 
   is in the file.

This sequence happens every time you move forward or backward.

OUTSIDE THE FIND DIALOG (INSIDE THE EDITOR):
When you are focused in the editor instead of the Find dialog, you can still 
navigate matches.
- Press F3 to move to the next match.
- Press Shift+F3 to move to the previous match.
You hear the same three-step sequence: full line, match position, then line and 
column.

FOCUS BEHAVIOR (IMPORTANT):
When you navigate from inside the Find dialog, the editor updates while your 
focus stays in the input. This is intentional, so you can keep adjusting your 
search without losing your place.

If you want to move focus into the editor to edit text or inspect surrounding 
code, press Escape to close Find. Focus returns to the editor at the most recent 
match.

KEYBOARD NAVIGATION SUMMARY:

While focused IN the Find input:
- Enter: Move to the next match while staying in the Find dialog.
- Shift+Enter: Move to the previous match while staying in the Find dialog.
- F3: Also moves to the next match while staying in the Find dialog.
- Shift+F3: Also moves to the previous match while staying in the Find dialog.

While focused IN the editor (not the Find input):
- F3: Move to the next match.
- Shift+F3: Move to the previous match.

Note: Don't press Enter or Shift+Enter when focused in the editor - these will 
insert line breaks instead of navigating.

FIND OPTIONS IN THE DIALOG:
- Match Case: Only exact case matches are included.
- Whole Word: Only full words are matched.
- Regular Expression: Use pattern matching for advanced searches.
- Find in Selection: Limit matches to the current selection.

SETTINGS YOU CAN ADJUST (Ctrl+, opens Settings):
These settings affect how Find behaves or how matches are highlighted.
- `accessibility.verbosity.find`: Controls whether the Find input announces the 
  Accessibility Help hint.
- `editor.find.findOnType`: Runs Find as you type.
- `editor.find.cursorMoveOnType`: Moves the cursor to the best match while you type.
- `editor.find.seedSearchStringFromSelection`: Controls when selection text is used 
  to seed Find.
- `editor.find.autoFindInSelection`: Automatically enables Find in Selection based on 
  selection type.
- `editor.find.loop`: Wraps search at the beginning or end of the file.
- `editor.find.addExtraSpaceOnTop`: Adds extra scroll space so matches are not hidden 
  behind the Find dialog.
- `editor.find.history`: Controls whether Find search history is stored.
- `editor.occurrencesHighlight`: Highlights other occurrences of the current symbol.
- `editor.occurrencesHighlightDelay`: Controls how soon occurrences are highlighted.
- `editor.selectionHighlight`: Highlights other matches of the current selection.
- `editor.selectionHighlightMaxLength`: Limits selection highlight length.
- `editor.selectionHighlightMultiline`: Controls whether multi-line selections are 
  highlighted.

Platform-Specific Setting (macOS only):
- `editor.find.globalFindClipboard`: Uses the shared macOS Find clipboard when available.

CLOSING:
Press Escape to close Find. Focus returns to the editor at the most recent match, 
and your search history is preserved.
```

### Replace Mode - Sample Help Text

Replace mode includes all Find help plus additional replace-specific documentation:

```
[All Find documentation from above, plus:]

WHILE FOCUSED IN THE REPLACE INPUT:
- Enter: Replace the current match and move to the next.
- Ctrl+Shift+1: Replace only the current match.
- Ctrl+Alt+Enter: Replace all matches at once.
- Tab: Move between Find and Replace inputs.

ADDITIONAL REPLACE OPTIONS:
- Preserve Case: When replacing, maintains the case of the original match.

[Additional replace-specific settings documented]
```

---

## Terminal Find Help

### How to Access

When the find input in the terminal is focused, press **Alt+F1** to open the accessibility help.

### Sample Help Text

```
Accessibility Help: Terminal Find

You are in the Find dialog for the active terminal. This dialog lets you search 
through terminal output.

CURRENT SEARCH STATUS:
No search text entered yet. Start typing to search through terminal output.

INSIDE THE FIND DIALOG (WHAT IT DOES):
While in the Find dialog, your focus stays in the input. Type to search output, 
and navigation updates the highlighted match in the terminal.

KEYBOARD NAVIGATION:
- Enter: Move to the next match
- Shift+Enter: Move to the previous match

FIND OPTIONS:
- Match Case: Only exact case matches
- Whole Word: Only full word matches
- Regular Expression: Use pattern matching

CLOSING:
Press Escape to close Find. Focus returns to the terminal.
```

---

## Webview Find Help

### How to Access

When searching within a webview, press **Alt+F1** for accessibility help.

### Sample Help Text

```
Accessibility Help: Webview Find

You are in the Find dialog for webview content. This dialog lets you search 
within embedded web content.

[Information about finding text within webview containers]
[Navigation between matches]
[How webview find differs from editor find]

CLOSING:
Press Escape to close Find. Focus returns to the webview.
```

---

## Output Panel Filter Help

### How to Access

When the filter input in the Output panel is focused, press **Alt+F1** for accessibility help.

### Sample Help Text

```
Accessibility Help: Output Panel Filter

You are in the Filter input for the Output panel. This lets you filter output 
messages by search term.

FILTER FUNCTIONALITY DOCUMENTATION:
- Current filter status
- Keyboard shortcuts for filter operations
- How to navigate filtered output

SETTINGS:
[Output filter related settings]

CLOSING:
Press Escape to close the filter. The panel retains your filter settings.
```

---

## Problems Panel Filter Help

### How to Access

When the Problems panel filter is focused, press **Alt+F1** for accessibility help.

### Sample Help Text

```
Accessibility Help: Problems Panel Filter

You are in the Filter input for the Problems panel. This lets you filter diagnostic 
errors, warnings, and information messages.

FILTER FUNCTIONALITY:
- Filter by message text
- Filter by file name
- Filter by severity level

KEYBOARD NAVIGATION:
[Problems-specific navigation]

AVAILABLE FILTERS:
- Errors only
- Warnings only  
- Information only
- By source or file name

CLOSING:
Press Escape to close the filter. Your filter remains active for future sessions.
```

---

## Debug Console Help

### How to Access

When the Debug Console filter/input is focused, press **Alt+F1** for accessibility help.

### Sample Help Text

```
Accessibility Help: Debug Console

You are in the Debug Console filter or input area. This lets you search through 
console output and execute debug commands.

[Debug console specific help about filtering output]
[How to use the console input for debugging]
[REPL functionality documentation]

CLOSING:
Press Escape to close the filter. Focus returns to the console input.
```

---

## Search Across Files Help

### How to Access

When the Search input is focused, press **Alt+F1** for accessibility help.

### Sample Help Text

```
Accessibility Help: Search Across Files

You are in the Search dialog for finding text across all files in your workspace. 
This is more powerful than single-file Find.

CURRENT SEARCH STATUS:
No search text entered yet. Start typing to search across your workspace.

INSIDE THE SEARCH DIALOG:
While you are in the Search input, your focus stays in the input. You can type, 
edit, or navigate through results in the workspace-wide results panel.

WHAT YOU HEAR:
Each result navigation gives you:
1) The file name containing the match
2) The full line with the match
3) How many matches are in this file
4) Your position in the total results

FOCUS BEHAVIOR:
When you navigate from the Search input, the editor shows the match while focus 
stays in the search input. This lets you keep refining your search.

KEYBOARD NAVIGATION:
While focused IN the Search input:
- Enter: Move to the next match while staying in search dialog
- Shift+Enter: Move to the previous match while staying in search dialog

SEARCH OPTIONS:
- Match Case: Case-sensitive matching
- Whole Word: Full word matching only
- Regular Expression: Use regex patterns
- Include: Include specific file patterns
- Exclude: Exclude file patterns

REPLACE FUNCTIONALITY:
[Documentation for search and replace across files]

SETTINGS:
[Search related settings]

CLOSING:
Press Escape to close Search. Focus returns to the editor.
```

---

## Key Features

### Universal Access

- **Single Shortcut**: Alt+F1 consistently opens help across all find/filter contexts
- **Context Awareness**: Help content automatically adapts to the specific scenario
- **Dynamic Information**: Help shows current search term, match count, active options

### Platform-Specific Information

- **macOS**: Includes documentation for global Find clipboard usage
- **Windows/Linux**: Adapts settings and keybindings to platform conventions

### Comprehensive Documentation

Each help screen includes:
- **What You're In**: Clear explanation of the current interface
- **Current Status**: Real-time information about search state
- **Keyboard Navigation**: Complete keybinding reference
- **Available Options**: Toggle buttons and their effects
- **Settings Reference**: Relevant configuration options
- **Focus Behavior**: How focus moves during navigation
- **Closing Instructions**: How to exit and where focus returns

### Screen Reader Support

- **Structured Information**: Hierarchical content delivery
- **Clear Announcements**: Search state updates when navigating matches
- **Keybinding Resolution**: Correct shortcuts displayed based on focus context

---

## Settings and Configuration

### Primary Setting

**`accessibility.verbosity.find`** (default: `true`)

Controls whether find/filter inputs announce the hint "Press Alt+F1 for accessibility help" in their ARIA labels.

```json
{
  "accessibility.verbosity.find": true
}
```

### Related Settings

**Editor Find Settings:**
- `editor.find.findOnType` - Run find as you type
- `editor.find.cursorMoveOnType` - Move cursor to best match while typing
- `editor.find.seedSearchStringFromSelection` - Use selection to seed find
- `editor.find.autoFindInSelection` - Auto-enable find in selection
- `editor.find.loop` - Wrap search at file boundaries
- `editor.find.addExtraSpaceOnTop` - Add scroll space above find dialog
- `editor.find.history` - Store find history
- `editor.find.replaceHistory` - Store replace history
- `editor.find.globalFindClipboard` - Use macOS find clipboard (macOS only)

**Highlighting Settings:**
- `editor.occurrencesHighlight` - Highlight other symbol occurrences
- `editor.occurrencesHighlightDelay` - Delay before highlighting
- `editor.selectionHighlight` - Highlight other selection matches
- `editor.selectionHighlightMaxLength` - Max length to highlight
- `editor.selectionHighlightMultiline` - Highlight multi-line selections

---

## Implementation Notes for Developers

### Architecture

The accessibility help system uses a registration pattern through `AccessibleViewRegistry`. Each find/filter experience registers an `IAccessibleViewImplementation` that provides:

- **Priority**: Determines which provider activates when multiple are available
- **Name**: Unique identifier for the help provider  
- **When**: Context key expression controlling activation
- **Provider**: Returns an `IAccessibleViewContentProvider` with the help content

### Context-Aware Keybinding Resolution

A critical feature is the use of context overlays to resolve keybindings correctly:

```typescript
// Create overlay simulating editor focus (not find dialog)
this._editorContextKeyService = contextKeyService.createOverlay([
    [EditorContextKeys.focus.key, true],
    [CONTEXT_FIND_INPUT_FOCUSED.key, false],
    [CONTEXT_REPLACE_INPUT_FOCUSED.key, false]
]);

// Look up keybinding for editor context
const keybinding = this._keybindingService.lookupKeybinding(
    'editor.action.nextMatchFindAction',
    this._editorContextKeyService,
    true
);
```

This ensures "F3" is shown when appropriate, and "Enter" is shown when focused in find dialog.

### Localization

All strings use `localize()` from `nls.js`:

```typescript
localize('find.header', "Accessibility Help: Editor Find")
```

This supports international deployment and continuous localization updates.

### Bug Fixes and Improvements

**ARIA Alert Timing**
- Alerts only announced when search string is present
- aria-label updated before widget becomes visible
- Prevents premature clearing of accessibility hints

**Focus Behavior**
- Updates only occur when widget is visible
- Prevents state changes before user can interact

### Files Modified

**New Files:**
- `src/vs/workbench/contrib/codeEditor/browser/editorFindAccessibilityHelp.ts`
- `src/vs/workbench/contrib/terminalContrib/find/browser/terminalFindAccessibilityHelp.ts`
- `src/vs/workbench/contrib/webview/browser/webviewFindAccessibilityHelp.ts`
- `src/vs/workbench/contrib/output/browser/outputAccessibilityHelp.ts`
- `src/vs/workbench/contrib/markers/browser/markersAccessibilityHelp.ts`
- `src/vs/workbench/contrib/debug/browser/replAccessibilityHelp.ts`
- `src/vs/workbench/contrib/search/browser/searchAccessibilityHelp.ts`

**Modified Files:**
- `src/vs/editor/common/standaloneStrings.ts` - Added `findNavigation` string
- `src/vs/workbench/contrib/accessibility/browser/editorAccessibilityHelp.ts` - Added context-aware keybinding lookup
- `src/vs/editor/contrib/find/browser/findWidget.ts` - Bug fixes for ARIA support

---

## User Benefits Summary

### Discoverability

Users now have immediate, discoverable help for find/filter functionality without needing to:
- Search external documentation
- Memorize keyboard shortcuts
- Puzzle through interface conventions

### Accessibility

Screen reader users receive:
- Complete information about dialog behavior
- Current search status and match position
- Correct keyboard shortcuts for their focus context
- Clear explanation of focus movement

### Consistency

All find/filter experiences now provide:
- Same help activation method (Alt+F1)
- Same information structure
- Same visual/audio presentation
- Consistent keyboard behavior

### Extensibility

Future find/filter implementations can easily register help providers by:
1. Creating new provider class implementing `IAccessibleViewImplementation`
2. Providing dynamic help content in `provideContent()` method
3. Registering with `AccessibleViewRegistry.register()`

---

## Testing Accessibility Help

### For Screen Reader Users (NVDA, JAWS, VoiceOver)

1. Open any find dialog (Ctrl+F or Cmd+F)
2. Focus in the find input
3. Press Alt+F1 (or configured accessibility help keybinding)
4. Screen reader reads comprehensive help
5. Verify all keybindings are current for your platform
6. Verify search status is announced correctly

### For Keyboard Users

1. Open find dialog
2. Press Alt+F1 to verify help opens
3. Navigate help with arrow keys
4. Verify all mentioned keyboard shortcuts work as documented
5. Test focus movement matches behavior described in help

### For Visual Users

1. Verify help UI displays correctly at all zoom levels
2. High contrast mode support
3. Color contrast meets WCAG standards

---

## References

- **VS Code Accessibility Guide**: https://go.microsoft.com/fwlink/?linkid=851010
- **WAI-ARIA Authoring Practices**: https://www.w3.org/WAI/ARIA/apg/
- **WCAG 2.1 Standards**: https://www.w3.org/WAI/WCAG21/quickref/

