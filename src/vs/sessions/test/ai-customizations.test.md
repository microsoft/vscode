# AI Customizations Test Plan

The following test plan outlines the scenarios and specifications for the AI Customizations feature, which includes a management editor and tree view for managing customization items.

## SPECS

- [`../AI_CUSTOMIZATIONS.md`](../AI_CUSTOMIZATIONS.md)

## SCENARIOS

### Scenario 1: Empty state — no session, no customizations

#### Description

This tests the baseline empty state before any session or workspace is active. The 'new AI developer' state - who doesn't have any customizations on their machine yet.

#### Preconditions

- On 'New Session' screen
- No folder selected
- No user customizations created (from this tool or others i.e. Copilot CLI)

#### Actions

1. Open the sidebar customizations section
2. Observe no sidebar counts are shown for any section (Agents, Skills, Instructions, Prompts, Hooks)
3. Open the management editor by clicking on one of the sections (e.g., "Instructions")
4. Observe the empty state messages
5. Click through each section in the sidebar
6. Run Developer: Customizations Debug and read the report

#### Expected Results

- All sidebar counts are hidden (no badges visible)
- Management editor shows empty state for each section with "No X yet" message
- Create button for **user** customizations is visible but disabled until a workspace folder or repository is selected (Hooks should also show a disabled button, since there is no 'user' scoped hooks)

#### Notes

- The `Window: Sessions` should be verified by running `Developer: Customizations Debug`
- No workspace root should be active, verified via `Developer: Customizations Debug` (active root = none)

---

### Scenario 2: Active workspace selected from new session state

#### Description

This tests the transition from the empty state to having an active workspace selected, but before a worktree is checked out (i.e., before starting a task). This is the 'new session' state where the user has selected a repository but hasn't started working in a specific branch or worktree yet. Customizations should be loaded from the repository root, not a worktree, and counts should reflect that.

#### Preconditions

- On 'New Session' screen (Scenario 1 completed)
- A git repository, cloned on the machine, is available to select
  - For this test use `microsoft/vscode` cloned to a test folder

#### Actions

1. From the new session screen, select a workspace folder
2. Observe the sidebar customization counts update
3. Open the management editor by clicking on "Instructions"
4. Observe items appear in the "Workspace" group
5. Note the workspace item count in the group header
6. Compare the sidebar badge count with the editor's workspace item count — they should match
7. Click "Agents" in the sidebar
8. Observe agent items listed with parsed friendly names (not raw filenames) and a description
9. Click "Skills" in the sidebar
10. Observe skills listed with names derived from folder names
11. Click "Prompts" in the sidebar
12. Observe only prompt-type items (no skills mixed in, although note there may be similarly named items)
13. Click "Hooks" in the sidebar
14. Observe only workspace-scoped hook files (no user-level `~/.claude/settings.json`)
15. Run Developer: Customizations Debug and read the report

#### Expected Results

- Sidebar counts update from 0 to reflect the selected workspace's customizations
- Sidebar badge count matches editor list count for every section
- Instructions includes root-level files (AGENTS.md, CLAUDE.md, copilot-instructions.md) under "Workspace"
- Instructions includes `.instructions.md` files from `.github/instructions/`
- Agents shows friendly names (e.g., "Optimize" not "optimize.agent.md")
- Prompts excludes skill-type slash commands
- Hooks shows only workspace-local files (filter: `sources: [local]`)
- No "Extensions" or "Plugins" groups visible
- If user-level files exist in `~/.copilot/` or `~/.claude/`, a "User" group appears for applicable sections
- Debug report shows `Window: Sessions`, `Active root: /path/to/repository`
- Create button shows both "Workspace" and "User" options in dropdown

#### Notes

- The active root comes from the repository, not a worktree

---

### Scenario 3: Create new workspace instruction in an active worktree session

#### Preconditions

- Active session with a worktree checked out (task started and running)
- Use the same repository as Scenario 2 (`microsoft/vscode`)

#### Actions

