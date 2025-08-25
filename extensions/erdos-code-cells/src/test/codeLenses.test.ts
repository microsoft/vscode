/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscode from 'vscode';
import { CellCodeLensProvider, runAboveCodeLens, runCellCodeLens, runNextCodeLens } from '../codeLenses';
import { closeAllEditors } from './utils';

suite('CodeLenses', () => {
	teardown(closeAllEditors);

	const content = `# %%
testing1

testing2

# %%
testing3

# %%
testing4`;
	const content_with_plus = content.replaceAll("# %%", "#+");

	test('Provides Python cell code lenses', async () => {
		const provider = new CellCodeLensProvider();

		const editor = await showTextDocument(content, "python");
		const codeLenses = await provider.provideCodeLenses(editor.document);

		assert.ok(codeLenses, 'No code lenses provided');
		verifyCodeLenses(codeLenses, [
			new vscode.Range(0, 0, 4, 0),
			new vscode.Range(5, 0, 7, 0),
			new vscode.Range(8, 0, 9, 8)
		]);
	});

	test('Provides R cell code lenses', async () => {
		const provider = new CellCodeLensProvider();

		const editor = await showTextDocument(content, "r");
		const codeLenses = await provider.provideCodeLenses(editor.document);

		assert.ok(codeLenses, 'No code lenses provided');
		verifyCodeLenses(codeLenses, [
			new vscode.Range(0, 0, 4, 0),
			new vscode.Range(5, 0, 7, 0),
			new vscode.Range(8, 0, 9, 8)
		]);

		const editor2 = await showTextDocument(content_with_plus, "r");
		const codeLenses2 = await provider.provideCodeLenses(editor2.document);

		assert.ok(codeLenses2, 'No code lenses provided');
		verifyCodeLenses(codeLenses2, [
			new vscode.Range(0, 0, 4, 0),
			new vscode.Range(5, 0, 7, 0),
			new vscode.Range(8, 0, 9, 8)
		]);
	});
});

function getCodeLenses(
	range: vscode.Range,
	isFirstCell: boolean = false,
	isLastCell: boolean = false
): vscode.CodeLens[] {
	const codeLenses = [runCellCodeLens(range)];
	if (!isFirstCell) {
		codeLenses.push(runAboveCodeLens(range));
	}
	if (!isLastCell) {
		codeLenses.push(runNextCodeLens(range));
	}
	return codeLenses;
}

function verifyCodeLenses(codeLenses: vscode.CodeLens[], expectedRanges: vscode.Range[]): void {
	const expectedCodeLenses: vscode.CodeLens[] = [];
	for (let i = 0; i < expectedRanges.length; i += 1) {
		const isFirstCell = i === 0;
		const isLastCell = i === expectedRanges.length - 1;
		expectedCodeLenses.push(...getCodeLenses(expectedRanges[i], isFirstCell, isLastCell));
	}

	assert.deepStrictEqual(codeLenses, expectedCodeLenses, 'Incorrect code lenses');
}

async function showTextDocument(content?: string, language?: string): Promise<vscode.TextEditor> {
	const document = await vscode.workspace.openTextDocument({ language: language ?? 'python', content });
	const editor = await vscode.window.showTextDocument(document);
	return editor;
}
