# Step-by-Step PR Submission Guide (gh + git CLI)
## VS Code Accessibility Help System - Complete Operational Playbook

This guide walks you through every step: from setup through final merge. Copy-paste each command exactly as shown.

---

## CONSOLIDATED 3-PR STRATEGY (RECOMMENDED)

> **IMPORTANT**: This guide has been updated to use a **consolidated 3-PR approach** instead of the original 11-PR/4-phase structure. The 3-PR approach is optimized for Microsoft review and reduces context-switching for maintainers.

### The 3 PRs

| PR | Branch | Description | Files |
|----|--------|-------------|-------|
| **PR 1** | `feature/accessibility-help-foundation` | Foundation & Infrastructure | 12 files |
| **PR 2** | `feature/accessibility-help-content` | Accessibility Help Providers | 7 files |
| **PR 3** | `feature/accessibility-aria-polish` | ARIA Hints & Bug Fixes | 6 files |

### Why 3 PRs Instead of 11?

- **Logical grouping** - Related changes reviewed together
- **Clear dependencies** - PR 2 depends on PR 1, PR 3 depends on PR 2
- **Easier review** - Each PR tells a complete architectural story
- **Reduced context-switching** - Reviewers understand intent without jumping between 11 separate PRs

### PR 1: Foundation & Infrastructure (12 files)
Core wiring that enables accessibility help across VS Code:
- `FIND_ACCESSIBILITY_HELP_PRD.md` - Product requirements document
- `src/vs/editor/contrib/find/browser/findController.ts` - Accessibility help trigger
- `src/vs/platform/accessibility/browser/accessibleView.ts` - Find/filter context support
- `src/vs/workbench/contrib/accessibility/browser/accessibilityConfiguration.ts` - Config options
- `src/vs/workbench/contrib/codeEditor/browser/codeEditor.contribution.ts` - Editor wiring
- `src/vs/workbench/contrib/markers/browser/markers.contribution.ts` - Problems wiring
- `src/vs/workbench/contrib/output/browser/output.contribution.ts` - Output wiring
- `src/vs/workbench/contrib/search/browser/search.contribution.ts` - Search wiring
- `src/vs/workbench/contrib/terminalContrib/find/browser/terminal.find.contribution.ts` - Terminal wiring
- `src/vs/workbench/contrib/webview/browser/webview.contribution.ts` - Webview wiring

### PR 2: Accessibility Help Content (7 files)
All 7 new AccessibilityHelp provider files:
- `src/vs/workbench/contrib/codeEditor/browser/editorFindAccessibilityHelp.ts` - Editor find/replace
- `src/vs/workbench/contrib/terminalContrib/find/browser/terminalFindAccessibilityHelp.ts` - Terminal
- `src/vs/workbench/contrib/webview/browser/webviewFindAccessibilityHelp.ts` - Webview
- `src/vs/workbench/contrib/output/browser/outputAccessibilityHelp.ts` - Output panel
- `src/vs/workbench/contrib/markers/browser/markersAccessibilityHelp.ts` - Problems panel
- `src/vs/workbench/contrib/debug/browser/replAccessibilityHelp.ts` - Debug console
- `src/vs/workbench/contrib/search/browser/searchAccessibilityHelp.ts` - Search

### PR 3: ARIA Hints & Bug Fixes (6 files)
Widget-level ARIA improvements and critical bug fixes:
- `src/vs/editor/contrib/find/browser/findWidget.ts` - Bug fixes for search announcements
- `src/vs/workbench/browser/parts/views/viewFilter.ts` - Tree filter ARIA hints
- `src/vs/workbench/contrib/codeEditor/browser/find/simpleFindWidget.ts` - Base widget hints
- `src/vs/workbench/contrib/search/browser/searchWidget.ts` - Search widget hints
- `src/vs/workbench/contrib/terminalContrib/find/browser/terminalFindWidget.ts` - Terminal hints
- `src/vs/workbench/contrib/webview/browser/webviewFindWidget.ts` - Webview hints

---

## 🚀 QUICK START: Automated PR Workflow (Recommended)

**PowerShell scripts are available to automate the entire PR process!**

Located in `scripts/pr-automation/`, these scripts handle:
- Prerequisites validation with auto-fix
- Branch content verification and cross-checking
- PR creation with labels, reviewers, and milestones
- Real-time PR monitoring dashboard
- Safe merging with readiness checks

### Quick Commands

```powershell
# Navigate to automation scripts
cd c:\vscode\scripts\pr-automation

# 1. Check prerequisites (run first!)
.\Check-Prerequisites.ps1 -Fix

# 2. Verify branches before creating PRs
.\Verify-Branches.ps1 -Phase 1

# 3. Create PR 1 (Foundation)
.\Create-PRs.ps1 -Phase 1

# 4. Monitor PR status (live dashboard)
.\Monitor-PRs.ps1 -Watch

# 5. Merge when approved
.\Merge-PRs.ps1 -Phase 1

# Or run the complete workflow:
.\Run-PRWorkflow.ps1 -Phase 1
```

### Complete 3-PR Workflow

```powershell
# PR 1: Foundation & Infrastructure
.\Run-PRWorkflow.ps1 -Phase 1
# Wait for approval and merge...
.\Merge-PRs.ps1 -Phase 1

# PR 2: Accessibility Help Content
.\Run-PRWorkflow.ps1 -Phase 2
# Wait for approval and merge...
.\Merge-PRs.ps1 -Phase 2

# PR 3: ARIA Hints & Bug Fixes
.\Run-PRWorkflow.ps1 -Phase 3
# Wait for approval and merge...
.\Merge-PRs.ps1 -Phase 3
```

### Available Scripts

| Script | Purpose |
|--------|---------|
| `Check-Prerequisites.ps1` | Validates git, gh CLI, authentication, and branches |
| `Verify-Branches.ps1` | Cross-checks branch content against expectations |
| `Create-PRs.ps1` | Creates PRs with proper metadata |
| `Monitor-PRs.ps1` | Live dashboard showing PR status |
| `Merge-PRs.ps1` | Safely merges approved PRs |
| `Run-PRWorkflow.ps1` | Orchestrates the complete workflow |
| `PR-Config.ps1` | Configuration (reviewers, labels, expected files) |

