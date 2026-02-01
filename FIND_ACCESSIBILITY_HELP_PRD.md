# PRD: Enhanced Accessibility Help for All Find and Filter Experiences

## 🎯 Implementation Status (Updated)

### Critical Focus Behavior Corrections

During implementation review, the following critical focus behavior inaccuracies were identified and corrected:

| Context | Original (Incorrect) | Corrected (Accurate) |
| --- | --- | --- |
| Editor Find | "Focus often moves into the editor" | Focus STAYS in Find input when pressing Enter |
| Terminal Find | "Enter jumps to next match" | Enter jumps to PREVIOUS match (opposite of editor) |
| Terminal Find | Focus behavior unclear | Focus STAYS in Find input |
| Webview Find | "Focus may move into webview" | Focus STAYS in Find input |
| Search | Focus behavior unclear | Enter runs search (focus stays), F4/Enter on result moves focus to editor |

**Key Insight**: In all find widgets (except when pressing Escape to close), focus remains in the find input when navigating between matches. This allows users to continue navigating or refine their search without having to return to the input.

### Current Implementation State

| Context | Help Provider | ARIA Hint Announced | Double-Speak Prevention |
| --- | --- | --- | --- |
| Editor Find/Replace | ✅ Complete | ✅ Complete | ✅ Complete |
| Terminal Find | ✅ Complete | ✅ Complete | ✅ Complete |
| Webview Find | ✅ Complete | ✅ Complete | ✅ Complete |
| Browser Find | ✅ Complete | ✅ Complete | ✅ Complete |
| Output Filter | ✅ Complete | ✅ Complete | ✅ Complete |
| Problems Filter | ✅ Complete | ✅ Complete | ✅ Complete |
| Debug Console | ✅ Complete | ✅ Complete | ✅ Complete |
| Comments Filter | ✅ Complete | ✅ Complete | ✅ Complete |
| Search Across Files | ✅ Complete | ✅ Complete | ✅ Complete |

### Key Implementation Details

**Help Providers**: All accessibility help providers are implemented and registered.

**ARIA Hint Implementation (All Contexts)**:
All find/filter widgets now announce "Press Alt+F1 for accessibility help" with double-speak prevention:

1. **Editor Find/Replace** (`findWidget.ts`):
   - `_accessibilityHelpHintAnnounced` flag tracks if hint was spoken
   - Hint added to ARIA label on reveal, reset after 1 second
   - Flag reset in `_hide()` method

2. **SimpleFindWidget** (`simpleFindWidget.ts`) - Used by Terminal, Webview, Browser:
   - `_updateFindInputAriaLabel()` method adds hint on first reveal
   - Requires IConfigurationService and IAccessibilityService
   - `_accessibilityHelpHintAnnounced` flag with 1-second reset

3. **Search Widget** (`searchWidget.ts`):
   - `_updateSearchInputAriaLabel()` method adds hint on focus
   - `resetAccessibilityHelpHint()` method for external reset
   - Same double-speak prevention pattern

4. **FilterWidget** (`viewFilter.ts`) - Used by Output, Problems, Debug Console, Comments:
   - `_updateFilterInputAriaLabel()` method adds hint on focus
   - `resetAccessibilityHelpHint()` method available
   - Same double-speak prevention pattern

**Pattern Used in All Implementations**:
The editor find widget now announces "Press Alt+F1 for accessibility help" with double-speak prevention:

```typescript
// In findWidget.ts
private _accessibilityHelpHintAnnounced: boolean = false;

private _updateFindInputAriaLabel(): void {
  let findLabel = NLS_FIND_INPUT_LABEL;
  let replaceLabel = NLS_REPLACE_INPUT_LABEL;

  // Only add hint if not yet announced this session
  if (!this._accessibilityHelpHintAnnounced &&
      this._configurationService.getValue('accessibility.verbosity.find') &&
      this._accessibilityService.isScreenReaderOptimized()) {
    const accessibilityHelpKeybinding = this._keybindingService.lookupKeybinding('editor.action.accessibilityHelp')?.getAriaLabel();
    if (accessibilityHelpKeybinding) {
      const hint = nls.localize('accessibilityHelpHintInLabel', "Press {0} for accessibility help", accessibilityHelpKeybinding);
      findLabel = nls.localize('findInputAriaLabelWithHint', "{0}, {1}", findLabel, hint);
      replaceLabel = nls.localize('replaceInputAriaLabelWithHint', "{0}, {1}", replaceLabel, hint);
    }
    this._accessibilityHelpHintAnnounced = true;

    // Reset to plain labels after 1 second to prevent re-announcement on tab
    setTimeout(() => {
      this._findInput.inputBox.setAriaLabel(NLS_FIND_INPUT_LABEL);
      this._replaceInput.inputBox.setAriaLabel(NLS_REPLACE_INPUT_LABEL);
    }, 1000);
  }

  this._findInput.inputBox.setAriaLabel(findLabel);
  this._replaceInput.inputBox.setAriaLabel(replaceLabel);
}

// Reset flag when widget hides so next open announces hint again
private _hide(focusTheEditor: boolean): void {
  // ...
  if (this._isVisible) {
    this._isVisible = false;
    this._accessibilityHelpHintAnnounced = false;  // Reset for next session
    // ...
  }
}
```

**Double-Speak Prevention Pattern**:
1. Track if hint was announced with `_accessibilityHelpHintAnnounced` flag
2. On first reveal, set ARIA labels WITH hint ("Find, Press Alt+F1 for accessibility help")
3. After 1 second, reset labels to plain versions ("Find", "Replace")
4. When widget hides (Esc), reset flag so next Ctrl+F/H announces hint again
5. Tabbing within the widget doesn't re-announce the hint

### Remaining Work

**Potential Future Enhancements**:
- Test with all screen readers (NVDA, JAWS, VoiceOver, Narrator)
- Consider adding user feedback mechanism for help content
- Monitor for any double-speak issues reported by users

### Key Discovery: Most Features Already Exist

During implementation, we discovered that VS Code already has comprehensive accessibility help implementations for most find/filter contexts:

| Context | Existing Implementation | Location |
| --- | --- | --- |
| Editor Find/Replace | ✅ `editorFindAccessibilityHelp.ts` | `workbench/contrib/codeEditor/browser/` |
| Terminal Find | ✅ `terminalFindAccessibilityHelp.ts` | `workbench/contrib/terminalContrib/find/browser/` |
| Webview Find | ✅ `webviewFindAccessibilityHelp.ts` | `workbench/contrib/webview/browser/` |
| Output Filter | ✅ `outputAccessibilityHelp.ts` | `workbench/contrib/output/browser/` |
| Problems Filter | ✅ `markersAccessibilityHelp.ts` | `workbench/contrib/markers/browser/` |
| Search | ✅ `searchAccessibilityHelp.ts` | `workbench/contrib/search/browser/` |
| Debug Console | ✅ `replAccessibilityHelp.ts` | `workbench/contrib/debug/browser/` |

### Actual Changes Made

**Enhanced existing Debug Console help** to include filter information:

- **Modified**: `src/vs/workbench/contrib/debug/browser/replAccessibilityHelp.ts`
- **Added**: Filter usage documentation (how to focus filter, filter syntax, exclude patterns)

**Updated accessibility help files to use platform-agnostic keybinding syntax**:

- **Modified**: `src/vs/workbench/contrib/codeEditor/browser/editorFindAccessibilityHelp.ts`
  - Replaced 11 hardcoded shortcuts (e.g., "Ctrl+F (Cmd+F on Mac)") with `<keybinding:commandId>` syntax
- **Modified**: `src/vs/workbench/contrib/search/browser/searchAccessibilityHelp.ts`
  - Replaced 7 hardcoded shortcuts with `<keybinding:commandId>` syntax
- **Modified**: `src/vs/workbench/contrib/terminalContrib/find/browser/terminalFindAccessibilityHelp.ts`
  - Replaced 3 hardcoded shortcuts with `<keybinding:commandId>` syntax
- **Modified**: `src/vs/workbench/contrib/webview/browser/webviewFindAccessibilityHelp.ts`
  - Replaced 4 hardcoded shortcuts with `<keybinding:commandId>` syntax

**Platform-specific keybinding resolution**: The `<keybinding:commandId>` syntax is automatically resolved by `accessibleViewKeybindingResolver.ts` using `keybindingService.lookupKeybinding()`, which returns platform-appropriate labels (e.g., "Ctrl+F" on Windows, "⌘F" on Mac).

**Removed duplicate files** created during initial implementation:

- `src/vs/workbench/contrib/accessibility/browser/editorFindAccessibilityHelp.ts` (deleted)
- `src/vs/workbench/contrib/accessibility/browser/editorReplaceAccessibilityHelp.ts` (deleted)
- `src/vs/workbench/contrib/accessibility/browser/terminalFindAccessibilityHelp.ts` (deleted)
- `src/vs/workbench/contrib/accessibility/browser/webviewFindAccessibilityHelp.ts` (deleted)
- `src/vs/workbench/contrib/accessibility/browser/outputAccessibilityHelp.ts` (deleted)
- `src/vs/workbench/contrib/accessibility/browser/problemsAccessibilityHelp.ts` (deleted)
- `src/vs/workbench/contrib/accessibility/browser/debugConsoleAccessibilityHelp.ts` (deleted)
- `src/vs/workbench/contrib/accessibility/browser/findAccessibilityHelpStrings.ts` (deleted)
- `src/vs/workbench/contrib/accessibility/browser/findAccessibilityHelpUtils.ts` (deleted)

### Recommendation

The existing VS Code implementations follow proper patterns and are already registered. Future enhancements should:

1. **Enhance existing files** rather than creating new ones
2. Follow the established `IAccessibleViewImplementation` pattern
3. Use `AccessibleViewRegistry.register()` for registration
4. Use existing context keys where available

---

## Executive Summary

Add comprehensive, inclusive Accessibility Help content to all find and filter experiences in VS Code. When a find or filter input is focused, users can press Alt+F1 to open Accessibility Help tailored to that specific experience. This help content is designed to be:

- **Hand-holding**: Explains not just "what" features do, but "why" and "how" to use them
- **Contextual**: Includes current search term, match count, position, and what's being searched
- **Transparent about behavior**: Clarifies differences between find (navigate matches) and filter (hide non-matching content)
- **Fully inclusive**: Uses first and second person language, avoids jargon, and is designed for screen reader users as the primary audience
- **Screen reader optimized**: Structured with clear headings, scannable sections, and consistent formatting
- **Consistent across all contexts**: One unified approach for Accessibility Help hints and announcements

Accessibility Help hints are controlled by a single setting: `accessibility.verbosity.find` (default: `true`). When enabled, help hints are automatically included in ARIA labels for all find and filter inputs. This setting controls help discoverability across all 8 find contexts from one place.

Terminology note: This implementation is for "Accessibility Help" (Alt+F1), not Accessible View. The help content is a focused narrative that explains the current experience and provides navigation guidance.

## Scope

In scope now:
- Editor Find
- Editor Replace
- Search Across Files
- Integrated Terminal Find
- Webview Find
- Output Panel Find
- Problems Panel Filter
- Debug Console Filter

Out of scope:
- Changing existing ARIA match count announcements
- Adding audio signals for find operations

## Problem Statement

Find experiences behave differently across VS Code views, and screen reader users lack a consistent, discoverable way to get contextual guidance. Accessibility Help (Alt+F1) is the expected entry point for help content, but it is not currently wired for find inputs. This creates gaps in discoverability, match context, and keyboard navigation clarity.

## Goals

- Provide accessible, comprehensive Accessibility Help for all find and filter experiences.
- Include current match or filter status and context dynamically.
- Clearly describe what users "do" (navigate, search, replace, filter) rather than just technical details.
- Use hand-holding language that explains not just features but the "why" behind them.
- Be transparent about focus behavior, state changes, and differences between experiences.
- Support multiple cultures and languages with clear localization guidelines.
- Use one setting (`accessibility.verbosity.find`) to control Accessibility Help hints for all find experiences.
- Ensure the help content itself is a model of accessibility best practices.

## Non-Goals

- Modifying behavior of find widgets.
- Duplicating existing match count announcements.
- Introducing new context keys unless necessary.

## User Stories

- As a screen reader user, I can press Alt+F1 in any find or filter input to hear guidance tailored to that experience.
- As a screen reader user, I understand whether I am filtering or navigating matches and how to move forward or backward.
- As a user, I can enable or disable Accessibility Help hints for all find experiences with the `accessibility.verbosity.find` setting.

## UX and Accessibility

### Accessibility Help Trigger

- When a find or filter input is focused, Alt+F1 opens Accessibility Help.
- Help content is tailored to the active find experience.
- Help content is readable as a single continuous narrative, with short section labels.

### Keybinding

- Alt+F1 is the Accessibility Help entry point for all find experiences in scope.
- If a default keybinding change is required, include it with this work to keep help discoverable and consistent.

### Accessibility Help Discovery and Control

- A single setting `accessibility.verbosity.find` (default: `true`) gates Accessibility Help hints for all find and filter inputs.
- When enabled, screen readers announce: "Press Alt+F1 for Accessibility Help" automatically in ARIA labels.
- Users can disable hints for all find experiences with one setting change.
- One setting = consistent control across all 8 find contexts.

## Design Principles

This content follows eight core principles to ensure accessibility help is truly helpful:

1. **Hand-Holding and Guidance**: Help users discover and understand each feature naturally, as if a patient guide is explaining it. Don't assume users know keyboard shortcuts or how to navigate. Explain what happens when they press keys, step by step.

