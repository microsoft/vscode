# PR Automation Scripts

PowerShell scripts to automate the PR submission, monitoring, and merging process for VS Code contributions.

## Consolidated 3-PR Strategy

This automation supports a **consolidated 3-PR approach** optimized for Microsoft review:

| PR | Phase | Branch | Description | Files |
|----|-------|--------|-------------|-------|
| 1 | Foundation | `feature/accessibility-help-foundation` | Infrastructure & wiring | 12 |
| 2 | Content | `feature/accessibility-help-content` | Accessibility help providers | 7 |
| 3 | Polish | `feature/accessibility-aria-polish` | ARIA hints & bug fixes | 6 |

### Why 3 PRs?
- **Logical grouping** - Related changes reviewed together
- **Clear dependencies** - PR 2 depends on PR 1, PR 3 depends on PR 2
- **Easier review** - Each PR tells a complete story
- **Reduced context-switching** - Reviewers understand architectural intent

## Quick Start

```powershell
cd c:\vscode\scripts\pr-automation

# 1. Check prerequisites
.\Check-Prerequisites.ps1 -Fix

# 2. Run complete workflow for PR 1
.\Run-PRWorkflow.ps1 -Phase 1
```

## Scripts

### `Check-Prerequisites.ps1`
Validates all requirements before PR work:
- Git and GitHub CLI installation
- GitHub authentication status
- Repository state (clean working tree, up-to-date main)
- Required branches existence (all 3 consolidated branches)
- Build system readiness

```powershell
.\Check-Prerequisites.ps1          # Check only
.\Check-Prerequisites.ps1 -Fix     # Check and attempt to fix issues
.\Check-Prerequisites.ps1 -Verbose # Show all branch details
```

### `Verify-Branches.ps1`
Cross-checks branch content against expectations:
- Correct files modified/created
- No unintended file changes
- No debug code (console.log, debugger, TODO)
- No `any` types in TypeScript
- Microsoft copyright headers
- Localization compliance
- Commit message quality

```powershell
.\Verify-Branches.ps1                              # All 3 branches
.\Verify-Branches.ps1 -Phase 1                     # PR 1 (Foundation) only
.\Verify-Branches.ps1 -Branch "feature/xyz"        # Specific branch
.\Verify-Branches.ps1 -SkipCompile                 # Skip TypeScript compilation
.\Verify-Branches.ps1 -StopOnError                 # Stop at first failure
```

### `Create-PRs.ps1`
Creates pull requests with full metadata:
- Generates PR title and description
- Adds labels and reviewers
- Sets milestone
- Tracks PR numbers in `PR-Tracking.json`

```powershell
.\Create-PRs.ps1 -Phase 1                          # Create PR 1 (Foundation)
.\Create-PRs.ps1 -Phase 2                          # Create PR 2 (Content)
.\Create-PRs.ps1 -Phase 3                          # Create PR 3 (Polish)
.\Create-PRs.ps1 -Branch "feature/xyz"             # Create specific PR
.\Create-PRs.ps1 -All                              # Create all 3 PRs
.\Create-PRs.ps1 -Phase 1 -DryRun                  # Preview without creating
.\Create-PRs.ps1 -Phase 1 -SkipVerification        # Skip pre-creation checks
.\Create-PRs.ps1 -Phase 1 -Force                   # Create even if PR exists
```

### `Monitor-PRs.ps1`
Live dashboard showing PR status:
- PR state (open/merged/closed)
- Review status (approved/changes requested/pending)
- CI check status
- Merge conflict detection
- Age tracking

```powershell
.\Monitor-PRs.ps1                                  # Show all tracked PRs
.\Monitor-PRs.ps1 -Phase 1                         # PR 1 (Foundation) only
.\Monitor-PRs.ps1 -Branch "feature/xyz"            # Detailed view
.\Monitor-PRs.ps1 -Watch                           # Auto-refresh every 60s
.\Monitor-PRs.ps1 -Watch -WatchInterval 30         # Custom refresh interval
```

### `Merge-PRs.ps1`
Safely merges approved PRs:
- Checks review status
- Validates CI checks
- Detects merge conflicts
- Updates tracking file
- Pulls latest main after merge

