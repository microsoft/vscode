/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'node:test';
import path from 'path';
import { pathToFileURL } from 'url';
import { oxlintJsPlugins, toOxlintConfig, type ILintConfigBlock } from '../oxlintConfig.ts';

suite('oxlintConfig', () => {

	test('converts ignores, file patterns and rules, and loads the plugins that the rules use', () => {
		const config = toOxlintConfig([
			{ ignores: ['**/out/**'] },
			{ rules: { 'curly': 'warn', 'header/header': [2, 'block'] } },
			{ files: ['src/**/*.ts'], ignores: ['**/*.test.ts'], rules: { '@typescript-eslint/no-explicit-any': 'warn', 'local/code-layering': 'off' } },
		]);

		assert.deepStrictEqual(config, {
			plugins: ['eslint', 'typescript', 'jsdoc'],
			categories: { correctness: 'off' },
			options: { reportUnusedDisableDirectives: 'warn' },
			ignorePatterns: ['**/out/**'],
			jsPlugins: [
				{ name: 'header', specifier: oxlintJsPlugins.header },
				{ name: 'local', specifier: oxlintJsPlugins.local },
			],
			overrides: [
				{ files: ['**/*'], rules: { 'curly': 'warn', 'header/header': [2, 'block'] } },
				{ files: ['src/**/*.ts'], excludeFiles: ['**/*.test.ts'], rules: { '@typescript-eslint/no-explicit-any': 'warn', 'local/code-layering': 'off' } },
			],
		});
	});

	test('fails for rules of a plugin that oxlint cannot load, and for settings that it does not convert', () => {
		assert.throws(() => toOxlintConfig([{ rules: { 'import/no-cycle': 'warn' } }]), /import\/no-cycle/);
		assert.throws(() => toOxlintConfig([{ languageOptions: {} } as ILintConfigBlock]), /languageOptions/);
	});

	test('converts the configuration of the repository', async () => {
		const root = path.join(import.meta.dirname, '..', '..', '..');
		const { default: eslintConfig } = await import(pathToFileURL(path.join(root, 'eslint.config.js')).href) as { default: ILintConfigBlock[] };

		assert.doesNotThrow(() => toOxlintConfig(eslintConfig));
	});
});
