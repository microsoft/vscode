# Disabled and conditional E2E tests

Current inventory of bundled-provider E2E tests disabled for at least one provider, platform, or execution mode. The test is the executable specification; this file records only active gaps. See the [README](./README.md) for test-authoring and troubleshooting guidance.

## Process

When a valid E2E scenario exposes a gap:

1. Minimize it and identify the affected provider, platform, and mode.
2. Keep the test, but gate only the affected variant.
3. For a suspected product bug, first explain in complete sentences what the user is trying to do, what fails, and how that failure is likely to affect the user. Define feature-specific terms instead of assuming that the test title or an implementation detail such as "full context" is self-explanatory.
4. After the user-facing explanation, record the exact test title, scope, expected and observed behavior, gate, and focused reproduction.
5. Record symptoms, not unverified root-cause hypotheses.
6. Keep generated captures for variants expected to run again; never hand-edit them.
7. Remove the gate, entry, stale comments, and orphaned artifacts together when the gap closes.

Capability skips are tracked separately from suspected bugs. A provider that does not advertise a capability is expected to skip positive-path tests for that capability.

### Duplicate session creation is accepted

A client can retry session creation with a URI that already identifies a live session. The host accepts the duplicate request instead of reporting that the resource already exists, so clients cannot distinguish an idempotent retry from an accidental collision and a provider may be asked to create conflicting backing state.

- Test: `creating a duplicate session resource is rejected`.
- Scope: conformance reference provider on all platforms.
- Expected: the second AHP `createSession` request fails with `SessionAlreadyExists`.
- Observed: the second request resolves successfully.
- Gate: the scenario requires `AGENT_HOST_RUN_KNOWN_ISSUES=1`.
- Reproduce:

  ```bash
  AGENT_HOST_RUN_KNOWN_ISSUES=1 ./scripts/test-integration.sh --run \
    src/vs/platform/agentHost/test/node/e2e/conformance/agentHostConformance.integrationTest.ts \
    --grep "creating a duplicate session resource is rejected"
  ```

### Deleting a worktree session can race background Git work

A user can configure ignored files to be copied into an isolated worktree, complete an agent turn, and then delete the session. Session deletion can fail because background changeset or Git-state work is still using the worktree while Git removes it, leaving the session's worktree behind.

- Test: `worktree materialization copies configured ignored files`.
- Scope: providers with deterministic worktree include-file coverage.
- Expected: deleting the completed session stops all work associated with it and removes its isolated worktree.
- Observed: teardown can fail with `git worktree exited with code 255: error: failed to delete '.git/worktrees/<name>': Directory not empty`.
- Gate: the scenario requires `AGENT_HOST_RUN_KNOWN_ISSUES=1`.
- Reproduce:

  ```bash
  AGENT_HOST_RUN_KNOWN_ISSUES=1 AGENT_HOST_UPDATE_SNAPSHOTS=1 ./scripts/test-integration.sh --run \
    src/vs/platform/agentHost/test/node/e2e/providers/claudeAgentHostE2E.integrationTest.ts \
    --grep "worktree materialization copies configured ignored files"
  ```

### Client plugin skill is missing from Copilot slash completions

A user can add a skill through a client-pushed plugin and invoke it by name in a Copilot session. The skill works when named explicitly, but it is absent from slash completions, so users cannot discover or select it through completion UI.

- Tests:
  - `plugin skill is included in leading slash completions`
  - `plugin skill is included in whitespace slash completions without runtime commands`
- Scope: Copilot client-pushed plugins.
- Expected: the AHP `completions` command returns the enabled plugin skill for both a leading slash token and a whitespace-delimited slash token.
- Observed: the completions response contains no item for the enabled `probe-skill`, including when the plugin has the canonical space-free name `e2e-probe`. An explicit model-driven invocation of the same skill succeeds.
- Gate: both variants require `AGENT_HOST_RUN_KNOWN_ISSUES=1`.
- Reproduce:

  ```bash
  AGENT_HOST_RUN_KNOWN_ISSUES=1 AGENT_HOST_UPDATE_SNAPSHOTS=1 ./scripts/test-integration.sh --run \
    src/vs/platform/agentHost/test/node/e2e/providers/copilotAgentHostE2E.integrationTest.ts \
    --grep "plugin skill is included"
  ```

### Asynchronous Copilot shell lifecycles are record-only

A user can start a shell command in the background, inspect or list the running shell, and stop it. The lifecycle works live, but deterministic replay cannot preserve whether the command-completion system notification reaches the model before its next request, so the captured request history changes with process timing.

- Tests:
  - `managed shell can be read and stopped after asynchronous execution`
  - `managed shell sessions can be listed after asynchronous execution`
  - `custom terminal tool manages an asynchronous shell lifecycle`
- Scope: Copilot deterministic replay.
- Expected: the same fixture replays whether the short-lived background command completes just before or just after the model's next request.
- Observed: focused replay can include the completion system notification while a broad shared-process run omits it, causing strict model-request mismatches.
- Gate: the scenarios run only when `AGENT_HOST_REPLAY_RECORD=1` through `context.runRecordOnlyTests`.
- Reproduce:

  ```bash
  AGENT_HOST_REPLAY_RECORD=1 ./scripts/test-integration.sh --run \
    src/vs/platform/agentHost/test/node/e2e/providers/copilotAgentHostE2E.integrationTest.ts \
    --grep "managed shell|custom terminal tool manages"
  ```

### Copilot deferred tool search cannot be replayed

