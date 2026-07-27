# Disabled and conditional E2E tests

This document inventories bundled-provider E2E tests that are disabled for at least one provider, platform, or execution mode. It exists so a human or agent can periodically reevaluate the gaps instead of treating every pending test as expected forever.

The test remains the executable specification. This document records the observed symptom and scope, not a speculative root cause.

## Process

When a valid E2E scenario exposes behavior that may be a product bug:

1. Minimize the scenario and confirm which provider, platform, and execution mode reproduce it.
2. Keep the failing test case in the suite, but disable only the affected variant. Do not weaken its assertions to make it pass.
3. Add a short comment at the gate and an entry here with:
   - the exact test title
   - affected provider/platform/mode
   - expected and observed behavior
   - a focused reproduction command
4. Record symptoms only. Root-cause hypotheses belong in an investigation, issue, or fix, where they can be tested.
5. Keep generated captures for provider variants that are expected to run again. Never hand-edit captures.
6. When the behavior is fixed or the limitation is removed, enable the test, verify it fails without the fix when practical, and remove or update the entry.

Capability skips are tracked separately from suspected bugs. A provider that does not advertise a capability is expected to skip positive-path tests for that capability.

## Structural coverage gaps

Distinct from individually disabled tests: whole areas where a platform or contract has no E2E coverage at all. These do not show up as skipped tests, so they are easy to miss.

### Snapshot text is not normalized for line endings

`normalizeSnapshotText` in `ahpSnapshot.ts` rewrites working directories, home directories, user names, shell ids, and `ls -l` listing columns, but does nothing about line endings. Most snapshots are unaffected because the `behavior` profile records no tool output, but a few carry literal `content: |-` blocks.

Any such block recorded on macOS or Linux will mismatch on Windows if the text is produced with CRLF, for a reason unrelated to the behavior under test — and it will be easy to misread as a product bug. Collapsing `\r\n` to `\n` (and trimming trailing whitespace per line) during snapshot normalization removes a whole class of confusing Windows-only failures for two lines of code. Worth doing before enabling more Windows coverage, not after.

### Windows has no permission, shell, or worktree coverage

`shellToolReplayEnabled` is computed as `!isWindows && ...` — an *unconditional* Windows exclusion, not a per-provider or per-capture one. Everything downstream of it is therefore untested on Windows for every provider, including `tool call triggers permission request and can be approved`, which is the only E2E test of the permission-approval flow.

