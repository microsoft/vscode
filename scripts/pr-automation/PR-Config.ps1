# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License. See License.txt in the project root for license information.

<#
.SYNOPSIS
    Configuration file for PR automation scripts.

.DESCRIPTION
    Defines all PR branches, expected files, reviewers, labels, and milestones
    for the Accessibility Help System feature.

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
        @{ Name = "phase-1-foundation"; Color = "ededed"; Description = "Phase 1: Foundation work" }
        @{ Name = "phase-2-editor"; Color = "ededed"; Description = "Phase 2: Editor implementation" }
        @{ Name = "phase-3-other"; Color = "ededed"; Description = "Phase 3: Other implementations" }
        @{ Name = "phase-4-bugfixes"; Color = "ededed"; Description = "Phase 4: Bug fixes" }
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

    # All PRs in order
    PRs = @(
        # Phase 1: Foundation
        @{
            Phase = 1
            Branch = "feature/accessible-alert-configuration"
            Title = "[Accessibility] Accessible Alert Configuration and Foundation Strings"
            ExpectedFiles = @("src/vs/editor/common/standaloneStrings.ts")
            ExpectedFileCount = 1
            Labels = @("accessibility", "feature", "editor", "phase-1-foundation")
            Reviewers = @("isidorn")  # Update with actual reviewers
            DescriptionFile = "pr-descriptions\pr1-alert-config.md"
            EstimatedLines = @{ Min = 5; Max = 20 }
        }
        @{
            Phase = 1
            Branch = "feature/keybinding-resolution-infrastructure"
            Title = "[Accessibility] Infrastructure: Context-Aware Keybinding Resolution"
            ExpectedFiles = @("src/vs/workbench/contrib/accessibility/browser/editorAccessibilityHelp.ts")
            ExpectedFileCount = 1
            Labels = @("accessibility", "infrastructure", "keybindings", "phase-1-foundation")
            Reviewers = @("jrieken")  # Update with actual reviewers
            DescriptionFile = "pr-descriptions\pr2-keybinding-infra.md"
            EstimatedLines = @{ Min = 20; Max = 50 }
            DependsOn = @("feature/accessible-alert-configuration")
        }

        # Phase 2: Editor Find/Replace
        @{
            Phase = 2
            Branch = "feature/editor-find-accessibility-help"
            Title = "[Accessibility] Editor Find and Replace Dialog Help (Alt+F1)"
            ExpectedFiles = @("src/vs/workbench/contrib/codeEditor/browser/editorFindAccessibilityHelp.ts")
            ExpectedFileCount = 1
            IsNewFile = $true
            Labels = @("accessibility", "feature", "editor", "find", "replace", "screen-reader", "phase-2-editor")
            Reviewers = @("isidorn", "jrieken")  # Update with actual reviewers
            DescriptionFile = "pr-descriptions\pr3-editor-find.md"
            EstimatedLines = @{ Min = 310; Max = 400 }
            DependsOn = @("feature/keybinding-resolution-infrastructure")
        }

        # Phase 3: Other Implementations (can be parallel)
        @{
            Phase = 3
            Branch = "feature/terminal-find-accessibility-help"
            Title = "[Accessibility] Terminal Find Accessibility Help"
            ExpectedFiles = @("src/vs/workbench/contrib/terminalContrib/find/browser/terminalFindAccessibilityHelp.ts")
            ExpectedFileCount = 1
            IsNewFile = $true
            Labels = @("accessibility", "feature", "terminal", "find", "screen-reader", "phase-3-other")
            Reviewers = @()  # Update with terminal maintainer
            DescriptionFile = "pr-descriptions\pr5-terminal-find.md"
            EstimatedLines = @{ Min = 80; Max = 180 }
        }
        @{
            Phase = 3
            Branch = "feature/webview-find-accessibility-help"
            Title = "[Accessibility] Webview Find Accessibility Help"
            ExpectedFiles = @("src/vs/workbench/contrib/webview/browser/webviewFindAccessibilityHelp.ts")
            ExpectedFileCount = 1
            IsNewFile = $true
            Labels = @("accessibility", "feature", "webview", "find", "phase-3-other")
            Reviewers = @()  # Update with webview maintainer
            DescriptionFile = "pr-descriptions\pr6-webview-find.md"
            EstimatedLines = @{ Min = 80; Max = 180 }
        }
        @{
            Phase = 3
            Branch = "feature/output-filter-accessibility-help"
            Title = "[Accessibility] Output Panel Filter Accessibility Help"
            ExpectedFiles = @("src/vs/workbench/contrib/output/browser/outputAccessibilityHelp.ts")
            ExpectedFileCount = 1
            IsNewFile = $true
            Labels = @("accessibility", "feature", "output", "filter", "phase-3-other")
            Reviewers = @()  # Update with output panel owner
            DescriptionFile = "pr-descriptions\pr7-output-filter.md"
            EstimatedLines = @{ Min = 80; Max = 180 }
        }
        @{
            Phase = 3
            Branch = "feature/problems-filter-accessibility-help"
            Title = "[Accessibility] Problems Panel Filter Accessibility Help"
            ExpectedFiles = @("src/vs/workbench/contrib/markers/browser/markersAccessibilityHelp.ts")
            ExpectedFileCount = 1
            IsNewFile = $true
            Labels = @("accessibility", "feature", "problems", "filter", "phase-3-other")
            Reviewers = @()  # Update with problems panel owner
            DescriptionFile = "pr-descriptions\pr8-problems-filter.md"
            EstimatedLines = @{ Min = 80; Max = 180 }
        }
        @{
            Phase = 3
            Branch = "feature/debug-console-accessibility-help"
            Title = "[Accessibility] Debug Console Accessibility Help"
            ExpectedFiles = @("src/vs/workbench/contrib/debug/browser/replAccessibilityHelp.ts")
            ExpectedFileCount = 1
            IsNewFile = $true
            Labels = @("accessibility", "feature", "debug", "console", "phase-3-other")
            Reviewers = @()  # Update with debug maintainer
            DescriptionFile = "pr-descriptions\pr9-debug-console.md"
            EstimatedLines = @{ Min = 80; Max = 180 }
        }
        @{
            Phase = 3
            Branch = "feature/search-accessibility-help"
            Title = "[Accessibility] Search Across Files Accessibility Help"
            ExpectedFiles = @("src/vs/workbench/contrib/search/browser/searchAccessibilityHelp.ts")
            ExpectedFileCount = 1
            IsNewFile = $true
            Labels = @("accessibility", "feature", "search", "files", "phase-3-other")
            Reviewers = @()  # Update with search owner
            DescriptionFile = "pr-descriptions\pr10-search.md"
            EstimatedLines = @{ Min = 80; Max = 180 }
        }

        # Phase 4: Bug Fixes
        @{
            Phase = 4
            Branch = "bugfix/aria-alerts-find-dialog"
            Title = "[Accessibility] Bug: Only Announce Search Results When Search String Is Present"
            ExpectedFiles = @("src/vs/editor/contrib/find/browser/findWidget.ts")
            ExpectedFileCount = 1
            IsNewFile = $false
            IsBugFix = $true
            Labels = @("accessibility", "bug", "editor", "find", "screen-reader", "critical", "phase-4-bugfixes")
            Reviewers = @("jrieken")  # Update with editor maintainer
            DescriptionFile = "pr-descriptions\pr11-aria-alerts.md"
            EstimatedLines = @{ Min = 3; Max = 10 }
        }
        @{
            Phase = 4
            Branch = "bugfix/notfound-message-empty-field"
            Title = "[Accessibility] Bug: Proper aria-label Timing and Visibility Check"
            ExpectedFiles = @("src/vs/editor/contrib/find/browser/findWidget.ts")
            ExpectedFileCount = 1
            IsNewFile = $false
            IsBugFix = $true
            Labels = @("accessibility", "bug", "editor", "find", "screen-reader", "critical", "phase-4-bugfixes")
            Reviewers = @("jrieken")  # Update with editor maintainer
            DescriptionFile = "pr-descriptions\pr12-notfound-timing.md"
            EstimatedLines = @{ Min = 8; Max = 20 }
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

# Export functions
Export-ModuleMember -Function Get-PRByBranch, Get-PRsByPhase, Get-AllBranches, Get-PRConfig -Variable PRConfig
