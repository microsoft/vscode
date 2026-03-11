/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Command } from '../commandManager';
import { MarkdownPreviewManager } from '../preview/previewManager';
import { PreviewSecuritySelector } from '../preview/security';
import { isMarkdownFile } from '../util/file';

export class ShowPreviewSecuritySelectorCommand implements Command {
	public readonly id = 'markdown.showPreviewSecuritySelector';

	readonly #previewSecuritySelector: PreviewSecuritySelector;
	readonly #previewManager: MarkdownPreviewManager;

	public constructor(
		previewSecuritySelector: PreviewSecuritySelector,
		previewManager: MarkdownPreviewManager
	) {
		this.#previewSecuritySelector = previewSecuritySelector;
		this.#previewManager = previewManager;
	}

	public execute(resource: string | undefined) {
		if (this.#previewManager.activePreviewResource) {
			this.#previewSecuritySelector.showSecuritySelectorForResource(this.#previewManager.activePreviewResource);
		} else if (resource) {
			const source = vscode.Uri.parse(resource);
			this.#previewSecuritySelector.showSecuritySelectorForResource(source.query ? vscode.Uri.parse(source.query) : source);
		} else if (vscode.window.activeTextEditor && isMarkdownFile(vscode.window.activeTextEditor.document)) {
			this.#previewSecuritySelector.showSecuritySelectorForResource(vscode.window.activeTextEditor.document.uri);
		}
	}
}