### Configuration

Edit `PR-Config.ps1` to customize:
- **Reviewers**: Update GitHub usernames for each PR
- **Labels**: Modify or add labels
- **Expected files**: Adjust file expectations per branch
- **Milestones**: Change project milestone name

### Dry Run Mode

Preview any action without making changes:

```powershell
.\Create-PRs.ps1 -Phase 1 -DryRun
.\Merge-PRs.ps1 -AutoMerge -DryRun
```

---

> **Note**: The manual instructions below are preserved for reference and learning.
> The automated scripts perform all these steps with additional validation.

---

### About This Guide
- **Target**: VS Code contributors submitting accessibility help feature work
- **Scope**: 3 coordinated PRs (consolidated from original 11-PR design)
- **Primary Tool**: GitHub CLI (gh) + git + PowerShell automation
- **Engineer Assignment**: Configure in `PR-Config.ps1`
- **Learning**: Each section explains WHY the step matters

### Key VS Code Concepts You'll Encounter
- **Accessibility Providers**: `IAccessibleViewImplementation` pattern
- **Context Keys**: Dynamic UI state that affects keybindings
- **Registry Pattern**: `AccessibleViewRegistry` for feature registration
- **Localization**: `nls.localize()` for non-English support
- **These PRs Implement**: Alt+F1 help for find/filter experiences

### Who Should Review Each PR
- **PR 1 (Foundation)**: isidorn (accessibility owner), jrieken (editor owner)
- **PR 2 (Content)**: isidorn (accessibility owner)
- **PR 3 (Polish)**: isidorn (accessibility owner), jrieken (editor owner)

---

## IMPORTANT: ENGINEER ASSIGNMENT SETUP

### Before You Start: Document Who Reviews What

For VS Code, different areas have specific maintainers. Fill this in with your reviewer information:

**Create a file** `c:\vscode\REVIEWER_ASSIGNMENTS.md`:

```markdown
# PR Reviewer Assignments (Consolidated 3-PR Approach)

## PR 1: Foundation & Infrastructure
- **Branch**: feature/accessibility-help-foundation
- **Files**: 12 (infrastructure wiring, contribution registrations, PRD)
- **Assigned to**: _________________ (accessibility lead + editor owner)
- **GitHub username(s)**: isidorn, jrieken

## PR 2: Accessibility Help Content
- **Branch**: feature/accessibility-help-content
- **Files**: 7 new AccessibilityHelp provider files
- **Assigned to**: _________________ (accessibility lead)
- **GitHub username(s)**: isidorn

## PR 3: ARIA Hints & Bug Fixes
- **Branch**: feature/accessibility-aria-polish
- **Files**: 6 (widget ARIA hints + findWidget bug fixes)
- **Assigned to**: _________________ (accessibility lead + editor owner)
- **GitHub username(s)**: isidorn, jrieken
```

**Why?** You'll use these exact usernames in the `gh pr edit` commands. Having them here prevents copy-paste errors.

---

## PART 1: INITIAL SETUP

### Step 1.0: Contributor Licensing Agreement (first-time contributors)

If this is your first contribution to microsoft/vscode (or another Microsoft repo), you must sign the contributor licensing agreement before a PR can be accepted. This helps Microsoft and downstream users accept and redistribute your contribution.

Quick checks and steps:

- **What to sign**: An Individual Contributor License Agreement (ICLA) or a company-level CLA (CCLA) as required by Microsoft open-source contribution processes.
- **How to sign**: Visit the Microsoft open source CLA site and follow the instructions: https://opensource.microsoft.com/cla/.
- **From a PR**: If you open a PR before signing, the PR checks will usually indicate a "CLA" or "license" check. That check contains a link you can follow to sign with your GitHub account.
- **If your employer needs to sign**: They may need to complete a corporate CLA (CCLA). Follow the guidance on the CLA site or ask your legal/open-source contact to complete the steps.

Troubleshooting and support:

- If the CLA check does not update after signing, ensure you signed with the same GitHub account you used to create the PR and allow a few minutes for the bot to re-run checks.
- If you cannot find the CLA link or need help, contact the repo maintainers or the Microsoft open source support team via the contact details on the CLA site.

Add this step before continuing with tool installation below.

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

### Step 1.5: VS CODE-SPECIFIC CHECK: Verify Build System

```bash
npm --version
```

**Expected**: npm 8.x or higher

This matters because VS Code's `npm run` commands (which you'll use for testing) depend on npm being available.

### Step 1.6: List Your Branches (Verify They Exist)

```bash
git branch -a | grep -E "feature/accessibility"
```

**Expected output** (all 3 should be present):
```
feature/accessibility-help-foundation
feature/accessibility-help-content
feature/accessibility-aria-polish
```

If any are missing, create them from the appropriate base. **Do not proceed until all 3 exist.**

---

## PART 1.7: FILE VERIFICATION CHECKLIST (Use Before Each PR)

### Why Verify Files First?

Before you submit a PR to Microsoft, **verify the branch has exactly the right files**:
- ✅ No unintended files modified
- ✅ All necessary files present
- ✅ No debug code or comments left behind
- ✅ Code style follows VS Code conventions
- ✅ TypeScript compilation works

**5 minutes of verification saves hours of review feedback.**

---

### Understanding Branch vs Main Differences

A branch should contain **only the changes needed for that feature**. Nothing more, nothing less.

**Example**: `feature/accessible-alert-configuration` should:
- ✅ Modify: `src/vs/editor/common/standaloneStrings.ts` (add string)
- ❌ NOT modify: Any other files
- ❌ NOT include: Debug console.log() statements
- ❌ NOT include: Temporary test files

---

### Universal Verification Steps (Use for Any Branch)

