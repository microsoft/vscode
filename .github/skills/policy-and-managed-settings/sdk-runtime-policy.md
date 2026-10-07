# SDK/Runtime Managed Setting

Use this path when policy governs behavior implemented inside the Copilot runtime:

- tools, shell, files, URLs, MCP, plugins, or subagents;
- permissions, approvals, or sandboxing;
- runtime-owned model, telemetry, or remote-agent behavior.

## Contract

The runtime owns:

- managed-settings schema and rule grammar;
- restrictive composition across enterprise sources;
- enforcement immediately before side effects;
- managed-ask one-time semantics;
- effective-policy and enforcement events;
- public SDK types when an integrator must supply or observe the control.

Prefer runtime discovery of managed settings. Add a host-supplied SDK contract only when the host genuinely owns the value.

Do not add a VS Code `policy:` merely to mirror runtime policy. Do not add a GitHub-token/account-policy field as a substitute for managed settings.

## Permissions

- Managed `deny` / `ask` / `allow` are runtime policy.
- AHP `{ allow, deny }` contains tool-name client preferences; it is not the managed DSL.
- New VS Code/AHP code transports managed rules opaquely and does not parse or match them.
- `managedApprovalRequired` bypasses all automatic and persistent approval paths.
- Managed approval is human-only and one-time-only.
- Permission authorization never widens sandbox access.
- Validate rule grammar through the real SDK/runtime boundary.

### Permission modes

`permissions.disableAssistedPermissionsMode` and `permissions.disableBypassPermissionsMode`
independently restrict Assisted and Allow All. The former is sticky true across
managed sources. The latter must not be projected into a blanket Manual-only
restriction for Copilot Agent Host running on the desktop client machine. An explicit legacy `ChatToolsAutoApprove=false`
device policy still forces Manual; preserve its provenance when bridging it.
If several policy services contribute the same false value, retain all effective
sources: a managed source must not hide a simultaneous legacy device restriction.
Client-managed permission contributions and managed-policy relaxation are local
only. Remote hosts retain their existing client-side Manual clamp and default
seeding; do not forward new mode bans or managed-policy provenance to them.
Use the connection's explicit local identity, not its ambient status: the
ambient host in a remote editor window is itself remote. Remote managed-mode
integration remains unaddressed.

Granular mode controls apply to Copilot Agent Host, not the legacy Local harness.
Local retains its existing blanket restriction; do not relax it to match Agent Host.
For the in-scope connection and provider, the client renders the host's read-only
available/effective reports and submits requested selections. Policy provenance
belongs in the compatibility bridge and host, not in picker policy checks.
Missing or malformed reports make permission controls unavailable, never unrestricted
or implicitly Manual. A valid Manual-only report is distinct from unavailable state.
Live backing reports take precedence over stateless configuration previews.

`permissions.defaultMode` is a new-session default, not a restriction. The runtime
composes defaults restrictively and owns startup, fallback, and resume behavior.
On the local connection, do not materialize the displayed Manual fallback as an explicit host selection.
Only explicit `chat.defaultConfiguration.approvals` values and remembered user
choices override the runtime default; the setting's schema default does not.
Restrictions cap all requested modes, including global auto-approval. In the
Agents Window, a remembered choice wins over an ordinary configured starting
preference; a policy-enforced starting preference still wins over that remembered
choice. All remain subject to runtime restrictions.
Keep requested session configuration separate from read-only effective and
available approval modes, and never replace saved intent with a policy downgrade.
Authoritative reports belong to each live backing/chat. Session-level presentation
describes the default chat, never a sibling's most recent report. Restore preserves
the saved or hydrated runtime report instead of applying today's new-session
default. Persist pre-global mode provenance before setting global Allow All so
removal also restores the underlying choice after a cold host/runtime restart.
Keep the uncapped startup selection separately from effective reports, and retain
override provenance through overlapping policy caps. If restoration is prohibited,
use Manual without discarding the saved intention. Pre-adoption resumed sessions
without host provenance cannot recover an already-capped requested mode from the
SDK's effective-only `permissions.getMode`; removing a subsequent host override
falls back to Manual rather than inventing or elevating prior intent.
Global approval cannot bypass a backing's authoritative effective mode. Subagent
reports come from their own runtime permission events, never a sibling's grant.
Client-tool preapproval, tool-search approval metadata, and Assisted recommendations
use that requesting agent's report, not its parent's mode or UI grouping.
Unknown child modes cannot inherit approval; deferred decisions recheck authority.
The current runtime does not forward child `session.permissions_changed` events,
and Allow All may omit permission requests entirely. A child client tool with no
report becomes ready only when the SDK invokes its authorized handler, without
inventing an Allow All mode or duplicating an existing confirmation. Permission
callbacks precede synchronous event listeners; correlate the current tool's
request event before deciding Assisted approval, and fall back to confirmation
when its event or recommendation is absent.
Repeated SDK handler notifications for the same tool call share its execution
and readiness rather than replacing a pending client response.
Both the separate and `chat.experimentalModePermissionsPicker` combined picker,
as well as Agents Window permission controls, consume those same reports.
The independent `chat.experimentalModelPicker` setting does not select permission
modes.

