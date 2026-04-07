# OTel Instrumentation — Developer Guide

This document describes the architecture, code structure, and conventions for the OpenTelemetry instrumentation in the Copilot Chat extension. It covers all four agent execution paths.

For user-facing configuration and usage, see [agent_monitoring.md](agent_monitoring.md).
For a visual data flow diagram, see [otel-data-flow.html](otel-data-flow.html).

---

## Multi-Agent Architecture

The extension has four agent execution paths, each with different OTel strategies:

| Agent | Process Model | Strategy | Debug Panel Source |
|---|---|---|---|
| **Foreground** (toolCallingLoop) | Extension host | Direct `IOTelService` spans | Extension spans |
| **Copilot CLI in-process** | Extension host (same process) | **Bridge SpanProcessor** — SDK creates spans natively; bridge forwards to debug panel | SDK native spans via bridge |
| **Copilot CLI terminal** | Separate terminal process | Forward OTel env vars | N/A (separate process) |
| **Claude Code** | Child process (Node fork) | **Synthetic spans** — extension creates spans from message loop | Extension synthetic spans |

> **Why asymmetric?** The CLI SDK runs in-process with full trace hierarchy (subagents, permissions, hooks). A bridge captures this directly. Claude runs as a separate process — internal spans are inaccessible, so synthetic spans are the only option.

### Copilot CLI Bridge SpanProcessor

The extension injects a `CopilotCliBridgeSpanProcessor` into the SDK's `BasicTracerProvider` to forward completed spans to the debug panel. See [otel-data-flow.html](otel-data-flow.html) for the full visual diagram.

```
Extension Root (tracer A):
  invoke_agent copilotcli → traceparent → SDK

SDK Native (tracer B, same traceId):
  invoke_agent → chat → execute_tool → invoke_agent (subagent) → permission → ...

Bridge: SDK Provider B → MultiSpanProcessor._spanProcessors.push(bridge)
  → onEnd(ReadableSpan) → ICompletedSpanData + CHAT_SESSION_ID → IOTelService.injectCompletedSpan
  → onDidCompleteSpan → Debug Panel + File Logger
```

**⚠️ SDK Internal Access Warning**: The bridge accesses `_delegate._activeSpanProcessor._spanProcessors` — internal properties of the OTel SDK v2 `BasicTracerProvider`. This is necessary because v2 removed the public `addSpanProcessor()` API. The SDK itself uses this same pattern in `forceFlush()`. This may break on OTel SDK major version upgrades — the bridge includes a runtime guard that degrades gracefully.

### Span Hierarchies

#### Foreground Agent

```
invoke_agent copilot (INTERNAL)          ← toolCallingLoop.ts
├── chat gpt-4o (CLIENT)                 ← chatMLFetcher.ts
│   ├── execute_tool readFile (INTERNAL) ← toolsService.ts
│   └── execute_tool runCommand (INTERNAL)
├── chat gpt-4o (CLIENT)
└── ...
```

#### Copilot CLI in-process (Bridge)

```
invoke_agent copilotcli (INTERNAL)       ← copilotcliSession.ts (tracer A)
└── [traceparent linked]
    invoke_agent (CLIENT)                ← SDK OtelSessionTracker (tracer B)
    ├── chat claude-opus-4.6-1m (CLIENT)
    ├── execute_tool task (INTERNAL)
    │   └── invoke_agent task (CLIENT)   ← SUBAGENT
    │       ├── chat claude-opus-4.6-1m
    │       ├── execute_tool bash
    │       │   └── permission
    │       └── execute_tool report_intent
    ├── chat claude-opus-4.6-1m (CLIENT)
    └── ...
```

#### Copilot CLI terminal (independent)

```
invoke_agent (CLIENT)                    ← standalone copilot binary
│   service.name = github-copilot
├── chat gpt-4o (CLIENT)
└── (independent root traces, no extension link)
```

#### Claude Code (synthetic)

```
invoke_agent claude (INTERNAL)           ← claudeCodeAgent.ts
├── chat claude-sonnet-4 (CLIENT)        ← chatMLFetcher.ts (FREE)
├── execute_hook PreToolUse (INTERNAL)   ← claudeHookRegistry.ts (PR #4578)
├── execute_tool Read (INTERNAL)         ← message loop (PR #4505)
├── execute_hook PostToolUse (INTERNAL)  ← claudeHookRegistry.ts (PR #4578)
├── chat claude-sonnet-4 (CLIENT)
├── execute_hook PreToolUse (INTERNAL)
├── execute_tool Edit (INTERNAL)
├── execute_hook PostToolUse (INTERNAL)
└── (flat hierarchy — no subagent nesting)
```

