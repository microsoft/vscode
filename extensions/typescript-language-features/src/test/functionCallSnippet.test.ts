/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import { snippetForFunctionCall } from '../features/completions';

suite('typescript function call snippets', () => {
	test('Should use label as name if no display parts are provided', async () => {
		assert.strictEqual(
			snippetForFunctionCall(
				{ label: 'abc', },
				[]
			).value,
			'abc()$0');
	});

	test('Should use insertText to override function name if no display parts are provided', async () => {
		assert.strictEqual(
			snippetForFunctionCall(
				{ label: 'abc', insertText: 'def' },
				[]
			).value,
			'def()$0');
	});
});
