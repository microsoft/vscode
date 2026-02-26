# AI Customizations Test Plan

The following test plan outlines the scenarios and specifications for the AI Customizations feature, which includes a management editor and tree view for managing customization items.

## SPECS

- [`../AI_CUSTOMIZATIONS.md`](../AI_CUSTOMIZATIONS.md)

## SCENARIOS

### Scenario 1: Empty state — no session, no customizations

#### Preconditions

- On 'New Session' screen
- No folder selected
- No user customizations created (from this tool or others i.e. Copilot CLI)

#### Actions

1. Open the sidebar customizations section
2. Observe no sidebar counts are shown for any section (Agents, Skills, Instructions, Prompts, Hooks)
3. Open the management editor by clicking on one of the sections (e.g., "Instructions")
4. Observe the empty state message and
4. Click through each section in the sidebar

#### Expected Results

- All sidebar counts show 0 (no badges visible)
- Management editor shows empty state for each section with "No X yet" message and create 
- "Add" button is disabled or hidden (no active workspace to create in)
- User storage group is empty (no `~/.copilot/` or `~/.claude/` files)
- Extension storage group may show built-in extension items if Copilot extension contributes any

#### Notes

- This tests the baseline empty state before any session or workspace is active
- The `isSessionsWindow` flag should be `true`, verified via Developer: Customizations Debug

---

### Scenario 2: Active session with workspace customizations

#### Preconditions

- Active session with a repository that has customizations (e.g., the `vscode` repo which has `.github/agents/`, `.github/skills/`, `.github/instructions/`, `.github/prompts/`)
- Session has a worktree checked out

#### Actions

1. Observe sidebar counts update after session becomes active
2. Open management editor, select "Instructions" section
3. Verify items listed match the workspace files
4. Run Developer: Customizations Debug and compare Stage 1 (raw data) with Stage 3 (widget state)
5. Select "Agents" section and verify agent count
6. Select "Prompts" section and verify skill-type commands are excluded

#### Expected Results

- Sidebar counts match editor list counts for every section
- Instructions section includes AGENTS.md, CLAUDE.md, copilot-instructions.md (from `listAgentInstructions`) classified as "Workspace"
- Instructions section includes `.instructions.md` files from `.github/instructions/`
- Agents section uses `getCustomAgents()` — parsed names, not raw filenames (README.md excluded)
- Prompts section shows only prompt-type commands, not skill-type (skills have their own section)
- Hooks section shows only workspace-local hook files (user hooks filtered out by `sources: [local]`)
- Debug report shows `Window: Sessions`, `Active root: /path/to/worktree`
- Extension and plugin groups are not shown (sessions filter: `sources: [local, user]`)

#### Notes

- This is the core "happy path" for sessions — most customizations come from the workspace
- Count consistency between sidebar badges and editor item count is the key regression test

---

### Scenario 3: User-level customizations from CLI paths

#### Preconditions

- Files exist in `~/.copilot/instructions/`, `~/.claude/rules/`, or `~/.claude/agents/`
- Active session with a repository open

#### Actions

1. Open management editor, select "Instructions"
2. Verify user-level instruction files appear under the "User" group
3. Select "Agents" section and check for `~/.claude/agents/` user agents
4. Run Developer: Customizations Debug and check the `includedUserFileRoots` filter
5. Verify that VS Code profile user files (e.g., `$PROFILE/instructions/`) are NOT shown

#### Expected Results

- User files from `~/.copilot/` and `~/.claude/` appear in the "User" group
- User files from the VS Code profile path do NOT appear (filtered by `includedUserFileRoots: [~/.copilot, ~/.claude, ~/.agents]`)
- Prompts section shows ALL user roots (filter has `includedUserFileRoots: undefined`) — including VS Code profile prompts
- Debug report Stage 2 shows "Removed" entries for any filtered-out user files
- Sidebar counts reflect the filtered user file counts

#### Notes

- This validates the `IStorageSourceFilter.includedUserFileRoots` allowlist
- Prompts are intentionally an exception — they show from all user roots since CLI now supports user prompts

---

### Scenario 4: Creating new customization files

#### Preconditions

- Active session with a worktree

#### Actions

1. Open management editor, select "Instructions"
2. Click the "Add" button → "New Instructions (Workspace)"
3. Verify the file is created in `.github/instructions/` under the worktree
4. Click "Add" button dropdown → "New Instructions (User)"
5. Verify the file is created in `~/.copilot/instructions/` (not VS Code profile)
6. Select "Hooks" section
7. Click "Add" → verify a `hooks.json` is created in `.github/hooks/`
8. Verify the hooks.json has `"version": 1`, uses `"bash"` field, and contains all events from `COPILOT_CLI_HOOK_TYPE_MAP`

#### Expected Results

- Workspace files created under the active worktree's `.github/` folder
- User files created under `~/.copilot/{type}/` (from `AgenticPromptsService.getSourceFolders()` override)
- Hooks.json skeleton has correct Copilot CLI format: `version: 1`, `bash` (not `command`), all hook events derived from schema
- After creation, item count updates automatically
- Created files are editable in the embedded editor

#### Notes

- This tests that `AgenticPromptsService.getSourceFolders()` correctly redirects user creation to `~/.copilot/`
- Hooks creation derives events from `COPILOT_CLI_HOOK_TYPE_MAP` — adding new events to the schema auto-includes them

---

### Scenario 5: Switching sessions updates customizations

#### Preconditions

- Two sessions active: one with a repo that has many customizations, another with none
- Or: one active session, then start a new session with a different repo

#### Actions

1. Note the sidebar customization counts for the first session
2. Switch to the second session (click it in the session list)
3. Observe sidebar counts update
4. Open the management editor and verify items reflect the new session's workspace
5. Switch back to the first session
6. Verify counts and items revert to the first session's state

#### Expected Results

- Sidebar counts update reactively when `activeSession` observable changes
- Management editor items refresh automatically (list widget subscribes to `activeProjectRoot`)
- Active root in the debug report changes to the new session's worktree
- No stale counts from the previous session persist
- If the new session has no worktree, counts show only user-level items (workspace = 0)
- "Add (Workspace)" button becomes disabled when no active root

#### Notes

- This tests the reactive wiring: `autorun` on `activeSession` triggers `_updateCounts()` in toolbar and `refresh()` in list widget
- Stale count bugs typically manifest when switching sessions — the count remains from the prior session
