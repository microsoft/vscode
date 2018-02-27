/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Command } from '../commandManager';
import { MarkdownPreviewManager } from '../features/previewContentProvider';

export class ShowSourceCommand implements Command {
	public readonly id = 'markdown.showSource';

	public constructor(
		private readonly previewManager: MarkdownPreviewManager
	) { }


	public execute(docUri?: vscode.Uri) {
		if (!docUri) {
			return vscode.commands.executeCommand('workbench.action.navigateBack');
		}

		const resource = this.previewManager.getResourceForPreview(docUri);
		if (resource) {
			for (const editor of vscode.window.visibleTextEditors) {
				if (editor.document.uri.fsPath === resource.fsPath) {
					return vscode.window.showTextDocument(editor.document, editor.viewColumn);
				}
			}
		}

		return vscode.workspace.openTextDocument(docUri)
			.then(vscode.window.showTextDocument);
	}
}