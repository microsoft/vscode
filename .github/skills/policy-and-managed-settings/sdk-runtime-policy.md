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
- Raw `managedApprovalRequired` preserves managed provenance and forbids reusable grants and unrelated host auto-approval shortcuts.
- In Assisted mode, only an approving judge verdict on a derived `commands`, `read`, `write`, `url`, or `workflow` prompt with the human requirement cleared may approve a managed ask once. Missing or unsupported derived prompts remain human-required.
- Assisted approvals use only the current permission callback's derived verdict, never an event-cached verdict keyed by tool call. A tool call can encounter multiple distinct permission requests; missing callback verdicts cannot grant Assisted approval.
- Permission authorization never widens sandbox access.
- Validate rule grammar through the real SDK/runtime boundary.

### Harness eligibility for managed policy

A non-empty effective managed `permissions.deny` list, or managed `sandbox.enabled: true`, requires Copilot Agent Host, subject to the existing temporary Local escape hatch. A valid empty deny array, other `permissions.*` settings, and other sandbox settings do not independently require Agent Host. Malformed deny values remain fail-closed for runtime validation. VS Code only checks whether the deny list is empty; it does not interpret or enforce rule grammar. Native MDM continues watching the runtime's declared permission keys. Permissions do not turn sandboxing on. Explicit `vscode.temporaryAllowLocalHarness: false` still overrides the escape hatch. Claude/Codex retain their separate presence-based managed-settings governance.

When effective enterprise policy prohibits Local, the harness picker keeps its row visible but disabled, with a policy explanation and a link to learn why Local is disabled. This presentation does not make Local selectable, usable as a fallback, or exempt from request blocking and migration. Personal visibility settings still apply when no enterprise restriction is active.

The legacy network boundary bridge targets runtime-native Domain operations only. It does not change tool selection, the experimental terminal override, or VS Code client fetch. Native `limitTo` enforcement in the integrated browser is deferred; existing browser controls remain unchanged. Browser/client tools, experimental terminal overrides, arbitrary extension/MCP networking, and client-run code must not be assumed to inherit the runtime's Domain enforcement.

Resolve initial account policy before choosing or activating Local. When effective policy requires Agent Host, new chats select Copilot, including explicit or remembered Local choices. An unavailable host must produce an actionable error, never a Local fallback. Displaying an existing non-archived Local chat automatically moves its transcript and unsent draft/attachments to Copilot, without sending or copying model and permission settings. Background history loads do not migrate chats. The original is archived only after the destination opens, and archived originals remain readable without migrating again. On failure, the original remains read-only with a Move to Copilot retry action; sending, retrying requests, and queueing stay blocked. The destination uses its normal policy-constrained defaults. Removing the requirement restores normal Local eligibility without rewriting preferences. Removing `permissions.deny` or replacing it with a valid empty array removes its harness requirement. Legacy `ChatToolsAutoApprove` alone and personal sandbox preferences do not require Agent Host. The same request gate applies to old Local chats under a managed sandbox floor; virtual workspaces and unavailable hosts cannot silently run Local instead. Editor inline chat's limited read/edit flow remains available as an explicit exception; this gate does not enforce runtime permission rules on those edits.

## Host-Injection Lifecycle

### Approval modes

Copilot Agent Host resolves native mode restrictions before applying the legacy global approval fallback. An explicitly configured new mode restriction replaces the legacy blanket restriction; `defaultMode` alone does not. Other bridged restrictions, including the per-tool bypass lock and terminal asks, remain in force. The host publishes selectable modes and the starting selection in session config, validates client writes, and reconciles runtime refusals to the actual applied mode. Desktop and remote Copilot Agent Hosts use the same policy path. Native settings resolve where the host runs; this does not replicate desktop device policies to remote hosts. The UI must not reapply the legacy clamp to host-reported choices. Pickers keep supported modes that the report omits visible but disabled and never selectable. The report does not carry a reason, so pickers show the managed-policy indicator and policy explanation only when client-known policy (the `ChatToolsAutoApprove` policy or a managed `permissions.disable*PermissionsMode` value) disables that mode; otherwise they show a neutral unavailable reason. Modes absent from the approval schema enum are unsupported and stay hidden. Local offers Default, Allow All, and Autopilot, not Assisted. Mode restrictions alone do not disable the Local harness or implement runtime modes in Local; its existing controls remain in effect. Clients retain the legacy guard until a host advertises its approval-policy report. Both standard `approvalMode` and VS Code `autoApprove` reports follow this contract. The report requires a valid approval binding. Under the legacy restriction, discover that binding before creation even without an explicit preference, and seed Manual when the host does not publish its own policy report. Host-owned approval reports are never forwarded as client configuration inputs. Explicit and remembered approval preferences are normalized after schema discovery, before prewarming a backend; they must not be irreversibly clamped before discovery. Defaults are only startup preferences; no additional durable pre-override restoration state is maintained. Restart to apply changed managed settings. A client restart refreshes selectable modes for already-loaded chats even while their SDK sessions remain disconnected, without resuming them or sending a prompt. The last runtime-reported applied mode is not overwritten by this preview.