A Copilot session can defer client-provided tools, search for the relevant tool on demand, and then execute the selected tool. The live workflow succeeds, but the recorded Responses fixture loses the hosted tool-search output that triggers the AHP client-tool exchange, so replay ends the turn before either tool appears.

- Tests:
  - `tool search exposes deferred client tools and executes the selected result`
  - `tool search tolerates a malformed client result without activating a deferred tool`
- Scope: Copilot deterministic replay with `gpt-5.6-sol`.
- Expected: replay regenerates the hosted tool-search output and reaches the same `toolSearch` AHP lifecycle as recording.
- Observed: recording observes `toolSearch` and the deferred tool, while the normalized fixture stores the first response as empty content; replay therefore completes without either tool call.
- Gate: both scenarios run only when `AGENT_HOST_REPLAY_RECORD=1` through `context.runRecordOnlyTests`.
- Reproduce:

  ```bash
  AGENT_HOST_REPLAY_RECORD=1 ./scripts/test-integration.sh --run \
    src/vs/platform/agentHost/test/node/e2e/providers/copilotAgentHostE2E.integrationTest.ts \
    --grep "tool search"
  ```

### Copilot config slash commands are missing from completions

A user can type Copilot configuration commands such as `/autopilot` to change the session mode. The commands work when sent directly, but the AHP completions response does not include their state-aware forms, so users cannot discover `/autopilot on` before entering autopilot mode or `/autopilot off` after entering it.

- Test: `config slash completions reflect the current Copilot session mode`.
- Scope: Copilot.
- Expected: completions include `/autopilot ` and the state-changing `on` or `off` form based on the current session mode.
- Observed: the completions response contains no `/autopilot` items before or after changing the session mode, although sending `/goal <prompt>` directly changes the mode to `plan` and forwards the prompt successfully.
- Gate: the scenario requires `AGENT_HOST_RUN_KNOWN_ISSUES=1`.
- Reproduce:

  ```bash
  AGENT_HOST_RUN_KNOWN_ISSUES=1 AGENT_HOST_UPDATE_SNAPSHOTS=1 ./scripts/test-integration.sh --run \
    src/vs/platform/agentHost/test/node/e2e/providers/copilotAgentHostE2E.integrationTest.ts \
    --grep "config slash completions"
  ```

### Copilot shell and plugin-skill tool rows disappear after a host restart

A user can reopen a Copilot session after restarting Agent Host and expects the completed transcript to retain its tool rows. Ordinary edit tool history is restored, but completed shell and plugin-skill lifecycles disappear entirely, so reopened conversations lose important evidence of what the agent did.

- Tests:
  - `shell failure metadata is reconstructed after a host restart`
  - `plugin skill lifecycle is reconstructed after a host restart`
- Scope: Copilot.
- Expected: restored turns retain the completed shell tool call and both the skill and nested MCP tool calls that were visible before restart.
- Observed: the source turn remains, but its restored `responseParts` contain no matching tool calls. A control using an ordinary edit tool retains its tool row across the same restart flow.
- Gate: both scenarios require `AGENT_HOST_RUN_KNOWN_ISSUES=1`.
- Reproduce:

  ```bash
  AGENT_HOST_RUN_KNOWN_ISSUES=1 AGENT_HOST_UPDATE_SNAPSHOTS=1 ./scripts/test-integration.sh --run \
    src/vs/platform/agentHost/test/node/e2e/providers/copilotAgentHostE2E.integrationTest.ts \
    --grep "shell failure metadata|plugin skill lifecycle is reconstructed"
  ```

### Copilot provider sessions can disappear across a Windows host restart

A user can restart Agent Host and reopen a Copilot session with a persisted conversation or peer chat. On Windows, the provider session can no longer be found after restart, so the host cannot reconstruct the conversation, tool rows, or peer-chat catalog.

- Tests:
  - `tool-rich provider history is reconstructed after a host restart`
  - `peer chat catalog and transcript survive a host restart`
- Scope: Copilot on Windows.
- Expected: restarting Agent Host preserves the provider session and restores the completed edit tool call or peer-chat catalog and transcript.
- Observed: reopening fails with `Session not found on backend`, although the same deterministic replay passes on macOS and Linux.
- Gate: the Windows variants are skipped at their declarations in `copilotCoverageSuite.ts` and `sessionPersistenceSuite.ts`.
- Reproduce on Windows:

  ```powershell
  $env:AGENT_HOST_RUN_KNOWN_ISSUES = '1'
  $env:AGENT_HOST_UPDATE_SNAPSHOTS = '1'
  .\scripts\test-integration.bat --run `
    src\vs\platform\agentHost\test\node\e2e\providers\copilotAgentHostE2E.integrationTest.ts `
    --grep "tool-rich provider history|peer chat catalog"
  ```

### Persisted Copilot request errors are restored as cancelled on Windows

A user can restart Agent Host after a Copilot request fails and expects the reopened turn to retain its error state and diagnostic details. On Windows, the reopened turn is instead marked cancelled with no error, hiding why the request failed.

- Test: `request error survives a host restart`.
- Scope: Copilot on Windows.
- Expected: the reopened turn remains in the error state and contains the same request error published before restart.
- Observed: the reopened turn has state `cancelled` and no error, although the same deterministic replay passes on macOS and Linux.
- Gate: the Windows variant is skipped at the test declaration in `copilotAgentHostE2E.integrationTest.ts`.
- Reproduce on Windows:

  ```powershell
  .\scripts\test-integration.bat --run `
    src\vs\platform\agentHost\test\node\e2e\providers\copilotAgentHostE2E.integrationTest.ts `
    --grep "request error survives a host restart"
  ```

