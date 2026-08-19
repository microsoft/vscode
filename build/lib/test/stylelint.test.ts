/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'node:test';
import { stylelintFilter } from '../../filters.ts';
import { resolveStylelintMatches, resolveStylelintSources } from '../../stylelint.ts';

suite('stylelint', () => {

	test('uses the full filter without positional arguments', () => {
		assert.deepStrictEqual(resolveStylelintSources(['node', 'build/stylelint.ts']), {
			sources: Array.from(stylelintFilter),
			explicit: false,
		});
	});

	test('resolves multiple positional and path arguments', () => {
		assert.deepStrictEqual(resolveStylelintSources([
			'node',
			'build/stylelint.ts',
			'src/vs/base',
			'--path=src/vs/editor/**/*.css',
			'-p',
			'src/vs/platform/example.css',
		]), {
			sources: [
				'src/vs/base/**/*.css',
				'src/vs/editor/**/*.css',
				'src/vs/platform/example.css',
			],
			explicit: true,
		});
	});

	test('rejects missing path argument values', () => {
		assert.throws(() => resolveStylelintSources([
			'node',
			'build/stylelint.ts',
			'--path',
		]), /Missing value for --path/);
	});

	test('rejects unmatched source patterns', () => {
		assert.throws(() => resolveStylelintMatches([
			'does-not-exist/**/*.css',
		]), /No CSS files matched the requested path/);
	});
});
