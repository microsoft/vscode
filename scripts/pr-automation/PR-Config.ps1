# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License. See License.txt in the project root for license information.

<#
.SYNOPSIS
    Configuration file for PR automation scripts.

.DESCRIPTION
    Defines all PR branches, expected files, reviewers, labels, and milestones
    for the Accessibility Help System feature.

    CONSOLIDATED 3-PR STRATEGY (Principal Engineer Approved)
    =========================================================
    This configuration implements a logical, coherent PR structure optimized
    for Microsoft review. Rather than 11+ fragmented PRs, we consolidate into
    3 well-organized PRs that tell a complete story:

    PR 1: Foundation & Infrastructure
          - Core wiring that enables accessibility help across VS Code
          - Contribution registrations, configuration, PRD documentation

    PR 2: Accessibility Help Content
          - All 7 new AccessibilityHelp provider files
          - Self-contained, testable accessibility content

    PR 3: ARIA Hints & Bug Fixes
          - Widget-level ARIA improvements
          - Bug fixes for find dialog screen reader behavior

    This approach:
    - Groups related changes for easier review
    - Maintains clear dependency ordering
    - Allows reviewers to understand architectural intent
    - Reduces context-switching overhead for maintainers

    Update this file to customize for different feature work.
#>

# ============================================================================
# BRANCH CONFIGURATION
# ============================================================================

