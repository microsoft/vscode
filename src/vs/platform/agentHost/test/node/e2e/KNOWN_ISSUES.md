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

### What is still Windows-scoped

The blanket `!isWindows` shell exclusion is gone: `portableShellToolReplayEnabled` now only reflects the provider's shell-tool replay stability on Linux. Permission approval, file operations, renames, deletes, directory creation, git status, and git-backed config completions all run on Windows.

Two tests remain scoped, both at their call site with the reason:

- `a bang command runs locally and exposes terminal output` — the successful bang command produces output but does not complete reliably. Not a portability problem.
- `worktree session uses the resolved worktree as working directory` — its shell half was enabled and then reverted after Windows CI failed it for two reasons unrelated to command portability, described below. Its non-shell half still asserts worktree resolution on Windows.

### Path shape differs between the test and the shell

The E2E workspaces come from `os.tmpdir()`, and what that returns is not what a process running inside it reports as its working directory:

| Platform | `os.tmpdir()` | working directory as reported |
|---|---|---|
| Windows CI | `C:\Users\CLOUDT~1\AppData\Local\Temp\…` (8.3 short form) | `C:\Users\cloudtest\AppData\Local\Temp\…` |
| macOS | `/var/folders/…` (logical) | `/private/var/folders/…` (physical) |

Any assertion that a command's output *contains* a path built from `tmpdir()` is therefore comparing two different spellings of the same directory. `normalizeSnapshotText` already strips `/private` for the macOS case, but a test asserting directly on tool output — rather than through a snapshot — has no such help.

This is why `worktree session uses the resolved worktree as working directory` fails on Windows CI: the assertion never matches, and the test times out waiting for output that will never arrive in the expected form. Reworking it means resolving both sides with `realpathSync.native` before comparing, which also removes the macOS special case.

### The host terminal tool surfaces no content on Windows

The same test's Copilot branch waits for a `chat/toolCallContentChanged` carrying a terminal resource. On Windows CI that notification never arrives, even though `chat/toolCallStart`, `chat/toolCallReady`, the confirmation round-trip, and `chat/toolCallComplete` all do.

So the tool call runs to completion but the host-managed terminal never publishes streaming content. Whether that is a product gap or a configuration difference in the test is not yet established — it needs a Windows machine to investigate, and it is the blocker for asserting terminal `cwd` on Windows at all.

### Steering versus pinning

Two techniques, and the choice is not stylistic:

- **Steer** (`Use your file tools; do not run a shell command.`) where a file tool exists for the operation. Reads, edits, missing-file handling, and content creation all took the hint, and the resulting capture contains no shell command at all — the strongest possible outcome, since there is nothing left to be platform-specific.
- **Pin** (`Run exactly this shell command, with no modifications: …`) where no file tool exists. Rename, delete, directory creation, and listing have no file-tool equivalent, so every provider reaches for the shell and picks a POSIX command. Steering these harder made one provider skip the operation entirely rather than use a different tool.

Pinning uses `node -e "…"`, which is guaranteed present because the suite runs under Node, and whose `"…"` / `'…'` quoting is read identically by `cmd` and POSIX shells. Prefer relative paths in a pinned command so no Windows path with backslashes has to be escaped into a JavaScript string literal.

The trade-off is real: a pinned command tests shell execution rather than the provider's tool selection. Pin only when steering has actually been tried and failed, and note which it was.

### Approve tool calls in a loop, not once

Providers auto-approve a small set of safe read-only commands (`pwd` among them). A pinned `node -e "…"` is not on that list, so pinning a command generally *adds* an approval round-trip that the previous command did not need.

That is fine — the approval flow is a normal part of the protocol and every shared helper already drives it. `driveTurnToCompletion` confirms each unconfirmed `chat/toolCallReady` as it arrives, and `startBackgroundApprovalLoop` does the same for tests that drive turns by hand. Both are loops.

What does not work is approving once. A turn can raise more than one approval, so a single `waitForNotification` for `chat/toolCallReady` followed by one `ChatToolCallConfirmed` leaves any later request pending; the turn then stalls on `session/inputNeededSet` until the test times out. The failure looks like a hang, not a permission problem, which makes it easy to misread as the pinned command being unsupported.

`worktree session uses the resolved worktree as working directory` had exactly this shape: its host-terminal branch approved once while its SDK-shell branch used `startBackgroundApprovalLoop`. Both branches now use the loop, and the command is pinned like everywhere else.

Prefer steering to a file tool where one exists — that avoids the approval surface entirely. Where a shell command is genuinely required, pin it and drive approvals with one of the shared loops.

### Temporary git repositories on Windows

Two independent things made a temp directory containing a git repository undeletable on Windows, which failed suite teardown even when every test passed:

- Git marks the files under `.git/objects` read-only, and a read-only file cannot be deleted on Windows. `rmSync`'s `force` option only suppresses `ENOENT` — it does not override the attribute — so the retry loop burned its full timeout on a condition that waiting can never fix. `removeTempDirs` now clears read-only attributes before each retry.
- An auto-triggered `git gc` can still hold handles under `.git` after the test finishes. `initTestGitRepo` sets `gc.auto 0`; these repositories never create enough objects to need it.

`session configuration resolves and completes git branches` was disabled on Windows for this reason and is now enabled. Its assertions were always platform-independent — only teardown failed.

### Recording rejects POSIX-only commands

`CapiReplayProxy` checks the assistant's `tool_use` commands before writing a fixture and fails the recording if any of them are not portable to the suite's Windows shell configurations. It throws before the write, so a rejected recording cannot leave a half-portable capture behind.

This exists because the failure mode is silent and recurring: nobody chooses these command strings, the model produces them, so a prompt that drifts back toward describing the goal will quietly reintroduce a POSIX-only capture. Checking at record time puts the error on the author's machine while they still have the context, rather than on a CI leg they may not run.

The check is a blocklist of constructs known not to replay reliably in the suite's effective Windows shells — coreutils and shell builtins in command position, POSIX stderr redirection, `/dev/*`, `$VAR` expansion, `~/`. It is deliberately not an allowlist of portable commands: a false positive would block a correct recording and push authors toward disabling the check, which is worse than missing a case. Patterns are anchored to command position so a coreutil name appearing as an argument (`node -e "readdirSync('.')"`) does not trip it. `pwd` is allowed because the host-managed terminal uses PowerShell on Windows, where it aliases `Get-Location`.

Genuine exceptions go in `POSIX_COMMAND_EXCEPTIONS` in `agentHostE2ETestHarness.ts`, which keeps them countable in one place. An entry there must correspond to a test that is also scoped away from Windows at its call site, with the reason stated there.

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

Most of this section is resolved — see [What is still Windows-scoped, and why](#what-is-still-windows-scoped-and-why). Thirteen tests that were disabled on Windows because their capture contained a POSIX-only command now run there.

One row remains, and it is not about command portability:

| Test | Disabled scope | Observed limitation |
|---|---|---|
| `a bang command runs locally and exposes terminal output` | Windows | The successful bang command produces output but does not complete reliably. |

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
