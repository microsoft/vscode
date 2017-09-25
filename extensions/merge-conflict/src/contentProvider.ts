/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
import * as vscode from 'vscode';
import * as interfaces from './interfaces';

export default class MergeConflictContentProvider implements vscode.TextDocumentContentProvider, vscode.Disposable {

	static scheme = 'merge-conflict.conflict-diff';

	constructor(private context: vscode.ExtensionContext) {
	}

	begin(config: interfaces.IExtensionConfiguration) {
		this.context.subscriptions.push(
			vscode.workspace.registerTextDocumentContentProvider(MergeConflictContentProvider.scheme, this)
		);
	}

	dispose() {
	}

	async provideTextDocumentContent(uri: vscode.Uri): Promise<string | null> {
		try {
			const { scheme, range } = JSON.parse(uri.query) as { scheme: string; range: { line: number, character: number }[] };
			const [start, end] = range;

			const document = await vscode.workspace.openTextDocument(uri.with({ scheme, query: '' }));
			const text = document.getText(new vscode.Range(start.line, start.character, end.line, end.character));
			return text;
		}
		catch (ex) {
			await vscode.window.showErrorMessage('Unable to show comparison');
			return null;
		}
	}
}