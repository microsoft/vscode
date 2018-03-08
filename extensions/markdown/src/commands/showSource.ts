/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Command } from '../commandManager';
import { MarkdownPreviewManager } from '../features/previewManager';

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
			return vscode.workspace.openTextDocument(resource)
				.then(document => vscode.window.showTextDocument(document));
		}
		return undefined;
	}
}