---

## File Structure

```
src/platform/otel/
├── common/
│   ├── otelService.ts          # IOTelService interface + ISpanHandle + injectCompletedSpan
│   ├── otelConfig.ts           # Config resolution (env → settings → defaults)
│   ├── noopOtelService.ts      # Zero-cost no-op implementation
│   ├── agentOTelEnv.ts         # deriveCopilotCliOTelEnv / deriveClaudeOTelEnv
│   ├── genAiAttributes.ts      # GenAI semantic convention attribute keys
│   ├── genAiEvents.ts          # Event emitter helpers
│   ├── genAiMetrics.ts         # GenAiMetrics class (metric recording)
│   ├── messageFormatters.ts    # Message → OTel JSON schema converters
│   ├── index.ts                # Public API barrel export
│   └── test/
└── node/
    ├── otelServiceImpl.ts      # NodeOTelService (real SDK implementation)
    ├── inMemoryOTelService.ts  # InMemoryOTelService (debug panel, no SDK)
    ├── fileExporters.ts        # File-based span/log/metric exporters
    └── test/

src/extension/chatSessions/copilotcli/node/
├── copilotCliBridgeSpanProcessor.ts  # Bridge: SDK spans → IOTelService
├── copilotcliSession.ts              # Root invoke_agent span + traceparent
└── copilotcliSessionService.ts       # Bridge installation + env var setup

src/extension/trajectory/vscode-node/
├── otelChatDebugLogProvider.ts       # Debug panel data provider
└── otelSpanToChatDebugEvent.ts       # Span → ChatDebugEvent conversion
```

### Instrumentation Points

