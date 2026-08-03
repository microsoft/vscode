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

The prompt snapshots in `providers/copilotPromptsE2E.integrationTest.ts` are also POSIX-only — every model, by construction rather than because of an observed failure.

- Expected: one committed baseline per model describes the prompt the bundled CLI assembles.
- Observed: the Windows prompt is not a renaming of the POSIX one. Beyond the shell tool names, the CLI runtime carries PowerShell-only sections that POSIX never emits — no-heredoc guidance ("avoid `python - <<'PY'`", use a single-quoted here-string), `; with explicit checks such as `if ($?) { ... }`` for dependent steps, and the caveat that "the PATH/LIB/INCLUDE changes from the .bat will not be available". A fixture handles the name difference by storing a `${shell}` placeholder that `expandShellToolName` swaps back in, but here the prose *is* the asserted artifact — projecting it away would delete the tool instructions the snapshot exists to pin.
- Reproduction: `.\scripts\test-integration.bat --run src\vs\platform\agentHost\test\node\e2e\providers\copilotPromptsE2E.integrationTest.ts`

Closing this needs a second set of Windows baselines, generated and reviewed on a Windows host, keyed by platform — and one PowerShell section is gated on `supportsPowerShell7Syntax`, which the CLI resolves by probing the host, so a Windows baseline is only stable across runners that agree on the installed PowerShell. It is a deliberate gap rather than a pending one: prompt drift from an SDK bump is provider-wide, so the Linux and macOS runners already fail on it, and a Windows baseline would add maintenance without adding signal.

Note that simply keying the snapshot name by platform would be worse than skipping — `assertSnapshot` creates a missing baseline and passes, so Windows CI would go green against a file nobody wrote or reviewed.

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

### Recorded model requests are asserted as a projection

`CapiReplayProxy` matches purely ordinally: the Nth request to a given `(method, path)` replays the Nth recorded response. Ordinal routing is the right choice for *selecting* a response — request bodies carry volatile fields, and matching on them would produce brittle cache misses while desyncing the agent loop.

It used to mean nothing asserted the request at all. The request body is the host's own product — prompt assembly, conversation history retention, truncation, attachment marshalling, and how tool results are handed back to the model — so a regression in any of it replayed green, and was silently promoted to the new expected value the next time somebody re-recorded.

Selection is still ordinal. Separately, every replayed turn now compares the live request against the recorded one through `harness/modelRequestProjection.ts`. The same projection is applied to both sides, so captures keep their existing shape and stay readable.

- **Asserted** (host-authored): message roles and ordering, retained history, whether a system prompt was sent, text and attachment content, tool names and inputs, and `tool_use_id` wiring.
- **Elided** (environment-derived): the `tool_result` payload, run-time identifiers, reasoning blocks, and the model id.

Each elision is load-bearing, and all four were established by running the assertion against the committed captures:

