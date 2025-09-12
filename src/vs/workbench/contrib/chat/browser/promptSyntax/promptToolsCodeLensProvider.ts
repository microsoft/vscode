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
import { ILanguageModelToolsService } from '../../common/languageModelToolsService.js';
import { ALL_PROMPTS_LANGUAGE_SELECTOR } from '../../common/promptSyntax/promptTypes.js';
import { IPromptsService } from '../../common/promptSyntax/service/promptsService.js';
import { registerEditorFeature } from '../../../../../editor/common/editorFeatures.js';
import { PromptFileRewriter } from './promptFileRewriter.js';
import { Range } from '../../../../../editor/common/core/range.js';

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
			const [first, second, third] = args;
			if (isITextModel(first) && Range.isIRange(second) && Array.isArray(third)) {
				this.updateTools(first, Range.lift(second), third);
			}
		}));
	}

	async provideCodeLenses(model: ITextModel, token: CancellationToken): Promise<undefined | CodeLensList> {

		const parser = this.promptsService.getParsedPromptFile(model);
		if (!parser.header) {
			return undefined;
		}


		const toolsAttr = parser.header.getAttribute('tools');
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
				arguments: [model, toolsAttr.range, selectedTools]
			}
		};
		return { lenses: [codeLens] };
	}

	private async updateTools(model: ITextModel, range: Range, selectedTools: readonly string[]) {

		const selectedToolsNow = () => this.languageModelToolsService.toToolAndToolSetEnablementMap(selectedTools);
		const newSelectedAfter = await this.instantiationService.invokeFunction(showToolsPicker, localize('placeholder', "Select tools"), undefined, selectedToolsNow);
		if (!newSelectedAfter) {
			return;
		}
		await this.instantiationService.createInstance(PromptFileRewriter).rewriteTools(model, newSelectedAfter, range);
	}
}

registerEditorFeature(PromptToolsCodeLensProvider);
