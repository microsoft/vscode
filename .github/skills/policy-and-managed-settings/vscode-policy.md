# VS Code Configuration Policy

Use only for editor/workbench-owned behavior (editor UI, updates, extension management, etc.).

Policy values reach configuration through `MultiplexPolicyService` from OS policy (`NativePolicyService` on Windows/macOS, `FilePolicyService` on Linux), legacy GitHub account data (`AccountPolicyService`, closed to new fields), and projected Copilot managed settings ([github-managed-settings.md](./github-managed-settings.md)).

## Declaration

Add to the setting's registration (usually a `*.contribution.ts`):

```typescript
policy: {
	name: 'MyPolicyName',
	category: PolicyCategory.InteractiveSession,
	minimumVersion: '1.NNN', // root package.json major.minor
	localization: {
		description: {
			key: 'my.config.key.policy',
			value: nls.localize('my.config.key.policy', "Policy description."),
		},
	},
}
```

- Unique PascalCase `name`; an existing `PolicyCategory` from `vs/base/common/policy` unless a new one (with localization) is truly needed.
- Localize everything; string enums need one `enumDescriptions` entry per value.
- `value(policyData)` returns the restrictive value to lock, `undefined` to fall through. Preserve existing callbacks, including historical `chat_preview_features_enabled === false` checks (compare with `=== false`), but do not add that check to new controls.

### One policy, several settings (`policyReference`)

One setting owns `policy`; others declare `policyReference: { name }`.

- A setting cannot declare both; exactly one owner per name; reference and owner types must match.
- References carry no value, managed settings, localization, or other metadata. `PolicyConfiguration` applies the owner's value to every reference.
- The exported catalog lists `referencedSettings` only for references loaded at export time; **Developer: Policy Diagnostics** lists all registered ones.

## Procedure

1. Add the policy and focused value/projection tests.
2. Add its status to `agentHostPolicySupport` (`src/vs/platform/agentHost/common/agentHostPolicySupport.ts`); export fails without it.
3. Run `pnpm run export-policy-data` from the worktree with the change and commit `build/lib/policies/policyData.jsonc`. It exports both Workbench and the Agents window and detects conflicts; never run one entrypoint's `--export-policy-data` directly. `policyExport.integrationTest.ts` checks the result.

Key sources: `src/vs/base/common/policy.ts`, `src/vs/platform/policy/common/policy.ts`, `src/vs/platform/configuration/common/configurationRegistry.ts`, `src/vs/platform/configuration/common/configurations.ts`, `src/vs/workbench/services/policies/common/accountPolicyService.ts`, `build/lib/policies/policyGenerator.ts`.
