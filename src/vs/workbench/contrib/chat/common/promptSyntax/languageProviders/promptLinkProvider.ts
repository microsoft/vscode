/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IPromptsService } from '../service/promptsService.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { ILink, ILinksList, LinkProvider } from '../../../../../../editor/common/languages.js';

/**
 * Provides link references for prompt files.
 */
export class PromptLinkProvider implements LinkProvider {
	constructor(
		@IPromptsService private readonly promptsService: IPromptsService,
	) {
	}

	/**
	 * Provide list of links for the provided text model.
	 */
	public async provideLinks(model: ITextModel, token: CancellationToken): Promise<ILinksList | undefined> {
		const promptAST = this.promptsService.getParsedPromptFile(model);
		if (!promptAST.body) {
			return;
		}
		const links: ILink[] = [];
		for (const ref of promptAST.body.fileReferences) {
			if (!ref.isMarkdownLink) {
				const url = promptAST.body.resolveFilePath(ref.content);
				if (url) {
					links.push({ range: ref.range, url });
				}
			}
		}
		return { links };
	}
}
