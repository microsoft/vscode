/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { PromptLinkProvider } from './languageProviders/promptLinkProvider.js';
import { PromptBodyAutocompletion } from './languageProviders/promptBodyAutocompletion.js';
import { PromptHeaderAutocompletion } from './languageProviders/promptHeaderAutocompletion.js';
import { PromptHoverProvider } from './languageProviders/promptHovers.js';
import { PromptHeaderDefinitionProvider } from './languageProviders/PromptHeaderDefinitionProvider.js';
import { PromptValidatorContribution } from './languageProviders/promptValidator.js';
import { PromptDocumentSemanticTokensProvider } from './languageProviders/promptDocumentSemanticTokensProvider.js';
import { PromptCodeActionProvider } from './languageProviders/promptCodeActions.js';
import { ILanguageFeaturesService } from '../../../../../editor/common/services/languageFeatures.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ALL_PROMPTS_LANGUAGE_SELECTOR } from './promptTypes.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';

export class PromptLanguageFeaturesProvider extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'chat.promptLanguageFeatures';

	constructor(
		@ILanguageFeaturesService languageService: ILanguageFeaturesService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		this._register(languageService.linkProvider.register(ALL_PROMPTS_LANGUAGE_SELECTOR, instantiationService.createInstance(PromptLinkProvider)));
		this._register(languageService.completionProvider.register(ALL_PROMPTS_LANGUAGE_SELECTOR, instantiationService.createInstance(PromptBodyAutocompletion)));
		this._register(languageService.completionProvider.register(ALL_PROMPTS_LANGUAGE_SELECTOR, instantiationService.createInstance(PromptHeaderAutocompletion)));
		this._register(languageService.hoverProvider.register(ALL_PROMPTS_LANGUAGE_SELECTOR, instantiationService.createInstance(PromptHoverProvider)));
		this._register(languageService.definitionProvider.register(ALL_PROMPTS_LANGUAGE_SELECTOR, instantiationService.createInstance(PromptHeaderDefinitionProvider)));
		this._register(languageService.documentSemanticTokensProvider.register(ALL_PROMPTS_LANGUAGE_SELECTOR, instantiationService.createInstance(PromptDocumentSemanticTokensProvider)));
		this._register(languageService.codeActionProvider.register(ALL_PROMPTS_LANGUAGE_SELECTOR, instantiationService.createInstance(PromptCodeActionProvider)));

		this._register(instantiationService.createInstance(PromptValidatorContribution));
	}
}
