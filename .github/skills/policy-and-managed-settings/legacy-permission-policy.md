# Pre-1.133 Permission-Policy Migration

This is a temporary compatibility path for existing permission policies introduced
before VS Code 1.133.0. The migration remains in progress.

Do not use this path for new controls.

## Rules

- Translate only exact enterprise `policyValue`; never user/workspace values.
- Map only to an equivalent runtime capability.
- Preserve restrictive semantics; do not synthesize permissive authorization.
- The compatibility bridge may emit managed rules, but the runtime remains the grammar
  and enforcement authority.
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

Do not expand this bridge into a general translation framework. New enterprise controls
belong in the shared managed-settings/SDK model.