| File | What Gets Instrumented |
|---|---|
| `chatMLFetcher.ts` | `chat` spans — all LLM API calls (foreground + Claude proxy) |
| `anthropicProvider.ts` | `chat` spans — BYOK Anthropic requests |
| `toolCallingLoop.ts` | `invoke_agent` spans — foreground agent orchestration |
| `toolsService.ts` | `execute_tool` spans — foreground tool invocations |
| `copilotcliSession.ts` | `invoke_agent copilotcli` wrapper span + traceparent propagation |
| `copilotCliBridgeSpanProcessor.ts` | Bridge: SDK `ReadableSpan` → `ICompletedSpanData` |
| `copilotcliSessionService.ts` | Bridge installation + OTel env vars for SDK |
| `copilotCLITerminalIntegration.ts` | OTel env vars forwarded to terminal process |
| `claudeCodeAgent.ts` | `invoke_agent claude` + `execute_tool` synthetic spans |
| `claudeHookRegistry.ts` | `execute_hook` spans — Claude hook executions (PR #4578) |
| `otelSpanToChatDebugEvent.ts` | Span → debug panel event conversion |

---

## Service Layer

### `IOTelService` Interface

The core abstraction. Consumers depend on this interface, never on the OTel SDK directly.

Key methods:
- `startSpan` / `startActiveSpan` — create trace spans
- `injectCompletedSpan` — inject externally-created spans (bridge uses this)
- `onDidCompleteSpan` — event fired when any span ends (debug panel listens)
- `recordMetric` / `incrementCounter` — metrics
- `emitLogRecord` — OTel log events
- `storeTraceContext` / `runWithTraceContext` — cross-boundary propagation

### Implementations

| Class | When Used |
|---|---|
| `NoopOTelService` | OTel disabled (default) — zero cost |
| `NodeOTelService` | OTel enabled — full SDK, OTLP export |
| `InMemoryOTelService` | Debug panel always-on — no SDK, in-memory only |

### Two TracerProviders in Same Process

When the CLI SDK is active with OTel enabled:
- **Provider A** (`NodeOTelService`): Extension's provider, stored tracer ref survives global override
- **Provider B** (`BasicTracerProvider`): SDK's provider, replaces A as global

Both export to the same OTLP endpoint. Bridge processor sits on Provider B, forwards to Provider A's event emitter.

---

## Configuration

`resolveOTelConfig()` implements layered precedence:

1. `COPILOT_OTEL_*` env vars (highest)
2. `OTEL_EXPORTER_OTLP_*` standard env vars
3. VS Code settings (`github.copilot.chat.otel.*`)
4. Defaults (lowest)

Kill switch: `telemetry.telemetryLevel === 'off'` → all OTel disabled.

### Agent-Specific Env Var Translation

| Extension Config | Copilot CLI Env Var | Claude Code Env Var |
|---|---|---|
| `enabled` | `COPILOT_OTEL_ENABLED=true` | `CLAUDE_CODE_ENABLE_TELEMETRY=1` |
| `otlpEndpoint` | `OTEL_EXPORTER_OTLP_ENDPOINT` | `OTEL_EXPORTER_OTLP_ENDPOINT` |
| `captureContent` | `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=true` | `OTEL_LOG_USER_PROMPTS=1` |
| `fileExporterPath` | `COPILOT_OTEL_FILE_EXPORTER_PATH` | N/A |

### Debug Panel Always-On Behavior

The CLI SDK's OTel (`OtelLifecycle`) is **always initialized** regardless of user OTel settings. This ensures the debug panel always receives SDK native spans via the bridge. The `COPILOT_OTEL_ENABLED` env var is set before `LocalSessionManager` construction so the SDK creates its `OtelSessionTracker`.

When user OTel is **disabled**: SDK spans flow through bridge → debug panel only (no OTLP export).
When user OTel is **enabled**: SDK spans flow through bridge → debug panel AND through SDK's own `BatchSpanProcessor` → OTLP.

### Content Capture Behavior Matrix

The CLI SDK uses a single `captureContent` flag (`OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT`) that controls content capture for **both** the debug panel and OTLP export. The extension sets this flag before SDK initialization based on the following precedence:

| # | OTel Enabled | `captureContent` env | `captureContent` setting | SDK Flag | Debug Panel Content | OTLP Content |
|---|---|---|---|---|---|---|
| 1 | No | unset | unset | `true` | Yes | N/A (file → /dev/null) |
| 2 | No | unset | `true` | `true` | Yes | N/A (file → /dev/null) |
| 3 | No | unset | `false` | `true` | Yes | N/A (file → /dev/null) |
| 4 | Yes | unset | unset | `false` | No | No |
| 5 | Yes | unset | `true` | `true` | Yes | Yes |
| 6 | Yes | unset | `false` | `false` | No | No |
| 7 | Yes | `true` | any | `true` | Yes | Yes |
| 8 | Yes | `false` | any | `false` | No | No |
| 9 | No | `true` | any | `true` | Yes | N/A (file → /dev/null) |
| 10 | No | `false` | any | `false` | No | N/A (file → /dev/null) |

**Key design decisions:**

- **Rows 1–3**: When OTel is disabled, the extension forces `captureContent=true` so the debug panel always shows full content. OTLP is suppressed via a file exporter to `/dev/null`, so no content leaks externally.
- **Rows 4–6**: When OTel is enabled, the extension respects the user's `captureContent` setting because OTLP is active and content may be exported to an external collector.
- **Rows 7–8, 9–10**: Explicit env var overrides always win (standard OTel precedence).

> **Known Limitation: Single `captureContent` Flag**
>
> The CLI SDK exposes a single `captureContent` boolean that applies to both local (debug panel) and remote (OTLP) channels. There is no way to enable content for the debug panel while suppressing it from OTLP, or vice versa. This means:
>
> - When OTel is enabled with `captureContent: false` (the default), the debug panel also loses prompt/response bodies.
> - To see content in the debug panel while OTel is enabled, set `captureContent: true` — but this also sends content to OTLP.
>
> **Why can't this be fixed at the extension level?**
> - The SDK captures content at span creation time. By the time spans reach the bridge or exporter, the content is either present or absent — it cannot be added or removed after the fact.
> - `ReadableSpan` objects are immutable; neither the bridge nor an OTLP exporter can selectively strip or inject attributes.
> - Running two SDK instances with different `captureContent` flags is not architecturally feasible.
>
> A future SDK enhancement could provide separate flags for local vs. export channels.

### `service.name` Values

| Source | `service.name` |
|---|---|
| Extension (Provider A) | `copilot-chat` |
| Copilot CLI SDK / terminal | `github-copilot` |
| Claude Code subprocess | `claude-code` |

---

## Span Conventions

Follow the OTel GenAI semantic conventions. Use constants from `genAiAttributes.ts`:

| Operation | Span Name | Kind |
|---|---|---|
| Agent orchestration | `invoke_agent {agent_name}` | `INTERNAL` |
| LLM API call | `chat {model}` | `CLIENT` |
| Tool execution | `execute_tool {tool_name}` | `INTERNAL` |
| Hook execution | `execute_hook {hook_type}` | `INTERNAL` |

### Debug Panel Display Names

The debug panel uses span names directly for display (matching Grafana):
- Tool calls: `execute_tool {tool_name}` (from `span.name`)
- Hook executions: `execute_hook {hook_type}` (from `span.name`)
- Subagent invocations: `invoke_agent {agent_name}` (from `span.name`)
- SDK wrapper `invoke_agent` spans without an agent name are skipped as transparent containers

### Error Handling

```typescript
span.setStatus(SpanStatusCode.ERROR, error.message);
span.setAttribute(StdAttr.ERROR_TYPE, error.constructor.name);
```

### Content Capture

Gate on `otel.config.captureContent`:

```typescript
if (this._otelService.config.captureContent) {
  span.setAttribute(GenAiAttr.INPUT_MESSAGES, JSON.stringify(messages));
}
```

---

## Adding Instrumentation

### Pattern: Wrapping an Operation

```typescript
return this._otel.startActiveSpan(
  'execute_tool myTool',
  { kind: SpanKind.INTERNAL, attributes: { [GenAiAttr.TOOL_NAME]: 'myTool' } },
  async (span) => {
    try {
      const result = await this._actualWork();
      span.setStatus(SpanStatusCode.OK);
      return result;
    } catch (err) {
      span.setStatus(SpanStatusCode.ERROR, err instanceof Error ? err.message : String(err));
      throw err;
    }
  },
);
```

### Pattern: Cross-Boundary Trace Propagation

```typescript
// Parent: store context
const ctx = this._otelService.getActiveTraceContext();
if (ctx) { this._otelService.storeTraceContext(`subagent:${id}`, ctx); }

// Child: retrieve and use as parent
const parentCtx = this._otelService.getStoredTraceContext(`subagent:${id}`);
return this._otel.startActiveSpan('invoke_agent child', { parentTraceContext: parentCtx }, ...);
```

---

## Attribute Namespaces

| Namespace | Used By | Examples |
|---|---|---|
| `gen_ai.*` | All agents (standard) | `gen_ai.operation.name`, `gen_ai.usage.input_tokens` |
| `copilot_chat.*` | Extension-specific | `copilot_chat.session_id`, `copilot_chat.chat_session_id` |
| `github.copilot.*` | CLI SDK internal | `github.copilot.cost`, `github.copilot.aiu` |
| `claude_code.*` | Claude subprocess | `claude_code.token.usage`, `claude_code.cost.usage` |

---

## Debug Panel vs OTLP Isolation

The debug panel creates spans with non-standard operation names (`content_event`, `user_message`). These MUST NOT appear in the user's OTLP collector.

`DiagnosticSpanExporter` in `NodeOTelService` filters spans: only `invoke_agent`, `chat`, `execute_tool`, `embeddings`, `execute_hook` are exported. The `execute_hook` operation is used by both the foreground agent (`toolCallingLoop.ts`) and Claude hooks (`claudeHookRegistry.ts`, PR #4578). Debug-panel-only spans are visible via `onDidCompleteSpan` but excluded from OTLP batch export.

---

## Testing

```
src/platform/otel/common/test/
├── agentOTelEnv.spec.ts            # Env var derivation
├── genAiEvents.spec.ts
├── genAiMetrics.spec.ts
├── messageFormatters.spec.ts
├── noopOtelService.spec.ts
└── otelConfig.spec.ts

src/platform/otel/node/test/
├── fileExporters.spec.ts
└── traceContextPropagation.spec.ts

src/extension/chatSessions/copilotcli/node/test/
└── copilotCliBridgeSpanProcessor.spec.ts  # Bridge processor tests
```

Run with: `npm test -- --grep "OTel\|Bridge"`

---

## Risks & Known Limitations

| Risk | Impact | Mitigation |
|---|---|---|
| SDK `_spanProcessors` internal access | May break on OTel SDK v2 minor/major updates | Runtime guard with graceful fallback; same pattern SDK uses in `forceFlush()` |
| Two TracerProviders in same process | Span context may not cross provider boundary | Extension stores tracer ref; traceparent propagated explicitly |
| `process.env` mutation for CLI SDK | Affects extension host globally | Only set OTel-specific vars; set before SDK ctor |
| Duplicate `invoke_agent` spans in OTLP | Extension root + SDK root both exported | Different `service.name` distinguishes them |
| Claude file exporter not supported | Claude subprocess can't write to JSON-lines file | Documented limitation |
| CLI runtime only supports `otlp-http` | Terminal CLI can't use gRPC-only endpoints | Documented limitation |