### Changeset discard state does not refresh on Windows

A user can discard changed files from a session. On Windows, the discard restores the requested files on disk but affected changesets and session summaries do not refresh, leaving the UI stale.

- Tests:
  - `discarding one file preserves sibling changes`
  - `discarding the last tracked change clears changeset and list summaries`
- Scope: Agent Host conformance on Windows.
- Expected: discarding one file removes it from the changeset while preserving siblings; discarding the final change clears branch and uncommitted changesets plus the session-list summary.
- Observed: the discard operation completes, but the discarded entries and aggregate summary remain unchanged after the synchronization retry expires.
- Gate: both Windows variants are disabled through `conformanceTest` platform conditions in `changesetSuite.ts`.
- Reproduce on Windows:

  ```powershell
  .\scripts\test-integration.bat --run `
    src\vs\platform\agentHost\test\node\e2e\conformance\agentHostConformance.integrationTest.ts `
    --grep "discarding one file preserves sibling changes|discarding the last tracked change"
  ```

### Copilot workspaceless scratch directories survive session disposal on Windows

A user can create a Copilot session without selecting a workspace, which makes the provider allocate a temporary scratch directory. Disposing that session on Windows leaves the directory behind, leaking temporary files and disk space.

- Test: `workspaceless session uses and cleans up a provider scratch directory`.
- Scope: Copilot on Windows.
- Expected: disposing the session removes its provider scratch directory.
- Observed: the scratch directory still exists after the disposal command completes and the cleanup retry expires.
- Gate: the Windows variant is skipped at the test declaration in `copilotCoverageSuite.ts`.
- Reproduce on Windows:

  ```powershell
  .\scripts\test-integration.bat --run `
    src\vs\platform\agentHost\test\node\e2e\providers\copilotAgentHostE2E.integrationTest.ts `
    --grep "workspaceless session uses and cleans up"
  ```

### Copilot custom-terminal command metadata is incomplete on Windows

A user can run a failing command through Copilot's custom terminal tool and expects the terminal transcript to report that the command completed with its real exit code. On Windows, command detection is enabled but the matching command entry has neither completion state nor an exit code.

- Test: `custom terminal tool preserves a nonzero shell exit code`.
- Scope: Copilot custom terminal tool on Windows.
- Expected: the terminal command is complete and reports exit code `9`.
- Observed: the terminal resource exists and supports command detection, but the command entry cannot be found, so completion and exit-code metadata are absent.
- Gate: the Windows variant is skipped at the test declaration in `copilotCoverageSuite.ts`.
- Reproduce on Windows:

  ```powershell
  .\scripts\test-integration.bat --run `
    src\vs\platform\agentHost\test\node\e2e\providers\copilotAgentHostE2E.integrationTest.ts `
    --grep "custom terminal tool preserves a nonzero"
  ```

### Copilot client-plugin hooks do not execute on Windows

A user can contribute lifecycle hooks through a client-pushed Copilot plugin to observe session creation, submitted prompts, tool calls, results, and session disposal. On Windows, the plugin's skill and MCP server work, but none of its hook commands write their expected output, so hook-driven automation never runs.

- Tests:
  - `plugin SessionStart hook runs when the provider materializes`
  - `plugin UserPromptSubmit hook receives the submitted prompt`
  - `plugin PreToolUse hook runs before an MCP tool`
  - `plugin PostToolUse hook runs after an MCP tool result`
  - `plugin SessionEnd hook runs when the session is disposed`
  - `failing plugin hook is non-fatal to the provider turn`
  - `non-JSON plugin hook output is ignored without failing the provider turn`
- Scope: Copilot client-pushed plugins on Windows.
- Expected: each configured hook executes and writes its event payload; failure and non-JSON variants remain non-fatal to the provider turn.
- Observed: each scenario completes its provider turn, but the expected hook log is never created or updated.
- Gate: all seven Windows variants use the platform-scoped `pluginHookTest` registration in `mcpPluginSuite.ts`.
- Reproduce on Windows:

  ```powershell
  .\scripts\test-integration.bat --run `
    src\vs\platform\agentHost\test\node\e2e\providers\copilotAgentHostE2E.integrationTest.ts `
    --grep "plugin .* hook|failing plugin hook|non-JSON plugin hook"
  ```

### File-tool denial mutates the workspace during Linux replay

- Test: `declining a file creation tool prevents the mutation and completes the turn`.
- Scope: Claude and Copilot on Linux.
- Expected: declining the `Write` tool prevents `denied.txt` from being created and the replayed turn completes.
- Observed: the turn completes, but `denied.txt` exists on Linux. For Copilot, the host auto-approves the in-workspace write before the synthetic denial reaches the permission request; both providers pass on macOS.
- Gate: the Claude and Copilot variants are disabled on Linux through `fileToolDenialReplayUnstableOnLinux`.
- Reproduce on Linux:

  ```bash
  ./scripts/test-integration.sh --run \
    src/vs/platform/agentHost/test/node/e2e/providers/{claude,copilot}AgentHostE2E.integrationTest.ts \
    --grep "declining a file creation tool"
  ```

### Client-pushed plugin MCP coverage is provider-scoped

- Tests: the `client plugin …` and `plugin MCP …` scenarios in `mcpPluginSuite.ts`.
- Scope: Claude and Codex.
- Expected: providers that consume client-pushed plugin customizations expose the parsed plugin and can execute its MCP tools through deterministic replay.
- Observed:
  - Claude does not publish the client-pushed plugin through this customization path; its native customization discovery uses separate `.claude` roots.
  - Codex publishes the plugin catalog, but its model-backed recording path is unavailable in this harness because live Responses requests fail before the model turn with a malformed authorization-header response.