#### Step 1: List What Files Changed

```bash
git checkout [BRANCH_NAME]
git diff main...[BRANCH_NAME] --name-only
```

**Example**:
```bash
git checkout feature/accessible-alert-configuration
git diff main...feature/accessible-alert-configuration --name-only
```

**Expected output**: Should show ONLY the files that need to change for this feature.

**If unexpected files appear**: Stop. Run:
```bash
git status
```

Make sure you didn't accidentally modify files. If you did:
```bash
git checkout main -- [UNINTENDED_FILE]
git add [UNINTENDED_FILE]
git commit -m "Remove accidental change to [file]"
```

---

#### Step 2: Review the Actual Changes

```bash
git diff main...[BRANCH_NAME]
```

This shows every line that changed. Review it line-by-line for:
- ✅ Code quality
- ✅ No debug statements (console.log, debugger)
- ✅ Proper TypeScript types (no `any`)
- ✅ Comment clarity
- ✅ No trailing whitespace

**Expected**: Clean, professional code. Nothing left behind from development.

---

#### Step 3: Verify Compilation

VS Code uses TypeScript strict mode. Verify your branch compiles:

```bash
npm run compile
```

**Expected output**:
```
[hh:mm:ss] Compilation complete. X files compiled
```

**If you see errors**: Read them carefully. Fix the errors in your branch files, then:
```bash
git add [FIXED_FILES]
git commit -m "Fix TypeScript compilation errors"
```

---

#### Step 4: Check Localization (Strings)

If your branch modifies any user-facing strings, they must use `nls.localize()`:

```bash
git diff main...[BRANCH_NAME] | grep -i "nls.localize"
```

**Expected**: See `nls.localize()` calls for any user-facing text.

**If you see hardcoded strings that show to users**: That's wrong. Fix it:
```typescript
// ❌ WRONG
return 'User sees this text';

// ✅ RIGHT
return localize('myStringId', 'User sees this text');
```

---

#### Step 5: Verify Commit Message Quality

```bash
git log main...[BRANCH_NAME] --oneline
```

**Expected output**: Shows your commit(s) with clear messages.

Example good commit:
```
a1b2c3d Add findNavigation localized string
```

Example bad commits:
```
❌ WIP
❌ temp
❌ fix
❌ asdf
```

**If you have bad commit messages**: Amend the last commit:

```bash
git commit --amend -m "Clear, descriptive commit message"
git push origin [BRANCH_NAME] --force
```

---

### Phase-Specific File Verification

#### PHASE 1 - PR 1: `feature/accessible-alert-configuration`

**Expected files changed**:
```
src/vs/editor/common/standaloneStrings.ts
```

**Verification command**:
```bash
git checkout feature/accessible-alert-configuration
git diff main...feature/accessible-alert-configuration --name-only
```

**Expected output**:
```
src/vs/editor/common/standaloneStrings.ts
```

**Should have exactly 1 file. Not more, not fewer.**

**What changed**: One new string definition added. (~5 lines)

**Verify**:
```bash
git diff main...feature/accessible-alert-configuration
```

Should show:
- ✅ One new `export const findNavigation = ...` line
- ✅ Proper localization pattern
- ❌ No other changes
- ❌ No deleted lines

---

#### PHASE 1 - PR 2: `feature/keybinding-resolution-infrastructure`

**Expected files changed**:
```
src/vs/workbench/contrib/accessibility/browser/editorAccessibilityHelp.ts
```

**Verification command**:
```bash
git checkout feature/keybinding-resolution-infrastructure
git diff main...feature/keybinding-resolution-infrastructure --name-only
```

**Expected output**:
```
src/vs/workbench/contrib/accessibility/browser/editorAccessibilityHelp.ts
```

**Should have exactly 1 file.**

**What changed**: Added `_editorContextKeyService` overlay and `_getEditorContextKeybinding()` method. (~20-30 lines added)

**Verify**:
```bash
git diff main...feature/keybinding-resolution-infrastructure
```

Should show:
- ✅ New private field `_editorContextKeyService`
- ✅ New method `_getEditorContextKeybinding()`
- ✅ Context overlay setup code
- ❌ No modifications to existing method logic
- ❌ No debug code

---

#### PHASE 2 - PR 3: `feature/editor-find-accessibility-help`

**Expected files changed**:
```
src/vs/workbench/contrib/codeEditor/browser/editorFindAccessibilityHelp.ts
```

**Verification command**:
```bash
git checkout feature/editor-find-accessibility-help
git diff main...feature/editor-find-accessibility-help --name-only
```

**Expected output** (exactly 1 new file):
```
src/vs/workbench/contrib/codeEditor/browser/editorFindAccessibilityHelp.ts
```

**What changed**: Entire new file (~315 lines)

**Verify the file exists**:
```bash
git show feature/editor-find-accessibility-help:src/vs/workbench/contrib/codeEditor/browser/editorFindAccessibilityHelp.ts | wc -l
```

**Expected**: Output around 315 (total lines in file)

**Verify quality**:
```bash
git diff main...feature/editor-find-accessibility-help | head -100
```

Should show:
- ✅ Proper class definition
- ✅ IAccessibleViewImplementation interface implementation
- ✅ Proper imports at top
- ✅ Microsoft copyright header
- ✅ JSDoc comments for methods
- ❌ No console.log or debugger statements
- ❌ No `any` types

---

#### PHASE 3 - Each PR: `feature/[context]-accessibility-help`

**6 PRs total - verify each one:**

| PR | Branch | Expected New File |
|----|--------|------------------|
| 4 | feature/terminal-find-accessibility-help | src/vs/workbench/contrib/terminalContrib/find/browser/terminalFindAccessibilityHelp.ts |
| 5 | feature/webview-find-accessibility-help | src/vs/workbench/contrib/webview/browser/webviewFindAccessibilityHelp.ts |
| 6 | feature/output-filter-accessibility-help | src/vs/workbench/contrib/output/browser/outputAccessibilityHelp.ts |
| 7 | feature/problems-filter-accessibility-help | src/vs/workbench/contrib/markers/browser/markersAccessibilityHelp.ts |
| 8 | feature/debug-console-accessibility-help | src/vs/workbench/contrib/debug/browser/replAccessibilityHelp.ts |
| 9 | feature/search-accessibility-help | src/vs/workbench/contrib/search/browser/searchAccessibilityHelp.ts |

