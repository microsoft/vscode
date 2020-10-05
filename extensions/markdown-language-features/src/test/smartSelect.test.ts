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

	test('Smart select fenced code blocks', async () => {
		const selections = await getSelectionRangesForDocument(`---
		title: bla
		---

		~~~ts
		a
		~~~

		a
		a
		b
		a`);
		assert.deepStrictEqual(selections[0].range, new vscode.Range(new vscode.Position(0, 0), new vscode.Position(10, 12)));
	});
});

async function getSelectionRangesForDocument(contents: string) {
	const doc = new InMemoryDocument(testFileName, contents);
	const provider = new MarkdownSmartSelect(createNewMarkdownEngine());
	return await provider.provideSelectionRanges(doc, [new vscode.Position(0, 0)], new vscode.CancellationTokenSource().token);
}
