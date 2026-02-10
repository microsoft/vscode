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
import { IPromptsService, Target } from '../../common/promptSyntax/service/promptsService.js';
import { registerEditorFeature } from '../../../../../editor/common/editorFeatures.js';
import { PromptFileRewriter } from './promptFileRewriter.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { IEditorModel } from '../../../../../editor/common/editorCommon.js';
import { isTarget, parseCommaSeparatedList, PromptHeaderAttributes } from '../../common/promptSyntax/promptFileParser.js';
import { getTarget, isVSCodeOrDefaultTarget } from '../../common/promptSyntax/languageProviders/promptValidator.js';
import { isBoolean } from '../../../../../base/common/types.js';

class PromptToolsCodeLensProvider extends Disposable implements CodeLensProvider {

	// `_`-prefix marks this as private command
	private readonly cmdId = `_configure/${generateUuid()}`;

	constructor(
		@IPromptsService private readonly promptsService: IPromptsService,
		@ILanguageFeaturesService private readonly languageService: ILanguageFeaturesService,
		@ILanguageModelToolsService private readonly languageModelToolsService: ILanguageModelToolsService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();


		this._register(this.languageService.codeLensProvider.register(ALL_PROMPTS_LANGUAGE_SELECTOR, this));

		this._register(CommandsRegistry.registerCommand(this.cmdId, (_accessor, ...args) => {
			const [modelArg, rangeArg, isStringArg, toolsArg, targetArg] = args;
			const model = modelArg as IEditorModel;
			if (isITextModel(model) && Range.isIRange(rangeArg) && isBoolean(isStringArg) && Array.isArray(toolsArg) && isTarget(targetArg)) {
				this.updateTools(model as ITextModel, Range.lift(rangeArg), isStringArg, toolsArg, targetArg);
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

		const target = getTarget(promptType, header);
		if (!isVSCodeOrDefaultTarget(target)) {
			return undefined;
		}

		const toolsAttr = header.getAttribute(PromptHeaderAttributes.tools);
		if (!toolsAttr) {
			return undefined;
		}
		let value = toolsAttr.value;
		if (value.type === 'string') {
			value = parseCommaSeparatedList(value);
		}
		if (value.type !== 'array') {
			return undefined;
		}
		const items = value.items;
		const selectedTools = items.filter(item => item.type === 'string').map(item => item.value);

		const codeLens: CodeLens = {
			range: toolsAttr.range.collapseToStart(),
			command: {
				title: localize('configure-tools.capitalized.ellipsis', "Configure Tools..."),
				id: this.cmdId,
				arguments: [model, toolsAttr.range, toolsAttr.value.type === 'string', selectedTools, target]
			}
		};
		return { lenses: [codeLens] };
	}

	private async updateTools(model: ITextModel, range: Range, isString: boolean, selectedTools: readonly string[], target: Target): Promise<void> {
		const selectedToolsNow = () => this.languageModelToolsService.toToolAndToolSetEnablementMap(selectedTools, undefined);
		const newSelectedAfter = await this.instantiationService.invokeFunction(showToolsPicker, localize('placeholder', "Select tools"), 'codeLens', undefined, selectedToolsNow);
		if (!newSelectedAfter) {
			return;
		}
		this.instantiationService.createInstance(PromptFileRewriter).rewriteTools(model, newSelectedAfter, range, isString);
	}
}

registerEditorFeature(PromptToolsCodeLensProvider);
