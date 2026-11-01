# SDK/Runtime Managed Setting

For behavior executed inside the Copilot runtime: tools, shell, files, URLs, MCP, plugins, subagents, permissions, approvals, sandboxing, and runtime model/telemetry/remote-agent behavior.

## Contract

The runtime owns the schema and rule grammar, restrictive composition across sources, enforcement immediately before side effects, managed-ask semantics, effective-policy events, and public SDK types. Prefer runtime discovery; add a host-supplied SDK field only when the host genuinely owns the value. Do not add a VS Code `policy:` or account-policy field to mirror a runtime setting.

## Permissions

- Managed `deny`/`ask`/`allow` are runtime policy. AHP `{ allow, deny }` holds client tool-name preferences, not the managed DSL. VS Code transports managed rules opaquely and never parses or matches them.
- `managedApprovalRequired` forbids reusable grants and host auto-approval shortcuts. In Assisted mode, only an approving judge verdict from the current permission callback, on a derived `commands`/`read`/`write`/`url`/`workflow` prompt with the human requirement cleared, approves a managed ask once. Never reuse verdicts cached per tool call.
- Authorization never widens sandbox access. Validate grammar through the real SDK boundary.

## Harness eligibility

A non-empty managed `permissions.deny` or managed `sandbox.enabled: true` requires Copilot Agent Host (`requiresCopilotAgentHost` is the single routing decision). Empty deny arrays, other `permissions.*`/sandbox keys, legacy `ChatToolsAutoApprove`, and personal sandbox preferences do not. VS Code only checks deny-list emptiness.

When Agent Host is required:

- Resolve account policy before activating Local. New chats use Copilot, overriding explicit/remembered Local; an unavailable host is an actionable error, never a Local fallback (including virtual workspaces).
- Displaying an existing Local chat moves its transcript and unsent draft to Copilot (no model/permission settings copied) and archives the original after the destination opens. On failure the original stays read-only with **Move to Copilot**; sends and queues stay blocked. Background history loads do not migrate.
- Local stays visible but disabled in the picker with a policy explanation. Editor inline chat's limited read/edit flow is exempt.
- Removing the requirement restores Local eligibility without rewriting preferences.

Temporary managed-only controls (per-key MDM > server > file):

- `vscode.temporaryAllowLocalHarness: false` prohibits Local and disables Claude/Codex, using the flow above. Only effective boolean `false` acts.
- `vscode.temporaryDefaultToLocalHarness: true` projects to policy-only `chat.temporaryDefaultToLocalHarness`: keeps Local available and suppresses Copilot-default/preference rollout and managed-policy routing. Explicit choices and existing chats are unchanged; runtime rules still apply to Copilot sessions. `temporaryAllowLocalHarness: false` wins.

`ChatEditorPreferCopilotHarness` is a preference, not a lock: `false` does not prohibit Copilot.

## Approval modes

The Copilot host resolves native mode restrictions before the legacy `ChatToolsAutoApprove` fallback: an explicitly configured valid new-mode restriction replaces the legacy blanket restriction; `defaultMode` alone does not. Other bridged restrictions (per-tool bypass lock, terminal asks) still apply.

- The host publishes selectable modes and the starting mode, validates client writes, and reconciles runtime refusals. Desktop and remote hosts use the same path, but native settings resolve where the host runs.
- Pickers show supported-but-withheld modes disabled. Show the managed-policy reason only when client-known policy explains it **and** the host is the same-machine desktop host; otherwise use a neutral reason. Hide modes absent from the schema enum. Never reapply the legacy clamp to host-reported choices.
- Clients keep the legacy guard until a host advertises an approval-policy report. Normalize explicit/remembered preferences after schema discovery, before prewarming. Changed managed settings apply on restart.
- Local offers Default, Allow All, and Autopilot (no Assisted); mode settings alone do not affect Local eligibility.