**For each Phase 3 PR, verify**:

```bash
git checkout feature/[context]-accessibility-help
git diff main...feature/[context]-accessibility-help --name-only
```

**Expected**: Each should have exactly 1 new file.

**Example**:
```bash
git checkout feature/terminal-find-accessibility-help
git diff main...feature/terminal-find-accessibility-help --name-only
# Should output: src/vs/workbench/contrib/terminalContrib/find/browser/terminalFindAccessibilityHelp.ts
```

---

#### PHASE 4 - PR 11: `bugfix/aria-alerts-find-dialog`

**Expected files changed**:
```
src/vs/editor/contrib/find/browser/findWidget.ts
```

**Verification command**:
```bash
git checkout bugfix/aria-alerts-find-dialog
git diff main...bugfix/aria-alerts-find-dialog --name-only
```

**Expected output** (exactly 1 file):
```
src/vs/editor/contrib/find/browser/findWidget.ts
```

**What changed**: ~4-line fix to ARIA announcement logic

**Verify the change is minimal**:
```bash
git diff main...bugfix/aria-alerts-find-dialog | wc -l
```

**Expected**: Around 10-15 lines total (with context)

**Verify the fix logic**:
```bash
git diff main...bugfix/aria-alerts-find-dialog
```

Should show:
- ✅ Wrapped ARIA alert in `if (this._state.searchString)` check
- ✅ No other changes to the method
- ✅ Clearly targets the empty search bug

---

#### PHASE 4 - PR 12: `bugfix/notfound-message-empty-field`

**Expected files changed**:
```
src/vs/editor/contrib/find/browser/findWidget.ts
```

**Verification command**:
```bash
git checkout bugfix/notfound-message-empty-field
git diff main...bugfix/notfound-message-empty-field --name-only
```

**Expected output** (exactly 1 file):
```
src/vs/editor/contrib/find/browser/findWidget.ts
```

**What changed**: ~11-line fix for aria-label timing and visibility

**Verify the changes**:
```bash
git diff main...bugfix/notfound-message-empty-field
```

Should show:
- ✅ Move aria-label update before visibility change
- ✅ Add visibility check before updating
- ✅ Clear comments explaining the fix
- ✅ Minimal, surgical changes

---

### Verification Checklist Template

**Use this before EVERY PR creation:**

```
Before Creating PR #___ for [BRANCH_NAME]:

File Check:
  [ ] Correct files modified/created (see Phase-Specific above)
  [ ] No unintended files changed
  [ ] No temporary or debug files included
  [ ] File count matches expectation

Code Quality:
  [ ] No console.log() or debugger statements
  [ ] No TODO comments left behind
  [ ] No `any` types (no cheating on TypeScript)
  [ ] Proper JSDoc comments on public methods
  [ ] Microsoft copyright header present (if new file)

Standards:
  [ ] Follows VS Code naming conventions
  [ ] Uses 1 tab indent (not spaces)
  [ ] Localized strings use nls.localize()
  [ ] No trailing whitespace

Builds:
  [ ] Runs "npm run compile" with no errors
  [ ] TypeScript strict mode passes

Git:
  [ ] Commit message is clear and professional
  [ ] No "WIP" or "temp" commits
  [ ] Branch is up to date with main

Ready to PR:
  [ ] All above checked
  [ ] Ready to submit
```

---

### Quick Reference: Verification One-Liner Per Branch

Copy-paste these to quickly verify each branch before PR:

**Phase 1 - PR 1**:
```bash
git checkout feature/accessible-alert-configuration && git diff main...feature/accessible-alert-configuration --name-only && echo "Files OK" && git diff main...feature/accessible-alert-configuration | head -20
```

**Phase 1 - PR 2**:
```bash
git checkout feature/keybinding-resolution-infrastructure && git diff main...feature/keybinding-resolution-infrastructure --name-only && npm run compile
```

**Phase 2 - PR 3**:
```bash
git checkout feature/editor-find-accessibility-help && git diff main...feature/editor-find-accessibility-help --name-only && git diff main...feature/editor-find-accessibility-help | wc -l && npm run compile
```

(And so on for each PR...)

---



### Understanding VS Code Labels

In VS Code's issue tracker, labels help maintainers:
- **Triage** (what area is this?)
- **Filter** (show me all accessibility issues)
- **Track** (which phase is this PR in?)
- **Prioritize** (is this urgent?)

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

**Learning Note**: VS Code uses a few dozen standard labels. These are **additions** that help organize your specific work.

**Verify labels created**:
```bash
gh label list | grep -E "accessibility|screen-reader|infrastructure|keybindings|phase"
```

**Expected**: All 8 labels appear in the list

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

### What Phase 1 Does (Learning Context)

Phase 1 creates the **foundation** that all other PRs depend on:
1. **String resources**: Localized text for help content
2. **Keybinding resolution pattern**: How to show correct shortcuts for different contexts

Without Phase 1 merged, other PRs will have conflicts. This is why it goes first.

### Step 3.1: Create PR for `feature/accessible-alert-configuration`

#### 3.1a: Pre-PR File Verification for `feature/accessible-alert-configuration`

**BEFORE creating the PR, verify the branch is correct.**

Check files changed:

```bash
git checkout feature/accessible-alert-configuration
git diff main...feature/accessible-alert-configuration --name-only
```

**Expected output** (exactly 1 file):
```
src/vs/editor/common/standaloneStrings.ts
```

**If you see different files**: Stop here. Don't create the PR. Fix the branch first.

Review the changes:

```bash
git diff main...feature/accessible-alert-configuration
```

