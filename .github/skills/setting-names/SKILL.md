---
name: setting-names
description: Use when adding, renaming, or reviewing a VS Code setting ID, or when marking a setting as experimental, preview, or advanced. Covers why maturity goes in `tags` rather than in the setting ID, and how to rename a setting with a migration.
---

# Setting names

A setting ID is permanent: users write it into `settings.json`, settings sync, dotfiles, docs, and policies. Name it for **what it controls**, never for **how mature** it is.

## Maturity goes in `tags`, not in the ID

Don't put `experimental`, `preview`, `beta`, or similar into a setting ID (`foo.experimental.bar`, `foo.experimentalBar`). Use tags instead:

```ts
'chat.foo.enabled': {
	type: 'boolean',
	default: false,
	tags: ['experimental'],
	description: localize('chat.foo.enabled', "Controls whether foo is enabled."),
},
```

- `experimental`: the feature might change a lot or be removed.
- `preview`: we intend to keep the feature, but it is not finished yet. Since it will stay, the ID must already be the final one.
- `advanced`: hidden from the Settings editor unless the user filters by `@tag:advanced` or searches for the setting ID. This is independent of maturity.

The Settings editor shows an "Experimental" or "Preview" badge for these tags, sorts them after stable settings, and lets users filter them with `@tag:experimental`, `@tag:preview`, and `@tag:stable`. When the feature graduates, remove the tag (and maybe change the default); the ID stays the same and nobody's settings break.

An `experimental` tag doesn't put a setting under A/B experiment control. That needs `experiment: { mode }` (see the [experiments skill](../experiments/SKILL.md)). Renaming an experiment-controlled setting also requires updating its treatment in ExP.

The only exception is a setting that will be deleted rather than promoted, for example a temporary toggle for an alternative implementation. A name that says so is acceptable there, but the tag is still preferred.

## Renaming a setting

Avoid renames. If one is unavoidable (for example to drop an existing `experimental` segment), register a migration in `IConfigurationMigrationRegistry` ([configuration.ts](../../../src/vs/workbench/common/configuration.ts)) that moves existing values to the new ID without overwriting a value the user already set there:

```ts
Registry.as<IConfigurationMigrationRegistry>(WorkbenchExtensions.ConfigurationMigration)
	.registerConfigurationMigrations([{
		key: 'foo.experimental.bar',
		migrateFn: (value: unknown, valueAccessor) => {
			const result: ConfigurationKeyValuePairs = [['foo.experimental.bar', { value: undefined }]];
			if (value !== undefined && valueAccessor('foo.bar') === undefined) {
				result.push(['foo.bar', { value }]);
			}
			return result;
		}
	}]);
```

Also update docs, tests, and other code that reads the old ID.