2. **Fully Inclusive Language**: Use conversational you/I language. Avoid jargon and acronyms. Explain both WHAT features do AND WHY they help. Write for screen reader users as a primary audience while ensuring sighted users benefit too.

3. **Clear Mental Models**: Help users understand conceptual differences:
   - **Find/Search** (navigate between matches) vs. **Filter** (hide non-matching content)
   - **Case sensitive** vs. **whole word** vs. **regular expressions**
   - **Editor scope** vs. **workspace scope**
   - **Focus behavior** and where it moves after actions

4. **Contextual and Dynamic**: Always include current state:
   - Current search/filter term
   - Number of matches or results with position (e.g., "3 of 12 matches")
   - What's being searched (current file, workspace, terminal buffer, webview, etc.)
   - Whether results are being modified (e.g., "No matches found")

5. **Screen Reader Optimized**:
   - Use short, scannable sections with clear headings
   - Lead with the most important info ("You are searching for...")
   - Use consistent, descriptive command naming
   - Announce state clearly changes dynamically (e.g., match count updates)
   - Organize by what users DO, not by UI elements

6. **Actionable and Task-Focused**: Organize content by user goals (navigate matches, run search, replace, filter, etc.), not by UI structure. Explain the effect and side effects of each action. Include focus movement info.

7. **Consistently Accessible**: The help content itself is a model of good accessibility. Structured headings, clear formatting, logical flow, no hidden complexity—everything screen readers and assistive tech need to convey content accurately.

8. **Honest About Limitations**: If a feature doesn't work as expected in certain contexts, explain why. Provide workarounds and help users understand the reason (e.g., webview keyboard interception, terminal restrictions).

## Localization and Cultural Considerations

All content must be carefully localized, not just translated:

1. **Metaphor Awareness**: Examples and metaphors should be culturally appropriate. For instance, "screen reader announces" works globally, but avoid culture-specific references.

2. **Directional Language**: Content uses "forward/next" and "backward/previous" equally to avoid assumption of reading direction. Both concepts are explicitly supported.

3. **Abbreviation Clarity**: Explain abbreviations on first use (e.g., "Alt plus C (case sensitivity)"). Some abbreviations translate poorly, so provide full descriptions.

4. **Universal Phrases**: Use universally understandable language. Avoid idioms like "getting the hang of this" or "piece of cake."

5. **Consistent Naming**: Key terms (Match, Result, Problem, Filter, Replace) must be consistently named in translations so users develop mental models that don't break between languages.

6. **Keyboard Notation**: Always specify both Windows ([Ctrl], [Alt], [Enter]) and Mac ([Cmd], [Option], [Return]) keybindings, since some content may be read aloud or translated by users working across platforms.

7. **Number Handling**: Numbers and counts ("3 of 12 matches") must be formatted according to locale rules (comma vs. period as separator).

## Accessibility Help Content

All texts below are the content returned by the Accessibility Help provider when Alt+F1 is pressed in the corresponding experience. The content is designed to be:

- **Clear and conversational**: Written in first and second person to feel like a guide
- **Contextual**: Includes current search/filter state with match or result information
- **Actionable**: Focuses on "how to do things" rather than just describing features
- **Screen reader friendly**: Organized into short sections that are easy to traverse with arrow keys
- **Inclusive**: Explains behavior differences explicitly so no one is guessing
- **Professional and focused for screen reader users**: Highly descriptive about focus behavior and current context

### 1. Editor Find

**Header:**
Accessibility Help: Editor Find
You are in the Find dialog for the active editor. This dialog is where you type what you want to locate. The editor is a separate surface that shows each match and its surrounding context.

**Current Search Status:**
You are searching for: "{searchTerm}".
Match {position} of {total}.
If there are no matches: No matches found in the current file. Try adjusting your search text or the options below.

**Inside the Find Dialog (What It Does):**
While you are in the Find dialog, your focus stays in the input. You can keep typing, edit your search text, or move through matches without leaving the dialog.
When you navigate to a match from here, the editor updates in the background, but your focus remains in the Find dialog.

**What You Hear Each Time You Move to a Match:**
Each navigation step gives you a complete spoken update so you always know where you are. The order is consistent:
1) The full line that contains the match is read first, so you get immediate context.
2) Your position among the matches is announced, so you know how far you are through the results.
3) The exact line and column are announced, so you know precisely where the match is in the file.

This sequence happens every time you move forward or backward.

**Outside the Find Dialog (Inside the Editor):**
When you are focused in the editor instead of the Find dialog, you can still navigate matches.
- Press <keybinding:editor.action.nextMatchFindAction> to move to the next match.
- Press <keybinding:editor.action.previousMatchFindAction> to move to the previous match.
You hear the same three-step sequence: full line, match position, then line and column.

**Focus Behavior (Important):**
When you navigate from inside the Find dialog, the editor updates while your focus stays in the input. This is intentional, so you can keep adjusting your search without losing your place.
If you want to move focus into the editor to edit text or inspect surrounding code, press Escape to close Find. Focus returns to the editor at the most recent match.

**Keyboard Navigation Summary:**
- Enter: Move to the next match while staying in the Find dialog.
- Shift+Enter: Move to the previous match while staying in the Find dialog.
- <keybinding:editor.action.nextMatchFindAction>: Move to the next match from inside the editor.
- <keybinding:editor.action.previousMatchFindAction>: Move to the previous match from inside the editor.

**Find Options in the Dialog:**
- Match Case: Only exact case matches are included.
- Whole Word: Only full words are matched.
- Regular Expression: Use pattern matching for advanced searches.
- Find in Selection: Limit matches to the current selection.

**Settings You Can Adjust (Ctrl+, opens Settings):**
These settings affect how Find behaves or how matches are highlighted.
- `accessibility.verbosity.find`: Controls whether the Find input announces the Accessibility Help hint.
- `editor.find.findOnType`: Runs Find as you type.
- `editor.find.cursorMoveOnType`: Moves the cursor to the best match while you type.
- `editor.find.seedSearchStringFromSelection`: Controls when selection text is used to seed Find.
- `editor.find.autoFindInSelection`: Automatically enables Find in Selection based on selection type.
- `editor.find.loop`: Wraps search at the beginning or end of the file.
- `editor.find.addExtraSpaceOnTop`: Adds extra scroll space so matches are not hidden behind the Find dialog.
- `editor.find.history`: Controls whether Find search history is stored.
- `editor.occurrencesHighlight`: Highlights other occurrences of the current symbol.
- `editor.occurrencesHighlightDelay`: Controls how soon occurrences are highlighted.
- `editor.selectionHighlight`: Highlights other matches of the current selection.
- `editor.selectionHighlightMaxLength`: Limits selection highlight length.
- `editor.selectionHighlightMultiline`: Controls whether multi-line selections are highlighted.

**Platform-Specific Setting (macOS only):**
- `editor.find.globalFindClipboard`: Uses the shared macOS Find clipboard when available.

**Closing:**
Press Escape to close Find. Focus returns to the editor at the most recent match, and your search history is preserved.

### 2. Editor Replace

**Header:**
Accessibility Help: Editor Find and Replace
You are in the Find and Replace dialog for the active editor. This dialog lets you locate text and replace it. The editor is a separate surface that shows each match and the surrounding context.

**Current Search Status:**
You are searching for: "{searchTerm}".
Match {position} of {total}.
Replacement text: "{replaceText}".
If no replacement text is entered: No replacement text entered yet. Press Tab to move to the Replace input and type your replacement.

**Inside the Find and Replace Dialog (What It Does):**
While you are in either input, your focus stays in that input. You can type, edit, or navigate matches without leaving.
When you navigate to a match from the Find input, the editor updates in the background, but your focus remains in the dialog.
Tab moves you from Find to Replace and back.

**What You Hear Each Time You Move to a Match:**
Each navigation step gives you a complete spoken update:
1) The full line that contains the match is read first, so you get immediate context.
2) Your position among the matches is announced, so you know how far you are through the results.
3) The exact line and column are announced, so you know precisely where the match is in the file.

**Focus Behavior (Important):**
When you navigate from inside the Find dialog, the editor updates while your focus stays in the input. This is intentional, so you can keep adjusting your search without losing your place.
When you replace from the Replace input, the match is replaced and focus moves to the next match. If you have replaced all matches, the dialog remains open.
If you want to move focus into the editor to edit text, press Escape to close the dialog. Focus returns to the editor at the last replacement location.

**Keyboard Navigation Summary:**
- Enter (in Find input): Move to the next match while staying in Find.
- Shift+Enter (in Find input): Move to the previous match while staying in Find.
- Tab: Move between Find and Replace inputs.
- Enter (in Replace input): Replace the current match and move to the next.
- Ctrl+Shift+1: Replace only the current match.
- Ctrl+Alt+Enter: Replace all matches at once.
- <keybinding:editor.action.nextMatchFindAction>: Move to the next match from inside the editor.
- <keybinding:editor.action.previousMatchFindAction>: Move to the previous match from inside the editor.

**Find and Replace Options in the Dialog:**
- Match Case: Only exact case matches are included.
- Whole Word: Only full words are matched.
- Regular Expression: Use pattern matching for advanced searches.
- Find in Selection: Limit matches to the current selection.
- Preserve Case: When replacing, maintains the case of the original match.

**Settings You Can Adjust (Ctrl+, opens Settings):**
These settings affect how Find and Replace behave or how matches are highlighted.
- `accessibility.verbosity.find`: Controls whether the Find and Replace inputs announce the Accessibility Help hint.
- `editor.find.findOnType`: Runs Find as you type.
- `editor.find.cursorMoveOnType`: Moves the cursor to the best match while you type.
- `editor.find.seedSearchStringFromSelection`: Controls when selection text is used to seed Find.
- `editor.find.autoFindInSelection`: Automatically enables Find in Selection based on selection type.
- `editor.find.loop`: Wraps search at the beginning or end of the file.
- `editor.find.addExtraSpaceOnTop`: Adds extra scroll space so matches are not hidden behind the Find and Replace dialog.
- `editor.find.history`: Controls whether Find search history is stored.
- `editor.find.replaceHistory`: Controls whether Replace history is stored.
- `editor.occurrencesHighlight`: Highlights other occurrences of the current symbol.
- `editor.occurrencesHighlightDelay`: Controls how soon occurrences are highlighted.
- `editor.selectionHighlight`: Highlights other matches of the current selection.
- `editor.selectionHighlightMaxLength`: Limits selection highlight length.
- `editor.selectionHighlightMultiline`: Controls whether multi-line selections are highlighted.

**Platform-Specific Setting (macOS only):**
- `editor.find.globalFindClipboard`: Uses the shared macOS Find clipboard when available.

**Closing:**
Press Escape to close Find and Replace. Focus returns to the editor at the last replacement location, and your search and replace history is preserved.

### 3. Search Across Files

**Header:**
Accessibility Help: Search Across Files
You are in the Search view. This workspace-wide tool lets you find text or patterns across all files in your workspace.

**Current Search Status:**
You are searching across your workspace.
{resultCount} results found across {fileCount} files.
If no search has been run: Type a search term to find results.
If no results: No results found. Check your search term or adjust options below.

**Inside the Search Input (What It Does):**
While you are in the Search input, your focus stays in the field. You can type your search term and navigate the search results list without leaving the input.
When you navigate to a result, the editor updates in the background to show the match.

**What You Hear Each Time You Move to a Result:**
Each navigation step gives you a complete spoken update:
1) The file name where the result is located is read first, so you know which file contains the match.
2) The full line that contains the match is read, so you get immediate context.
3) Your position among the results is announced, so you know how far you are through the results.
4) The exact line and column are announced, so you know precisely where the match is in the file.

**Focus Behavior (Important):**
When you navigate from the Search input, the editor updates while your focus stays in the search field. This is intentional, so you can keep refining your search without losing your place.
If you press Tab, focus moves to the results tree below the input, and you can navigate results and open them. When you press Enter on a result, the match is shown in the editor.
If you want to focus the editor to edit text at a search result, use F4 to navigate to the result and automatically focus the editor there.

**Keyboard Navigation Summary:**
- Enter (in Search input): Run or refresh the search.
- Tab: Move focus from Search input to the results tree.
- Down Arrow: Navigate through results.
- F4: Jump to the next result and focus the editor.
- Shift+F4: Jump to the previous result and focus the editor.
- Enter (on a result): Navigate to that result in the editor.

**Search Options in the Dialog:**
- Match Case: Only exact case matches are included.
- Whole Word: Only full words are matched.
- Regular Expression: Use pattern matching for advanced searches.

**Settings You Can Adjust (Ctrl+, opens Settings):**
These settings affect how Search across files behaves.
- `accessibility.verbosity.find`: Controls whether the Search input announces the Accessibility Help hint.
- `search.smartCase`: Use case-insensitive search if your search term is all lowercase.
- `search.searchOnType`: Search all files as you type.
- `search.searchOnTypeDebouncePeriod`: Wait time in milliseconds before searching as you type.
- `search.maxResults`: Maximum number of search results to show.
- `search.collapseResults`: Expand or collapse results.
- `search.showLineNumbers`: Show line numbers for results.
- `search.sortOrder`: Sort results by file name, type, modified time, or match count.
- `search.searchEditor.defaultNumberOfContextLines`: Number of context lines shown around matches.
- `search.defaultViewMode`: Show results as list or tree.
- `search.actionsPosition`: Position of action buttons.
- `search.useReplacePreview`: Open preview when replacing matches.

**Platform-Specific Setting (macOS only):**
- `search.globalFindClipboard`: Uses the shared macOS Find clipboard when available.

