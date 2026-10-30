# Agent Host Policy Support and Readiness

A classification describes enforcement; adding one does not implement enforcement.

- Inventory: `src/vs/platform/agentHost/common/agentHostPolicySupport.ts`, covering Copilot Agent Host on this machine only (not remote hosts, Claude, or Codex).
- Readiness: `src/vs/platform/agentHost/common/agentHostPolicyReadiness.ts`, which evaluates applied `policyValue` only.

## Gather evidence

For each control, trace registration (name, schema, defaults, `policyReference`), delivery (device policy, projected and runtime-native managed settings), lifecycle (connect, reconnect, refresh/removal, create/resume), and alternate paths (built-in vs custom tools, approval modes, sandbox opt-outs, editor vs Agents window). A schema field, forwarded value, or PR description is not enforcement evidence. Cite source and disclose what cannot be verified locally.

## Classify

- **enforced**: honored for all relevant sources and paths in scope.
- **partial**: name covered and uncovered paths; separate confirmed gaps from unverified runtime enforcement.
- **notEnforced**: proven not enforced, not merely unaudited.
- **notApplicable**: outside the Copilot Agent Host contract by explicit scope decision (third-party providers, the retired legacy sandbox device policies). Deprecation alone is not enough.

If evidence is insufficient, report it as unverified rather than guessing. Update the inventory, readiness predicates, impacts, report, and tests together.

## Readiness predicates

Evaluate composed controls together. Examples:

- `ChatMCP`: `all` is permissive; `none` and `registry` are requirements. An empty MCP allowlist denies all; `null` means no allowlist.
- Domain lists affect URL filtering and Local terminal sandboxing; evaluate sandbox activation separately.
- OpenTelemetry enablement and exporter must survive the final config resolver, not just env forwarding.
- Plugin/telemetry config can require functionality, not just prohibit it.
- Strict marketplace rules govern installation only.

## Invariants

- Readiness is **report-only**: it never changes rollout, harness selection, picker visibility, stored choices, or conversations, and adds no banners, blocking, acceptance setting, or telemetry. Accepting a gap never relabels it as enforced.
- The legacy bridge, sandbox mandates, and freshness gates enforce independently of diagnostics.
- A clean report is not an attestation of runtime parity; say what the detector does not inspect.

## Policy Diagnostics report

Readiness is appended after the existing diagnostic sections (`policyDiagnosticsReport` in `policyDiagnosticsMarkdown.ts`). Lead it with applied requirements, their source, and impact; collapse only the unconfigured-policy inventory; do not present a `partial` catalog entry as proof that the current session fails. Report names, keys, sources, and impacts, never raw values; raw values stay in the existing disclosures under the sensitivity warning.

## Validation

Test absent, permissive, restrictive, partial, and removed values; Local/Copilot rollout with and without gaps; remembered/explicit choices without storage mutation; policy-over-user precedence with real layering; and inventory graduation to enforced. For bridge changes, exercise the bundled runtime with isolated homes and a synthetic model. Run `npm run export-policy-data` after inventory or policy changes.