| # | Legacy policy | Managed settings | Allow All | Assisted | Manual |
|---|---|---|:---:|:---:|:---:|
| 1 | — | — | ✅ | ✅ | ✅ |
| 2 | `ChatToolsAutoApprove: false` | — | ❌ | ❌ | ✅ |
| 3 | — | `disableBypassPermissionsMode: "disable"` | ❌ | ✅ | ✅ |
| 4 | `ChatToolsAutoApprove: false` | `disableBypassPermissionsMode: "disable"` | ❌ | ✅ | ✅ |
| 5 | — | `disableAssistedPermissionsMode: true` | ✅ | ❌ | ✅ |
| 6 ⚠️ | `ChatToolsAutoApprove: false` | `disableAssistedPermissionsMode: true` | ✅ | ❌ | ✅ |
| 7 | `ChatToolsAutoApprove: false` | both of the above | ❌ | ❌ | ✅ |
| 8 ⚠️ | `ChatToolsAutoApprove: false` | `disableBypassPermissionsMode: "enable"` | ✅ | ✅ | ✅ |

⚠️ Setting any new-mode restriction opts out of the legacy key, so unspecified modes are not restricted by it.

## Host-injected settings

- Supply on local create **and** resume (not persisted). Omission clears the injected layer; removal must survive real JSON/AHP serialization.
- Refresh default and peer sessions at an idle boundary before the next turn. Reject unsupported cloud use rather than ignoring it.
- Client-injected rules are strict: malformed rules reject create/resume. Server/device discovery uses its own cache and fail-open/closed behavior.

## Legacy-setting bridge

A declarative table in Agent Host that turns **existing** VS Code settings into `managedSettings.permissions` restrictions. It is unconditional (the old `chat.agentHost.copilot.mapLegacySettingsToManagedSettings` gate is removed). Never add a setting for it.

- Contribute only restrictions (`disable`, `deny`, `ask`, hostname `limitTo`); never flatten `allow` lists into grants. Aggregate restrictively without parsing grammar.
- Approval mappings read only enterprise `policyValue`. Personal approval settings stay on the root-config path where Allow All overrides them. Admin terminal approval restrictions become managed asks that still prompt under Allow All/Assisted.
- The network-domain composite keeps global precedence (policy, user, application) and registered defaults so an empty filter stays deny-all. Allow-lists become boundaries only when both filter and list are policy-owned; invalid entries are skipped individually. It governs runtime Domain operations only, not browser/client tools, terminal overrides, or extension/MCP networking.
- Transport uses a typed, client-owned AHP notification and a dedicated managed-settings service, not root configuration. The host aggregates per client and drops a client's contribution after its disconnect grace. Supply on create/resume; forward an empty aggregate on removal.
- `chat.tools.terminal.enableAutoApprove` has a policy; `chat.tools.terminal.autoApprove` does not, so per-command `policyValue` fixtures are synthetic. Test managed shell asks at the SDK boundary.

Bridging is not full parity; remaining gaps are tracked in `agentHostPolicySupport.ts`.

## Sandbox composition

The runtime composes managed sandbox floors; verify Agent Host applies the effective floor to session `sandboxConfig`. Outbound access is deny-wins in both directions. Managed `addCurrentWorkingDirectory: false` overrides the host default; managed `true` never widens a host `false`. Present managed host/filesystem grant lists (including `[]`) replace local lists; block/denied lists combine. A present managed `readonlyPaths` suppresses host-generated read grants for attachments and shell init scripts.

## Tests and sources

Cover runtime schema/matching/composition and pre-side-effect deny; SDK create/resume serialization and cloud rejection; Agent Host E2E managed asks, removal/resume, and diagnostics.

- `github/copilot-agent-runtime`: `schema/managed-settings-schema.json`, `src/runtime/src/permissions/managed.rs`, `orchestrator.rs`
- `github/copilot-sdk`: `nodejs/src/types.ts`
- VS Code: `src/vs/platform/agentHost/common/agentHostManagedSettings.ts`, `src/vs/platform/agentHost/node/copilot/copilotSessionLauncher.ts`
