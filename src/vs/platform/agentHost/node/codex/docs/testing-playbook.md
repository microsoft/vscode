# Codex testing playbook

End-to-end test recipe for the `CodexAgent` + `CodexProxyService` flow,
combining three local tools:

| Tool             | Role in the loop                                          |
| ---------------- | --------------------------------------------------------- |
| `launch` skill   | Builds + launches Code OSS dev, attaches `@playwright/cli` over CDP, drives the UI to send a chat message. |
| `code-oss-logs`  | Maps the on-disk log layout (`~/.vscode-oss-dev/logs/<run>/`) so we can read `agenthost.log`, `window1/renderer.log`, etc. and confirm the round trip without scraping the UI. |
| `dap-cli`        | Optional — attach a debugger to the agent host or the spawned `codex` CLI when something fails inside `mapCodexEvent` / `CodexProxyService` and the log isn't enough to localise it. |

Use this doc when you have changed anything under
`src/vs/platform/agentHost/node/codex/`,
`src/vs/platform/agentHost/node/shared/copilotApiService.ts`, or
`eslint.config.js` (codex SDK allowlist).

---

## 0. Prereqs

- `@openai/codex-sdk` installed locally (it is **not** bundled with VS Code).
  Quickest path: `npm install` in this repo already pulls it into
  `node_modules/@openai/codex-sdk` because it's listed as a devDependency.
  Then point the workbench setting at it:
  ```jsonc
  // settings.json
  "chat.agentHost.enabled": true,
  "chat.agentHost.codexAgent.path": "/absolute/path/to/vscode/node_modules/@openai/codex-sdk"
  ```
  Without this setting the Codex provider is not registered (the SDK
  ships a ~190MB native `codex` CLI binary per platform, which is why
  we don't bundle it).
- The `codex` CLI is shipped inside that SDK install — no separate
  PATH install required. Verify with
  `ls "$SDK_PATH/../codex-darwin-arm64/vendor"` (or matching platform).
- VS Code dev build is up to date. If the watch tasks (`Core - Transpile`,
  `Ext - Build`) aren't running, start them first or omit
  `VSCODE_SKIP_PRELAUNCH=1` from the launch command.
- No stale Code OSS process bound to the debug port:
  ```bash
  pids=$(lsof -t -i :9224); [ -n "$pids" ] && kill -9 $pids
  ```

> **Heads-up:** changes to anything imported by `agentHostMain.ts` (the
> agent-host process entry point) require a **full Code OSS restart**, not
> a `Developer: Reload Window`. Reloading the window only refreshes the
> renderer; the agent host child process keeps the old code loaded.

---

## 1. Launch Code OSS (regular workbench)

The codex flow surfaces in the standard chat panel via the `Set Session
Target` menu. Test there first — it's much faster to reach than the
Agents window and exercises the same agent host.

```bash
unset ELECTRON_RUN_AS_NODE
VSCODE_SKIP_PRELAUNCH=1 ./scripts/code.sh \
    --user-data-dir="$HOME/.vscode-oss-dev" \
    --extensions-dir="$HOME/.vscode-oss-dev/extensions" \
    --remote-debugging-port=9224 \
    "$PWD" \
    > /tmp/code-oss-launch.log 2>&1 &
sleep 10
lsof -i :9224 | head -3      # confirm port is bound by Code OSS
```

For the Agents window, add `--agents` and expect the codex provider to
appear in its `New Session` picker via the dynamic
`LocalAgentHostSessionsProvider.sessionTypes` syncing from
`rootState.agents` (no separate workbench wiring needed).

---

## 2. Attach `@playwright/cli`

```bash
for i in 1 2 3 4 5 6 7; do
  npx @playwright/cli attach --cdp=http://127.0.0.1:9224 2>/dev/null && break
  sleep 3
done
npx @playwright/cli tab-list       # confirm: workbench-dev.html, Title 'Welcome — vscode'
```

> Re-attach after every `Developer: Reload Window` or full restart; the
> CDP session is per-target.

---

## 3. Wait for the agent host to come up

The agent host is a separate utility process spawned by the workbench;
it takes ~5s after the workbench window appears before
`Registering agent provider: codex` shows up. The renderer can
race the agent host's MessagePort with a 1s timeout — if it loses, the
chat session list is empty and `Set Session Target` won't list codex
until you reload.

Poll the log:

```bash
LOGDIR=$(ls -dt "$HOME/.vscode-oss-dev/logs"/*/ | head -1)
grep 'Registering agent provider: codex' "$LOGDIR/agenthost.log" \
  || (sleep 5 && grep 'Registering agent provider: codex' "$LOGDIR/agenthost.log")
```

Expected lines (all should land within ~10s of the window opening):

```
[info] Registering agent provider: copilotcli
[info] Registering agent provider: claude
[info] Registering agent provider: codex
[info] [ClaudeProxyService] listening on http://127.0.0.1:<port>
[info] [CodexProxyService] listening on http://127.0.0.1:<port>
[info] [Codex] Auth token updated      # only after the workbench finishes auth handoff
```

If `[Codex] Auth token updated` never appears, the GitHub Copilot token
hasn't propagated — `Set Session Target → Codex - Agent Host` will
still appear (the agent registers before auth) but the first chat
message will fail with an `AHP_AUTH_REQUIRED` error.

**Reload workaround:** the user-warned race where the renderer fails
to subscribe to root state with `Channel name 'agentHost' timed out
after 1000ms` is fixed by `Developer: Reload Window` (Ctrl+Shift+P).
The codex provider survives the reload because it lives in the agent
host process, not the renderer.

---

## 4. Drive the chat from playwright

Snapshots give you element refs (`e123` etc.) you can click. Refs are
NOT stable across snapshots, so always re-snapshot after every
state-changing action.

```bash
# Open the secondary side bar chat (macOS shortcut)
npx @playwright/cli press Control+Meta+i

# If chat lands on the Walkthrough, click the "GitHub Copilot New" tile to
# enter the actual chat panel
npx @playwright/cli snapshot --filename=/tmp/snap.yml
grep -nE 'GitHub Copilot New' /tmp/snap.yml      # capture ref, e.g. e444
npx @playwright/cli click <ref>

# Open the "Set Session Target" menu
grep -nE 'Set Session Target' /tmp/snap.yml      # capture ref
npx @playwright/cli click <ref>
sleep 2
npx @playwright/cli snapshot --filename=/tmp/snap.yml
grep -nE 'Codex - Agent Host' /tmp/snap.yml      # capture FRESH ref — menus rebuild
npx @playwright/cli click <ref>

# After switching, snapshot once more to confirm
sleep 3
npx @playwright/cli snapshot --filename=/tmp/snap.yml
grep -nE 'Chat with Codex|Set Session Target - Codex' /tmp/snap.yml
# Also verify the per-session schema renders:
grep -nE 'Approvals:|Sandbox:' /tmp/snap.yml
```

If `Set Session Target - Codex - Agent Host` is missing from the menu,
go back to step 3 — the agent host didn't register `codex` in time.

### Sending a prompt into the Monaco input

The chat input is a Monaco editor instance. `playwright click` on the
textbox ref often gets intercepted by overlays
(`ced-chat-session-detail-*`), so use the keyboard-only path the launch
skill documents:

```bash
# Ensure focus is in the chat input
npx @playwright/cli press Control+Meta+i        # toggle-aware: re-press if already focused

# Type the prompt and submit
npx @playwright/cli type "Run 'ls' in the current directory and tell me how many entries there are."
npx @playwright/cli press Enter
```

Codex's first turn spawns the `codex` CLI — that takes a few seconds
before the first event lands. Wait, then screenshot:

```bash
sleep 8
SCREENSHOT_DIR="/tmp/code-oss-screenshots/$(date +%Y-%m-%dT%H-%M-%S)"
mkdir -p "$SCREENSHOT_DIR"
npx @playwright/cli screenshot --filename="$SCREENSHOT_DIR/codex-after-send.png"
```

A passing run shows:

- An assistant message with shell output (the response text from codex).
- A tool-call ribbon for `Run command` (`shell` tool, mapped from
  codex's `command_execution` item) — that's
  [`codexMapSessionEvents.ts`](../codexMapSessionEvents.ts) doing its job.
- The composer footer still shows `Approvals: <mode>` and
  `Sandbox: <mode>` matching what you picked — that's the per-session
  schema from [`codexSessionConfigKeys.ts`](../codexSessionConfigKeys.ts).

---

## 5. Validate via logs (`code-oss-logs` skill)

```bash
LOGDIR=$(ls -dt "$HOME/.vscode-oss-dev/logs"/*/ | head -1)

# Health check: codex registered, proxy bound, auth propagated
grep -iE 'codex|CodexProxy' "$LOGDIR/agenthost.log"

# Regression check: no errors / warnings in the codex path
grep -iE 'error|warn' "$LOGDIR/agenthost.log" \
  | grep -v 'Listing sessions'      # benign — copilot agent polls on its own

# Renderer-side timing — the only error we expect to see (and tolerate) is the
# first-attempt subscribe race; it disappears after a reload
grep -iE 'codex|agent.*provider|timed out|Failed to subscribe' \
  "$LOGDIR/window1/renderer.log"
```

A clean codex flow produces NO entries in `error|warn` filter from the
agent host log (the proxy logs trace-level per request; if you want to
see every CAPI call, bump log level via
`Developer: Set Log Level → Trace → Agent Host`).

---

## 6. Bring in `dap-cli` when the log isn't enough

Use the debugger when:

- `mapCodexEvent` emits the wrong action shape and you need to inspect
  the `ThreadEvent` payload mid-stream.
- `CodexProxyService` forwards a body but the response never lands —
  set a breakpoint inside `_handleResponses` to see what CAPI returned.
- The codex CLI process hangs — attach to the SDK's `CodexExec.run` to
  see what arguments it spawned with.

### Attach to the agent host (Node)

The agent host runs as an Electron utility process. To get a Node-DAP
debugger on it, start Code OSS with `--inspect-brk=<port>` and pass it
through to the utility process via the agent host starter.

Easier path: launch the agent host **directly** as a Node process and
point the workbench at it via WebSocket. Then `dap-cli launch
--program node --json '{"program":"…/agentHostMain.js","stopOnEntry":true}'`
gets a clean attach. This is overkill for most bugs; prefer log-based
probing first.

### Attach to the spawned `codex` CLI (Rust)

The `codex` binary is Rust — for DAP you'd need `codelldb` or `lldb-dap`
configured. Easier: kill the spawned process and re-run with
`CODEX_LOG=trace codex …` invoked manually from the same env our
proxy sets up. The SDK uses `--config openai_base_url=<proxy>` +
`CODEX_API_KEY=<nonce>` env, both visible via `ps -ef`.

### Common dap-cli loop (when you decide to use it)

```bash
dap-cli start
# launch a node target; example for attaching to a running agent host
dap-cli attach --config "Attach to Agent Host"

# set a probe inside the event mapper
dap-cli breakpoints set \
  --source src/vs/platform/agentHost/node/codex/codexMapSessionEvents.ts \
  --line <line where you want to inspect event/item>

# resume; trigger the prompt from playwright
dap-cli continue
# from another terminal:
#   npx @playwright/cli type "<prompt>" && npx @playwright/cli press Enter

# when the breakpoint hits
dap-cli status
dap-cli threads && dap-cli stack
dap-cli scopes --frame-id <id>
dap-cli variables --variables-reference <ref>
dap-cli evaluate --expression "JSON.stringify(event, null, 2).slice(0, 800)"

# tear down
dap-cli close && dap-cli stop-controller
```

Treat dap-cli as a **last-resort** tool. The log + screenshot loop in
steps 4-5 catches almost every regression we've seen so far.

---

## 7. Restart discipline

| Change | Action |
| --- | --- |
| Workbench-side code (`src/vs/sessions/**`, `src/vs/workbench/contrib/chat/**`) | `Developer: Reload Window` is enough |
| Codex agent (`src/vs/platform/agentHost/node/codex/**`) | **Full restart** — kill Code OSS, relaunch. The agent host is a separate process and Reload doesn't restart it. |
| CAPI / proxy (`copilotApiService.ts`, `codexProxyService.ts`) | **Full restart** — same reason. |
| ESLint config (allowlist for `@openai/codex-sdk`) | Build re-runs automatically via the watch task; full restart needed to pick up the rebuilt agent host code. |

```bash
# Clean restart loop
ps aux | grep -i 'Code - OSS' | grep -v grep | awk '{print $2}' | xargs -r kill -9
sleep 3
# launch again as in step 1
```

---

## 8. What "good" looks like

A green run on a fresh clone, after `npm install` and starting the
watch tasks, should:

1. Show `Registering agent provider: codex` and
   `[CodexProxyService] listening on http://127.0.0.1:<port>` in
   `agenthost.log` within ~10s.
2. Surface `Codex - Agent Host` in the chat panel's `Set Session Target`
   menu after one `Developer: Reload Window` (workaround for the
   renderer-subscribe race).
3. Stream a Codex response within ~10s of `Enter`, with a shell tool
   widget for the `ls` invocation.
4. Produce zero `error|warn` lines in `agenthost.log` for the codex
   path.
5. Survive a model swap (`Pick Model` button on the composer) without
   restarting — `sendMessage` rebuilds the `Thread` via
   `resumeThread(id, newOptions)` on the next turn.