**Closing:**
Press Escape to close Search. Focus returns to the editor, and your search history is preserved.

### 4. Integrated Terminal Find

**Header:**
Accessibility Help: Terminal Find
You are in the Terminal Find input. This searches the entire terminal buffer: both the current output and the scrollback history.

**Current Search Status:**
You are searching the terminal buffer.
{matchCount} matches found.
If no matches: No matches found. Try a different search term or check your options below.

**Inside the Terminal Find Input (What It Does):**
While you are in the Terminal Find input, your focus stays in the field. You can type, edit your search term, or navigate matches without leaving the input.
When you navigate to a match, the terminal scrolls to show it, but your focus remains in the Find input.

**What You Hear Each Time You Move to a Match:**
Each navigation step gives you a complete spoken update:
1) The full line that contains the match is read first, so you get immediate context.
2) Your position among the matches is announced, so you know how far you are through the results.
3) The exact line and column are announced, so you know precisely where the match is in the buffer.

**Focus Behavior (Important):**
When you navigate from the Terminal Find input, the terminal buffer updates in the background while your focus stays in the input. This is intentional, so you can keep refining your search without losing your place.
The terminal automatically scrolls to show the match you navigate to.
If you want to close Find and return focus to the terminal command line, press Escape. Focus moves to the command input at the bottom of the terminal.

**Keyboard Navigation Summary:**
- Enter: Move to the next match while staying in the Find input.
- Shift+Enter: Move to the previous match while staying in the Find input.

**Find Options:**
- Match Case: Only exact case matches are included.
- Whole Word: Only full words are matched.
- Regular Expression: Use pattern matching for advanced searches.

**Settings You Can Adjust (Ctrl+, opens Settings):**
Terminal Find has limited configuration options. Most behavior is controlled by the terminal itself.
- `accessibility.verbosity.find`: Controls whether the Terminal Find input announces the Accessibility Help hint.

**Closing:**
Press Escape to close Terminal Find. Focus moves to the terminal command line, and your search history is available on next Find.

### 5. Webview Find

**Header:**
Accessibility Help: Webview Find
You are in the Find input for embedded web content. This could be a Markdown preview, a documentation viewer, or a web-based extension interface.

**Current Search Status:**
You are searching the web content.
{matchCount} matches found.
If no matches: No matches found. Try a different search term or check your options below.

**Inside the Webview Find Input (What It Does):**
While you are in the Find input, your focus stays in the field. You can type, edit your search term, or navigate matches without leaving the input.
When you navigate to a match, the webview updates to show it, but your focus remains in the Find input.

**What You Hear Each Time You Move to a Match:**
Each navigation step gives you a complete spoken update:
1) The content containing the match is read first, so you get immediate context.
2) Your position among the matches is announced, so you know how far you are through the results.
3) The exact location information is announced so you know where the match is.

**Focus Behavior (Important):**
When you navigate from the Webview Find input, the content updates in the background while your focus stays in the input. This is intentional, so you can keep refining your search without losing your place.
The webview may scroll to show the match, depending on how it is designed.
If you want to close Find and return focus to the webview content, press Escape. Focus moves back into the webview.

**Keyboard Navigation Summary:**
- Enter: Move to the next match while staying in the Find input.
- Shift+Enter: Move to the previous match while staying in the Find input.

**Find Options:**
- Match Case: Only exact case matches are included.
- Whole Word: Only full words are matched.
- Regular Expression: Use pattern matching for advanced searches.

**Important About Webviews:**
Some webviews intercept keyboard input before VS Code's Find can use it. If Enter or Shift+Enter do not navigate matches, the webview may be handling those keys. Try clicking or tabbing into the webview content first to ensure the webview has focus, then reopen Find and try navigation again.

**Settings You Can Adjust (Ctrl+, opens Settings):**
Webview Find has minimal configuration. Most behavior depends on the webview itself.
- `accessibility.verbosity.find`: Controls whether the Webview Find input announces the Accessibility Help hint.

**Closing:**
Press Escape to close Webview Find. Focus moves back into the webview content, and your search history is available on next Find.

### 6. Output Panel Filter

**Header:**
Accessibility Help: Output Panel Filter
You are in the Output panel filter input. This is NOT a navigating search. Instead, it instantly hides lines that do not match your filter, showing only the lines you want to see.

**Current Filter Status:**
You are filtering the output.
{visibleLines} lines currently visible (of {totalLines} total).
If no filter is set: No filter entered. The panel shows all output lines.

**Inside the Filter Input (What It Does):**
While you are in the filter input, your focus stays in the field. You can type, edit, or adjust your filter without leaving the input.
As you type, the Output panel instantly updates to show only lines matching your filter.

**What Happens When You Filter:**
Each time you change the filter text, the panel instantly regenerates to show only matching lines. Your screen reader announces how many lines are now visible. This is live feedback: as you type or delete characters, the displayed lines update immediately.
New output from your running program is appended to the panel and automatically filtered, so matching new output appears instantly.

**Focus Behavior (Important):**
Your focus stays in the filter input while the panel updates in the background. This is intentional, so you can keep typing without losing your place.
If you want to review the filtered output, press Down Arrow to move focus from the filter into the output content below.
If you want to clear the filter and see all output, press Escape or delete all filter text.

**Filter Syntax and Patterns:**
- Type text: Shows only lines containing that text (case-insensitive by default).
- !text (exclude): Hides lines containing 'text', showing all other lines.
- \\! (escape): Use backslash to search for a literal "!" character.
- text1, text2 (multiple patterns): Separate patterns with commas to show lines matching ANY pattern.
Example: typing "error, warning" shows lines containing either "error" or "warning".

**Keyboard Navigation Summary:**
- Down Arrow: Move focus from filter into the output content.
- Tab: Move to log level filter buttons if available.
- Escape: Clear the filter and return to showing all output.

**Settings You Can Adjust (Ctrl+, opens Settings):**
These settings affect how the Output panel works.
- `accessibility.verbosity.find`: Controls whether the filter input announces the Accessibility Help hint.
- `output.smartScroll.enabled`: Automatically scroll to the latest output when messages arrive.

**Closing:**
Press Escape to clear the filter and see all output, or close the Output panel. Your filter text is preserved if you reopen the panel.

### 7. Problems Panel Filter

**Header:**
Accessibility Help: Problems Panel Filter
You are in the Problems panel filter input. This is a filter, not a navigating search. It instantly hides problems that do not match your filter, showing only the problems you want to see.

**Current Filter Status:**
You are filtering the problems.
{visibleProblems} problems currently visible (of {totalProblems} total).
If no filter is set: No filter entered. The panel shows all problems.

**Inside the Filter Input (What It Does):**
While you are in the filter input, your focus stays in the field. You can type, edit, or adjust your filter without leaving the input.
As you type, the Problems panel instantly updates to show only problems matching your filter.

**What Happens When You Filter:**
Each time you change the filter text, the panel instantly regenerates to show only matching problems. Your screen reader announces how many problems are now visible. This is live feedback: as you type or delete characters, the displayed problems update immediately.
The panel searches problem messages, file names, and error codes, so you can filter by any of these details.

**Focus Behavior (Important):**
Your focus stays in the filter input while the panel updates in the background. This is intentional, so you can keep typing without losing your place.
If you want to navigate the filtered problems, press Down Arrow to move focus from the filter into the problems list below.
When a problem is focused, press Enter to navigate to that problem in the editor.
If you want to clear the filter and see all problems, press Escape or delete all filter text.

**Filter Syntax and Patterns:**
- Type text: Shows problems whose message, file path, or code contains that text.
- !text (exclude): Hides problems containing the text, showing all others.
Example: typing "node_modules" hides all problems in node_modules.

**Severity and Scope Filtering:**
Above the filter input are toggle buttons for severity levels and scope:
- Errors button: Toggle to show or hide error problems.
- Warnings button: Toggle to show or hide warning problems.
- Info button: Toggle to show or hide informational problems.
- Active File Only button: When enabled, shows only problems in the currently open file.
These buttons work together with your text filter.

**Keyboard Navigation Summary:**
- Down Arrow: Move focus from filter into the problems list.
- Tab: Move to severity and scope toggle buttons.
- Enter (on a problem): Navigate to that problem in the editor.
- F8: Move to the next problem globally from anywhere in the editor.
- Shift+F8: Move to the previous problem globally from anywhere in the editor.
- Escape: Clear the filter and return to showing all problems.

**Settings You Can Adjust (Ctrl+, opens Settings):**
These settings affect the Problems panel.
- `accessibility.verbosity.find`: Controls whether the filter input announces the Accessibility Help hint.
- `problems.autoReveal`: Automatically reveal problems in the editor when you select them.
- `problems.defaultViewMode`: Show problems as a table or tree.
- `problems.sortOrder`: Sort problems by severity or position.
- `problems.showCurrentInStatus`: Show the current problem in the status bar.

**Closing:**
Press Escape to clear the filter and see all problems. Your filter text is preserved if you reopen the panel. Problems are shown from your entire workspace; use Active File Only to focus on a single file.

### 8. Debug Console Filter

**Header:**
Accessibility Help: Debug Console Filter
You are in the Debug Console filter input. This is a filter that instantly hides console messages that do not match your filter, showing only the messages you want to see.

**Current Filter Status:**
You are filtering the console output.
{visibleMessages} messages currently visible (of {totalMessages} total).
If no filter is set: No filter entered. The console shows all messages.

**Inside the Filter Input (What It Does):**
While you are in the filter input, your focus stays in the field. You can type, edit, or adjust your filter without leaving the input.
As you type, the console instantly updates to show only messages matching your filter.

**What Happens When You Filter:**
Each time you change the filter text, the console instantly regenerates to show only matching messages. Your screen reader announces how many messages are now visible. This is live feedback: text searches console output, variable values, and log messages.

**Focus Behavior (Important):**
Your focus stays in the filter input while the console updates in the background. This is intentional, so you can keep typing without losing your place.
If you want to review the filtered console output, press Down Arrow to move focus from the filter into the console messages above.
Important: The console input area is at the bottom of the console, separate from the filter. To evaluate expressions, navigate to the console input (after the filtered messages) and type your expression.

**Distinguishing Filter from Console Input:**
The filter input is where you are now. It hides or shows messages without running code.
The console input is at the bottom of the console, after all displayed messages. That is where you type and press Enter to evaluate expressions during debugging.
To switch to the console input and evaluate an expression, press Ctrl+` to focus the console, then navigate to the input area.

**Filter Syntax and Patterns:**
- Type text: Shows only messages containing that text.
- !text (exclude): Hides messages containing the text, showing all others.

**Keyboard Navigation Summary:**
- Down Arrow: Move focus from filter into the console output.
- Tab: Move to other console controls if available.
- Escape: Clear the filter or close the filter.
- Ctrl+`: Focus the console input to evaluate expressions.

**Settings You Can Adjust (Ctrl+, opens Settings):**
These settings affect the Debug Console.
- `accessibility.verbosity.find`: Controls whether the filter input announces the Accessibility Help hint.
- `debug.console.closeOnEnd`: Automatically close the Debug Console when the debugging session ends.
- `debug.console.fontSize`: Font size in the console.
- `debug.console.fontFamily`: Font family in the console.
- `debug.console.wordWrap`: Wrap lines in the console.
- `debug.console.historySuggestions`: Suggest previously typed input.
- `debug.console.collapseIdenticalLines`: Collapse repeated messages with a count.
- `debug.console.maximumLines`: Maximum number of messages to keep in the console.

**Closing:**
Press Escape to clear the filter, or close the Debug Console. Your filter text is preserved if you reopen the console.

## Context Keys and Provider Registration

**Header:**
Accessibility Help: Editor Find
Welcome to the Find input for your code editor. This widget helps you locate and navigate to code.

**Current Search Status:**
You are searching for: "{searchTerm}".
Match {position} of {total} total. You can navigate through these results.
(If no matches: No matches found in the editor. Try a different search term or check your case sensitivity and whole word settings below.)

**Keyboard Navigation:**
As you type in the Find input, VS Code announces the match count. Your screen reader will say something like "3 of 12 matches".

<<<<<<< HEAD
- Press Enter while in the Find input to navigate to the next match. The view scrolls and the match is highlighted, but focus stays in the Find input.
- Press Shift+Enter to navigate to the previous match instead. Focus also remains in the Find input.
- Press F3 (or Cmd+G on Mac) to navigate to the next match. This works from anywhere - the Find input or the editor. Focus does not change.
- Press Shift+F3 (or Cmd+Shift+G on Mac) to navigate to the previous match. Focus also does not change.

**Focus Behavior:**
IMPORTANT: When you press Enter while in the Find input, focus STAYS in the Find input. The match is highlighted in the editor and scrolled into view, but you remain in the Find input so you can continue navigating or refine your search.

When you press F3 from anywhere, focus also does not change. If you were in the Find input, focus stays there. If you were in the editor, focus stays in the editor.

To move focus from the Find input into the editor, press Ctrl+Down Arrow. To return to the Find input from the editor, press Ctrl+F (Cmd+F on Mac).
=======
**While focused IN the Find input:**
- Press Enter to jump to the next match in the editor and scroll the view to show it. VS Code highlights the match with a yellow background.
- Press Shift+Enter to jump to the previous match instead.

**While focused IN the editor (not the Find input):**
- Press <keybinding:editor.action.nextMatchFindAction> to jump to the next match.
- Press <keybinding:editor.action.previousMatchFindAction> to jump to the previous match.

Note: Don't press Enter or Shift+Enter when focused in the editor - these will insert line breaks instead of navigating.

