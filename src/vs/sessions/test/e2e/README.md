# Agent Sessions — E2E Tests

Automated dogfooding tests for the Agent Sessions window using a
**compile-and-replay** architecture powered by
[`playwright-cli`](https://github.com/microsoft/playwright-cli) and Copilot CLI.

## Mocking Architecture

These tests run the **real** Sessions workbench with only the minimal set of
services mocked — specifically the services that require external backends
(auth, LLM, git). Everything downstream from the mock agent's canned response
runs through the real code paths.

### What's Mocked (Minimal)

| Service | Mock | Why |
|---------|------|-----|
| `IChatEntitlementService` | Returns `ChatEntitlement.Free` | No real Copilot account in CI |
| `IDefaultAccountService` | Returns a fake signed-in account | Hides the "Sign In" button |
| `IGitService` | Resolves immediately (no 10s barrier) | No real git extension in web tests |
| Chat agents (`copilotcli`, etc.) | Canned keyword-matched responses with `textEdit` progress items | No real LLM backend |
| `mock-fs://` FileSystemProvider | `InMemoryFileSystemProvider` registered directly in the workbench (not extension host) | Must be available before any service tries to resolve workspace files |
| GitHub authentication | Always-signed-in mock provider (extension) | No real OAuth flow |
| Code Review command | Returns canned review comments per file (extension) | No real Copilot AI review |
| PR commands (Create/Open/Merge) | No-op handlers that log and show info messages (extension) | No real GitHub API |

### What's Real (Everything Else)

The following services run with their **real** implementations, ensuring tests
exercise the actual code paths:

- **`ChatEditingService`** — Processes `textEdit` progress items from the mock
  agent, creates `IModifiedFileEntry` objects with real before/after diffs, and
  computes actual `linesAdded`/`linesRemoved` from content changes
- **`ChatModel`** — Routes agent progress through `acceptResponseProgress()`
- **`ChangesViewPane`** — Reads file modification state from `IChatEditingService`
  observables and renders the tree with real diff stats
- **Diff editor** — Opens a real diff view when clicking files in the changes list
- **Context keys** — `hasUndecidedChatEditingResourceContextKey`,
  `hasAppliedChatEditsContextKey` are set by real `ModifiedFileEntryState`
  observations
- **Menu actions** — "Create PR", "Accept", "Reject" buttons appear based on
  real context key state
- **`CodeReviewService`** — Orchestrates review requests, processes results from
  the mock `github.copilot.chat.codeReview.run` command, and stores comments
- **`CodeReviewToolbarContribution`** — Shows the Code Review button in the
  Changes view toolbar based on real context key state

### Data Flow

```
User types message → Chat Widget → ChatService
  → Mock Agent invoke() → progress([{ kind: 'textEdit', uri, edits }])
    → ChatModel.acceptResponseProgress()
      → ChatEditingService observes textEditGroup parts
        → Creates IModifiedFileEntry per file
        → Reads original content from mock-fs:// FileSystemProvider
        → Computes real diff (linesAdded, linesRemoved)
          → ChangesViewPane renders via observable chain
            → Click file → Opens real diff editor
```

The mock agent is the **only** point where canned data enters the system.
Everything downstream uses real service implementations.

### Code Review & PR Button Flow

```
Code Review button clicked → sessions.codeReview.run (core action)
  → CodeReviewService.requestReview()
    → commandService.executeCommand('chat.internal.codeReview.run')
      → Bridge forwards to 'github.copilot.chat.codeReview.run'
        → Mock extension returns canned comments
          → CodeReviewService stores results, updates observable state
            → CodeReviewToolbarContribution updates button icon/badge

Create PR button clicked → github.copilot.chat.createPullRequestCopilotCLIAgentSession.createPR
  → Mock extension logs and shows info message
```

The PR buttons (Create PR, Open PR, Merge) are contributed via the mock
extension's `package.json` menus, gated by `chatSessionType == copilotcli`.
The `chatSessionType` context key is derived from the session URI scheme
(`getChatSessionType()`), which returns `copilotcli` for mock sessions.

### Why the FileSystem Provider Is Registered in the Workbench

The `mock-fs://` `InMemoryFileSystemProvider` is registered directly on
`IFileService` inside `TestSessionsBrowserMain.createWorkbench()` — **not** in
the mock extension. This is critical because several workbench services
(SnippetsService, AgenticPromptFilesLocator, MCP, etc.) try to resolve files
in the workspace folder **before** the extension host activates. If the
provider were only registered via `vscode.workspace.registerFileSystemProvider()`
in the extension, these services would see `ENOPRO: No file system provider`
errors and fail silently.

The mock extension still registers a `mock-fs` provider via the extension API
(needed for extension host operations), but the workbench-level registration
is the source of truth.

### File Edit Strategy

Mock edits target files that exist in the `mock-fs://` file store so the
`ChatEditingService` can compute real before/after diffs:

- **Existing files** (e.g. `/mock-repo/src/index.ts`, `/mock-repo/package.json`) — edits use a
  full-file replacement range (`line 1 → line 99999`) so the editing service
  diffs the old content against the new content
- **New files** (e.g. `/mock-repo/src/build.ts`) — edits use an insert-at-beginning
  range, producing a "file created" entry in the changes view

### Mock Workspace Folder

The workspace folder URI is `mock-fs://mock-repo/mock-repo`. The path
`/mock-repo` (not root `/`) is used so that `basename(folderUri)` returns
`"mock-repo"` — this is what the folder picker displays. All mock files are
stored under this path in the in-memory file store.

## How It Works

There are two phases:

### Phase 1: Generate (uses LLM — slow, run once)

```bash
npm run generate
```

For each `.scenario.md` file, the generate script:
1. Starts the Sessions web server and opens the page in `playwright-cli`
2. Takes an accessibility tree snapshot of the current page
3. Sends each natural-language step + snapshot to **Copilot CLI**, which returns
   the exact `playwright-cli` commands (e.g. `click e43`, `type "hello"`)
4. Executes the commands to advance the UI state for the next step
5. Writes the compiled commands to a `.commands.json` file in the `scenarios/generated/` folder

```
scenarios/
├── 01-repo-picker-on-submit.scenario.md       ← human-written
├── 02-cloud-disables-add-run-action.scenario.md
└── generated/
    ├── 01-repo-picker-on-submit.commands.json  ← agent-generated
    └── 02-cloud-disables-add-run-action.commands.json
```

The `.commands.json` files are **committed to git** — they're the deterministic
test plan that everyone runs.

### Phase 2: Test (no LLM — fast, deterministic)

```bash
npm test
```

The test runner reads each `.commands.json` and replays the `playwright-cli`
commands mechanically. No LLM calls, no regex matching, no icon stripping.
Just sequential commands and assertions.

### When to Re-generate

Run `npm run generate` when:
- You add a new `.scenario.md` file
- The UI changes and refs are stale (tests start failing)
- You modify an existing scenario's steps

## File Structure

```
e2e/
├── common.cjs               # Shared helpers (server, playwright-cli, parser)
├── generate.cjs              # Compiles scenarios → .commands.json via Copilot CLI
├── test.cjs                  # Replays .commands.json deterministically
├── package.json              # npm scripts: generate, test
├── extensions/
│   └── sessions-e2e-mock/    # Mock extension (auth + mock-fs:// file system)
├── scenarios/
│   ├── 01-chat-response.scenario.md
│   ├── 02-chat-with-changes.scenario.md
│   └── generated/
│       ├── 01-chat-response.commands.json
│       └── 02-chat-with-changes.commands.json
├── .gitignore
└── README.md
```

Supporting files outside `e2e/`:

```
src/vs/sessions/test/
├── web.test.ts              # TestSessionsBrowserMain + MockChatAgentContribution
├── web.test.factory.ts      # Factory for test workbench (replaces web.factory.ts)
└── sessions.web.test.internal.ts  # Test entry point

scripts/
├── code-sessions-web.js      # HTTP server that serves Sessions as a web app
└── code-sessions-web.sh      # Shell wrapper
```

## Prerequisites

- VS Code compiled (`out/` at the repo root):
  ```bash
  npm install && npm run compile
  ```
- Dependencies installed:
  ```bash
  cd src/vs/sessions/test/e2e && npm install
  ```
- Copilot CLI available (for `npm run generate` only):
  ```bash
  copilot --version
  ```

## Running

```bash
cd src/vs/sessions/test/e2e

# First time or after UI changes:
npm run generate

# Run tests (fast, deterministic):
npm test
```

Example test output:

```
Found 2 compiled scenario(s)

Starting sessions web server on port 9542…
Server ready.

▶ Scenario: Repository picker opens when submitting without a repo
  ✅   step 1: Click button "Cloud"
  ✅   step 2: Type "build the project" in the chat input
  ✅   step 3: Press Enter to submit
  ✅   step 4: Verify the repository picker dropdown is visible

▶ Scenario: Switching to Cloud target disables the Add Run Action button
  ✅   step 1: Click button "Cloud"
  ✅   step 2: Click button "Local"

Results: 6 passed, 0 failed
```

## Writing a New Scenario

1. Create a new `NN-description.scenario.md` file in `scenarios/`.
   Files are sorted by name and run in order.

2. Use this format:

```markdown
# Scenario: Short description of what this tests

## Steps
1. Click button "Cloud"
2. Type "build the project" in the chat input
3. Press Enter to submit
4. Verify the repository picker dropdown is visible
```

3. Run `npm run generate` to compile it into a `.commands.json` file.

4. Run `npm test` to verify it works.

5. Commit both the `.scenario.md` and `.commands.json` files.

### Step Language

Write steps in plain English. The Copilot agent interprets them against the
page's accessibility tree. Common patterns:

| Pattern | Example |
|---------|---------|
| Click a button | `Click button "Cloud"` |
| Type in an input | `Type "hello" in the chat input` |
| Press a key | `Press Enter` |
| Verify visibility | `Verify the repository picker dropdown is visible` |
| Verify button state | `Verify the "Send" button is disabled` |

You're not limited to these patterns — the agent understands natural language.

### The .commands.json Format

Each compiled step looks like:

```json
{
  "description": "Click button \"Cloud\"",
  "commands": [
    "click e143"
  ]
}
```

For assertions, the agent outputs a `snapshot` command followed by an assertion comment:

```json
{
  "description": "Verify the repository picker dropdown is visible",
  "commands": [
    "snapshot",
    "# ASSERT_VISIBLE: Repository Picker"
  ]
}
```

The test runner understands these comment-based assertions:
- `# ASSERT_VISIBLE: <text>` — checks snapshot contains the text
- `# ASSERT_DISABLED: <label>` — checks button has `[disabled]`
- `# ASSERT_ENABLED: <label>` — checks button doesn't have `[disabled]`

### How a Step Executes (Worked Example)

Let's trace `Click button "Cloud"` through both phases.

**Generate phase** — the agent sees the accessibility tree snapshot:

```yaml
- group "Session target"
  - button "Local" [ref=e141]
  - button "Cloud" [ref=e143]
```

Copilot CLI returns: `click e143`

This is saved to `.commands.json` and the click is executed to advance state.

**Test phase** — the runner reads:

```json
{ "commands": ["click e143"] }
```

It shells out to `playwright-cli click e143`. Done. No parsing, no matching.

### Tips

- **Use exact button labels** as they appear in the UI.
- **One action per step** — keep steps atomic for clear failure messages.
- **Order matters** — scenarios run sequentially; an Escape is pressed between them.
- **Prefix filenames** with numbers (`01-`, `02-`, …) to control execution order.
- **Re-generate selectively**: `npm run generate -- 01-repo` to recompile one scenario.

### Testing File Diffs

To test that chat responses produce real file diffs:

1. Use a message keyword that triggers file edits in the mock agent
   (e.g. "build", "fix" — see `getMockResponseWithEdits()` in `web.test.ts`)
2. The mock agent emits `textEdit` progress items that flow through the
   **real** `ChatEditingService`
3. Open the secondary side bar to see the Changes view
4. Assert file names are visible in the changes tree
5. Click a file to open the diff editor and assert content is visible

Example scenario:

```markdown
# Scenario: Chat produces real diffs

## Steps
1. Type "build the project" in the chat input
2. Press Enter to submit
3. Verify there is a response in the chat
4. Toggle the secondary side bar
5. Verify the changes view shows modified files
6. Click on "index.ts" in the changes list
7. Verify a diff editor opens with the modified content
```

**Important**: Don't assert hardcoded line counts (e.g. `+23`). Instead assert
on file names and content snippets — the real diff engine computes the actual
counts, which may change as mock file content evolves.

### Adding Mock File Edits

To add new keyword-matched responses with file edits, update
`getMockResponseWithEdits()` in `src/vs/sessions/test/web.test.ts`:

1. **For existing files** — target URIs whose paths match `EXISTING_MOCK_FILES`
   (files pre-seeded in the mock extension's file store). The `emitFileEdits()`
   helper uses a full-file replacement range so the `ChatEditingService`
   computes a real diff.
2. **For new files** — target any other path. The helper uses an insert range
   for these, producing a "file created" entry.
3. **Mock file store** — to add or change pre-seeded files, update `MOCK_FILES`
   in `extensions/sessions-e2e-mock/extension.js` AND update
   `EXISTING_MOCK_FILES` in `web.test.ts` to match. All paths must be under
   `/mock-repo/` (e.g. `/mock-repo/src/newfile.ts`).
