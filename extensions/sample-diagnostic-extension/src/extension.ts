/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';

export const activate = (context: vscode.ExtensionContext) => {
	const collection = vscode.languages.createDiagnosticCollection('test');
	if (vscode.window.activeTextEditor) {
		updateDiagnostics(vscode.window.activeTextEditor.document, collection);
	}
	context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor((editor) => {
			if (editor) {
				updateDiagnostics(editor.document, collection);
			}
		})
	);
};

function updateDiagnostics(
	document: vscode.TextDocument,
	collection: vscode.DiagnosticCollection
): void {
	if (document && path.basename(document.uri.fsPath) === 'sample-demo.rs') {
		const message = new vscode.MarkdownString(
			'cannot assign twice to immutable variable `x`',
		);
		message.appendText('\n');
		message.appendMarkdown(`https://example.com`);
		message.appendText('\n');
		message.appendMarkdown(`**This is bold text**

__This is bold text__

*This is italic text*

_This is italic text_

~~Strikethrough~~



`);
		message.plainTextValue = 'cannot assign twice to immutable variable `x`';
		collection.set(document.uri, [
			{
				code: '',
				message,
				range: new vscode.Range(
					new vscode.Position(3, 4),
					new vscode.Position(3, 10)
				),
				severity: vscode.DiagnosticSeverity.Error,
				source: '',
				relatedInformation: [
					new vscode.DiagnosticRelatedInformation(
						new vscode.Location(
							document.uri,
							new vscode.Range(
								new vscode.Position(1, 8),
								new vscode.Position(1, 9)
							)
						),
						'first assignment to `x`'
					),
				],
			},
		]);
	} else {
		collection.clear();
	}
}
