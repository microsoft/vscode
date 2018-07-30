/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscode from 'vscode';
import 'mocha';

import MarkdownFoldingProvider from '../features/foldingProvider';
import { InMemoryDocument } from './inMemoryDocument';
import { createNewMarkdownEngine } from './engine';

const testFileName = vscode.Uri.parse('test.md');

suite('markdown.FoldingProvider', () => {
	test('Should not return anything for empty document', async () => {
		const folds = await getFoldsForDocument(``);
		assert.strictEqual(folds.length, 0);
	});

	test('Should not return anything for document without headers', async () => {
		const folds = await getFoldsForDocument(`a
**b** afas
a#b
a`);
		assert.strictEqual(folds.length, 0);
	});

	test('Should fold from header to end of document', async () => {
		const folds = await getFoldsForDocument(`a
# b
c
d`);
		assert.strictEqual(folds.length, 1);
		const firstFold = folds[0];
		assert.strictEqual(firstFold.start, 1);
		assert.strictEqual(firstFold.end, 3);
	});

	test('Should leave single newline before next header', async () => {
		const folds = await getFoldsForDocument(`
# a
x

# b
y`);
		assert.strictEqual(folds.length, 2);
		const firstFold = folds[0];
		assert.strictEqual(firstFold.start, 1);
		assert.strictEqual(firstFold.end, 3);
	});

	test('Should collapse multuple newlines to single newline before next header', async () => {
		const folds = await getFoldsForDocument(`
# a
x



# b
y`);
		assert.strictEqual(folds.length, 2);
		const firstFold = folds[0];
		assert.strictEqual(firstFold.start, 1);
		assert.strictEqual(firstFold.end, 5);
	});

	test('Should not collapse if there is no newline before next header', async () => {
		const folds = await getFoldsForDocument(`
# a
x
# b
y`);
		assert.strictEqual(folds.length, 2);
		const firstFold = folds[0];
		assert.strictEqual(firstFold.start, 1);
		assert.strictEqual(firstFold.end, 2);
	});

	test('Should fold nested <!-- #region --> markers', async () => {
		const folds = await getFoldsForDocument(`a
<!-- #region -->
b
<!-- #region hello!-->
b.a
<!-- #endregion -->
b
<!-- #region: foo! -->
b.b
<!-- #endregion: foo -->
b
<!-- #endregion -->
a`);
		assert.strictEqual(folds.length, 3);
		const [outer, first, second] = folds.sort((a, b) => a.start - b.start);

		assert.strictEqual(outer.start, 1);
		assert.strictEqual(outer.end, 11);
		assert.strictEqual(first.start, 3);
		assert.strictEqual(first.end, 5);
		assert.strictEqual(second.start, 7);
		assert.strictEqual(second.end, 9);
	});

});


async function getFoldsForDocument(contents: string) {
	const doc = new InMemoryDocument(testFileName, contents);
	const provider = new MarkdownFoldingProvider(createNewMarkdownEngine());
	return await provider.provideFoldingRanges(doc, {}, new vscode.CancellationTokenSource().token);
}
