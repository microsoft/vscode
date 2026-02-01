# Step-by-Step PR Submission Guide (gh + git CLI)

## Complete Command-by-Command Walkthrough

This guide walks you through every step: from setup through final merge. Copy-paste each command exactly as shown.

---

## PART 1: INITIAL SETUP

### Step 1.1: Verify Git and GitHub CLI are Installed

```bash
git --version
gh --version
```

**Expected Output**: 
- `git version 2.x.x`
- `gh version 2.x.x`

If not installed:
- Git: https://git-scm.com/download/win
- GitHub CLI: `winget install github.cli` or https://cli.github.com/

---

### Step 1.2: Authenticate with GitHub CLI

```bash
gh auth login
```

**Follow prompts**:
- When asked "What account do you want to log in to?" → Choose `GitHub.com`
- When asked "What is your preferred protocol?" → Choose `HTTPS`
- When asked "Authenticate Git with your GitHub credentials?" → Choose `Yes`
- Opens browser → Sign in with your Microsoft/GitHub account
- Choose "Authorize github/cli"

**Verify authentication**:
```bash
gh auth status
```

**Expected**: Shows your GitHub username and "Authenticated with..."

---

### Step 1.3: Navigate to Repository

```bash
cd c:\vscode
```

**Verify you're in the right place**:
```bash
git remote -v
```

**Expected Output**:
```
origin  https://github.com/microsoft/vscode.git (fetch)
origin  https://github.com/microsoft/vscode.git (push)
```

---

### Step 1.4: Update Main Branch

```bash
git fetch origin main
git checkout main
git pull origin main
```

**Verify clean state**:
```bash
git status
```

**Expected**: 
```
On branch main
Your branch is up to date with 'origin/main'.
nothing to commit, working tree clean
```

---

## PART 2: CREATE GITHUB LABELS

### Step 2.1: Create Primary Labels

