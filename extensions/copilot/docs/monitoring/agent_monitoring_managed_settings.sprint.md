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
