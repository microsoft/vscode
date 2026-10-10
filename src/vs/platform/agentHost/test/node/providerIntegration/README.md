# Agent Host provider integration tests

These tests exercise a bundled provider process against a synthetic local model service. Most start a real Agent Host server; focused provider-boundary tests can drive the SDK directly when AHP is not part of the contract. They are useful when provider lifecycle, filesystem behavior, or SDK wire compatibility matters but realistic model behavior does not.

These are distinct from `../e2e/`, whose prioritized cross-provider suites replay model traffic captured from real CAPI interactions and assert AHP snapshots and real tool behavior. Provider integration tests do not contribute to the E2E coverage report.

Every real provider process must use a temporary home through `createIsolatedProviderEnvironment` or the required `homeDir` option of `startRealServer`. This keeps provider configuration, logs, and sessions out of the developer's real home directory.

Run one suite with:

```bash
./scripts/test-integration.sh --run src/vs/platform/agentHost/test/node/providerIntegration/copilotMockLlm.integrationTest.ts
```

`copilotAutoTier.integrationTest.ts` checks that a scalar default selected by the client travels through the existing `ModelSelection.config.tier` / SDK `capi.autoTier` boundary to the actual first `/auto` request and survives resume. It uses the production scalar reader and tier accessor with the bundled SDK and isolated HTTP service. Picker scope/lifecycle and send/model-change ordering are covered separately in the browser store and Copilot agent unit suites. These tests characterize client startup preferences, not runtime policy enforcement or backend authoring semantics; they do not require a real account or modify device policy.

`copilotOtel.integrationTest.ts` checks that native shell-tool execution and concurrent session-event delivery complete with OpenTelemetry both enabled and disabled. It runs the bundled SDK against the synthetic BYOK Responses service, verifies every real tool result, requires progress before the runtime's 30-second session-lock timeout, and checks that the enabled file exporter produces native tool spans. Content capture is disabled. The enabled variant has a strict expected-failure marker for [github/copilot-agent-runtime#25128](https://github.com/github/copilot-agent-runtime/issues/25128): only the known progress-deadline failure is accepted; an unexpected pass or any other failure fails the test. Remove the marker when the runtime is fixed, retaining all desired-behavior assertions. This is a concurrency regression test, not a deterministic thread-scheduling test. Run it with:

```bash
./scripts/test-integration.sh --run src/vs/platform/agentHost/test/node/providerIntegration/copilotOtel.integrationTest.ts
```

`copilotByokSelectionIds.integrationTest.ts` pins the SDK contract behind `getByokLmAgentModelId` and `isByokLmAgentModelId`: the bundled runtime lists and selects BYOK models registered through the production `synthesizeByokSessionConfig` under the agent host's `provider/[group/]id` ids, and that no Copilot model it lists has that shape. Signed out, the runtime lists Copilot models only when it can reach the Copilot API, so that half is checked opportunistically here and deterministically by `../../common/agentHostByokLm.test.ts`. The utility model service relies on that shape to keep a retained BYOK selection off the Copilot route while the renderer is disconnected, so an SDK change to either id format should fail here first. It needs no Copilot sign-in. Run it with:

```bash
./scripts/test-integration.sh --run src/vs/platform/agentHost/test/node/providerIntegration/copilotByokSelectionIds.integrationTest.ts
```

`copilotManagedPermissions.integrationTest.ts` exercises the default-on legacy bridge
against the bundled runtime with an isolated synthetic BYOK model. It checks URL
denials and terminal managed asks on create, cold resume, and removal, preserving
unrelated shell/read/write/URL approval behavior. Managed terminal asks are also
checked in Allow All and assisted modes. URL requests reaching the permission
handler are rejected, so the test does not fetch external content. No Copilot
sign-in or device-policy changes are needed.