## Host-Injection Lifecycle

Host-injected managed settings are startup configuration:

- supply applicable contributions on create and resume;
- re-supply them because they are not persisted;
- omission clears the previous injected layer;
- refresh default and peer sessions before the next turn when policy changes;
- reject unsupported cloud use instead of ignoring it.

Policy removal must survive real JSON/AHP serialization.

Client-injected settings are strict: malformed or unsupported rules reject create/resume. Server/device discovery instead uses its defined cache and fail-open/fail-closed degradation behavior.

### VS Code legacy-setting bridge

VS Code has a narrow declarative bridge for settings whose explicitly configured values must contribute restrictions to `managedSettings.permissions`. This is a bounded compatibility path for pre-existing legacy settings, not an architecture for new controls. New runtime-owned controls belong directly in the managed-settings schema and public SDK contract, without introducing or translating a VS Code setting.

Bridge invariants:

- the bridge is unconditional; the former `chat.agentHost.copilot.mapLegacySettingsToManagedSettings` setting is removed and stale values cannot disable mapped restrictions;
- add mappings only for legacy settings that already exist; never create a new setting for this bridge;
- mappings select one VS Code setting and use a callback typed against the host-owned managed permissions DTO;
- mappings contribute only fields that can be flattened restrictively (`disable`, `deny`, and `ask`); do not flatten independent `allow` lists in VS Code;
- approval-setting mappings use only exact enterprise `policyValue`; user, application, default, workspace, and folder values do not become managed approval restrictions;
- the network-domain composite retains global precedence (policy, user, then application) and registered global defaults to preserve the filter's empty-list deny-all behavior;
- personal approval settings remain on the ordinary root-config path, where session/global Allow All overrides them and default mode honors them; user/application settings are not an administrator enforcement boundary;
- administrator terminal approval restrictions become managed asks and still require confirmation under Allow All or assisted approval;
- contributions aggregate restrictively and are transported without parsing their rule grammar in VS Code;
- the aggregate is supplied on SDK create and resume;
- an empty aggregate is forwarded when settings are removed so stale restrictions clear across JSON/AHP serialization;
- contributions use a typed, client-owned AHP extension notification and a dedicated Agent Host managed-settings service; do not route them through root configuration;
- the host aggregates contributions by client and removes an owner's contribution after its disconnect grace expires;
- changed contributions refresh local default and peer sessions at an idle boundary before the next turn.

Keep additional legacy mappings in the shared bridge table and cover their scope, removal, create/resume, and refresh behavior in the corresponding Agent Host unit tests.

`chat.tools.terminal.enableAutoApprove` has a registered VS Code policy; `chat.tools.terminal.autoApprove` does not. Per-command `policyValue` fixtures exercise the resolver synthetically, not a currently deployable VS Code policy. Test targeted managed shell asks directly at the SDK boundary, and test the registered terminal approval policy through the bridge.

Default-on bridging is not full policy parity. Unsupported allowlists, patterns,
per-tool approval, and discovery paths are still tracked in
`agentHostPolicySupport.ts`. Policy Diagnostics reports applied migration concerns
without changing rollout or harness selection. Report-only gaps do not disable
supported bridge restrictions.

The runtime composes managed sandbox floors. While sandbox configuration remains host-driven, verify that Agent Host applies the effective floor to session `sandboxConfig`; policy state and containment must not diverge.
Outbound access is deny-wins: managed `allowOutbound: true` must not override local `allowNetwork: false`, and managed `allowOutbound: false` must deny even when the local setting allows access.
`addCurrentWorkingDirectory` defaults to `true` in host-supplied SDK sandbox configuration. A runtime-resolved managed `false` overrides the host default or an explicit host `true`; managed `true` does not widen an explicit host `false`.
Managed host and filesystem grant lists replace their corresponding local lists when present, including explicit empty lists. Managed block and denied-path lists combine with local denials.
When managed `readonlyPaths` is present, including `[]`, do not add host-generated read grants for attachments or shell init scripts. Removing the managed list restores those grants.

Do not log raw enterprise rules or values.

## Tests

- Runtime: schema, parsing, matching, composition, revalidation, and pre-side-effect deny.
- SDK: create/resume serialization, events, handler safety, and cloud rejection.
- Agent Host E2E: generated grammar, managed asks, removal/resume, and diagnostics.

Start with:

- `github/copilot-agent-runtime/schema/managed-settings-schema.json`
- `github/copilot-agent-runtime/src/runtime/src/permissions/managed.rs`
- `github/copilot-agent-runtime/src/runtime/src/permissions/orchestrator.rs`
- `github/copilot-sdk/nodejs/src/types.ts`
- `microsoft/vscode/src/vs/platform/agentHost/common/agentHostManagedSettings.ts`
- `microsoft/vscode/src/vs/platform/agentHost/node/copilot/copilotSessionLauncher.ts`
