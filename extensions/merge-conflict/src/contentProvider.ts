/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export default class MergeConflictContentProvider implements vscode.TextDocumentContentProvider, vscode.Disposable {

	static scheme = 'merge-conflict.conflict-diff';

	constructor(private context: vscode.ExtensionContext) {
	}

	begin() {
		this.context.subscriptions.push(
			vscode.workspace.registerTextDocumentContentProvider(MergeConflictContentProvider.scheme, this)
		);
	}

	dispose() {
	}

	async provideTextDocumentContent(uri: vscode.Uri): Promise<string | null> {
		try {
			const { type, scheme, range, fullRange, ranges } = JSON.parse(uri.query) as { type: string, scheme: string; range: { line: number, character: number }[], fullRange: { line: number, character: number }[], ranges: [{ line: number, character: number }[], { line: number, character: number }[]][] };

			if (type === 'full') {
				// complete diff
				const document = await vscode.workspace.openTextDocument(uri.with({ scheme, query: '' }));

				let text = '';
				let lastPosition = new vscode.Position(0, 0);
				ranges.forEach(rangeObj => {
					let [range, fullRange] = rangeObj;
					const [start, end] = range;
					const [fullStart, fullEnd] = fullRange;

					text += document.getText(new vscode.Range(lastPosition.line, lastPosition.character, fullStart.line, fullStart.character));
					text += document.getText(new vscode.Range(start.line, start.character, end.line, end.character));
					lastPosition = new vscode.Position(fullEnd.line, fullEnd.character);
				});

				let documentEnd = document.lineAt(document.lineCount - 1).range.end;
				text += document.getText(new vscode.Range(lastPosition.line, lastPosition.character, documentEnd.line, documentEnd.character));

				return text;
			} else {
				const [start, end] = range;
				const [fullStart, fullEnd] = fullRange;
				const mergeConflictConfig = vscode.workspace.getConfiguration('merge-conflict');
				const context = Math.max(0, mergeConflictConfig.get<number>('diffViewContext') || 0);
				const document = await vscode.workspace.openTextDocument(uri.with({ scheme, query: '' }));
				const text =
					document.getText(new vscode.Range(Math.max(0, fullStart.line - context), 0, fullStart.line, fullStart.character))
					+ document.getText(new vscode.Range(start.line, start.character, end.line, end.character))
					+ document.getText(new vscode.Range(fullEnd.line, fullEnd.character, Math.min(document.lineCount, fullEnd.line + context + 1), 0));
				return text;
			}
		}
		catch (ex) {
			await vscode.window.showErrorMessage('Unable to show comparison');
			return null;
		}
	}
}