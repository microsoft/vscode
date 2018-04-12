/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscode from 'vscode';
import 'mocha';

import { MarkdownEngine } from '../markdownEngine';
import { MarkdownContributions } from '../markdownExtensions';
import MarkdownFoldingProvider from '../features/foldingProvider';
import { InMemoryDocument } from './inMemoryDocument';

const testFileName = vscode.Uri.parse('test.md');

suite('markdown.FoldingProvider', () => {
	test('Should not return anything for empty document', async () => {
		const folds = await getFoldsForDocument(``);
		assert.strictEqual(folds.ranges.length, 0);
	});

	test('Should not return anything for document without headers', async () => {
		const folds = await getFoldsForDocument(`a
**b** afas
a#b
a`);
		assert.strictEqual(folds.ranges.length, 0);
	});

	test('Should fold from header to end of document', async () => {
		const folds = await getFoldsForDocument(`a
# b
c
d`);
		assert.strictEqual(folds.ranges.length, 1);
		const firstFold = folds.ranges[0];
		assert.strictEqual(firstFold.startLine, 1);
		assert.strictEqual(firstFold.endLine, 3);
	});

	test('Should leave single newline before next header', async () => {
		const folds = await getFoldsForDocument(`
# a
x

# b
y`);
		assert.strictEqual(folds.ranges.length, 2);
		const firstFold = folds.ranges[0];
		assert.strictEqual(firstFold.startLine, 1);
		assert.strictEqual(firstFold.endLine, 3);
	});

	test('Should collapse multuple newlines to single newline before next header', async () => {
		const folds = await getFoldsForDocument(`
# a
x



# b
y`);
		assert.strictEqual(folds.ranges.length, 2);
		const firstFold = folds.ranges[0];
		assert.strictEqual(firstFold.startLine, 1);
		assert.strictEqual(firstFold.endLine, 5);
	});

	test('Should not collapse if there is no newline before next header', async () => {
		const folds = await getFoldsForDocument(`
# a
x
# b
y`);
		assert.strictEqual(folds.ranges.length, 2);
		const firstFold = folds.ranges[0];
		assert.strictEqual(firstFold.startLine, 1);
		assert.strictEqual(firstFold.endLine, 2);
	});

});


async function getFoldsForDocument(contents: string) {
	const doc = new InMemoryDocument(testFileName, contents);
	const provider = new MarkdownFoldingProvider(newEngine());
	return await provider.provideFoldingRanges(doc, {}, new vscode.CancellationTokenSource().token);
}

function newEngine(): MarkdownEngine {
	return new MarkdownEngine(new class implements MarkdownContributions {
		readonly previewScripts: vscode.Uri[] = [];
		readonly previewStyles: vscode.Uri[] = [];
		readonly previewResourceRoots: vscode.Uri[] = [];
		readonly markdownItPlugins: Promise<(md: any) => any>[]  = [];
	});
}

