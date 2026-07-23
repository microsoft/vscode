# Disabled and conditional E2E tests

This document inventories bundled-provider E2E tests that are disabled for at
least one provider, platform, or execution mode. It exists so a human or agent
can periodically reevaluate the gaps instead of treating every pending test as
expected forever.

The test remains the executable specification. This document records the
observed symptom and scope, not a speculative root cause.

## Process

When a valid E2E scenario exposes behavior that may be a product bug:

1. Minimize the scenario and confirm which provider, platform, and execution
   mode reproduce it.
2. Keep the failing test case in the suite, but disable only the affected
   variant. Do not weaken its assertions to make it pass.
3. Add a short comment at the gate and an entry here with:
   - the exact test title
   - affected provider/platform/mode
   - expected and observed behavior
   - a focused reproduction command
4. Record symptoms only. Root-cause hypotheses belong in an investigation,
   issue, or fix, where they can be tested.
5. Keep generated captures for provider variants that are expected to run
   again. Never hand-edit captures.
6. When the behavior is fixed or the limitation is removed, enable the test,
   verify it fails without the fix when practical, and remove or update the
   entry.

Capability skips are tracked separately from suspected bugs. A provider that
does not advertise a capability is expected to skip positive-path tests for
that capability.

## Suspected product bugs

### Claude provider-context fork

- Tests:
  - `forked peer chat inherits source history through the provider`
  - `unknown-turn fork does not inherit source provider context`
- Scope: Claude.
- Expected: Claude advertises multi-chat fork support, and a provider-backed
  fork can continue from the requested source history.
- Observed: exercising a real provider-context fork rejects the AHP turn id as
  an invalid `upToMessageId`. The unknown-turn context test currently shares
  the same provider E2E fork gate.
- Gate: `supportsChatForkE2E: false`.
- Reproduce:

  ```bash
  ./scripts/test-integration.sh --run \
    src/vs/platform/agentHost/test/node/e2e/providers/claudeAgentHostE2E.integrationTest.ts \
    --grep "forked peer chat inherits source history through the provider"
  ```

  Temporarily enable `supportsChatForkE2E` to execute the disabled test.

### Claude fresh peer context after a long shared-suite sequence

- Test: `fresh peer chat does not inherit default chat context`.
- Scope: Claude deterministic replay with the shared provider process.
- Expected: materializing a fresh peer after using the default chat succeeds,
  and the peer request does not contain the default chat's history.
- Observed: after the preceding peer-lifecycle sequence, the peer turn can fail
  with `sendFailed: Server not found: host`. The same test passes by itself and
  while recording with a per-test process.
- Gate: disabled only for Claude.
- Reproduce:

  ```bash
  ./scripts/test-integration.sh --run \
    src/vs/platform/agentHost/test/node/e2e/providers/claudeAgentHostE2E.integrationTest.ts
  ```

  Temporarily enable the Claude variant. Run the whole provider file; a focused
  run does not reproduce the shared-process symptom.

### Copilot file-operation turns that do not complete reliably

- Scope: Copilot.
- Tests and observed symptoms:
  - `reads an existing text file`: the recorded turn did not complete.
  - `reads a value from JSON`: the replayed turn did not complete.
  - `creates a new text file`: tool completion is not emitted consistently.
  - `edits an existing text file`: the replayed turn did not complete.
  - `deletes a workspace file`: the replayed turn did not complete.
- Expected: each turn reaches `chat/turnComplete` and the direct filesystem or
  response assertion succeeds.
- Gate: provider-specific conditions in `fileOperationsSuite.ts`.
- Reproduce:

  ```bash
  ./scripts/test-integration.sh --run \
    src/vs/platform/agentHost/test/node/e2e/providers/copilotAgentHostE2E.integrationTest.ts \
    --grep "<exact test title>"
  ```

  Temporarily enable the selected Copilot variant. Re-record narrowly if the
  current capture does not exist.

### Codex duplicated or unstable response behavior

- Scope: Codex deterministic replay.
- Expected: a model-backed scenario emits one coherent response and honors
  exact-response prompts.
- Observed: Codex duplicates response content in these newer behavior
  scenarios, and some exact-response prompts do not produce the expected
  response.
- Gate: `stableNewScenarioResponse` is false for Codex.
- Tests covered by this broad gate:
  - `retains context across consecutive turns`
  - `reads an existing text file`
  - `reads a file from a nested directory`
  - `lists workspace entries`
  - `reads a value from JSON`
  - `counts lines in a file`
  - `handles a missing file without a session error`
  - `creates a new text file`
  - `edits an existing text file`
  - `creates a file in a new nested directory`
  - `renames a workspace file`
  - `deletes a workspace file`
  - `runs a deterministic shell command`
  - `inspects git status`
  - `reads a filename containing spaces`