- Gate: the suite excludes Claude; Codex runs host-only catalog/toggle coverage while model-backed MCP scenarios run only for Copilot.
- Reproduce:

  ```bash
  ./scripts/test-integration.sh --run \
    src/vs/platform/agentHost/test/node/e2e/providers/claudeAgentHostE2E.integrationTest.ts \
    --grep "client plugin exposes"
  ```

  ```bash
  AGENT_HOST_REPLAY_RECORD=1 ./scripts/test-integration.sh --run \
    src/vs/platform/agentHost/test/node/e2e/providers/codexAgentHostE2E.integrationTest.ts \
    --grep "plugin MCP tool executes"
  ```

### Claude paused-turn cancellation is not replay-stable

- Tests:
  - `cancelling a turn paused for input allows a replacement turn`
  - `cancelling a turn paused for file-tool approval allows a replacement turn`
- Scope: Claude replay.
- Expected: cancelling while the turn waits for input or tool approval ends that turn and allows a fresh replacement turn to complete.
- Observed: replay either continues the cancelled input turn's response or reports a chat error before the replacement can complete.
- Gate: `supportsPausedTurnCancellationE2E` is enabled only for Copilot.
- Reproduce:

  ```bash
  ./scripts/test-integration.sh --run \
    src/vs/platform/agentHost/test/node/e2e/providers/claudeAgentHostE2E.integrationTest.ts \
    --grep "cancelling a turn paused"
  ```

### Codex retains a client plugin after the active client is removed

- Test: `removing the active client removes its plugin customization`.
- Scope: Codex.
- Expected: `session/activeClientRemoved` removes the departing client's plugin from the session customization catalog.
- Observed: the active client is removed but the plugin customization remains in session state.
- Gate: the Codex variant is disabled at the `providerHostOnlyTest` declaration in `mcpPluginSuite.ts`.
- Reproduce:

  ```bash
  ./scripts/test-integration.sh --run \
    src/vs/platform/agentHost/test/node/e2e/providers/codexAgentHostE2E.integrationTest.ts \
    --grep "removing the active client removes its plugin customization"
  ```

### Claude truncation does not produce a replay-stable follow-up request

- Test: `truncating a materialized chat removes later context and allows continuation`.
- Scope: Claude.
- Expected: after `chat/truncated` removes the second turn, the follow-up model request contains the first turn and follow-up only.
- Observed: live recording sends the expected pruned request, while replay rebuilds the follow-up request with the removed second turn still present.
- Gate: `supportsTruncateE2E` is enabled only for Copilot.
- Reproduce:

  ```bash
  AGENT_HOST_REPLAY_RECORD=1 ./scripts/test-integration.sh --run \
    src/vs/platform/agentHost/test/node/e2e/providers/claudeAgentHostE2E.integrationTest.ts \
    --grep "truncating a materialized chat"
  ```

## Structural coverage gaps

Distinct from individually disabled tests: whole areas where a platform or contract has no E2E coverage at all. These do not show up as skipped tests, so they are easy to miss.

### What is still Windows-scoped

The blanket `!isWindows` shell exclusion is gone: `portableShellToolReplayEnabled` now only reflects the provider's shell-tool replay stability on Linux. Permission approval, file operations, renames, deletes, directory creation, git status, and git-backed config completions all run on Windows.

The following tests remain scoped at their call sites:

- `a bang command runs locally and exposes terminal output` — the successful bang command produces output but does not complete reliably. Not a portability problem.
- `worktree session uses the resolved worktree as working directory` — the whole scenario is skipped on Windows because the host terminal tool does not expose a terminal resource there, as described below.

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

Any assertion that a command's output *contains* a path built from `tmpdir()` is therefore comparing two different spellings of the same directory. `normalizeSnapshotText` strips `/private` for snapshots, while direct worktree assertions accept both the reported path and its `realpathSync` canonical form.

This path aliasing previously made `worktree session uses the resolved worktree as working directory` time out after the tool and turn had already completed on macOS, and would have failed the same way on Windows. The test now canonicalizes direct path comparisons; the separate missing Windows terminal resource remains the platform blocker.

### The host terminal tool surfaces no content on Windows

The same test's Copilot branch waits for a `chat/toolCallContentChanged` carrying a terminal resource. On Windows CI that notification never arrives, even though `chat/toolCallStart`, `chat/toolCallReady`, the confirmation round-trip, and `chat/toolCallComplete` all do.

So the tool call runs to completion but the host-managed terminal never publishes streaming content. Whether that is a product gap or a configuration difference in the test is not yet established — it needs a Windows machine to investigate, and it is the blocker for asserting terminal `cwd` on Windows at all.

### Steering versus pinning

Two techniques, and the choice is not stylistic:

- **Steer** (`Use your file tools; do not run a shell command.`) where a file tool exists for the operation and the provider follows the instruction reliably. Reads and missing-file handling use this path for Claude and Copilot.
- **Pin** (`Run exactly this shell command, with no modifications: …`) where no file tool exists. Rename, delete, directory creation, and listing have no file-tool equivalent, so every provider reaches for the shell and picks a POSIX command. Steering these harder made one provider skip the operation entirely rather than use a different tool.