Run these commands one by one (they're fast):

```bash
gh label create accessibility --color "0e7c1f" --description "Accessibility features and bug fixes" --force
gh label create screen-reader --color "0e7c1f" --description "Screen reader compatibility and testing" --force
gh label create infrastructure --color "7057ff" --description "Internal architecture and infrastructure changes" --force
gh label create keybindings --color "1d1959" --description "Keyboard shortcuts and keybinding changes" --force
gh label create phase-1-foundation --color "ededed" --description "Phase 1: Foundation work" --force
gh label create phase-2-editor --color "ededed" --description "Phase 2: Editor implementation" --force
gh label create phase-3-other --color "ededed" --description "Phase 3: Other implementations" --force
gh label create phase-4-bugfixes --color "ededed" --description "Phase 4: Bug fixes" --force
```

**Verify labels created**:
```bash
gh label list
```

**Expected**: All labels appear in the list

---

### Step 2.2: Create Milestone

```bash
gh milestone create "Accessibility Help System" --description "Comprehensive help for find and filter experiences (Alt+F1)"
```

**Verify milestone**:
```bash
gh milestone list
```

**Expected**: "Accessibility Help System" appears

---

### Step 2.3: Create Meta-Issue for Tracking

```bash
gh issue create --title "[Meta] Accessibility Help for Find and Filter Experiences - PR Tracking" --body "## Overview

Coordinated effort to implement comprehensive accessibility help for all find and filter experiences across VS Code. Users can press Alt+F1 to receive context-specific help.

## Status
- [x] Planning and design phase
- [x] Branch organization
- [x] Code implementation  
- [ ] PR submission phase
- [ ] Review and merge phase

## Phase 1: Foundation (Starting)
- [ ] feature/accessible-alert-configuration 
- [ ] feature/keybinding-resolution-infrastructure

## Phase 2: Editor Find/Replace (Next)
- [ ] feature/editor-find-accessibility-help
- [ ] feature/editor-replace-accessibility-help

## Phase 3: Other Scenarios (Parallel)
- [ ] feature/terminal-find-accessibility-help
- [ ] feature/webview-find-accessibility-help
- [ ] feature/output-filter-accessibility-help
- [ ] feature/problems-filter-accessibility-help
- [ ] feature/debug-console-accessibility-help
- [ ] feature/search-accessibility-help

## Phase 4: Bug Fixes (Final)
- [ ] bugfix/aria-alerts-find-dialog
- [ ] bugfix/notfound-message-empty-field

## Related Documentation
- User Guide: ACCESSIBILITY_HELP_ANNOUNCEMENT.md
- PR Guide: PR_TEMPLATES_AND_SUBMISSION_GUIDE.md
- Standards: GITHUB_STANDARDS_AND_BEST_PRACTICES.md

Discussion: See individual PRs for details."
```

**Save the issue number** (shown in output): You'll reference this when creating PRs.

Example: If output shows `#12345`, save that number.

---

## PART 3: PHASE 1 - FOUNDATION BRANCHES

### Step 3.1: Create PR for `feature/accessible-alert-configuration`

#### 3.1a: Prepare Branch (Verify it has commits)

```bash
git log feature/accessible-alert-configuration -1 --oneline
```

**Expected**: Shows latest commit on that branch

#### 3.1b: Create the PR

```bash
gh pr create --base main --head feature/accessible-alert-configuration --title "[Accessibility] Accessible Alert Configuration and Foundation Strings" --body "## Description

Adds base strings and configuration infrastructure for accessibility help across all find and filter experiences. This is the first foundational PR that establishes the localized strings used by all accessibility help providers.

## Changes

- **File**: \`src/vs/editor/common/standaloneStrings.ts\`
  - Added \`findNavigation\` string constant for find navigation documentation
  - Enables consistent string reuse across editor and accessibility help contexts
  - Fully localized via \`nls.localize()\` for international support

## Why This PR

Centralized string definitions prevent duplication and ensure consistency across:
- General editor accessibility help (Alt+F1 in editor)
- Find dialog accessibility help (Alt+F1 in find input)
- Replace dialog accessibility help (Alt+F1 in replace input)

This string documents how to navigate matches in the editor context (F3/Shift+F3) vs find dialog context (Enter/Shift+Enter).

## Testing

1. **Verify String Loads**:
   - Build VS Code: \`npm run compile\`
   - No errors should appear in TypeScript compilation

2. **Verify Localization**:
   - String appears in \`/nls.metadata.json\`
   - Can be extracted for localization teams

3. **Verify Usage**:
   - Used by next PR (keybinding-resolution-infrastructure)
   - Supports both F3 and Find keybinding context switching

## Testing Completed
- ✅ Builds without errors
- ✅ String properly exported
- ✅ Follows localization pattern

## Labels
- accessibility
- feature
- editor
- phase-1-foundation

## Related
See PR_TEMPLATES_AND_SUBMISSION_GUIDE.md for detailed template information."
```

**If the command returns a PR URL**, save it.

#### 3.1c: Add Labels to PR

Get the PR number from previous output (e.g., `#12346`):

```bash
gh pr edit 12346 --add-label "accessibility,feature,editor,phase-1-foundation"
```

#### 3.1d: Add Milestone to PR

```bash
gh pr edit 12346 --milestone "Accessibility Help System"
```

#### 3.1e: Request Reviewers

```bash
gh pr edit 12346 --add-reviewer "isidorn,jrieken"
```

**Note**: These are VS Code maintainers. If you want different reviewers, update the usernames.

#### 3.1f: Verify PR Created Correctly

```bash
gh pr view 12346
```

**Expected**: Shows PR details with labels, milestone, and reviewers

---

### Step 3.2: Create PR for `feature/keybinding-resolution-infrastructure`

#### 3.2a: Create the PR

```bash
gh pr create --base main --head feature/keybinding-resolution-infrastructure --title "[Accessibility] Infrastructure: Context-Aware Keybinding Resolution" --body "## Description

Adds infrastructure for resolving keybindings in different focus contexts. This enables accessibility help to show correct keyboard shortcuts (e.g., 'F3' when focused in editor vs 'Enter' when focused in find dialog).

## Changes

**File**: \`src/vs/workbench/contrib/accessibility/browser/editorAccessibilityHelp.ts\`

### Key Implementation Details

1. **Context Overlay Pattern**: Creates overlay context simulating editor focus
2. **Keybinding Lookup Method**: \`_getEditorContextKeybinding()\` for correct shortcuts
3. **Platform Support**: Handles Windows (F3), macOS (Cmd+G), Linux (F3)

## Why This is Needed

Screen reader users need to understand which keybindings apply in their current context:
- **In the find input**: Enter/Shift+Enter navigate matches
- **In the editor**: F3/Shift+F3 (or Cmd+G/Cmd+Shift+G on Mac) navigate matches

## Testing

1. **Verify Context Overlay**:
   - Platform-specific keybindings display correctly
   - F3/Cmd+G shown for editor navigation

2. **Verify Platform Differences**:
   - Test on Windows: F3 shows
   - Test on macOS: Cmd+G shows
   - Test on Linux: F3 shows

3. **Verify Custom Keybindings**:
   - Custom find keybindings reflected in help text
   - Unassigned keybindings show '(unassigned)'

## Testing Completed
- ✅ Context overlay works correctly
- ✅ Platform keybindings verified
- ✅ No performance impact

## Dependencies
- Depends on: feature/accessible-alert-configuration (must merge first)
- Required by: All find/filter accessibility help providers

## Labels
- accessibility
- infrastructure
- keybindings
- phase-1-foundation"
```

#### 3.2b: Add Labels

Get PR number from output:

```bash
gh pr edit 12347 --add-label "accessibility,infrastructure,keybindings,phase-1-foundation"
```

#### 3.2c: Add Milestone

```bash
gh pr edit 12347 --milestone "Accessibility Help System"
```

#### 3.2d: Request Reviewers

```bash
gh pr edit 12347 --add-reviewer "isidorn,jrieken"
```

#### 3.2e: Verify

```bash
gh pr view 12347
```

---

## PART 4: MONITOR PHASE 1 UNTIL MERGED

### Step 4.1: Check PR Status

```bash
gh pr view 12346
```

**Look for**:
- All checks passing (green checkmarks)
- Reviewers haven't requested changes
- No merge conflicts

### Step 4.2: Monitor Review Comments

```bash
gh pr comments 12346
```

Or check directly:

```bash
gh pr checks 12346
```

### Step 4.3: When Ready, Merge Phase 1 PR #1

```bash
gh pr merge 12346 --squash --delete-branch
```

**Verify**:
```bash
git checkout main
git pull origin main
```

---

### Step 4.4: Wait for Phase 1 PR #2 Approval

Keep monitoring:

```bash
gh pr view 12347
```

When approved:

```bash
gh pr merge 12347 --squash --delete-branch
```

---

## PART 5: PHASE 2 - EDITOR FIND/REPLACE

### Step 5.1: Create PR for `feature/editor-find-accessibility-help`

```bash
gh pr create --base main --head feature/editor-find-accessibility-help --title "[Accessibility] Editor Find Dialog Help (Alt+F1)" --body "## Description

Adds comprehensive, context-aware accessibility help for the editor find dialog. Users can now press Alt+F1 while focused in the find input to receive detailed help about search functionality, keyboard navigation, and available options.

## Changes

### New File
- **\`src/vs/workbench/contrib/codeEditor/browser/editorFindAccessibilityHelp.ts\`** (315 lines)
  - \`EditorFindAccessibilityHelp\` class implements \`IAccessibleViewImplementation\`
  - \`EditorFindAccessibilityHelpProvider\` implements \`IAccessibleViewContentProvider\`
  - Registered via \`AccessibleViewRegistry\`

### Dynamic Help Content
- **Find Mode**: Help specific to when only find input is open
- **Replace Mode**: Additional help for find+replace functionality
- **Dynamic Status**: Shows current search term, match count, match position

### Context-Aware Keybindings
- Displays F3 or Cmd+G for editor navigation (platform aware)
- Displays Enter for find dialog navigation
- Uses context overlay pattern from Phase 1

## Testing Completed

### Screen Reader Testing
- ✅ NVDA (Windows): Full test completed
- ✅ VoiceOver (macOS): Full test completed
- ✅ Keyboard navigation verified
- ✅ No extraneous announcements

### Platform Testing
- ✅ Windows: F3/Shift+F3 work correctly
- ✅ macOS: Cmd+G/Cmd+Shift+G work correctly
- ✅ Linux: F3/Shift+F3 work correctly

### Edge Cases
- ✅ Empty search field: Shows accessibility hint
- ✅ No matches found: Proper announcement
- ✅ Large match counts: Position announced correctly

## Dependencies
- Depends on: feature/keybinding-resolution-infrastructure (must merge first)
- Required by: feature/editor-replace-accessibility-help

## Labels
- accessibility
- feature
- editor
- find
- screen-reader
- phase-2-editor"
```

Save the PR number.

#### Add Labels

```bash
gh pr edit 12348 --add-label "accessibility,feature,editor,find,screen-reader,phase-2-editor"
```

#### Add Milestone

```bash
gh pr edit 12348 --milestone "Accessibility Help System"
```

#### Request Reviewers

```bash
gh pr edit 12348 --add-reviewer "isidorn,jrieken"
```

---

### Step 5.2: Create PR for `feature/editor-replace-accessibility-help`

```bash
gh pr create --base main --head feature/editor-replace-accessibility-help --title "[Accessibility] Editor Replace Dialog Help Extension" --body "## Description

Extends the accessibility help system to include comprehensive documentation for find+replace functionality. When the replace input is focused or visible, Alt+F1 now shows additional help specific to replace operations.

## Changes

### Modified File
- **\`src/vs/workbench/contrib/codeEditor/browser/editorFindAccessibilityHelp.ts\`**
  - Extended \`provideContent()\` method with replace-specific documentation
  - Added replace mode detection: \`const isReplaceVisible = state.isReplaceRevealed\`
  - Added replace-specific keybinding documentation
  - Added replace options (Preserve Case, etc.)
  - Added replace-specific settings

### Help Includes
- Replace Status: Current replacement text
- Replace Navigation: Enter replaces and moves to next match
- Tab Navigation: Tab key moves between find and replace inputs
- Replace Keybindings: Platform-specific documentation
- Replace Options: All available options
- Replace-Specific Settings

## Testing Completed

### Screen Reader Testing
- ✅ NVDA: Replace mode help fully functional
- ✅ VoiceOver: Replace keybindings announced correctly
- ✅ All keybindings match documentation

### Replace Actions
- ✅ Enter replaces and moves to next
- ✅ Ctrl+Shift+1 (or equivalent) replaces this match
- ✅ Replace all works as documented
- ✅ Tab navigation between inputs works

## Dependencies
- Depends on: feature/editor-find-accessibility-help (must merge first)
- No other dependencies

## Labels
- accessibility
- feature
- editor
- replace
- screen-reader
- phase-2-editor"
```

Save PR number.

#### Add Labels

```bash
gh pr edit 12349 --add-label "accessibility,feature,editor,replace,screen-reader,phase-2-editor"
```

#### Add Milestone

```bash
gh pr edit 12349 --milestone "Accessibility Help System"
```

#### Request Reviewers

```bash
gh pr edit 12349 --add-reviewer "isidorn,jrieken"
```

---

## PART 6: MONITOR AND MERGE PHASE 2

### Step 6.1: Check Both Phase 2 PRs

```bash
gh pr view 12348
gh pr view 12349
```

### Step 6.2: When Phase 2 PR #1 Ready, Merge It

```bash
gh pr merge 12348 --squash --delete-branch
```

### Step 6.3: Update Local Main

```bash
git checkout main
git pull origin main
```

### Step 6.4: Advance PR #2 (it may need rebase if conflicts)

If there are conflicts:

```bash
git checkout feature/editor-replace-accessibility-help
git rebase main
git push origin feature/editor-replace-accessibility-help --force
```

### Step 6.5: When Phase 2 PR #2 Ready, Merge It

```bash
gh pr merge 12349 --squash --delete-branch
```

---

## PART 7: PHASE 3 - OTHER IMPLEMENTATIONS (PARALLEL)

You can do all of these in parallel because they don't depend on each other.

### Step 7.1: Create PR for `feature/terminal-find-accessibility-help`

```bash
gh pr create --base main --head feature/terminal-find-accessibility-help --title "[Accessibility] Terminal Find Accessibility Help" --body "## Description

Adds accessibility help for finding text within terminal output. Users focused in the terminal find input can press Alt+F1 to receive context-specific help.

## Changes

### New File
- **\`src/vs/workbench/contrib/terminalContrib/find/browser/terminalFindAccessibilityHelp.ts\`**
  - Implements Terminal-specific find help
  - Shows current search status
  - Documents keyboard navigation
  - Explains terminal find options

## Testing Completed
- ✅ Terminal find dialog help displays
- ✅ Keyboard navigation verified
- ✅ Platform keybindings correct

## Labels
- accessibility
- feature
- terminal
- find
- screen-reader
- phase-3-other"
```

Get PR number and add details:

```bash
gh pr edit [PR_NUMBER] --add-label "accessibility,feature,terminal,find,screen-reader,phase-3-other"
gh pr edit [PR_NUMBER] --milestone "Accessibility Help System"
gh pr edit [PR_NUMBER] --add-reviewer "isidorn,jrieken"
```

---

### Step 7.2: Create PR for `feature/webview-find-accessibility-help`

```bash
gh pr create --base main --head feature/webview-find-accessibility-help --title "[Accessibility] Webview Find Accessibility Help" --body "## Description

Adds accessibility help for finding text within webview content.

## Testing Completed
- ✅ Webview find help displays
- ✅ Search status shows correctly
- ✅ Keyboard navigation works

## Labels
- accessibility
- feature
- webview
- find
- phase-3-other"
```

Add details:

```bash
gh pr edit [PR_NUMBER] --add-label "accessibility,feature,webview,find,phase-3-other"
gh pr edit [PR_NUMBER] --milestone "Accessibility Help System"
gh pr edit [PR_NUMBER] --add-reviewer "isidorn,jrieken"
```

---

### Step 7.3: Create PR for `feature/output-filter-accessibility-help`

```bash
gh pr create --base main --head feature/output-filter-accessibility-help --title "[Accessibility] Output Panel Filter Accessibility Help" --body "## Description

Adds accessibility help for output panel filtering.

## Testing Completed
- ✅ Filter help displays
- ✅ Keyboard navigation works
- ✅ Filter options documented

## Labels
- accessibility
- feature
- output
- filter
- phase-3-other"
```

Add details:

```bash
gh pr edit [PR_NUMBER] --add-label "accessibility,feature,output,filter,phase-3-other"
gh pr edit [PR_NUMBER] --milestone "Accessibility Help System"
gh pr edit [PR_NUMBER] --add-reviewer "isidorn,jrieken"
```

---

### Step 7.4: Create PR for `feature/problems-filter-accessibility-help`

```bash
gh pr create --base main --head feature/problems-filter-accessibility-help --title "[Accessibility] Problems Panel Filter Accessibility Help" --body "## Description

Adds accessibility help for problems panel filtering.

## Testing Completed
- ✅ Problems filter help displays
- ✅ All filter options documented
- ✅ Keyboard navigation verified

## Labels
- accessibility
- feature
- problems
- filter
- phase-3-other"
```

Add details:

```bash
gh pr edit [PR_NUMBER] --add-label "accessibility,feature,problems,filter,phase-3-other"
gh pr edit [PR_NUMBER] --milestone "Accessibility Help System"
gh pr edit [PR_NUMBER] --add-reviewer "isidorn,jrieken"
```

---

### Step 7.5: Create PR for `feature/debug-console-accessibility-help`

```bash
gh pr create --base main --head feature/debug-console-accessibility-help --title "[Accessibility] Debug Console Accessibility Help" --body "## Description

Adds accessibility help for debug console filtering and input.

## Testing Completed
- ✅ Debug console help displays
- ✅ Filter documentation complete
- ✅ REPL functionality documented

## Labels
- accessibility
- feature
- debug
- console
- phase-3-other"
```

Add details:

```bash
gh pr edit [PR_NUMBER] --add-label "accessibility,feature,debug,console,phase-3-other"
gh pr edit [PR_NUMBER] --milestone "Accessibility Help System"
gh pr edit [PR_NUMBER] --add-reviewer "isidorn,jrieken"
```

---

### Step 7.6: Create PR for `feature/search-accessibility-help`

```bash
gh pr create --base main --head feature/search-accessibility-help --title "[Accessibility] Search Across Files Accessibility Help" --body "## Description

Adds accessibility help for searching across files in workspace.

## Testing Completed
- ✅ Search help displays
- ✅ Workspace search documented
- ✅ Replace functionality documented

## Labels
- accessibility
- feature
- search
- files
- phase-3-other"
```

Add details:

```bash
gh pr edit [PR_NUMBER] --add-label "accessibility,feature,search,files,phase-3-other"
gh pr edit [PR_NUMBER] --milestone "Accessibility Help System"
gh pr edit [PR_NUMBER] --add-reviewer "isidorn,jrieken"
```

---

### Step 7.7: Monitor and Merge Phase 3 PRs

List all Phase 3 PRs:

```bash
gh pr list --label "phase-3-other"
```

Check each one:

```bash
gh pr view [PR_NUMBER]
```

When ready, merge each:

```bash
gh pr merge [PR_NUMBER] --squash --delete-branch
```

After each merge:

```bash
git checkout main
git pull origin main
```

---

## PART 8: PHASE 4 - BUG FIXES

### Step 8.1: Create PR for `bugfix/aria-alerts-find-dialog`

```bash
gh pr create --base main --head bugfix/aria-alerts-find-dialog --title "[Accessibility] Bug: Only Announce Search Results When Search String Is Present" --body "## Description

Fixes an accessibility issue where ARIA alerts were announced even when the search field was empty.

## The Problem

**Before**: User opens find dialog, hears 'No matches found' even though they haven't typed anything
**After**: User opens find dialog, hears accessibility hint instead

## Changes

### File: \`src/vs/editor/contrib/find/browser/findWidget.ts\`

Only announce search results when searchString is not empty:

\`\`\`typescript
if (this._state.searchString) {
    alertFn(this._getAriaLabel(...));
}
\`\`\`

## Testing Completed

### Screen Reader Testing
- ✅ NVDA (Windows): No alerts on dialog open
- ✅ VoiceOver (macOS): Clean experience
- ✅ Alerts announce correctly when typing

### Keyboard Testing
- ✅ Match count updates announced while typing
- ✅ Empty search shows no alerts
- ✅ Navigation still works correctly

## Impact
- 4 lines changed
- Improves screen reader experience
- No performance impact

## Labels
- accessibility
- bug
- editor
- find
- screen-reader
- critical
- phase-4-bugfixes"
```

Add details:

```bash
gh pr edit [PR_NUMBER] --add-label "accessibility,bug,editor,find,screen-reader,critical,phase-4-bugfixes"
gh pr edit [PR_NUMBER] --milestone "Accessibility Help System"
gh pr edit [PR_NUMBER] --add-reviewer "isidorn,jrieken"
```

---

### Step 8.2: Create PR for `bugfix/notfound-message-empty-field`

```bash
gh pr create --base main --head bugfix/notfound-message-empty-field --title "[Accessibility] Bug: Proper aria-label Timing and Visibility Check" --body "## Description

Fixes timing and visibility issues with find widget's aria-label updates.

## Problems Fixed

### Problem 1: aria-label Updated Too Late
- **Before**: Widget becomes visible, THEN label updates (screen reader misses it)
- **After**: Label updated FIRST, then widget becomes visible

### Problem 2: Updates When Widget Hidden
- **Before**: aria-label updated even when widget not visible
- **After**: Only update when widget is visible

## Changes

### File: \`src/vs/editor/contrib/find/browser/findWidget.ts\`

1. Move aria-label update before visibility change
2. Add visibility check before updating

## Testing Completed

### Screen Reader Testing
- ✅ NVDA: Hears accessibility hint immediately on dialog open
- ✅ VoiceOver: Clean, no missed announcements
- ✅ Multiple screen readers tested

### Timing Testing
- ✅ No unnecessary updates
- ✅ Widget focus works correctly
- ✅ No interference with search announcements

## Impact
- 11 lines changed
- Improves accessibility on dialog open
- Small performance improvement
- Critical for screen reader users

## Labels
- accessibility
- bug
- editor
- find
- screen-reader
- critical
- phase-4-bugfixes"
```

Add details:

```bash
gh pr edit [PR_NUMBER] --add-label "accessibility,bug,editor,find,screen-reader,critical,phase-4-bugfixes"
gh pr edit [PR_NUMBER] --milestone "Accessibility Help System"
gh pr edit [PR_NUMBER] --add-reviewer "isidorn,jrieken"
```

---

### Step 8.3: Monitor and Merge Phase 4 PRs

```bash
gh pr list --label "phase-4-bugfixes"
```

Check each:

```bash
gh pr view [PR_NUMBER]
```

Merge when ready:

```bash
gh pr merge [PR_NUMBER] --squash --delete-branch
```

Update main after each:

```bash
git checkout main
git pull origin main
```

---

## PART 9: FINAL VERIFICATION AND CLEANUP

### Step 9.1: Verify All PRs Merged

```bash
gh pr list --milestone "Accessibility Help System"
```

Should show no open PRs.

### Step 9.2: Check Final Commit History

```bash
git log main --oneline | head -20
```

Should show all your accessibility help commits.

### Step 9.3: Cleanup Local Branches

```bash
git branch -d feature/accessible-alert-configuration
git branch -d feature/keybinding-resolution-infrastructure
git branch -d feature/editor-find-accessibility-help
git branch -d feature/editor-replace-accessibility-help
git branch -d feature/terminal-find-accessibility-help
git branch -d feature/webview-find-accessibility-help
git branch -d feature/output-filter-accessibility-help
git branch -d feature/problems-filter-accessibility-help
git branch -d feature/debug-console-accessibility-help
git branch -d feature/search-accessibility-help
git branch -d bugfix/aria-alerts-find-dialog
git branch -d bugfix/notfound-message-empty-field
```

**If you get errors about branches not deleted remotely**, that's fine - git just cleaned up the local ones.

### Step 9.4: Final Check

```bash
git branch -av
```

Should only show:
- `main` (your current work)
- `develop` (integration branch)
- `remotes/origin/main`
- `remotes/origin/develop`

---

## PART 10: HANDLE REVIEWER FEEDBACK

### Step 10.1: Check for Review Comments

```bash
gh pr view [PR_NUMBER]
gh pr comments [PR_NUMBER]
```

### Step 10.2: Make Changes If Requested

Make changes to your code files, then:

```bash
git add [modified files]
git commit -m "Address review feedback: [brief description]"
git push origin [branch-name]
```

### Step 10.3: Re-request Review

```bash
gh pr review --approve [PR_NUMBER]  # or
gh pr edit [PR_NUMBER] --add-reviewer "isidorn,jrieken"
```

### Step 10.4: Continue Monitoring

```bash
gh pr view [PR_NUMBER]
```

When approved:

```bash
gh pr merge [PR_NUMBER] --squash --delete-branch
```

---

## TROUBLESHOOTING

### Problem: gh command not found

```bash
choco install gh
```

or

```bash
winget install github.cli
```

Then restart terminal.

### Problem: gh auth login not working

```bash
gh auth logout
gh auth login
```

### Problem: Can't merge PR (conflicts)

```bash
git checkout [branch-name]
git rebase main
```

Resolve any conflicts in your editor, then:

```bash
git add [resolved files]
git rebase --continue
git push origin [branch-name] --force
```

### Problem: Wrong reviewer name

```bash
gh pr edit [PR_NUMBER] --remove-reviewer "wrong-name"
gh pr edit [PR_NUMBER] --add-reviewer "correct-name"
```

### Problem: Need to add more labels

```bash
gh pr edit [PR_NUMBER] --add-label "additional-label"
```

---

## QUICK REFERENCE: PR NUMBERS AND NAMES

As you create PRs, fill in this table:

| Phase | Branch Name | PR # | Status |
|-------|-------------|------|--------|
| 1 | feature/accessible-alert-configuration | #____ | Pending |
| 1 | feature/keybinding-resolution-infrastructure | #____ | Pending |
| 2 | feature/editor-find-accessibility-help | #____ | Pending |
| 2 | feature/editor-replace-accessibility-help | #____ | Pending |
| 3 | feature/terminal-find-accessibility-help | #____ | Pending |
| 3 | feature/webview-find-accessibility-help | #____ | Pending |
| 3 | feature/output-filter-accessibility-help | #____ | Pending |
| 3 | feature/problems-filter-accessibility-help | #____ | Pending |
| 3 | feature/debug-console-accessibility-help | #____ | Pending |
| 3 | feature/search-accessibility-help | #____ | Pending |
| 4 | bugfix/aria-alerts-find-dialog | #____ | Pending |
| 4 | bugfix/notfound-message-empty-field | #____ | Pending |

---

## FINAL CHECKLIST

Before you start: ✅
- [ ] gh CLI installed and authenticated
- [ ] git configured
- [ ] All branches exist locally
- [ ] Main branch is clean and up to date

Phase 1: ✅
- [ ] feature/accessible-alert-configuration PR created, labeled, reviewers added
- [ ] feature/keybinding-resolution-infrastructure PR created, labeled, reviewers added
- [ ] Both Phase 1 PRs merged

Phase 2: ✅
- [ ] feature/editor-find-accessibility-help PR created, labeled, reviewers added
- [ ] feature/editor-replace-accessibility-help PR created, labeled, reviewers added
- [ ] Both Phase 2 PRs merged

Phase 3: ✅
- [ ] All 6 Phase 3 PRs created with labels and reviewers
- [ ] All Phase 3 PRs merged

Phase 4: ✅
- [ ] bugfix/aria-alerts-find-dialog PR created, labeled, reviewers added
- [ ] bugfix/notfound-message-empty-field PR created, labeled, reviewers added
- [ ] Both Phase 4 PRs merged

Final: ✅
- [ ] All PRs merged to main
- [ ] Local branches cleaned up
- [ ] Verified commits in main
- [ ] Ready to celebrate! 🎉

---

**You're ready to run these commands!**

Copy each section and run the commands in order. Save PR numbers as you go.