**Focus Behavior:**
When you press Enter or <keybinding:editor.action.nextMatchFindAction>, VS Code highlights the match in the editor with a yellow background. Your screen reader reads the line containing the match. To immediately return to the Find input, press Ctrl+F again (Cmd+F on Mac). Your search term remains selected and ready to edit.
>>>>>>> accessibility/find-filter-help-discoverability

**Search Options:**
- Alt+C: Match Case — Only find exact case matches. Useful when searching for "const" vs "Const".
- Alt+W: Whole Word — Only complete words, not partial matches. For example, searching for "test" won't match "testing".
- Alt+R: Regular Expression — Use regex patterns for powerful searches like "[a-z]+" or "function\\s*\\(.*\\)".

**Closing:**
Press Escape to close the Find widget. When you close it, focus moves to the editor at the position of the last highlighted match. Your search history is preserved.

### 2. Editor Replace (Focused on user control and clarity)

**Header:**
Accessibility Help: Editor Find and Replace
You are in the Find and Replace widget for the active code editor.

**Current Status:**
You are searching for: "{searchTerm}".
Match {position} of {total} total.
You are in Replace mode.
Replacement text: "{replaceText}".
(If no replacement text: No replacement text entered. Press Tab to move to the Replace input field and type your replacement.)

**Keyboard Navigation - While focused IN the Find Input:**
- Press Enter to highlight the current match in yellow and keep focus in the Find input.
- Press Shift+Enter to go to the previous match instead.
- Press Tab to move to the Replace input field.

**Keyboard Navigation - While focused IN the editor (not the Find input):**
- Press <keybinding:editor.action.nextMatchFindAction> to jump to the next match.
- Press <keybinding:editor.action.previousMatchFindAction> to jump to the previous match.

**Keyboard Navigation - While in Replace Input:**
- Press Enter to replace the highlighted match and automatically move to the next match.
- Press Shift+Tab to return to the Find input.
- Press Ctrl+Shift+1 to replace only the current match.
- Press Ctrl+Alt+Enter to replace all matches at once.

**Search Options:**
- Alt+C: Match Case — When enabled, finds only exact case matches.
- Alt+W: Whole Word — When enabled, finds only complete words.
- Alt+R: Use Regular Expression — When enabled, interpret search text as a regex pattern.
- Alt+P: Preserve Case — When enabled, replacement preserves the case of the original match. Useful when replacing identifiers.

**Closing:**
Press Escape to close the Find and Replace widget. Focus returns to your editor.

### 3. Search Across Files (Built for discovery and power)

**Header:**
Accessibility Help: Search Across Files
Welcome to the Search Across Files widget. This powerful tool finds text, code patterns, and references across your entire workspace.

**Current Search Status:**
You are searching for results across your workspace.
{resultCount} results found across your workspace. These results are grouped by file.
(If no search run yet: Type a search term to find matches across all files in your workspace.)
(If no results: No results found. Check your search term, or try adjusting case sensitivity, whole word, or regular expression options below.)

**Keyboard Navigation:**
In the Search input, as you type, VS Code searches in the background. You can also press Enter to trigger the search manually.

- Press Enter in the search input to run or refresh the search.
- Press Tab to move to the results tree below. Your screen reader announces the first result file.
- Press F4 to jump to the next result and open the file with the match highlighted in yellow. VS Code opens the file and announces the line.
- Press Shift+F4 to go to the previous result.
- Press Down Arrow to navigate through the results tree. When a result is focused, press Enter to navigate to that match in the editor.
- When you press F4 or Enter on a result, focus moves to the editor and the match is highlighted. To quickly return to search, press Ctrl+Shift+F (Cmd+Shift+F on Mac).

**Focus Management:**
When you press F4 to navigate to a result, VS Code opens the file and your screen reader announces the line containing the match. Arrow keys in the results tree let you browse results without leaving the results panel.

**Search Options:**
- Alt+C: Match Case — Find only exact case matches. Example: "export" vs "EXPORT".
- Alt+W: Whole Word — Find complete words only. "test" won't match "testing".
- Alt+R: Regular Expression — Use regex patterns like "(import|export)\\s*\\{.*\\}" to find complex code structures.

**Replace Across Files (When Replace is enabled):**
Tab to the Replace input and type your replacement text. You can replace individual matches or all matches at once. Warning: This action affects multiple files. Make sure you have searched for exactly what you want to replace.

**Closing:**
Press Escape to close the Search view. Your search history is saved, so you can reopen Search with Ctrl+Shift+F and access previous searches.

### 4. Integrated Terminal Find (Scrollback searching made clear)

**Header:**
Accessibility Help: Terminal Find
You are in the Terminal Find input. This searches everything visible in the terminal: current output and scrollback history.

**What Terminal Find Searches:**
Terminal Find searches through the entire terminal buffer, not just what's visible on screen. This includes scrollback history. As you type, VS Code announces match count like "2 of 8 matches".

**Keyboard Navigation:**
IMPORTANT: Terminal find has DIFFERENT keybindings than editor find!

As you type search text, matches are found in real time. Your screen reader announces the match count.

<<<<<<< HEAD
- Press Enter while in the Find input to jump to the PREVIOUS match (scrolling UP toward older output). The match is highlighted in yellow.
- Press Shift+Enter to jump to the NEXT match (scrolling DOWN toward newer output).
- Press Escape to close the find widget. Focus moves to the terminal command line.

Note: This is opposite from editor find because terminal scrollback shows oldest content at the top and newest at the bottom.
=======
**While focused IN the Find input:**
- Press Enter to jump to the next match. The match is highlighted in yellow in the terminal.
- Press Shift+Enter to jump to the previous match.
- Press Escape to close the find widget and return focus to the terminal's command line.
>>>>>>> accessibility/find-filter-help-discoverability

Note: Terminal Find keeps focus in the Find input. If you need to return to the terminal command line, press Escape to close Find.

**Focus Behavior:**
When you press Enter or Shift+Enter to navigate to a match, the terminal scrolls to show that match but focus remains in the Find input. You can continue navigating through matches or refine your search without leaving the Find input.

**Search Options:**
- Alt+C: Match Case — Only find exact case matches.
- Alt+W: Whole Word — Only find complete words, not partial matches.
- Alt+R: Regular Expression — Use regex patterns like "error|warning" to find multiple patterns.

### 5. Webview Find (Web content searching with transparency)

**Header:**
Accessibility Help: Webview Find
You are in the Webview Find input. This searches embedded web content such as Markdown previews, documentation viewers, or web-based extension interfaces.

**What to Expect:**
As you type, VS Code searches the webview content and announces the match count like "3 of 7 matches". Screen readers will inform you as matches are found or if no matches exist.

**While focused IN the Find input:**
- Press Enter to jump to the next match. Your screen reader announces the content where the match appears, and the text is highlighted in yellow.
- Press Shift+Enter to jump to the previous match in the same way.
- Focus may move into the webview to highlight the match. The match location is announced by your screen reader.
- To immediately return to the Find input, press Ctrl+F again. Your search term remains selected and ready to edit.

**Search Options:**
- Alt+C: Match Case — Only find exact case matches.
- Alt+W: Whole Word — Only find complete words, not partial matches.
- Alt+R: Regular Expression — Use regex patterns for advanced searches.

**Important About Webviews:**
Each webview can define its own keyboard behavior. If VS Code's find navigation (Enter, Shift+Enter) does not work as expected, the webview may be intercepting those keys. If find navigation seems unresponsive: First, click or tab into the webview content to ensure it has focus, then try your search again. Some webviews require focus within their content to respond to find commands.

### 6. Output Panel Filter (Live filtering designed for clarity)

**Header:**
Accessibility Help: Output Panel Filter
You are in the Output panel filter input. This is NOT a search with match navigation like the Editor Find. Instead, it's a live filter: as you type, the Output panel shows only lines matching your filter text.

**How Filtering Works:**
As you type filter text, the Output panel instantly updates to show only matching lines. Your screen reader announces the number of lines visible after filtering.

Unlike Find, there is no Enter key to navigate to matches. The filter reduces what you see in real time.

New output from your running program is appended to the panel even while filtering is active. Matching new lines appear instantly.

**Filter Syntax:**
- Type text to match: Shows only lines containing that text (case-insensitive by default).
- !text (exclude mode): Hides lines containing 'text', showing only non-matching lines.
- \\! (escape): Use backslash to search for literal "!" characters.
- text1, text2 (multiple patterns): Separate with commas to show lines matching ANY pattern.

Example: "ERROR, WARN" shows lines containing either ERROR or WARN. "!DEBUG" hides DEBUG lines.

**Log Level Filtering (For Log Outputs):**
If you're viewing a log channel, use additional filtering buttons to show/hide levels like Trace, Debug, Info, Warning, and Error. Combine text filtering with log level buttons for powerful filtering.

**Keyboard Navigation:**
- Press Down Arrow to move focus from the filter input into the output content below.
- Press Tab to move focus to output filtering buttons or other controls.
- Press Escape to clear the filter text and return the Output panel to showing all messages.

**Staying Organized:**
Focus stays in the filter input as you type. To review filtered output, press Down Arrow. Current filter text is preserved when you navigate. See "Settings > Output" for options like Auto Scroll. Search "output.smartScroll" to keep the view scrolled to the latest output.

### 7. Problems Panel Filter (Smart filtering with global navigation)

**Header:**
Accessibility Help: Problems Panel Filter
You are in the Problems panel filter input. This is a FILTER, not a search with match navigation. As you type, the Problems list shows only diagnostics matching your filter: errors, warnings, and information messages from your code.

**How Filtering Works:**
As you type filter text, the Problems list updates instantly to show only matching items. Your screen reader announces the count of filtered problems. This is NOT a Find operation—there are no match highlighting or <keybinding:editor.action.nextMatchFindAction> navigation.

Text matching checks problem messages, file names, error codes, and sources. For example, filtering "null" shows all messages containing that word.

**Filter Syntax:**
- Type text: Shows problems whose message, file path, or code contains that text.
- !text (exclude mode): Hides problems containing the text, showing all others.

Example: "node_modules" hides problems in node_modules. "!test" hides problems in test files.

**Severity Filtering:**
Above the filter input, you'll find toggle buttons for different severity levels. These work together with text filtering:

- Errors button: Toggle to show/hide error problems.
- Warnings button: Toggle to show/hide warning problems.
- Info button: Toggle to show/hide information problems.

Combine text filter + severity toggles: Filter "src" AND toggle Errors on to see only errors in your src folder.

**Scope Filtering:**
- Active File Only button: When enabled, shows only problems in the currently open file.
- Excluded Files button: Toggle whether problems in files matching your exclude patterns are displayed.

**Navigation:**
- Press Down Arrow to move focus from filter into the filtered problems list below.
- Press Tab to navigate to severity toggle buttons and scope buttons.
- When a problem is focused in the list below, press Enter to go to that problem in the editor.
- Press F8 (anywhere in the editor) to go to the next problem globally.
- Press Shift+F8 to go to the previous problem globally.

**Staying Organized:**
Your filter text is preserved. Type a new filter and the list updates immediately. To clear the filter, press Escape or delete the text. The Problems panel shows issues from your entire workspace. Use Active File Only to focus on a single file.

### 8. Debug Console Filter (Context-driven output filtering)

**Header:**
Accessibility Help: Debug Console Filter
You are in the Debug Console filter input. This filters console output during debugging sessions.

**How Debug Console Filtering Works:**
As you type filter text, the console instantly shows only matching messages. This is a filter, not a match navigator. Matching messages remain visible; others are hidden. Your screen reader announces how many messages remain visible.

Filter text can search through output text, variable values, or log messages.

**Keyboard Navigation:**
- Press Down Arrow to move focus from the filter into the console output above.
- Press Tab to navigate to other console controls.
- When a console message is focused, you can select it with arrow keys.
- Press Escape to clear the filter and return to showing all console output.

