# HydraFusion phase chat fixes (work in progress)

> **Status:** On hold until the SDK bump. The code is complete, it type-checks and lints clean, and the unit tests pass. It has been checked live for one accepted Cascade run. **Delete this file before this branch merges.**

## Background

We investigated HydraFusion runs in the Copilot agent host (VS Code chat, Copilot SDK). In a HydraFusion run, the model works in *phases*. For example, a Cascade workflow has a Main pass, then a Review pass, then a Fix-up pass if the review asks for one. Each phase appears in the transcript as a pill, and clicking a pill should open that phase's own chat.

Things were wrong in both Insiders `eb1f2bba7cf` and `main` at `35f0b23b5d2`:

1. **The Main pass pill isn't clickable.** It isn't clickable while the phase runs. It's never clickable if the review rejects the Main pass.
   - A phase chat was only created when the first *committed* event for that phase arrived.
   - The runtime holds a phase's tool starts back until the phase's work is committed.
   - It replays events only for the phase that wins. A rejected phase never replays, so it never got a chat.
   - Evidence: session `6459f83b`, where the review rejected the Main pass (`verdict: 'reject'`). A `session.fusion_handoff` passed the task to the fix-up phase, and no committed events for `phase:0` were ever saved.
2. **Main pass skill reads show up under the Review pass.** After the review accepts, the Main pass's events replay, and the two "Read skill" rows appeared in the main transcript below the Review pass pill. The `skill.invoked` handler only found parents for real subagents, never for a HydraFusion phase. `skill.invoked` has no `fusion` field of its own. Its `parentId` points at the hidden `skill` tool completion, which does carry `fusion.phaseId`.
3. **Loose "Running" terminal rows appear in the main transcript.**
   - A Main pass shell command that needed approval had no tool start yet, because the runtime held it back.
   - So the approval request went out without a `parentToolCallId` and created a row in the main transcript.
   - That row kept spinning until the phase's work replayed, or forever if the phase was rejected.
   - A side effect: the host didn't know the shell tool's name, so it failed closed and always asked for confirmation.
4. **A rejected phase gives no feedback.** Nothing told the user that its work had been discarded.

## Changes

### 1. Open each phase's chat when the phase starts

- `CopilotAgentSession._emitFusionProgress` now calls `_openFusionPhaseChat` the first time a phase tile is shown.
- `_handleSubagentStarted` then attaches the chat link to the running phase tile, so the pill is clickable right away.
- This covers a phase that is later rejected, because its chat no longer depends on a replay.

### 2. Put skill reads in their phase's chat

- **Live session:** `onToolComplete` records the `fusion` attribution of hidden tool completions in `_fusionByToolCompletionEventId`, keyed by event id. The `skill.invoked` handler looks up its `parentId` there and falls back to `_fusionPhaseParentToolCallId`.
- **Reload:** `mapSessionEvents` builds `fusionByToolCompletionEventId` in its pre-pass, and the `skill.invoked` case resolves its parent with `resolveFusionPhaseToolCallId`.

### 3. Put phase approvals inside that phase's chat

- `_handlePermissionRequest` calls the new `_surfaceStagedFusionToolForPermission` when `_surfaceProvisionalFusionToolCall` finds nothing to show.
- If a phase is running and the host hasn't seen the tool, it creates a staged `tool.execution_start` from the permission request, shows it under the running phase, and marks it as already shown.
- **Kinds covered:**
  - `shell`: the tool name is `bash`, or `powershell` on Windows, with `{ command: fullCommandText, description: intention }`.
  - `custom-tool`: the request's tool name and arguments.
  - `mcp`: the tool name, arguments and `serverName`.
- **Not covered: read and write approvals.** Their requests don't identify the tool or its real arguments. A guessed edit row could produce a wrong or duplicated diff, so they behave as before, with the approval in the main transcript. A safe follow-up would be a plain placeholder row with no diff tracking.
- **The later replay:** the replayed start is skipped because the tool is already marked as shown, and the replayed completion closes the same row inside the phase chat.
- **Security is unchanged.** `shellLanguage` is still worked out before this step, so an unknown shell tool still requires confirmation.
- **Client side:** the approval still appears in the carousel above the chat input, labelled with the phase, for example "— Main pass".
  - The phase pill now shows **"Phase is waiting for approval"**. `FusionPhasePillActionViewItem.status` used to ignore `confirmationCount`.
  - When the carousel is off (`chat.tools.confirmationCarousel.enabled: false`), `ChatSubagentContentPart._updateOpenChatOnlyMode` no longer collapses the tile to its pill while an approval is waiting inline, so the approval stays reachable.

