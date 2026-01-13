/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { CodeLens, CodeLensList, CodeLensProvider } from '../../../../../editor/common/languages.js';
import { isITextModel, ITextModel } from '../../../../../editor/common/model.js';
import { ILanguageFeaturesService } from '../../../../../editor/common/services/languageFeatures.js';
import { localize } from '../../../../../nls.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { showToolsPicker } from '../actions/chatToolPicker.js';
import { ILanguageModelToolsService } from '../../common/tools/languageModelToolsService.js';
import { ALL_PROMPTS_LANGUAGE_SELECTOR, getPromptsTypeForLanguageId, PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { IPromptsService } from '../../common/promptSyntax/service/promptsService.js';
import { registerEditorFeature } from '../../../../../editor/common/editorFeatures.js';
import { PromptFileRewriter } from './promptFileRewriter.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { IEditorModel } from '../../../../../editor/common/editorCommon.js';
import { PromptHeaderAttributes } from '../../common/promptSyntax/promptFileParser.js';
import { isGithubTarget } from '../../common/promptSyntax/languageProviders/promptValidator.js';

class PromptToolsCodeLensProvider extends Disposable implements CodeLensProvider {

	// `_`-prefix marks this as private command
	private readonly cmdId = `_configure/${generateUuid()}`;

	constructor(
		@IPromptsService private readonly promptsService: IPromptsService,
		@ILanguageFeaturesService private readonly languageService: ILanguageFeaturesService,
		@ILanguageModelToolsService private readonly languageModelToolsService: ILanguageModelToolsService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();


		this._register(this.languageService.codeLensProvider.register(ALL_PROMPTS_LANGUAGE_SELECTOR, this));

		this._register(CommandsRegistry.registerCommand(this.cmdId, (_accessor, ...args) => {
			const [first, second, third, forth] = args;
			const model = first as IEditorModel;
			if (isITextModel(model) && Range.isIRange(second) && Array.isArray(third) && (typeof forth === 'string' || forth === undefined)) {
				this.updateTools(model as ITextModel, Range.lift(second), third, forth);
			}
		}));
	}

	async provideCodeLenses(model: ITextModel, token: CancellationToken): Promise<undefined | CodeLensList> {
		const promptType = getPromptsTypeForLanguageId(model.getLanguageId());
		if (!promptType || promptType === PromptsType.instructions) {
			// if the model is not a prompt, we don't provide any code actions
			return undefined;
		}

		const promptAST = this.promptsService.getParsedPromptFile(model);
		const header = promptAST.header;
		if (!header) {
			return undefined;
		}

		if (isGithubTarget(promptType, header.target)) {
			return undefined;
		}

		const toolsAttr = header.getAttribute(PromptHeaderAttributes.tools);
		if (!toolsAttr || toolsAttr.value.type !== 'array') {
			return undefined;
		}
		const items = toolsAttr.value.items;
		const selectedTools = items.filter(item => item.type === 'string').map(item => item.value);

		const codeLens: CodeLens = {
			range: toolsAttr.range.collapseToStart(),
			command: {
				title: localize('configure-tools.capitalized.ellipsis', "Configure Tools..."),
				id: this.cmdId,
				arguments: [model, toolsAttr.value.range, selectedTools, header.target]
			}
		};
		return { lenses: [codeLens] };
	}

	private async updateTools(model: ITextModel, range: Range, selectedTools: readonly string[], target: string | undefined): Promise<void> {
		const selectedToolsNow = () => this.languageModelToolsService.toToolAndToolSetEnablementMap(selectedTools, target);
		const newSelectedAfter = await this.instantiationService.invokeFunction(showToolsPicker, localize('placeholder', "Select tools"), undefined, selectedToolsNow);
		if (!newSelectedAfter) {
			return;
		}
		await this.instantiationService.createInstance(PromptFileRewriter).rewriteTools(model, newSelectedAfter, range);
	}
}

registerEditorFeature(PromptToolsCodeLensProvider);
