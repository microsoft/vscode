# Claude Agent — live-system smoke plan

A streamlined, repeatable smoke test for the `ClaudeAgent` IAgent provider.
Use this whenever a phase changes the boot path, the registration code in
`agentHostMain.ts` / `agentHostServerMain.ts`, the model filter in
`isClaudeModel`, the GitHub-token plumbing through `IClaudeProxyService`,
or (Phase 6+) the SDK subprocess fork / message pipeline.

It encodes the lessons from the Phase 4 live walk and the Phase 6 cycles
so future runs are deterministic. The two helper scripts under `./scripts/`
capture the boilerplate (launching the app, verifying the logs); the
playwright steps are still operator-driven because they depend on snapshot
refs that change between runs.

## When to run

| Phase | What this plan must continue to prove |
|-------|--------------------------------------|
| 4 (skeleton) | Both providers register; auth reaches `ClaudeAgent`; proxy binds; models surface; first user prompt throws `TODO: Phase 5` (the `createSession` stub fires before `sendMessage`). |
| 5 (sessions) | Same as Phase 4 PLUS `createSession` succeeds (`claude:/<uuid>` URI in IPC log); first user prompt throws `TODO: Phase 6`. **NOTE: Phase 5 was never run live — see §8.** |
| 6 (sendMessage, single-turn, no tools) | Same as Phase 4 PLUS `createSession` returns a *provisional* session (no SDK contact yet); first user prompt materializes the SDK subprocess and **renders a real text response** (no `TODO: Phase` match in the snapshot); IPC log carries `session/responsePart`, `session/delta`, `session/usage`, `session/turnComplete` actions. |
| 7+ | Add per-phase assertion to the table above. |

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
./src/vs/platform/agentHost/node/claude/scripts/verify-claude-logs.sh [--phase=N]
```

Default `--phase` is the latest implemented phase (currently 6). Pass
`--phase=4` or `--phase=5` to skip the Phase-6+ session-action checks.

Exits non-zero if any invariant fails. Always-on checks (any phase ≥ 4):

1. Both `copilotcli` AND `claude` providers registered.
2. `[Claude] Auth token updated` appears (proves `agentService.authenticate`
   fans out to every provider that owns the resource — see §3 of
   `phase4-plan.md` for why this matters).
3. `[ClaudeProxyService] listening on http://127.0.0.1:<port>`.
4. The root-state IPC log carries a `"provider": "claude"` block.
5. ≥ 1 Claude-family model id (`claude-opus-*`, `claude-sonnet-*`, …)
   surfaces in the IPC log — verifies the §3.5 model filter and
   `tryParseClaudeModelId`.
6. **No fatal error log lines** (any phase — these indicate bugs):
   - `[Claude SDK stderr]` (Phase 6 subprocess error stream)
   - `[ClaudeAgentSession] _processMessages crashed` (Phase 6 fatal loop)
   - `[ClaudeAgentSession] mapper threw, skipping message` (Phase 6 mapper)
   - `[Claude] Failed to persist customization directory; aborting materialize` (Phase 6 S5 fatal)

Phase-6+ checks (only when `--phase ≥ 6` AND the operator has driven a turn
to completion via §4):

7. ≥ 1 `"type":"session/responsePart"` action in the IPC log (proves the
   mapper allocated a part — plan §3.6 reducer ordering invariant).
8. ≥ 1 `"type":"session/turnComplete"` action (proves the SDK reached
   `result` and the consumer loop completed the in-flight deferred).

Captured artifacts land in `/tmp/claude-smoke/<timestamp>/`:

- `registration.log` — both `Registering agent provider: …` lines
- `auth.log` — `[Claude] Auth token …`
- `proxy.log` — `[ClaudeProxyService] listening on …`
- `root-state.log` — the claude block from a `RootStateChanged` event
- `claude-models.log` — sample of model entries
- `claude-session-uris.log` — every `claude:/<uuid>` URI created
- `negatives.log` — grep results for the four fatal patterns (empty if pass)
- (Phase 6+) `response-actions.log` — sample `session/responsePart`/`turnComplete` envelopes

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
SMOKE_DIR=$(ls -td /tmp/claude-smoke/*/ | head -1)
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

## 4. Drive a prompt

What the prompt does is phase-dependent:

- **Phase 4**: hits the `createSession` stub before `sendMessage`, so the snapshot shows `TODO: Phase 5`.
- **Phase 5**: `createSession` succeeds; `sendMessage` stub fires; snapshot shows `TODO: Phase 6`.
- **Phase 6+**: `createSession` returns a *provisional* session; the first `sendMessage` materializes the SDK subprocess and streams a real Claude response. Snapshot shows actual model output (e.g. “Hello! How can I help…”). No `TODO: Phase` match.

With the picker still showing “Claude” selected, type and submit:

```bash
# Find the chat textbox (its label is the placeholder text)
SNAP=$(ls -t .playwright-cli/page-*.yml | head -1)
grep -nE 'textbox.*\[active\]' "$SNAP"
# Click it, type, submit:
npx @playwright/cli click <ref>
npx @playwright/cli type "hello claude"
npx @playwright/cli press Enter
```

**Phase 6 timing**: the SDK subprocess fork + init handshake takes a few
seconds on a cold start. Wait ≥5s before the first snapshot:

```bash
sleep 5
```

Re-snapshot and check the result against the phase you're on:

```bash
npx @playwright/cli snapshot
SNAP=$(ls -t .playwright-cli/page-*.yml | head -1)
# Phases 4-5 — stub fires; should match exactly one of these:
grep -nE 'TODO: Phase' "$SNAP"
# Phase 6+ — should NOT match `TODO: Phase`. Instead grep for response:
grep -nE 'paragraph' "$SNAP" | head -5
```

| Phase | Expected snapshot match |
|-------|------------------------|
| 4 | `TODO: Phase 5` (createSession is the first stub on the path) |
| 5 | `TODO: Phase 6` (sendMessage stub) |
| 6+ | no `TODO: Phase` match; one or more `paragraph` nodes with model output |

Capture screenshot:

```bash
# Phase 4-5: stub error
npx @playwright/cli screenshot --filename="$SMOKE_DIR/stub-error.png"
# Phase 6+: real response
npx @playwright/cli screenshot --filename="$SMOKE_DIR/turn-complete.png"
```

**Phase 6+ — verify the action stream from logs.** After the turn completes,
re-run the verify script (it will look for `session/responsePart` and
`session/turnComplete` actions in the IPC log):

```bash
./src/vs/platform/agentHost/node/claude/scripts/verify-claude-logs.sh --phase=6
```

This catches issues that the snapshot can't — e.g. a turn that renders text
in the UI but never emitted `SessionUsage` (broken token accounting), or a
mapper that skipped `content_block_start` and only emitted deltas (broken
ordering invariant).

> **Expected console error on Phase 6.** A single
> `[ERROR] TODO: Phase 10: Error: TODO: Phase 10` line in the playwright
> console capture is normal — the chat client invokes `setClientTools` to
> register its tool list, which is a Phase 10 stub. It does not affect the
> chat round-trip. Promote this to a check failure in Phase 10.

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
- Phases 4–5: `stub-error.png`
- Phase 6+: `turn-complete.png` AND `response-actions.log` (proves the
  IPC action stream landed, not just the UI render)
- `claude-session-uris.log` (one line per session created)

The other captured artifacts are useful for triage if any check fails but
need not appear in every PR.

## 8. Phase 5 retroactive gap

Phase 5 (the `IAgent` provider skeleton) was committed without a live
smoke run. The `--phase=5` row in §1 documents *what would have been*
verified — `createSession` succeeds, IPC log carries a `claude:/<uuid>`
URI, prompt produces `TODO: Phase 6` — but the Phase 5 PR description
did not include any of the artifacts in §7.

This is recorded here (rather than fixed retroactively) because Phase 6
fully replaces the Phase 5 sendMessage path: a Phase 6 smoke run
transitively exercises every Phase 5 code path (provider registration,
auth fan-out, proxy bind, model surface, picker, session URI scheme),
and additionally proves the SDK subprocess fork + message pipeline.

**Lesson for future phases**: every phase that touches the agent host
boot path or the IAgent surface MUST run this plan and attach the
§7 artifacts to its PR, even if the visible behavior is “stub message
changes from X to Y”. Without a live run, regressions in upstream layers
(authentication, proxy, model filter) only surface at the next phase
that does run live — by which point the bisect window is wider.

## Appendix — common failures

| Symptom | Likely cause |
|---------|--------------|
| `verify-claude-logs.sh` fails at check 1 (`copilotcli` missing) | A registration was deleted from `agentHostMain.ts` or `agentHostServerMain.ts`. |
| `verify-claude-logs.sh` fails at check 1 (`claude` missing) | Same, but for ClaudeAgent. Or import broken. |
| `verify-claude-logs.sh` fails at check 2 (`[Claude] Auth token updated` missing) | `agentService.authenticate` is short-circuiting on the first matching provider. The fan-out fix lives in `src/vs/platform/agentHost/node/agentService.ts`. |
| `verify-claude-logs.sh` fails at check 5 (zero models) | The §3.5 filter rejected everything. Inspect the upstream `[Copilot] Found N models` log line and check vendor / `supported_endpoints` / `model_picker_enabled` / `tool_calls`. |
| `verify-claude-logs.sh` fails at check 6 (`[Claude SDK stderr]`) | Phase 6 SDK subprocess wrote to stderr. Inspect the captured stderr in `agenthost.log` — likely auth (`401`/`403` from the proxy), missing `node` runtime, or the subprocess can't reach `ANTHROPIC_BASE_URL`. |
| `verify-claude-logs.sh` fails at check 6 (`_processMessages crashed`) | Phase 6 consumer loop hit an uncaught exception. The latched `_fatalError` is in the message; check whether it's a transport error or a bug in `claudeMapSessionEvents.ts`. |
| `verify-claude-logs.sh` fails at check 6 (`Failed to persist customization directory`) | Phase 6 S5 fatal — `_writeCustomizationDirectory` rejected. Check `ISessionDataService.openDatabase` permissions on the user-data-dir. |
| `verify-claude-logs.sh` fails at check 7 (no `session/responsePart`) | Phase 6 mapper returned no signals. The first `content_block_start` may be `tool_use` (Phase 7+) instead of `text`/`thinking`. Or `_inFlightRequests[0]?.turnId` was undefined when the first message arrived (sequencer race). |
| `verify-claude-logs.sh` fails at check 8 (no `session/turnComplete`) | Phase 6 SDK never reached `result`. The subprocess may still be running (cancellation didn't propagate), or the prompt iterable parked permanently. Check for `_processMessages crashed` first. |
| Picker shows only "Copilot CLI" but registration log is fine | Root state never propagated. Check the `autorun` in `agentSideEffects.ts` — `_publishAgentInfos` should fire on every `agents` observable change. |
| Stub fires `TODO: Phase 5` but plan expected Phase 6 | Operator clicked Claude on a brand-new session, which hits `createSession` first. In Phase 5 this stub is normal; in Phase 6+ it indicates the materialize spine is missing — `createSession` should return `provisional: true` not throw. |
| Phase 6 prompt hangs without rendering text | Either (a) the SDK subprocess never started (check `[ClaudeProxyService]` access logs for the `/v1/messages` POST), (b) the proxy returned non-SSE bytes (check the proxy's stream-loop warn log), or (c) the mapper allocated no part-id and the UI has nothing to render. |
| `npx @playwright/cli evaluate` returns a help screen | The command is `eval`, not `evaluate`. Use `--raw` to strip wrapper output. |
| `npx @playwright/cli click` retries forever with `pointer-block intercepts` | Use keyboard navigation (`press ArrowDown` + `press Enter`). |