**Expected to see**:
- ✅ One new string definition: `export const findNavigation = ...`
- ✅ Proper localization format with `localize()`
- ❌ No other changes
- ❌ No console.log statements

Verify compilation:

```bash
npm run compile
```

**Expected**: Completes without errors.

**Checklist before proceeding**:
- [ ] Only 1 file in the diff
- [ ] That file is `src/vs/editor/common/standaloneStrings.ts`
- [ ] The change adds `findNavigation` string
- [ ] `npm run compile` passes
- [ ] No debug code

**If all checks pass**: You're ready to create the PR. Continue to 3.1b.

#### 3.1b: Create the PR

Now that files are verified, create the PR:

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

**What this does**: Creates a PR from your branch to main with the description above.

**Output**: Shows something like `Created pull request #12346 (main:feature/accessible-alert-configuration)`

**Save this number**: You'll need it in the next steps.

#### 3.1c: Assign to Specific Engineer

**This is where you assign to a person.** Check your `REVIEWER_ASSIGNMENTS.md` for "Phase 1 - PR1" - get the GitHub username.

Example: If the file says "assign to @isidorn", run:

```bash
gh pr edit 12346 --add-reviewer "isidorn"
```

**Replace "isidorn" with your actual engineer's GitHub username.**

**Learning note**: In VS Code, the `--add-reviewer` flag doesn't just list them - it sends them a notification. Use specific usernames, not just their display names.

#### 3.1d: Add Labels to PR

```bash
gh pr edit 12346 --add-label "accessibility,feature,editor,phase-1-foundation"
```

**Why labels matter**:
- Your reviewers filter on "phase-1-foundation" to find your work
- VS Code's CI uses labels to determine which tests to run
- Project tracking uses them to generate reports

#### 3.1e: Add Milestone to PR

```bash
gh pr edit 12346 --milestone "Accessibility Help System"
```

**Why milestones matter**:
- Groups all related PRs together
- Helps VS Code maintainers understand "this is a coordinated effort"
- Provides progress tracking

#### 3.1f: Verify PR Created Correctly

```bash
gh pr view 12346
```

**Expected output includes**:
```
title: [Accessibility] Accessible Alert Configuration and Foundation Strings
state: OPEN
reviewers: isidorn (requested)
labels: accessibility, feature, editor, phase-1-foundation
milestone: Accessibility Help System
```

If anything is missing, use `gh pr edit 12346 --add-label "..."` etc to fix it.

---

### Step 3.2: Create PR for `feature/keybinding-resolution-infrastructure`

#### 3.2a: Pre-PR File Verification for `feature/keybinding-resolution-infrastructure`

**Before creating the PR, verify the branch is correct.**

Check files changed:

```bash
git checkout feature/keybinding-resolution-infrastructure
git diff main...feature/keybinding-resolution-infrastructure --name-only
```

**Expected output** (exactly 1 file):
```
src/vs/workbench/contrib/accessibility/browser/editorAccessibilityHelp.ts
```

**If you see different files or more than 1**: Stop here. Fix the branch first.

Review the changes (should be ~20-30 lines):

```bash
git diff main...feature/keybinding-resolution-infrastructure
```

**Expected to see**:
- ✅ New private field: `_editorContextKeyService`
- ✅ New method: `_getEditorContextKeybinding()`
- ✅ Context overlay setup code
- ❌ No changes to existing methods
- ❌ No debug code

Verify compilation:

```bash
npm run compile
```

**Expected**: Completes without errors.

**Checklist before proceeding**:
- [ ] Only 1 file in the diff
- [ ] That file is `src/vs/workbench/contrib/accessibility/browser/editorAccessibilityHelp.ts`
- [ ] New method `_getEditorContextKeybinding()` added
- [ ] `npm run compile` passes
- [ ] No unintended changes to other methods

**If all checks pass**: You're ready to create the PR. Continue to 3.2b.

#### 3.2b: Create the PR

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

#### 3.2b: Assign to Specific Engineer

Check your `REVIEWER_ASSIGNMENTS.md` for "Phase 1 - PR2" and get the GitHub username:

```bash
gh pr edit 12347 --add-reviewer "jrieken"
```

**Replace "jrieken" with your actual engineer's GitHub username.**

#### 3.2c: Add Labels

```bash
gh pr edit 12347 --add-label "accessibility,infrastructure,keybindings,phase-1-foundation"
```

#### 3.2d: Add Milestone

```bash
gh pr edit 12347 --milestone "Accessibility Help System"
```

#### 3.2e: Verify

```bash
gh pr view 12347
```

---

## PART 4: MONITOR PHASE 1 UNTIL MERGED

### Step 4.1: Understanding the Review Process

In VS Code, reviewers look for:
1. **Code quality**: Does it follow VS Code patterns?
2. **Tests**: Have tests been added/updated?
3. **Performance**: Any slowdowns?
4. **Accessibility**: Does it actually help screen reader users?
5. **Localization**: Are strings properly externalized?

### Step 4.2: Check PR Status

```bash
gh pr view 12346
```

**Look for**:
- "status: OPEN" and "reviews: PENDING"
- No merge conflicts (should show none)
- All checks passing (CI tests, linting, etc.)

### Step 4.3: Monitor Review Comments

```bash
gh pr comments 12346
```

Or view the full PR in browser:

```bash
gh pr view 12346 --web
```

This opens the GitHub web UI where you can see the discussion thread.

### Step 4.4: When Ready, Merge Phase 1 PR #1

**Wait until**:
- Reviewer has "APPROVED" (not just commented)
- All checks show green checkmarks
- No merge conflicts

Then merge:

```bash
gh pr merge 12346 --squash --delete-branch
```

**What `--squash` does**: Combines all commits on the branch into one single commit on main. This keeps main's history clean.

**What `--delete-branch` does**: Automatically deletes the feature branch after merging.

**Verify merge**:
```bash
git checkout main
git pull origin main
git log --oneline | head -5
```

