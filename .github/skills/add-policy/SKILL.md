---
name: add-policy
description: Use when adding, modifying, or reviewing VS Code configuration policies. Covers the full policy lifecycle from registration to export to platform-specific artifacts. Run on ANY change that adds a `policy:` field to a configuration property.
---

# Adding a Configuration Policy

Policies allow enterprise administrators to lock configuration settings via OS-level mechanisms (Windows Group Policy, macOS managed preferences, Linux config files) or via Copilot account-level policy data. This skill covers the complete procedure.

## When to Use

- Adding a new `policy:` field to any configuration property
- Modifying an existing policy (rename, category change, etc.)
- Reviewing a PR that touches policy registration
- Adding account-based policy support via `IPolicyData`

## Architecture Overview

### Policy Sources (layered, last writer wins)

| Source | Implementation | How it reads policies |
|--------|---------------|----------------------|
| **OS-level** (Windows registry, macOS plist) | `NativePolicyService` via `@vscode/policy-watcher` | Watches `Software\Policies\Microsoft\{productName}` (Windows) or bundle identifier prefs (macOS) |
| **Linux file** | `FilePolicyService` | Reads `/etc/vscode/policy.json` |
| **Account/GitHub** | `AccountPolicyService` | Reads `IPolicyData` from `IDefaultAccountService.policyData`, applies `value()` function |
| **Multiplex** | `MultiplexPolicyService` | Combines OS-level + account policy services; used in desktop main |

### Key Files

| File | Purpose |
|------|---------|
| `src/vs/base/common/policy.ts` | `PolicyCategory` enum, `IPolicy` interface |
| `src/vs/platform/policy/common/policy.ts` | `IPolicyService`, `AbstractPolicyService`, `PolicyDefinition` |
| `src/vs/platform/configuration/common/configurations.ts` | `PolicyConfiguration` — bridges policies to configuration values |
| `src/vs/workbench/services/policies/common/accountPolicyService.ts` | Account/GitHub-based policy evaluation |
| `src/vs/workbench/services/policies/common/multiplexPolicyService.ts` | Combines multiple policy services |
| `src/vs/workbench/contrib/policyExport/electron-browser/policyExport.contribution.ts` | `--export-policy-data` CLI handler |
| `src/vs/base/common/defaultAccount.ts` | `IPolicyData` interface for account-level policy fields |
| `build/lib/policies/policyData.jsonc` | Auto-generated policy catalog (DO NOT edit manually) |
| `build/lib/policies/policyGenerator.ts` | Generates ADMX/ADML (Windows), plist (macOS), JSON (Linux) |
| `build/lib/test/policyConversion.test.ts` | Tests for policy artifact generation |

## Procedure

### Step 1 — Add the `policy` field to the configuration property

Find the configuration registration (typically in a `*.contribution.ts` file) and add a `policy` object to the property schema.

**Required fields:**

**Determining `minimumVersion`:** Always read `version` from the root `package.json` and use the `major.minor` portion. For example, if `package.json` has `"version": "1.112.0"`, use `minimumVersion: '1.112'`. Never hardcode an old version like `'1.99'`.

```typescript
policy: {
    name: 'MyPolicyName',                          // PascalCase, unique across all policies
    category: PolicyCategory.InteractiveSession,    // From PolicyCategory enum
    minimumVersion: '1.112',                        // Use major.minor from package.json version
    localization: {
        description: {
            key: 'my.config.key',                   // NLS key for the description
            value: nls.localize('my.config.key', "Human-readable description."),
        }
    }
}
```

**Optional: `value` function for account-based policy:**

If this policy should also be controllable via Copilot account policy data (from `IPolicyData`), add a `value` function:

```typescript
policy: {
    name: 'MyPolicyName',
    category: PolicyCategory.InteractiveSession,
    minimumVersion: '1.112',                        // Use major.minor from package.json version
    value: (policyData) => policyData.my_field === false ? false : undefined,
    localization: { /* ... */ }
}
```

The `value` function receives `IPolicyData` (from `src/vs/base/common/defaultAccount.ts`) and should:
- Return a concrete value to **override** the user's setting
- Return `undefined` to **not apply** any account-level override (falls through to OS policy or user setting)

If you need a new field on `IPolicyData`, add it to the interface in `src/vs/base/common/defaultAccount.ts`.

**Optional: `enumDescriptions` for enum/string policies:**

```typescript
localization: {
    description: { key: '...', value: nls.localize('...', "...") },
    enumDescriptions: [
        { key: 'opt.none', value: nls.localize('opt.none', "No access.") },
        { key: 'opt.all', value: nls.localize('opt.all', "Full access.") },
    ]
}
```

### Step 2 — Ensure `PolicyCategory` is imported

```typescript
import { PolicyCategory } from '../../../../base/common/policy.js';
```

Existing categories in the `PolicyCategory` enum:
- `Extensions`
- `IntegratedTerminal`
- `InteractiveSession` (used for all chat/Copilot policies)
- `Telemetry`
- `Update`

If you need a new category, add it to `PolicyCategory` in `src/vs/base/common/policy.ts` and add corresponding `PolicyCategoryData` localization.

### Step 3 — Validate TypeScript compilation

Check the `VS Code - Build` watch task output, or run:

```bash
npm run compile-check-ts-native
```

### Step 4 — Export the policy data

Regenerate the auto-generated policy catalog:

```bash
npm run transpile-client && ./scripts/code.sh --export-policy-data
```

This updates `build/lib/policies/policyData.jsonc`. **Never edit this file manually.** Verify your new policy appears in the output.  You will need code review from a codeowner to merge the change to main.


## Policy for extension-provided settings

For an extension author to provide policies for their extension's settings, a change must be made in `vscode-distro` to the `product.json`.

## Examples

Search the codebase for `policy:` to find all the examples of different policy configurations.
