# Agent Project Board contributor setup

This guide targets the shared feature branch `bryanchen-d/agents-board-view`, not upstream `main`. Keep day-to-day work on personal topic branches. The [design and scenario contract](agent-project-board-spec.md) describes the implemented P0/P1 prototype and optional P2 scope.

Windows PowerShell is the validated native setup. On macOS/Linux, follow the [upstream build prerequisites](https://github.com/microsoft/vscode/wiki/How-to-Contribute) and use the corresponding `.sh` launch/test scripts; native behavior on those platforms still needs verification.

## 1. Get an isolated checkout

For a new checkout:

```powershell
git clone --filter=blob:none --single-branch --branch bryanchen-d/agents-board-view https://github.com/microsoft/vscode.git vscode-project-board
Set-Location .\vscode-project-board
git switch -c your-name/board-change
```

Alternatively, from an existing VS Code checkout:

```powershell
git fetch origin bryanchen-d/agents-board-view
git worktree add ..\vscode.worktrees\project-board -b your-name/board-change FETCH_HEAD
Set-Location ..\vscode.worktrees\project-board
```

Replace the example branch/folder names if they already exist. In a multi-repo workspace, follow that workspace's isolation policy. Preserve unrelated changes; do not reset an existing checkout to the prototype's old base.

Read [AGENTS.md](../AGENTS.md), the [Copilot instructions](../.github/copilot-instructions.md), and the [Sessions documentation index](../src/vs/sessions/README.md).

## 2. Install prerequisites and build

Install Git and the upstream OS-specific native build prerequisites, including the required C++ tools and Python on Windows.

Use the exact Node version in [.nvmrc](../.nvmrc): **24.18.0 at this revision**. An older Node 24 installation is not equivalent; setup scripts use `import.meta.main`.

```powershell
Get-Content .nvmrc
node --version
npm --version
Get-Command node,npm

npm ci
npm run compile
```

Run these commands from this checkout, not a multi-repo parent. `npm ci` restores the repository's dependencies; `compile` includes the client and source Copilot extension. Follow upstream guidance if native dependency installation fails rather than changing manifests to bypass prerequisites.

The launch script prepares Electron and downloaded built-in extensions. If the source Copilot extension needs rebuilding independently, use `npm run compile-copilot`.

If a Windows npm shim invokes a different Node installation, correct PATH/version-manager selection before continuing. Do not copy another developer's dependency tree, profile, credentials or session storage.

## 3. Launch a separate OSS test profile

Use a dedicated profile outside the repository so experiments cannot modify your normal VS Code profile.

```powershell
$profileRoot = Join-Path $env:LOCALAPPDATA 'CodeOSS-ProjectBoard'
$demo = Join-Path $profileRoot 'demo'
New-Item -ItemType Directory -Path $demo -Force | Out-Null

& .\scripts\code.bat --agents `
  --user-data-dir "$profileRoot\editor" `
  --agents-user-data-dir "$profileRoot\agents" `
  --extensions-dir "$profileRoot\extensions" `
  --agents-extensions-dir "$profileRoot\extensions" `
  --skip-welcome --disable-telemetry
```

Keep the Agents owner window open; the board shares its services. If the launcher initially shows an ordinary Editor, use its Agents-window entry point.

1. Enable/sign into GitHub Copilot through the normal UI using your own account and entitlement.
2. For bounded tests, choose the empty `$demo` folder in Agents rather than asking a model to modify the VS Code checkout.
3. Verify that the model picker is populated and a harmless prompt receives a real response. A remote-connection account badge alone does not establish Copilot authentication.
4. Run **Agents: Open Project Board** from the command palette.

An empty board is expected before chats exist. Create a session in Agents or use the board's New Session button. Independently created chats should appear without reopening the board.

No maintainer tokens, private planning workspace or synthetic provider is required. If Copilot is unavailable, model/view unit tests can still run; report real-provider testing as blocked rather than presenting mocks as live validation.

## 4. Check the basic workflow

- Create a session, send a bounded prompt, close its standalone window, move its card to General/P1 and reopen it. Verify title and transcript.
- Check both closing while Busy and after completion.
- Scroll to the lowest cards; expand a cell and verify its contents remain reachable.
- Use the chevrons at the right of row/column headers and Unassigned to collapse them. Verify frameless controls retain keyboard focus feedback, compact session counts stay visible, Needs Input counts update, and hidden cards cannot receive keyboard navigation. Expand again and check pending answers remain entered. Drop into a collapsed cell to reveal it; reopening a board resets its local collapse state.
- Turn off Auto-include Sessions and verify collapsed Unassigned reports zero sessions without discarding drafts. Drag a session from the Sessions list into a collapsed cell: its visible chats should be placed and the destination revealed. Restore auto-inclusion and verify unplaced chats/drafts return.
- Check the themed board titlebar, maximize/restore and minimize controls. Its fixed title and window controls must not alter the Agents owner window, and the board scroll viewport must stay below the titlebar.
- Type, Backspace/Delete, select/replace text and undo/redo in a new standalone draft and a published chat.
- Use arrows to move focus, Home/End for first/last card, Enter/Space to open, and Escape to close.
- Verify Escape dismisses a popup first and preserves unsent text across close/reopen.
- Use Ctrl/Cmd+Shift+M for the searchable placement picker. Axis menus remain, but card menus should not enumerate cells.
- For Ask User testing, request a bounded interactive question with named options and a permitted custom answer. Verify answering resumes the real provider exactly once.
- For an interrupted response that offers Keep Going in chat, verify the card exposes the same continuation and resumes the original request only once. In a dedicated test session, exercise a harmless tool approval from its card, including the normal dropdown scope choices and denial; confirm the chat and card both update. Never use working conversations or consequential commands as approval fixtures.
- Open the top-right gear menu and independently toggle Time in State, AI Credits, Last Prompt, Model Details, and Agent & Permissions. Last Prompt controls the large submitted-prompt text and starts visible; its timestamp and runtime state stay visible when hidden. The two configuration rows start hidden; compare them against the same chat's standalone configuration, not the main Agents window. Hover rows for full labels/values; unavailable fields are not inferred from another chat.
- Check the last-prompt timestamp on the left of the bottom status bar, with transparent clock and `$` widgets on the right; hover credits for usage details. Verify a live state change resets its timer, output alone does not, and toggles survive closing/reopening the board. An initial `≥` duration means the board did not observe that state's start; unavailable credits mean no reported usage or an active metadata-preview limit, not free usage.

The full P0/P1/resilience checklist is in the [design](agent-project-board-spec.md#scenario-gates). Unsent Agents-created drafts are passive previews; enter their first message in Agents.

## 5. Development and tests

Use one existing watcher if present. Otherwise, after a client-only change:

```powershell
npm run transpile-client
```

This emits JavaScript and resources; it is not a typecheck. Wait for transpilation to finish before reloading the running OSS window. Rebuild the source Copilot extension separately when changing it.

For continuous development, `npm run watch` starts the repository's client, extension and Copilot watchers. Do not run a destructive one-shot transpile concurrently with another output writer.

Cumulative board, provisional-session and native-driver tests:

```powershell
node test\unit\browser\index.js --browser chromium --runGlob "**/{projectBoard*,agentHostUntitledProvisionalSessionService,driver}.test.js" --reporter dot
& .\scripts\test.bat --runGlob "**/{projectBoard*,agentHostUntitledProvisionalSessionService,driver}.test.js" --reporter dot
```

If the browser runner reports a missing Chromium binary, install it with `npm exec playwright install chromium` and rerun. Invoke the browser runner directly so npm argument forwarding cannot drop selectors.

For relevant TypeScript/shared-service changes:

```powershell
npm run typecheck-client
node build\eslint.ts src\vs\sessions\contrib\projectBoard\browser\projectBoardService.ts
```

Replace the lint target with the files you changed. Run `npm run valid-layers-check` when changing module boundaries. `npm test` intentionally fails with directions to the actual runners.

Code baseline `5c1baeb024497351be92d41224d226185ced61f9` passed **217 Chromium / 222 Electron tests** for the cumulative selector above, plus typechecks, lint and Windows native validation. Treat those as recorded baseline results, not a substitute for testing your revision.

## 6. Native interaction gate

Unit tests cannot prove native focus or real editing behavior. For the checked-in native gate, restart the dedicated OSS instance with these additional launch flags:

```powershell
# Append these flags to the isolated-profile launch command above:
# --remote-debugging-port=9337 --enable-smoke-test-driver
```

Keep the debug endpoint local and use only disposable test conversations. Do not expose it through a tunnel or use a production profile. Choose a different unused port if another instance uses 9337.

Prepare a visible dedicated chat, close its standalone window, ensure its composer is empty, and expand cells until the board extends below the real window. Obtain its exact URI from the card's `data-chat-resource` attribute in the board's developer tools; a board-owned draft uses `data-draft-id`. A title is not an identity.

```powershell
node scripts\test-project-board.mts http://127.0.0.1:9337 "<dedicated-test-chat-URI>"
```

The gate performs native focus transitions through the existing smoke driver, real wheel/keyboard input, popup priority, Enter/Escape, input restoration and window cleanup. It does not send prompts. Failed runs retain nonempty test input for inspection.

Use `connectOverCDP(..., { noDefaults: true })` in additional automation and wait for all targets to attach. Stale focus from older clients requires actual native activation/blur transitions; `page.bringToFront()` and DOM focus alone are not sufficient. See [native-gate details](../test/smoke/README.md#project-board-native-interaction-gate).

If the isolated instance reports an empty hardware keyboard map and letter shortcuts are unbound, set `"keyboard.dispatch": "keyCode"` in that instance's user settings and rerun the gate. This is a targeted fallback, not a recommended change to everyone's normal profile.

## 7. Common setup failures

- **Launcher does nothing or preparation is skipped:** verify the exact Node version and the Node executable used by npm. Let the normal prelaunch step run on a fresh checkout.
- **Missing extension entry point or no usable provider:** finish the client/Copilot builds, check extension enablement and inspect Output logs for GitHub Copilot and Agent Host.
- **Sign-in or model access fails:** use your own normal authentication/entitlement workflow; do not copy tokens or bypass policy.
- **Board command missing:** confirm this feature branch and the Agents window are running, then reload only after emitted output is current.
- **A card appears missing:** expand overflow and check Show Archived, Unassigned and the exact resource before concluding that a conversation was deleted.
- **Typing works but editing/navigation keys do not:** check native focus ownership and keyboard mapping; do not replace real key events with injected input to make tests green.
- **Extra windows after testing:** close only identified test windows after checking their input. Preserve the owner/board and user work; never kill all Electron or Node processes by name.

## 8. Contributing a change

Choose a bounded scenario, reproduce the issue and add a failing test at the actual boundary before fixing it. Preserve all existing green gates, normal approval policies and published-session ownership.

Use your own topic branch/fork and follow the [upstream contribution process](https://github.com/microsoft/vscode/wiki/How-to-Contribute). Coordinate feature contributions against `bryanchen-d/agents-board-view`; upstream-main integration is a separate step. Do not force-push the shared feature branch.

Include the scenario IDs, tested revision, commands/counts, platform, exercised providers, native evidence and known gaps in your handoff. Never commit profiles, tokens, transcripts, debug captures or generated build output.

### Rebase onto the feature integration baseline

Treat `bryanchen-d/agents-board-view` as this feature's main branch. Bryan's existing worktree stays on `copilot/vscode/agent-project-board-phase-1`; the working branch tracks the shared branch for incoming changes.

After committing a validated change on the working branch:

```powershell
git fetch origin
git rebase origin/bryanchen-d/agents-board-view
# Resolve any conflicts and run the relevant regression gates before publishing.
git push origin HEAD:refs/heads/bryanchen-d/agents-board-view
```

Rebase only the unpublished personal commits; preserve all published contributor commits. Resolve conflicts by retaining both behaviors and rerun the relevant tests and native scenarios before advancing the shared branch. Use the explicit push target because the local and shared branch names differ. If another contributor advances the remote, fetch, rebase and validate again; never force-push past their commits. Contributors without write access should use a pull request targeting the shared branch.