$script:PRConfig = @{
    Milestone = "Accessibility Help System"
    MetaIssueTitle = "[Meta] Accessibility Help for Find and Filter Experiences - PR Tracking"

    # Label definitions
    Labels = @(
        @{ Name = "accessibility"; Color = "0e7c1f"; Description = "Accessibility features and bug fixes" }
        @{ Name = "screen-reader"; Color = "0e7c1f"; Description = "Screen reader compatibility and testing" }
        @{ Name = "infrastructure"; Color = "7057ff"; Description = "Internal architecture and infrastructure changes" }
        @{ Name = "keybindings"; Color = "1d1959"; Description = "Keyboard shortcuts and keybinding changes" }
        @{ Name = "pr-1-foundation"; Color = "c5def5"; Description = "PR 1: Foundation and Infrastructure" }
        @{ Name = "pr-2-content"; Color = "bfdadc"; Description = "PR 2: Accessibility Help Content" }
        @{ Name = "pr-3-polish"; Color = "d4c5f9"; Description = "PR 3: ARIA Hints and Bug Fixes" }
    )

    # ------------------------------------------------------------------------
    # Merge checklist
    # ------------------------------------------------------------------------
    # High-level checklist items that maintainers should confirm before merging.
    MergeChecklist = @(
        "Confirm contributor license agreement (CLA) check passed for contributor",
        "Confirm required reviewers have approved",
        "Confirm CI checks are green",
        "Confirm no merge conflicts with main"
    )

    # ========================================================================
    # CONSOLIDATED 3-PR STRUCTURE
    # ========================================================================
    # All PRs in dependency order (PR 2 depends on PR 1, PR 3 depends on PR 2)
    PRs = @(
        # --------------------------------------------------------------------
        # PR 1: FOUNDATION & INFRASTRUCTURE
        # --------------------------------------------------------------------
        # This PR establishes the core wiring that enables accessibility help
        # across all VS Code components. It includes:
        # - Core infrastructure files (findController, accessibleView, config)
        # - All contribution.ts registrations that wire up the system
        # - PRD documentation explaining the feature design
        # - Foundation strings and keybinding infrastructure
        # --------------------------------------------------------------------
        @{
            Phase = 1
            Branch = "feature/accessibility-help-foundation"
            Title = "[Accessibility] Foundation: Infrastructure and Wiring for Accessibility Help System"
            Description = @"
This PR establishes the foundational infrastructure for the Accessibility Help System
across VS Code's find and filter experiences.

## What's Included

### Core Infrastructure
- **findController.ts**: Added accessibility help trigger integration
- **accessibleView.ts**: Extended for find/filter context support
- **accessibilityConfiguration.ts**: New configuration options for accessibility alerts

### Contribution Registrations
Wires the accessibility help system into VS Code's component architecture:
- codeEditor.contribution.ts - Editor find/replace
- terminal.find.contribution.ts - Terminal find
- webview.contribution.ts - Webview find
- output.contribution.ts - Output panel filter
- markers.contribution.ts - Problems panel filter
- search.contribution.ts - Search across files

### Supporting Files
- **standaloneStrings.ts**: Localized accessibility strings
- **editorAccessibilityHelp.ts**: Context-aware keybinding resolution infrastructure
- **FIND_ACCESSIBILITY_HELP_PRD.md**: Product requirements document

## Testing
- Run existing accessibility test suites
- Verify Alt+F1 triggers help in find dialogs
- Test with NVDA/JAWS screen readers

## Related PRs
- PR 2: Accessibility Help Content (depends on this)
- PR 3: ARIA Hints and Bug Fixes (depends on PR 2)
"@
            ExpectedFiles = @(
                "FIND_ACCESSIBILITY_HELP_PRD.md",
                "src/vs/editor/common/standaloneStrings.ts",
                "src/vs/editor/contrib/find/browser/findController.ts",
                "src/vs/platform/accessibility/browser/accessibleView.ts",
                "src/vs/workbench/contrib/accessibility/browser/accessibilityConfiguration.ts",
                "src/vs/workbench/contrib/accessibility/browser/editorAccessibilityHelp.ts",
                "src/vs/workbench/contrib/codeEditor/browser/codeEditor.contribution.ts",
                "src/vs/workbench/contrib/markers/browser/markers.contribution.ts",
                "src/vs/workbench/contrib/output/browser/output.contribution.ts",
                "src/vs/workbench/contrib/search/browser/search.contribution.ts",
                "src/vs/workbench/contrib/terminalContrib/find/browser/terminal.find.contribution.ts",
                "src/vs/workbench/contrib/webview/browser/webview.contribution.ts"
            )
            ExpectedFileCount = 12
            IsNewFile = $false
            Labels = @("accessibility", "infrastructure", "keybindings", "pr-1-foundation")
            Reviewers = @("isidorn", "jrieken")
            DescriptionFile = "pr-descriptions\pr1-foundation.md"
            EstimatedLines = @{ Min = 200; Max = 500 }
        }

        # --------------------------------------------------------------------
        # PR 2: ACCESSIBILITY HELP CONTENT
        # --------------------------------------------------------------------
        # This PR adds all 7 new AccessibilityHelp provider files. Each file
        # provides comprehensive accessibility help content for a specific
        # VS Code component's find/filter experience.
        #
        # These are new files that implement the IAccessibleViewContent
        # interface to provide rich help dialogs when users press Alt+F1.
        # --------------------------------------------------------------------
        @{
            Phase = 2
            Branch = "feature/accessibility-help-content"
            Title = "[Accessibility] Content: Accessibility Help Providers for Find and Filter Experiences"
            Description = @"
This PR adds comprehensive accessibility help content for all find and filter
experiences in VS Code. Each new file provides a rich help dialog accessible
via Alt+F1 (or platform equivalent).

## New Files (7 AccessibilityHelp Providers)

### Editor
- **editorFindAccessibilityHelp.ts**: Help for editor find/replace dialog
  - Keyboard shortcuts for find, replace, navigation
  - Regex, case-sensitive, whole word options
  - Selection and multi-cursor search

### Terminal
- **terminalFindAccessibilityHelp.ts**: Help for terminal find
  - Terminal-specific search behavior
  - Buffer navigation and selection

### Webview
- **webviewFindAccessibilityHelp.ts**: Help for webview find
  - Extension webview search capabilities
  - Markdown preview find

### Output Panel
- **outputAccessibilityHelp.ts**: Help for output filter
  - Filter syntax and channel selection
  - Log level filtering

### Problems Panel
- **markersAccessibilityHelp.ts**: Help for problems filter
  - Filter by type, source, severity
  - Quick fix navigation

### Debug Console
- **replAccessibilityHelp.ts**: Help for debug console filter
  - Expression evaluation filtering
  - Variable inspection

### Search
- **searchAccessibilityHelp.ts**: Help for search across files
  - Include/exclude patterns
  - Results navigation

## Testing
- Open each component and press Alt+F1
- Verify help content is accurate and complete
- Test with screen readers for proper announcements

## Dependencies
- Requires PR 1 (Foundation) to be merged first
"@
            ExpectedFiles = @(
                "src/vs/workbench/contrib/codeEditor/browser/editorFindAccessibilityHelp.ts",
                "src/vs/workbench/contrib/terminalContrib/find/browser/terminalFindAccessibilityHelp.ts",
                "src/vs/workbench/contrib/webview/browser/webviewFindAccessibilityHelp.ts",
                "src/vs/workbench/contrib/output/browser/outputAccessibilityHelp.ts",
                "src/vs/workbench/contrib/markers/browser/markersAccessibilityHelp.ts",
                "src/vs/workbench/contrib/debug/browser/replAccessibilityHelp.ts",
                "src/vs/workbench/contrib/search/browser/searchAccessibilityHelp.ts"
            )
            ExpectedFileCount = 7
            IsNewFile = $true
            Labels = @("accessibility", "feature", "screen-reader", "pr-2-content")
            Reviewers = @("isidorn")
            DescriptionFile = "pr-descriptions\pr2-content.md"
            EstimatedLines = @{ Min = 800; Max = 1500 }
            DependsOn = @("feature/accessibility-help-foundation")
        }

        # --------------------------------------------------------------------
        # PR 3: ARIA HINTS & BUG FIXES
        # --------------------------------------------------------------------
        # This PR improves the UX polish of find widgets with:
        # - ARIA hint attributes for better screen reader feedback
        # - Bug fixes for spurious announcements
        # - Proper timing/visibility checks for aria-label updates
        #
        # These changes touch existing widget files to add aria-description
        # attributes that announce keyboard shortcut hints.
        # --------------------------------------------------------------------
        @{
            Phase = 3
            Branch = "feature/accessibility-aria-polish"
            Title = "[Accessibility] Polish: ARIA Hints and Bug Fixes for Find Widgets"
            Description = @"
This PR completes the accessibility help system with UX polish:
ARIA hint improvements and bug fixes for find widget behavior.

## ARIA Hint Improvements
Added aria-description attributes to announce "Press Alt+F1 for accessibility help"
on focus for these find input widgets:

### Core Widgets
- **simpleFindWidget.ts**: Base widget ARIA improvements
- **browserFindWidget.ts**: Editor find widget hints

### Component-Specific Widgets
- **searchWidget.ts**: Search across files widget
- **terminalFindWidget.ts**: Terminal find widget
- **webviewFindWidget.ts**: Webview find widget

### Tree Filter
- **viewFilter.ts**: Tree view filter input (Problems, Output, etc.)

## Bug Fixes

### findWidget.ts
Two critical screen reader fixes:

1. **Only Announce Results When Search String Present**
   - Previously: Announced "No results" even with empty search field
   - Now: Only announces search results when user has entered search text

2. **Proper aria-label Timing**
   - Previously: Updated aria-label when widget was hidden
   - Now: Checks visibility before updating to prevent stale announcements

## Testing
- Tab through find widgets and verify hint announcements
- Empty search field should not trigger "no results" announcement
- Close find dialog and verify no spurious announcements

## Dependencies
- Requires PR 2 (Content) to be merged first
"@
            ExpectedFiles = @(
                "src/vs/editor/contrib/find/browser/findWidget.ts",
                "src/vs/workbench/browser/parts/views/viewFilter.ts",
                "src/vs/workbench/contrib/codeEditor/browser/find/simpleFindWidget.ts",
                "src/vs/workbench/contrib/search/browser/searchWidget.ts",
                "src/vs/workbench/contrib/terminalContrib/find/browser/terminalFindWidget.ts",
                "src/vs/workbench/contrib/webview/browser/webviewFindWidget.ts"
            )
            ExpectedFileCount = 6
            IsNewFile = $false
            IsBugFix = $true
            Labels = @("accessibility", "bug", "screen-reader", "pr-3-polish")
            Reviewers = @("isidorn", "jrieken")
            DescriptionFile = "pr-descriptions\pr3-polish.md"
            EstimatedLines = @{ Min = 50; Max = 150 }
            DependsOn = @("feature/accessibility-help-content")
        }
    )
}

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

function Get-PRByBranch {
    param([string]$BranchName)
    return $script:PRConfig.PRs | Where-Object { $_.Branch -eq $BranchName }
}

function Get-PRsByPhase {
    param([int]$Phase)
    return $script:PRConfig.PRs | Where-Object { $_.Phase -eq $Phase }
}

function Get-AllBranches {
    return $script:PRConfig.PRs | ForEach-Object { $_.Branch }
}

function Get-PRConfig {
    return $script:PRConfig
}

function Get-TotalFileCount {
    $total = 0
    foreach ($pr in $script:PRConfig.PRs) {
        $total += $pr.ExpectedFileCount
    }
    return $total
}

function Get-AllExpectedFiles {
    $files = @()
    foreach ($pr in $script:PRConfig.PRs) {
        $files += $pr.ExpectedFiles
    }
    return $files | Sort-Object -Unique
}

# Export functions
Export-ModuleMember -Function Get-PRByBranch, Get-PRsByPhase, Get-AllBranches, Get-PRConfig, Get-TotalFileCount, Get-AllExpectedFiles -Variable PRConfig