**Important About Evaluation:**
To evaluate expressions (enter new code to run), navigate to the input area at the bottom of the Debug Console. Press Ctrl+` to focus the console input. Type your expression and press Enter to evaluate.

## Context Keys and Provider Registration

Use existing context keys for provider registration. **No new context keys are added.**

| Experience | Context Key | Provider ID |
| --- | --- | --- |
| Editor Find | `findInputFocussed` | `editorFindAccessibilityHelp` |
| Editor Replace | `findInputFocussed` | `editorReplaceAccessibilityHelp` |
| Search Across Files | `searchInputBoxFocus` | `searchAccessibilityHelp` |
| Terminal Find | `terminalFindVisible` | `terminalFindAccessibilityHelp` |
| Webview Find | `webviewFindWidgetFocused` | `webviewFindAccessibilityHelp` |
| Output Panel Filter | Focus-based | `outputAccessibilityHelp` |
| Problems Panel Filter | `problemsFilterFocus` | `problemsAccessibilityHelp` |
| Debug Console Filter | Focus-based | `debugConsoleAccessibilityHelp` |

**Focus-based Detection**: For Output and Debug Console, the provider detects if the filter input has keyboard focus. This is simpler than adding new context keys and avoids registration overhead.

**ARIA Label Gating**: All references to help in ARIA labels are gated by the `accessibility.verbosity.find` setting. When false, the help hint is not included; when true (default), it is always present.

## Implementation Steps

### Phase 1: Infrastructure (Setup)

1. Create base utilities for dynamic content (`findAccessibilityHelpUtils.ts`)
2. Create localized strings file (`findAccessibilityHelpStrings.ts`)
3. Register all 8 provider IDs in `AccessibleView.ts`

### Phase 2: Core Providers

1. **Editor Find & Replace**: Create 2 providers (find, replace)
2. **Search Across Files**: Create 1 provider
3. **Terminal Find**: Create 1 provider
4. **Webview Find**: Create 1 provider
5. **Output Panel**: Create 1 provider
6. **Problems Panel**: Create 1 provider
7. **Debug Console**: Create 1 provider

### Phase 3: Registration

1. Register providers in each feature's `contribution.ts` file
2. Wire Alt+F1 keybinding to each context key
3. Ensure ARIA labels include help hints by default (no setting)

### Phase 4: Testing

1. Test Alt+F1 in all 8 contexts
2. Verify dynamic content (search term, match count) updates
3. Test with screen readers (NVDA, JAWS, VoiceOver)
4. Verify focus returns after closing help
5. Cross-platform testing (Windows, Mac, Linux)

## Implementation Notes

- Create 8 Accessibility Help providers (one per find/filter context).
- The `accessibility.verbosity.find` setting (default: true) gates help hints in ARIA labels for all find inputs.
- All help content must be localized using `nls.localize()` (no hardcoded English).
- Each provider follows consistent structure: Current State → Navigation → Options → Closing.
- Use consistent terminology across all 8 providers (Match, Result, Filter, Replace, Find).
- Provider IDs must be specific for clear registration and debugging.

## Acceptance Criteria

- Alt+F1 opens Accessibility Help in all 8 find and filter inputs listed in scope.
- Help content is dynamic (search term, match count, etc.) and specific to each context.
- Help clearly distinguishes filtering (hide non-matching) from finding (navigate matches).
- `accessibility.verbosity.find` setting controls help hints across all find inputs.
- When enabled (default: true), ARIA labels include help hints for all find inputs.
- All user-facing strings are localized using `nls.localize()`.
- Focus returns to the find input after closing help (Escape key).
- All keyboard shortcuts are platform-specific (Windows, Mac, Linux).

## Comprehensive Testing Plan

This section provides testing guidance for **both technical/developer audiences and end-user accessibility audiences**. All tests verify that help content is discoverable, accurate, and genuinely helpful.

### Testing Philosophy

- **For Developers**: Focus on provider registration, context key firing, and content presence
- **For QA/Testers**: Focus on user workflows, content clarity, and edge cases
- **For Screen Reader Users**: Focus on information architecture, navigation, and whether help genuinely improves workflow
- **For Localization**: Focus on structure preservation and culturally appropriate examples

### Test Categories

#### Category 1: Discovery and Access (All Users)

| Test | Steps | Expected Result | Audience |
|------|-------|-----------------|----------|
| **Alt+F1 Availability** | 1. Focus any find input 2. Press Alt+F1 | Help modal opens immediately | Dev, QA |
| **Keybinding Conflict Check** | 1. Open Settings > Keybindings 2. Search for Alt+F1 | No conflicting bindings; if conflict exists, document and provide alternative access via command palette | Dev |
| **Command Palette Access** | 1. Press Ctrl+Shift+P 2. Search "Show Find Help" or "Accessibility Help" | Help content is accessible via command palette | Dev, QA |
| **Help Hint in ARIA Label** | 1. Set accessibility.verbosity.find to true 2. Open find widget 3. Check screen reader output (or inspect ARIA label in DevTools) | ARIA label includes hint about Alt+F1 | Dev, Screen Reader User |
| **Hint Removal on Setting** | 1. Set accessibility.verbosity.find to false 2. Open find widget 3. Check ARIA label | Hint is absent when setting is false | Dev |

#### Category 2: Content Correctness and Accuracy (QA, Screen Reader Users)

| Test | Steps | Expected Result | Audience |
|------|-------|-----------------|----------|
| **Match Count Reflects State** | 1. Editor Find: search for "function" 2. Open help 3. Verify count shows actual matches | Help correctly reports current state (e.g., "3 of 12 matches") | QA, User |
| **No Matches State** | 1. Search for impossible text (e.g., "xyznotarealword") 2. Open help | Help announces "No matches found" and suggests checking search options | QA, User |
| **Filter vs Find Clarity** | 1. Open Output filter help 2. Read/listen to help content 3. Open Editor find help | Both clearly distinguish: Editor Find = navigate matches; Output = filter content | QA, Screen Reader User |
| **Focus Behavior Accuracy** | 1. Open find help 2. Close help (press Escape) 3. Verify focus location | Focus returns exactly where it was before opening help | QA, User |
| **Keybinding Accuracy** | 1. For each platform (Windows, Mac, Linux) 2. Verify keybindings shown in help match actual keybindings | All shown keybindings are correct and platform-appropriate | QA |

#### Category 3: Navigation and Structure (Screen Reader Users, QA)

| Test | Steps | Expected Result | Audience |
|------|-------|-----------------|----------|
| **Section Headers Clear** | 1. With screen reader enabled 2. Open any help modal 3. Navigate with arrow keys or virtual cursor | Headers are clear, distinguishable, and logically ordered (Header → Status → Navigation → Options → Closing) | Screen Reader User |
| **Content Skimmability** | 1. Read help content aloud or with screen reader 2. Time how long it takes to understand main action | Main navigation actions are clear within first 20 seconds of reading | Screen Reader User |
| **Logical Key Order** | 1. Open help for any experience 2. Check order of keyboard instructions | Most common/important actions listed first; less common actions later | QA, User |
| **Consistent Terminology** | 1. Open all 8 help modals 2. Check for consistent use of: Match, Result, Problem, Filter, Replace | All uses of these terms are identical across all 8 experiences where they apply | QA |

#### Category 4: Keyboard Navigation Testing (QA, Developer)

| Test | Steps | Expected Result | Audience |
|------|-------|-----------------|----------|
| **Enter Navigation (Find Dialog)** | 1. Editor Find with 5+ matches 2. Press Enter while IN the find input, repeat 3 times | Each Enter moves to next match; screen reader announces "2 of 5" → "3 of 5" → "4 of 5" | QA |
| **Shift+Enter Navigation (Find Dialog)** | 1. Same as above, but use Shift+Enter while IN the find input | Each Shift+Enter moves to previous match | QA |
| **F3/F4 Navigation from Editor** | 1. Editor Find with matches 2. Close find (Escape), focus is now IN editor 3. Press <keybinding:editor.action.nextMatchFindAction> | Key navigates to next match from editor; works even when find dialog is closed | QA |
| **F4 Search Navigation** | 1. Search view with results 2. Click into editor 3. Press <keybinding:search.action.focusNextSearchResult> | <keybinding:search.action.focusNextSearchResult> navigates to next result; focus moves to editor, not search view | QA |
| **Tab Navigation** | 1. Search Replace mode 2. Press Tab in find input | Focus moves to replace input; options remain accessible via keyboard | QA |
| **Escape Closes Help** | 1. Any help modal open 2. Press Escape | Help closes; focus returns to original find input; typed text preserved | QA, User |
| **Filter Tab Navigation** | 1. Problems panel with filtering buttons 2. Press Tab in filter input | Tab moves to severity/scope buttons; usable without mouse | QA |

#### Category 5: Edge Case Testing (QA, Developer)

| Test | Steps | Expected Result | Audience |
|------|-------|-----------------|----------|
| **Very Long File Names** | 1. Search across files with extremely long paths 2. Open help | Help doesn't show full paths, summarizes or truncates appropriately | Dev, QA |
| **Regex with Special Chars** | 1. Search for complex regex like `(import\|export)\s*\{.*\}` 2. Open help | Help content displays correctly; no escaping errors; explanation is still clear | QA |
| **Empty Search/Filter** | 1. Open find widget 2. Don't type anything 3. Open help immediately | Help provides guidance on what to type (useful for first-time users) | QA, User |
| **Multiple Back-to-Back Searches** | 1. Search one term, open help, close, search another, open help | Each help context correctly reflects the new search term | QA |
| **Terminal with Scrollback** | 1. Terminal: Run command with lots of output 2. Scroll up in terminal 3. Open find and search 4. Open help | Help correctly mentions scrollback; help reflects current + scrolled context | QA |
| **Very Large Result Sets** | 1. Search for common term (e.g., "a") resulting in 1000+ matches 2. Open help | Help doesn't lag; match count is accurate; no performance issues | Dev, QA |
| **Webview with Custom Keyboard** | 1. Open markdown preview 2. Try to find 3. Open help | Help mentions webview keyboard behavior; notes about limitations if present | QA, User |
| **Mixed Locale Numbers** | 1. Verify help displays "3 of 12" (English) on non-English system | Numbers follow locale rules (some locales use "3 sur 12" or "3 из 12") | Dev, Localization |

#### Category 6: Screen Reader Testing (Screen Reader Users, QA)

**Prerequisites**: NVDA (free, Windows), JAWS (paid, Windows), VoiceOver (free, macOS), or Narrator (free, Windows)

| Test | Steps | Expected Result | Audience |
|------|-------|-----------------|----------|
| **Content Readability** | 1. Screen reader enabled 2. Open any help modal 3. Let screen reader read entire modal | Content is readable without visual reference; no missing pieces; logical flow | Screen Reader User |
| **Heading Navigation** | 1. With heading navigation enabled (H key in NVDA, Ctrl+6 in JAWS) 2. Navigate between help section headings | All section headings are recognized; navigation is smooth; no hidden heading issues | Screen Reader User |
| **List Navigation** | 1. Screen reader's list mode (LI in NVDA, Insert+V in JAWS) 2. Navigate keyboard shortcuts | All keyboard shortcuts appear as list items; easy to review options | Screen Reader User |
| **Punctuation Clarity** | 1. Screen reader set to medium punctuation 2. Listen to content with sequences like "Alt+C", "Ctrl+Shift+F" | Keyboard shortcuts are announced clearly; plus signs (\+) don't confuse screen reader | Screen Reader User |
| **Copy to Clipboard** | 1. Select help content with screen reader selection 2. Copy and paste into a document | Copied content is well-formatted; maintains structure in plain text | Screen Reader User |
| **Focus Trap Check** | 1. Screen reader enabled 2. Tab through entire help dialog 3. Try to escape | No focus traps; Escape clearly closes help; focus returns predictably | Screen Reader User |

#### Category 7: Localization Testing (QA, Localization Team)

| Test | Steps | Expected Result | Audience |
|------|-------|-----------------|----------|
| **German Keybindings** | 1. Switch VS Code to German 2. Open help for any experience 3. Verify keybindings | Keybindings still show "Ctrl+F" not localized (correct); descriptions are German | Localization |
| **French Numbers** | 1. Open help in French 2. Check for "3 of 12" pattern | French version shows "3 sur 12" or locale-appropriate separator | Localization |
| **Japanese Line Breaks** | 1. Switch to Japanese 2. Open help with very long lines 3. Verify wrapping | Text wraps appropriately; no character clipping; screen readers can navigate | Localization |
| **Chinese Platform Keys** | 1. Switch to Simplified Chinese 2. Verify Mac/Windows keybinding notes | Platform keys (Cmd vs Ctrl) translated appropriately; context is clear | Localization |
| **All Locales Consistency** | 1. Open help in all supported locales 2. Check key terms (Match, Result, Filter, Replace, Find) | Terminology is consistent within each language; no translation regressions | Localization |

#### Category 8: ARIA Labels and Discoverability (Developer, QA)

| Test | Steps | Expected Result | Audience |
|------|-------|-----------------|----------|
| **Default ARIA Labels** | 1. Fresh VS Code install 2. Focus any find input 3. Check ARIA label (DevTools or screen reader) | Label includes "Press Alt+F1 for Accessibility Help" by default (setting is `true` by default) | Dev, QA |
| **ARIA Label Consistency** | 1. Test all 8 find inputs (editor, search, terminal, webview, output, problems, debug) 2. Check each ARIA label | All include the help hint consistently; `accessibility.verbosity.find` setting controls all | QA |
| **Help Hint Toggling** | 1. Enable find (Alt+F1 disabled via setting: set `accessibility.verbosity.find` to `false`) 2. Close and reopen VS Code 3. Focus find input again | Help hint not present in ARIA label when setting is `false`; present when `true` | Dev |
| **Setting Control** | 1. Open Settings UI (Ctrl+,) 2. Search for "accessibility.verbosity.find" 3. Toggle between `true` and `false` 4. Focus find input after each toggle | Setting exists and correctly gates help hints in ARIA labels | User, QA |
| **Screen Reader Discovery** | 1. With screen reader enabled 2. Focus any find input 3. Listen to ARIA label (with setting enabled by default) | Screen reader announces the help hint automatically | Screen Reader User |

#### Category 9: Multi-Platform Testing (QA, Developer)

| Test | Steps | Expected Result | Audience |
|------|-------|-----------------|----------|
| **Windows Keybindings** | 1. Windows: Test Ctrl, Alt, Shift combinations 2. Verify all documented shortcuts work | All Windows keybindings function correctly; no missing modifiers | QA, Dev |
| **macOS Command Key** | 1. Mac: Test Cmd key for shortcuts like Cmd+F 2. Verify Alt+F1 equivalent (or alternative) works on Mac | Cmd key shortcuts work; keybinding help is Mac-accurate | QA, Dev |
| **Linux Alt Behavior** | 1. Linux: Test Alt+F1 (may conflict with window manager) 2. Provide workaround if needed | Either Alt+F1 works or documented alternative is accessible | QA, Dev |
| **Keyboard Layout Independence** | 1. Test on non-QWERTY layouts (e.g., Dvorak, AZERTY) 2. Verify physical key positions don't break documentation | Documentation uses key names ("Alt", "Enter") not physical positions | QA, Dev |

#### Category 10: User Workflow Testing (End Users, QA)

**These tests should involve real users performing realistic tasks**

| Test | Steps | Expected Result | Audience |
|------|-------|-----------------|----------|
| **First-Time User Onboarding** | 1. New screen reader user opens VS Code 2. Asked: "How do I find something?" 3. Opens find, presses Alt+F1 (or discovers it naturally) | User can complete find + navigate task without prior training | Screen Reader User |
| **Switching Contexts** | 1. User works in editor find, then switches to search across files 2. Presses Alt+F1 in each context | Context-specific help is helpful; user can quickly adapt to different context | User |
| **Problem Solving** | 1. User is stuck: "I opened find but I don't know how to go to the next match" 2. Opens help (Alt+F1) 3. Finds the answer | Help answers the question directly; user can complete task | Screen Reader User |
| **Filter Learning** | 1. User new to output filtering opens Output panel 2. Discovers help content 3. Learns filter syntax | User successfully uses filters after reading help once or twice | User |
| **Power User Reference** | 1. Experienced user knows most shortcuts 2. Opens help to check an option or syntax they forgot (e.g., regex for exclude) | Help is scannable enough for quick reference; power user finds answer in <15 seconds | User |

### Testing Checklist

**Before Implementation PR**:
- [ ] At least 2 screen reader users tested help content and provided feedback
- [ ] All 8 help modals have been tested manually on Windows, macOS, and Linux
- [ ] No compilation errors or type errors
- [ ] All keyboard shortcuts tested and verified on each platform
- [ ] Localization team has reviewed structure and provided guidance

**During QA**:
- [ ] All edge case tests pass
- [ ] No regression in existing find/filter functionality
- [ ] Setting toggles correctly and persists
- [ ] Focus management works in all contexts

**Before Shipping**:
- [ ] Real users (screen reader + keyboard-only) have tested workflows
- [ ] Performance is acceptable (no noticeable lag opening help)
- [ ] Documentation updated for users and developers
- [ ] All localized strings are in place and reviewed

### Automated Testing Strategy

**Unit Tests** (in `src/vs/workbench/contrib/accessibility/test/`):

```typescript
describe('Find Accessibility Help Providers', () => {
  it('should return help content for editor find', () => {
    // Test that editorFindAccessibilityHelp returns non-empty string
  });

  it('should include current search term in help', () => {
    // Test dynamic content interpolation
  });

  it('should include correct keybindings for current platform', () => {
    // Test platform-specific keybindings appear
  });

  it('should show focus guidance for each context', () => {
    // Test that focus behavior is documented
  });

  it('should gate help hint with verbosity setting', () => {
    // Test that accessibility.verbosity.find controls ARIA hints
  });
});
```

**Integration Tests**:
- Test Alt+F1 triggers help in each context
- Test focus returns after closing help
- Test setting applies across all find inputs

**Accessibility Automated Tests** (axe-core or similar):
- Verify help modal has proper ARIA attributes
- Verify heading hierarchy is correct
- Verify color contrast meets WCAG AA

### Success Metrics

- **Discoverability**: 80%+ of first-time screen reader users discover help within 2 minutes
- **Clarity**: 90%+ of users understand current search state after opening help
- **Completeness**: 100% of keyboard navigation options are explained in help
- **Performance**: Help opens within 200ms
- **Accessibility**: No automated accessibility issues detected (axe-core)
- **User Satisfaction**: 4.5+/5 rating from screen reader users in feedback survey

## Steps to Compile and Test

### Prerequisites

1. Ensure you have Node.js 18+ and npm installed
2. Clone the VS Code repository if not already done
3. Run `npm install` from the root of the repository to install dependencies

### Compilation Steps

1. **Start the build watcher** (recommended for development):
   ```bash
   # On Windows
   npm run watch-clientd

   # Or use the VS Code task:
   # Terminal > Run Task > "VS Code - Build"
   ```

2. **Alternative: One-time compilation**:
   ```bash
   npm run compile
   ```

3. **Verify no TypeScript errors**:
   - Check the terminal output for any compilation errors
   - All accessibility help provider files should compile without errors

### Running VS Code with Changes

1. **Launch VS Code with your changes**:
   ```bash
   # On Windows
   .\scripts\code.bat

   # On macOS/Linux
   ./scripts/code.sh
   ```

2. **Alternative: Use the VS Code debugger**:
   - Open VS Code
   - Press F5 to launch a new VS Code window with your changes
   - Select "Launch VS Code" configuration

### Immersive Test Plan

#### Test 1: Editor Find Accessibility Help
1. Open any file in the editor
2. Press `Ctrl+F` to open the Find widget
3. Type some search text (e.g., "function")
4. Press `Alt+F1` to open Accessibility Help
5. **Expected**: Help dialog opens with:
   - Title: "Accessibility Help: Editor Find"
   - Current search context (search term, match count, match position)
   - Navigation guidance (Enter/Shift+Enter when in Find input, <keybinding:editor.action.nextMatchFindAction>/<keybinding:editor.action.previousMatchFindAction> when in editor)
   - Options guidance (Alt+C, Alt+W, Alt+R)
   - Closing instructions
6. Press `Escape` to close help and verify focus returns to find input

#### Test 2: Editor Replace Accessibility Help
1. Open any file in the editor
2. Press `Ctrl+H` to open Find and Replace
3. Type search text and replacement text
4. Press `Alt+F1` while in either input
5. **Expected**: Help includes replace-specific guidance:
   - Replace actions section
   - Alt+P for preserve case option

#### Test 3: Search Across Files Accessibility Help
1. Press `Ctrl+Shift+F` to open Search view
2. Type a search term
3. Press `Alt+F1` while in the search input
4. **Expected**: Help dialog opens with:
   - Title mentioning "Search Across Files"
   - Result count if search has been run
   - Navigation guidance (F4, Shift+F4, arrow keys)
   - Options guidance
5. Press `Escape` and verify focus returns to search input

#### Test 4: Terminal Find Accessibility Help
1. Open a terminal (`Ctrl+\``)
2. Echo some text: `echo "Hello World Test"`
3. Press `Ctrl+F` to open terminal find
4. Type a search term
5. Press `Alt+F1`
6. **Expected**: Help dialog mentions:
   - Terminal-specific context
   - Buffer/scrollback behavior
   - Terminal find navigation

