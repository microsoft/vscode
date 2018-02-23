/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Command } from '../commandManager';

export class ShowSourceCommand implements Command {
	public readonly id = 'markdown.showSource';

	public execute(mdUri?: vscode.Uri) {
		if (!mdUri) {
			return vscode.commands.executeCommand('workbench.action.navigateBack');
		}

		const docUri = vscode.Uri.parse(mdUri.query);
		for (const editor of vscode.window.visibleTextEditors) {
			if (editor.document.uri.scheme === docUri.scheme && editor.document.uri.toString() === docUri.toString()) {
				return vscode.window.showTextDocument(editor.document, editor.viewColumn);
			}
		}

		return vscode.workspace.openTextDocument(docUri)
			.then(vscode.window.showTextDocument);
	}
}