```powershell
.\Merge-PRs.ps1 -PRNumber 12345                    # Merge specific PR
.\Merge-PRs.ps1 -Phase 1                           # Merge PR 1 when approved
.\Merge-PRs.ps1 -AutoMerge                         # Merge all ready PRs
.\Merge-PRs.ps1 -AutoMerge -DryRun                 # Preview merges
.\Merge-PRs.ps1 -PRNumber 12345 -Force             # Merge despite warnings
```

Note about CLA confirmation:
- The `Merge-PRs.ps1` script requires explicit interactive confirmation before merging
- You will be prompted to verify the contributor has signed the CLA
- Use `-Force` to bypass (for automation/emergency), `-DryRun` to preview

### `Run-PRWorkflow.ps1`
Orchestrates the complete workflow:
1. Prerequisites check
2. Branch verification
3. PR creation
4. Status display

```powershell
.\Run-PRWorkflow.ps1 -Phase 1                      # Full workflow for PR 1
.\Run-PRWorkflow.ps1 -Phase 2                      # Full workflow for PR 2
.\Run-PRWorkflow.ps1 -Phase 3                      # Full workflow for PR 3
.\Run-PRWorkflow.ps1 -Phase 1 -DryRun              # Preview mode
.\Run-PRWorkflow.ps1 -Status                       # Show dashboard only
.\Run-PRWorkflow.ps1 -CheckOnly                    # Prerequisites only
.\Run-PRWorkflow.ps1 -VerifyOnly                   # Verification only
.\Run-PRWorkflow.ps1 -Help                         # Show usage help
```

## Configuration

Edit `PR-Config.ps1` to customize:

```powershell
$script:PRConfig = @{
    Milestone = "Accessibility Help System"

    PRs = @(
        @{
            Phase = 1
            Branch = "feature/accessibility-help-foundation"
            Title = "[Accessibility] Foundation: Infrastructure and Wiring"
            ExpectedFiles = @(...)
            Labels = @("accessibility", "infrastructure", "pr-1-foundation")
            Reviewers = @("isidorn", "jrieken")
        }
        # PR 2 and PR 3...
    )
}
```

### Updating Reviewers

Before creating PRs, update the `Reviewers` array for each PR in `PR-Config.ps1`:

```powershell
Reviewers = @("username1", "username2")
```

## Tracking

The scripts maintain `PR-Tracking.json` to track:
- Created PR numbers
- Creation timestamps
- Merge status
- Branch-to-PR mapping

This file is automatically updated and can be used to resume work or check status.

## Complete Workflow

### PR 1: Foundation & Infrastructure

```powershell
# 1. Verify prerequisites
.\Check-Prerequisites.ps1 -Fix

# 2. Verify PR 1 branch
.\Verify-Branches.ps1 -Phase 1

# 3. Create PR 1
.\Create-PRs.ps1 -Phase 1

# 4. Monitor until approved
.\Monitor-PRs.ps1 -Phase 1 -Watch

# 5. Merge when ready
.\Merge-PRs.ps1 -Phase 1
```

### PR 2: Accessibility Help Content

```powershell
# After PR 1 merges, proceed to PR 2
.\Run-PRWorkflow.ps1 -Phase 2
.\Merge-PRs.ps1 -Phase 2
```

### PR 3: ARIA Hints & Bug Fixes

```powershell
# After PR 2 merges, proceed to PR 3
.\Run-PRWorkflow.ps1 -Phase 3
.\Merge-PRs.ps1 -Phase 3
```

## Troubleshooting

### "gh: command not found"
```powershell
winget install GitHub.cli
# Then restart terminal
```

### "Not authenticated"
```powershell
gh auth login
```

### "Branch not found"
Ensure branches are created and pushed:
```powershell
git branch -a | Select-String "accessibility"
```

### "PR already exists"
Use `-Force` to update tracking:
```powershell
.\Create-PRs.ps1 -Phase 1 -Force
```

### "Merge conflicts"
Rebase the branch:
```powershell
git checkout feature/accessibility-help-foundation
git rebase main
git push origin feature/accessibility-help-foundation --force
```

## Requirements

- PowerShell 5.1 or higher (Core 7+ recommended)
- Git 2.x
- GitHub CLI (gh) 2.x
- GitHub authentication configured
- VS Code repository cloned
