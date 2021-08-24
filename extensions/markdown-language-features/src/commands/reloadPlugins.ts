/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command } from '../commandManager';
import { MarkdownPreviewManager } from '../features/previewManager';
import { MarkdownEngine } from '../markdownEngine';

export class ReloadPlugins implements Command {
	public readonly id = 'markdown.api.reloadPlugins';

	public constructor(
		private readonly webviewManager: MarkdownPreviewManager,
		private readonly engine: MarkdownEngine,
	) { }

	public execute(): void {
		this.engine.reloadPlugins();
		this.engine.cleanCache();
		this.webviewManager.refresh();
	}
}