#### Test 5: Webview Find Accessibility Help
1. Open a Markdown file
2. Open the preview (`Ctrl+Shift+V`)
3. Press `Ctrl+F` to open webview find
4. Press `Alt+F1`
5. **Expected**: Help mentions webview-specific behavior and keyboard handling notes

#### Test 6: Output Panel Filter Accessibility Help
1. Open Output panel (`Ctrl+Shift+U`)
2. Focus the filter input (click on it or use keyboard navigation)
3. Press `Alt+F1`
4. **Expected**: Help mentions:
   - Output panel filtering
   - Filter patterns (!text, escape characters)
   - Log level filtering

#### Test 7: Problems Panel Filter Accessibility Help
1. Open Problems panel (`Ctrl+Shift+M`)
2. Focus the filter input
3. Press `Alt+F1`
4. **Expected**: Help mentions:
   - Problems filtering (not match navigation)
   - Severity filtering options
   - Navigation to problems (F8, Shift+F8)

#### Test 8: Default Help Availability
1. Open a file in the editor
2. Press `Ctrl+F` to open find
3. Use a screen reader or check DevTools to verify the ARIA label includes "Press Alt+F1 for Accessibility Help"
4. Close find and reopen
5. **Expected**: Help hint is still present (always-on by default)

### Screen Reader Testing (Recommended)

If you have access to a screen reader (NVDA, JAWS, VoiceOver, Narrator):

1. Enable the screen reader
2. Navigate to each find input using keyboard
3. Press `Alt+F1` and verify the help content is read aloud
4. Verify the content is clear, well-structured, and actionable
5. Check that focus returns correctly after closing help

### Files to Create

**Core Utilities:**
- `src/vs/workbench/contrib/accessibility/browser/findAccessibilityHelpStrings.ts` - All localized help strings
- `src/vs/workbench/contrib/accessibility/browser/findAccessibilityHelpUtils.ts` - Base utilities for dynamic content

**Provider Implementations (8 files):**
- `src/vs/editor/contrib/find/browser/editorFindAccessibilityHelp.ts`
- `src/vs/editor/contrib/find/browser/editorReplaceAccessibilityHelp.ts`
- `src/vs/workbench/contrib/search/browser/searchAccessibilityHelp.ts`
- `src/vs/workbench/contrib/terminalContrib/find/browser/terminalFindAccessibilityHelp.ts`
- `src/vs/workbench/contrib/webview/browser/webviewFindAccessibilityHelp.ts`
- `src/vs/workbench/contrib/output/browser/outputAccessibilityHelp.ts`
- `src/vs/workbench/contrib/markers/browser/problemsAccessibilityHelp.ts`
- `src/vs/workbench/contrib/debug/browser/debugConsoleAccessibilityHelp.ts`

**Test Files:**
- `src/vs/workbench/contrib/accessibility/test/findAccessibilityHelp.test.ts`

### Files to Modify

**Registration and Infrastructure:**
- `src/vs/platform/accessibility/browser/accessibleView.ts` - Register provider IDs (8 new)
- `src/vs/editor/contrib/find/browser/codeEditor.contribution.ts` - Register find/replace providers
- `src/vs/workbench/contrib/search/browser/search.contribution.ts` - Register search provider
- `src/vs/workbench/contrib/terminalContrib/find/browser/terminal.find.contribution.ts` - Register terminal provider
- `src/vs/workbench/contrib/webview/browser/webview.contribution.ts` - Register webview provider
- `src/vs/workbench/contrib/output/browser/output.contribution.ts` - Register output provider
- `src/vs/workbench/contrib/markers/browser/markers.contribution.ts` - Register problems provider
- `src/vs/workbench/contrib/debug/browser/debug.contribution.ts` - Register debug provider

### Running Unit Tests

```bash
# Run all tests
npm test

# Run specific accessibility-related tests
.\scripts\test.bat --grep "accessibility"

# Run tests for a specific file
.\scripts\test.bat src/vs/workbench/contrib/accessibility/test/
```

### Troubleshooting

1. **Alt+F1 doesn't open help**:
   - Verify the context key is firing (check with Developer: Toggle Developer Tools > Console)
   - Ensure the provider is registered in the contribution file

2. **Help content is empty**:
   - Check that `provideContent()` returns a non-empty string
   - Verify the provider ID matches in both the enum and the provider class

3. **Focus doesn't return after closing help**:
   - Verify `onClose()` is implemented and focuses the correct element

## Implementation Best Practices

### For Developers

When implementing Accessibility Help content:

1. **Test Early with Real Users**: Engage screen reader users (NVDA, JAWS, VoiceOver, Narrator) from the start. Don't wait until the end. Their feedback is invaluable.

2. **Read Content Aloud**: Use a text-to-speech tool to read your help content before submitting. If it sounds awkward or unclear when heard, rewrite it.

3. **Verify State Dynamically**: Ensure match count, position, and status are updated in real time. Test with empty searches, no matches, and large results sets.

4. **Focus Management is Critical**: Test that focus moves predictably. After closing help, users should be back exactly where they started. Use keyboard only to verify this.

5. **Keyboard-Only Testing**: Never use the mouse to test help functionality. Every interaction must work from the keyboard.

6. **Consistency Across Platforms**: Test on Windows, macOS, and Linux. Keybindings and focus behavior may differ slightly.

7. **Document Edge Cases**: If a feature doesn't work in certain contexts (e.g., webview keyboard interception), document this explicitly in the help content with a workaround.

### For QA and Testing

1. **Test with Assistive Tech**: Use NVDA, JAWS, or VoiceOver. Narrator (Windows built-in) is also helpful as a baseline.

2. **Check Content Clarity**: Does the help content make sense without visual context? Can a screen reader user understand the current state and how to proceed?

3. **Verify Navigation**: Test <keybinding:editor.action.nextMatchFindAction>, <keybinding:editor.action.previousMatchFindAction>, Enter, Shift+Enter, Tab, and Escape in every context. Ensure focus moves as documented. Important: Test Enter/Shift+Enter ONLY when focused in the find input, and F3/Shift+F3 when focused in the editor.

4. **Test Search Patterns**: Include regex patterns, special characters, and multi-line content to catch edge cases.

5. **Test Filtering Edge Cases**: Empty filters, exclude filters, multiple patterns, and special characters. Verify the filter behaves as described in help.

6. **Verify Settings**: Test toggling `accessibility.verbosity.find` on and off. Ensure ARIA hints appear/disappear consistently.

### For Localization Teams

1. **Preserve Structure**: The heading and section structure are critical for screen reader navigation. Don't flatten or reorganize sections.

2. **Maintain Consistency**: Keep key terms (Match, Result, Problem, Filter, Replace) consistent in your language. Create a terminology guide upfront.

3. **Localize Examples**: Replace code examples and filter patterns with culturally appropriate examples where possible.

4. **Handle Platform Keys**: Always keep both Windows and Mac keybindings. Test translations with Mac keyboard layouts in mind.

5. **Test with Real Assistive Tech**: Localized content must be tested with screen readers in the target language. Translation alone isn't sufficient.

6. **Cultural Review**: Have native speakers review the content for cultural appropriateness, not just grammatical correctness.

## Validation and Success Criteria

A successful implementation should meet these criteria:

1. **Discoverability**: Users can discover Accessibility Help by pressing Alt+F1 in any find or filter input without prior knowledge.

2. **Clarity**: The help content explains the current state and next steps so clearly that even first-time users understand what to do.

