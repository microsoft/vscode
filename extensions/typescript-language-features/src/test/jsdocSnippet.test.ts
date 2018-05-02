/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscode from 'vscode';
import 'mocha';
import { templateToSnippet } from '../features/jsDocCompletionProvider';

suite('typescript.jsDocSnippet', () => {
	test('Should do nothing for single line input', async () => {
		const input = `/** */`;
		assert.strictEqual(templateToSnippet(input).value, input);
	});

	test('Should put curosr inside multiline line input', async () => {
		assert.strictEqual(
			templateToSnippet([
				'/**',
				' * ',
				' */'
			].join('\n')).value,
			[
				'/**',
				' * $0',
				' */'
			].join('\n'));
	});
});

