# Claude Agent — live-system smoke plan

A streamlined, repeatable smoke test for the `ClaudeAgent` IAgent provider.
Use this whenever a phase changes the boot path, the registration code in
`agentHostMain.ts` / `agentHostServerMain.ts`, the model filter in
`isClaudeModel`, or the GitHub-token plumbing through `IClaudeProxyService`.

It encodes everything we learned during the Phase 4 live walk so future runs
are deterministic. The two helper scripts under `./scripts/` capture the
boilerplate (launching the app, verifying the logs); the playwright steps
are still operator-driven because they depend on snapshot refs that change
between runs.

## When to run

| Phase | What this plan must continue to prove |
|-------|--------------------------------------|
| 4 (skeleton) | Both providers register; auth reaches `ClaudeAgent`; proxy binds; models surface; first user prompt throws `TODO: Phase 5` (the `createSession` stub fires before `sendMessage`). |
| 5 (sessions) | Same as above PLUS `createSession` succeeds; first user prompt throws `TODO: Phase 6`. |
| 6 (sendMessage) | Same as above PLUS prompt produces SDK output. |
| 7+ | Add per-phase assertion to the table in §6 below. |

## Prerequisites

- A fresh build. Confirm via the `VS Code - Build` task or run
  `npm run compile-check-ts-native` once.
- `@playwright/cli` available (`npx @playwright/cli --version` should work).
- A real GitHub Copilot login. Models only populate after authenticate, and
  the Anthropic catalog is only visible to authenticated Copilot accounts.
  The `~/.vscode-oss-sessions-dev` user-data-dir caches login state across
  runs, so you only need to sign in once.
- `ClaudeAgent` registration is opt-in. Pick **either**:
  - Set `chat.agentHost.claudeAgent.enabled: true` in user settings (the
    user-data-dir caches this between runs), **or**
  - Rely on `launch-smoke.sh` — it exports
    `VSCODE_AGENT_HOST_ENABLE_CLAUDE=1` so the agent host enables the
    provider regardless of the workbench setting.

## 1. Launch

```bash
./src/vs/platform/agentHost/node/claude/scripts/launch-smoke.sh 9224
```

This handles the `unset ELECTRON_RUN_AS_NODE`, `VSCODE_SKIP_PRELAUNCH=1`,
`--user-data-dir`, `--extensions-dir`, `--remote-debugging-port`, and the
"kill anything squatting on the port" steps. It exits zero once the CDP
port is listening.

## 2. Verify the agent host wiring (no UI required)

```bash
./src/vs/platform/agentHost/node/claude/scripts/verify-claude-logs.sh
```

Exits non-zero if any of the five log-level invariants fail:

1. Both `copilotcli` AND `claude` providers registered.
2. `[Claude] Auth token updated` appears (proves `agentService.authenticate`
   fans out to every provider that owns the resource — see §3 of
   `phase4-plan.md` for why this matters).
3. `[ClaudeProxyService] listening on http://127.0.0.1:<port>`.
4. The root-state IPC log carries a `"provider": "claude"` block.
5. ≥ 1 Claude-family model id (`claude-opus-*`, `claude-sonnet-*`, …)
   surfaces in the IPC log — verifies the §3.5 model filter and
   `tryParseClaudeModelId`.

Captured artifacts land in `/tmp/claude-phase4-smoke/<timestamp>/`:

- `registration.log` — both `Registering agent provider: …` lines
- `auth.log` — `[Claude] Auth token …`
- `proxy.log` — `[ClaudeProxyService] listening on …`
- `root-state.log` — the claude block from a `RootStateChanged` event
- `claude-models.log` — sample of model entries
- `claude-session-uris.log` — every `claude:/<uuid>` URI created

## 3. Verify the picker UI (operator-driven)

Attach playwright:

```bash
for i in 1 2 3 4 5; do
    npx @playwright/cli attach --cdp=http://127.0.0.1:9224 2>/dev/null && break
    sleep 3
done
npx @playwright/cli tab-list
```

Open the picker:

```bash
npx @playwright/cli snapshot
# Find the ref:
SNAP=$(ls -t .playwright-cli/page-*.yml | head -1)
grep -nE 'Pick Session Type' "$SNAP"
# → e.g. "Pick Session Type, Copilot CLI" [ref=eXXX]
npx @playwright/cli click <ref>
```

Re-snapshot and confirm both options exist:

```bash
npx @playwright/cli snapshot
SNAP=$(ls -t .playwright-cli/page-*.yml | head -1)
grep -nE 'option "(Copilot CLI|Claude)"' "$SNAP"
```

Expected: two `option "Copilot CLI" [ref=…]` and `option "Claude" [ref=…]`
lines.

Capture screenshot for the PR:

```bash
SMOKE_DIR=$(ls -td /tmp/claude-phase4-smoke/*/ | head -1)
npx @playwright/cli screenshot --filename="$SMOKE_DIR/picker-open.png"
```

> **Gotcha — clicking the option directly fails.** The dropdown overlay
> registers a `context-view-pointerBlock` element that intercepts pointer
> events on the option items. Use `ArrowDown` then `Enter` instead:
>
> ```bash
> npx @playwright/cli press ArrowDown
> npx @playwright/cli press Enter
> ```

After selecting Claude, re-snapshot and verify:

```bash
npx @playwright/cli snapshot
SNAP=$(ls -t .playwright-cli/page-*.yml | head -1)
grep -nE 'Pick Session Type, Claude' "$SNAP"
```

Expected: `button "Pick Session Type, Claude" [ref=…]`.

## 4. Drive a prompt to verify the stub fires

```bash
# Find the chat textbox (its label is the placeholder text)
SNAP=$(ls -t .playwright-cli/page-*.yml | head -1)
grep -nE 'textbox.*\[active\]' "$SNAP"
# Click it, type, submit:
npx @playwright/cli click <ref>
npx @playwright/cli type "hello claude"
npx @playwright/cli press Enter
sleep 2
```

Re-snapshot and grep for the expected stub message:

```bash
npx @playwright/cli snapshot
SNAP=$(ls -t .playwright-cli/page-*.yml | head -1)
grep -nE 'TODO: Phase' "$SNAP"
```

Match the result against the phase-specific table:

| Phase | Expected snapshot match |
|-------|------------------------|
| 4 | `TODO: Phase 5` (createSession is the first stub on the path) |
| 5 | `TODO: Phase 6` (sendMessage stub) |
| 6+ | no `TODO: Phase` match (real SDK response renders) |

Capture screenshot:

```bash
npx @playwright/cli screenshot --filename="$SMOKE_DIR/stub-error.png"
```

## 5. Verify the session URI scheme

The session URI is observable in the IPC log, **not** as a
`data-session-uri` DOM attribute (none exists). `verify-claude-logs.sh`
already captures these to `claude-session-uris.log`, but you can re-grep:

```bash
LOG=$(ls -td ~/.vscode-oss-sessions-dev/logs/*/ | head -1)
WIN=$(ls -td "$LOG"window1/output_*/ | head -1)
grep -oE '"session":\s*"claude:[^"]+"' "$WIN"agenthost.*.log | sort -u
```

Expected: at least one `"session": "claude:/<uuid>"` line. The scheme is
`claude:` (the provider id, fed straight to `AgentSession.uri`); the
synced-customization namespace uses the longer `agent-host-claude` form,
which appears in the IPC log as `"uri": "vscode-synced-customization:/agent-host-claude"`.

## 6. Tear down

```bash
lsof -t -i :9224 | xargs -r kill
```

The `~/.vscode-oss-sessions-dev` data dir is intentionally preserved so
the next run skips GitHub login.

## 7. Attach to the PR

For a phase smoke PR, include in the description:

- `registration.log` (two lines)
- `picker-open.png`
- `stub-error.png`
- `claude-session-uris.log` (one line per session created)

The other captured artifacts are useful for triage if any check fails but
need not appear in every PR.

## Appendix — common failures

| Symptom | Likely cause |
|---------|--------------|
| `verify-claude-logs.sh` fails at check 1 (`copilotcli` missing) | A registration was deleted from `agentHostMain.ts` or `agentHostServerMain.ts`. |
| `verify-claude-logs.sh` fails at check 1 (`claude` missing) | Same, but for ClaudeAgent. Or import broken. |
| `verify-claude-logs.sh` fails at check 2 (`[Claude] Auth token updated` missing) | `agentService.authenticate` is short-circuiting on the first matching provider. The fan-out fix lives in `src/vs/platform/agentHost/node/agentService.ts`. |
| `verify-claude-logs.sh` fails at check 5 (zero models) | The §3.5 filter rejected everything. Inspect the upstream `[Copilot] Found N models` log line and check vendor / `supported_endpoints` / `model_picker_enabled` / `tool_calls`. |
| Picker shows only "Copilot CLI" but registration log is fine | Root state never propagated. Check the `autorun` in `agentSideEffects.ts` — `_publishAgentInfos` should fire on every `agents` observable change. |
| Stub fires `TODO: Phase 5` but plan expected Phase 6 | Operator clicked Claude on a brand-new session, which hits `createSession` first. Either start from an existing claude session or update the per-phase table in §4. |
| `npx @playwright/cli evaluate` returns a help screen | The command is `eval`, not `evaluate`. Use `--raw` to strip wrapper output. |
| `npx @playwright/cli click` retries forever with `pointer-block intercepts` | Use keyboard navigation (`press ArrowDown` + `press Enter`). |
