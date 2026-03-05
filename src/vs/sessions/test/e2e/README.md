# Agent Sessions — E2E Tests

Automated dogfooding tests for the Agent Sessions window using a
**compile-and-replay** architecture powered by
[`playwright-cli`](https://github.com/microsoft/playwright-cli) and Copilot CLI.

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
5. Writes the compiled commands to a `.commands.json` file next to the scenario

```
scenarios/
├── 01-repo-picker-on-submit.scenario.md       ← human-written
├── 01-repo-picker-on-submit.commands.json      ← agent-generated
├── 02-cloud-disables-add-run-action.scenario.md
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
├── scenarios/
│   ├── 01-repo-picker-on-submit.scenario.md
│   ├── 01-repo-picker-on-submit.commands.json
│   ├── 02-cloud-disables-add-run-action.scenario.md
│   └── 02-cloud-disables-add-run-action.commands.json
├── .gitignore
└── README.md
```

Supporting scripts at the repo root:

```
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
