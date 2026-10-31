# Agent Host protocol integration tests

> **Frozen.** Do not add tests here. New Agent Host Protocol coverage belongs in [`../e2e/`](../e2e/README.md), in the conformance tier.

These tests start a real Agent Host server and drive it over AHP WebSocket/JSON-RPC using `ScriptedMockAgent`. They cover protocol contracts, subscriptions, multi-client behavior, persistence, resource operations, permissions, and turn routing without loading a bundled provider SDK or calling an LLM.

## Why this suite is frozen

The E2E suite is required to be *external* to the agent host: the implementation is reachable only through `IAgentHostTarget` and the protocol itself, so that a different program speaking AHP could be substituted and validated by the same tests.

This suite cannot meet that bar. `ScriptedMockAgent` implements the host's internal `IAgent` interface and is side-loaded into the production server with `--enable-mock-agent`; scenarios are then steered by magic prompt keywords and internal environment variables. A replacement implementation has none of that, so these tests describe our implementation rather than the protocol.

Existing tests keep running and are still worth fixing when they break — they are fast and deterministic. They are simply not where new protocol coverage should go. The contracts that currently live only here, and should be re-expressed as E2E conformance tests, are tracked in the migration backlog in [`../e2e/README.md`](../e2e/README.md#migration-backlog).

## Running

Use `../e2e/` when the behavior depends on a real Claude, Copilot, or Codex process. Use a `*.test.ts` unit test when no server process is required.

Run one suite with:

```bash
./scripts/test-integration.sh --run src/vs/platform/agentHost/test/node/protocol/handshake.integrationTest.ts
```

Shared server/client infrastructure lives in `../serverIntegrationTestHelpers.ts`.
