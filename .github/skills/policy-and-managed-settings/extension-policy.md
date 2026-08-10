# Extension-Provided Setting Policy

Use this path when the setting is contributed by an extension rather than VS Code core.
Extensions cannot declare core `policy:` metadata in their `package.json`.

The source of truth is `extensionConfigurationPolicy` in `vscode-distro`
`mixin/{quality}/product.json`. At runtime, VS Code attaches that metadata to matching
extension configuration properties.

```json
"publisher.extension.settingName": {
	"name": "PolicyName",
	"category": "InteractiveSession",
	"minimumVersion": "1.133",
	"description": "Human-readable description."
}
```

## Procedure

1. Add the setting to `extensionConfigurationPolicy` in every `vscode-distro`
   product-quality `product.json` (`stable`, `insider`, and `exploration`).
2. Include:
   - unique PascalCase `name`;
   - valid `PolicyCategory`;
   - first shipping `minimumVersion`;
   - human-readable `description`.
3. Update VS Code's pinned distro commit.
4. Update
   `src/vs/workbench/contrib/policyExport/test/node/extensionPolicyFixture.json`.
5. Run `npm run export-policy-data`.
6. Verify and include `build/lib/policies/policyData.jsonc`.

The fixture must match the pinned distro policy data or the policy-export integration
test fails.

The canonical export launches both Workbench and the Agents window with isolated
profiles and merges their policy catalogs. Do not invoke a single entrypoint directly.

Downstream consumers:

| Consumer | Output |
|---|---|
| `build/lib/policies/policyGenerator.ts` | Windows ADMX/ADML, macOS mobileconfig, Linux policy JSON |
| `vscode-website` policy build | Enterprise policy reference |
| `vscode-docs` | Generated enterprise policy documentation |
