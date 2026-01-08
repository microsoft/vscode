/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ITextModelContentProvider, ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { PROMPT_LANGUAGE_ID } from '../../common/promptSyntax/promptTypes.js';

/**
 * Content provider for virtual chat prompt files created with inline content.
 * These URIs have the scheme 'vscode-chat-prompt' and store their content
 * in the query string (URL-encoded).
 */
export class ChatPromptContentProvider extends Disposable implements ITextModelContentProvider {
	constructor(
		@ITextModelService textModelService: ITextModelService,
		@IModelService private readonly modelService: IModelService,
		@ILanguageService private readonly languageService: ILanguageService
	) {
		super();
		this._register(textModelService.registerTextModelContentProvider(Schemas.vscodeChatPrompt, this));
	}

	async provideTextContent(resource: URI): Promise<ITextModel | null> {
		const existing = this.modelService.getModel(resource);
		if (existing) {
			return existing;
		}

		// Decode the content from the query string
		const content = decodeURIComponent(resource.query);

		return this.modelService.createModel(
			content,
			this.languageService.createById(PROMPT_LANGUAGE_ID),
			resource
		);
	}
}
