# PR Automation Scripts

PowerShell scripts to automate the PR submission, monitoring, and merging process for VS Code contributions.

## Quick Start

```powershell
cd c:\vscode\scripts\pr-automation

# 1. Check prerequisites
.\Check-Prerequisites.ps1 -Fix

# 2. Run complete workflow for a phase
.\Run-PRWorkflow.ps1 -Phase 1
```

## Scripts

### `Check-Prerequisites.ps1`
Validates all requirements before PR work:
- Git and GitHub CLI installation
- GitHub authentication status
- Repository state (clean working tree, up-to-date main)
- Required branches existence
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
.\Verify-Branches.ps1                              # All branches
.\Verify-Branches.ps1 -Phase 1                     # Phase 1 only
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
.\Create-PRs.ps1 -Phase 1                          # Create Phase 1 PRs
.\Create-PRs.ps1 -Branch "feature/xyz"             # Create specific PR
.\Create-PRs.ps1 -All                              # Create all PRs
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
.\Monitor-PRs.ps1 -Phase 1                         # Phase 1 PRs only
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
.\Merge-PRs.ps1 -Phase 1                           # Merge ready Phase 1 PRs
.\Merge-PRs.ps1 -AutoMerge                         # Merge all ready PRs
.\Merge-PRs.ps1 -AutoMerge -DryRun                 # Preview merges
.\Merge-PRs.ps1 -PRNumber 12345 -Force             # Merge despite warnings

Note about CLA confirmation:

- The `Merge-PRs.ps1` script requires an explicit interactive confirmation before performing a merge. When running the script (without `-Force`), you will be prompted to type `yes` to confirm that you have verified the contributor has signed the CLA for the PR.
- If you need to bypass the interactive prompt (for automation or an emergency), pass the `-Force` flag. Use `-DryRun` to preview merge actions without changing state.
```

### `Run-PRWorkflow.ps1`
Orchestrates the complete workflow:
1. Prerequisites check
2. Branch verification
3. PR creation
4. Status display

```powershell
.\Run-PRWorkflow.ps1 -Phase 1                      # Full workflow for Phase 1
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
            Branch = "feature/accessible-alert-configuration"
            Title = "[Accessibility] Accessible Alert Configuration"
            ExpectedFiles = @("src/vs/editor/common/standaloneStrings.ts")
            Labels = @("accessibility", "feature", "editor")
            Reviewers = @("isidorn")  # <-- Update with actual reviewers!
        }
        # ... more PRs
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

## Typical Workflow

### Phase 1: Foundation

```powershell
# 1. Verify prerequisites
.\Check-Prerequisites.ps1 -Fix

# 2. Verify Phase 1 branches
.\Verify-Branches.ps1 -Phase 1

# 3. Create Phase 1 PRs
.\Create-PRs.ps1 -Phase 1

# 4. Monitor until approved
.\Monitor-PRs.ps1 -Phase 1 -Watch

# 5. Merge when ready
.\Merge-PRs.ps1 -Phase 1
```

### Subsequent Phases

```powershell
# After Phase 1 merges, proceed to Phase 2
.\Run-PRWorkflow.ps1 -Phase 2
.\Merge-PRs.ps1 -Phase 2

# Phase 3 PRs can be parallel
.\Run-PRWorkflow.ps1 -Phase 3
.\Merge-PRs.ps1 -Phase 3

# Phase 4: Bug fixes
.\Run-PRWorkflow.ps1 -Phase 4
.\Merge-PRs.ps1 -Phase 4
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
git branch -a | Select-String "feature/"
```

### "PR already exists"
Use `-Force` to update tracking:
```powershell
.\Create-PRs.ps1 -Phase 1 -Force
```

### "Merge conflicts"
Rebase the branch:
```powershell
git checkout feature/branch-name
git rebase main
git push origin feature/branch-name --force
```

## Requirements

- PowerShell 5.1 or higher (Core 7+ recommended)
- Git 2.x
- GitHub CLI (gh) 2.x
- GitHub authentication configured
- VS Code repository cloned
