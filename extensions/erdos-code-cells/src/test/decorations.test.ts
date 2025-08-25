/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscode from 'vscode';
import { closeAllEditors, delay, disposeAll } from './utils';
import { SetDecorations, activateDecorations, focusedCellBackgroundDecorationType, focusedCellBottomDecorationType, focusedCellTopDecorationType } from '../decorations';

suite('Decorations', () => {
	const disposables: vscode.Disposable[] = [];
	const decorations: Map<vscode.TextEditorDecorationType, vscode.Range[]> = new Map();
	const setDecorations: SetDecorations = (_editor, decorationType, ranges) => {
		decorations.set(decorationType, ranges);
	};
	setup(() => {
		// Activate decorations with a custom setDecorations that stores the decorated ranges.
		activateDecorations(disposables, setDecorations);

		// Default to background style.
		switchCellStyle('background');
	});
	teardown(async () => {
		disposeAll(disposables);
		await closeAllEditors();
	});

	function assertCellDecorationRangesEqual(type: vscode.TextEditorDecorationType, expected: vscode.Range[]): void {
		assert.deepStrictEqual(
			decorations.get(type), expected, 'Cell decoration ranges are not equal'
		);
	}

	test('Opening an empty Python document', async () => {
		await showTextDocument('');
		assertCellDecorationRangesEqual(focusedCellBackgroundDecorationType, []);
	});

	test('Opening a Python document with code cells', async () => {
		await showTextDocument('# %%');
		assertCellDecorationRangesEqual(focusedCellBackgroundDecorationType, [new vscode.Range(0, 0, 0, 4)]);
	});

	test('Adding a code cell to an empty Python document', async () => {
		const editor = await showTextDocument();
		assertCellDecorationRangesEqual(focusedCellBackgroundDecorationType, []);

		const result = await editor.edit((editBuilder) => {
			editBuilder.insert(new vscode.Position(0, 0), '# %%');
		});
		assert.ok(result);
		assertCellDecorationRangesEqual(focusedCellBackgroundDecorationType, [new vscode.Range(0, 0, 0, 4)]);
	});

	test('Changing the selected code cell in a Python document', async () => {
		const editor = await showTextDocument('# %%\n# %%');
		editor.selection = new vscode.Selection(0, 0, 1, 0);
		assertCellDecorationRangesEqual(focusedCellBackgroundDecorationType, [new vscode.Range(0, 0, 0, 4)]);

		// Move the selection to the second cell
		editor.selection = new vscode.Selection(1, 0, 1, 0);

		// Decorations do not update immediately
		assertCellDecorationRangesEqual(focusedCellBackgroundDecorationType, [new vscode.Range(0, 0, 0, 4)]);

		// Decorations update after a delay
		await delay(400);
		assertCellDecorationRangesEqual(focusedCellBackgroundDecorationType, [new vscode.Range(1, 0, 1, 4)]);
	});

	test('Removing all code cells from a Python document', async () => {
		const editor = await showTextDocument('# %%');
		assertCellDecorationRangesEqual(focusedCellBackgroundDecorationType, [new vscode.Range(0, 0, 0, 4)]);

		await editor.edit((editBuilder) => {
			editBuilder.delete(new vscode.Range(0, 0, 1, 0));
		});

		// Decorations do not update immediately
		assertCellDecorationRangesEqual(focusedCellBackgroundDecorationType, [new vscode.Range(0, 0, 0, 4)]);

		// Decorations update after a delay
		await delay(400);
		assertCellDecorationRangesEqual(focusedCellBackgroundDecorationType, []);
	});

	test('Changing the active editor', async () => {
		await showTextDocument('# %%');
		assertCellDecorationRangesEqual(focusedCellBackgroundDecorationType, [new vscode.Range(0, 0, 0, 4)]);

		// Decorations update after a delay
		await showTextDocument('');
		await delay(400);
		assertCellDecorationRangesEqual(focusedCellBackgroundDecorationType, []);
	});

	test('Changing the cell style option', async () => {
		await switchCellStyle('background');
		await showTextDocument('# %%\n');
		assertCellDecorationRangesEqual(focusedCellBackgroundDecorationType, [new vscode.Range(0, 0, 1, 0)]);
		assertCellDecorationRangesEqual(focusedCellTopDecorationType, []);
		assertCellDecorationRangesEqual(focusedCellBottomDecorationType, []);

		await switchCellStyle('border');
		assertCellDecorationRangesEqual(focusedCellBackgroundDecorationType, []);
		assertCellDecorationRangesEqual(focusedCellTopDecorationType, [new vscode.Range(0, 0, 0, 0)]);
		assertCellDecorationRangesEqual(focusedCellBottomDecorationType, [new vscode.Range(1, 0, 1, 0)]);

		await switchCellStyle('both');
		assertCellDecorationRangesEqual(focusedCellBackgroundDecorationType, [new vscode.Range(0, 0, 1, 0)]);
		assertCellDecorationRangesEqual(focusedCellTopDecorationType, [new vscode.Range(0, 0, 0, 0)]);
		assertCellDecorationRangesEqual(focusedCellBottomDecorationType, [new vscode.Range(1, 0, 1, 0)]);
	});
});

async function showTextDocument(content?: string): Promise<vscode.TextEditor> {
	const document = await vscode.workspace.openTextDocument({ language: 'python', content });
	const editor = await vscode.window.showTextDocument(document);
	return editor;
}

async function switchCellStyle(cellStyle: string) {
	const configuration = vscode.workspace.getConfiguration();
	await configuration.update("codeCells.cellStyle", cellStyle, vscode.ConfigurationTarget.Global);
}
