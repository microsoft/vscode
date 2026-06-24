/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command } from '../commandManager';
import { MarkdownItEngine } from '../markdownEngine';
import { MarkdownPreviewManager } from '../preview/previewManager';

export class ReloadPlugins implements Command {
	public readonly id = 'markdown.api.reloadPlugins';

	readonly #webviewManager: MarkdownPreviewManager;
	readonly #engine: MarkdownItEngine;

	public constructor(
		webviewManager: MarkdownPreviewManager,
		engine: MarkdownItEngine,
	) {
		this.#webviewManager = webviewManager;
		this.#engine = engine;
	}

	public execute(): void {
		this.#engine.reloadPlugins();
		this.#engine.cleanCache();
		this.#webviewManager.refresh();
	}
}
