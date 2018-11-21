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

	test('Should extract parameter from display parts', async () => {
		assert.strictEqual(
			snippetForFunctionCall(
				{ label: 'activate' },
				[{ "text": "function", "kind": "keyword" }, { "text": " ", "kind": "space" }, { "text": "activate", "kind": "text" }, { "text": "(", "kind": "punctuation" }, { "text": "context", "kind": "parameterName" }, { "text": ":", "kind": "punctuation" }, { "text": " ", "kind": "space" }, { "text": "vscode", "kind": "aliasName" }, { "text": ".", "kind": "punctuation" }, { "text": "ExtensionContext", "kind": "interfaceName" }, { "text": ")", "kind": "punctuation" }, { "text": ":", "kind": "punctuation" }, { "text": " ", "kind": "space" }, { "text": "void", "kind": "keyword" }]
			).value,
			'activate(${1:context})$0');
	});

	test('Should extract all parameters from display parts', async () => {
		assert.strictEqual(
			snippetForFunctionCall(
				{ label: 'foo' },
				[{ "text": "function", "kind": "keyword" }, { "text": " ", "kind": "space" }, { "text": "foo", "kind": "functionName" }, { "text": "(", "kind": "punctuation" }, { "text": "a", "kind": "parameterName" }, { "text": ":", "kind": "punctuation" }, { "text": " ", "kind": "space" }, { "text": "string", "kind": "keyword" }, { "text": ",", "kind": "punctuation" }, { "text": " ", "kind": "space" }, { "text": "b", "kind": "parameterName" }, { "text": ":", "kind": "punctuation" }, { "text": " ", "kind": "space" }, { "text": "number", "kind": "keyword" }, { "text": ",", "kind": "punctuation" }, { "text": " ", "kind": "space" }, { "text": "c", "kind": "parameterName" }, { "text": ":", "kind": "punctuation" }, { "text": " ", "kind": "space" }, { "text": "boolean", "kind": "keyword" }, { "text": ")", "kind": "punctuation" }, { "text": ":", "kind": "punctuation" }, { "text": " ", "kind": "space" }, { "text": "void", "kind": "keyword" }]
			).value,
			'foo(${1:a}, ${2:b}, ${3:c})$0');
	});
});