Should show your new commit with "[Accessibility]" in the message.

---

### Step 4.5: Wait for Phase 1 PR #2 Approval

Keep monitoring:

```bash
gh pr view 12347
```

When approved and checks pass:

```bash
gh pr merge 12347 --squash --delete-branch
```

**Important**: Don't skip PR #1 merging. PR #2 may have conflicts until PR #1 is merged.

---

---

## PART 5: PHASE 2 - EDITOR FIND/REPLACE

### What Phase 2 Does (Learning Context)

Phase 2 is the **main feature implementation**. This is where users actually get help when they press Alt+F1.

- **PR #3**: The comprehensive find help (315 lines of functionality)
- **PR #4**: Extend with replace-specific help

This is the high-value PR. Most testing happens here. Most questions will come from reviewers here.

### Step 5.1: Create PR for `feature/editor-find-accessibility-help`

#### 5.1 Pre-PR File Verification

**Before creating the PR, verify the branch is correct. This is a 315-line feature - pay special attention.**

Check files changed (should be exactly 1 new file):

```bash
git checkout feature/editor-find-accessibility-help
git diff main...feature/editor-find-accessibility-help --name-only
```

**Expected output**:
```
src/vs/workbench/contrib/codeEditor/browser/editorFindAccessibilityHelp.ts
```

**If you see more than 1 file**: Stop. This PR should only add one new file.

Verify file size (should be around 315 lines):

```bash
git show feature/editor-find-accessibility-help:src/vs/workbench/contrib/codeEditor/browser/editorFindAccessibilityHelp.ts | wc -l
```

**Expected**: Around 300-350 lines.

Review code quality (first 50 lines - check header, imports, class definition):

```bash
git diff main...feature/editor-find-accessibility-help | head -70
```

**Expected to see**:
- ✅ Microsoft copyright header at top
- ✅ TypeScript `import` statements
- ✅ `export class EditorFindAccessibilityHelp implements IAccessibleViewImplementation`
- ✅ JSDoc comments on key methods
- ❌ No `any` types
- ❌ No console.log or debugger

Check for implementation quality (look for key methods):

```bash
git show feature/editor-find-accessibility-help:src/vs/workbench/contrib/codeEditor/browser/editorFindAccessibilityHelp.ts | grep -E "provideContent|priority|type|id"
```

**Expected**: Shows key required methods.

Check for debug code:

```bash
git diff main...feature/editor-find-accessibility-help | grep -iE "console\.|debugger|TODO|FIXME|HACK"
```

**Expected**: No output (no debug code).

Verify compilation:

```bash
npm run compile
```

**Expected**: Completes without errors. May show warnings about unused imports, but NO errors.

**Checklist before proceeding**:
- [ ] Only 1 file: `editorFindAccessibilityHelp.ts`
- [ ] File is ~315 lines
- [ ] Starts with Microsoft copyright header
- [ ] Has proper class definition
- [ ] Has key methods: `provideContent()`, `priority`, `type`, `id`
- [ ] No `any` types
- [ ] No console.log or debugger statements
- [ ] `npm run compile` has no errors

**If all checks pass**: You're ready to create the PR.

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

**Note**: This PR provides accessibility help for BOTH Find and Replace modes in a single comprehensive implementation.

## Labels
- accessibility
- feature
- editor
- find
- screen-reader
- phase-2-editor"
```

**Save the PR number** (e.g., 12348).

#### 5.1a: Assign PM-Specific Reviewer

Check your `REVIEWER_ASSIGNMENTS.md` for "Phase 2 - PR3". Get the specific engineer:

```bash
gh pr edit 12348 --add-reviewer "isidorn"
```

**Learning note**: This is the main find PR, so it may have multiple reviewers. You could add more:

```bash
gh pr edit 12348 --add-reviewer "jrieken"
```

Each `--add-reviewer` adds another person to the request list.

#### 5.1b: Add Labels

```bash
gh pr edit 12348 --add-label "accessibility,feature,editor,find,screen-reader,phase-2-editor"
```

#### 5.1c: Add Milestone

```bash
gh pr edit 12348 --milestone "Accessibility Help System"
```

---

## PART 6: MONITOR AND MERGE PHASE 2

### Step 6.1: Check Phase 2 PR

```bash
gh pr view 12348
```

### Step 6.2: When Phase 2 PR Ready, Merge It

```bash
gh pr merge 12348 --squash --delete-branch
```

### Step 6.3: Update Local Main

```bash
git checkout main
git pull origin main
```

---

## PART 7: PHASE 3 - OTHER IMPLEMENTATIONS (PARALLEL)

### What Phase 3 Does (Learning Context)

Phase 3 extends the accessibility help to **6 different areas** of VS Code. These can all go in parallel because:
- They don't depend on each other
- Each has its own maintainer
- They're independent features

**Important**: Each one has a specific owner/maintainer. The `REVIEWER_ASSIGNMENTS.md` file should have different people for each.

### Important: Use Your REVIEWER_ASSIGNMENTS.md for Each Phase 3 PR

Phase 3 is unique: each PR might go to a different owner. Example:
- Terminal find → `terminal` maintainer
- Search help → `search` feature owner
- Debug console → `debug` maintainer

**Before you start Phase 3**: Make sure your `REVIEWER_ASSIGNMENTS.md` has **different reviewers** for each Phase 3 PR.

---

### Pre-Verification for All Phase 3 PRs

**Every Phase 3 PR follows the same pattern:**
1. Each adds exactly one new file
2. Each implements `IAccessibleViewImplementation`
3. Each has similar structure (~100-150 lines typically)

**Use this verification template for each Phase 3 PR:**

```bash
git checkout [BRANCH_NAME]
git diff main...[BRANCH_NAME] --name-only
# Should show exactly 1 file

git diff main...[BRANCH_NAME] | wc -l
# Should show roughly 100-150 total lines

