/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command } from '../commandManager';
import { MarkdownItEngine } from '../markdownEngine';
import { ITextDocument } from '../types/textDocument';

export class RenderDocument implements Command {
	public readonly id = 'markdown.api.render';

	readonly #engine: MarkdownItEngine;

	public constructor(
		engine: MarkdownItEngine
	) {
		this.#engine = engine;
	}

	public async execute(document: ITextDocument | string): Promise<string> {
		return (await (this.#engine.render(document))).html;
	}
}
