/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscode from 'vscode';
import 'mocha';

import MarkdownSmartSelect from '../features/smartSelect';
import { InMemoryDocument } from './inMemoryDocument';
import { createNewMarkdownEngine } from './engine';

const testFileName = vscode.Uri.file('test.md');

suite('markdown.SmartSelect', () => {
	test('Smart select single word', async () => {
		const selections = await getSelectionRangesForDocument(`Hello`);
		assert.deepStrictEqual(selections[0].range, new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 5)));
	});

	test('Smart select html blocks', async () => {
		const selections = await getSelectionRangesForDocument(`<p align="center">
		<img alt="VS Code in action" src="https://user-images.githubusercontent.com/1487073/58344409-70473b80-7e0a-11e9-8570-b2efc6f8fa44.png">
	  </p>`);
		assert.deepStrictEqual(selections[0].range, new vscode.Range(new vscode.Position(0, 0), new vscode.Position(3, 4)));
	});
});

async function getSelectionRangesForDocument(contents: string) {
	const doc = new InMemoryDocument(testFileName, contents);
	const provider = new MarkdownSmartSelect(createNewMarkdownEngine());
	return await provider.provideSelectionRanges(doc, [new vscode.Position(0, 0)], new vscode.CancellationTokenSource().token);
}