Pinning uses `node -e "…"`, which is guaranteed present because the suite runs under Node, and whose `"…"` / `'…'` quoting is read identically by `cmd` and POSIX shells. Prefer relative paths in a pinned command so no Windows path with backslashes has to be escaped into a JavaScript string literal.

The trade-off is real: a pinned command tests shell execution rather than the provider's tool selection. Codex uses pinned commands for all file operations because it only exposes `exec_command`. Copilot create/edit scenarios also pin commands because its native tools did not record portable, reliably completed turns; dedicated streaming-create coverage still exercises its native create tool. Pin only when steering has actually been tried and failed, and note which it was.

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

### Branch changeset stays stale after a second edit to the same file

- Test: `a second edit updates one changeset entry in place`.
- Scope: conformance reference provider, branch changeset subscribed across two host-local turns.
- Expected: after the second turn adds a third line, the existing file entry keeps its identity and updates from `+2 -1` to `+3 -1`.
- Observed: the changeset remains ready with the first turn's `+2 -1` diff and never publishes the second edit.
- Gate: the affected `conformanceTest` is disabled at its declaration in `changesetSuite.ts`.
- Reproduce:

  ```bash
  ./scripts/test-integration.sh --run \
    src/vs/platform/agentHost/test/node/e2e/conformance/agentHostConformance.integrationTest.ts \
    --grep "a second edit updates one changeset entry in place"
  ```

### Multi-client subscriptions do not consistently isolate and broadcast channel traffic

- Tests:
  - `a chat action is broadcast to every subscribed client`
  - `an unsubscribed client stops receiving channel actions`
  - `terminal output is streamed to every subscribed client`
  - `root session summaries are broadcast to every subscribed client`
- Scope: conformance reference provider with two initialized AHP clients connected to one real host.
- Expected: every client subscribed to a chat, terminal, or root channel receives its actions and notifications; unsubscribing one client does not affect another client's subscription.
- Observed: the additional client receives no chat draft, terminal data, or root summary notification, and after it unsubscribes the shared client's next session action does not echo.
- Gate: each affected `conformanceTest` is disabled at its declaration in `protocolContractsSuite.ts`.
- Reproduce:

  ```bash
  ./scripts/test-integration.sh --run \
    src/vs/platform/agentHost/test/node/e2e/conformance/agentHostConformance.integrationTest.ts \
    --grep "chat action is broadcast|unsubscribed client|terminal output is streamed|root session summaries"
  ```

### Discard changes fails for an untracked file

- Test: `discarding an untracked file removes it from disk`.
- Scope: conformance reference provider, uncommitted changeset with one untracked file.
- Expected: the advertised resource-scoped `discard-changes` operation removes the untracked file and returns to idle.
- Observed: the operation fails because `git restore` reports that the untracked path does not match a file known to Git.
- Gate: the affected `conformanceTest` is disabled at its declaration in `changesetSuite.ts`.
- Reproduce:

  ```bash
  ./scripts/test-integration.sh --run \
    src/vs/platform/agentHost/test/node/e2e/conformance/agentHostConformance.integrationTest.ts \
    --grep "discarding an untracked file"
  ```

### Checkpoint-backed per-turn changesets omit host-local filesystem edits

- Tests:
  - `a per-turn changeset reports a file created in that turn`
  - `a per-turn changeset reports an edit to a committed file`
  - `a per-turn changeset reports a file deleted in that turn`
  - `a per-turn changeset for an unknown turn reports an error`
  - `comparing a turn with itself produces an empty ready changeset`
  - `comparing two turns reports the changes between their checkpoints`
  - `a materialized git session advertises turn and compare changeset templates`
- Scope: conformance reference provider, real worktree-isolated sessions.
- Expected: host-local bang-command edits are represented by checkpoint-backed per-turn/compare changesets, unknown turns report an error, and materialized git sessions advertise the turn/compare templates.
- Observed: create/edit/delete turn changesets are empty and Ready, unknown turns are empty and Ready, compare operations cannot find usable checkpoints, and the session catalog does not advertise turn/compare templates.
- Gate: each affected `conformanceTest` is disabled at its declaration in `changesetSuite.ts`.
- Reproduce:

  ```bash
  ./scripts/test-integration.sh --run \
    src/vs/platform/agentHost/test/node/e2e/conformance/agentHostConformance.integrationTest.ts \
    --grep "per-turn changeset reports a file created"
  ```

### `create_session` resolves Claude and Codex models to the Copilot provider

- Test: `server tool: create_session materializes a selected-model child session and starts its prompt`.
- Scope: Claude and Codex.
- Expected: passing a model advertised by the calling agent creates a child session for that model's provider.
- Observed: both providers create the child session with provider `copilotcli`. The selected model id is present in more than one provider's global model list, and the session tool does not carry a provider-qualified model selection. Codex also executes `create_session` without surfacing its required pending confirmation.
- Gate: `supportsProviderModelSessionCreation` in `serverToolsSuite.ts`.
- Reproduce:

  ```bash
  AGENT_HOST_REPLAY_RECORD=1 ./scripts/test-integration.sh --run \
    src/vs/platform/agentHost/test/node/e2e/providers/claudeAgentHostE2E.integrationTest.ts \
    --grep "server tool: create_session materializes"
  ```

  Substitute `codexAgentHostE2E.integrationTest.ts` to reproduce the Codex variant.

### Claude `create_chat` server-tool turns do not complete

- Tests:
  - `server tool: create_chat defaults to the invoking session and starts its local prompt`
  - `server tool: create_chat applies an explicit peer title`
