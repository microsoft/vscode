/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Command } from '../commandManager';
import { MarkdownPreviewManager } from '../features/previewContentProvider';

export class ToggleLockCommand implements Command {
	public readonly id = 'markdown.preview.toggleLock';

	public constructor(
		private readonly previewManager: MarkdownPreviewManager
	) { }

	public execute(previewUri: vscode.Uri) {
		this.previewManager.toggleLock(previewUri);
	}
}