# Maintaining Agent Host Policy Support

Start with [policy ownership](./SKILL.md). Classifications describe enforcement;
adding a classification does not implement enforcement.

## Establish the scope and evidence

The [support inventory](../../../src/vs/platform/agentHost/common/agentHostPolicySupport.ts)
describes Copilot Agent Host on this machine, conservatively across delivery
channels. Do not claim coverage for remote hosts, Claude, or Codex based on it.
Do not downgrade this inventory solely because a different provider lacks support.

For each changed control, trace:

1. The configuration registration, policy name, value schema, defaults, and any
   `policyReference` settings.
2. Delivery through VS Code device policy, projected Copilot managed settings, and
   runtime-native managed settings. An editor projection is not proof that the
   runtime received the same value.
3. Initial connection, reconnect, live refresh/removal, create/resume, and the
   consumer that enforces the value before the relevant action.
4. Alternate paths: runtime discovery versus forwarded configuration, built-in
   versus custom tools, approval modes, sandbox opt-outs, and editor versus Agents
   window routing.

Read current source and relevant tests. A schema field, forwarded value, PR
description, or inventory comment alone is not enforcement evidence. Record exact
source references and disclose runtime paths that cannot be verified locally.

## Choose a defensible classification

- **enforced**: the governed behavior honors the policy within the declared scope,
  including relevant sources and alternate paths.
- **partial**: identify the specific covered and uncovered paths or sources.
  Separate confirmed gaps from runtime-native enforcement that is unverified.
- **notEnforced**: establish that the configured control is not enforced; do not
  substitute this for "not audited."
- **notApplicable**: the governed behavior is outside the target scope. An
  editor-owned control that also governs Agent Host use can be enforced rather
  than not applicable. Other-provider availability is outside the Copilot-only
  scope; this classification must not certify process-level denial of those
  providers.

If evidence is insufficient, explicitly report an unverified classification.
Do not silently turn uncertainty into an assertion of support or absence. If the
inventory needs a new uncertainty representation, update its type, exported DTO,
catalog validation, diagnostic predicates, and tests together.

## Keep all consumers aligned

The [readiness detector](../../../src/vs/platform/agentHost/common/agentHostPolicyReadiness.ts)
uses applied `policyValue`, not personal values or mere policy registration.
Maintain its requirement predicates and user-visible impacts whenever support
changes. Evaluate composed controls together.

Examples:

- `ChatMCP = all` is permissive; `none` and `registry` express requirements.
- An empty MCP allowlist denies everything; `null` means no allowlist.
- Domain lists affect both URL filtering and Local terminal sandboxing; evaluate
  sandbox activation independently, including the platform-specific setting.
- Explicit identity-capture enablement and suppression are both requirements.
- OpenTelemetry enablement and exporter type must survive the final configuration
  resolver, not just policy-to-environment forwarding. Separate destinations,
  recorder settings, and inherited protocol variables can change the result.
- A plugin or telemetry configuration may express required functionality, not
  merely a prohibition. Missing required behavior can still be a migration gap.
- Strict marketplace rules govern installation, not retroactive disabling of
  installed plugins; extra marketplaces are additive configuration.

Preserve these boundaries:

- The default-on legacy bridge enforces supported legacy restrictions regardless
  of whether an admin opens diagnostics.
- Readiness is report-only. Applied gaps never change rollout, harness selection,
  or Local picker visibility. There is no compatibility holdback or acceptance
  setting/policy. Accepting a gap for rollout must not relabel it as enforced.
- Existing experiments, preferences, remembered/inherited and explicit choices
  retain their behavior. No storage mutation, conversation migration, Chat
  banners, message blocking, or additional telemetry.
- `ChatEditorPreferCopilotHarness` is a preference, not a hard Local/Copilot lock.
  False does not prohibit explicit or remembered Copilot choices. Hard mandates
  require an explicit enforcement contract outside this diagnostic feature.
- Existing enterprise-required sandbox and managed-settings freshness behavior
  remains authoritative. Local cannot satisfy the runtime sandbox floor.
- A readiness report with no known gaps is not an attestation of runtime parity.
  State what the detector does not inspect.

Update the inventory, predicates, descriptions, readiness
report, and tests as one coherent change. Keep UI descriptions focused on concrete
admin/user consequences rather than copying a raw status label.

Append Agent Host Policy Readiness after the existing diagnostic sections so
their familiar order is preserved. Within readiness, lead with applied
requirements, their source, and impact, not the full feature catalog.
Collapse the unconfigured-policy inventory, not the
unrelated account, delivery, runtime, and authentication sections; preserve their
existing layout and raw-value disclosures. Distinguish unsupported behavior from
conditional/source-dependent coverage needing verification; a `partial` catalog
entry alone must not be presented as proof that the current session fails to
enforce a policy.

## Privacy

The readiness summary reports policy names, configuration keys, source labels,
and impacts, not raw values. Keep raw policy values in the existing diagnostic
disclosures with the report's sensitivity warning. Do not add telemetry containing
policy values, domain lists, commands, endpoints, headers, credentials,
organization/customer names, prompts, or workspace paths.

## Validation

- Test absent, permissive, restrictive, partial, and removed policy values.
- Test Local and Copilot rollout defaults with and without applied gaps.
  Diagnostics must neither veto Agent Host selection nor promote a Local baseline.
- Cover remembered and inherited automatic choices without storage mutation,
  explicit choices, other providers, virtual workspaces, host unavailability,
  hidden-Local picker behavior, and sandbox precedence.
- Test existing harness policy-over-user precedence using real configuration
  layering, and test policy removal and inventory graduation to enforced.
- Test readiness content, including uncertainty and safe
  rendering. Do not include raw sensitive values in new diagnostics summaries.
- For bridge changes, exercise the bundled runtime with isolated temporary homes
  and a synthetic local model. Check create, cold resume, removal, managed asks
  under Allow All/assisted modes, and unaffected requests. No real Copilot sign-in
  or device-policy changes should be needed for these fixtures.
- Run focused suites, client type checking, and lint as appropriate. Run the
  canonical `npm run export-policy-data` after inventory, DTO, or policy changes;
  never hand-edit the generated catalog. The catalog test must cover every
  exported policy, and both product entrypoints must agree.

For setting registration and policy-export details, see
[VS Code configuration policy](./vscode-policy.md).