- Reproduce:

  ```bash
  ./scripts/test-integration.sh --run \
    src/vs/platform/agentHost/test/node/e2e/providers/codexAgentHostE2E.integrationTest.ts \
    --grep "<exact test title>"
  ```

  Temporarily enable only the selected scenario. This broad gate should be
  narrowed as individual Codex scenarios become stable.

## Platform and deterministic-replay limitations

### Windows shell and filesystem behavior

The committed model captures can select POSIX shell commands, and several
host-owned shell behaviors differ on Windows. These tests remain enabled on
unaffected providers and platforms.

| Test | Disabled scope | Observed limitation |
|---|---|---|
| `a bang command runs locally and exposes terminal output` | Windows | The successful bang command produces output but does not complete reliably. |
| `session configuration resolves and completes git branches` | Windows | Git-backed config discovery can retain the temporary repository lock after session disposal. |
| `worktree session uses the resolved worktree as working directory` | Windows | The recorded paths and `pwd` behavior are POSIX-shaped. |
| `tool call triggers permission request and can be approved` | Windows | The scenario executes a recorded shell command. |
| `lists workspace entries` | Windows | The scenario depends on provider shell execution. |
| `counts lines in a file` | Windows | The scenario depends on provider shell execution. |
| `renames a workspace file` | Windows | The scenario depends on provider shell execution. |
| `runs a deterministic shell command` | Windows | The scenario directly exercises a shell command. |
| `reads a file from a nested directory` | Copilot on Windows | The Copilot capture uses shell behavior that is not portable to Windows. |
| `handles a missing file without a session error` | Copilot on Windows | The Copilot capture uses shell behavior that is not portable to Windows. |
| `creates a file in a new nested directory` | Copilot on Windows | The Copilot capture uses a POSIX shell. |
| `inspects git status` | Copilot on Windows | The scenario depends on provider shell execution. |
| `edits an existing text file` | Claude on Windows | The scenario depends on provider shell execution. |
| `deletes a workspace file` | Claude on Windows | The scenario depends on provider shell execution. |
| `peer chat edits an existing workspace file` | Copilot on Windows | Replay completes, but the recorded tool plan does not mutate the Windows file. |
| `peer chat creates a file in a nested directory` | Copilot on Windows | Replay completes, but the recorded tool plan does not create the Windows file. |

Use the affected provider command with `--grep "<exact test title>"` and
temporarily remove the platform gate to reevaluate a row.

### Codex shell-tool replay on Linux

- Scope: Codex on Linux in deterministic replay.
- Gate: `shellToolReplayUnstableOnLinux: true`.
- Tests directly affected by this gate:
  - `tool call triggers permission request and can be approved`
  - `worktree session uses the resolved worktree as working directory`
  - `lists workspace entries`
  - `counts lines in a file`
  - `renames a workspace file`
  - `runs a deterministic shell command`
- Recording mode remains enabled so a future capture or provider update can be
  evaluated.

### Claude subagent replay on Windows

- Test: `reopening a session keeps sub-agent messages out of the parent transcript (replay path)`.
- Scope: Claude on Windows.
- Expected: the reopened parent transcript excludes subagent-only messages.
- Observed: Claude reconstructs the subagent transcript from
  `subagents/agent-*.jsonl`, which is not reliably visible on Windows.
