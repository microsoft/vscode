/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Command } from '../commandManager';
import { isMarkdownFile, MDDocumentContentProvider, getMarkdownUri } from '../features/previewContentProvider';

export class RefreshPreviewCommand implements Command {
	public readonly id = 'markdown.refreshPreview';

	public constructor(
		private readonly contentProvider: MDDocumentContentProvider
	) { }

	public execute(resource: string | undefined) {
		if (resource) {
			const source = vscode.Uri.parse(resource);
			this.contentProvider.update(source);
		} else if (vscode.window.activeTextEditor && isMarkdownFile(vscode.window.activeTextEditor.document)) {
			this.contentProvider.update(getMarkdownUri(vscode.window.activeTextEditor.document.uri));
		} else {
			// update all generated md documents
			for (const document of vscode.workspace.textDocuments) {
				if (document.uri.scheme === MDDocumentContentProvider.scheme) {
					this.contentProvider.update(document.uri);
				}
			}
		}
	}
}