# Agent Host protocol integration tests

These tests start a real Agent Host server and drive it over AHP WebSocket/JSON-RPC using `ScriptedMockAgent`. They cover protocol contracts, subscriptions, multi-client behavior, persistence, resource operations, permissions, and turn routing without loading a bundled provider SDK or calling an LLM.

Use this folder when the behavior is owned by the Agent Host server or AHP contract and a scripted agent can express it precisely. Use `../e2e/` when the behavior depends on a real Claude, Copilot, or Codex process. Use a `*.test.ts` unit test when no server process is required.

Run one suite with:

```bash
./scripts/test-integration.sh --run src/vs/platform/agentHost/test/node/protocol/handshake.integrationTest.ts
```

Shared server/client infrastructure lives in `../serverIntegrationTestHelpers.ts`. Add scenarios to the file for the protocol area they exercise; create another file only for a distinct protocol concern.
