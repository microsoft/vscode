# AI Customizations Test Plan

The following test plan outlines the scenarios and specifications for the AI Customizations feature, which includes a management editor and tree view for managing customization items.

## SPECS

- [`../AI_CUSTOMIZATIONS.md`](../AI_CUSTOMIZATIONS.md)

## LOCAL EXPERIMENT OVERRIDES

Production behavior reads the `sessions.list.rearrage` treatment directly from the assignment service. For local testing only, use the assignment service's standard developer override in the user `settings.json`:

- Treatment: `"experiments.override.sessions.list.rearrage": true`
- Control: `"experiments.override.sessions.list.rearrage": false`

The Agents sidebar updates reactively when the override changes. Remove the override to use the automatically assigned experiment variant.

In the treatment, Automations and Customizations are the first rows in the Sessions tree and scroll with its content. The Sessions header follows them and remains sticky while session rows scroll beneath it. The control keeps the expandable Customizations pane above the Sessions list.

## SCENARIOS

### Customization discovery

#### Preconditions

- AI features are enabled.
- Enable `chat.customizations.marketplace.sources.publicFeed.enabled` (experimental and disabled by default). This enables the GitHub Feed, currently the only production source; Marketplace itself has no feature flag.
- Open Agent Customizations in either the editor workbench or Agents Window.

#### Actions and Expected Results