Client-known policy attribution applies only to the desktop Copilot Agent Host on the same machine. Do not attribute a remote, container, web, or third-party host's withheld modes to desktop policy; keep the neutral explanation when the host does not report a reason.

**Simple rule:** an explicitly configured valid new mode restriction replaces the legacy blanket mode policy on the supported Copilot Agent Host; otherwise the old policy is the fallback. `defaultMode` alone never removes restrictions.

**Potential surprise:** scenarios 6 and 8 below allow Allow All despite the old key being false. Setting a new mode restriction opts into the new group, so an unspecified mode is not implicitly restricted by the legacy key. These mode settings alone do not disable Local; its eligibility follows the harness rules above. Other managed/per-tool restrictions still apply. These rows assume all modes are supported and show selectable modes, not defaults. The legacy JSON is logical policy notation, not an OS-specific deployment format.

✅ Allowed; ❌ Blocked.

| # | Legacy policy JSON | Managed-settings JSON | Full Local chat | Copilot/Agent Host: Allow All | Copilot/Agent Host: Assisted | Copilot/Agent Host: Manual |
|---|---|---|---|:---:|:---:|:---:|
| 1 | `{}` | `{}` | Available | ✅ | ✅ | ✅ |
| 2 | `{"ChatToolsAutoApprove":false}` | `{}` | Available, legacy restrictions | ❌ | ❌ | ✅ |
| 3 | `{}` | `{"permissions":{"disableBypassPermissionsMode":"disable"}}` | Normal harness eligibility | ❌ | ✅ | ✅ |
| 4 | `{"ChatToolsAutoApprove":false}` | `{"permissions":{"disableBypassPermissionsMode":"disable"}}` | Normal harness eligibility | ❌ | ✅ | ✅ |
| 5 | `{}` | `{"permissions":{"disableAssistedPermissionsMode":true}}` | Normal harness eligibility | ✅ | ❌ | ✅ |
| 6 ⚠️ | `{"ChatToolsAutoApprove":false}` | `{"permissions":{"disableAssistedPermissionsMode":true}}` | Normal harness eligibility | ✅ | ❌ | ✅ |
| 7 | `{"ChatToolsAutoApprove":false}` | `{"permissions":{"disableBypassPermissionsMode":"disable","disableAssistedPermissionsMode":true}}` | Normal harness eligibility | ❌ | ❌ | ✅ |
| 8 ⚠️ | `{"ChatToolsAutoApprove":false}` | `{"permissions":{"disableBypassPermissionsMode":"enable"}}` | Normal harness eligibility | ✅ | ✅ | ✅ |

Host-injected managed settings are startup configuration:

- supply them on local create and resume;
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
- mappings contribute restrictions (`disable`, `deny`, `ask`, and canonical hostname `limitTo` boundaries); never flatten independent `allow` lists into approval grants;
- approval-setting mappings use only exact enterprise `policyValue`; user, application, default, workspace, and folder values do not become managed approval restrictions;
- global auto-approval is resolved by the Copilot host against native mode settings, rather than flattened into an unconditional bypass ban by this table;
- the network-domain composite retains global precedence (policy, user, then application) and registered global defaults to preserve the filter's empty-list deny-all behavior;
- nonempty allow-lists become native boundaries only when both the filter and the allow-list are policy-owned; each connected client's boundary must admit the host, and an empty intersection stays deny-all;
- unsupported legacy allow-list entries are logged and skipped individually, preserving valid siblings; when no entries survive, the boundary remains deny-all;
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

Default-on bridging is not full policy parity. Other configuration sources, patterns, per-tool approval, and discovery paths are still tracked in `agentHostPolicySupport.ts`. Policy Diagnostics reports applied migration concerns without changing rollout or harness selection. Report-only gaps do not disable supported bridge restrictions.

The runtime composes managed sandbox floors. While sandbox configuration remains host-driven, verify that Agent Host applies the effective floor to session `sandboxConfig`; policy state and containment must not diverge. Outbound access is deny-wins: managed `allowOutbound: true` must not override local `allowNetwork: false`, and managed `allowOutbound: false` must deny even when the local setting allows access. `addCurrentWorkingDirectory` defaults to `true` in host-supplied SDK sandbox configuration. A runtime-resolved managed `false` overrides the host default or an explicit host `true`; managed `true` does not widen an explicit host `false`. Managed host and filesystem grant lists replace their corresponding local lists when present, including explicit empty lists. Managed block and denied-path lists combine with local denials. When managed `readonlyPaths` is present, including `[]`, do not add host-generated read grants for attachments or shell init scripts. Removing the managed list restores those grants.

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