3. **Completeness**: All keyboard shortcuts, navigation methods, and feature options are documented in the help content.

4. **Consistency**: The same conceptual information is presented consistently across all find/filter contexts (find, replace, search, terminal, webview, output, problems, debug console).

5. **Correctness**: Help content accurately reflects the behavior of the feature. No misleading or outdated information.

6. **Accessibility**: The help content itself is accessible to screen readers and assistive technology. No hidden complexity or unexpected focus traps.

7. **User Satisfaction**: Real screen reader users report that the help is genuinely helpful and improves their workflow.

8. **Maintenance**: The content is documented clearly so future changes to find/filter behavior can be reflected in help without creating inconsistencies.

## Resolved Guidance on Key Implementation Decisions

### 1. Context Keys for Output and Debug Console

**Decision**: Use **focus-based detection** (simple, no new context keys).

- Detect Output panel filter focus: Check if active element is the filter input
- Detect Debug Console filter focus: Check if active element is the filter input
- This approach is maintainable and doesn't introduce new context key overhead

### 2. Help Availability (The "Magical Experience")

**Decision**: **Always include help hints in ARIA labels by default** (no setting required).

- When a find input is focused, ARIA label automatically includes: "Press Alt+F1 for Accessibility Help"
- This is always-on; users don't need to enable anything
- Discoverability is built-in and automatic
- Users immediately know help is available when they focus a find input

### 3. Long Line Truncation for Match Context

