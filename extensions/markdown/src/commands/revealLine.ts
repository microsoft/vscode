/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Command } from '../commandManager';
import { Logger } from '../logger';
import { MarkdownPreviewManager } from '../features/previewManager';

export class RevealLineCommand implements Command {
	public readonly id = '_markdown.revealLine';

	public constructor(
		private readonly logger: Logger,
		private readonly previewManager: MarkdownPreviewManager
	) { }

	public execute(uri: string, line: number) {
		const sourceUri = vscode.Uri.parse(decodeURIComponent(uri));
		this.logger.log('revealLine', { uri, sourceUri: sourceUri.toString(), line });
		this.previewManager.revealLine(sourceUri, line);
	}
}