1. Open Discover. Browse available resources without signing in or starting a chat session.
2. Check that the leading section and data-backed Skills, MCP servers, and Plugins sections show names, descriptions, publisher information, resource types, and available star metadata. Repository owner images have a fallback icon when absent or unavailable.
3. Search for a generic topic such as `postgres`, then combine Installed, MCPs, Plugins, and Skills using the search filter menu. Typed `@installed` and `@type:` tokens must stay synchronized with the filters.
4. Verify that search replaces browse cards with one flat virtualized list, with installed items before available items. Only the latest search is displayed, even if an earlier request finishes later.
5. Scroll near the end of search results. Existing results remain visible while the next page loads, then results append without duplicates or a persistent Load More footer. If client-side type filtering leaves too few rows to scroll after bounded backfilling, a Load More action provides access to the remaining continuation. Change the query or type and verify pagination resets.
6. Interrupt a request, change tabs, or close the editor. Hidden/disposed sections cancel their requests. Returning to the tab can load again.
7. Simulate offline, rate-limited, malformed, and oversized-metadata responses from one source. Healthy-source results remain visible in browsing and search alongside a named warning and **Retry**. Scrolling continues healthy sources, retaining loaded items and warnings without inventing a combined total. When every source fails, show warnings rather than a successful empty state. Metadata lists must not exceed 32 entries or 512 characters per entry; scalar card text must not exceed 4,096 characters. URLs and pagination tokens retain their separate limits.
8. Use Tab and Shift+Tab on controls, arrow keys in results, and Enter to open an installed item. Open Accessibility Help and Accessible View; verify source warnings, install actions, resource links, and filters have distinct labels, then close the view and verify focus returns.
9. Open a resource or repository. It opens externally; browsing alone never installs or enables anything. Use **Import > New Agent/Skill/Instructions/Prompt** and verify the Customizations editor closes before the creation flow opens in Chat. Switch harnesses and confirm Discover remains usable.
10. Disable AI features. Discover is hidden and does not make catalog or image requests. Unrelated setup or entitlement changes must preserve the search, loaded pages, and scroll position.
11. Check narrow editor widths, dark/light themes, and high-contrast focus/borders. Move the editor to an auxiliary window and verify layout responds to resizing there.
12. Install a skill into a selected workspace or user location. Confirm the source, revision, and destination; verify that `SKILL.md` and supporting files are preserved, repository `.git` data is not copied, and an existing destination is never overwritten. Restart VS Code and confirm the marketplace entry remains associated with its exact target. Disable or remove the source entry and verify `@installed` still shows the recorded resource with its management actions. Create a separate same-name local skill and verify it remains independent. Delete one recorded file, preserve an edited file and an extra file, then choose **Repair**: only the missing file is restored. Uninstall uses the normal confirmation and Trash flow; cancelling keeps both the files and installation record.
13. Cancel the destination/source confirmation or progress notification, disable its source, or change the active session during a skill import, including while the final move is pending. No incomplete skill should appear in its destination.
14. Install a Copilot or Claude plugin from a catalog subdirectory. The existing trust and managed-marketplace restrictions must apply, and only that plugin should be installed. Another catalog revision or version at the same repository path must remain available to install.
15. Install an MCP server with a supported package or remote endpoint. It must resolve the version-pinned GitHub Feed record independently of the configured VS Code gallery and use the normal MCP policy and installation flow, not executable configuration supplied by the search result. For a server whose version record has only unsupported local prerequisites (for example, Unity's `uv --directory <local path>` setup), verify the publisher's setup link replaces Retry Install after the installability check.
16. Check that installation errors allow retry without losing search results. Cancellations do not announce success, and resources without validated installation provenance explain why installation is unavailable. Cursor-format plugins must not appear in browse or search, even when the first native page contains only Cursor plugins.
17. With the public feed setting unset or false and no other sources enabled, verify the original Overview cards and migration guidance appear instead of Discover and no catalog or installation work starts. Former settings `chat.agentFinder.enabled`, `chat.customizations.unifiedMarketplace.enabled`, `chat.customizations.marketplace.sources.agentFinderPublicFeed.enabled`, and `chat.customizations.marketplace.sources.publicGitHubFeed.enabled` must not enable a source.
18. Enable the public feed and verify Discover replaces Overview; disable it during a query or skill import. Catalog requests and imports must be cancelled, the home button returns to Overview, and no stale Discover results remain. Re-enabling must not revive cancelled work; durable installation records are retained and reconciled, so targets removed while disabled return as missing and repairable.
19. With an additional test source and an independent enablement setting, verify each window requests only its enabled sources. A disabled source must not be initialized or queried, even when another source is active. Disabling one source resets discovery, does not cancel another source's install, and does not clear that other source's installation records. Installation of disabled or unknown source resources remains unavailable.
20. Have the test sources return overlapping identifiers, multiple versions, and different continuation tokens. All distinct source/identifier/version entries remain visible, each continuation goes only to its owning source, exhausted sources stop querying, and installation state/actions do not collide. Continuation after a source-set change requires a new search. No second production source is introduced by this change.
21. Supply independently ranked test sources and search. Each combined page contains at most 24 entries in descending relevance order, including across automatically loaded page boundaries. Short native pages are backfilled, undisplayed entries are retained, and a failed or cancelled continuation can be retried without losing entries. Equal scores use source-registration order; unscored entries rank as zero. Queryless browsing interleaves the feeds while preserving each feed's native order, continues the rotation across page boundaries, and fills remaining slots from other feeds when one exhausts. Scores are internal ranking signals, not displayed quality or trust ratings.
22. With independently enabled test sources, make one fail after the first combined page. Its previously loaded results remain, healthy sources continue, and the warning persists on subsequent pages. Recover it and activate its **Retry** by keyboard: the current query restarts from page one, replacing the list so recovered high-relevance entries are not appended out of order. Warnings and the restart behavior are available in Accessibility Help and Accessible View. Cancel a continuation by leaving the page; returning and scrolling further preserves the cursor and ignores late results and warnings from the cancelled request.
23. Have a test source require explicit sign-in. Show its neutral prompt and primary **Sign In** action without a warning icon or failed/empty-results message; an incomplete-results hint appears only for genuine source failures. Healthy-source results remain available. Repeat with only the sign-in-required source enabled and with another source failing. The action is keyboard accessible, documented in Accessibility Help and Accessible View, and runs only on explicit activation before restarting the combined query.

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
- Installed-customization sections show an empty state with a "No X yet" message. Discover can browse the available catalog independently of the active workspace.
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

---

### Scenario 6: Unified migration checklist

#### Preconditions

- An active agent-host session with one workspace folder
- Prompt, user-data, and MCP migration settings enabled
- Migratable prompts in both profile and workspace, profile agents/instructions, and a supported workspace MCP server

#### Actions and expected results

1. Open **Migrations**. There is one sidebar entry, not separate entries for individual migration types.
2. Check the profile and workspace groups. Prompts to skills appears first with a high-risk label; User Data and MCP Servers appear only where eligible candidates exist.
3. Select **Review** for profile prompts, then workspace prompts. Each opens the existing prompt migration page with only the selected location's files. User Data and MCP Servers likewise reuse their existing pages.
4. Cancel or return without migrating. No files change and all candidates remain on the checklist.
5. Skip the workspace. Its rows are hidden and its items are excluded from the sidebar count, but **Include Workspace** remains reachable. Including it restores the rows without changing files.
6. Change profile destinations. The picker offers only profile file destinations; workspace destinations stay unchanged. MCP destinations remain fixed at the workspace root `.mcp.json`.
7. Complete a migration, then return to Migrations. Expand its activity entry and verify the source and actual destination paths. Only successful writes appear, including when another item fails.
8. Close and reopen the editor and restart VS Code. Activity remains local to the profile and initiating workspace. Switching workspaces does not show another workspace's activity.
9. Dismiss an activity entry. Its record disappears; migrated files remain untouched.
10. Navigate with Tab and Shift+Tab, expand activity with Enter or Space, and open Accessibility Help and Accessible View. Focus returns to the invoking control on dismissal.
11. Verify dark, light, high-contrast, and narrow layouts. No Chat Participants, agent verification, issue creation, or optional multi-root controls are present.

### Scenario 7: New-chat migration notice

#### Preconditions

- The migration settings and candidates from Scenario 6
- The new-chat view with an agent-host session type selected

#### Actions and expected results

1. Select a workspace with pending migrations. A muted, compact banner below the composer summarizes the workspace and profile candidates from the migration overview. Its faint border, subtle background, and secondary text leave the chat input as the primary visual focus.
2. Show and dismiss the notice. The input and its controls remain in exactly the same centered position, including at narrow widths.
3. Activate **Review Migrations** with the keyboard. The customizations modal opens directly to **Migrations** for the selected workspace, even if an older chat was previously focused.
4. Dismiss the notice, restart, and return to that workspace. It stays dismissed. Select another workspace with candidates; its notice remains available.
5. Complete all migrations, then return to new chat. The notice disappears. Profile-only migrations also show in a workspace without local candidates or in a workspace-less quick chat.
6. Disable the migration settings or AI features. No notice appears and disabled migration categories are not scanned for the notice.
7. Verify light, dark, high-contrast, and keyboard focus states. Dismissal returns focus to the input.
