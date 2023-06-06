/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command } from '../commandManager';
import { MarkdownPreviewManager } from '../preview/previewManager';

export class CopyImageCommand implements Command {
	public readonly id = '_markdown.copyImage';

	public constructor(
		private readonly _webviewManager: MarkdownPreviewManager,
	) { }

	public execute(args: { id: string }) {
		this._webviewManager._activePreview?.copyImage(args.id);
	}
}
