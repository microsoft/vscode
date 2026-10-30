# Agent Host node tests

Choose the lowest test type that exercises the behavior:

- `*.test.ts`: in-process unit tests for one service, mapper, reducer, or provider component.
- `protocol/`: a real Agent Host server driven over AHP with `ScriptedMockAgent`. Use for server and protocol contracts that do not depend on a provider SDK.
- `e2e/providers/`: the whole server and bundled provider process with deterministic LLM captures and AHP snapshots. Use when provider behavior is part of the contract.
- `providerIntegration/`: a real provider process backed by the local mock LLM. Use when provider lifecycle matters but realistic model behavior does not.
- Other `*.integrationTest.ts` files at this level: focused component integrations that do not exercise AHP end to end, such as direct SDK or Git-service coverage.

Tests that launch a real provider process isolate its home, configuration, logs, and session state in a temporary directory.

The protocol and E2E folders contain their own running and authoring instructions.

## Reasoning timing

AHP reasoning parts carry optional producer-owned `startedAt` and `duration` fields for one contiguous run of thinking output. A run starts at its first nonempty reasoning text and ends at the next markdown or tool-call part, or at turn termination. SDK reasoning IDs, reasoning-complete events, full-message boundaries, and sideband notifications do not split a run. Timing-only `chat/reasoning` updates finish the run before publishing the following content or terminal action.

Copilot measures runs with a monotonic clock and stores the observed ordering of reasoning, markdown, and tool references against durable assistant-message event IDs in `assistant_response_parts`. A run may span SDK messages; its fragments share one ID and are updated with the same final duration, then reassembled without summing it during replay. Conversely, two runs separated by markdown or a tool retain separate IDs and durations even when the SDK saves one message containing both. Native tool results are retained and placed at the recorded boundaries. The projection is used only when its text still matches the provider transcript.

Recorded parts follow turn remapping and pruning. The earlier draft's aggregate `reasoning_timing` rows are not reinterpreted as per-run timings. Unknown history and unfinished runs remain untimed rather than counting time while the host is stopped. This does not add capture to other providers or estimate older history.

Conversation import stores the original reasoning projections against the synthesized assistant-message IDs before resuming the SDK session, so imported durations also survive restart. The workbench marks every AHP thinking part as provider-owned independently of whether it carries timing values; a live delta after reconnect must never turn a locally observed tail into a persisted total. Local, non-AHP providers retain their existing client-side timing.

Single-run thinking headers use labels such as "Thought for 5s". Conversation grouping remains available, but its expanded reasoning rows show their individual durations instead of a group-wide sum. `copilotReasoningTiming.test.ts` covers 5s/12s markdown/tool boundaries through a real database restart and a single run spanning SDK messages. The provider, model, database, and renderer tests cover live boundaries, identity, migration, serialization, grouped display, and accessible text.

Finalized sections refresh both visible and accessible timing when a duration arrives after answer text. Regression coverage includes string/array reasoning, an earlier run inside a completed conversation group, and an import/event-log/database reopen round trip.

## Mission Control session configuration

The Mission Control listener publishes Copilot Host's `approvalMode` vocabulary (`manual`, `assisted`, `allow-all`) in place of VS Code's native `autoApprove` vocabulary (`default`, `assisted`, `autoApprove`). The independent `mode` property advertises `interactive`, `plan`, and `autopilot`. Local clients and persisted configuration keep the native representation; Mission Control requests, snapshots, action echoes, and reconnect replay use the wire representation.

Workspace configuration uses `target` (`workspace`, `worktree`) and `baseBranch` on Mission Control, mapped to native `isolation` (`folder`, `worktree`) and `branch`. Schema enums, defaults, labels, required keys, and branch completion requests use the corresponding vocabulary. Schema projection translates only recognized axes and preserves generic or mixed-vocabulary properties and their values. Native input names remain accepted for older clients; conflicting native and wire values are rejected.

`MissionControlHost` injects the configuration adapter separately from the Copilot extension contribution. The generic protocol handler delegates configuration conversion, including rejected-action projection, without interpreting Copilot property names. The extension contribution registers project and session methods and supplies the public root catalogue; authentication, passive restrictions, channel visibility, and replay remain handler-owned.

`missionControlSessionConfig.test.ts` covers the mapping and schema, and the `Mission Control session configuration` suite in `protocolServerHandler.test.ts` covers both sides of the protocol boundary. Run them with:

```bash
./scripts/test.sh --run src/vs/platform/agentHost/test/node/missionControlSessionConfig.test.ts --run src/vs/platform/agentHost/test/node/protocolServerHandler.test.ts --grep "Mission Control session config"
```

The `listener extensions` suite checks arbitrary contribution methods, authentication, passive access (including collisions with built-in methods), and listener-owned live/replay projections. Built-in handlers take precedence, and extension metadata cannot grant passive access to a mutating built-in. `missionControlHost.test.ts` checks the injected Copilot implementation and host wiring:

```bash
./scripts/test.sh --run src/vs/platform/agentHost/test/node/protocolServerHandler.test.ts --run src/vs/platform/agentHost/test/node/missionControlHost.test.ts --grep "listener extensions|MC Copilot extensions|Mission Control host integration"
```
