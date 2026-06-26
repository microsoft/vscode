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
7. **Validate** — `npm run typecheck-client`, tests.

## Status

- [x] 1 Keys
- [x] 2 Response shape
- [x] 3 Owner policies
- [x] 4 Env precedence
- [x] 5 Extension policyReference
- [x] 6 Extension precedence
- [x] 7 Validate (`typecheck-client` clean; `otelConfig.spec` 40/40; `export-policy-data` → 41 policies, 6 references)

## Hiccups & Notes

- **Deferred `headers` / `resourceAttributes` / `serviceName`.** These have no existing
  `chat.agentHost.otel.*` owner setting, the two maps need structured-nested-key support in
  `normalizeManagedSettings` (the current `STRUCTURED_MANAGED_SETTINGS` table only handles
  top-level keys), and `headers` needs secret-safe out-of-env plumbing. Follow-up: add the three
  owner settings + structured map handling + secret env injection, then `policyReference` them.
- **`dbSpanExporter` left user-controlled** (no policy) per the plan — diverges from the earlier
  branch which wrongly nested it under `telemetry`.
- **Scalars need no structured-table change.** `telemetry.{enabled,endpoint,protocol,captureContent,lockCaptureContent}`
  flatten to dot-path bag keys automatically via `flattenManagedSettings`.
- **`export-policy-data` works offline-ish.** It logged `Failed to fetch .../copilot_internal/user`
  (no mock policy server running) but still exported the catalog from the distro `product.json`.