npm run compile
# Should pass with no errors
```

---

### Step 7.1: Create PR for `feature/terminal-find-accessibility-help`

#### 7.1 Pre-PR File Verification

Check files:

```bash
git checkout feature/terminal-find-accessibility-help
git diff main...feature/terminal-find-accessibility-help --name-only
```

**Expected output** (exactly 1 new file):
```
src/vs/workbench/contrib/terminalContrib/find/browser/terminalFindAccessibilityHelp.ts
```

Verify the file (should be ~100-150 lines):

```bash
git show feature/terminal-find-accessibility-help:src/vs/workbench/contrib/terminalContrib/find/browser/terminalFindAccessibilityHelp.ts | wc -l
```

Check code quality:

```bash
git diff main...feature/terminal-find-accessibility-help | head -30
```

**Expected**:
- ✅ Microsoft copyright header
- ✅ Class implements `IAccessibleViewImplementation`
- ✅ Terminal-specific help content
- ❌ No `any` types
- ❌ No debug code

Compile:

```bash
npm run compile
```

**Checklist**:
- [ ] 1 file: `terminalFindAccessibilityHelp.ts`
- [ ] ~100-150 lines
- [ ] Proper class structure
- [ ] No debug code
- [ ] Compiles successfully

**If all pass**: Continue to create the PR.

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

#### 7.1a: Get PR Number and Assign Reviewer

The command above returns a PR number (e.g., 12350). Check your `REVIEWER_ASSIGNMENTS.md` for "Phase 3 - PR5":

```bash
gh pr edit 12350 --add-reviewer "railken"
```

**Replace "railken" with whoever maintains the terminal in VS Code.**

#### 7.1b: Add Labels and Milestone

```bash
gh pr edit 12350 --add-label "accessibility,feature,terminal,find,screen-reader,phase-3-other"
gh pr edit 12350 --milestone "Accessibility Help System"
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

#### 7.2a: Assign Reviewer

Check `REVIEWER_ASSIGNMENTS.md` for "Phase 3 - PR6":

```bash
gh pr edit 12351 --add-reviewer "username-for-webview-owner"
```

#### 7.2b: Add Labels and Milestone

```bash
gh pr edit 12351 --add-label "accessibility,feature,webview,find,phase-3-other"
gh pr edit 12351 --milestone "Accessibility Help System"
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

#### 7.3a: Assign Reviewer

```bash
gh pr edit 12352 --add-reviewer "username-for-output-owner"
```

#### 7.3b: Add Labels and Milestone

```bash
gh pr edit 12352 --add-label "accessibility,feature,output,filter,phase-3-other"
gh pr edit 12352 --milestone "Accessibility Help System"
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

#### 7.4a: Assign Reviewer

```bash
gh pr edit 12353 --add-reviewer "username-for-problems-owner"
```

#### 7.4b: Add Labels and Milestone

```bash
gh pr edit 12353 --add-label "accessibility,feature,problems,filter,phase-3-other"
gh pr edit 12353 --milestone "Accessibility Help System"
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

#### 7.5a: Assign Reviewer

```bash
gh pr edit 12354 --add-reviewer "username-for-debug-owner"
```

#### 7.5b: Add Labels and Milestone

```bash
gh pr edit 12354 --add-label "accessibility,feature,debug,console,phase-3-other"
gh pr edit 12354 --milestone "Accessibility Help System"
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

#### 7.6a: Assign Reviewer

```bash
gh pr edit 12355 --add-reviewer "username-for-search-owner"
```

#### 7.6b: Add Labels and Milestone

```bash
gh pr edit 12355 --add-label "accessibility,feature,search,files,phase-3-other"
gh pr edit 12355 --milestone "Accessibility Help System"
```

---

### Step 7.7: Monitor and Merge Phase 3 PRs

**Learning note**: Phase 3 PRs can be reviewed and merged independently. You don't need to wait for all 6 to finish. As each one is approved, merge it.

List all Phase 3 PRs:

```bash
gh pr list --label "phase-3-other"
```

**Expected output**: Shows all 6 PRs with their current state

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

### What Phase 4 Does (Learning Context)

Phase 4 fixes **two critical bugs** in the find widget that were discovered during accessibility testing:

- **PR #11**: ARIA alerts announced incorrectly (even on empty search)
- **PR #12**: aria-label timing issue (screen readers miss the hint)

**Important security note**: These are bug fixes, not new features. They should go to the editor owner (same person as Phase 1-2). Bug fixes typically get fast-tracked in review.

### Step 8.1: Create PR for `bugfix/aria-alerts-find-dialog`

#### 8.1 Pre-PR File Verification

**Bug fixes must be surgical and minimal. Verify this change is exactly what's needed.**

Check files:

```bash
git checkout bugfix/aria-alerts-find-dialog
git diff main...bugfix/aria-alerts-find-dialog --name-only
```

**Expected output** (exactly 1 file):
```
src/vs/editor/contrib/find/browser/findWidget.ts
```

**If more than 1 file**: Stop. Bug fixes should touch only the file being fixed.

Verify the change is minimal (~4-6 lines total):

```bash
git diff main...bugfix/aria-alerts-find-dialog | wc -l
```

**Expected**: Around 10-15 lines total (with context).

Review the actual fix:

```bash
git diff main...bugfix/aria-alerts-find-dialog
```

**Expected to see**:
- ✅ ARIA alert wrapped in `if (this._state.searchString)` check
- ✅ Clear comment explaining the fix
- ✅ No other modifications to the method
- ✅ Surgical change addressing exactly the bug
- ❌ No refactoring
- ❌ No unrelated changes

Verify the logic makes sense:

```bash
git diff main...bugfix/aria-alerts-find-dialog | grep -A2 -B2 "searchString"
```

**Expected**: Shows the if statement wrapping the alert call.

Compile:

```bash
npm run compile
```

**Checklist**:
- [ ] Only 1 file: `findWidget.ts`
- [ ] Changes are ~4-6 lines (minimal)
- [ ] Fix directly addresses the bug
- [ ] No refactoring or cleanup
- [ ] No debug code
- [ ] Compiles successfully

