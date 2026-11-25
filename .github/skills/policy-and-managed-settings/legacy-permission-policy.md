# Pre-1.133 Permission-Policy Migration

Temporary compatibility for permission policies that existed before VS Code 1.133. Never use it for new controls, and do not grow it into a general translation framework.

Two bounded paths:

- **Legacy permission policy translation:** maps an exact enterprise `policyValue` to its runtime equivalent.
- **Legacy setting bridge:** contributes restrictions through the declarative Agent Host bridge ([contract](./sdk-runtime-policy.md#legacy-setting-bridge)).

Rules:

- Legacy permission translation and approval mappings use only enterprise `policyValue`, never user/workspace values. Personal approval preferences remain overridable by Allow All. The network-domain bridge retains the global-layer precedence described in the [bridge contract](./sdk-runtime-policy.md#legacy-setting-bridge).
- Map only to an equivalent runtime capability; keep it restrictive and never synthesize permissive authorization. The runtime owns grammar and enforcement.
- Keep existing enforcement until the runtime replacement is effective, and validate emitted rules across the real SDK boundary (create/resume, removal, default and peer sessions, diagnostics).

## Retired sandbox device policies

`ChatAgentSandboxEnabled`, `ChatAgentSandboxAllowNetwork`, and `ChatAgentSandboxAllowUnsandboxedCommands` are deprecated, not removed. Keep their settings, defaults, Local behavior, and catalog descriptions. Their forwarded values are overridable root defaults, never a session policy floor; mandatory sandboxing uses runtime-native `sandbox.enabled`. Their support status is `notApplicable` by explicit scope decision, not because forwarding has no effect. Admins migrate to [Copilot managed settings](https://docs.github.com/en/copilot/how-tos/administer-copilot/manage-for-enterprise/use-managed-settings/get-started).

## Facts to reverify before relying on them

- Kind-only `Shell` is the all-shell rule; `Shell(*)` is invalid.
- Agent Host custom terminal tools arrive as `custom-tool`, not `shell`.
- AHP `permissions.deny` is not enforced by the host permission manager.
- Hook permission requests are outside the managed request families.
- Account-scoped diagnostics omit the session-local injected layer.