- Gate: `subagentReplayUnstableOnWindows: true`.
- Related investigation: [#325284](https://github.com/microsoft/vscode/pull/325284).

### Git-status snapshot ordering

- Test: `inspects git status`.
- Scope: Claude and Codex.
- Expected: the behavior snapshot contains stable semantic tool traffic.
- Observed: customization and changeset notifications occur at nondeterministic
  points in the snapshot.
- Gate: enabled only for Copilot, subject to shell-platform gates.

### Mid-turn abort is record-only

- Test: `can abort a running turn`.
- Scope: deterministic replay for every provider.
- Reason: replay serves the intentionally truncated response immediately, so
  there is no real streaming window in which to abort.
- Run:

  ```bash
  AGENT_HOST_REPLAY_RECORD=1 ./scripts/test-integration.sh --run \
    src/vs/platform/agentHost/test/node/e2e/providers/copilotAgentHostE2E.integrationTest.ts \
    --grep "can abort a running turn"
  ```

This is an intentional test-mode limitation, not a suspected product bug.

### Live Codex steering suite is opt-in

The tests in `codexAgentHostLive.integrationTest.ts` require
`AGENT_HOST_REAL_CODEX=1` because they exercise live, timing-sensitive Codex
behavior that is not represented by deterministic model replay:

- `mid-turn steering surfaces as a new turn and never sticks in pending`
- `client tool is registered and invoked end-to-end`
- `client tool registered after the thread prewarms restarts the thread and still works`
- `server tool (listComments) is registered and executed in-process`
- `file-change approval is surfaced and can be approved`
- `truncate rolls back trailing turns and archive/unarchive reach codex`
- `Plan mode (Agent Mode control) makes request_user_input reachable end-to-end`

These are opt-in live tests, not known failures.

## Test-design limitations

### Claude plan-mode prompt

- Test: `planning-mode session-state writes are auto-approved in default mode`.
- Scope: Claude.
- Expected: the shared prompt drives the provider to invoke `ExitPlanMode`.
- Observed: plan mode is wired, but the Copilot-oriented prompt does not
  reliably cause Claude to invoke the tool.
- Gate: `supportsPlanMode: false`.
- Evaluation goal: make the test prompt provider-neutral or add an equivalent
  Claude-specific prompt without weakening the plan-mode assertions.

## Expected capability skips

These pending tests do not currently indicate bugs.

### Codex multi-chat

Codex does not advertise `multipleChats`. The negative capability test
`provider without multiple chat capability rejects peer creation` runs for
Codex; these positive peer-chat declarations are skipped:

- `creating a peer chat adds it to the session catalog`
- `peer chat subscription starts empty and idle`
- `creating the same peer chat twice is idempotent`
- `creating two peer chats preserves both catalog entries`
- `disposing a peer chat removes its catalog entry`
- `disposing one peer chat preserves its sibling`
- `recreating a disposed peer chat starts empty`
- `renaming a peer chat updates its catalog title`
- `renaming a peer chat leaves the session title unchanged`
- `peer chat survives unsubscribe and resubscribe`
- `peer creation does not leak a provider backing as a top-level session`
- `peer file completion uses the parent workspace`
- `first peer chat snapshots the session title onto the default chat`
- `session rename after peer creation preserves the default chat title`
- `forking an unknown turn creates a fresh empty peer chat`
- `peer chat completes a simple turn`
- `peer chat retains context across consecutive turns`
- `forked peer chat inherits source history through the provider`
- `disposing a peer after a completed turn removes it from the catalog`
- `peer rename command updates the peer title and records a local turn`
- `empty peer rename command leaves the peer title unchanged`
- `failing peer bang command records a failed terminal tool call`
- `peer chat reads a file from the parent workspace`
- `peer chat reads a file from a nested directory`
- `peer chat creates a file in the parent workspace`
- `peer chat edits an existing workspace file`
- `peer chat creates a file in a nested directory`
- `peer chat handles a missing workspace file without an error`
- `peer chat reads a filename containing spaces`
- `two peer chats write distinct workspace files`
- `fresh peer chat does not inherit default chat context`
- `two peer chats keep independent provider contexts`
- `peer provider context survives unsubscribe and resubscribe`
- `recreated peer chat starts with fresh provider context`
- `unknown-turn fork does not inherit source provider context`
- `peer simple attachment reaches the provider request`
- `peer simple attachment without a model representation is omitted from the provider request`
- `peer multiple simple attachments reach the provider request`
- `peer resource attachment reaches the provider request`
- `peer resource selection attachment includes its line reference`

### Codex subagents

Codex does not advertise subagent support, so these tests are skipped:

- `subagent tool calls are routed to the subagent session, not flat in the parent`
- `reopening a session keeps sub-agent messages out of the parent transcript (replay path)`

### Codex plan mode

Codex does not enable the shared plan-mode contract, so
`planning-mode session-state writes are auto-approved in default mode` is
skipped.

### Provider package availability

The complete Claude or Codex deterministic suite is skipped when its bundled
SDK package is unavailable. This is an environment prerequisite, not a product
or test failure.

## Review checklist

Periodically:

1. Run the full provider files, not only focused tests, because shared-process
   failures may depend on suite order.
2. Reevaluate broad gates such as `stableNewScenarioResponse` one test at a
   time.
3. Check whether new provider SDK/CLI versions changed tool selection or
   completion behavior.
4. Re-record narrowly when wire behavior changed, then review every generated
   capture.
5. Enable fixed variants and remove stale entries, comments, config flags, and
   orphaned captures together.