**Decision**: **Truncate to 80 characters + "..." indicator** (follows VS Code's existing accessible help pattern).

```typescript
function truncateContext(line: string, maxLength: number = 80): string {
  return line.length > maxLength ? line.substring(0, maxLength) + '...' : line;
}
```

- This is how VS Code's existing Accessible View implementations handle long context
- 80 characters is readable and digestible for screen readers
- No configuration needed; consistent with other accessible help experiences

### 4. Replace Functionality in Search Help

**Decision**: **Always mention Replace; guide users to discover it.**

- Search help includes: "Tab to the Replace input to type your replacement. If you don't see it, press Ctrl+H to toggle it open."
- Balances discoverability with clarity—users learn replace exists without feeling confused by too many options

### 5. Persistent Help Panel

**Decision**: **Modal only for MVP** (simpler, less distraction, proven UX pattern).

- Alt+F1 opens a modal dialog with help content
- Modal is dismissed with Escape; focus returns to find input
- If future feedback requests persistent help, add in next iteration
- Keeps implementation focused and maintainable

## Implementation Guidance for Developers

This section provides step-by-step technical guidance for implementing this feature.

### Architecture Overview

```
Accessibility Help Provider Pattern:

find/search input focus (via context key)
        ↓
Alt+F1 keybinding triggered
        ↓
AccessibilityHelpRegistry.getProvider(currentContextId)
        ↓
Provider.provideContent() → returns help text
        ↓
AccessibleView modal opens, displays help
        ↓
User presses Escape
        ↓
onClose() → restores focus to original input
```

### Key Implementation Files

**Core Files to Create:**

1. `src/vs/workbench/contrib/accessibility/browser/findAccessibilityHelp.ts`
   - Base class or utilities for all find accessibility help providers
   - Handles dynamic content injection (search term, match count, etc.)
   - Localization support

2. `src/vs/editor/contrib/find/browser/editorFindAccessibilityHelp.ts`
   - Editor Find accessibility help provider
   - Imports and uses `findAccessibilityHelp.ts` patterns

3. Similar files for Search, Terminal, Webview, Output, Problems, Debug Console

**Modified Files:**

1. `src/vs/workbench/contrib/accessibility/browser/accessibilityConfiguration.ts`
   - Add `accessibility.verbosity.find` setting

2. `src/vs/platform/accessibility/browser/accessibleView.ts`
   - Register new provider IDs in the AccessibilityHelpProvider enum

3. Each feature's contribution file (search.contribution.ts, etc.)
   - Register the accessibility help provider

### Implementation Pattern

Follow this pattern for each help provider:

```typescript
import { AccessibilityHelpProvider } from 'vs/platform/accessibility/browser/accessibleView';

export class EditorFindAccessibilityHelp implements AccessibilityHelpProvider {
  constructor(
    @IAccessibilityHelpService private accessibilityHelpService: IAccessibilityHelpService
  ) {}

  provideContent(): string {
    const searchTerm = getCurrentSearchTerm(); // Get from find widget state
    const matchCount = getMatchCount(); // Get current match info

    let content = `Accessibility Help: Editor Find\n`;
    content += `You are searching for: "${searchTerm}".\n`;
    content += `Match ${matchCount.position} of ${matchCount.total}.\n`;
    // ... more content

    return content;
  }

  onClose(): void {
    // Return focus to the find input
    const findInput = document.querySelector('.find-input');
    findInput?.focus();
  }
}
```

### Dynamic Content Injection

Help content must always reflect current state. Provide these dynamically:

```typescript
interface FindContextState {
  searchTerm: string;
  matchPosition: number;
  matchTotal: number;
  hasMatches: boolean;
  isCaseSensitive: boolean;
  isWholeWord: boolean;
  isRegex: boolean;
}

function buildHelpContent(state: FindContextState): string {
  let content = '';

  // Always include current state first
  if (state.hasMatches) {
    content += `Match ${state.matchPosition} of ${state.matchTotal}.\n`;
  } else {
    content += `No matches found.\n`;
  }

  // Include enabled options
  const enabledOptions = [];
  if (state.isCaseSensitive) enabledOptions.push('Case sensitive');
  if (state.isWholeWord) enabledOptions.push('Whole word');
  if (state.isRegex) enabledOptions.push('Regular expression');

  if (enabledOptions.length > 0) {
    content += `Active options: ${enabledOptions.join(', ')}\n`;
  }

  return content;
}
```

### Localization Approach

All help strings must be localizable. Use the nls module:

```typescript
import { nls } from 'vs/nls';

const editorFindHelp = {
  header: nls.localize('editorFindHelp.header', 'Accessibility Help: Editor Find'),
  welcome: nls.localize('editorFindHelp.welcome', 'Welcome to the Find input...'),
  // ... all strings
};

export function getEditorFindHelpContent(state: FindContextState): string {
  return `${editorFindHelp.header}\n${editorFindHelp.welcome}\n...`;
}
```

**Localization Maintenance**: Create a separate .ts file for all help-related localization keys so localizers can easily find and maintain them:

```
src/vs/workbench/contrib/accessibility/browser/findAccessibilityHelpStrings.ts
```

### Context Key Detection

Use existing context keys where possible; only add new ones if necessary:

```typescript
// Existing context keys to use:
const ContextKeys = {
  findinputboxFocused: 'findinputboxFocused',       // Editor Find
  searchInputBoxFocus: 'searchInputBoxFocus',       // Search view
  terminalFindVisible: 'terminalFindVisible',       // Terminal Find
  webviewFindWidgetFocused: 'webviewFindWidgetFocused', // Webview Find
  problemsFilterFocus: 'problemsFilterFocus',       // Problems filter
  // Use focus-based detection for Output and Debug Console
};
```

To detect Output panel filter focus:

```typescript
const outputPanelContext = getOutputPanelContext();
const filterInputFocused = outputPanelContext?.filterInput === document.activeElement;
```

### Platform-Specific Keybindings

Always provide both Windows and Mac bindings:

```typescript
function getKeybindingText(action: string): string {
  if (action === 'nextMatch') {
    return 'Press Enter (or <keybinding:editor.action.nextMatchFindAction>)';
  }
  // ... more actions
}
```

### Testing in Development

Build and test each help provider:

```bash
# Compile
npm run watch-clientd

# Test in VS Code
.\scripts\code.bat

# Test keyboard shortcuts
1. Open find widget (Ctrl+F or Cmd+F)
2. Press Alt+F1
3. Verify help appears
4. Press Escape to close
5. Verify focus returns to find input
```

### Common Pitfalls to Avoid

1. **Stale Content**: Don't cache help content. Regenerate it each time Alt+F1 is pressed to ensure current state is shown.

2. **Focus Traps**: Always restore focus in `onClose()`. Test with keyboard only.

3. **Incomplete State Info**: Don't leave users guessing. If no matches, say "No matches found". If filters are active, announce which ones.

4. **Hardcoded Strings**: Every user-facing string must go through nls.localize(). Never hardcode English.

5. **Platform Assumptions**: Always document, test, and handle Windows, Mac, and Linux differences.

6. **Accessibility of the Help**: Remember the help content itself must be accessible—use proper structure, scannable sections, clear headings.

### Debugging Tips

If Alt+F1 not opening help:

```typescript
// In Debug Console, check context keys:
debugger.vscode.debug.getContextKeyValue('findinputboxFocused')
debugger.vscode.debug.getContextKeyValue('accessibility.verbosity.find')

// Check if provider is registered:
const provider = await accessibilityHelpRegistry.getProvider('editorFindAccessibilityHelp');
console.log('Provider:', provider);

// Check if keybinding fires:
// Add breakpoint in your provider's provideContent() method
```

### Performance Considerations

- Help content generation should be <50ms
- Avoid DOM queries inside `provideContent()`
- Cache feature state (match count) efficiently
- Test opening help repeatedly to ensure no memory leaks

### Typescr

ipt Best Practices for This Code

```typescript
// ✅ Good: Clear, typed interface
interface AccessibilityContent {
  state: FindState;
  buildContent(): string;
}

// ❌ Avoid: any types
function buildContent(state: any): string {}

// ✅ Good: Explain why disabled
if (!isFeatureEnabled) {
  // This feature is not available in this context
  return 'Feature not available';
}

// ❌ Avoid: Silent failures
function getSearchTerm() {
  return document.querySelector('.find-input')?.value;
}

// ✅ Good: Proper error handling
try {
  const searchTerm = this.findWidget.getSearchTerm();
  if (!searchTerm) {
    return 'No search term entered yet.';
  }
  return searchTerm;
} catch (e) {
  return 'Unable to retrieve search term.';
}
```

### Review Checklist for PR Reviewers

- [ ] All 8 help providers follow the same pattern
- [ ] Dynamic content (search term, match count) is current and regenerated each time
- [ ] No hardcoded English strings (all use nls.localize)
- [ ] Platform-specific keybindings documented (Windows, Mac, Linux)
- [ ] Focus management tested and working (keyboard-only test)
- [ ] ARIA labels include help hints by default (no setting gating this)
- [ ] No new context keys added (use existing ones or focus-based detection)
- [ ] Help content reads naturally aloud (test with screen reader)
- [ ] No regression in existing find/filter functionality
- [ ] Performance acceptable (help opens <200ms)

## Complete Implementation Examples

This section shows actual TypeScript code for implementing all 8 providers. Use these as templates.

### 1. Editor Find Provider (Template)

**File:** `src/vs/editor/contrib/find/browser/editorFindAccessibilityHelp.ts`

```typescript
import { nls } from 'vs/nls';
import { AccessibilityHelpProvider } from 'vs/platform/accessibility/browser/accessibleView';

const strings = {
  header: nls.localize('editorFind.help.header', 'Accessibility Help: Editor Find'),
  welcome: nls.localize('editorFind.help.welcome', 'Welcome to the Find input.'),
  searching: nls.localize('editorFind.help.searching', 'You are searching for: "{0}".'),
  matchInfo: nls.localize('editorFind.help.matchInfo', 'Match {0} of {1} total.'),
  noMatches: nls.localize('editorFind.help.noMatches', 'No matches found. Try a different search term.'),
  enterNav: nls.localize('editorFind.help.enterNav', 'Press Enter while in the Find input to jump to the next match.'),
  shiftEnter: nls.localize('editorFind.help.shiftEnter', 'Press Shift+Enter while in the Find input to jump to the previous match.'),
  nextMatchNav: nls.localize('editorFind.help.nextMatchNav', 'Press {0} to jump to next match from the editor.', '<keybinding:editor.action.nextMatchFindAction>'),
  previousMatchNav: nls.localize('editorFind.help.previousMatchNav', 'Press {0} to jump to previous match from the editor.', '<keybinding:editor.action.previousMatchFindAction>'),
  caseOption: nls.localize('editorFind.help.caseOption', 'Alt+C: Match Case — Find exact case matches only.'),
  wholeWordOption: nls.localize('editorFind.help.wholeWordOption', 'Alt+W: Whole Word — Find complete words only.'),
  regexOption: nls.localize('editorFind.help.regexOption', 'Alt+R: Regular Expression — Use regex patterns.'),
  escapeClose: nls.localize('editorFind.help.escapeClose', 'Press Escape to close Find. Focus returns to the editor.'),
};

export class EditorFindAccessibilityHelp implements AccessibilityHelpProvider {
  async provideContent(): Promise<string> {
    const searchTerm = this.getSearchTerm();
    const state = this.getFindState();

    let content = `${strings.header}\n\n`;
    content += `${strings.welcome}\n\n`;

    // Current search status
    if (searchTerm) {
      content += `${strings.searching.replace('{0}', searchTerm)}\n`;
      if (state.matches === 0) {
        content += `${strings.noMatches}\n`;
      } else {
        content += `${strings.matchInfo.replace('{0}', String(state.matchIndex)).replace('{1}', String(state.matches))}\n`;
      }
    }

    content += `\n`;

    // Navigation - separated by context
    content += `Navigation while in the Find input:\n`;
    content += `${strings.enterNav}\n`;
    content += `${strings.shiftEnter}\n`;
    content += `\n`;
    content += `Navigation from the editor:\n`;
    content += `${strings.nextMatchNav}\n`;
    content += `${strings.previousMatchNav}\n`;
    content += `\n`;

    // Options
    content += `${strings.caseOption}\n`;
    content += `${strings.wholeWordOption}\n`;
    content += `${strings.regexOption}\n`;
    content += `\n`;

    // Closing
    content += `${strings.escapeClose}`;

    return content;
  }

  onClose(): void {
    this.getFindInput()?.focus();
  }

  private getSearchTerm(): string {
    return this.getFindInput()?.value ?? '';
  }

  private getFindState() {
    return {
      matches: 5,      // Get from find widget
      matchIndex: 2,   // Get from find widget
    };
  }

  private getFindInput(): HTMLInputElement | null {
    return document.querySelector('.find-input') as HTMLInputElement;
  }
}
```

### 2. Editor Replace Provider

**File:** `src/vs/editor/contrib/find/browser/editorReplaceAccessibilityHelp.ts`

```typescript
import { nls } from 'vs/nls';
import { AccessibilityHelpProvider } from 'vs/platform/accessibility/browser/accessibleView';

const strings = {
  header: nls.localize('editorReplace.help.header', 'Accessibility Help: Find and Replace'),
  searching: nls.localize('editorReplace.help.searching', 'You are searching for: "{0}".'),
  replacing: nls.localize('editorReplace.help.replacing', 'Replacement text: "{0}".'),
  noReplace: nls.localize('editorReplace.help.noReplace', 'No replacement text entered. Press Tab to move to Replace input.'),
  tabToReplace: nls.localize('editorReplace.help.tabToReplace', 'Press Tab to move to the Replace input field.'),
  enterReplace: nls.localize('editorReplace.help.enterReplace', 'Press Enter to replace the current match and move to the next.'),
  replaceOne: nls.localize('editorReplace.help.replaceOne', 'Press Ctrl+Shift+1 to replace only the current match.'),
  replaceAll: nls.localize('editorReplace.help.replaceAll', 'Press Ctrl+Alt+Enter to replace all matches at once.'),
  preserveCase: nls.localize('editorReplace.help.preserveCase', 'Alt+P: Preserve Case — Maintains the case of the original match.'),
};

export class EditorReplaceAccessibilityHelp implements AccessibilityHelpProvider {
  async provideContent(): Promise<string> {
    const searchTerm = this.getSearchTerm();
    const replaceText = this.getReplaceText();

    let content = `${strings.header}\n\n`;

    // Current status
    content += `${strings.searching.replace('{0}', searchTerm)}\n`;
    if (replaceText) {
      content += `${strings.replacing.replace('{0}', replaceText)}\n`;
    } else {
      content += `${strings.noReplace}\n`;
    }
    content += `\n`;

    // Navigation
    content += `${strings.tabToReplace}\n`;
    content += `${strings.enterReplace}\n`;
    content += `${strings.replaceOne}\n`;
    content += `${strings.replaceAll}\n`;
    content += `\n`;

    // Options
    content += `${strings.preserveCase}`;

    return content;
  }

  onClose(): void {
    this.getActiveInput()?.focus();
  }

  private getSearchTerm(): string {
    return document.querySelector('.find-input')?.value ?? '';
  }

  private getReplaceText(): string {
    return document.querySelector('.replace-input')?.value ?? '';
  }

  private getActiveInput(): HTMLInputElement | null {
    return document.activeElement as HTMLInputElement;
  }
}
```

### 3. Search Across Files Provider

**File:** `src/vs/workbench/contrib/search/browser/searchAccessibilityHelp.ts`

```typescript
import { nls } from 'vs/nls';
import { AccessibilityHelpProvider } from 'vs/platform/accessibility/browser/accessibleView';

const strings = {
  header: nls.localize('search.help.header', 'Accessibility Help: Search Across Files'),
  welcome: nls.localize('search.help.welcome', 'Search finds text and patterns across your entire workspace.'),
  results: nls.localize('search.help.results', '{0} results found across {1} files.'),
  noResults: nls.localize('search.help.noResults', 'No results found. Check your search term or options.'),
  enter: nls.localize('search.help.enter', 'Press Enter to run the search.'),
  tab: nls.localize('search.help.tab', 'Press Tab to move to the results tree.'),
  f4: nls.localize('search.help.f4', 'Press F4 (Fn+Right on Mac) to jump to the next result and open its file.'),
  downArrow: nls.localize('search.help.downArrow', 'Press Down Arrow to navigate results.'),
  enterResult: nls.localize('search.help.enterResult', 'Press Enter on a result to navigate to that match in the editor.'),
  replace: nls.localize('search.help.replace', 'Type in the Replace field (visible when you press Ctrl+H) and press Ctrl+Alt+Enter to replace all matches.'),
  escape: nls.localize('search.help.escape', 'Press Escape to close Search. Your search history is preserved.'),
};

export class SearchAccessibilityHelp implements AccessibilityHelpProvider {
  async provideContent(): Promise<string> {
    const searchTerm = this.getSearchTerm();
    const resultCount = this.getResultCount();

    let content = `${strings.header}\n\n`;
    content += `${strings.welcome}\n\n`;

    // Results status
    if (searchTerm && resultCount > 0) {
      content += `${strings.results.replace('{0}', String(resultCount)).replace('{1}', '12')}\n`;
    } else if (searchTerm) {
      content += `${strings.noResults}\n`;
    }
    content += `\n`;

    // Navigation
    content += `${strings.enter}\n`;
    content += `${strings.tab}\n`;
    content += `${strings.f4}\n`;
    content += `${strings.downArrow}\n`;
    content += `${strings.enterResult}\n`;
    content += `\n`;

    // Replace
    content += `${strings.replace}\n`;
    content += `\n`;

    // Closing
    content += `${strings.escape}`;

    return content;
  }

  onClose(): void {
    this.getSearchInput()?.focus();
  }

  private getSearchTerm(): string {
    return document.querySelector('.search-widget input')?.value ?? '';
  }

  private getResultCount(): number {
    return 42; // Get from search state
  }

  private getSearchInput(): HTMLInputElement | null {
    return document.querySelector('.search-widget input') as HTMLInputElement;
  }
}
```

### 4-8. Other Providers (Terminal, Webview, Output, Problems, Debug Console)

Follow the same pattern:

1. **TerminalFindAccessibilityHelp**: Emphasize buffer/scrollback, Enter/Shift+Enter navigation
2. **WebviewFindAccessibilityHelp**: Include note about webview keyboard handling
3. **OutputAccessibilityHelp**: Explain filter syntax (!text, comma patterns) and log level buttons
4. **ProblemsAccessibilityHelp**: Explain severity/scope toggles, F8/Shift+F8 global navigation
5. **DebugConsoleAccessibilityHelp**: Distinguish filter from console input evaluation

### Registration in Contribution Point

**File:** `src/vs/editor/contrib/find/browser/codeEditor.contribution.ts`

```typescript
import { AccessibilityHelpRegistry } from 'vs/platform/accessibility/browser/accessibleView';
import { EditorFindAccessibilityHelp } from './editorFindAccessibilityHelp';
import { EditorReplaceAccessibilityHelp } from './editorReplaceAccessibilityHelp';

// In registerAction2() or similar registration:
AccessibilityHelpRegistry.register('editorFindAccessibilityHelp', new EditorFindAccessibilityHelp());
AccessibilityHelpRegistry.register('editorReplaceAccessibilityHelp', new EditorReplaceAccessibilityHelp());
```

### ARIA Label Update

**File:** `src/vs/editor/contrib/find/browser/findWidget.ts` (or similar)

```typescript
// Add to find input ARIA label setup:
const ariaLabel = `Find input. ${nls.localize('find.ariaLabel.help', 'Press Alt+F1 for Accessibility Help.')}`;
findInput.setAttribute('aria-label', ariaLabel);
```

This pattern repeats for all 8 find inputs across the codebase.



## Risks and Mitigations

**Keybinding conflicts**: Alt+F1 may conflict in some environments.
- Mitigation: Document conflicts in PR; provide command palette access as fallback

**Focus-based detection unreliability**: Output/Debug Console focus detection might be imprecise.
- Mitigation: Test thoroughly in QA; add explicit context keys if needed in follow-up PR

**Help content drift**: Help becomes outdated if find behavior changes.
- Mitigation: Link help providers to feature code; include help updates in code review

**Consistency gaps**: Help format varies across providers.
- Mitigation: Use shared templates and consistent section headers (Current State → Navigation → Options → Closing)
## Setting a Pattern for Accessibility Excellence

This PRD establishes a pattern that can be applied across VS Code:

1. **Hand-holding over assumptions**: Always explain "why" and "how," not just "what." Users new to accessibility features need guidance, not just feature lists.

2. **Inclusive by design**: Lead with the name of the feature you're explaining. Use "you" and "I" language. Avoid jargon. This approach works for all users, not just those with disabilities.

3. **Consistency breeds discoverability**: One unified Accessibility Help system across multiple find contexts means users learn one interaction pattern and can use it everywhere.

4. **Screen reader users as primary**: When you design for screen reader users first, sighted users benefit from clearer, more organized content. Accessibility is not a special case—it's good design.

5. **Localization and cultural respect**: Provide explicit guidelines for translators and localizers. Accessibility doesn't stop at English; it includes all languages and cultures VS Code serves.

6. **Validation with real users**: Getting feedback from actual screen reader users is not optional. It's the most important test you can run.

Future work can apply these principles to:
- Debugger instructions and breakpoint management
- Source control and merge conflict resolution
- Run and debug configuration
- Extension marketplace browsing
- Settings and configuration options
- Any modal or complex workflow

The goal is for VS Code to be known not just as a powerful editor, but as one where every feature—from simple to complex—is genuinely accessible to everyone.

## Quality Assurance Checklist for Inclusiveness

Before finalizing any help content, verify it meets these inclusiveness standards:

### Language and Tone (Design Principle #2: Fully Inclusive Language)

- [ ] Uses "you" and "I" language (not passive voice like "users should..." or "it can be used")
- [ ] Explains both WHAT and WHY (not just "Press Enter to go to next match" but "Press Enter to go to the next match. This lets you navigate without leaving the find input")
- [ ] Free of jargon; explains acronyms on first use
- [ ] Free of idioms (no "getting the hang of", "piece of cake", "no-brainer")
- [ ] Written as if explaining to someone unfamiliar with the feature
- [ ] Uses concrete examples (not abstract descriptions)
- [ ] No assumptions about prior technical knowledge

### Structure and Scannability (Design Principle #5: Screen Reader Optimized)

- [ ] Clear heading hierarchy (H1 for feature, H2 for sections like "Keyboard Navigation")
- [ ] Each section <200 words for screen reader digestibility
- [ ] Most important info first (current state, then navigation, then advanced options)
- [ ] Bulleted lists for keyboard shortcuts (not paragraphs)
- [ ] Consistent formatting across all 8 help contexts
- [ ] No nested sections deeper than 3 levels

### Mental Models (Design Principle #3: Clear Mental Models)

- [ ] Clearly distinguishes Find (navigate) vs Filter (hide)
- [ ] Explains what each search option does AND when to use it
- [ ] Explains focus behavior explicitly
- [ ] Provides real-world analogies where helpful ("Think of it like...")
- [ ] Clarifies scope: current file, workspace, terminal buffer, webview, etc.
- [ ] Explains state changes clearly

### Context and Dynamic Content (Design Principle #4: Contextual and Dynamic)

- [ ] Help includes current search term (not just generic "Type something")
- [ ] Help includes match count and position if applicable
- [ ] Help acknowledges "no matches" or "no results" states
- [ ] Explains what's currently visible vs what's hidden
- [ ] If in replace mode, help mentions replace
- [ ] Help adapts to which options are currently enabled

### Honesty About Limitations (Design Principle #8: Honest About Limitations)

- [ ] Explains why a limitation exists, not just that it exists
- [ ] Provides workarounds if possible
- [ ] For webview find: clearly explains keyboard handling variability
- [ ] For filter vs find: explains why exclusion syntax exists and what it does
- [ ] For cross-platform: documents differences and why they occur

### Accessibility of the Help Itself (Design Principle #7: Consistently Accessible)

- [ ] Tested with at least one screen reader (NVDA, JAWS, VoiceOver, or Narrator)
- [ ] Heading navigation works correctly
- [ ] List navigation works correctly
- [ ] No focus traps in the help modal
- [ ] Content is readable without visual reference
- [ ] Punctuation doesn't confuse screen readers (e.g., "Alt+C" announced clearly)

### Actionable Content (Design Principle #6: Actionable and Task-Focused)

- [ ] Help answers common questions: "How do I...", "What does... do?", "Why would I...?"
- [ ] Each instruction includes what the result will be
- [ ] Instructions are imperative, not theoretical ("Press Enter" not "Pressing Enter could")
- [ ] Help teaches by doing, not just explaining
- [ ] Keyboard shortcuts are clear and platform-specific

### Localization Readiness (Cross-Cutting)

- [ ] All user-facing strings use nls.localize()
- [ ] No hardcoded English words in code
- [ ] Number/count format uses locale-appropriate separators
- [ ] Platform key names (Ctrl, Cmd, Alt) are localizable with fallbacks
- [ ] Key terms are translated consistently (Match, Filter, Result, Replace, Find)
- [ ] Examples are culturally appropriate or localized

### Consistency Across All 8 Help Contexts

- [ ] Same section headers are used consistently
- [ ] Same terminology for similar concepts
- [ ] Same keybinding notation across all contexts
- [ ] Same visual formatting and structure
- [ ] Focus behavior is explained consistently
- [ ] State information is presented in the same order
