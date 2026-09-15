/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const vscode = require('vscode');

const { replacementForDocument } = require('./knownProblem.cjs');

function activate(context) {
	context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(async document => {
		const replacement = replacementForDocument(document.uri.fsPath);
		if (replacement === undefined || document.lineCount === 0 || document.lineAt(0).text === replacement) {
			return;
		}

		const edit = new vscode.WorkspaceEdit();
		edit.replace(document.uri, document.lineAt(0).range, replacement);
		if (await vscode.workspace.applyEdit(edit)) {
			void vscode.window.showWarningMessage('Issue Wizard Known Problem replaced the first line after save.');
		}
	}));
}

module.exports = { activate };

