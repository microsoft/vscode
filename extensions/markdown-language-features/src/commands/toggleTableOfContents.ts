/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Command } from '../commandManager';
import { MarkdownPreviewManager } from '../preview/previewManager';

export class ToggleTableOfContentsCommand implements Command {
	public readonly id = 'markdown.preview.toggleTableOfContents';

	readonly #previewManager: MarkdownPreviewManager;

	public constructor(
		previewManager: MarkdownPreviewManager
	) {
		this.#previewManager = previewManager;
	}

	public async execute() {
		this.#previewManager.toggleTableOfContents();
		await vscode.commands.executeCommand('setContext', 'markdown.tocVisible', this.#previewManager.isTableOfContentsVisible());
	}
}
