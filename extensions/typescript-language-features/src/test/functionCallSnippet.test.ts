/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';
import { snippetForFunctionCall } from '../features/completions';

suite('typescript function call snippets', () => {
	test('Should use label as function name', async () => {
		assert.strictEqual(
			snippetForFunctionCall(
				{ label: 'abc', },
				[]
			).value,
			'abc()$0');
	});

	test('Should use insertText string to override function name', async () => {
		assert.strictEqual(
			snippetForFunctionCall(
				{ label: 'abc', insertText: 'def' },
				[]
			).value,
			'def()$0');
	});

	test('Should return insertText as-is if it is already a snippet', async () => {
		assert.strictEqual(
			snippetForFunctionCall(
				{ label: 'abc', insertText: new vscode.SnippetString('bla()$0') },
				[]
			).value,
			'bla()$0');
	});

	test('Should return insertText as-is if it is already a snippet', async () => {
		assert.strictEqual(
			snippetForFunctionCall(
				{ label: 'abc', insertText: new vscode.SnippetString('bla()$0') },
				[]
			).value,
			'bla()$0');
	});
});
