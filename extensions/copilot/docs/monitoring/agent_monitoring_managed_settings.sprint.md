# OTel Managed-Settings Policy — Sprint Plan

Implements the plan in [agent_monitoring_managed_settings.md](./agent_monitoring_managed_settings.md),
following the `add-policy` skill (`.github/skills/add-policy/`).

## Scope decision

Two tiers in the canonical `telemetry` schema:

- **Scalar fields** — flatten to dot-path bag keys automatically (`flattenManagedSettings`),
  no `STRUCTURED_MANAGED_SETTINGS` change needed, and map onto **existing** `chat.agentHost.otel.*`
  settings. **In scope this sprint.**
- **Map fields** (`headers`, `resourceAttributes`) + `serviceName` — need brand-new owner settings
  + (for the maps) structured-nested-key support in the normalizer + secret-safe env plumbing.
  **Deferred** (see Hiccups).

## Tasks (prioritized)

1. **Keys** — add `telemetry.*` constants in `copilotManagedSettings.ts`.
2. **Response shape** — add `telemetry` block to `IManagedSettingsResponse` (`managedSettings.ts`).
3. **Owner policies** — attach `policy:` to `chat.agentHost.otel.{enabled,exporterType,otlpEndpoint,captureContent,outfile}` in `agentHostStarter.config.contribution.ts`.
4. **Env precedence** — `buildAgentHostOTelEnv` gains a `policySettings` param (policy overwrites env); both starters pass policy values.
5. **Extension policyReference** — point `github.copilot.chat.otel.{enabled,exporterType,otlpEndpoint,captureContent,outfile}` at the owner policies (`package.json`).
6. **Extension precedence** — `otelConfig.ts` policy > env > setting; `services.ts` plumbs `policyValue`.
7. **OTLP wire protocol parity** — honor `http/json` vs `http/protobuf` end-to-end:
   - Agent host: hidden policy-only `chat.agentHost.otel.otlpProtocol` slot (`CopilotOtelOtlpProtocol`) →
     sets `OTEL_EXPORTER_OTLP_PROTOCOL` (+ per-signal) on the agent-host env (the runtime defaults to
     `http/json`, so an unset protocol silently dropped the enterprise's protobuf choice).
   - Extension: add the `@opentelemetry/exporter-{trace,logs,metrics}-otlp-proto` deps, widen
     `OTelConfig.otlpProtocol` to `grpc | http/json | http/protobuf`, select the `-proto` exporter,
     and add `github.copilot.chat.otel.protocol` (referencing `CopilotOtelOtlpProtocol`).
8. **Validate** — typecheck, specs, `export-policy-data`.

## Status

- [x] 1 Keys
- [x] 2 Response shape
- [x] 3 Owner policies
- [x] 4 Env precedence
- [x] 5 Extension policyReference
- [x] 6 Extension precedence
- [x] 7 OTLP wire protocol parity (agent host + extension `-proto`)
- [x] 8 Validate (`typecheck-client` clean; agentService + `otelConfig` specs green; `export-policy-data` → 42 policies, 7 references)

## Hiccups & Notes

- **Deferred `headers` / `resourceAttributes` / `serviceName`.** These have no existing
  `chat.agentHost.otel.*` owner setting, the two maps need structured-nested-key support in
  `normalizeManagedSettings` (the current `STRUCTURED_MANAGED_SETTINGS` table only handles
  top-level keys), and `headers` needs secret-safe out-of-env plumbing. Follow-up: add the three
  owner settings + structured map handling + secret env injection, then `policyReference` them.
- **OTLP protocol was lossy at first.** Mapping `telemetry.protocol` only onto the `exporterType`
  enum (`otlp-http`) dropped the protobuf-vs-json axis; the agent-host runtime then defaulted to
  `http/json`. Fixed by threading the raw protocol through a dedicated slot on both surfaces.
- **Extension can't do protobuf-HTTP without a dep.** Its exporter only shipped `-grpc` + `-http`
  (JSON); added the `-proto` siblings. The earlier `cgmanifest` worry was unfounded — ordinary npm
  registry deps aren't tracked there (its `-grpc`/`-http` siblings have no cgmanifest entry either).
- **`dbSpanExporter` left user-controlled** (no policy) per the plan — diverges from the earlier
  branch which wrongly nested it under `telemetry`.
- **Scalars need no structured-table change.** `telemetry.{enabled,endpoint,protocol,captureContent,lockCaptureContent}`
  flatten to dot-path bag keys automatically via `flattenManagedSettings`.

- **Desktop agent host wasn't receiving managed OTel policy (fixed).** `AccountPolicyService`
  (server / native-MDM / file managed settings) is added to the policy service only in the
  **renderer** (`desktop.main.ts` `MultiplexPolicyService([policyChannel, accountPolicy])`). The
  agent-host starter (`ElectronAgentHostStarter`) runs in **electron-main**, whose config service
  lacks that layer, so `inspect(key).policyValue` for `chat.agentHost.otel.*` was always `undefined`
  and the host spawned with no managed OTel env (endpoint/protocol/enabled) — the extension worked
  because the extension host mirrors the renderer config. Fix threads the renderer-resolved policy to
  the starter over the existing renderer→main connection seam (`AgentHostOTelPolicyIpcChannel`;
  `readAgentHostOTelPolicySettings` / `sanitizeAgentHostOTelPolicySettings`; renderer sends before
  `acquirePort`, starter uses it as `buildAgentHostOTelEnv` `policySettings`, falling back to
  main-process policy). Verified e2e: agent host env got `4318` + `http/protobuf`; Aspire
  `service.name=github-copilot`.

## Follow-ups (not in this sprint)

- **Deferred map/serviceName fields** — `headers` / `resourceAttributes` / `serviceName`. Spike
  (against the CLI runtime source) revised the plan — see **Spike: where the agent host gets OTel
  config** below. Net: deliver them VS Code-only (no runtime change) via the env vars the runtime's
  `build_resource` already reads (`OTEL_SERVICE_NAME`, `OTEL_RESOURCE_ATTRIBUTES`) plus the
  extension's own exporter; **agent-host `headers` stay deferred** (secret-in-env leaks to tool
  subprocesses — needs the runtime's `applyManagedTelemetry`).
- **Agent-host OTel env is fixed at spawn; no re-apply on later policy change.** The agent host is a
  singleton utility process whose OTel env is computed once in `start()`. If managed OTel policy
  changes (or first syncs) **after** the host has already spawned, the running host keeps the stale
  env — same class of problem as the extension requiring a "Reload Window". Follow-up: detect a
  managed-OTel-policy change in the renderer and either (a) re-spawn the agent host, or (b) surface a
  restart affordance, so the new policy takes effect without a full quit/relaunch. Today the host
  must first spawn *after* policy sync to pick up managed OTel settings.

## Spike: where the agent host gets OTel config (for `headers`/`resourceAttributes`/`serviceName`)

Traced through the CLI runtime (`copilot-agent-runtime`):

- The headless/agent-host runtime resolves OTel from **env only** (`OtelLifecycle` → `resolveOtelConfig`).
  Its env reader (`readOtelEnv`) maps only the scalar `COPILOT_OTEL_*`/`OTEL_*` vars — it does **not**
  read headers/resourceAttributes/serviceName into the config object.
- Those three only flow through the **structured** path: `mergeManagedOtelConfig(managed, env)` →
  `OtelLifecycle.applyManagedTelemetry(managed)` (headers stamped out-of-env by `ManagedHeaderClient`).
  That path is invoked **interactive-CLI-only** (`expectManagedTelemetry` gated on `!isNonInteractiveMode`;
  TUI fetches via `app.tsx onAuthChange → fetchManagedSettings`). The SDK *does* expose
  `applyManagedTelemetry`/`expectManagedTelemetry` on `LocalSessionHost`, but the headless agent-host
  entry never calls them and nothing wires VS Code's block in.
- **However**, the runtime's `build_resource` (otel_sdk.rs) reads standard env as resource precedence:
  managed `service_name`/`resource_attributes` (1) → `OTEL_RESOURCE_ATTRIBUTES` (2) →
  `OTEL_SERVICE_NAME` (3) → default. So VS Code **can** deliver `serviceName`/`resourceAttributes` to the
  agent host via those env vars without any runtime change. `headers` via `OTEL_EXPORTER_OTLP_HEADERS`
  env would also be read — but that's a secret that leaks into every tool subprocess the host spawns.

### Revised plan (VS Code-only, no runtime change)

| Field | Extension (`copilot-chat`) | Agent host (`github-copilot`) |
| --- | --- | --- |
| `serviceName` | programmatic (own resource) | env `OTEL_SERVICE_NAME` |
| `resourceAttributes` | programmatic | env `OTEL_RESOURCE_ATTRIBUTES` |
| `headers` (secret) | programmatic, out-of-env | **deferred** — needs runtime `applyManagedTelemetry` (env path leaks the token to tool subprocesses) |

Sequencing (separate commits): (1) `serviceName`; (2) `resourceAttributes` (needs nested-key support in
`STRUCTURED_MANAGED_SETTINGS`); (3) `headers` extension-only. Agent-host `headers` tracked under the runtime follow-up.

### Implemented (this follow-up)

All three delivered VS-Code-only, one commit each:

- [x] **`serviceName`** — scalar key `telemetry.serviceName`; hidden policy-only agent-host slot
  `CopilotOtelServiceName` → `OTEL_SERVICE_NAME`; extension setting `github.copilot.chat.otel.serviceName`
  (policy > env > setting > `copilot-chat`).
- [x] **`resourceAttributes`** — structured nested-map key `telemetry.resourceAttributes` (added
  nested read/delete + `encodeStringMap` to `STRUCTURED_MANAGED_SETTINGS`); hidden agent-host object slot
  `CopilotOtelResourceAttributes`, serialized to `OTEL_RESOURCE_ATTRIBUTES=k=v,…`; extension setting
  merges per-key (policy > env > setting).
- [x] **`headers`** — structured nested-map key `telemetry.headers`; **extension-only** object slot
  `CopilotOtelHeaders` applied directly to the OTLP exporter (`headers:` on each exporter), never via env.
  **Agent-host `headers` remain deferred** (env path leaks the secret to tool subprocesses).

