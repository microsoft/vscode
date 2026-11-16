/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import minimatch from 'minimatch';
import path from 'path';
import { pathToFileURL } from 'url';
import type { DummyRule, DummyRuleMap, OxlintConfig, OxlintOverride } from 'oxlint';

/**
 * A block of eslint.config.js, which uses ESLint's flat configuration format: the files it applies to, the files it
 * excludes, and the rules it configures. A block with only `ignores` ignores those files everywhere.
 */
export interface ILintConfigBlock {
	readonly name?: string;
	readonly files?: readonly string[];
	readonly ignores?: readonly string[];
	readonly rules?: Readonly<Record<string, DummyRule>>;
}

/**
 * The plugins that oxlint loads as JS plugins, by the name that eslint.config.js and disable directives use, and the
 * module that oxlint loads, relative to the repository root. The `compat/` plugins are our implementations of the
 * rules of third-party ESLint plugins that oxlint does not implement, under their original names.
 */
export const oxlintJsPlugins: Readonly<Record<string, string>> = {
	'local': './.eslint-plugin-local/index.ts',
	'copilot-local': './extensions/copilot/.eslintplugin/index.ts',
	'header': './.eslint-plugin-local/compat/header.ts',
	'eslint-js': './.eslint-plugin-local/compat/eslintJs.ts',
	'ts-eslint-js': './.eslint-plugin-local/compat/typescriptEslintJs.ts',
	'jsdoc-js': './.eslint-plugin-local/compat/jsdoc.ts',
	'@stylistic': './.eslint-plugin-local/compat/stylistic.ts',
};

/**
 * Plugins whose rules oxlint implements natively under the same names. Rules without a plugin are ESLint's core rules,
 * which oxlint implements natively too.
 */
const nativePlugins = new Set(['@typescript-eslint', 'jsdoc']);

const supportedBlockKeys = new Set(['name', 'files', 'ignores', 'rules']);

function pluginOf(rule: string): string {
	const slash = rule.lastIndexOf('/');
	return slash === -1 ? '' : rule.slice(0, slash);
}

function isGlobalIgnores(block: ILintConfigBlock): boolean {
	return Object.keys(block).every(key => key === 'ignores' || key === 'name') && !!block.ignores;
}

/**
 * Converts eslint.config.js, which uses ESLint's flat configuration format, into an oxlint configuration that runs the
 * same rules on the same files under the same names: core rules and the `@typescript-eslint` and `jsdoc` rules are those
 * that oxlint implements, and the other plugins load as JS plugins. Rules that oxlint does not know make it fail,
 * rather than silently skip them.
 */
export function toOxlintConfig(eslintConfig: readonly ILintConfigBlock[]): OxlintConfig {
	const ignorePatterns: string[] = [];
	const overrides: OxlintOverride[] = [];
	const usedJsPlugins = new Set<string>();

	for (const block of eslintConfig) {
		if (isGlobalIgnores(block)) {
			ignorePatterns.push(...block.ignores!);
			continue;
		}
		const unsupported = Object.keys(block).find(key => !supportedBlockKeys.has(key));
		if (unsupported) {
			throw new Error(`The conversion to oxlint does not support \`${unsupported}\` in eslint.config.js`);
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
			files: [...(block.files ?? ['**/*'])],
			...(block.ignores ? { excludeFiles: [...block.ignores] } : {}),
			rules,
		});
	}

	return {
		plugins: ['eslint', 'typescript', 'jsdoc'],
		// Run only the rules that the ESLint configuration enables.
		categories: { correctness: 'off' },
		options: { reportUnusedDisableDirectives: 'warn' },
		ignorePatterns,
		jsPlugins: [...usedJsPlugins].sort().map(name => ({ name, specifier: oxlintJsPlugins[name] })),
		overrides,
	};
}

function matchesAny(file: string, patterns: readonly string[] | undefined): boolean {
	return !!patterns?.some(pattern => minimatch(file, pattern, { dot: true }));
}

/**
 * Whether ignore patterns exclude a file, like in `.gitignore`: patterns apply in order, a pattern that matches a parent
 * folder ignores the files in it, and a pattern that starts with `!` includes a file again.
 */
function isIgnored(file: string, patterns: readonly string[]): boolean {
	const paths = file.split('/').map((_, index, segments) => segments.slice(0, index + 1).join('/'));
	let ignored = false;
	for (const pattern of patterns) {
		if (pattern.startsWith('!')) {
			ignored &&= !minimatch(file, pattern.slice(1), { dot: true });
		} else {
			ignored ||= paths.some(path => minimatch(path, pattern, { dot: true }));
		}
	}
	return ignored;
}

/**
 * Returns the rules that a converted configuration enables for a file, given relative to the repository root, as
 * `[severity, ...options]`, or `undefined` when the configuration ignores the file. The overrides apply in order, and
 * an entry with only a severity keeps the options of an earlier one, like in eslint.config.js.
 */
export function getFileRules(config: OxlintConfig, file: string): Record<string, readonly unknown[]> | undefined {
	if (isIgnored(file, config.ignorePatterns ?? [])) {
		return undefined;
	}
	const rules: Record<string, readonly unknown[]> = {};
	for (const override of config.overrides ?? []) {
		if (!matchesAny(file, override.files) || matchesAny(file, override.excludeFiles)) {
			continue;
		}
		for (const [rule, entry] of Object.entries(override.rules ?? {})) {
			const [severity, ...options] = Array.isArray(entry) ? entry : [entry];
			rules[rule] = [severity, ...(options.length ? options : (rules[rule]?.slice(1) ?? []))];
		}
	}
	return rules;
}

let repositoryConfig: Promise<OxlintConfig> | undefined;

/**
 * Returns the rules that eslint.config.js enables for a file of the repository, given relative to its root, like
 * {@link getFileRules}.
 */
export async function getRepositoryFileRules(file: string): Promise<Record<string, readonly unknown[]> | undefined> {
	repositoryConfig ??= import(pathToFileURL(path.join(import.meta.dirname, '..', '..', 'eslint.config.js')).href)
		.then(({ default: eslintConfig }: { default: ILintConfigBlock[] }) => toOxlintConfig(eslintConfig));
	return getFileRules(await repositoryConfig, file);
}