1. Observe sidebar customization counts reflect the worktree's customizations and are the same as Scenario 2 (since new worktree inherits from repo root, counts should be the same)
2. Open the management editor by clicking on "Instructions"
3. Observe items listed — should match files in the worktree (not the bare repo)
4. Verify there is a primary button "New Instructions (Workspace)" and another option in the dropdown for "New Instructions (User)"
5. Click the "+ New Instructions (Workspace)" button (primary action)
6. Select a name `<name>` when the quickpick appears and confirm
7. Verify the file opens in the embedded editor
8. Verify the file path shown in the editor header is `<WORKTREE_PATH>/.github/instructions/<name>.instructions.md`
9. Update the instruction file with some content, then press the back button
10. Confirm the instruction file was auto-committed and shows up in the worktree changes list
11. Reopen the customization management editor and click on "Instructions" again
12. Observe the new instruction appears in the "Workspace" group
13. Observe the sidebar badge count has incremented by 1

#### Expected Results

- Active root is the worktree path, not the repository path
- File is created under the worktree's `.github/instructions/` folder (not the bare repo)
- File auto-saves and auto-commits to the worktree
- Item count updates in both the sidebar badge and editor list after creation
- The new file appears in the list with a friendly name derived from the filename

#### Notes

- This is the primary creation flow — workspace instructions are the most common customization type
- Key difference from Scenario 2: active root is the worktree, creation targets the worktree

---

### Scenario 4: Create new user instruction in an active worktree session

#### Preconditions

- Active session with a worktree checked out (continuing from Scenario 3)

#### Actions

1. Open the management editor by clicking on "Instructions"
2. Click the "Add" dropdown arrow → click "New Instruction (User)"
3. Select a name `<name>` when the quickpick appears and confirm
4. Verify the file opens in the embedded editor
5. Verify the file path shown in the editor header is `~/.copilot/instructions/<name>.instructions.md`
6. Confirm the path is NOT the VS Code profile folder (e.g., NOT `~/.vscode-oss-sessions-dev/User/...`)
7. Press the back button to return to the list
8. Observe the new instruction appears in the "User" group
9. Observe the sidebar badge count reflects the new user instruction
10. Run Developer: Customizations Debug
11. Check the "Source Folders (creation targets)" section — verify `[user]` points to `~/.copilot/instructions`

#### Expected Results

- User file is created under `~/.copilot/instructions/` (not the VS Code profile folder)
- The file appears in the "User" group in the list
- Sidebar badge count includes the new user file
- Debug report confirms the user creation target is `~/.copilot/instructions`

#### Notes

- This validates that `AgenticPromptsService.getSourceFolders()` correctly redirects user creation to `~/.copilot/`
- The VS Code profile folder should never be used for user creation in sessions

---

### Scenario 5: Create a new hook in an active worktree session

#### Preconditions

- Active session with a worktree checked out (continuing from Scenario 3)
- No existing `hooks.json` in the worktree's `.github/hooks/` folder

#### Actions

1. Open the management editor by clicking on "Hooks"
2. Observe the current hook items (if any)
3. Click the "Add" button → observe a `hooks.json` is created
4. Verify the hooks.json opens in the embedded editor
5. Verify the file path is `<WORKTREE_PATH>/.github/hooks/hooks.json`
6. Read the generated JSON and check:
   - `"version": 1` is present at the top level
   - Hook entries use `"bash"` as the shell field (not `"command"`)
   - All hook event types are present: `sessionStart`, `userPromptSubmitted`, `preToolUse`, `postToolUse`
   - Each event has a `[{ "type": "command", "bash": "" }]` skeleton
7. Edit one of the hook entries (e.g., add a bash command to `sessionStart`)
8. Press the back button to return to the list
9. Observe the hooks.json appears in the "Workspace" group
10. Observe the sidebar badge count for Hooks has updated
11. Run Developer: Customizations Debug on the Hooks section
12. Verify `Active root` points to the worktree path
13. Compare Stage 1 counts with Stage 3 counts — they should be consistent

#### Expected Results

- Hooks.json is created in the worktree's `.github/hooks/` folder
- JSON skeleton has correct Copilot CLI format: `"version": 1`, `"bash"` field
- All hook events from `COPILOT_CLI_HOOK_TYPE_MAP` are present in the skeleton
- Hooks section shows only workspace-local hook files (no user-level hooks visible)
- Item count updates after creation
- Debug report Stage 1 → Stage 3 pipeline shows no unexpected filtering

#### Notes

- Hook events are derived from `COPILOT_CLI_HOOK_TYPE_MAP` — adding new events to the schema auto-includes them in the skeleton
- Only `"bash"` is used (not `"command"`) to match the Copilot CLI schema
- The `"version": 1` field is required by the CLI for format detection
