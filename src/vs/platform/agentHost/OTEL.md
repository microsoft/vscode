# Agent Host OTel Pipeline

The **agent host** is a separate utility process (under `src/vs/platform/agentHost/`) that embeds the native [`@github/copilot-sdk`](https://github.com/github/copilot-cli) runtime instead of using the extension's in-process tool-calling loop. The agent host has its own OTel pipeline so traces from native-SDK sessions can be exported to a collector or persisted locally for inspection.

> **Availability:** Insiders / non-stable builds only. Requires `chat.agentHost.enabled` to be `true`.

This doc lives next to the code (`IAgentHostOTelService` in [node/otel/agentHostOTelService.ts](node/otel/agentHostOTelService.ts)) because the agent host runs entirely outside the extension host and is independent of the extension-side OTel pipeline (`github.copilot.chat.otel.*`) documented in `extensions/copilot/docs/monitoring/`.

| Property | Agent Host OTel | Extension OTel |
|---|---|---|
| Process | Separate utility process (`src/vs/platform/agentHost/node/`) | Extension host |
| Settings prefix | `chat.agentHost.otel.*` | `github.copilot.chat.otel.*` |
| Service | `IAgentHostOTelService` (`node/otel/agentHostOTelService.ts`) | `IOTelService` (`extensions/copilot/src/platform/otel/`) |
| SDK | `@github/copilot-sdk` `TelemetryConfig` | `@opentelemetry/sdk-node` directly |
| Persistence | `<userData>/agent-host/otel/agent-host-traces.db` | `<extensionGlobalStorage>/otel/spans.db` |

## Two Modes

| Mode | Trigger | Behavior |
|---|---|---|
| **Pass-through** | `chat.agentHost.otel.enabled` is `true` and `dbSpanExporter.enabled` is `false` | The SDK exports directly to the user-configured exporter (OTLP/HTTP, OTLP/gRPC, file, or console). No process-local interception. |
| **DB mode** | `chat.agentHost.otel.dbSpanExporter.enabled` is `true` (implicitly enables OTel) | The SDK is pointed at a loopback OTLP/HTTP receiver inside the agent host. Spans are decoded and written to a local SQLite database. If `otlpEndpoint` is **also** configured, the receiver fans the raw OTLP body out to it — so an external collector keeps receiving traces alongside the local DB. |

```
                 ┌─────────────────────────────────────────────────────────────────┐
                 │  Agent Host process (src/vs/platform/agentHost)                  │
                 │                                                                 │
   user setting  │   pass-through mode                                              │
   chat.agent    │   ┌─────────────────────────┐    OTLP/HTTP    ┌──────────────┐  │
   Host.otel.*   ─→  │ copilot-sdk             │ ─────────────── │ user-config  │  │
                 │   │ TelemetryConfig         │                 │ OTLP sink    │  │
   spawn-time    │   └─────────────────────────┘                 └──────────────┘  │
   env binding   │                                                                 │
   in            │   db mode (dbSpanExporter.enabled)                              │
   electron-     │   ┌─────────────────────────┐    127.0.0.1    ┌──────────────┐  │
   AgentHostStar ─→  │ copilot-sdk             │ ─────────────── │ loopback     │  │
   ter.ts and    │   │ TelemetryConfig         │  ephemeral port │ OTLP receiver│  │
   nodeAgent     │   │ (re-pointed at loopback)│                 │ (localOtlp   │  │
   HostStarter   │   └─────────────────────────┘                 │  Receiver)   │  │
   .ts           │                                               └──────┬───────┘  │
                 │                                                      │          │
                 │                                onSpans  ────────────►├─→ SQLite │
                 │                                                      │   store  │
                 │                                onForward ────────────┘          │
                 │                                       │                         │
                 │                                       ▼                         │
                 │                          OtlpHttpForwarder   OTLP/HTTP          │
                 │                          (optional fan-out) ─────────────────→  │ user-config OTLP sink
                 └─────────────────────────────────────────────────────────────────┘
```

- **Pass-through mode** (default when only `otlpEndpoint` is configured): the SDK is constructed with the user's exporter settings unmodified and exports directly. The agent host does not intercept span data.
- **DB mode** (`COPILOT_OTEL_DB_SPAN_EXPORTER_ENABLED=true`): `AgentHostOTelService` starts a `LocalOtlpHttpReceiver` on `127.0.0.1` with an ephemeral port, then constructs the SDK pointing at that loopback URL. For each batch the receiver decodes the OTLP-JSON body and inserts spans into `OTelSqliteStore` (`onSpans`). If an external `otlpEndpoint` is also configured, the receiver fans the **raw** OTLP body out to an `OtlpHttpForwarder` (`onForward`) so the user's collector keeps receiving traces alongside the local DB.

## VS Code Settings

Open **Settings** (`Ctrl+,`) and search for `agentHost otel`:

| Setting | Type | Default | Description |
|---|---|---|---|
| `chat.agentHost.otel.enabled` | boolean | `false` | Enable OTel emission from the agent host. |
| `chat.agentHost.otel.exporterType` | string | `"otlp-http"` | `otlp-http`, `otlp-grpc`, `console`, or `file`. The CLI runtime downgrades `otlp-grpc` to `otlp-http` transparently. |
| `chat.agentHost.otel.otlpEndpoint` | string | `""` | OTLP endpoint URL. Accepts a bare base URL (`http://localhost:4318`) — `/v1/traces` is appended automatically when needed, matching the standard `OTEL_EXPORTER_OTLP_ENDPOINT` convention. A full signal-specific URL (`http://host:4318/v1/traces`) is used verbatim. |
| `chat.agentHost.otel.captureContent` | boolean | `false` | Capture prompt/response content in span attributes. Privacy-sensitive — do not enable in environments that ship spans to shared sinks. |
| `chat.agentHost.otel.outfile` | string | `""` | Output path for JSON-lines spans when `exporterType` is `file`. |
| `chat.agentHost.otel.dbSpanExporter.enabled` | boolean | `false` | Persist every emitted span to a local SQLite database at `<userData>/agent-host/otel/agent-host-traces.db`. Implicitly enables OTel. Compatible with external exporters — spans are written to SQLite **and** forwarded to the user-configured sink. |

## Environment Variables

The workbench-side starter translates the settings above into the following env vars on the agent host process. If a variable is already set in the parent environment, it wins over the corresponding setting (developer override).

| Variable | Sourced From | Notes |
|---|---|---|
| `COPILOT_OTEL_ENABLED` | `chat.agentHost.otel.enabled` | Set to `true` only when the setting is on. |
| `COPILOT_OTEL_EXPORTER_TYPE` | `chat.agentHost.otel.exporterType` | |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `chat.agentHost.otel.otlpEndpoint` | Standard OTel env var. `COPILOT_OTEL_ENDPOINT` is also accepted as an alternate and takes precedence over `OTEL_EXPORTER_OTLP_ENDPOINT`. |
| `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT` | `chat.agentHost.otel.captureContent` | |
| `COPILOT_OTEL_FILE_EXPORTER_PATH` | `chat.agentHost.otel.outfile` | |
| `COPILOT_OTEL_DB_SPAN_EXPORTER_ENABLED` | `chat.agentHost.otel.dbSpanExporter.enabled` | |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | (inherited) | `grpc` selects gRPC; any other value uses HTTP. |
| `OTEL_EXPORTER_OTLP_HEADERS` | (inherited) | Auth headers (e.g., `Authorization=Bearer …`). |

> **Activation timing.** Env vars are bound at agent host **spawn time**. Changing a setting while the agent host is already running has no effect until the host respawns — restart VS Code or reload the window if you change these settings mid-session.

## Local SQLite Span Store

When `chat.agentHost.otel.dbSpanExporter.enabled` is on, every span the agent host emits is written to:

```
<userData>/agent-host/otel/agent-host-traces.db
```

Use the **Chat: Export Agent Host Traces Database…** command (`workbench.action.chat.agentHost.otel.exportAgentTracesDB`) to save a copy of the database for offline inspection. The store uses WAL mode, so it is safe to copy or query with `sqlite3` while the agent host is running.

## Quick Start with Aspire Dashboard

To collect agent host traces with the [Aspire Dashboard](https://learn.microsoft.com/dotnet/aspire/fundamentals/dashboard/standalone) (or any OTLP-compatible collector):

```json
{
  "chat.agentHost.enabled": true,
  "chat.agentHost.otel.enabled": true,
  "chat.agentHost.otel.captureContent": true,
  "chat.agentHost.otel.dbSpanExporter.enabled": true,
  "chat.agentHost.otel.otlpEndpoint": "http://localhost:4318"
}
```

This combination persists every span to SQLite for offline inspection **and** forwards them live to Aspire — useful when you want to spot-check a session in the dashboard and still be able to query the raw data later.

---

## File Structure

```
src/vs/platform/agentHost/
├── common/
│   └── agentService.ts                # Setting IDs, env var names, buildAgentHostOTelEnv()
├── electron-main/
│   └── electronAgentHostStarter.ts    # Spawns agent host (Electron); calls buildAgentHostOTelEnv()
└── node/
    ├── nodeAgentHostStarter.ts        # Spawns agent host (server / non-Electron path)
    └── otel/
        └── agentHostOTelService.ts    # IAgentHostOTelService impl, two-mode wiring

src/vs/platform/otel/
├── node/otlp/
│   ├── localOtlpReceiver.ts           # In-process OTLP/HTTP receiver (127.0.0.1, ephemeral)
│   ├── otlpJsonDecode.ts              # OTLP-JSON → ICompletedSpanData
│   └── outboundForwarder.ts           # OtlpHttpForwarder + FileForwarder + ConsoleForwarder + CompositeForwarder
└── node/sqlite/
    └── otelSqliteStore.ts             # Persistent span store (DB schema lives here)
```

## Settings → Env Var Translation

`buildAgentHostOTelEnv()` ([common/agentService.ts](common/agentService.ts)) is the single translation point. The starter (`electronAgentHostStarter.ts` / `nodeAgentHostStarter.ts`) reads settings, calls `buildAgentHostOTelEnv(settings, parentEnv)`, and merges the result into the spawned process's environment. Parent-env values always win.

| Setting | Env var |
|---|---|
| `chat.agentHost.otel.enabled` | `COPILOT_OTEL_ENABLED` |
| `chat.agentHost.otel.exporterType` | `COPILOT_OTEL_EXPORTER_TYPE` |
| `chat.agentHost.otel.otlpEndpoint` | `OTEL_EXPORTER_OTLP_ENDPOINT` (`COPILOT_OTEL_ENDPOINT` also accepted, takes precedence) |
| `chat.agentHost.otel.captureContent` | `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT` |
| `chat.agentHost.otel.outfile` | `COPILOT_OTEL_FILE_EXPORTER_PATH` |
| `chat.agentHost.otel.dbSpanExporter.enabled` | `COPILOT_OTEL_DB_SPAN_EXPORTER_ENABLED` |

`OTEL_EXPORTER_OTLP_PROTOCOL`, `OTEL_EXPORTER_OTLP_HEADERS`, and `OTEL_RESOURCE_ATTRIBUTES` flow via env inheritance — they are not translated from settings.

`readAgentHostOTelEnv()` ([node/otel/agentHostOTelService.ts](node/otel/agentHostOTelService.ts)) is the inverse: it reads `process.env` inside the agent host and produces the `ResolvedConfig` that drives mode selection and outbound forwarding.

## OTLP/HTTP Forwarder Conventions

`OtlpHttpForwarder` accepts an endpoint in either of the two shapes that SDKs expect for the standard `OTEL_EXPORTER_OTLP_ENDPOINT` env var:

- **Bare base URL** (`http://host:4318` or `http://host:4318/`) — `/v1/traces` is auto-appended via `resolveOtlpTracesEndpoint()` in [../otel/node/otlp/outboundForwarder.ts](../otel/node/otlp/outboundForwarder.ts).
- **Full signal-specific URL** (`http://host:4318/v1/traces`, `http://host:4318/custom/path`) — used verbatim.

This matches the path-handling rules of the official OpenTelemetry SDKs and ensures the pass-through SDK path and the DB-mode outbound forwarder path behave identically given the same `otlpEndpoint` setting.

## Spawn-Time Env Binding

The agent host inherits its env vars at fork time. `IAgentHostOTelService` reads `process.env` once in its constructor and caches the resolved config. Changing a `chat.agentHost.otel.*` setting at runtime therefore has **no effect** on the currently-running agent host — the host must respawn (reload window / restart VS Code) to pick up the new value. This is the same model used by the rest of the agent host service surface.
