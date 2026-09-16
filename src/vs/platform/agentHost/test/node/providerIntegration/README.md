# Agent Host provider integration tests

These tests exercise a bundled provider process against a synthetic local model service. Most start a real Agent Host server; focused provider-boundary tests can drive the SDK directly when AHP is not part of the contract. They are useful when provider lifecycle, filesystem behavior, or SDK wire compatibility matters but realistic model behavior does not.

These are distinct from `../e2e/`, whose prioritized cross-provider suites replay model traffic captured from real CAPI interactions and assert AHP snapshots and real tool behavior. Provider integration tests do not contribute to the E2E coverage report.

Every real provider process must use a temporary home through `createIsolatedProviderEnvironment` or the required `homeDir` option of `startRealServer`. This keeps provider configuration, logs, and sessions out of the developer's real home directory.

Run one suite with:

```bash
./scripts/test-integration.sh --run src/vs/platform/agentHost/test/node/providerIntegration/copilotMockLlm.integrationTest.ts
```

## Codex workspace hooks

The trusted and untrusted `SessionStart` cases in [codexCustomizations.integrationTest.ts](./codexCustomizations.integrationTest.ts) use fresh workspaces and an isolated Codex home. Keep that isolation: pre-existing native project trust can hide first-thread initialization bugs.

Codex can omit project hooks from `hooks/list` until `thread/start` establishes native project trust. The provider rechecks hook trust before the first turn and uses its existing pre-turn restart path when the discovered hashes differ from those supplied at startup. A failed recheck is logged without discarding existing grants or triggering a restart. Hook grants remain thread-scoped and gated by Workspace Trust.

The successful recheck is carried into the replacement without a second discovery request. Workspace Trust is revalidated for the workspace and each hook source immediately before startup; changing the working directory requires fresh discovery.

The marker hook is synchronous. A successfully completed model turn without the marker calls for checking hook discovery, trust, and execution diagnostics, not a longer model-response timeout.

On Windows, run just these cases with:

```bat
.\scripts\test-integration.bat --run src\vs\platform\agentHost\test\node\providerIntegration\codexCustomizations.integrationTest.ts --grep "workspace SessionStart"
```