**If all pass**: Continue to create the PR.

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

#### 8.1a: Assign to Editor Maintainer

Check your `REVIEWER_ASSIGNMENTS.md` for "Phase 4 - PR11":

```bash
gh pr edit 12356 --add-reviewer "jrieken"
```

**Learning note**: Bug fix PRs are critical. The editor maintainer needs to review this first.

#### 8.1b: Add Labels

```bash
gh pr edit 12356 --add-label "accessibility,bug,editor,find,screen-reader,critical,phase-4-bugfixes"
```

#### 8.1c: Add Milestone

```bash
gh pr edit 12356 --milestone "Accessibility Help System"
```

---

### Step 8.2: Create PR for `bugfix/notfound-message-empty-field`

#### 8.2 Pre-PR File Verification

**This is a slightly larger bug fix (~11 lines). Verify it's still surgical and addresses both timing and visibility issues.**

Check files:

```bash
git checkout bugfix/notfound-message-empty-field
git diff main...bugfix/notfound-message-empty-field --name-only
```

**Expected output**:
```
src/vs/editor/contrib/find/browser/findWidget.ts
```

**If more than 1 file**: Stop. This bug fix should only touch this one file.

Verify the change is focused (~11 lines):

```bash
git diff main...bugfix/notfound-message-empty-field | wc -l
```

**Expected**: Around 20-30 lines total (with context).

Review the fix (should show two distinct changes):

```bash
git diff main...bugfix/notfound-message-empty-field
```

**Expected to see**:
- ✅ aria-label update moved BEFORE visibility change
- ✅ Visibility check added before updating aria-label
- ✅ Clear comments explaining both fixes
- ✅ No other modifications
- ❌ No refactoring
- ❌ No unrelated changes

Verify the timing fix:

```bash
git diff main...bugfix/notfound-message-empty-field | grep -B3 "visibility"
```

**Expected**: Shows aria-label update before visibility change.

Check for visibility guard:

```bash
git diff main...bugfix/notfound-message-empty-field | grep -A2 "isVisible"
```

**Expected**: Shows the visibility check wrapping the update.

Compile:

```bash
npm run compile
```

**Checklist**:
- [ ] Only 1 file: `findWidget.ts`
- [ ] Changes are ~11 lines (focused fix)
- [ ] Includes aria-label timing fix
- [ ] Includes visibility check fix
- [ ] Has clear comments for both fixes
- [ ] No unrelated refactoring
- [ ] Compiles successfully

**If all pass**: Continue to create the PR.

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

#### 8.2a: Assign to Editor Maintainer

Check your `REVIEWER_ASSIGNMENTS.md` for "Phase 4 - PR12":

```bash
gh pr edit 12357 --add-reviewer "jrieken"
```

#### 8.2b: Add Labels

```bash
gh pr edit 12357 --add-label "accessibility,bug,editor,find,screen-reader,critical,phase-4-bugfixes"
```

#### 8.2c: Add Milestone

```bash
gh pr edit 12357 --milestone "Accessibility Help System"
```

---

### Step 8.3: Monitor and Merge Phase 4 PRs

**Learning note**: These bug fixes are critical. If the reviewer requests changes, prioritize them over other work.

List Phase 4 PRs:

```bash
gh pr list --label "phase-4-bugfixes"
```

Check each one:

```bash
gh pr view 12356
gh pr view 12357
```

When Phase 4 PR #1 is approved and checks pass:

```bash
gh pr merge 12356 --squash --delete-branch
```

Then update main:

```bash
git checkout main
git pull origin main
```

When Phase 4 PR #2 is approved:

```bash
gh pr merge 12357 --squash --delete-branch
```

---

## PART 9: FINAL VERIFICATION AND CLEANUP

### Step 9.1: Verify All PRs Merged

```bash
gh pr list --milestone "Accessibility Help System"
```

Should show no open PRs:

```
No pull requests match your search in microsoft/vscode
```

### Step 9.2: Check Final Commit History

```bash
git log main --oneline | head -20
```

**Expected output**: All 14 commits should be visible, something like:

```
a1b2c3d Fix: Proper aria-label timing and visibility check
b2c3d4e Fix: Only announce when search string present
c3d4e5f Add search accessibility help
d4e5f6g Add debug console accessibility help
...
```

### Step 9.3: Cleanup Local Branches

```bash
git branch -d feature/accessible-alert-configuration
git branch -d feature/keybinding-resolution-infrastructure
git branch -d feature/editor-find-accessibility-help
git branch -d feature/terminal-find-accessibility-help
git branch -d feature/webview-find-accessibility-help
git branch -d feature/output-filter-accessibility-help
git branch -d feature/problems-filter-accessibility-help
git branch -d feature/debug-console-accessibility-help
git branch -d feature/search-accessibility-help
git branch -d bugfix/aria-alerts-find-dialog
git branch -d bugfix/notfound-message-empty-field
```

**If you get branch not found errors**: That's OK. Means they're already deleted. The gh merge commands delete them automatically.

### Step 9.4: Final Check

```bash
git branch -av
```

**Expected**: Only shows:
- `main` (your current location)
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

### Using Automated Scripts (Recommended)

```powershell
# Complete workflow with cross-checks
cd c:\vscode\scripts\pr-automation

# Phase 1
.\Run-PRWorkflow.ps1 -Phase 1
# Wait for review and approval...
.\Merge-PRs.ps1 -Phase 1

# Phase 2
.\Run-PRWorkflow.ps1 -Phase 2
.\Merge-PRs.ps1 -Phase 2

# Phase 3 (parallel)
.\Run-PRWorkflow.ps1 -Phase 3
.\Merge-PRs.ps1 -Phase 3

# Phase 4
.\Run-PRWorkflow.ps1 -Phase 4
.\Merge-PRs.ps1 -Phase 4

# Final status check
.\Monitor-PRs.ps1
```

### Manual Checklist

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
- [ ] Phase 2 PR merged

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

