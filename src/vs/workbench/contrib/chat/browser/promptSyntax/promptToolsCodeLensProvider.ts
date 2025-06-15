/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { EditOperation } from '../../../../../editor/common/core/editOperation.js';
import { CodeLens, CodeLensList, CodeLensProvider } from '../../../../../editor/common/languages.js';
import { isITextModel, ITextModel } from '../../../../../editor/common/model.js';
import { ILanguageFeaturesService } from '../../../../../editor/common/services/languageFeatures.js';
import { localize } from '../../../../../nls.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { showToolsPicker } from '../actions/chatToolPicker.js';
import { ILanguageModelToolsService, IToolData, ToolSet } from '../../common/languageModelToolsService.js';
import { ALL_PROMPTS_LANGUAGE_SELECTOR } from '../../common/promptSyntax/promptTypes.js';
import { PromptToolsMetadata } from '../../common/promptSyntax/parsers/promptHeader/metadata/tools.js';
import { IPromptsService } from '../../common/promptSyntax/service/promptsService.js';
import { registerEditorFeature } from '../../../../../editor/common/editorFeatures.js';

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
			const [first, second] = args;
			if (isITextModel(first) && second instanceof PromptToolsMetadata) {
				this.updateTools(first, second);
			}
		}));
	}

	async provideCodeLenses(model: ITextModel, token: CancellationToken): Promise<undefined | CodeLensList> {

		const parser = this.promptsService.getSyntaxParserFor(model);

		const { header } = await parser
			.start(token)
			.settled();

		if ((header === undefined) || token.isCancellationRequested) {
			return undefined;
		}

		if (('tools' in header.metadataUtility) === false) {
			return undefined;
		}

		const { tools } = header.metadataUtility;
		if (tools === undefined) {
			return undefined;
		}

		const codeLens: CodeLens = {
			range: tools.range.collapseToStart(),
			command: {
				title: localize('configure-tools.capitalized.ellipsis', "Configure Tools..."),
				id: this.cmdId,
				arguments: [model, tools]
			}
		};
		return { lenses: [codeLens] };
	}

	private async updateTools(model: ITextModel, tools: PromptToolsMetadata) {

		const toolNames = new Set(tools.value);
		const selectedToolsNow = new Map<ToolSet | IToolData, boolean>();

		for (const tool of this.languageModelToolsService.getTools()) {
			selectedToolsNow.set(tool, toolNames.has(tool.toolReferenceName ?? tool.displayName));
		}
		for (const toolSet of this.languageModelToolsService.toolSets.get()) {
			selectedToolsNow.set(toolSet, toolNames.has(toolSet.referenceName));
		}

		const newSelectedAfter = await this.instantiationService.invokeFunction(showToolsPicker, localize('placeholder', "Select tools"), selectedToolsNow);
		if (!newSelectedAfter) {
			return;
		}

		const newToolNames: string[] = [];
		for (const [item, picked] of newSelectedAfter) {
			if (picked) {
				if (item instanceof ToolSet) {
					newToolNames.push(item.referenceName);
				} else {
					newToolNames.push(item.toolReferenceName ?? item.displayName);
				}
			}
		}

		model.pushStackElement();
		model.pushEditOperations(null, [EditOperation.replaceMove(tools.range, `tools: [${newToolNames.map(s => `'${s}'`).join(', ')}]`)], () => null);
		model.pushStackElement();
	}
}

registerEditorFeature(PromptToolsCodeLensProvider);