- **Tool result payloads** would re-introduce exactly the platform coupling the portable-command work removed — command output, line endings, and listing formats all differ per OS — and would need a per-tool normalizer layer to hold stable. Presence and wiring are asserted; the text is not.
- **Reasoning blocks** cannot survive the capture round-trip. Aggregating a recorded reply drops them, so the assistant turn replayed back to the agent never carries one even though the original live recording did.
- **Run-time identifiers** are stored as ordinals (`${uuid_0}`) assigned when the fixture was written, which a live run cannot reproduce.
- **Filesystem paths** have too many per-machine spellings to compare literally: separator (`\` vs `/`), drive letter, 8.3 short names, `/var` vs `/private/var`, whether the recorder's `${workdir}` / `${homedir}` substitution matched at all, and whether the value is a file or the workspace directory itself. Two rounds of Windows CI failures came from exactly these, none a real regression. What file an operation actually touched is asserted directly against the filesystem by the tests that care, which is a stronger oracle than the prompt text.
- **The model id** tracks the provider default and the model catalog rather than anything the host composes, so asserting it would break every capture on an unrelated catalog bump. Captures still record it for review.

When this was first switched on it found seven stale captures: four whose prompt text had been edited without re-recording, one that had captured a one-off ordering of two parallel `tool_result` blocks, one Codex capture still holding the pre-pinned `pwd` prompt, and the Claude side-chat capture below. All but the last were re-recorded.

A capture that genuinely cannot be refreshed goes in `STALE_RECORDED_REQUEST_EXCEPTIONS` in `agentHostE2ETestHarness.ts`, which keeps the exceptions countable in one place and requires an entry here.

### Claude side-chat capture cannot be refreshed

- Test: `side chat receives bounded source context without copied history`.
- Scope: Claude.
- Expected: re-recording the capture drives a real side chat and stores the request the host now sends.
- Observed: recording does not reproduce the committed capture, because the side chat is anchored on a source turn and therefore hits the same anchor-resolution defect that gates `supportsChatForkE2E` — the side chat falls back to an injected `<side-chat-context>` preamble instead of a provider fork. See [Claude provider-context fork](#claude-provider-context-fork).
- Consequence: the committed capture predates the host's `<side-chat-context>` preamble, so its recorded request no longer matches the live one. The test still replays correctly — only the request comparison is disabled, via `STALE_RECORDED_REQUEST_EXCEPTIONS`.
- Reproduce:

  ```bash
  AGENT_HOST_UPDATE_SNAPSHOTS=1 ./scripts/test-integration.sh --run \
    src/vs/platform/agentHost/test/node/e2e/providers/claudeAgentHostE2E.integrationTest.ts \
    --grep "side chat receives bounded source context"
  ```

  Remove the entry from `STALE_RECORDED_REQUEST_EXCEPTIONS` and re-record once the fork defect is fixed.

## Suspected product bugs

### Claude provider-context fork

- Tests:
  - `forked peer chat inherits source history through the provider`
  - `unknown-turn fork does not inherit source provider context`
- Scope: Claude.
- Expected: Claude advertises multi-chat fork support, and a provider-backed fork can continue from the requested source history.
- Observed: the fork **silently produces a chat with no provider context**. The forked chat's AHP state looks correct — the source turn is seeded into its transcript — but the model request carries no prior history, so the model cannot answer questions about the source conversation. No error reaches the client.

  Verified against the live SDK by enabling the gate and recording. Of the four assertions, only the AHP-level one passes:

  ```
  seededMessages:                  ok   (source turn present in the forked chat)
  requestHasPriorUserMessage:      FAIL (model request has no source user turn)
  requestHasPriorAssistantMessage: FAIL (model request has no source reply)
  responseHasCodeWord:             FAIL (model cannot recall the source code word)
  ```

  The same test passes for Copilot, whose capture shows the full inherited history, so this is provider-specific rather than a fault in the test or the shared fork contract.

  Root cause: `resolveForkAnchorUuid` (`claudeReplayMapper.ts`) matches the requested turn id against **Claude SDK envelope uuids**, so it only resolves when the AHP turn id happens to *be* an SDK uuid. AHP lets a client choose its own turn id on dispatch — Copilot honors that — and for such an id the anchor never resolves:

  ```
  resolveForkAnchorUuid(messages, 'u1')          -> 'a1'        (SDK uuid, resolves)
  resolveForkAnchorUuid(messages, 'fork-source') -> undefined   (client turn id, never resolves)
  ```

  `_forkChat` then logs a warning and returns `undefined`, and `createChat` continues with a fresh chat. The degradation is invisible to the client, which is the part that makes this a defect rather than a limitation: a required contract fails silently instead of surfacing a typed error.

  The earlier description of this entry — that the fork "rejects the AHP turn id as an invalid `upToMessageId`" — was inaccurate. That string comes from a unit-test stub and the SDK; the E2E fork path never reaches `forkSession` at all.

- Note: `unknown-turn fork does not inherit source provider context` asserts the *correct* behavior for an unresolvable anchor and shares this gate only because both are `forkProviderTest`s. It is expected to pass once the resolvable case works.
- Gate: `supportsChatForkE2E: false`.
- Issue: [#328104](https://github.com/microsoft/vscode/issues/328104).
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

### Codex has no file tools

- Scope: Codex.
- Gate: `supportsFileTools: false` in the Codex provider config.

Codex exposes a single tool, `exec_command`. Every committed `captures/codex-*.yaml` confirms it: the only tool name that appears is `exec_command`, where Claude's captures contain `Read`, `Write` and `Bash`.

The shared file-operation scenarios steer the agent away from the shell (`Use your file tools; do not run a shell command.`) so that their captures stay platform-neutral. Codex cannot satisfy that instruction and does not fall back — it refuses, in its own words:

```
I can't access file contents without using a shell command in this environment,
and you asked me not to run one.
```

`counts lines in a file` shows the sharper version of the same failure: Codex flails and answers `3` for a four-line file rather than refusing outright.

This is a provider capability difference, not a bug to be fixed by re-recording. Making these scenarios run against Codex means giving them a provider-specific prompt that pins a portable shell command instead of steering to file tools — the "pin, don't steer" half of [Steering versus pinning](#steering-versus-pinning). That is worth doing and is the actionable next step here.

Reproduce by temporarily enabling `supportsFileTools` for Codex and recording one scenario:

```bash
AGENT_HOST_UPDATE_SNAPSHOTS=1 ./scripts/test-integration.sh --run \
  src/vs/platform/agentHost/test/node/e2e/providers/codexAgentHostE2E.integrationTest.ts \
  --grep "reads a file from a nested directory"
```

Recording is required rather than incidental: these scenarios have no Codex capture, so plain replay stops at fixture resolution and never reaches the provider. **Note that this rewrites captures and AHP snapshots**, so `git checkout` the artifacts afterwards unless the new recording is the intended result. The failure appears in the run output — Codex says it cannot read a file without a shell — rather than in the artifacts.

### Codex file scenarios are unstable on a shared server

- Scope: Codex.
- Gate: `stableSharedServerFileScenarios: false`.

Separate from the capability gap above, and tracked separately because the two need different work. The file-operation scenarios that pin a portable shell command need no file tools, so Codex can run them — but it performs each through `exec_command`, and several such turns on one long-lived server do not replay stably: the tool-call completion is reported inconsistently, and **the failing scenario moves between runs**.

That signature is the [shared-server load ceiling](./README.md#server-lifecycle), not a fault in any single test; each replays cleanly in isolation via `--grep`. Enabling the family naively turns a green suite into one that fails roughly one run in four, so it needs the lifecycle understood first.

## Platform and deterministic-replay limitations

### Windows shell and filesystem behavior

Most of this section is resolved — see [What is still Windows-scoped, and why](#what-is-still-windows-scoped-and-why). Thirteen tests that were disabled on Windows because their capture contained a POSIX-only command now run there.

One row remains, and it is not about command portability:

| Test | Disabled scope | Observed limitation |
|---|---|---|
| `a bang command runs locally and exposes terminal output` | Windows | The successful bang command produces output but does not complete reliably. |
| `resource watch reports changes on its subscribed channel` | Windows | The subscribed filesystem watch does not emit `resourceWatch/changed` after a protocol `resourceWrite` within the test timeout. Descriptor, missing-root, and resource mutation coverage remain enabled. |
| ``strips redundant `cd <workingDirectory> &&` prefix from shell tool calls`` | Copilot on Windows | The turn completes, but `chat/toolCallReady` omits the `toolInput` needed to assert that the prefix was removed. |

Copilot's ordinary provider shell also omits `ToolResultTerminalContent.result.preview`
on Windows, while its terminal-shaped resource is not backed by the host terminal
manager and cannot be subscribed. These tests are skipped for Copilot on Windows
because their direct output oracle would otherwise be empty:

- `lists workspace entries`
- `runs a deterministic shell command`
- `inspects git status`

Use the affected provider command with `--grep "<exact test title>"` and temporarily remove the platform gate to reevaluate a row.

### Codex shell-tool replay on Linux

- Scope: Codex on Linux in deterministic replay.
- Gate: `shellToolReplayUnstableOnLinux: true`.
- Tests directly affected by this gate:
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
- Expected: the client-dispatched `chat/turnCancelled` action cancels the active provider turn, clears active/input-needed state, and allows a replacement turn to complete.
- Run:

  ```bash
  AGENT_HOST_REPLAY_RECORD=1 ./scripts/test-integration.sh --run \
    src/vs/platform/agentHost/test/node/e2e/providers/copilotAgentHostE2E.integrationTest.ts \
    --grep "can abort a running turn"

  AGENT_HOST_REPLAY_RECORD=1 ./scripts/test-integration.sh --run \
    src/vs/platform/agentHost/test/node/e2e/providers/copilotAgentHostE2E.integrationTest.ts \
    --grep "accepted steering followed by abort"
  ```

This is an intentional test-mode limitation, not a suspected product bug.

### Live Codex steering suite is opt-in

The tests in `codexAgentHostLive.integrationTest.ts` require `AGENT_HOST_REAL_CODEX=1` because they exercise live, timing-sensitive Codex behavior that is not represented by deterministic model replay:

- `mid-turn steering clears pending state without getting stuck`
- `client tool is registered and invoked end-to-end`
- `client tool registered after session creation is still invoked`
- `server tool (listComments) is registered and executed in-process`
- `file-change approval is surfaced and can be approved`
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

### A test that only asserts its last dispatch cannot see a lost one

Most state-operation tests dispatch two or three actions and then assert the
result of the **last** one. That shape is blind to an action that is echoed but
never applied, because the final read still shows the expected value.

The first test written here that asserted a *cumulative* result across two
dispatches immediately exposed behavior nobody had written down: a message
queued onto an idle chat is not parked in `queuedMessages` at all, it is
promoted straight into a turn (`_tryConsumeNextQueuedMessage`), so the queue is
empty again by the time the next action is reduced. The envelope for the
dispatch looked completely normal — correct `serverSeq`, no `rejectionReason` —
so nothing short of asserting the accumulated state would have caught it.

When adding state-operation tests, prefer at least one assertion over the state
that several actions built up together, not only over the last write.

## Expected capability skips

These pending tests do not currently indicate bugs. They are listed by capability rather than by test title: the titles change often, and the gate is what matters.

| Capability | Gate | Provider(s) skipped | Effect |
|---|---|---|---|
| Multiple chats | `supportsMultipleChats` | Codex | All model-backed peer-chat scenarios in `multiChatSuite` skip. The negative test `provider without multiple chat capability rejects peer creation` runs *because* of the gate. Host-owned peer-catalog semantics are unaffected — they moved to the conformance tier and run once regardless of provider. |
| Chat fork (E2E) | `supportsChatForkE2E` | Claude, Codex | `forkProviderTest` scenarios skip. For Claude this is **not** an expected skip — see [Claude provider-context fork](#claude-provider-context-fork). |
| Subagents | `supportsSubagents` | Codex | `subagent tool calls are routed to the subagent session, not flat in the parent`, `reopening a session keeps sub-agent messages out of the parent transcript (replay path)`. |
| File tools | `supportsFileTools` | Codex | The `fileOperationsSuite` scenarios whose prompt steers to file tools. See [Codex has no file tools](#codex-has-no-file-tools). |
| Shared-server file scenarios | `stableSharedServerFileScenarios` | Codex | The `fileOperationsSuite` scenarios that pin a shell command. See [Codex file scenarios are unstable on a shared server](#codex-file-scenarios-are-unstable-on-a-shared-server). |
| Plan mode | `supportsPlanMode` | Codex, Claude | `planning-mode session-state writes are auto-approved in default mode`. For Claude this is a prompt-portability problem — see [Claude plan-mode prompt](#claude-plan-mode-prompt). |
| Host terminal tool | `supportsHostTerminalTool` | Claude, Codex | Worktree isolation is verified via the resolved working directory alone rather than terminal `pwd` output. |
| Worktree isolation | `supportsWorktreeIsolation` | none | Now host-owned; enabled for all providers. |

To find the exact current set for a capability, read the gate in `suites/` rather than trusting a list here.

### Provider package availability

The complete Claude or Codex deterministic suite is skipped when its bundled SDK package is unavailable. This is an environment prerequisite, not a product or test failure. The conformance tier is unaffected: it runs against Copilot, whose CLI is an unconditional dev dependency.

## Review checklist

Periodically:

1. Run the full provider files and the conformance file, not only focused tests, because shared-process failures may depend on suite order.
2. Reevaluate broad gates such as `supportsFileTools` one test at a time, and check first whether the capture exists. A gate that covers more than one distinct cause hides all but the loudest of them: prefer splitting it over flipping it.
3. Check whether new provider SDK/CLI versions changed tool selection or completion behavior.
4. Re-record narrowly when wire behavior changed, then review every generated capture.
5. Enable fixed variants and remove stale entries, comments, config flags, and orphaned captures together.
6. Re-read [Structural coverage gaps](#structural-coverage-gaps): those do not surface as skipped tests, so nothing prompts you to revisit them.
