# Enterprise OTel Managed-Settings Policy — High-Level Spec (VS Code)

Goal: let an enterprise centrally control Copilot agent-host OpenTelemetry export via
**Copilot managed settings**, surfaced as VS Code policies. When the enterprise sets a
value it wins over the user's own setting / env vars and is locked in the UI.

This must match the **cross-client `telemetry` contract** already shipped in the CLI
(copilot-agent-runtime PR #10735, `ManagedTelemetrySettings`) under the managed-settings
governance initiative (github/copilot-agent-runtime#9930). VS Code is the second client of
the same schema — keep keys and semantics identical.

## Scope — `telemetry` managed-settings schema (canonical, 8 fields)

Nested `telemetry` block in the managed-settings response:

- `telemetry.enabled` — enables OTel; users cannot disable export when true.
- `telemetry.endpoint` — OTLP collector endpoint (⇄ `OTEL_EXPORTER_OTLP_ENDPOINT`).
- `telemetry.protocol` — free-form string (⇄ `OTEL_EXPORTER_OTLP_PROTOCOL`); `http/json` /
  `http/protobuf` (`grpc` accepted for forward-compat, falls back to default). No enum.
- `telemetry.headers` — auth/routing headers (⇄ `OTEL_EXPORTER_OTLP_HEADERS`). **Secret. Never logged.**
- `telemetry.resourceAttributes` — extra resource attributes (⇄ `OTEL_RESOURCE_ATTRIBUTES`).
- `telemetry.serviceName` — overrides `service.name` (⇄ `OTEL_SERVICE_NAME`).
- `telemetry.captureContent` — capture prompts/responses/tool args. Default false.
- `telemetry.lockCaptureContent` — prevents the user from enabling content capture themselves.

## Implementation status

Shipped (see [agent_monitoring_managed_settings.sprint.md](./agent_monitoring_managed_settings.sprint.md)):
`enabled`, `endpoint`, `protocol` (full `http/json` vs `http/protobuf` vs `grpc`), `captureContent`,
`lockCaptureContent` — on both the agent-host owner settings and the `github.copilot.chat.otel.*`
references. **Deferred:** `headers`, `resourceAttributes`, `serviceName` (need new owner settings,
structured-nested-key support for the maps, and secret-safe env plumbing).

## Ownership

- **Owner:** the `chat.agentHost.otel.*` settings carry the `policy:` definitions.
- **Reference:** the `github.copilot.chat.otel.*` (extension) settings point at the same
  policies (`policyReference`), so a single managed value applies to **both** setting surfaces.
- **Constraint:** `policyReference` maps one policy to two settings, so the owning and referencing
  settings **must have identical types**. Confirmed OK — `chat.agentHost.otel.*` and
  `github.copilot.chat.otel.*` already share the same setting types. (`policyReference` is a
  newly-introduced pattern; extensible if the type-match rule needs to loosen.)

## Precedence & enforcement

Enterprise policy > env vars > user settings > defaults (managed wins over env).

- `protocol` is two axes: **transport** (maps to the agent-host `exporterType`: `grpc`→`otlp-grpc`,
  `http/*`→`otlp-http`) and **wire encoding** (`http/json` vs `http/protobuf`). The raw value is
  threaded through a dedicated policy-only slot so it sets `OTEL_EXPORTER_OTLP_PROTOCOL` (+ per-signal)
  on the agent host and selects the `-proto` vs `-http` exporter in the extension. Managed value wins,
  incl. per-signal env overrides. (The runtime defaults to `http/json` when unset, so the wire axis
  must be propagated, not just mapped to `exporterType`.)
- `captureContent`: explicit value wins; otherwise `lockCaptureContent: true` forces it off.
- **Per-key managed-wins for `headers` / `resourceAttributes`**: a managed key overrides the
  same key from user env (`OTEL_EXPORTER_OTLP_HEADERS` / `OTEL_RESOURCE_ATTRIBUTES`), but
  env-only keys are preserved. `endpoint` is hard-locked.

## Security (carried from the CLI implementation — must replicate)

- **Secrets stay out of `process.env`.** `headers`, `resourceAttributes`, `serviceName`,
  `endpoint` are passed out-of-band (explicit params), never written to env, so secret
  headers don't leak and aren't inherited by spawned subprocesses.
- **Subprocess env sanitization.** Strip `OTEL_*` from env of spawned shells/subprocesses so
  users can't override enterprise telemetry config downstream.
- **Logging.** Only header / resource-attribute *names* may be logged, never values.

## Channels — all three already wired in VS Code (no new infra)

Server, MDM, and file-based managed settings **all already exist** and converge through one
shared pipeline, so supporting all three for `telemetry` is free once the keys are registered:

- **Server:** `/copilot_internal/managed_settings` → `adaptManagedSettings()` → `normalizeManagedSettings()`
  ([managedSettings.ts](src/vs/workbench/services/accounts/browser/managedSettings.ts), [defaultAccount.ts](src/vs/workbench/services/accounts/browser/defaultAccount.ts)).
- **MDM:** Windows registry `SOFTWARE\Policies\GitHubCopilot` + macOS `com.github.copilot` via
  `@vscode/policy-watcher` ([nativeManagedSettingsService.ts](src/vs/platform/policy/node/nativeManagedSettingsService.ts)).
- **File:** `managed-settings.json` on well-known Win/macOS/Linux paths via `IFileService`
  ([fileManagedSettingsService.ts](src/vs/platform/policy/common/fileManagedSettingsService.ts)).

All three feed `AccountPolicyService.getPolicyData()`, which calls `selectManagedSettings()` and
the shared normalizer in [copilotManagedSettings.ts](src/vs/platform/policy/common/copilotManagedSettings.ts).

**Channel precedence: `server > MDM > file`** (single winner, never merged) — richer than the
CLI's `server ?? mdm`. Main-process wiring is in [main.ts](src/vs/code/electron-main/main.ts).

## Explicit non-goals / suppressions (consistent with CLI — none of these are in its schema)

- **outfile** — no policy. When the enterprise sets an endpoint/protocol, local file export
  is forced off so data can't be diverted to disk.
- **dbSpanExporter** — **not** under enterprise policy; the user can still enable it.
  (NB: the earlier VS Code branch wrongly nested `dbSpanExporter.enabled` under `telemetry` —
  remove it to match the CLI contract.)
- **maxAttributeSizeChars** — suppressed for now (may be added later).

## Touch points (where work lands, no detail)

1. **Register keys** in [copilotManagedSettings.ts](src/vs/platform/policy/common/copilotManagedSettings.ts):
   the `telemetry.*` constants + the nested `telemetry` object in the `STRUCTURED_MANAGED_SETTINGS`
   table. **All managed-settings deserialization/mapping stays in that table** (one `encode` row per
   structured key). Scalars (`enabled`/`endpoint`/`protocol`/`captureContent`/`lockCaptureContent`/`serviceName`)
   flatten trivially, but **`headers` and `resourceAttributes` are `Record<string,string>` maps and
   MUST use the structured-key JSON-encode path** (like `enabledPlugins` / `extraKnownMarketplaces`),
   not the scalar dot-path flattener. Validate block shape (URL, protocol values, map values).
2. `policy:` definitions on the owning `chat.agentHost.otel.*` settings + policy catalog entries
   (`value(policyData)` callbacks + `managedSettings: { telemetry: { type: 'object' } }`).
3. `policyReference` on the `github.copilot.chat.otel.*` extension settings.
4. Plumb policy values into the agent-host launch path + extension OTel config resolver:
   apply precedence, keep secrets out of env, do per-key header/attr merge, sanitize `OTEL_*`
   from subprocess env.
5. Tests + docs.

No new channel infrastructure is required — server/MDM/file are already unified; the cost is
one structured-key registration + the per-setting policy blocks.