### 4. Close out a rejected phase's work

**Why a phase's tile is held open.** The chat protocol has no action for updating a tool call's metadata after it completes, so the host holds a finished solver phase's tile open until its review decides:
- `CopilotFusionProgress` records whether the workflow's plan (`fusion_resolved.phasePlan`) has a review phase (`judge` or `critic`).
- When a solver phase completes while a review is still pending, the update is flagged `awaitingReview`.
- The session then sends `ChatToolCallReady`, which keeps the tile running in protocol terms while its metadata already shows it as completed, and stores it in `_fusionPhasesAwaitingReview`.

**How it settles.** When the review completes, `settledPhase` finishes that tile:
- On `verdict: 'reject'` the tile gets `_meta.fusionPhase.rejectedByReview = true`, with the summary "Main pass rejected by review".
- Rows the phase showed early are closed as failed with "Result discarded because the review rejected this pass." (`_discardRejectedFusionPhaseTools`). Without that they'd spin forever, because a rejected phase never replays.

**Other ways it settles.** A held tile also completes unchanged if:
- the review phase fails,
- the workflow ends (`fusion_completed`),
- the run is interrupted,
- or the turn ends (`_completeActiveTurn`, `failActiveTurn`, root `session.error`).

**Reload.** `FusionReplayState.drain` replaces the existing tile by id with the settled one. It never adds a new tile.

**How it reaches the client.**
- `IFusionPhaseMeta.rejectedByReview` becomes `IChatSubagentToolInvocationData.phaseRejectedByReview`, then `ISubagentPhaseContext.rejectedByReview`.
- The pill shows **"Rejected by review"** with the `discard` icon.

### 5. Explain a finished phase with no chat

A finished phase that has no chat gets an extra tooltip line, which screen readers also hear:
- "No transcript is available for this pass.", or
- "No transcript is available because the review discarded this pass."

With change 1, this mostly shows up for rejected phases restored from history, because their work is never saved.

## Files

Source:
- [agentToolCallMeta.ts](src/vs/platform/agentHost/common/meta/agentToolCallMeta.ts): `rejectedByReview` added to `IFusionPhaseMeta`, and validated when read.
- [copilotFusionProgress.ts](src/vs/platform/agentHost/node/copilot/copilotFusionProgress.ts): holds a solver phase for its review and settles it (`awaitingReview`, `settledPhase`, `_settleReviewedPhase`, `isReviewPhaseKind`).
- [copilotFusionReplay.ts](src/vs/platform/agentHost/node/copilot/copilotFusionReplay.ts): applies `settledPhase` on reload.
- [copilotAgentSession.ts](src/vs/platform/agentHost/node/copilot/copilotAgentSession.ts): opens phase chats when a phase starts, holds and settles reviewed tiles, discards a rejected phase's rows, routes skill reads to their phase, and creates starts for staged tools that need approval.
- [mapSessionEvents.ts](src/vs/platform/agentHost/node/copilot/mapSessionEvents.ts): skill read parents on reload.
- [chatService.ts](src/vs/workbench/contrib/chat/common/chatService/chatService.ts): `phaseRejectedByReview`.
- [stateToProgressAdapter.ts](src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/stateToProgressAdapter.ts): passes `phaseRejectedByReview` through.
- [chatSubagentContentPart.ts](src/vs/workbench/contrib/chat/browser/widget/chatContentParts/chatSubagentContentPart.ts): passes `rejectedByReview` through, and keeps inline approvals visible when the carousel is off.
- [fusionPhasePillActionViewItem.ts](src/vs/workbench/contrib/chat/browser/widget/chatContentParts/fusionPhasePillActionViewItem.ts): waiting and rejected states, the discard icon, and the no-transcript tooltip.

Tests:
- `copilotAgentSession.test.ts`:
  - Updated tests: the phase chat now opens up front, and a Main pass awaiting review gets an extra Ready.
  - New tests:
    - staged approval inside a phase, with the replay closing the row;
    - a root approval outside a phase is unchanged;
    - a reviewed Main pass held until accept or reject;
    - a held Main pass completed when the turn errors;
    - a skill read nested under its phase.
- `copilotFusionProgress.test.ts`: hold and settle for accept, reject, interrupt, workflow end, and a single-phase plan.
- `mapSessionEvents.test.ts`: a rejected solver restored with no transcript, and a phase skill read restored under its phase.
- `stateToProgressAdapter.test.ts`: the rejection flag reaches restored pills.
- `chatSubagentContentPart.test.ts`: the rejected, waiting and no-transcript tooltip states. The accessible-label expectations now include the no-transcript line.

