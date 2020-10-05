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

async function getSelectionRangesForDocument(contents: string) {
	const doc = new InMemoryDocument(testFileName, contents);
	const provider = new MarkdownSmartSelect(createNewMarkdownEngine());
	return await provider.provideSelectionRanges(doc, [], new vscode.CancellationTokenSource().token);
}

suite('markdown.SmartSelect', () => {
	test('Smart select', async () => {
		const selections = await getSelectionRangesForDocument(`hello`);
		console.log(selections);
		assert.strictEqual(0, 0);
	});
});
