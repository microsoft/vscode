/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Uri, workspace } from 'vscode';
import { Command } from '../commandManager';
import { MarkdownEngine } from '../markdownEngine';
import { SkinnyTextDocument } from '../tableOfContentsProvider';

export class RenderDocument implements Command {
	public readonly id = 'markdown.api.render';

	public constructor(
		private readonly engine: MarkdownEngine
	) { }

	public async execute(arg: Uri | SkinnyTextDocument | string): Promise<string> {
		const document = arg instanceof Uri ? await workspace.openTextDocument(arg) : arg;
		return this.engine.render(document);
	}
}
