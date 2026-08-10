# VS Code Configuration Policy

Use this path only when the governed behavior belongs to the editor/workbench, such as
editor UI, updates, extension management, or other VS Code-native behavior.

## Delivery

VS Code configuration policy can arrive from:

- OS policy (`NativePolicyService` on Windows/macOS, `FilePolicyService` on Linux);
- existing GitHub account data (`AccountPolicyService` via `IPolicyData`, deprecated for
  new properties);
- Copilot managed-settings projection (native MDM > server > file, per key).

`MultiplexPolicyService` combines the applicable policy services. Managed-settings keys
must be declared before they can project into VS Code configuration.

## Declaration

Find the configuration registration, typically in a `*.contribution.ts` file, and add:

```typescript
policy: {
	name: 'MyPolicyName',
	category: PolicyCategory.InteractiveSession,
	minimumVersion: '1.133',
	localization: {
		description: {
			key: 'my.config.key.policy',
			value: nls.localize('my.config.key.policy', "Policy description."),
		},
	},
}
```

Rules:

- Use a unique PascalCase `name`.
- Derive `minimumVersion` from root `package.json` major/minor.
- Import `PolicyCategory` from `vs/base/common/policy` and use an existing category
  (`Extensions`, `IntegratedTerminal`, `InteractiveSession`, `Telemetry`, or `Update`)
  unless a new category and its localization are necessary.
- Localize all text.
- For string enums, provide one localized `enumDescriptions` entry per value.
- Preserve existing `value(policyData)` callbacks when maintaining historical GitHub
  account policies; return the restrictive value to override and `undefined` otherwise.
- Read [github-managed-settings.md](./github-managed-settings.md) before projecting a
  managed-settings key into VS Code configuration.

Do not add new GitHub-token entitlement or policy fields to `IPolicyData` /
`AccountPolicyService`. Use managed settings for new Copilot enterprise controls.

### Existing GitHub preview-feature policies

Some existing preview-feature policies use the historical
`policyData.chat_preview_features_enabled` token entitlement. When maintaining one,
compare with `=== false` (not negation), return the setting's restrictive value when
false, and return `undefined` otherwise. Do not use this pattern for a new control.

If one policy controls multiple VS Code settings, one setting owns `policy`; the others
use `policyReference: { name }`.

- A setting cannot declare both `policy` and `policyReference`.
- Exactly one setting owns the policy metadata.
- Reference-setting and owner types must match.
- References contribute no `value`, managed-settings declarations, restricted value,
  localization, or other policy metadata.

## Required Procedure

1. Add/update the policy and focused value/projection tests.
2. Check the build watch task or run the smallest relevant type check/test
   (`npm run typecheck-client` when needed).
3. Run `npm run export-policy-data`.
4. Verify the policy appears and include `build/lib/policies/policyData.jsonc`.

Never edit or synthesize `policyData.jsonc`, and never invoke a single product
entrypoint's `--export-policy-data` directly. Run the npm command from the worktree
containing the source change; it exports both Workbench and the Agents window, detects
conflicting policy metadata, and produces the complete catalog.

The blocking
`src/vs/workbench/contrib/policyExport/test/node/policyExport.integrationTest.ts` uses
this canonical export path in check mode.

Key sources:

- `src/vs/base/common/policy.ts`
- `src/vs/base/common/defaultAccount.ts`
- `src/vs/platform/policy/common/policy.ts`
- `src/vs/platform/configuration/common/configurationRegistry.ts`
- `src/vs/platform/configuration/common/configurations.ts`
- `src/vs/platform/policy/common/copilotManagedSettings.ts`
- `src/vs/workbench/services/policies/common/accountPolicyService.ts`
- `build/lib/policies/policyGenerator.ts`
- `build/lib/test/policyConversion.test.ts`
