# Monitoring Agent Usage with OpenTelemetry

Copilot Chat can export **traces**, **metrics**, and **events** via [OpenTelemetry](https://opentelemetry.io/) (OTel) — giving you real-time visibility into agent interactions, LLM calls, tool executions, and token usage.

All signal names and attributes follow the [OTel GenAI Semantic Conventions](https://github.com/open-telemetry/semantic-conventions/blob/main/docs/gen-ai/), so the data works with any OTel-compatible backend: Jaeger, Grafana, Azure Monitor, Datadog, Honeycomb, and more.

## Quick Start

The fastest way to see Copilot Chat traces locally — no cloud account required. This guide uses the [Aspire Dashboard](https://aspire.dev/dashboard/standalone/), a lightweight container image from Microsoft that provides a trace viewer with a built-in OTLP endpoint. It can be used standalone, without the rest of .NET Aspire.

### Prerequisites

- **Docker** installed
- **VS Code** with the GitHub Copilot Chat extension

### 1. Start the Aspire Dashboard

```bash
docker run --rm -d \
  -p 18888:18888 \
  -p 4318:18890 \
  --name aspire-dashboard \
  mcr.microsoft.com/dotnet/aspire-dashboard:latest
```

This exposes the dashboard UI on port `18888` and an OTLP (HTTP) endpoint on port `4318`.

### 2. Configure VS Code

Open **Settings** (`Ctrl+,`) and add:

```json
{
  "github.copilot.chat.otel.enabled": true,
  "github.copilot.chat.otel.captureContent": true
}
```

> **Note:** You can also use environment variables instead of VS Code settings (see [Configuration](#configuration)). Environment variables always take precedence.

### 3. Generate Telemetry

Open Copilot Chat and send any message — for example, ask a question in Agent mode.

### 4. View Traces

Open http://localhost:18888 → **Traces**. You'll see `invoke_agent` spans with nested `chat` and `execute_tool` children.

![Screenshot showing agent interaction traces in the Aspire Dashboard with spans for invoke_agent, chat, and execute_tool.](../media/trace-aspire-dashboard.png)

### Teardown

```bash
docker stop aspire-dashboard
```

> **Tip:** See the [Aspire Dashboard standalone docs](https://aspire.dev/dashboard/standalone/) for more configuration options.

---

## Configuration

### VS Code Settings

Open **Settings** (`Ctrl+,`) and search for `copilot otel`:

| Setting | Type | Default | Description |
|---|---|---|---|
| `github.copilot.chat.otel.enabled` | boolean | `false` | Enable OTel emission |
| `github.copilot.chat.otel.exporterType` | string | `"otlp-http"` | `otlp-http`, `otlp-grpc`, `console`, or `file` |
| `github.copilot.chat.otel.otlpEndpoint` | string | `"http://localhost:4318"` | OTLP collector endpoint |
| `github.copilot.chat.otel.captureContent` | boolean | `false` | Capture full prompt/response content |
| `github.copilot.chat.otel.maxAttributeSizeChars` | integer | `0` | Max characters per OTel content attribute (prompts, tool args/results, hook input/output). `0` (the default) disables truncation so backends with no per-attribute limit get full payloads. Set to a positive value to match your backend's per-attribute size limit — consult your backend's documentation. The value counts JavaScript string characters (UTF-16 code units); for non-ASCII content one character can be multiple UTF-8 bytes on the wire. |
| `github.copilot.chat.otel.outfile` | string | `""` | File path for JSON-lines output |
| `github.copilot.chat.otel.dbSpanExporter.enabled` | boolean | `false` | Persist OTel spans to a local SQLite database for the **Chat: Export Agent Traces DB** command. Implicitly enables OTel. |

### Environment Variables

Environment variables **always take precedence** over VS Code settings.

| Variable | Default | Description |
|---|---|---|
| `COPILOT_OTEL_ENABLED` | `false` | Enable OTel. Also enabled when `OTEL_EXPORTER_OTLP_ENDPOINT` is set. |
| `COPILOT_OTEL_ENDPOINT` | — | OTLP endpoint URL (takes precedence over `OTEL_EXPORTER_OTLP_ENDPOINT`) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | — | Standard OTel OTLP endpoint URL |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | `http/protobuf` | OTLP protocol. Only `grpc` changes behavior; all other values use HTTP. |
| `COPILOT_OTEL_PROTOCOL` | — | Override OTLP protocol (`grpc` or `http`). Falls back to `OTEL_EXPORTER_OTLP_PROTOCOL`. |
| `OTEL_SERVICE_NAME` | `copilot-chat` | Service name in resource attributes |
| `OTEL_RESOURCE_ATTRIBUTES` | — | Extra resource attributes (`key1=val1,key2=val2`) |
| `COPILOT_OTEL_CAPTURE_CONTENT` | `false` | Capture full prompt/response content |
| `COPILOT_OTEL_MAX_ATTRIBUTE_SIZE_CHARS` | `0` | Override the max character size for OTel content attributes. `0` (default) disables truncation; set to a positive value when your backend has a per-attribute limit. Takes precedence over the `maxAttributeSizeChars` setting. |
| `COPILOT_OTEL_LOG_LEVEL` | `info` | Min log level: `trace`, `debug`, `info`, `warn`, `error` |
| `COPILOT_OTEL_FILE_EXPORTER_PATH` | — | Write all signals to this file (JSON-lines) |
| `COPILOT_OTEL_HTTP_INSTRUMENTATION` | `false` | Enable HTTP-level OTel instrumentation |
| `OTEL_EXPORTER_OTLP_HEADERS` | — | Auth headers (e.g., `Authorization=Bearer token`) |

### Activation

OTel is **off by default** with zero overhead. It activates when:

- `COPILOT_OTEL_ENABLED=true`, or
- `OTEL_EXPORTER_OTLP_ENDPOINT` is set, or
- `github.copilot.chat.otel.enabled` is `true`, or
- `github.copilot.chat.otel.dbSpanExporter.enabled` is `true` (the SDK pipeline must be active to feed the SQLite store).

### Commands

| Command | Description |
|---|---|
| **Chat: Export Agent Traces DB** (`github.copilot.chat.otel.exportAgentTracesDB`) | Export the local SQLite span database to a `.db` file. Only available when `github.copilot.chat.otel.dbSpanExporter.enabled` is `true`. |


---

## What Gets Exported

### Traces

Copilot Chat emits a hierarchical span tree for each agent interaction:

```
invoke_agent copilot                           [~15s]
  ├── chat gpt-4o                              [~3s]  (LLM requests tool calls)
  ├── execute_tool readFile                    [~50ms]
  ├── execute_tool runCommand                  [~2s]
  ├── chat gpt-4o                              [~4s]  (LLM generates final response)
  └── (span ends)
```

**`invoke_agent`** — wraps the entire agent orchestration (all LLM calls + tool executions).

| Attribute | Requirement | Example |
|---|---|---|
| `gen_ai.operation.name` | Required | `invoke_agent` |
| `gen_ai.provider.name` | Required | `github` |
| `gen_ai.agent.name` | Required | `copilot` |
| `gen_ai.conversation.id` | Required | `a1b2c3d4-...` |
| `gen_ai.request.model` | Recommended | `gpt-4o` |
| `gen_ai.response.model` | Recommended | `gpt-4o-2024-08-06` |
| `gen_ai.usage.input_tokens` | Recommended | `12500` |
| `gen_ai.usage.output_tokens` | Recommended | `3200` |
| `gen_ai.usage.cache_read.input_tokens` | When available | `8000` |
| `gen_ai.usage.cache_creation.input_tokens` | When available | `4200` |
| `copilot_chat.turn_count` | Always | `4` |
| `error.type` | On error | `Error` |
| `gen_ai.input.messages` | Opt-in (captureContent) | `[{"role":"user",...}]` |
| `gen_ai.output.messages` | Opt-in (captureContent) | `[{"role":"assistant",...}]` |
| `gen_ai.tool.definitions` | Opt-in (captureContent) | `[{"type":"function",...}]` |

**`chat`** — one span per LLM API call (span kind: `CLIENT`).

| Attribute | Requirement | Example |
|---|---|---|
| `gen_ai.operation.name` | Required | `chat` |
| `gen_ai.provider.name` | Required | `github` |
| `gen_ai.request.model` | Required | `gpt-4o` |
| `gen_ai.conversation.id` | Required | `a1b2c3d4-...` |
| `gen_ai.request.max_tokens` | Always | `2048` |
| `gen_ai.request.temperature` | When set | `0.1` |
| `gen_ai.request.top_p` | When set | `0.95` |
| `copilot_chat.request.max_prompt_tokens` | Always | `128000` |
| `gen_ai.response.id` | On response | `chatcmpl-abc123` |
| `gen_ai.response.model` | On response | `gpt-4o-2024-08-06` |
| `gen_ai.response.finish_reasons` | On response | `["stop"]` |
| `gen_ai.usage.input_tokens` | On response | `1500` |
| `gen_ai.usage.output_tokens` | On response | `250` |
| `gen_ai.usage.cache_read.input_tokens` | When available | `1200` |
| `gen_ai.usage.cache_creation.input_tokens` | When available | `300` |
| `copilot_chat.time_to_first_token` | On response | `450` |
| `server.address` | When available | `api.github.com` |
| `copilot_chat.debug_name` | When available | `agentMode` |
| `error.type` | On error | `TimeoutError` |
| `gen_ai.input.messages` | Opt-in (captureContent) | `[{"role":"system",...}]` |
| `gen_ai.system_instructions` | Opt-in (captureContent) | `[{"type":"text",...}]` |

**`execute_tool`** — one span per tool invocation (span kind: `INTERNAL`).

| Attribute | Requirement | Example |
|---|---|---|
| `gen_ai.operation.name` | Required | `execute_tool` |
| `gen_ai.tool.name` | Required | `readFile` |
| `gen_ai.tool.type` | Required | `function` or `extension` (MCP tools) |
| `gen_ai.tool.call.id` | Recommended | `call_abc123` |
| `gen_ai.tool.description` | When available | `Read the contents of a file` |
| `error.type` | On error | `FileNotFoundError` |
| `gen_ai.tool.call.arguments` | Opt-in (captureContent) | `{"filePath":"/src/index.ts"}` |
| `gen_ai.tool.call.result` | Opt-in (captureContent) | `(file contents or summary)` |

### Metrics

#### GenAI Convention Metrics

| Metric | Type | Unit | Description |
|---|---|---|---|
| `gen_ai.client.operation.duration` | Histogram | s | LLM API call duration |
| `gen_ai.client.token.usage` | Histogram | tokens | Token counts (input/output) |

**`gen_ai.client.operation.duration` attributes:**

| Attribute | Description |
|---|---|
| `gen_ai.operation.name` | Operation type (e.g., `chat`) |
| `gen_ai.provider.name` | Provider (e.g., `github`, `anthropic`) |
| `gen_ai.request.model` | Requested model |
| `gen_ai.response.model` | Resolved model (if different) |
| `server.address` | Server hostname |
| `server.port` | Server port |
| `error.type` | Error class (if failed) |

**`gen_ai.client.token.usage` attributes:**

| Attribute | Description |
|---|---|
| `gen_ai.operation.name` | Operation type |
| `gen_ai.provider.name` | Provider name |
| `gen_ai.token.type` | `input` or `output` |
| `gen_ai.request.model` | Requested model |
| `gen_ai.response.model` | Resolved model |
| `server.address` | Server hostname |

#### Extension-Specific Metrics

| Metric | Type | Unit | Description |
|---|---|---|---|
| `copilot_chat.tool.call.count` | Counter | calls | Tool invocations by name and success |
| `copilot_chat.tool.call.duration` | Histogram | ms | Tool execution latency |
| `copilot_chat.agent.invocation.duration` | Histogram | s | Agent mode end-to-end duration |
| `copilot_chat.agent.turn.count` | Histogram | turns | LLM round-trips per agent invocation |
| `copilot_chat.session.count` | Counter | sessions | Chat sessions started |
| `copilot_chat.time_to_first_token` | Histogram | s | Time to first SSE token |

**`copilot_chat.tool.call.count` attributes:** `gen_ai.tool.name`, `success` (boolean)

**`copilot_chat.tool.call.duration` attributes:** `gen_ai.tool.name`

**`copilot_chat.agent.invocation.duration` attributes:** `gen_ai.agent.name`

**`copilot_chat.agent.turn.count` attributes:** `gen_ai.agent.name`

**`copilot_chat.time_to_first_token` attributes:** `gen_ai.request.model`

#### Agent Activity & Outcome Metrics

These metrics track the activity and outcomes of agentic code changes across all surfaces (agent mode, inline chat, background CLI, cloud sessions).

| Metric | Type | Unit | Description |
|---|---|---|---|
| `copilot_chat.edit.acceptance.count` | Counter | edits | Edit accept/reject decisions (inline chat, chat editing, hunk-level) |
| `copilot_chat.chat_edit.outcome.count` | Counter | edits | File-level chat editing session outcomes (accepted/rejected/saved) |
| `copilot_chat.lines_of_code.count` | Counter | lines | Lines of code added/removed by accepted agent edits |
| `copilot_chat.edit.survival.four_gram` | Histogram | ratio (0-1) | 4-gram text similarity survival score |
| `copilot_chat.edit.survival.no_revert` | Histogram | ratio (0-1) | No-revert survival score |
| `copilot_chat.user.action.count` | Counter | actions | User engagement: copy, insert, apply, followup |
| `copilot_chat.user.feedback.count` | Counter | votes | Thumbs up/down on chat responses |
| `copilot_chat.agent.edit_response.count` | Counter | responses | Agent edit responses by success/error |
| `copilot_chat.agent.summarization.count` | Counter | events | Context summarization outcomes (applied/failed) |
| `copilot_chat.pull_request.count` | Counter | PRs | Pull requests created via CLI agent |
| `copilot_chat.cloud.session.count` | Counter | sessions | Cloud/remote agent sessions by partner |
| `copilot_chat.cloud.pr_ready.count` | Counter | events | Remote agent job PR ready notifications |

**`copilot_chat.edit.acceptance.count` attributes:** `copilot_chat.edit.source` (`inline_chat`/`chat_editing`/`chat_editing_hunk`/`apply_patch`/`replace_string`/`code_mapper`), `copilot_chat.edit.outcome` (`accepted`/`rejected`), `copilot_chat.language_id` (optional)

**`copilot_chat.chat_edit.outcome.count` attributes:** `copilot_chat.edit.source`, `copilot_chat.edit.outcome` (`accepted`/`rejected`/`saved`), `copilot_chat.language_id` (optional), `copilot_chat.has_remaining_edits` (optional)

**`copilot_chat.lines_of_code.count` attributes:** `type` (`added`/`removed`), `copilot_chat.language_id` (optional)

**`copilot_chat.edit.survival.four_gram` attributes:** `copilot_chat.edit.source`, `copilot_chat.time_delay_ms`

**`copilot_chat.edit.survival.no_revert` attributes:** `copilot_chat.edit.source`, `copilot_chat.time_delay_ms`

**`copilot_chat.user.action.count` attributes:** `action` (`copy`/`insert`/`apply`/`followup`)

**`copilot_chat.user.feedback.count` attributes:** `rating` (`positive`/`negative`)

**`copilot_chat.agent.edit_response.count` attributes:** `outcome` (`success`/`error`)

**`copilot_chat.agent.summarization.count` attributes:** `outcome` (`applied`/`failed`)

**`copilot_chat.cloud.session.count` attributes:** `partner_agent` (`copilot`/`claude`/`codex`)

### Events

#### `gen_ai.client.inference.operation.details`

Emitted after each LLM API call with full inference metadata.

| Attribute | Description |
|---|---|
| `gen_ai.operation.name` | Always `chat` |
| `gen_ai.request.model` | Requested model |
| `gen_ai.response.model` | Resolved model |
| `gen_ai.response.id` | Response ID |
| `gen_ai.response.finish_reasons` | Stop reasons (e.g., `["stop"]`) |
| `gen_ai.usage.input_tokens` | Input token count |
| `gen_ai.usage.output_tokens` | Output token count |
| `gen_ai.request.temperature` | Temperature (if set) |
| `gen_ai.request.max_tokens` | Max tokens (if set) |
| `error.type` | Error class (if failed) |
| `gen_ai.input.messages` | Full prompt messages (captureContent only) |
| `gen_ai.system_instructions` | System prompt (captureContent only) |
| `gen_ai.tool.definitions` | Tool schemas (captureContent only) |

#### `copilot_chat.session.start`

Emitted when a new chat session begins (top-level agent invocations only, not subagents).

| Attribute | Description |
|---|---|
| `session.id` | Session identifier |
| `gen_ai.request.model` | Initial model |
| `gen_ai.agent.name` | Chat participant name |

#### `copilot_chat.tool.call`

Emitted when a tool invocation completes.

| Attribute | Description |
|---|---|
| `gen_ai.tool.name` | Tool name |
| `duration_ms` | Execution time in milliseconds |
| `success` | `true` or `false` |
| `error.type` | Error class (if failed) |

#### `copilot_chat.agent.turn`

Emitted for each LLM round-trip within an agent invocation.

| Attribute | Description |
|---|---|
| `turn.index` | Turn number (0-indexed) |
| `gen_ai.usage.input_tokens` | Input tokens this turn |
| `gen_ai.usage.output_tokens` | Output tokens this turn |
| `tool_call_count` | Number of tool calls this turn |

#### Agent Activity & Outcome Events

These events provide drill-down detail for the agent activity metrics above. They are emitted as OTel log records.

##### `copilot_chat.edit.feedback`

Emitted when a user accepts or rejects a file-level edit from the agent.

| Attribute | Description |
|---|---|
| `outcome` | `accepted` or `rejected` |
| `language_id` | Language of the edited file |
| `participant` | Chat participant that proposed the edit |
| `request_id` | Chat request identifier |
| `edit_surface` | `agent` or `inline_chat` |
| `has_remaining_edits` | Whether unreviewed edits remain |
| `is_notebook` | Whether the file is a notebook |

##### `copilot_chat.edit.hunk.action`

Emitted when a user accepts or rejects an individual hunk.

| Attribute | Description |
|---|---|
| `outcome` | `accepted` or `rejected` |
| `language_id` | Language of the edited file |
| `request_id` | Chat request identifier |
| `line_count` | Total lines in the hunk |
| `lines_added` | Lines added |
| `lines_removed` | Lines removed |

##### `copilot_chat.inline.done`

Emitted when an inline chat edit is accepted or rejected.

| Attribute | Description |
|---|---|
| `accepted` | `true` or `false` |
| `language_id` | Language of the edited file |
| `edit_count` | Number of edits suggested |
| `edit_line_count` | Total lines across all edits |
| `reply_type` | How the response was shown |
| `is_notebook` | Whether the document is a notebook |

##### `copilot_chat.edit.survival`

Emitted at intervals (5s, 30s, 2min, 5min, 10min, 15min) after an edit is accepted, measuring how much of the AI-generated code survives.

| Attribute | Description |
|---|---|
| `edit_source` | `apply_patch`, `replace_string`, `code_mapper`, or `inline_chat` |
| `survival_rate_four_gram` | 0-1 ratio of AI edit still present (4-gram similarity) |
| `survival_rate_no_revert` | 0-1 ratio of edit ranges not reverted |
| `time_delay_ms` | Milliseconds since edit acceptance |
| `did_branch_change` | Whether git branch changed (ignore if `true`) |
| `request_id` | Chat request identifier |

##### `copilot_chat.user.feedback`

Emitted when a user votes on a chat response (thumbs up/down).

| Attribute | Description |
|---|---|
| `rating` | `positive` or `negative` |
| `participant` | Chat participant name |
| `conversation_id` | Conversation session ID |
| `request_id` | Chat request identifier |

##### `copilot_chat.cloud.session.invoke`

Emitted when a cloud/remote agent session is started.

| Attribute | Description |
|---|---|
| `partner_agent` | `copilot`, `claude`, or `codex` |
| `model` | Model identifier |
| `request_id` | Chat request identifier |

### Resource Attributes

All signals carry:

| Attribute | Value |
|---|---|
| `service.name` | `copilot-chat` (configurable via `OTEL_SERVICE_NAME`) |
| `service.version` | Extension version |
| `session.id` | Unique per VS Code window |

Add custom resource attributes with `OTEL_RESOURCE_ATTRIBUTES`:

```bash
export OTEL_RESOURCE_ATTRIBUTES="team.id=platform,department=engineering"
```

These custom attributes are included in all traces, metrics, and events, allowing you to:

- Filter metrics by team or department
- Create team-specific dashboards and alerts
- Track usage across organizational boundaries

> **Note:** `OTEL_RESOURCE_ATTRIBUTES` uses comma-separated `key=value` pairs. Values cannot contain spaces, commas, or semicolons. Use percent-encoding for special characters (e.g., `org.name=John%27s%20Org`).

---

## Content Capture

By default, **no prompt content, responses, or tool arguments are captured** — only metadata like model names, token counts, and durations.

To capture full content, add to your VS Code settings:

```json
{
  "github.copilot.chat.otel.captureContent": true
}
```

This populates these span attributes:

| Attribute | Content |
|---|---|
| `gen_ai.input.messages` | Full prompt messages (JSON) |
| `gen_ai.output.messages` | Full response messages (JSON) |
| `gen_ai.system_instructions` | System prompt |
| `gen_ai.tool.definitions` | Tool schemas |
| `gen_ai.tool.call.arguments` | Tool input arguments |
| `gen_ai.tool.call.result` | Tool output |

Content is captured in full with no truncation.

> **Warning:** Content capture may include sensitive information such as code, file contents, and user prompts. Only enable in trusted environments.

---

## Example Configurations

**OTLP/gRPC:**

```json
{
  "github.copilot.chat.otel.enabled": true,
  "github.copilot.chat.otel.exporterType": "otlp-grpc",
  "github.copilot.chat.otel.otlpEndpoint": "http://localhost:4317"
}
```

**Remote collector with authentication:**

```json
{
  "github.copilot.chat.otel.enabled": true,
  "github.copilot.chat.otel.otlpEndpoint": "https://collector.example.com:4318"
}
```

> **Note:** Authentication headers are only configurable via the `OTEL_EXPORTER_OTLP_HEADERS` environment variable (e.g., `Authorization=Bearer your-token`). See [Environment Variables](#environment-variables).

**File-based output (offline / CI):**

```json
{
  "github.copilot.chat.otel.enabled": true,
  "github.copilot.chat.otel.exporterType": "file",
  "github.copilot.chat.otel.outfile": "/tmp/copilot-otel.jsonl"
}
```

**Console output (quick debugging):**

```json
{
  "github.copilot.chat.otel.enabled": true,
  "github.copilot.chat.otel.exporterType": "console"
}
```

---

## Subagent Trace Propagation

When an agent invokes a subagent (e.g., via the `runSubagent` tool), Copilot Chat automatically propagates the trace context so the subagent's `invoke_agent` span is parented to the calling agent's `execute_tool` span. This produces a connected trace tree:

```
invoke_agent copilot                           [~30s]
  ├── chat gpt-4o                              [~3s]
  ├── execute_tool runSubagent                 [~20s]
  │   └── invoke_agent Explore                 [~18s]   ← child via trace context
  │       ├── chat gpt-4o                      [~2s]
  │       ├── execute_tool searchFiles         [~200ms]
  │       ├── execute_tool readFile            [~50ms]
  │       └── chat gpt-4o                      [~3s]
  ├── chat gpt-4o                              [~4s]
  └── (span ends)
```

This propagation works across async boundaries — the parent's trace context is stored when `runSubagent` starts and retrieved when the subagent begins its `invoke_agent` span.

---

## Background Agents (Copilot CLI)

When OTel is enabled, **all agent types** are automatically instrumented — no additional configuration needed. The same settings that enable foreground agent traces also enable Copilot CLI traces.

### Copilot CLI (Background Agent)

The Copilot CLI SDK runs in the same VS Code process and produces a rich trace hierarchy including subagents, permissions, hooks, and tool calls:

```
copilot-chat invoke_agent copilotcli           [~45s]  ← extension wrapper
  └── github-copilot invoke_agent              [~42s]  ← SDK native spans
      ├── chat claude-sonnet-4.6               [~16s]
      │   ├── hook postToolUse                          ← hook execution
      │   └── hook postToolUse
      ├── execute_tool task                    [~18s]
      │   └── invoke_agent task                         ← subagent
      │       ├── chat claude-sonnet-4.6
      │       ├── execute_tool bash
      │       │   └── permission
      │       └── execute_tool report_intent
      ├── chat claude-sonnet-4.6               [~4s]
      └── hook sessionEnd                               ← session lifecycle hook
```

The extension wrapper span (`invoke_agent copilotcli`, service `copilot-chat`) parents the SDK's native spans (service `github-copilot`). Both appear in the same trace in your collector.

**Agent Debug Log panel**: CLI sessions show the full SDK hierarchy in the Tree View — identical to what appears in Grafana/Jaeger. This works even when OTel export is disabled, because the SDK's internal tracing is always active for the debug panel.

> **Content in the debug panel**: When OTel export is disabled (the default), the debug panel automatically captures full prompt/response content. When OTel export is enabled, content capture is controlled by the `captureContent` setting — the same flag applies to both the debug panel and OTLP export. To see content in the debug panel while OTel is enabled, set `github.copilot.chat.otel.captureContent` to `true`.

### Copilot CLI (Terminal Session)

Terminal CLI sessions ("New Copilot CLI Session") run as a separate process. When OTel is enabled, the extension forwards `COPILOT_OTEL_ENABLED` and `OTEL_EXPORTER_OTLP_ENDPOINT` to the terminal process. Terminal traces appear as **independent root traces** (service `github-copilot`) — they are not linked to extension traces.

> **Note:** The CLI runtime only supports `otlp-http`. When `otlp-grpc` is configured, the terminal CLI still uses HTTP. Backends that serve both protocols on the same port (e.g., Aspire Dashboard) work transparently.

### Filtering by Agent Type

In your trace viewer, filter by `service.name` to see traces from specific agents:

| `service.name` | Source |
|---|---|
| `copilot-chat` | Foreground agent, CLI wrapper, and Claude agent spans (extension-emitted) |
| `github-copilot` | CLI SDK native spans + CLI terminal |
| `claude-code` | Claude Code subprocess SDK telemetry (when `CLAUDE_CODE_ENABLE_TELEMETRY` is forwarded) |

Within the `copilot-chat` service, distinguish agent types by `gen_ai.agent.name`:

| `gen_ai.agent.name` | Agent Type |
|---|---|
| `GitHub Copilot Chat` | Foreground agent (agent mode) |
| `copilotcli` | CLI wrapper span |
| `claude` | Claude agent |

---

## Claude Agent

When OTel is enabled, Claude agent sessions produce extension-level spans (service `copilot-chat`) following GenAI semantic conventions.

The extension creates spans by intercepting Claude SDK messages and proxying LLM calls through a local HTTP server to CAPI:

```
copilot-chat invoke_agent claude               [~33s]
  ├── chat claude-haiku-4.5                    [~5s]   (LLM call via CAPI proxy)
  ├── execute_tool Agent                       [~11s]  (subagent invocation)
  │   ├── chat claude-haiku-4.5                [~4s]   (subagent LLM call)
  │   ├── execute_tool Grep                    [~20ms] (subagent tool)
  │   └── chat claude-haiku-4.5                [~7s]   (subagent LLM call)
  ├── chat claude-haiku-4.5                    [~3s]
  ├── execute_tool Write                       [~40ms]
  ├── chat claude-haiku-4.5                    [~3s]
  └── execute_hook Stop                        [~10ms] (hook execution)
```

**`invoke_agent claude`** — root span per user request.

| Attribute | Example |
|---|---|
| `gen_ai.operation.name` | `invoke_agent` |
| `gen_ai.agent.name` | `claude` |
| `gen_ai.provider.name` | `github` |
| `gen_ai.request.model` | `claude-haiku-4.5` |
| `gen_ai.response.model` | `claude-haiku-4-5` |
| `gen_ai.usage.input_tokens` | `103739` (parent-only, excludes subagent tokens) |
| `gen_ai.usage.output_tokens` | `1100` |
| `gen_ai.usage.cache_read.input_tokens` | `64062` |
| `gen_ai.usage.cache_creation.input_tokens` | `39629` |
| `copilot_chat.turn_count` | `8` |
| `copilot_chat.total_cost_usd` | `0.067` (session-wide, includes subagents) |
| `copilot_chat.chat_session_id` | VS Code session ID |

**`chat`** — one span per LLM API call, created by `chatMLFetcher` via the Claude language model proxy server. Same attributes as foreground agent `chat` spans (token usage, TTFT, response model, cache breakdown).

**`execute_tool`** — one span per tool invocation. When the tool is `Agent` (subagent), child `chat` and `execute_tool` spans are nested underneath, giving full subagent visibility.

**`execute_hook`** — one span per Claude hook execution (e.g., `Stop` hooks).

---

## Interpreting the Data

**Traces** — Visualize the full agent execution in Jaeger or Grafana Tempo. Each `invoke_agent` span contains child `chat` and `execute_tool` spans, making it easy to identify bottlenecks and debug failures. Subagent invocations appear as nested `invoke_agent` spans under `execute_tool runSubagent` (foreground agent) or under `execute_tool Agent` (Claude agent).

**Metrics** — Track token usage trends by model and provider, monitor tool success rates via `copilot_chat.tool.call.count`, and watch perceived latency with `copilot_chat.time_to_first_token`. Agent activity metrics (`copilot_chat.edit.acceptance.count`, `copilot_chat.edit.survival.four_gram`, `copilot_chat.lines_of_code.count`) power accept rate and edit survival dashboards. All metrics carry the same resource attributes (`service.name`, `service.version`, `session.id`) for consistent filtering.

**Events** — `copilot_chat.session.start` tracks session creation. `copilot_chat.tool.call` events provide per-invocation timing and error details. `copilot_chat.edit.feedback` and `copilot_chat.edit.survival` events enable drill-down into which edits were accepted/rejected and how code survival varies by edit source. `copilot_chat.user.feedback` links thumbs-up/down votes to specific conversations for quality investigation. `gen_ai.client.inference.operation.details` gives the full LLM call record including token usage and, when content capture is enabled, the complete prompt/response messages. Use `gen_ai.conversation.id` to correlate all signals belonging to the same session.

---

## Initialization & Buffering

The OTel SDK is loaded asynchronously via dynamic imports to avoid blocking extension startup. Events emitted before initialization completes are buffered (up to 1,000 items) and replayed once the SDK is ready. If initialization fails, buffered events are discarded and all subsequent calls become no-ops — the extension continues to function normally.

First successful span export is logged to the console (`[OTel] First span batch exported successfully via ...`) to confirm end-to-end connectivity.

---

## Backend Setup Guides

Copilot Chat's OTel data works with any OTLP-compatible backend. This section provides step-by-step setup guides for recommended backends.

### Aspire Dashboard

See [Quick Start](#quick-start) above for setup. The [Aspire Dashboard](https://aspire.dev/dashboard/standalone/) is the simplest option — a single Docker container with a built-in OTLP endpoint and trace viewer. No cloud account or collector needed.

### OTel Collector + Azure Application Insights

[Azure Application Insights](https://learn.microsoft.com/en-us/azure/azure-monitor/app/app-insights-overview) ingests OTel traces, metrics, and logs through an [OTel Collector](https://opentelemetry.io/docs/collector/) with the `azuremonitor` exporter. This repo includes a ready-to-use collector setup in `docs/monitoring/`.

**1. Create an Application Insights resource:**

1. Go to the [Azure Portal](https://portal.azure.com/).
2. Click **Create a resource** → search **Application Insights** → **Create**.
3. Choose your subscription, resource group, name, and region → **Review + Create** → **Create**.
4. Once deployed, go to the resource → **Overview** → copy the **Connection String**.

**2. Start the OTel Collector:**

```bash
export APPLICATIONINSIGHTS_CONNECTION_STRING="InstrumentationKey=...;IngestionEndpoint=..."

cd docs/monitoring
docker compose up -d
```

Verify the collector is healthy:

```bash
# Should return 200
curl -s -o /dev/null -w "%{http_code}" http://localhost:4328/v1/traces \
  -X POST -H "Content-Type: application/json" -d '{"resourceSpans":[]}'
```

**3. Configure VS Code:**

Open **Settings** (`Ctrl+,`) and add:

```json
{
  "github.copilot.chat.otel.enabled": true,
  "github.copilot.chat.otel.exporterType": "otlp-http",
  "github.copilot.chat.otel.otlpEndpoint": "http://localhost:4328"
}
```

Optionally, to capture full prompt/response content:

```json
{
  "github.copilot.chat.otel.captureContent": true
}
```

> **Warning:** Content capture includes prompts, code, and file contents. Only enable in trusted environments.

**4. Generate telemetry** — Open Copilot Chat and send any message (e.g., use Agent mode).

**5. Verify data:**

- **Jaeger (local):** Open http://localhost:16687, select service `copilot-chat`, click **Find Traces**.
- **App Insights (Azure):** Go to your Application Insights resource → **Transaction search** → filter by "Trace" or "Request".

Run this query in **Application Insights → Logs** to confirm:

```kql
traces
| where timestamp > ago(1h)
| where message contains "GenAI" or message contains "copilot_chat"
| project timestamp, message, customDimensions
| order by timestamp desc
```

For metrics (may take 5–10 minutes to appear):

```kql
customMetrics
| where timestamp > ago(1h)
| where name startswith "gen_ai" or name startswith "copilot_chat"
| summarize avg(value), count() by name
```

**Collector config** (`docs/monitoring/otel-collector-config.yaml`):

```yaml
receivers:
  otlp:
    protocols:
      http:
        endpoint: 0.0.0.0:4318
      grpc:
        endpoint: 0.0.0.0:4317

exporters:
  azuremonitor:
    connection_string: "${APPLICATIONINSIGHTS_CONNECTION_STRING}"
  debug:
    verbosity: basic

service:
  pipelines:
    traces:
      receivers: [otlp]
      exporters: [azuremonitor, debug]
    metrics:
      receivers: [otlp]
      exporters: [azuremonitor, debug]
```

> **Note:** The docker-compose maps ports to `4328`/`4327` on the host to avoid conflicts. Adjust in `docker-compose.yaml` if needed. Add additional exporters (e.g., `otlphttp/jaeger`) to fan out to multiple backends. See `docs/monitoring/otel-collector-config.yaml` for the full config including `batch` processor and `logs` pipeline.

### Jaeger

[Jaeger](https://www.jaegertracing.io/) is an open-source distributed tracing platform. It accepts OTLP directly — no collector needed.

**1. Start Jaeger:**

```bash
docker run -d --name jaeger -p 16686:16686 -p 4318:4318 jaegertracing/jaeger:latest
```

**2. Configure VS Code:**

```json
{
  "github.copilot.chat.otel.enabled": true,
  "github.copilot.chat.otel.otlpEndpoint": "http://localhost:4318"
}
```

**3. Verify:** Open http://localhost:16686, select service `copilot-chat`, and click **Find Traces**.

### Langfuse

[Langfuse](https://langfuse.com/) is an open-source LLM observability platform with native OTLP ingestion and support for [OTel GenAI Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-agent-spans/). See the [Langfuse docs](https://langfuse.com/docs/opentelemetry/introduction) for full details on capabilities and limitations.

**Setup:**

```json
{
  "github.copilot.chat.otel.enabled": true,
  "github.copilot.chat.otel.otlpEndpoint": "http://localhost:3000/api/public/otel",
  "github.copilot.chat.otel.captureContent": true
}
```

Then set the auth header via environment variable (required — no VS Code setting for headers):

```bash
export OTEL_EXPORTER_OTLP_HEADERS="Authorization=Basic $(echo -n '<public-key>:<secret-key>' | base64)"
```

Replace `<public-key>` and `<secret-key>` with your Langfuse API keys from **Settings → API Keys**.

**Verify:** Open Langfuse → **Traces**. You should see `invoke_agent` traces with nested `chat` and `execute_tool` spans.

### Other Backends

Any OTLP-compatible backend works with Copilot Chat's OTel output. Some options:

| Backend | Description |
|---|---|
| **[Jaeger](https://www.jaegertracing.io/)** | Open-source distributed tracing platform |
| **[Grafana Tempo](https://grafana.com/oss/tempo/) + [Prometheus](https://prometheus.io/)** | Open-source traces + metrics stack |

Refer to each backend's documentation for OTLP ingestion setup.

---

## Security & Privacy

- **Off by default.** No OTel data is emitted unless explicitly enabled. When disabled, the OTel SDK is not loaded at all — zero runtime overhead.
- **No content by default.** Prompts, responses, and tool arguments require opt-in via `captureContent`.
- **No PII in default attributes.** Session IDs, model names, and token counts are not personally identifiable.
- **User-configured endpoints.** Data goes only where you point it — no phone-home behavior.
- **Dynamic imports only.** OTel SDK packages are loaded on-demand, ensuring zero bundle impact when disabled.
