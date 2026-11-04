# Extension-Provided Setting Policy

Extensions cannot declare `policy:` in `package.json`. The source of truth is `extensionConfigurationPolicy` in vscode-distro `mixin/{quality}/product.json`; VS Code attaches it to the matching extension setting at runtime.

```json
"publisher.extension.settingName": {
	"name": "PolicyName",
	"category": "InteractiveSession",
	"minimumVersion": "<first shipping major.minor>",
	"description": "Human-readable description."
}
```

1. Add the entry to every quality's `product.json` (`stable`, `insider`, `exploration`) with a unique PascalCase `name`, valid `PolicyCategory`, first shipping `minimumVersion`, and description.
2. Update VS Code's pinned distro commit and `src/vs/workbench/contrib/policyExport/test/node/extensionPolicyFixture.json` (must match the pinned distro or the export test fails).
3. Add the policy to `agentHostPolicySupport` (`src/vs/platform/agentHost/common/agentHostPolicySupport.ts`).
4. Run `pnpm run export-policy-data` and commit `build/lib/policies/policyData.jsonc`.

The export feeds the ADMX/ADML, mobileconfig, and Linux JSON generators (`build/lib/policies/policyGenerator.ts`) and the published enterprise policy docs.
