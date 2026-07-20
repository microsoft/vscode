# Agent Host provider integration tests

These tests start a real Agent Host server and bundled provider process but replace the language-model service with a synthetic local server. They are useful when provider lifecycle or filesystem behavior matters but realistic model behavior does not.

These are distinct from `../e2e/`, whose prioritized cross-provider suites replay model traffic captured from real CAPI interactions and assert AHP snapshots and real tool behavior. Provider integration tests do not contribute to the E2E coverage report.

Run one suite with:

```bash
./scripts/test-integration.sh --run src/vs/platform/agentHost/test/node/providerIntegration/copilotMockLlm.integrationTest.ts
```
