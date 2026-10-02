# Pre-1.133 Permission-Policy Migration

This is a temporary compatibility path for existing permission policies introduced before VS Code 1.133.0. The migration remains in progress.

Do not use this path for new controls.

## Compatibility paths

There are two related but distinct bounded migrations:

- **Legacy permission policy translation** reads only an exact enterprise `policyValue` and maps the old policy to its runtime equivalent.
- **Legacy VS Code setting translation** contributes equivalent restrictions through the declarative Agent Host bridge. Approval settings translate only enterprise `policyValue`; personal user/application approval preferences remain overridable by Allow All and are not an administrator enforcement boundary. The network-domain composite retains global-layer precedence (policy, user, then application) and registered defaults. See the [bridge contract](./sdk-runtime-policy.md#vs-code-legacy-setting-bridge).

Neither path is open to newly designed settings or controls. Put new runtime-owned controls directly in the shared managed-settings schema and SDK contract. The legacy-setting bridge is unconditional; its former staged-adoption gate has been retired.

Legacy `ChatAgentSandboxEnabled` is not migrated into a mandatory Agent Host sandbox requirement. Existing sandbox-setting forwarding still carries its effective value as an overridable root default. Use runtime-native `sandbox.enabled` managed settings for mandatory sandboxing; do not promote the legacy value into a session policy floor. Local enforcement and other existing legacy translations are unchanged.

The remaining legacy sandbox settings and the `ChatAgentSandboxEnabled`, `ChatAgentSandboxAllowNetwork`, and `ChatAgentSandboxAllowUnsandboxedCommands` device policies are deprecated, not removed. Keep their existing defaults and Local behavior. Retain visible Settings editor migration notices and deprecated policy descriptions in the generated catalog. The separate sandbox auto-approval setting and its policy have been removed; sandbox auto-approval retains its previous default behavior. New Agent Host sandbox controls are not deprecated. Administrators should migrate to [Copilot managed settings](https://docs.github.com/en/copilot/how-tos/administer-copilot/manage-for-enterprise/use-managed-settings/get-started); personal Agent Host file-path preferences use `chat.agent.sandbox.fileSystem.userConfiguredPaths`.

These three retired device policies are outside the supported Agent Host policy contract, so their catalog status is `notApplicable` and readiness does not report them as outstanding parity gaps. This is an explicit scope decision, not a claim that setting forwarding has no effect or that legacy and native enforcement are equivalent. Runtime-native sandbox requirements remain enforced.

## Legacy permission policy rules

- Translate only exact enterprise `policyValue`; never user/workspace values.
- Map only to an equivalent runtime capability.
- Preserve restrictive semantics; do not synthesize permissive authorization.
- The compatibility bridge may emit managed rules, but the runtime remains the grammar and enforcement authority.
- Validate emitted rules across the real SDK/runtime boundary.
- Retain existing enforcement until the SDK/runtime replacement is effective.
- Cover local create/resume, omission/removal, default and peer sessions, and diagnostics.

Known facts to reverify while working here:

- Kind-only `Shell` is the all-shell form; `Shell(*)` is invalid managed-rule syntax.
- Agent Host custom terminal tools arrive as `custom-tool`, not `shell`.
- AHP `permissions.deny` exists but is not enforced by the current host permission manager.
- Managed Tool and MCP tool-call coverage is evolving.
- Hook permission requests are outside the currently managed request families.
- Account-scoped managed-settings diagnostics omit the session-local injected layer.

Do not expand this bridge into a general translation framework. New enterprise controls belong in the shared managed-settings/SDK model.