The individual rows in [Windows shell and filesystem behavior](#windows-shell-and-filesystem-behavior) each look like a small portable-shell problem. Collectively they mean the Windows CI leg validates strictly less of the product than the macOS and Linux legs, in the areas most likely to be platform-specific. That is the inverse of what a cross-platform matrix is for.

Reducing this does not require making the recorded POSIX commands portable. Permission approval, worktree resolution, and terminal lifecycle can be exercised with host-executed commands (bang commands) and conformance-tier tests that do not depend on what the model chose to type into a shell.

Where a scenario genuinely needs to run a command, prefer one that behaves the same under `cmd`/PowerShell and POSIX shells. `node -e "…"` (or a `.js` file seeded into the workspace and invoked as `node script.js`) is always available, since the suite already runs under Node. That keeps the real terminal tool, sandbox, streaming, and exit-code paths under test while removing the platform coupling.

### Recorded model requests are never asserted

`CapiReplayProxy` matches purely ordinally: the Nth request to a given `(method, path)` replays the Nth recorded response. The recorded `request:` block in a capture is normalized on write (for review and diff stability) but is never read back — `exchange.request` is only touched by `_writeFixture`. Replay is therefore driven entirely by the recorded responses.

Ordinal routing is the right choice for *selecting* a response: request bodies carry volatile fields (dates, request ids, uuids) and matching on them would produce brittle cache misses. It also keeps the agent loop on rails, so a tool failure surfaces as a behavioral difference rather than a confusing desync.

The gap is that nothing *asserts* the request. The request body is the host's own product — prompt assembly, conversation history retention, truncation, attachment marshalling, and how tool results are handed back to the model. A regression in any of those would still replay green, because the proxy serves response N regardless of what was asked. The committed `request:` block only changes when someone re-records, at which point a regression is silently promoted to the new expected value. Several `multiChat` tests already hand-roll assertions over `observedModelRequestBodies` to compensate for this.

The fix is to assert the recorded request as a **projection**, mirroring the existing `protocol` / `behavior` profiles in `ahpSnapshot.ts`:

- **Assert** host-authored structure: message roles and ordering, retained history, system prompt shape, attachment blocks, and `tool_use_id` wiring.
- **Elide** environment-derived content, primarily the `tool_result` text payload.

That split is the point. Asserting raw tool output would re-introduce exactly the platform coupling described above — command output, line endings, and `ls`-style listings all differ per OS — and would require a large per-tool normalizer layer to hold stable. Eliding it yields a platform-independent assertion on the part that is actually host behavior. The tool result's presence and wiring is worth asserting; its text is not.

Sequencing: do this *after* the recorded commands are made portable. Turning request assertions on first would simply freeze today's POSIX-flavored requests into the expected values.

## Suspected product bugs

### Claude provider-context fork

- Tests:
  - `forked peer chat inherits source history through the provider`
  - `unknown-turn fork does not inherit source provider context`
- Scope: Claude.
- Expected: Claude advertises multi-chat fork support, and a provider-backed fork can continue from the requested source history.
- Observed: exercising a real provider-context fork rejects the AHP turn id as an invalid `upToMessageId`. The unknown-turn context test currently shares the same provider E2E fork gate.
- Gate: `supportsChatForkE2E: false`.
- Reproduce:

  ```bash
  ./scripts/test-integration.sh --run \
    src/vs/platform/agentHost/test/node/e2e/providers/claudeAgentHostE2E.integrationTest.ts \
    --grep "forked peer chat inherits source history through the provider"
  ```

  Temporarily enable `supportsChatForkE2E` to execute the disabled test.

### Copilot file-operation turns that do not complete reliably

- Scope: Copilot.
- Tests and observed symptoms:
  - `reads an existing text file`: the recorded turn did not complete.
  - `reads a value from JSON`: the replayed turn did not complete.
  - `creates a new text file`: tool completion is not emitted consistently.
  - `edits an existing text file`: the replayed turn did not complete.
  - `deletes a workspace file`: the replayed turn did not complete.
- Expected: each turn reaches `chat/turnComplete` and the direct filesystem or response assertion succeeds.
- Gate: provider-specific conditions in `fileOperationsSuite.ts`.
- Reproduce:

  ```bash
  ./scripts/test-integration.sh --run \
    src/vs/platform/agentHost/test/node/e2e/providers/copilotAgentHostE2E.integrationTest.ts \
    --grep "<exact test title>"
  ```

  Temporarily enable the selected Copilot variant. Re-record narrowly if the current capture does not exist.

### Codex duplicated or unstable response behavior

- Scope: Codex deterministic replay.
- Expected: a model-backed scenario emits one coherent response and honors exact-response prompts.
- Gate: `stableNewScenarioResponse: false` in the Codex provider config.

This single flag currently covers **two distinct problems**, which need different work. Splitting it is a prerequisite for reducing it.

**(a) Recorded but unstable.** A Codex capture exists; replay duplicates response content, or an exact-response prompt does not produce the expected response. Flipping the gate is enough to reevaluate these.

- `retains context across consecutive turns`
- `reads an existing text file`
- `reads a file from a nested directory`
- `lists workspace entries`
- `handles a missing file without a session error`
- `creates a new text file`
- `edits an existing text file`
- `creates a file in a new nested directory`
- `renames a workspace file`
- `deletes a workspace file`
- `reads a filename containing spaces`

Reproduce by temporarily enabling only the selected scenario:

```bash
./scripts/test-integration.sh --run \
  src/vs/platform/agentHost/test/node/e2e/providers/codexAgentHostE2E.integrationTest.ts \
  --grep "<exact test title>"
```

**(b) Never recorded.** No `captures/codex-*.yaml` exists at all, so replay fails at fixture resolution rather than on an assertion. Flipping the gate cannot re-enable these — recording has to succeed first, with `AGENT_HOST_REPLAY_RECORD=1` and a real Codex binary.

- `reads a value from JSON`
- `counts lines in a file`
- `runs a deterministic shell command`
- `inspects git status`

These four are the actionable item: until they are recorded, the reason Codex skips them is unknown, and it may be a product bug rather than replay instability.

## Platform and deterministic-replay limitations

### Windows shell and filesystem behavior

The committed model captures can select POSIX shell commands, and several host-owned shell behaviors differ on Windows. These tests remain enabled on unaffected providers and platforms.

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

Use the affected provider command with `--grep "<exact test title>"` and temporarily remove the platform gate to reevaluate a row.

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
- Recording mode remains enabled so a future capture or provider update can be evaluated.

### Claude subagent replay on Windows

- Test: `reopening a session keeps sub-agent messages out of the parent transcript (replay path)`.
- Scope: Claude on Windows.
- Expected: the reopened parent transcript excludes subagent-only messages.
- Observed: Claude reconstructs the subagent transcript from `subagents/agent-*.jsonl`, which is not reliably visible on Windows.
- Gate: `subagentReplayUnstableOnWindows: true`.
- Related investigation: [#325284](https://github.com/microsoft/vscode/pull/325284).

### Git-status snapshot ordering

- Test: `inspects git status`.
- Scope: Claude and Codex.
- Expected: the behavior snapshot contains stable semantic tool traffic.
- Observed: customization and changeset notifications occur at nondeterministic points in the snapshot.
- Gate: enabled only for Copilot, subject to shell-platform gates.

### Mid-turn abort is record-only

- Tests:
  - `can abort a running turn`
  - `accepted steering followed by abort does not block the replacement turn`
- Scope: deterministic replay for every provider (`can abort a running turn`);
  Copilot deterministic replay (`accepted steering followed by abort does not block the replacement turn`).
- Reason: replay serves the intentionally truncated response immediately, so there is no real streaming window in which to abort.
- Run:

  ```bash
  AGENT_HOST_REPLAY_RECORD=1 ./scripts/test-integration.sh --run \
    src/vs/platform/agentHost/test/node/e2e/providers/copilotAgentHostE2E.integrationTest.ts \
    --grep "accepted steering followed by abort"
  ```

This is an intentional test-mode limitation, not a suspected product bug.

### Live Codex steering suite is opt-in

The tests in `codexAgentHostLive.integrationTest.ts` require `AGENT_HOST_REAL_CODEX=1` because they exercise live, timing-sensitive Codex behavior that is not represented by deterministic model replay:

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
- Observed: plan mode is wired, but the Copilot-oriented prompt does not reliably cause Claude to invoke the tool.
- Gate: `supportsPlanMode: false`.
- Evaluation goal: make the test prompt provider-neutral or add an equivalent Claude-specific prompt without weakening the plan-mode assertions.

## Expected capability skips

These pending tests do not currently indicate bugs. They are listed by capability rather than by test title: the titles change often, and the gate is what matters.

| Capability | Gate | Provider(s) skipped | Effect |
|---|---|---|---|
| Multiple chats | `supportsMultipleChats` | Codex | All model-backed peer-chat scenarios in `multiChatSuite` skip. The negative test `provider without multiple chat capability rejects peer creation` runs *because* of the gate. Host-owned peer-catalog semantics are unaffected — they moved to the conformance tier and run once regardless of provider. |
| Chat fork (E2E) | `supportsChatForkE2E` | Claude, Codex | `forkProviderTest` scenarios skip. For Claude this is **not** an expected skip — see [Claude provider-context fork](#claude-provider-context-fork). |
| Subagents | `supportsSubagents` | Codex | `subagent tool calls are routed to the subagent session, not flat in the parent`, `reopening a session keeps sub-agent messages out of the parent transcript (replay path)`. |
| Plan mode | `supportsPlanMode` | Codex, Claude | `planning-mode session-state writes are auto-approved in default mode`. For Claude this is a prompt-portability problem — see [Claude plan-mode prompt](#claude-plan-mode-prompt). |
| Host terminal tool | `supportsHostTerminalTool` | Claude, Codex | Worktree isolation is verified via the resolved working directory alone rather than terminal `pwd` output. |
| Worktree isolation | `supportsWorktreeIsolation` | none | Now host-owned; enabled for all providers. |

To find the exact current set for a capability, read the gate in `suites/` rather than trusting a list here.

### Provider package availability

The complete Claude or Codex deterministic suite is skipped when its bundled SDK package is unavailable. This is an environment prerequisite, not a product or test failure. The conformance tier is unaffected: it runs against Copilot, whose CLI is an unconditional dev dependency.

## Review checklist

Periodically:

1. Run the full provider files and the conformance file, not only focused tests, because shared-process failures may depend on suite order.
2. Reevaluate broad gates such as `stableNewScenarioResponse` one test at a time, and check first whether the capture exists.
3. Check whether new provider SDK/CLI versions changed tool selection or completion behavior.
4. Re-record narrowly when wire behavior changed, then review every generated capture.
5. Enable fixed variants and remove stale entries, comments, config flags, and orphaned captures together.
6. Re-read [Structural coverage gaps](#structural-coverage-gaps): those do not surface as skipped tests, so nothing prompts you to revisit them.
