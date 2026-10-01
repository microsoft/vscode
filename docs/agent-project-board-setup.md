# Agents Hub contributor setup

This guide targets the shared feature branch `agent-hub-main`, not upstream `main`. Keep day-to-day work on personal topic branches. The [design and scenario contract](agent-project-board-spec.md) describes the implemented P0/P1 prototype and optional P2 scope.

Windows PowerShell is the validated native setup. On macOS/Linux, follow the [upstream build prerequisites](https://github.com/microsoft/vscode/wiki/How-to-Contribute) and use the corresponding `.sh` launch/test scripts; native behavior on those platforms still needs verification.

## 1. Get an isolated checkout

For a new checkout:

```powershell
git clone --filter=blob:none --single-branch --branch agent-hub-main https://github.com/microsoft/vscode.git vscode-project-board
Set-Location .\vscode-project-board
git switch -c your-name/board-change
```

Alternatively, from an existing VS Code checkout:

```powershell
git fetch origin agent-hub-main
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

After pulling changes that add CSS files, fully restart the isolated OSS instance after compilation. Window reload alone retains the process-cached development CSS module list and can fail to load a newly added stylesheet.

1. Enable/sign into GitHub Copilot through the normal UI using your own account and entitlement.
2. For bounded tests, choose the empty `$demo` folder in Agents rather than asking a model to modify the VS Code checkout.
3. Verify that the model picker is populated and a harmless prompt receives a real response. A remote-connection account badge alone does not establish Copilot authentication.
4. Expand **Agents Hub** in the Sessions sidebar and select a named board. Run **Agents: Open Agents Hub** to open that board in its own window, or use the board's **Open in New Window** action.

An empty board is expected before chats exist. Create a session in Agents or use the board's New Session button. Independently created chats should appear without reopening the board.

No maintainer tokens, private planning workspace or synthetic provider is required. If Copilot is unavailable, model/view unit tests can still run; report real-provider testing as blocked rather than presenting mocks as live validation.

## 4. Check the basic workflow

- Upgrade an existing single-board profile and verify Default retains all labels, placements and display preferences. The legacy payload must remain available for recovery.
- Create a second board from the Agents Hub section. Confirm existing and newly created chats appear in both boards' Unassigned trays, while placing a chat or changing settings on one board leaves the other unchanged.
- Open both boards in separate windows and switch the embedded Hub independently. Rename a board and verify only its title changes; delete it and verify conversations and unrelated windows survive.
- Enter a pending answer, switch embedded boards and return. Verify the input survives and answering on one board resolves the same request on other boards without duplicate submission.
- Create a session, send a bounded prompt, close its standalone window, move its card to General/P1 and reopen it. Verify title and transcript.
- Add a peer chat and delegate a real tool worker within that session. Verify peers appear beneath the main card and workers beneath the chat that spawned them, in both embedded and standalone Hub views, with no duplicate root card. Child groups start collapsed, including nested workers and Session List rows; expanding one view must not expand another. Update a child's status and check folded summaries include all descendants; expand and open the exact child. Closing a nested child must reveal every ancestor and its card, and folding must preserve pending answers.
- Move the parent to a cell and verify newly discovered unplaced children follow it, including with Auto-include Sessions off. Move a child to another cell and verify its explicit placement wins; **Follow Parent** in its destination picker rejoins the family. Toggle Session List and verify native nested rows still open the exact chat without rewriting placements.
- Right-click a card in each Hub surface. Verify **Move to row** and **Move to column** exclude its current axes, preserve the other coordinate, reveal collapsed destinations and restore card focus. From Unassigned, verify the missing coordinate uses the first axis. Move an inherited child independently and check another board remains unchanged; the searchable picker must still offer Unassigned/Follow Parent.
- Use the board's **New Session** modal to choose a workspace, agent/model and **Project Path**, then press Enter to submit a bounded prompt. Verify the selected workspace and board cell are used and the main Agents draft remains unchanged. The running chat should open immediately in the embedded side panel (even with the existing-card preference off), or in a new chat window when created from a standalone board, without waiting for its response to finish.
- Verify the regular Agents draft is absent from Unassigned and its collapsed count, without losing its input. Double-click empty space in an expanded cell in each Hub surface and verify **Project Path** starts at that cell; cancel and reopen another cell, and verify card/control double-clicks do not open creation.
- Compare submission with the ordinary Agents composer using the same workspace, model, permissions and worktree setting. The modal should dismiss when the provider exposes the running provisional session, not wait for canonical discovery. Verify one card retains its selected cell and any subsequent moves after graduation, closing the modal/view does not cancel the accepted send, and a late discovery failure is reported without resending the prompt.
- With a Git workspace containing commits, verify **New Worktree** and the branch control appear in both modal surfaces. Uncheck **New Worktree** to use the selected folder directly. Non-Git folders and repositories without commits use the folder without offering worktree isolation; `sessions.useWorktree` controls the fallback default, not checkbox visibility.
- Move focus to **Project Path**, dismiss its picker, then click and type in the prompt. Repeat with a side-panel chat open, after reopening the modal, and in a standalone board.
- Verify there is no bottom Cancel button; use X or Escape to dismiss an unsent modal, with Escape dismissing an open picker before the dialog.
- Dismiss an unsent modal and reopen it: its input should be retained without a published session. Test declined workspace trust, unavailable providers and a send failure without losing the prompt or silently sending to the previous workspace. Turn off Auto-include Sessions and verify creation into an explicit cell remains visible.
- In embedded and standalone boards, hover or focus a live card and activate its checkmark **Mark as Done** button instead of Delete. Verify it archives only that card's owning session, including sibling/worker chats, even if unrelated sessions are selected. Done stops active requests but preserves history and placements on all boards. Verify archived cards reappear under Show Archived without another Done button, then restore the session through the Sessions list and reopen its transcript. Unavailable cards have no Done action; unsent standalone draft recovery cards retain confirmed draft deletion.
- Select several disposable live cards and use the toolbar/context-menu **Mark as Done** action. Verify one archive per owning session, explicit errors and retry after failures, and disabled controls during an operation. Check keyboard selection and verify nested answer controls do not change the card selection.
- Check both closing while Busy and after completion.
- With more than sixteen displayed chats, activate **Pending refresh** using mouse and keyboard. Verify the exact card loads without opening or marking it read, other views agree on the displaced preview, and pending answer/approval inputs survive. Check disabled **Refreshing...**, real error/no-prompt messages, retry after capacity becomes available, and unchanged profile settings.
- Verify cards show only populated **Artifacts**, **References**, and **Pull Requests** pills, not inline item links. A single entry still opens a dropdown. Check produced files versus recorded references, native grouped file/image/link entries and copy-location actions, duplicate removal across categories, and a **Last prompt context** section after history loads. Empty categories stay hidden; an unloaded preview retains **Pending refresh**. Open files and links without opening/marking the chat, moving the card or sending a prompt. Accessible View must include the labels and locations.
- Verify associated PR pills appear even on cards awaiting history refresh. Check the represented chat's workspace, session PR artifacts, legacy single-PR metadata, checkout/reference-only PRs remaining in References, and provider-driven title/state/icon updates while the dropdown stays open. Open associated PRs externally without opening or marking the chat; full titles, states and locations remain available through hover/accessibility.
- In embedded and standalone boards, use Tab/Left/Right to reach each pill, Enter/Space to expand, Up/Down to choose an entry, Enter to open and Escape to dismiss back to the trigger. Clicking the same trigger again should close the popup. Keep a dropdown open during live card updates; retain its focus and pending-answer text. Hide/remove/fold its card, switch boards or toggle Session List and verify the popup closes. Check that standalone popups stay in that window. In dark, light and both high-contrast themes, verify native pill/dropdown text, hover and focus styling and provider state-icon colors, with no overflow in narrow cards.
- Scroll to the lowest cards; expand a cell and verify its contents remain reachable.
- Use the chevrons at the right of row/column headers and Unassigned to collapse them. Verify frameless controls retain keyboard focus feedback and totals include live state breakdowns for Busy, Needs Input, Error, Idle and Starting, plus retained Draft/Unavailable entries. Include nested and overflow chats and check the counts reconcile with the total; list mode counts owning-session states. Hidden cards must be skipped by keyboard navigation. Expand again and check pending answers remain entered. Drop into a collapsed cell to reveal it; reopening a board resets its local collapse state.
- Each nonzero state count has a decorative glyph beside its text, including child-group summaries. Verify screen readers and Accessible View retain the state names and counts without reading decorative glyphs.
- Turn off Auto-include Sessions and verify collapsed Unassigned reports zero sessions without discarding drafts. Drag a session from the Sessions list into a collapsed cell: its visible chats should be placed and the destination revealed. Restore auto-inclusion and verify unplaced chats/drafts return.
- Check the themed board titlebar, maximize/restore and minimize controls. Its fixed title and window controls must not alter the Agents owner window, and the board scroll viewport must stay below the titlebar.
- In dark and light themes, standalone scrollbars must use workbench track/thumb colors without a native white gutter. Verify wheel scrolling on each axis, thumb dragging and keyboard reveal; resize and expand/collapse content without losing access to the last cell. Live card updates must retain the active scrollbar and scroll position.
- Type, Backspace/Delete, select/replace text and undo/redo in a new standalone draft and a published chat.
- Use arrows to move focus, Home/End for first/last card, Enter/Space to open, and Escape to close.
- In embedded Agents Hub, enable **Open Chat in Side Panel**, open a card and verify the board remains visible and scrollable beside the exact chat. **Close Chat** returns focus to the card; leaving the Hub restores the prior side-panel layout. Restore the setting afterward and verify the separate Hub window still opens chats in standalone windows.
- The monitored card has a highlight frame but no visible "Open in Side Panel" label. Its accessible current state and description remain available; a folded ancestor can still name the monitored descendant in its disclosure.
- On a rename-capable test chat, use F2 or the card's Rename context-menu action. Verify cancel preserves the title and a committed rename changes only that chat; restore the test title afterward.
- Verify Escape dismisses a popup first and preserves unsent text across close/reopen.
- Use Ctrl/Cmd+Shift+M for the searchable placement picker. Axis menus remain, but card menus should not enumerate cells.
- For Ask User testing, request a bounded interactive question with named options and a permitted custom answer. Verify answering resumes the real provider exactly once.
- For an interrupted response that offers Keep Going in chat, verify the card exposes the same continuation and resumes the original request only once. In a dedicated test session, exercise a harmless tool approval from its card, including the normal dropdown scope choices and denial; confirm the chat and card both update. Never use working conversations or consequential commands as approval fixtures.
- Open the top-right gear menu and independently toggle Time in State, AI Credits, Last Prompt, Model Details, and Agent & Permissions. Last Prompt controls the large submitted-prompt text and starts visible; its timestamp and runtime state stay visible when hidden. The two configuration rows start hidden; compare them against the same chat's standalone configuration, not the main Agents window. Hover rows for full labels/values; unavailable fields are not inferred from another chat.
- Check the last-prompt timestamp on the left of the bottom status bar, with transparent clock and credit-card-icon widgets on the right. Credits display raw AI credits with up to one decimal place, not dollars or cents. While a session is running, successive reported totals of 12.5 and 12.6 must visibly differ; text streaming without new billing data must not invent usage. Hover explains provider reporting intervals and scope. Verify a live state change resets its timer, output alone does not, and toggles survive closing/reopening the board. An initial `≥` duration means the board did not observe that state's start; unavailable credits mean no reported usage or an active metadata-preview limit, not free usage.
- Last-prompt timestamps use full-word relative time such as `1 hour ago` (`now` for a just-submitted prompt), refresh while the board is open even with Time in State off, and show the full local timestamp on hover. Unknown timestamps remain explicitly unavailable.
- With Time in State enabled, a Busy timer stays neutral through exactly 30 minutes, turns orange after 30 minutes, and red only after 2 hours. The `agentsHub.busyTimerWarningForeground` theme color defaults to opaque orange in light/dark themes and the warning foreground in high contrast; red uses the error foreground. Check both live ticks and rerenders, light/dark/high-contrast themes, and a transition out of Busy. Other states and disconnected providers never retain the warning color; reconnect starts a fresh observed lower bound.

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

When multiple board windows are open, append the board's stable ID as a third argument (`default` for the migrated board). The gate selects that window without closing unrelated boards.

The gate performs native focus transitions through the existing smoke driver, real wheel/keyboard input, popup priority, Enter/Escape, input restoration and window cleanup. It verifies transcript layout before activating the owner window and while growing/shrinking the standalone composer. It does not send prompts. Failed runs retain nonempty test input for inspection.

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

### Delegated workers still appear in Unassigned

First distinguish peers from delegated tool workers. The initial nesting implementation reused the sidebar's peer-chat filter, which deliberately excludes `origin.kind: "tool"`. That implementation could group manually added chats while leaving actual subagents in Unassigned. Current Hub card mode adds worker grouping using `origin.parentChat`; native Session List mode retains its existing sidebar behavior.

On the affected machine, run these commands inside the checkout used to launch OSS:

```powershell
git status --short
git fetch origin agent-hub-main
git log -1 --oneline
git log --oneline HEAD..origin/agent-hub-main -- src/vs/sessions/contrib/projectBoard
```

If the checkout is clean and only behind the feature branch, `git merge --ff-only origin/agent-hub-main` updates it without rewriting local work. If it diverged or has edits, preserve those changes and reconcile them first. Rebuild the client from that checkout with the pinned Node version (`npm run compile-client`), then close and relaunch that checkout's dedicated OSS instance using the same profile. Pulling source does not update an already-running renderer or stale emitted JavaScript.

Check a known parent/worker pair in card mode:

- Move the parent to a cell. An unplaced worker with a valid parent relationship follows it, even with Auto-include Sessions off.
- A worker explicitly placed in a different cell remains independent. Use **Follow Parent** in its move picker to remove only that override; do not clear the board's saved configuration.
- Expand ancestor disclosures and cell overflow. Check Show Archived if the parent is archived. A missing, hidden or filtered parent leaves the child visible instead of silently dropping it.
- For a remaining mismatch, inspect the provider's `ISession.chats` inventory: record `providerId`, owning-session resource, main-chat resource, child resource, `origin.kind`, `origin.parentChat`, interactivity, archive state and the pair's board placements. The parent resource must resolve to a visible chat in that same owning session/provider. Missing metadata or separately exposed sessions need a provider-side investigation, not title matching in the Hub.

Include the checkout commit, launched build/path, provider name, card/list mode and a redacted parent/child metadata sample in a bug report. Do not include prompts, transcripts or credentials. The regressions can be run with `node test\unit\browser\index.js --browser chromium --runGlob "**/projectBoard{Model,Service}.test.js"` after compilation.

## 8. Contributing a change

Choose a bounded scenario, reproduce the issue and add a failing test at the actual boundary before fixing it. Preserve all existing green gates, normal approval policies and published-session ownership.

Use your own topic branch/fork and follow the [upstream contribution process](https://github.com/microsoft/vscode/wiki/How-to-Contribute). Coordinate feature contributions against `agent-hub-main`; upstream-main integration is a separate step. Do not force-push the shared feature branch.

Include the scenario IDs, tested revision, commands/counts, platform, exercised providers, native evidence and known gaps in your handoff. Never commit profiles, tokens, transcripts, debug captures or generated build output.

### Rebase onto the feature integration baseline

Treat `agent-hub-main` as this feature's main branch. Bryan's existing worktree stays on `copilot/vscode/agent-project-board-phase-1`; the working branch tracks the shared branch for incoming changes.

After committing a validated change on the working branch:

```powershell
git fetch origin
git rebase origin/agent-hub-main
# Resolve any conflicts and run the relevant regression gates before publishing.
git push origin HEAD:refs/heads/agent-hub-main
```

Rebase only the unpublished personal commits; preserve all published contributor commits. Resolve conflicts by retaining both behaviors and rerun the relevant tests and native scenarios before advancing the shared branch. Use the explicit push target because the local and shared branch names differ. If another contributor advances the remote, fetch, rebase and validate again; never force-push past their commits. Contributors without write access should use a pull request targeting the shared branch.