- Scope: Claude.
- Expected: after confirmation, the host creates the peer chat, starts the local `/rename` prompt there, returns the tool result, and completes the invoking turn.
- Observed: the confirmation is accepted, but the invoking turn never reaches tool completion or `chat/turnComplete`.
- Gate: `supportsServerToolCreateChat` in `serverToolsSuite.ts`.
- Reproduce:

  ```bash
  AGENT_HOST_REPLAY_RECORD=1 ./scripts/test-integration.sh --run \
    src/vs/platform/agentHost/test/node/e2e/providers/claudeAgentHostE2E.integrationTest.ts \
    --grep "server tool: create_chat defaults"
  ```

### Claude omits important tool details when reading another session's transcript

The `get_session_context` tool lets an agent read the conversation history of an existing session. Its most detailed mode includes the tools used in earlier turns and the arguments passed to those tools, which helps the agent understand what work has already been performed.

With Claude, that detailed history omits the arguments of a previous `list_sessions` call and exposes the provider's internal name, `mcp__host__list_sessions`, instead of the product-facing name. An agent using this history may be unable to tell what an earlier tool call did, causing it to repeat work or make decisions from an incomplete account of the session.

- Test: `server tool: get_session_context full includes prior server-tool input`.
- Scope: Claude.
- Expected: the returned transcript identifies the earlier tool as `list_sessions` and includes its `{}` input.
- Observed: the transcript identifies it as `mcp__host__list_sessions` and omits the input.
- Gate: `supportsFullSessionContext` in `serverToolsSuite.ts`.
- Reproduce: record the exact test with the Claude provider.

### Claude reports that another session was deleted but leaves it available

The `delete_session` tool lets an agent delete a different Agent Host session. Claude reports that this operation succeeded, but the supposedly deleted session remains in the session list.

For users, this means a request to clean up an obsolete session may appear successful even though nothing was removed. The stale session can remain visible and available for later operations, contradicting the agent's confirmation.

- Test: `server tool: delete_session removes a non-current session`.
- Scope: Claude.
- Expected: after the tool reports success, the target no longer appears in `listSessions`.
- Observed: the target is still listed after the tool completes and remains listed after repeated checks.
- Gate: `supportsCrossSessionDelete` in `serverToolsSuite.ts`.
- Reproduce: record the exact test with the Claude provider.

### Claude can send a message to the chat that is already running the tool

The `send_message` tool is intended for contacting another session or chat. The host rejects attempts to target the same chat that is currently invoking the tool, because doing so can recursively start more work in an already active conversation.

Claude bypasses that protection and starts another turn in the current chat. A user could therefore see unexpected duplicate work, recursive agent activity, or a conversation that repeatedly messages itself.

- Test: `server tool: send_message refuses to target the invoking chat`.
- Scope: Claude.
- Expected: the tool fails with an error explaining that it cannot send a message to the current chat.
- Observed: another turn starts in the current chat instead of the tool returning the safety error.
- Gate: `supportsSelfSendRejection` in `serverToolsSuite.ts`.
- Reproduce: record the exact test with the Claude provider.

For all three Claude tests:

```bash
AGENT_HOST_REPLAY_RECORD=1 ./scripts/test-integration.sh --run \
  src/vs/platform/agentHost/test/node/e2e/providers/claudeAgentHostE2E.integrationTest.ts \
  --grep "server tool: (get_session_context full|delete_session removes|send_message refuses)"
```

### Codex cannot complete several workflows that refer to another session

Agent Host gives sessions stable links so an agent can look up a particular session, send work to another session, or delete another session. In the affected Codex workflows, the provider fails a model request with `Authorization header is badly formatted` before the requested session tool can run.

Users may be unable to use session links or ask a Codex agent to coordinate with or remove another session. The failure currently appears as an authentication error rather than a useful explanation of which cross-session operation could not be completed. It is not yet known whether the malformed authorization originates in Codex's handling of additional sessions or in the Agent Host integration.

- Tests:
  - `server tool: list_sessions direct lookup accepts an open-session link`
  - `server tool: send_message starts a turn in another session`
  - `server tool: delete_session removes a non-current session`
- Scope: Codex.
- Expected: Codex completes the model turn and invokes the requested session tool with the referenced session.
- Observed: direct lookup fails its first model request; send and delete fail while preparing the additional target session. Each failure reports `Authorization header is badly formatted`.
- Gates: `supportsDirectSessionLookup`, `supportsCrossSessionSend`, and `supportsCrossSessionDelete` in `serverToolsSuite.ts`.
- Reproduce: record the affected tests with the Codex provider.

### Codex can send a message to the chat that is already running the tool

As with Claude, Codex does not enforce the `send_message` protection that prevents an active chat from messaging itself. Instead of rejecting the call, Codex starts another turn in the current chat.

This can produce unexpected duplicate or recursive agent work for users and defeats the host's loop-prevention contract.

- Test: `server tool: send_message refuses to target the invoking chat`.
- Scope: Codex.
- Expected: the tool fails with an error explaining that it cannot send a message to the current chat.
- Observed: another turn starts in the current chat instead of the tool returning the safety error.
- Gate: `supportsSelfSendRejection` in `serverToolsSuite.ts`.
- Reproduce: record the exact test with the Codex provider.

For the affected Codex tests:

```bash
AGENT_HOST_REPLAY_RECORD=1 ./scripts/test-integration.sh --run \
  src/vs/platform/agentHost/test/node/e2e/providers/codexAgentHostE2E.integrationTest.ts \
  --grep "server tool: (list_sessions direct lookup|send_message|delete_session removes)"
```

