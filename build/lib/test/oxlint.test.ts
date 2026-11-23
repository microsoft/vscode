/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'node:test';
import { splitByFolder, splitFiles, toEslintRuleId } from '../../oxlint.ts';

suite('oxlint', () => {

	test('reports rules by their ESLint names', () => {
		assert.deepStrictEqual(
			['eslint(no-var)', 'typescript(no-explicit-any)', 'local(code-layering)', '@stylistic(semi)', undefined].map(toEslintRuleId),
			['no-var', '@typescript-eslint/no-explicit-any', 'local/code-layering', '@stylistic/semi', undefined]
		);
	});

	test('passes folders whole unless they contain excluded files, and balances the groups', () => {
		const files = [
			{ path: 'src/a/1.ts', weight: 1 },
			{ path: 'src/a/2.ts', weight: 1 },
			{ path: 'src/b/1.ts', weight: 1 },
			{ path: 'extensions/x/1.ts', weight: 1 },
			{ path: 'root.ts', weight: 4 },
		];

		assert.deepStrictEqual([
			splitByFolder(files, 1, []),
			splitByFolder(files, 1, ['extensions/z/']),
			splitByFolder(files, 2, []),
		], [
			[['extensions', 'root.ts', 'src/a', 'src/b']],
			[['extensions/x', 'root.ts', 'src/a', 'src/b']],
			[['root.ts'], ['extensions', 'src/a/1.ts', 'src/a/2.ts', 'src/b']],
		]);
	});

	test('splits file lists to keep command lines short', () => {
		assert.deepStrictEqual(splitFiles(['a.ts', 'b.ts', 'c.ts', 'd.ts'], 1, 10), [['a.ts', 'c.ts'], ['b.ts', 'd.ts']]);
	});

	test('keeps every group within the limit for alternating long and short paths', () => {
		const files = Array.from({ length: 8 }, (_, index) => `${index}`.padEnd(index % 2 === 0 ? 18 : 5, 'x'));
		const maxLength = 30;
		const groups = splitFiles(files, 4, maxLength);

		assert.deepStrictEqual({
			withinLimit: groups.every(group => group.join(' ').length + 1 <= maxLength),
			files: groups.flat().sort(),
		}, {
			withinLimit: true,
			files: files.slice().sort(),
		});
	});
});
