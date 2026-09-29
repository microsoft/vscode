---
name: otel
description: OpenTelemetry guidance for VS Code agent experiences. Use when changing Agent Host telemetry, local Copilot Chat telemetry, provider-native spans or metrics, OTel settings and managed policy, trace persistence/export, or monitoring documentation.
---

# OpenTelemetry in VS Code

Start by identifying the execution surface. VS Code has separate OTel pipelines with different owners and configuration:

| Surface | Process and producer | Configuration | Authoritative VS Code document |
|---|---|---|---|
| Agent Host sessions (Copilot, Claude, Codex) | Provider-native telemetry routed by the Agent Host utility process | `chat.agentHost.otel.*` | [`src/vs/platform/agentHost/OTEL.md`](../../../src/vs/platform/agentHost/OTEL.md) |
| Local Copilot Chat | Copilot Chat extension host and `IOTelService` | `github.copilot.chat.otel.*` | [`extensions/copilot/docs/monitoring/agent_monitoring.md`](../../../extensions/copilot/docs/monitoring/agent_monitoring.md) |

Do not combine these pipelines or assume that a setting for one configures another.

## Current architecture

Agent Host is the current execution architecture for Copilot, Claude, and Codex agent sessions. It owns routing, optional trace interception and SQLite persistence, resource normalization, and cross-provider trace context. Each provider owns its native instrumentation.

The extension-host Copilot CLI source remains as a fallback when Agent Host is unavailable and to support legacy-session migration. It is normally hidden when Agent Host is available and is not the current Agent Host architecture. Do not use it as a model for new work.

Local Copilot Chat remains a separate user-visible extension-host surface. Its foreground chat, LLM, tool, hook, metric, and event instrumentation continues to use `IOTelService` under `extensions/copilot/src/platform/otel/`.

## Runtime version discipline

Copilot's native OTel signal contract lives in `github/copilot-agent-runtime`, not in VS Code's TypeScript attribute constants. Before auditing or changing the integration:

1. Read the versions of `@github/copilot-sdk` and `@github/copilot` from the root `package-lock.json`.
2. Resolve the matching immutable runtime tag and commit.
3. Read the runtime monitoring reference and implementation at that revision.
4. Use runtime `main` only after confirming that the relevant files are unchanged from the bundled revision.

The runtime's `docs/developer-docs/monitor.md` is exhaustive for native Copilot spans, attributes, span events, metrics, protocols, environment variables, content capture, TLS, and managed settings. Read it at the revision corresponding to the bundled package and link to that immutable revision in investigation or review evidence rather than copying its signal tables into VS Code documentation.

## Ownership map

### Agent Host integration

```text
src/vs/platform/agentHost/
├── OTEL.md
├── common/
│   ├── agentService.ts                         # setting IDs, env names, settings → env translation
│   └── otel/agentHostOTelService.ts            # service contract and synthetic span names
├── electron-main/electronAgentHostStarter.ts   # Electron spawn-time env binding
├── node/
│   ├── nodeAgentHostStarter.ts                  # server spawn-time env binding
│   ├── otel/agentHostOTelService.ts             # pass-through and DB-mode routing
│   ├── copilot/                                 # Copilot SDK configuration and trace context
│   ├── claude/                                  # Claude launch environment
│   └── codex/                                   # Codex launch overrides
└── test/node/otel/                              # pipeline integration tests
```

Shared transport and persistence live under:

```text
src/vs/platform/otel/
├── common/                                      # normalized span data and shared attributes
└── node/
    ├── otlp/                                    # receiver, decoder, outbound forwarders
    └── sqlite/                                  # persistent span store
```

Agent Host supports two routing modes:

- **Pass-through:** provider SDKs export directly to the configured destination.
- **DB mode:** provider traces use a private OTLP/HTTP JSON loopback, are decoded into SQLite, and may be forwarded to a compatible external destination. Provider logs and metrics bypass the trace loopback.

Read `src/vs/platform/agentHost/OTEL.md` before changing either mode.

### Local Copilot Chat

```text
extensions/copilot/src/platform/otel/
├── common/                                      # IOTelService, config, attributes, events, metrics
└── node/                                        # SDK implementation and exporters

extensions/copilot/src/extension/
├── prompt/node/chatMLFetcher.ts                 # chat spans
├── intents/node/toolCallingLoop.ts              # invoke_agent spans
├── tools/vscode-node/toolsService.ts            # execute_tool spans
├── chat/vscode-node/chatHookService.ts           # execute_hook spans
├── byok/vscode-node/                            # BYOK chat spans
└── trajectory/vscode-node/                      # Agent Debug Log conversion
```

For extension-emitted attributes, use constants from `extensions/copilot/src/platform/otel/common/genAiAttributes.ts`. Those constants are not authoritative for provider-native Agent Host telemetry.

## Configuration checklist

When changing Agent Host configuration:

