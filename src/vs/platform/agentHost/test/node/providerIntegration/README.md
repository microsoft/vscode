# Agent Host provider integration tests

These tests exercise a bundled provider process against a synthetic local model service. Most start a real Agent Host server; focused provider-boundary tests can drive the SDK directly when AHP is not part of the contract. They are useful when provider lifecycle, filesystem behavior, or SDK wire compatibility matters but realistic model behavior does not.

These are distinct from `../e2e/`, whose prioritized cross-provider suites replay model traffic captured from real CAPI interactions and assert AHP snapshots and real tool behavior. Provider integration tests do not contribute to the E2E coverage report.

Every real provider process must use a temporary home through `createIsolatedProviderEnvironment` or the required `homeDir` option of `startRealServer`. This keeps provider configuration, logs, and sessions out of the developer's real home directory.

Run one suite with:

```bash
./scripts/test-integration.sh --run src/vs/platform/agentHost/test/node/providerIntegration/copilotMockLlm.integrationTest.ts
```

`copilotAutoTier.integrationTest.ts` checks that a scalar default selected by the client travels through the existing `ModelSelection.config.tier` / SDK `capi.autoTier` boundary to the actual first `/auto` request and survives resume. It uses the production scalar reader and tier accessor with the bundled SDK and isolated HTTP service. Picker scope/lifecycle and send/model-change ordering are covered separately in the browser store and Copilot agent unit suites. These tests characterize client startup preferences, not runtime policy enforcement or backend authoring semantics; they do not require a real account or modify device policy.