### Claude provider-context fork

- Tests:
  - `forked peer chat inherits source history through the provider`
  - `unknown-turn fork does not inherit source provider context`
- Scope: Claude.
- Expected: a provider-backed fork continues from the requested source history.
- Observed: the forked chat's AHP transcript is seeded, but its model request has no source history. The model cannot recall the source conversation, and no error reaches the client.
- Cause confirmed by investigation: `resolveForkAnchorUuid` matches the client-assigned AHP turn id against Claude SDK envelope UUIDs. When it cannot resolve the anchor, `_forkChat` returns `undefined` and chat creation silently continues with fresh provider context.
- Gate: `supportsChatForkE2E: false`.
- Issue: [#328104](https://github.com/microsoft/vscode/issues/328104).
- Reproduce:

  ```bash
  ./scripts/test-integration.sh --run \
    src/vs/platform/agentHost/test/node/e2e/providers/claudeAgentHostE2E.integrationTest.ts \
    --grep "forked peer chat inherits source history through the provider"
  ```

  Temporarily enable `supportsChatForkE2E`.

The same defect prevents refreshing Claude's `side chat receives bounded source context without copied history` capture. The side chat falls back to an injected `<side-chat-context>` preamble instead of a provider fork, so its pre-defect fixture is listed in `STALE_RECORDED_REQUEST_EXCEPTIONS`. After fixing the fork, remove that exception and re-record:

```bash
AGENT_HOST_UPDATE_SNAPSHOTS=1 ./scripts/test-integration.sh --run \
  src/vs/platform/agentHost/test/node/e2e/providers/claudeAgentHostE2E.integrationTest.ts \
  --grep "side chat receives bounded source context"
```

## Platform and deterministic-replay limitations

### Copilot prompt snapshots on Windows

- Tests: all models in `copilotPromptsE2E.integrationTest.ts`.
- Scope: Windows.
- Expected: one committed baseline per model describes the prompt assembled by the bundled CLI.
- Observed: the Windows prompt includes PowerShell-specific instructions and host-probed capabilities, so it is not a stable renaming of the POSIX prompt.
- Gate: `process.platform === 'win32'`.
- Reproduce:

  ```bat
  scripts\test-integration.bat --run src\vs\platform\agentHost\test\node\e2e\providers\copilotPromptsE2E.integrationTest.ts
  ```

Closing this requires separately reviewed Windows baselines generated on runners with consistent PowerShell capabilities. Linux and macOS already detect provider-wide prompt drift.

### Windows shell and filesystem behavior

Most of this section is resolved — see [What is still Windows-scoped, and why](#what-is-still-windows-scoped-and-why). Thirteen tests that were disabled on Windows because their capture contained a POSIX-only command now run there.

Three rows remain, and they are not about command portability:

| Test | Disabled scope | Observed limitation |
|---|---|---|
| `a bang command runs locally and exposes terminal output` | Windows | The successful bang command produces output but does not complete reliably. |
| `resource watch reports changes on its subscribed channel` | Windows | The subscribed filesystem watch does not emit `resourceWatch/changed` after a protocol `resourceWrite` within the test timeout. Descriptor, missing-root, and resource mutation coverage remain enabled. |
| `worktree session uses the resolved worktree as working directory` | Windows | Copilot's completed host-terminal call publishes no terminal-content notification, so the test cannot subscribe to the terminal and assert its working directory. |
| ``strips redundant `cd <workingDirectory> &&` prefix from shell tool calls`` | Copilot on Windows | The turn completes, but `chat/toolCallReady` omits the `toolInput` needed to assert that the prefix was removed. |
| `shell read helper remains a non-terminal tool` | Copilot on Windows | The scenario depends on completed ordinary-shell output, which the Copilot provider does not reliably surface on Windows; the read-helper protocol shape remains covered on POSIX. |

Copilot's ordinary provider shell also omits `ToolResultTerminalContent.result.preview` on Windows, while its terminal-shaped resource is not backed by the host terminal manager and cannot be subscribed. These tests are skipped for Copilot on Windows because their direct output oracle would otherwise be empty:

- `lists workspace entries`
- `runs a deterministic shell command`
- `inspects git status`

Use the affected provider command with `--grep "<exact test title>"` and temporarily remove the platform gate to reevaluate a row.

### Codex shell-tool replay on Linux

- Scope: Codex on Linux in deterministic replay.
- Expected: recorded `exec_command` turns emit their tool lifecycle and complete.
- Observed: packaged Linux completes the recorded turn without command-execution notifications.
- Gate: `shellToolReplayUnstableOnLinux: true`. Recording and other platforms remain enabled.
- Tests directly affected by this gate:
  - `worktree session uses the resolved worktree as working directory`
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
  - `reads a filename containing spaces`
  - `secondary workspace skill reaches the Codex model request`
- Reproduce:

  ```bash
  ./scripts/test-integration.sh --run \
    src/vs/platform/agentHost/test/node/e2e/providers/codexAgentHostE2E.integrationTest.ts
  ```

  Temporarily clear `shellToolReplayUnstableOnLinux`.

### Codex successful shell result text

- Tests:
  - `worktree session uses the resolved worktree as working directory`
  - `reads an existing text file`
  - `reads a file from a nested directory`
  - `lists workspace entries`
  - `reads a value from JSON`
  - `counts lines in a file`
  - `handles a missing file without a session error`
  - `runs a deterministic shell command`
  - `inspects git status`
- Scope: Codex.
- Expected: successful shell tool completions include the command output in their result text.
- Observed: the turn response contains the expected value, but the successful tool completion can have an empty `text` field.
- Gate: these nine tests remain enabled for other providers and are skipped for Codex.
- Tracking issue: [#329512](https://github.com/microsoft/vscode/issues/329512).
- Failing runs:
  - [PR #329485](https://github.com/microsoft/vscode/actions/runs/31132506547/job/92724492870?pr=329485)
  - [PR #329492](https://github.com/microsoft/vscode/actions/runs/31130785836/job/92718953820?pr=329492)
  - [PR #329517](https://github.com/microsoft/vscode/actions/runs/31148098482/job/92771783938?pr=329517)
  - [PR #329867](https://github.com/microsoft/vscode/actions/runs/31342377741/job/93319069992?pr=329867)

### Claude subagent replay on Windows

- Test: `reopening a session keeps sub-agent messages out of the parent transcript (replay path)`.
- Scope: Claude on Windows.
- Expected: the reopened parent transcript excludes subagent-only messages.
- Observed: Claude reconstructs the subagent transcript from `subagents/agent-*.jsonl`, which is not reliably visible immediately on Windows.
- Gate: `subagentReplayUnstableOnWindows: true`.
- Related investigation: [#325284](https://github.com/microsoft/vscode/pull/325284).
- Reproduce: temporarily clear the gate and run the exact title with `scripts\test-integration.bat`.

### Mid-turn abort is record-only

- Tests:
  - `can abort a running turn`
  - `accepted steering followed by abort does not block the replacement turn`
- Scope: deterministic replay for every provider; the second test is Copilot-specific.
- Reason: replay serves the intentionally truncated response immediately, leaving no real streaming window in which to abort.
- Gate: direct `AGENT_HOST_REPLAY_RECORD=1` mode only.
- Run:

  ```bash
  AGENT_HOST_REPLAY_RECORD=1 ./scripts/test-integration.sh --run \
    src/vs/platform/agentHost/test/node/e2e/providers/copilotAgentHostE2E.integrationTest.ts \
    --grep "can abort a running turn"

  AGENT_HOST_REPLAY_RECORD=1 ./scripts/test-integration.sh --run \
    src/vs/platform/agentHost/test/node/e2e/providers/copilotAgentHostE2E.integrationTest.ts \
    --grep "accepted steering followed by abort"
  ```

### Codex model-backed multiple-chat recording

- Tests: the model-backed peer-chat and fork scenarios in `multiChatSuite.ts`.
- Scope: Codex recording and strict replay only. Codex advertises `multipleChats.fork`; host-only capability checks and conformance catalog/lifecycle scenarios run.
- Expected: focused `AGENT_HOST_UPDATE_SNAPSHOTS=1` recording produces Codex peer/fork captures that replay without cache misses.
- Observed: on the current live recording path, even the existing simple Codex recording fails before producing a usable model response; peer turns report a CAPI malformed authorization-header error. No fixtures are accepted or hand-edited.
- Gate: `supportsMultipleChatsE2E: false` and `supportsChatForkE2E: false`.
- Reproduce:

  ```bash
  unset GITHUB_TOKEN
  AGENT_HOST_UPDATE_SNAPSHOTS=1 ./scripts/test-integration.sh --run \
    src/vs/platform/agentHost/test/node/e2e/providers/codexAgentHostE2E.integrationTest.ts \
    --grep "peer chat completes a simple turn"
  ```

## Test-design limitations

### Claude plan-mode prompt

- Test: `planning-mode session-state writes are auto-approved in default mode`.
- Scope: Claude.
- Expected: the prompt drives the provider to invoke `ExitPlanMode`.
- Observed: plan mode is wired, but the Copilot-oriented prompt does not reliably cause Claude to invoke the tool.
- Gate: `supportsPlanMode: false`.
- Next step: use a provider-neutral or Claude-specific prompt without weakening the plan-mode assertions.
- Reproduce: temporarily enable `supportsPlanMode` and record the exact title.

### Cumulative state assertions

A test that checks only its final dispatch can miss an earlier action that was echoed but never applied. When a scenario builds state across several actions, include an assertion over the accumulated result rather than only the last write.

## Expected capability skips

| Capability | Gate | Provider(s) skipped | Effect |
|---|---|---|---|
| Model-backed multiple chats | `supportsMultipleChatsE2E` | Codex | Capability and conformance scenarios run; provider/model peer turns skip until focused Codex captures can be recorded. |
| Provider-backed fork parity | `supportsChatForkE2E` | Claude, Codex | Fork capability remains advertised; model-backed fork-context assertions skip. |
| Side chats | `supportsSideChats` | Codex | Provider-owned hidden-context and restore scenarios skip; ordinary peer chats and chat forks still run. |
| Subagents | `supportsSubagents` | Codex | Subagent routing and reopen scenarios skip. |
| Streaming file creation | `streamingFileCreateToolName` | Codex | Argument-delta coverage requires a native file-creation tool; shell-backed file behavior is covered separately. |
| Plan mode | `supportsPlanMode` | Codex | The plan-mode scenario skips. Claude's use of the same gate is the prompt limitation above. |

The entire Claude or Codex suite also skips when its bundled SDK package is unavailable; that is an environment prerequisite, not a product gap.

## Review checklist

1. Run the full conformance and provider files; shared-process failures can depend on suite order.
2. Reevaluate broad provider gates one title at a time and check whether a capture exists.
3. Re-record narrowly after SDK/CLI behavior changes and review every generated artifact.
4. Remove fixed gates, entries, comments, and orphaned captures together.