1. Update the setting registration in `common/agentHostStarter.config.contribution.ts`.
2. Update setting IDs, environment names, and `buildAgentHostOTelEnv()` in `common/agentService.ts`.
3. Update `readAgentHostOTelEnv()` or provider launch translation as applicable.
4. Preserve precedence deliberately: enterprise managed policy, inherited environment, and local settings are separate channels.
5. Update `src/vs/platform/agentHost/OTEL.md`.
6. Add focused translation and integration tests.
7. Invoke the `policy-and-managed-settings` skill for any enterprise control.

When changing local Copilot Chat configuration:

1. Update `extensions/copilot/package.json`.
2. Update `resolveOTelConfig()` in `extensions/copilot/src/platform/otel/common/otelConfig.ts`.
3. Update `agent_monitoring.md`.
4. Add focused configuration tests.

Never add a new VS Code setting merely to mirror a new runtime-owned managed setting. Follow the runtime-managed-settings ownership rules.

## Signal and routing checklist

For Agent Host provider-native signals:

1. Make the signal change in the provider/runtime repository that owns it.
2. Update that provider's authoritative signal reference.
3. Update VS Code only when routing, normalization, persistence, parent context, or host-produced metadata changes.
4. Confirm pass-through and DB mode behavior separately.
5. Confirm whether the signal is a trace, metric, or log. Only traces enter the Agent Host loopback and SQLite store.
6. Test the exact bundled provider version.

For host-produced spans:

- Keep names and attributes in `common/otel/agentHostOTelService.ts` or shared platform constants.
- Preserve `service.namespace=vscode.agent-host` while retaining distinct provider service names.
- Treat titles, prompts, responses, tool arguments, file paths, commands, and raw server names as sensitive content.
- Gate sensitive content on the effective content-capture policy and apply explicit bounds where required.
- Propagate W3C `traceparent` and `tracestate` through the provider's supported boundary.

For local Copilot Chat signals:

- Depend on `IOTelService`, not directly on an OTel SDK from consumers.
- Use standard `gen_ai.*` keys when they exist.
- Put new Copilot-specific attributes under `github.copilot.*`; do not add new `copilot_chat.*` keys.
- Preserve documented legacy keys when existing consumers require dual emission.
- Decide explicitly whether a new operation is exportable.
- Keep Agent Debug Log-only records out of user OTLP and SQLite export.
- Pass free-form content through `truncateForOTel` with the configured maximum.

## Provider boundaries

Do not claim one protocol matrix for every Agent Host provider:

- Copilot runtime owns its native OTLP/HTTP JSON/protobuf behavior and does not support OTLP/gRPC.
- Claude receives OTel configuration through its launch environment.
- Codex receives launch-time `otel.*` overrides.
- Agent Host's DB loopback is always OTLP/HTTP JSON.
- External protobuf and gRPC traces cannot be transcoded by Agent Host and therefore remain local in DB mode.

Check the provider launch code and bundled provider version before documenting support.

## Documentation rules

- Keep current Agent Host architecture and data flow in `src/vs/platform/agentHost/OTEL.md`.
- Keep local extension-host usage in `extensions/copilot/docs/monitoring/agent_monitoring.md`.
- Keep exhaustive native Copilot signals in the runtime repository.
- Keep this skill procedural. Do not duplicate complete settings, environment-variable, attribute, event, or metric tables here.
- Use immutable commit permalinks when citing cross-repository evidence in issues and pull requests. Avoid version-specific links in evergreen guidance unless the update process owns keeping them current.
- If executable source and documentation disagree, verify with tests and call out the discrepancy rather than silently selecting one.

## Validation

Choose the smallest checks that cover the change.

Agent Host examples:

```bash
./scripts/test.sh --grep "AgentHostOTel\|agent host.*OTel"
./scripts/test-integration.sh --run src/vs/platform/agentHost/test/node/otel/agentHostOTelService.integrationTest.ts
```

Local Copilot Chat examples, from `extensions/copilot/`:

```bash
npx tsc --noEmit --project tsconfig.json
npm test -- --grep "OTel"
```

For documentation-only changes, verify:

- every relative link resolves;
- setting and command IDs exist in source;
- environment-variable names match translation and parsing code;
- provider/runtime claims match the bundled versions;
- Mermaid diagrams render;
- no current document directs contributors to deprecated extension-host CLI architecture.

## Anti-patterns

- Treating deprecated extension-host Copilot CLI code as the current architecture.
- Copying the runtime's exhaustive signal catalog into VS Code docs.
- Assuming runtime `main` matches the package bundled by VS Code.
- Describing Agent Host and local Copilot Chat settings as interchangeable.
- Sending metrics or logs through the trace-only Agent Host loopback.
- Claiming all providers support the same OTLP protocols.
- Emitting sensitive content without the effective capture-content gate.
- Using raw attribute strings where the owning component provides constants.
- Adding debug-only spans under an exportable operation without an explicit non-export contract.
