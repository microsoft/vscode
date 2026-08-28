/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Command } from '../commandManager';
import { MarkdownPreviewManager } from '../preview/previewManager';

export class ShowSourceCommand implements Command {
	public readonly id = 'markdown.showSource';

	readonly #previewManager: MarkdownPreviewManager;

	public constructor(
		previewManager: MarkdownPreviewManager
	) {
		this.#previewManager = previewManager;
	}

	public execute() {
		const { activePreviewResource, activePreviewResourceColumn } = this.#previewManager;
		if (activePreviewResource && activePreviewResourceColumn) {
			return vscode.workspace.openTextDocument(activePreviewResource).then(document => {
				return vscode.window.showTextDocument(document, activePreviewResourceColumn);
			});
		}
		return undefined;
	}
}