## How it was checked

- `npm run typecheck-client` is clean, and `eslint` on the changed files is clean.
- `./scripts/test.sh --runGlob "**/agentHost/test/**/*.test.js"`: 9213 passing, 1 failing. The failure is unrelated: `AgentHostModePicker` "new-chat controls keep the same padding…" is a pixel-size test in `src/vs/sessions` that also fails when run alone and imports none of the changed files.
- Chat browser suites `chatSubagentContentPart`, `stateToProgressAdapter` and `importLocalConversationToAgentSession`: 328 passing.
- **Live check in Code OSS**, editor window on `vscode-copilot-evaluation`, one Cascade run in which the review accepted the Main pass:
  - The Main pass pill was a clickable button the whole time it ran.
  - The shell approval appeared in the carousel as "Run in terminal? — Main pass", and the pill read "Phase is waiting for approval".
  - After approval, the Main pass chat, opened from the pill, contained both the shell command and "Read skill benchmark-test". The main transcript had no loose rows.

## Not done yet

- [ ] **Live check of a rejected Main pass.** A rejection can't be forced; it's covered by unit tests only. To test, open a history session that has `verdict: 'reject'` (like `6459f83b`) and check the label, the discarded rows, and the tooltip after reload.
- [ ] **Live check of a reload.** Open phase chats and skill read rows should come back correctly.
- [ ] **Live check with the carousel off** (`chat.tools.confirmationCarousel.enabled: false`).
- [ ] **Decide how Critique should work.** Critique runs report `verdict: null` on the critique phase and put "revise" only in the critique text, so "Rejected by review" effectively applies to Cascade only. First find out whether a revised draft's work is ever replayed.
- [ ] **Decide whether read and write approvals move into the phase**, for example with a placeholder row with no diff tracking.
- [ ] **Clicking a pill with an approval pending goes to the approval, not the phase chat.** That's existing subagent behavior; confirm it's what we want.
- [ ] Code review of the diff, then a draft PR.

## Relation to the SDK bump and #337635

- These fixes **don't need an SDK bump.** `@github/copilot-sdk@1.0.15-preview.2`, which `main` pins, already has every field they use: `phasePlan`, `conversationScope`, `verdict`, the `skill.invoked` `parentId`, and the phase id on tool completions.
- #337635 ("show live HydraFusion phase work in its phase chat") **does need the bump.** It needs a runtime that contains github/copilot-agent-runtime#21218 (`ecdebc8eb53`). The first runtime tag with it is `cli-1.0.89-2`.
  - The agent host always runs the runtime bundled inside the SDK. `resolveCopilotRuntimePaths` uses `@github/copilot-sdk-<platform>/prebuilds/<platform>/copilot-runtime`, and passes that path explicitly to `RuntimeConnection.forStdio`, so `COPILOT_CLI_PATH` is never used.
  - `@github/copilot@1.0.89-2` (the CLI package) doesn't help the agent host. What's needed is an `@github/copilot-sdk` release that bundles runtime `1.0.89-2` or later, probably `1.0.15-preview.3`.
  - To check a release, look at `COPILOT_CLI_VERSION` in its `dist/cliVersion.js`, or run `git merge-base --is-ancestor ecdebc8eb53 cli-<version>` in the runtime repo.
- **Merge order:** land this branch first, then rebase #337635. Both touch how staged phase tools are shown (`_surfaceProvisionalFusionToolCall` and `_surfacedProvisionalFusionToolCallIds`), and #337635's live phase messages rely on the phase chat being open, which change 1 now ensures.

## Separate open issue: steering with HydraFusion

The original report, that HydraFusion "sometimes appears stuck with steering enabled", is **not addressed here**.

What we saw in Insiders session `ac042775` (log times are local, UTC−7):
- At 11:08:22 a steering message was sent. The turn was aborted about 2 seconds later, and the message was sent again as a new turn.
- After the third abort, at 11:16:01, the session logged `Session error: query - Execution failed: fusion phase was cancelled`.

Starting points:
- `CopilotAgentSession._beginSteeringTurn`, which moves the active SDK turn id onto a new host turn with `_recordHostSdkTurn`. That marks `_reassignedFusionSdkTurnIds`, which `_acceptFusionEvent` then rejects as having ambiguous ownership.
- `_takeMatchingPendingSteering`.
