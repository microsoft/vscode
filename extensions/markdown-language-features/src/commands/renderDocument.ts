/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

import { Command } from '../commandManager';
import { MarkdownEngine } from '../markdownEngine';
import { SkinnyTextDocument } from '../tableOfContentsProvider';

export class RenderDocument implements Command {
	public readonly id = 'markdown.render';

	public constructor(
		private readonly engine: MarkdownEngine
	) { }

	public async execute(document?: SkinnyTextDocument): Promise<string | undefined> {
		if (!document) {
			if (!vscode.window.activeTextEditor) {
				return;
			}

			document = vscode.window.activeTextEditor.document;
		}

		return this.engine.render(document);
	}
}
