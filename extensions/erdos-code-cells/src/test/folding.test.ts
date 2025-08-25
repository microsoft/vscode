/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscode from 'vscode';
import { CellFoldingRangeProvider } from '../folding';
import { closeAllEditors } from './utils';

suite('Folding', () => {
	teardown(closeAllEditors);

	const content = `# %%
testing1

testing2

# %%
testing3

# %%
testing4`;
	const content_with_plus = content.replaceAll("# %%", "#+");


	test('Provides Python cell folding ranges', async () => {
		const provider = new CellFoldingRangeProvider();

		const language = 'python';
		const document = await vscode.workspace.openTextDocument({ language, content });
		const foldingRanges = await provider.provideFoldingRanges(document);

		assert.ok(foldingRanges, 'No folding ranges provided');
		assert.deepStrictEqual(foldingRanges, [
			new vscode.FoldingRange(0, 4),
			new vscode.FoldingRange(5, 7),
			new vscode.FoldingRange(8, 9),
		], 'Incorrect folding ranges');
	});

	test('Provides R cell folding ranges', async () => {
		const provider = new CellFoldingRangeProvider();

		const language = 'r';
		const document = await vscode.workspace.openTextDocument({ language: language, content: content });
		const foldingRanges = await provider.provideFoldingRanges(document);

		assert.ok(foldingRanges, 'No folding ranges provided');
		assert.deepStrictEqual(foldingRanges, [
			new vscode.FoldingRange(0, 4),
			new vscode.FoldingRange(5, 7),
			new vscode.FoldingRange(8, 9),
		], 'Incorrect folding ranges');

		const document2 = await vscode.workspace.openTextDocument({ language: language, content: content_with_plus });
		const foldingRanges2 = await provider.provideFoldingRanges(document2);

		assert.ok(foldingRanges2, 'No folding ranges provided');
		assert.deepStrictEqual(foldingRanges2, [
			new vscode.FoldingRange(0, 4),
			new vscode.FoldingRange(5, 7),
			new vscode.FoldingRange(8, 9),
		], 'Incorrect folding ranges');
	});
});
