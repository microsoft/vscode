---
name: otel
description: OpenTelemetry instrumentation for the Copilot Chat extension — covers the four agent execution paths, the IOTelService abstraction, span/metric/event conventions, and the relationship between code and the user/developer monitoring docs. Use when adding/changing OTel spans, metrics, or events; instrumenting a new agent surface; touching the Copilot CLI bridge or Claude span emission; or updating `extensions/copilot/docs/monitoring/agent_monitoring*.md`.
---

# OpenTelemetry Instrumentation Skill

When adding, changing, or reviewing OTel telemetry in the Copilot Chat extension, **always read the two source-of-truth docs first** and **always keep them in sync with the code you change**.

## 1. Authoritative Documents

The `extensions/copilot/docs/monitoring/` directory contains the two specs that define the OTel contract for the extension. Treat them like the layout / layer specs in `vs/sessions`.

| Document | Path | Audience | Covers |
|---|---|---|---|
| User-facing | `extensions/copilot/docs/monitoring/agent_monitoring.md` | Extension users | Quick start, settings, env vars, exported spans/metrics/events, backend setup guides |
| Architecture | `extensions/copilot/docs/monitoring/agent_monitoring_arch.md` | Developers | Multi-agent strategies, span hierarchies, file structure, instrumentation points, `IOTelService`, configuration channels |
| Visual flow | `extensions/copilot/docs/monitoring/otel-data-flow.html` | Developers | Renders the bridge data flow for the in-process Copilot CLI agent |

If the implementation changes, **you must update the relevant doc in the same PR**. The arch doc is the most likely to drift; treat divergence as a bug.

## 2. Architecture at a Glance

The extension has four agent execution paths, each with a different OTel strategy:

| Agent | Process Model | Strategy | Debug Panel Source |
|---|---|---|---|
| **Foreground** (`toolCallingLoop`) | Extension host | Direct `IOTelService` spans | Extension spans |
| **Copilot CLI in-process** | Extension host (same process) | **Bridge SpanProcessor** — SDK creates spans natively; bridge forwards to debug panel | SDK native spans via bridge |
| **Copilot CLI terminal** | Separate terminal process | Forward OTel env vars | N/A (separate process) |
| **Claude Code** | Child process (Node fork) | **Synthesized from SDK messages** — extension intercepts the Claude SDK message stream in `claudeMessageDispatch.ts` and emits GenAI spans; LLM calls are proxied through `claudeLanguageModelServer.ts` (which calls `chatMLFetcher`, producing standard `chat` spans). | Extension spans |

> **Why asymmetric?** The CLI SDK runs in-process with full trace hierarchy (subagents, permissions, hooks). A bridge captures this directly. Claude runs as a separate process — internal spans are inaccessible, so the extension synthesizes spans by translating SDK messages and proxying the model API.

## 3. Where Things Live (canonical map)

```
extensions/copilot/src/platform/otel/
├── common/
│   ├── otelService.ts          # IOTelService interface + ISpanHandle + injectCompletedSpan
│   ├── otelConfig.ts           # Config resolution (env → settings → defaults), enabledVia, dbSpanExporter
│   ├── noopOtelService.ts      # Zero-cost no-op (used by chatLib / tests)
│   ├── inMemoryOTelService.ts  # ← actually under node/, see below
│   ├── agentOTelEnv.ts         # deriveCopilotCliOTelEnv / deriveClaudeOTelEnv
│   ├── genAiAttributes.ts      # ⚠ Single source of truth for attribute keys & enums
│   ├── genAiEvents.ts          # Event emitter helpers (emit*Event)
│   ├── genAiMetrics.ts         # GenAiMetrics class
│   ├── messageFormatters.ts    # truncateForOTel, normalizeProviderMessages, toSystemInstructions, …
│   ├── workspaceOTelMetadata.ts
│   ├── sessionUtils.ts
│   └── index.ts                # ⚠ Public barrel — re-export new helpers/constants here
└── node/
    ├── otelServiceImpl.ts      # NodeOTelService + DiagnosticSpanExporter + FilteredSpanExporter + EXPORTABLE_OPERATION_NAMES
    ├── inMemoryOTelService.ts  # InMemoryOTelService (used when OTel is disabled — feeds debug panel only)
    ├── fileExporters.ts        # File-based span/log/metric exporters
    └── sqlite/                 # OTelSqliteStore + SqliteSpanExporter (dbSpanExporter pipeline)

extensions/copilot/src/extension/
├── chatSessions/
│   ├── copilotcli/node/
│   │   ├── copilotCliBridgeSpanProcessor.ts  # Bridge: SDK spans → IOTelService (+ hook span enrichment)
│   │   ├── copilotcliSession.ts              # Root invoke_agent copilotcli span + traceparent + hook stash
│   │   └── copilotcliSessionService.ts       # Bridge installation + env var setup
│   └── claude/
│       ├── common/claudeMessageDispatch.ts   # execute_tool / execute_hook spans + subagent context wiring
│       └── node/
│           ├── claudeOTelTracker.ts          # invoke_agent claude span + per-session token/cost rollup
│           └── claudeLanguageModelServer.ts  # Local HTTP proxy → chatMLFetcher (chat spans)
├── chat/vscode-node/
│   └── chatHookService.ts                    # execute_hook spans for foreground agent hooks
├── intents/node/toolCallingLoop.ts           # invoke_agent spans for foreground agent
├── tools/vscode-node/toolsService.ts         # execute_tool spans for foreground tools
├── prompt/node/chatMLFetcher.ts              # chat spans for all LLM calls
├── byok/vscode-node/                         # BYOK provider chat spans (anthropicProvider, geminiNativeProvider, …)
└── trajectory/vscode-node/
    ├── otelChatDebugLogProvider.ts           # Debug panel data provider
    ├── otelSpanToChatDebugEvent.ts           # Span → ChatDebugEvent conversion
    └── otlpFormatConversion.ts               # OTLP ↔ in-memory span format
```

