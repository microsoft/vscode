/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Command } from '../commandManager';
import { isMarkdownFile, getMarkdownUri, MarkdownPreviewWebviewManager } from '../features/previewContentProvider';

export class RefreshPreviewCommand implements Command {
	public readonly id = 'markdown.refreshPreview';

	public constructor(
		private readonly webviewManager: MarkdownPreviewWebviewManager
	) { }

	public execute(resource: string | undefined) {
		if (resource) {
			const source = vscode.Uri.parse(resource);
			this.webviewManager.update(source);
		} else if (vscode.window.activeTextEditor && isMarkdownFile(vscode.window.activeTextEditor.document)) {
			this.webviewManager.update(getMarkdownUri(vscode.window.activeTextEditor.document.uri));
		} else {
			this.webviewManager.updateAll();
		}
	}
}