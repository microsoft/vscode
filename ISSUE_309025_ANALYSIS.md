# Issue #309025 Analysis: Stage / Unstage changes

## Repository Setup
- **Fork:** https://github.com/DecawDevonn/vscode
- **Branch:** fix/309025-stage-unstage
- **Upstream:** https://github.com/microsoft/vscode

## Code Location

### Stage Commands
Located in: `extensions/git/src/commands.ts`

| Command | Line | Description |
|---------|------|-------------|
| `git.stage` | 1514 | Stage selected resources |
| `git.stageAll` | 1575 | Stage all working tree + untracked |
| `git.stageAllTracked` | 1622 | Stage all tracked files |
| `git.stageAllUntracked` | 1631 | Stage all untracked files |
| `git.stageAllMerge` | 1640 | Stage all merge conflicts |
| `git.stageChange` | 1677 | Stage specific line changes |
| `git.stageSelectedRanges` | 1769 | Stage selected ranges |

### Unstage Commands
Located in: `extensions/git/src/commands.ts`

| Command | Line | Description |
|---------|------|-------------|
| `git.unstage` | 2025 | Unstage selected resources |
| `git.unstageAll` | 2050 | Unstage all staged changes |
| `git.unstageSelectedRanges` | 2055 | Unstage selected ranges |
| `git.unstageFile` | 2116 | Unstage specific file |
| `git.unstageChange` | 2140 | Unstage specific line changes |

## Key Implementation Details

### Stage Command Flow
1. Filter and validate resource states
2. Handle merge conflicts (show warning dialog)
3. Handle deletion conflicts separately
4. Categorize resources by type (working tree, untracked, resolved, unresolved)
5. Call `repository.add(resources)` to stage

### Unstage Command Flow
1. Similar resource validation
2. Call `repository.revert(resources)` to unstage

## Potential Issue Areas

Based on the issue title "Stage / Unstage changes", potential problems could be:

1. **UI State Sync** - UI not updating after stage/unstage operation
2. **Command Availability** - Commands not appearing in context menus
3. **Keyboard Shortcuts** - Missing or conflicting keybindings
4. **Performance** - Slow updates on large repositories
5. **Error Handling** - Poor error messages when operations fail

## Next Steps

1. Read the full issue description at: https://github.com/microsoft/vscode/issues/309025
2. Identify the specific problem from the issue
3. Look at related recent commits or PRs
4. Implement minimal fix
5. Test locally
6. Submit PR

## Files to Examine

- `extensions/git/src/commands.ts` - Command implementations
- `extensions/git/src/repository.ts` - Repository operations
- `src/vs/workbench/contrib/scm/browser/scmViewPane.ts` - SCM UI
- `extensions/git/package.json` - Command registrations and menus
