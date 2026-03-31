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
npm run transpile-client && ./scripts/code.sh --export-policy-data && GITHUB_TOKEN=$(gh auth token) node build/lib/policies/mergeExtensionPolicies.ts
```

The first command exports policies from the configuration registry. The merge step fetches `extensionConfigurationPolicy` entries from the distro's stable `product.json` and adds them to the output. It checks `.build/distro/` first; if unavailable, it uses `GITHUB_TOKEN` to fetch from the GitHub API. The `gh auth token` command provides the token from your authenticated GitHub CLI session.

This updates `build/lib/policies/policyData.jsonc`. **Never edit this file manually.** Verify your new policy appears in the output.  You will need code review from a codeowner to merge the change to main.

### Troubleshooting the merge step

The merge script reads `extensionConfigurationPolicy` entries from the distro commit pinned in `package.json`. Common issues:

- **"Skipped N entries missing 'description' or 'category'"**: The pinned distro commit has extension policy entries in the old format (only `name` and `minimumVersion`). This means a distro PR adding those fields hasn't merged yet, or `package.json` hasn't been updated to point to the new distro commit. The script will skip those entries — they won't appear in `policyData.jsonc` until the distro is updated.
- **"GITHUB_TOKEN environment variable is required"**: No local `.build/distro/` directory exists and no token was provided. Use `GITHUB_TOKEN=$(gh auth token)` or download the distro first.
- **"No distro commit found in package.json"**: The `distro` field is missing from `package.json`. This is expected in pure OSS builds — extension policies won't be merged.
- **"Failed to fetch distro product.json: 404"**: The pinned commit doesn't exist or your token doesn't have access to `microsoft/vscode-distro`.


## Policy for extension-provided settings

Extension authors cannot add `policy:` fields directly—their settings are defined in the extension's `package.json`, not in VS Code core. Instead, policies for extension settings are defined in `vscode-distro`'s `product.json` under the `extensionConfigurationPolicy` key.

### How it works

1. **Source of truth**: The `extensionConfigurationPolicy` map lives in `vscode-distro` under `mixin/{quality}/product.json` (stable, insider, exploration).
2. **Runtime**: When VS Code starts with a distro-mixed `product.json`, `configurationExtensionPoint.ts` reads `extensionConfigurationPolicy` and attaches matching `policy` objects to extension-contributed configuration properties.
3. **Export/build**: Since `--export-policy-data` runs on the OSS dev build (no distro), extension policies are NOT captured by the normal export. A separate merge step fetches the distro's `product.json` at the exact commit pinned in `package.json` and adds the extension policies to `policyData.jsonc`.

### Distro format

Each entry in `extensionConfigurationPolicy` must include:

```json
"extensionConfigurationPolicy": {
    "publisher.extension.settingName": {
        "name": "PolicyName",
        "category": "InteractiveSession",
        "minimumVersion": "1.99",
        "description": "Human-readable description."
    }
}
```

- `name`: PascalCase policy name, unique across all policies
- `category`: Must be a valid `PolicyCategory` enum value (e.g., `InteractiveSession`, `Extensions`)
- `minimumVersion`: The VS Code version that first shipped this policy
- `description`: Human-readable description string used by `mergeExtensionPolicies.ts` to generate localization key/value pairs for ADMX/ADML/macOS/Linux policy artifacts

### Adding a new extension policy

1. Add the entry to `extensionConfigurationPolicy` in **all three** quality `product.json` files in `vscode-distro` (`mixin/stable/`, `mixin/insider/`, `mixin/exploration/`)
2. After the distro PR merges and `package.json` is updated with the new distro commit, regenerate `policyData.jsonc` (see Step 4 above)

### Downstream consumers

| Consumer | What it reads | Output |
|----------|--------------|--------|
| `policyGenerator.ts` | `policyData.jsonc` | ADMX/ADML (Windows GP), `.mobileconfig` (macOS), `policy.json` (Linux) |
| `vscode-website` (`gulpfile.policies.js`) | `policyData.jsonc` | Enterprise policy reference table at code.visualstudio.com/docs/enterprise/policies |
| `vscode-docs` | Generated from website build | `docs/enterprise/policies.md` |

## Examples

Search the codebase for `policy:` to find all the examples of different policy configurations.
