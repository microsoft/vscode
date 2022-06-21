/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command } from '../commandManager';
import { MarkdownItEngine } from '../markdownEngine';
import { SkinnyTextDocument } from '../workspaceContents';

export class RenderDocument implements Command {
	public readonly id = 'markdown.api.render';

	public constructor(
		private readonly engine: MarkdownItEngine
	) { }

	public async execute(document: SkinnyTextDocument | string): Promise<string> {
		return (await (this.engine.render(document))).html;
	}
}
