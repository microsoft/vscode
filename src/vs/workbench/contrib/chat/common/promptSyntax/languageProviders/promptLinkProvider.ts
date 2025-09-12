/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IPromptsService } from '../service/promptsService.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { ILink, ILinksList, LinkProvider } from '../../../../../../editor/common/languages.js';
import { ALL_PROMPTS_LANGUAGE_SELECTOR } from '../promptTypes.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { ILanguageFeaturesService } from '../../../../../../editor/common/services/languageFeatures.js';

/**
 * Provides link references for prompt files.
 */
export class PromptLinkProvider extends Disposable implements LinkProvider {
	constructor(
		@ILanguageFeaturesService languageService: ILanguageFeaturesService,
		@IPromptsService private readonly promptsService: IPromptsService,
	) {
		super();
		this._register(languageService.linkProvider.register(ALL_PROMPTS_LANGUAGE_SELECTOR, this));
	}

	/**
	 * Provide list of links for the provided text model.
	 */
	public async provideLinks(model: ITextModel, token: CancellationToken): Promise<ILinksList | undefined> {
		const parser = this.promptsService.getParsedPromptFile(model);
		if (!parser.body) {
			return;
		}
		const links: ILink[] = [];
		for (const ref of parser.body.fileReferences) {
			if (!ref.isMarkdownLink) {
				const url = parser.body.resolveFilePath(ref.content);
				if (url) {
					links.push({ range: ref.range, url });
				}
			}
		}
		return { links };
	}
}
