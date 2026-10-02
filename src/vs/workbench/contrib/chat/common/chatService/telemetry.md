# Request outcome context

`interactiveSessionProviderInvoked` reports workbench provider-invocation outcomes.
Its existing `result`, IDs, `model`, and once-per-invocation emission are unchanged.
It is not a model-attempt event or proof that the user saw an error.

## Request context version 1

These additive fields describe context captured when `ChatRequestTelemetry` is
constructed, before invoking the provider:

| Field | Meaning |
| --- | --- |
| `requestContextVersion` | `1` identifies this context contract. Absence means older instrumentation. |
| `requestStartCopilotSku` | The workbench's Copilot entitlement SKU, if known at request start. This does not identify the account or credential used by a remote host. |
| `selectedModelSource` | `copilot`, `byok`, `other`, or `unknown`, based on the selected model's registered metadata at request start. |

Explicit BYOK metadata, including the Agent Host BYOK bridge identifier, takes
precedence over the catalog's vendor. A resolved Copilot catalog model or model
targeting a registered `copilotcli` host provider is `copilot`. A resolved model
from another non-host catalog is `other`. Missing selection, unresolved metadata,
and other host providers are `unknown`; they must not be interpreted as non-BYOK.
Only the category is emitted, not custom vendor names or BYOK bridge identifiers.

This is selection context, not an assertion about every model call: Auto,
HydraFusion, fallbacks, and provider-side model overrides can route differently.
The existing `model` field retains its completion-time lookup behavior.

## Reporting examples

- A request fails before producing any model-response telemetry: its terminal
  event can still carry the known SKU and selection source without an inner join
  that would drop the failure.
- A BYOK model is removed from the registry while a request is running: its
  selection source remains `byok`, even if the legacy `model` lookup is empty.
- Entitlement changes while a request is running: the outcome retains the
  request-start SKU. Missing initial entitlement stays missing.
- A request fails and is retried with the same ID: both existing invocation
  outcomes remain emitted. To count affected request identities, group by the
  appropriate device/session/request identity and test whether any outcome is
  `error` or `errorWithOutput`; do not overwrite an error with a later success.

Query new fields only on supported rows (`Measures.requestcontextversion == 1`
in the current core Kusto pipeline), keep unknown/missing context visible, and
verify field ingestion before updating a dashboard. This contract does not add
accepted-start coverage, execution IDs, retry provenance, internal-error
observation, or a user-facing interruption classification.
