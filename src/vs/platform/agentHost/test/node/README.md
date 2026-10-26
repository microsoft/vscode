# Agent Host node tests

Choose the lowest test type that exercises the behavior:

- `*.test.ts`: in-process unit tests for one service, mapper, reducer, or provider component.
- `protocol/`: a real Agent Host server driven over AHP with `ScriptedMockAgent`. Use for server and protocol contracts that do not depend on a provider SDK.
- `e2e/providers/`: the whole server and bundled provider process with deterministic LLM captures and AHP snapshots. Use when provider behavior is part of the contract.
- `providerIntegration/`: a real provider process backed by the local mock LLM. Use when provider lifecycle matters but realistic model behavior does not.
- Other `*.integrationTest.ts` files at this level: focused component integrations that do not exercise AHP end to end, such as direct SDK or Git-service coverage.

Tests that launch a real provider process isolate its home, configuration, logs, and session state in a temporary directory.

The protocol and E2E folders contain their own running and authoring instructions.

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