## 4. Service Layer & Selection

`IOTelService` ([otelService.ts](../../../extensions/copilot/src/platform/otel/common/otelService.ts)) is the only abstraction consumers should depend on — never import the OTel SDK directly outside `node/otelServiceImpl.ts`. Three implementations:

| Class | When Used |
|---|---|
| `NoopOTelService` | `chatLib` and tests where no telemetry pipeline is needed — zero cost |
| `NodeOTelService` | OTel enabled — full SDK, OTLP/file/console export, optional SQLite span exporter |
| `InMemoryOTelService` | Registered when OTel is **disabled** — no SDK is loaded, but spans/metrics/logs are still captured in-memory so the Agent Debug Log panel keeps working |

Selection happens in [`src/extension/extension/vscode-node/services.ts`](../../../extensions/copilot/src/extension/extension/vscode-node/services.ts): exactly one of `NodeOTelService` or `InMemoryOTelService` is bound to `IOTelService` per extension host based on `resolveOTelConfig().enabled`.

## 5. Span / Metric / Event Conventions

Follow the [OTel GenAI semantic conventions](https://github.com/open-telemetry/semantic-conventions/blob/main/docs/gen-ai/). **Always use the constants from [`genAiAttributes.ts`](../../../extensions/copilot/src/platform/otel/common/genAiAttributes.ts) — never raw string literals.**

| Operation | Span Name | Kind | Constant |
|---|---|---|---|
| Agent orchestration | `invoke_agent {agent_name}` | `INTERNAL` | `GenAiOperationName.INVOKE_AGENT` |
| LLM API call | `chat {model}` | `CLIENT` | `GenAiOperationName.CHAT` |
| Tool execution | `execute_tool {tool_name}` | `INTERNAL` | `GenAiOperationName.EXECUTE_TOOL` |
| Hook execution | `execute_hook {hook_type}` | `INTERNAL` | `GenAiOperationName.EXECUTE_HOOK` |

Attribute namespaces:

| Namespace | Constant module | Examples |
|---|---|---|
| `gen_ai.*` | `GenAiAttr` | `gen_ai.operation.name`, `gen_ai.usage.input_tokens` |
| `copilot_chat.*` | `CopilotChatAttr` | `copilot_chat.session_id`, `copilot_chat.chat_session_id`, `copilot_chat.hook_*` |
| `github.copilot.*` | `CopilotCliSdkAttr` | SDK-emitted hook attributes (read-only — bridge & debug panel) |
| `claude_code.*` | (raw) | Claude subprocess SDK attributes — only ever observed in OTLP, not produced by the extension |

### Standard span pattern

```ts
return this._otelService.startActiveSpan(
    `execute_tool ${name}`,
    {
        kind: SpanKind.INTERNAL,
        attributes: {
            [GenAiAttr.OPERATION_NAME]: GenAiOperationName.EXECUTE_TOOL,
            [GenAiAttr.TOOL_NAME]: name,
            // …
        },
    },
    async (span) => {
        try {
            const result = await this._actualWork();
            span.setStatus(SpanStatusCode.OK);
            return result;
        } catch (err) {
            span.setStatus(SpanStatusCode.ERROR, err instanceof Error ? err.message : String(err));
            span.setAttribute(StdAttr.ERROR_TYPE, err instanceof Error ? err.constructor.name : 'Error');
            throw err;
        }
    },
);
```

### Cross-boundary trace propagation

```ts
// Parent: store context keyed by something the child knows
const ctx = this._otelService.getActiveTraceContext();
if (ctx) { this._otelService.storeTraceContext(`subagent:invocation:${id}`, ctx); }

// Child: retrieve and use as parent
const parentCtx = this._otelService.getStoredTraceContext(`subagent:invocation:${id}`);
return this._otelService.startActiveSpan('invoke_agent child', { parentTraceContext: parentCtx, … }, fn);
```

### Content capture

The extension uses two conventions side-by-side; pick the right one for the attribute you're adding.

1. **Always emit (truncated)** — used for inputs/outputs that the Agent Debug Log panel needs to be useful even when OTel export is off (e.g. `gen_ai.tool.call.arguments` in [`toolsService.ts`](../../../extensions/copilot/src/extension/tools/vscode-node/toolsService.ts), and `copilot_chat.hook_input` / `hook_output` in [`chatHookService.ts`](../../../extensions/copilot/src/extension/chat/vscode-node/chatHookService.ts)). The attribute is captured unconditionally but always passed through `truncateForOTel`. Use this for moderate-sized, generally-non-secret arguments / results.
2. **Gate on `config.captureContent`** — used for full prompt / response / system-instruction bodies (e.g. `gen_ai.input.messages`, `gen_ai.output.messages`, `gen_ai.system_instructions`, `gen_ai.tool.definitions` in [`chatMLFetcher.ts`](../../../extensions/copilot/src/extension/prompt/node/chatMLFetcher.ts) and the BYOK providers). These are larger and more likely to contain user secrets.

```ts
// Pattern 1 — always emit, always truncate
span.setAttribute(GenAiAttr.TOOL_CALL_ARGUMENTS, truncateForOTel(JSON.stringify(args)));

// Pattern 2 — gated on captureContent
if (this._otelService.config.captureContent) {
    span.setAttribute(GenAiAttr.INPUT_MESSAGES, truncateForOTel(JSON.stringify(messages)));
}
```

### Debug panel vs OTLP isolation

Spans whose `gen_ai.operation.name` is **not** in `EXPORTABLE_OPERATION_NAMES` (defined in [`otelServiceImpl.ts`](../../../extensions/copilot/src/platform/otel/node/otelServiceImpl.ts)) are visible to the debug panel via `onDidCompleteSpan` but excluded from OTLP and SQLite exporters by `DiagnosticSpanExporter` and `FilteredSpanExporter`. Currently exportable: `chat`, `invoke_agent`, `execute_tool`, `embeddings`, `execute_hook`. **If you add a new operation name that should reach the user's collector, update `EXPORTABLE_OPERATION_NAMES` and document it in `agent_monitoring.md`.**

## 6. Configuration Surface (must stay in sync)

When you add or change a setting/env var/command, update **all three** of:

1. The setting/command registration in [`extensions/copilot/package.json`](../../../extensions/copilot/package.json) (search for `github.copilot.chat.otel`).
2. `resolveOTelConfig` in [`otelConfig.ts`](../../../extensions/copilot/src/platform/otel/common/otelConfig.ts) — if the setting affects runtime config — and the `enabledVia` channel if it can implicitly enable OTel.
3. `agent_monitoring.md` ("VS Code Settings", "Environment Variables", "Activation", "Commands" tables) **and** `agent_monitoring_arch.md` ("Activation Channels", "Agent-Specific Env Var Translation" tables).

For sub-process env vars, also update:

- `deriveCopilotCliOTelEnv` / `deriveClaudeOTelEnv` in [`agentOTelEnv.ts`](../../../extensions/copilot/src/platform/otel/common/agentOTelEnv.ts).
- The corresponding tests in `src/platform/otel/common/test/agentOTelEnv.spec.ts`.

## 7. Procedure Checklists

### When adding a new span / attribute

1. Add the attribute key as a constant to `genAiAttributes.ts` (under `GenAiAttr`, `CopilotChatAttr`, or a new domain group). Never inline a raw `'copilot_chat.foo'` literal.
2. Add it to the public barrel in [`index.ts`](../../../extensions/copilot/src/platform/otel/common/index.ts) if it lives in a new group.
3. Use `IOTelService.startActiveSpan` (preferred) or `startSpan` — never `BasicTracerProvider` / `getTracer` directly.
4. Pass the value through `truncateForOTel` (mandatory for any free-form content attribute — prevents OTLP batch failures). Decide whether the attribute should be **always-emitted** (debug-panel-essential, e.g. tool args, hook input/output) or **gated on `config.captureContent`** (large prompt/response bodies, system instructions); follow the existing convention for similar data.
5. If the new operation should reach OTLP, add its op-name to `EXPORTABLE_OPERATION_NAMES` in `otelServiceImpl.ts`.
6. Document the new attribute in `agent_monitoring.md` (under the relevant span table) **and** add a test in `src/platform/otel/common/test/`.

### When adding a new metric / event

1. Add the helper to `genAiMetrics.ts` or `genAiEvents.ts` (mirror existing static / functional patterns).
2. Re-export it from `index.ts`.
3. Add the metric/event row to `agent_monitoring.md` ("Metrics" / "Events" sections) with all attributes documented.
4. Add a unit test in `src/platform/otel/common/test/genAiMetrics.spec.ts` or `genAiEvents.spec.ts` (assert the exact name + attribute keys).

### When instrumenting a new agent surface

1. Pick a strategy: direct spans (foreground-style), bridge processor (CLI-style), or message-stream synthesis (Claude-style).
2. Add the new emit site to the **Instrumentation Points** table in `agent_monitoring_arch.md` and the **Span Hierarchies** diagrams.
3. If you forward OTel env vars to a child process, do it via a new `derive*OTelEnv` helper in `agentOTelEnv.ts` and add a row to the **Agent-Specific Env Var Translation** table.
4. Wire trace propagation explicitly with `storeTraceContext` / `parentTraceContext` for any subagent or async boundary; do not rely on global active context across processes.

### When changing the Copilot CLI bridge

The bridge (`copilotCliBridgeSpanProcessor.ts`) reaches into `_delegate._activeSpanProcessor._spanProcessors` — internal OTel SDK v2 state. This is documented as a known risk. If you touch it:

- Keep the runtime guard that degrades gracefully if the internal shape changes.
- Update the **⚠ SDK Internal Access Warning** block in `agent_monitoring_arch.md` if the access pattern changes.
- Add a unit test in `copilotCliBridgeSpanProcessor.spec.ts`.

## 8. Validation

Before sending a PR that touches OTel code:

```bash
# From extensions/copilot/
npx tsc --noEmit --project tsconfig.json

# OTel + Bridge unit tests
npm test -- --grep "OTel\|Bridge"
```

Manual sanity checks:

- The Aspire Dashboard quick-start in `agent_monitoring.md` still works end-to-end (one agent message → `invoke_agent` + `chat` + `execute_tool` spans visible at <http://localhost:18888>).
- The Agent Debug Log panel in VS Code still shows the full span tree for foreground, Copilot CLI, and Claude sessions.

## 9. Known Risks & Limitations

These are documented in `agent_monitoring_arch.md` — preserve them:

- SDK `_spanProcessors` internal access (graceful runtime guard).
- Two TracerProviders in the same process when CLI SDK is active.
- `process.env` mutation for the CLI SDK (only OTel-specific vars, set before `LocalSessionManager` ctor).
- Single `captureContent` flag for the CLI SDK applies to both debug panel and OTLP — document any user-visible change clearly.
- Claude SDK has no file exporter, and the CLI runtime only supports `otlp-http`.

## 10. Anti-Patterns to Reject

- ❌ Importing `@opentelemetry/api` (or any `@opentelemetry/*` package) from anywhere other than `node/otelServiceImpl.ts`, `fileExporters.ts`, or the CLI bridge processor type imports.
- ❌ Hard-coded attribute keys: `'copilot_chat.hook_type'` instead of `CopilotChatAttr.HOOK_TYPE`.
- ❌ Hard-coded provider strings: `'github'` / `'anthropic'` / `'gemini'` instead of `GenAiProviderName.*`.
- ❌ Magic `SpanStatusCode` numbers (`code: 1`, `code: 2`) — use the enum.
- ❌ Emitting any free-form content attribute without passing it through `truncateForOTel` — OTLP batches will silently drop or fail.
- ❌ Logging full prompt / response / system-instruction bodies without `config.captureContent` gating (these are pattern 2 above).
- ❌ Adding a span operation name without deciding whether it's exportable (`EXPORTABLE_OPERATION_NAMES`).
- ❌ Updating instrumentation without updating `agent_monitoring.md` / `agent_monitoring_arch.md` in the same change.
