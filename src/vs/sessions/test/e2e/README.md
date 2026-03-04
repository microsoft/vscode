# Agent Sessions — E2E Tests

Automated dogfooding tests for the Agent Sessions window using
[`playwright-cli`](https://github.com/anthropics/playwright-cli) and a lightweight
web server that serves Sessions in a browser.

## Architecture

```
e2e/
├── run.js                   # Test runner — single command to run all scenarios
├── scenarios/               # Plain-English test scenarios (*.scenario.md)
│   ├── 01-repo-picker-on-submit.scenario.md
│   └── 02-cloud-disables-add-run-action.scenario.md
├── .gitignore               # Ignores out/ and *.png
└── README.md
```

Supporting scripts at the repo root:

```
scripts/
├── code-sessions-web.js     # HTTP server that serves Sessions as a web app
└── code-sessions-web.sh     # Shell wrapper
```

### How It Works

1. `run.js` starts the Sessions web server (`scripts/code-sessions-web.js`) on a random
   port with `?skip-sessions-welcome` to bypass the sign-in overlay.
2. It opens the page in `playwright-cli` (headed mode).
3. It reads each `*.scenario.md` file from `scenarios/` and extracts the `## Steps` list.
4. For each step, `run.js` translates the natural-language instruction into
   `playwright-cli` commands:
   - **Click**: takes a snapshot, finds the button ref by label, clicks the ref.
   - **Type / Press**: calls `playwright-cli type` or `playwright-cli press`.
   - **Verify visible**: takes a snapshot and checks the text appears.
   - **Verify button disabled/enabled**: takes a snapshot, finds the button line,
     checks for `[disabled]`.
5. Results are printed with ✅/❌ per step. Failed steps capture a screenshot.

## Prerequisites

- VS Code compiled (`out/` at the repo root):
  ```bash
  npm install && npm run compile
  ```
- `playwright-cli` installed globally:
  ```bash
  npm install -g @anthropics/playwright-cli
  ```

## Running

From the repo root:

```bash
node src/vs/sessions/test/e2e/run.js
```

Example output:

```
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

Create a new `NN-description.scenario.md` file in the `scenarios/` directory.
Files are sorted by name and run in order.

### Scenario Format

```markdown
# Scenario: Short description of what this tests

## Steps
1. Click button "Cloud"
2. Type "build the project" in the chat input
3. Press Enter to submit
4. Verify the repository picker dropdown is visible
```

The `## Steps` section is required. Steps can use numbered lists (`1.`) or bullets (`-`).

### Supported Step Patterns

| Pattern | What it does |
|---------|--------------|
| `Click button "<label>"` | Snapshots the page, finds the button by label, clicks it |
| `Type "<text>" in the chat input` | Types text into the chat input |
| `Press Enter to submit` | Presses Enter |
| `Press <key>` | Presses any key (e.g., `Escape`, `Tab`) |
| `Verify the repository picker dropdown is visible` | Checks snapshot for "Pick Repository" |
| `Verify <element> is visible` | Checks snapshot for the element text |
| `Verify the "<label>" button is disabled` | Checks snapshot for button with `[disabled]` |
| `Verify the "<label>" button is enabled` | Checks snapshot for button without `[disabled]` |

### Adding New Step Patterns

To support a new kind of step:

1. Open `run.js` and find the `stepToCommands()` function.
2. Add a new regex match case that returns a command object:
   ```js
   // Example: support "Wait <N> seconds"
   if ((m = step.match(/^wait (\d+) seconds?$/i))) {
       return [{ type: 'cli', args: ['wait', m[1]] }];
   }
   ```
3. If the command type is new (not `cli`, `click-button`, `assert-visible`, etc.),
   add a corresponding `case` in the `executeStep()` function's switch statement.

### Tips for Writing Good Scenarios

- **Use exact button labels** as they appear in the UI (e.g., `"Cloud"`, `"Local"`).
  The runner matches button text from `playwright-cli` accessibility snapshots.
- **One action per step** — keep steps atomic so failures are easy to diagnose.
- **Order matters** — scenarios run sequentially and the browser state carries over
  (an `Escape` press is injected between scenarios to dismiss overlays).
- **Prefix filenames** with numbers (`01-`, `02-`, …) to control execution order.
