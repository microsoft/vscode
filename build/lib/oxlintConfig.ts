/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Linter } from 'eslint';
import type { DummyRuleMap, OxlintConfig, OxlintOverride } from 'oxlint';

/**
 * The plugins that oxlint loads as JS plugins, by the name that both linters know them by, and the module that oxlint
 * loads, relative to the repository root.
 */
export const oxlintJsPlugins: Readonly<Record<string, string>> = {
	'local': './.eslint-plugin-local/index.ts',
	'copilot-local': './extensions/copilot/.eslintplugin/index.ts',
	'header': './.eslint-plugin-local/adapters/header.ts',
	'eslint-js': './.eslint-plugin-local/adapters/eslintCore.ts',
	'ts-eslint-js': './.eslint-plugin-local/adapters/typescriptEslint.ts',
	'jsdoc-js': 'eslint-plugin-jsdoc',
	'@stylistic': '@stylistic/eslint-plugin',
};

/**
 * Plugins whose rules oxlint implements natively under the same names. Rules without a plugin are ESLint's core rules,
 * which oxlint implements natively too.
 */
const nativePlugins = new Set(['@typescript-eslint']);

function pluginOf(rule: string): string {
	const slash = rule.lastIndexOf('/');
	return slash === -1 ? '' : rule.slice(0, slash);
}

function isGlobalIgnores(block: Linter.Config): boolean {
	return Object.keys(block).every(key => key === 'ignores' || key === 'name') && !!block.ignores;
}

function toPatterns(files: Linter.Config['files']): string[] {
	return (files ?? ['**/*']).map(pattern => {
		if (typeof pattern !== 'string') {
			throw new Error('oxlint supports only string patterns in `files`');
		}
		return pattern;
	});
}

/**
 * Converts the ESLint flat configuration of this repository into an oxlint configuration that runs the same rules on
 * the same files. Rule names stay the same, so disable directives work in both linters: core rules and the
 * `@typescript-eslint` rules are those that oxlint implements, and the other plugins load as JS plugins. Rules that
 * oxlint does not know make it fail, rather than silently skip them.
 */
export function toOxlintConfig(eslintConfig: readonly Linter.Config[]): OxlintConfig {
	const ignorePatterns: string[] = [];
	const overrides: OxlintOverride[] = [];
	const usedJsPlugins = new Set<string>();

	for (const block of eslintConfig) {
		if (isGlobalIgnores(block)) {
			ignorePatterns.push(...block.ignores!);
			continue;
		}
		for (const unsupported of ['processor', 'settings', 'linterOptions'] as const) {
			if (block[unsupported] !== undefined) {
				throw new Error(`oxlint does not support \`${unsupported}\` in the ESLint configuration`);
			}
		}
		if (!block.rules) {
			continue;
		}

		const rules: DummyRuleMap = {};
		for (const [rule, entry] of Object.entries(block.rules)) {
			const plugin = pluginOf(rule);
			if (plugin && !nativePlugins.has(plugin)) {
				if (!Object.hasOwn(oxlintJsPlugins, plugin)) {
					throw new Error(`oxlint cannot load the plugin of '${rule}': add the plugin to oxlintJsPlugins`);
				}
				usedJsPlugins.add(plugin);
			}
			if (entry !== undefined) {
				rules[rule] = entry;
			}
		}
		overrides.push({
			files: toPatterns(block.files),
			...(block.ignores ? { excludeFiles: [...block.ignores] } : {}),
			rules,
		});
	}

	return {
		plugins: ['eslint', 'typescript'],
		// Run only the rules that the ESLint configuration enables.
		categories: { correctness: 'off' },
		options: { reportUnusedDisableDirectives: 'warn' },
		ignorePatterns,
		jsPlugins: [...usedJsPlugins].sort().map(name => ({ name, specifier: oxlintJsPlugins[name] })),
		overrides,
	};
}
