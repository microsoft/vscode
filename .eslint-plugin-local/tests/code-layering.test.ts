/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { RuleTester } from 'oxlint/plugins-dev';
import { suite, test } from 'node:test';
import { resolve } from 'path';
import rule, { createLayeringChecker } from '../code-layering.ts';

RuleTester.describe = suite;
RuleTester.it = test;

const layers = { 'common': [], 'node': ['common'], 'vscode': ['common'], 'vscode-node': ['common', 'vscode', 'node'] };
const options = [layers];
const commonFile = resolve(import.meta.dirname, '../../extensions/copilot/src/util/common/types.ts');
const error = (from: string) => ({ messageId: 'layerbreaker', data: { from, allowed: 'common' } });

suite('createLayeringChecker', () => {
	test('ignores the folders of the checkout', () => {
		const results = ['/work/vscode/vscode', '/work/other/checkout'].map(root => {
			const check = createLayeringChecker(root, `${root}/extensions/copilot/src/util/common/types.ts`, layers);
			return ['../../vscodeTypes', '../node/a', '../vscode/b'].map(specifier => check?.(specifier)?.from);
		});
		assert.deepStrictEqual(results, [[undefined, 'node', 'vscode'], [undefined, 'node', 'vscode']]);
	});

	test('a file in no layer below the root is not checked', () => {
		assert.strictEqual(createLayeringChecker('/work/vscode/vscode', '/work/vscode/vscode/extensions/copilot/src/vscodeTypes.ts', layers), undefined);
	});
});

new RuleTester({ languageOptions: { sourceType: 'module', parserOptions: { lang: 'ts' } } }).run('code-layering', rule, {
	valid: [
		{ filename: commonFile, options, code: `import { x } from '../../vscodeTypes';` },
		{ filename: commonFile, options, code: `const x = import('../common/x');` },
	],
	invalid: [
		{ filename: commonFile, options, code: `import { x } from '../node/x';`, errors: [error('node')] },
		{ filename: commonFile, options, code: `const x = import('../node/x');`, errors: [error('node')] },
		{ filename: commonFile, options, code: `const x = require('../vscode/x');`, errors: [error('vscode')] },
	],
});
