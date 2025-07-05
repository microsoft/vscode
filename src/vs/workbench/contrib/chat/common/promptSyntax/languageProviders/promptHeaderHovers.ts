/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { Position } from '../../../../../../editor/common/core/position.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { Hover, HoverContext, HoverProvider } from '../../../../../../editor/common/languages.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { ILanguageFeaturesService } from '../../../../../../editor/common/services/languageFeatures.js';
import { localize } from '../../../../../../nls.js';
import { ILanguageModelChatMetadata, ILanguageModelsService } from '../../languageModels.js';
import { ILanguageModelToolsService, ToolSet } from '../../languageModelToolsService.js';
import { InstructionsHeader } from '../parsers/promptHeader/instructionsHeader.js';
import { PromptModelMetadata } from '../parsers/promptHeader/metadata/model.js';
import { PromptToolsMetadata } from '../parsers/promptHeader/metadata/tools.js';
import { ModeHeader } from '../parsers/promptHeader/modeHeader.js';
import { ALL_PROMPTS_LANGUAGE_SELECTOR, getPromptsTypeForLanguageId } from '../promptTypes.js';
import { IPromptsService } from '../service/promptsService.js';

export class PromptHeaderHoverProvider extends Disposable implements HoverProvider {
	/**
	 * Debug display name for this provider.
	 */
	public readonly _debugDisplayName: string = 'PromptHeaderHoverProvider';

	constructor(
		@IPromptsService private readonly promptsService: IPromptsService,
		@ILanguageFeaturesService private readonly languageService: ILanguageFeaturesService,
		@ILanguageModelToolsService private readonly languageModelToolsService: ILanguageModelToolsService,
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
	) {
		super();

		this._register(this.languageService.hoverProvider.register(ALL_PROMPTS_LANGUAGE_SELECTOR, this));
	}

	private createHover(contents: string, range: Range): Hover {
		return {
			contents: [new MarkdownString(contents)],
			range
		};
	}

	public async provideHover(
		model: ITextModel,
		position: Position,
		token: CancellationToken,
		_context?: HoverContext
	): Promise<Hover | undefined> {

		const promptType = getPromptsTypeForLanguageId(model.getLanguageId());
		if (!promptType) {
			// if the model is not a prompt, we don't provide any completions
			return undefined;
		}

		const parser = this.promptsService.getSyntaxParserFor(model);
		await parser.start(token).settled();

		if (token.isCancellationRequested) {
			return undefined;
		}

		const header = parser.header;
		if (!header) {
			return undefined;
		}

		const completed = await header.settled;
		if (!completed || token.isCancellationRequested) {
			return undefined;
		}

		if (header instanceof InstructionsHeader) {
			const descriptionRange = header.metadataUtility.description?.range;
			if (descriptionRange?.containsPosition(position)) {
				return this.createHover(localize('promptHeader.instructions.description', 'The description of the instruction file. It can be used to provide additional context or information about the instructions and is passed to the language model as part of the prompt.'), descriptionRange);
			}
			const applyToRange = header.metadataUtility.applyTo?.range;
			if (applyToRange?.containsPosition(position)) {
				return this.createHover(localize('promptHeader.instructions.applyToRange', 'One or more glob pattern (separated by comma) that describe for which files the instructions apply to. Based on these patterns, the file is automatically included in the prompt, when the context contains a file that matches one or more of these patterns. Use `**` when you want this file to always be added.\nExample: **/*.ts, **/*.js, client/**'), applyToRange);
			}

		} else if (header instanceof ModeHeader) {
			const descriptionRange = header.metadataUtility.description?.range;
			if (descriptionRange?.containsPosition(position)) {
				return this.createHover(localize('promptHeader.mode.description', 'The description of the mode file. It can be used to provide additional context or information about the mode to the mode author.'), descriptionRange);
			}
			const model = header.metadataUtility.model;
			if (model?.range.containsPosition(position)) {
				return this.getModelHover(model, model.range, localize('promptHeader.mode.model', 'The model to use in this mode.'));
			}
			const tools = header.metadataUtility.tools;
			if (tools?.range?.containsPosition(position)) {
				return this.getToolHover(tools, position, localize('promptHeader.mode.tools', 'The tools to use in this mode.'));
			}
		} else {
			const descriptionRange = header.metadataUtility.description?.range;
			if (descriptionRange?.containsPosition(position)) {
				return this.createHover(localize('promptHeader.prompt.description', 'The description of the prompt file. It can be used to provide additional context or information about the prompt to the prompt author.'), descriptionRange);
			}
			const model = header.metadataUtility.model;
			if (model?.range.containsPosition(position)) {
				return this.getModelHover(model, model.range, localize('promptHeader.prompt.model', 'The model to use in this prompt.'));
			}
			const tools = header.metadataUtility.tools;
			if (tools?.range?.containsPosition(position)) {
				return this.getToolHover(tools, position, localize('promptHeader.prompt.tools', 'The tools to use in this prompt.'));
			}
			const modeRange = header.metadataUtility.mode?.range;
			if (modeRange?.containsPosition(position)) {
				return this.createHover(localize('promptHeader.prompt.mode', 'The mode (ask, edit or agent) to use when running this prompt.'), modeRange);
			}
		}
		return undefined;
	}

	private getToolHover(node: PromptToolsMetadata, position: Position, baseMessage: string): Hover | undefined {
		if (node.value) {

			for (const toolName of node.value) {
				const toolRange = node.getToolRange(toolName);
				if (toolRange?.containsPosition(position)) {
					const tool = this.languageModelToolsService.getToolByName(toolName);
					if (tool) {
						return this.createHover(tool.modelDescription, toolRange);
					}
					const toolSet = this.languageModelToolsService.getToolSetByName(toolName);
					if (toolSet) {
						return this.getToolsetHover(toolSet, toolRange);
					}
				}
			}
		}
		return this.createHover(baseMessage, node.range);
	}

	private getToolsetHover(toolSet: ToolSet, range: Range): Hover | undefined {
		const lines: string[] = [];
		lines.push(localize('toolSetName', 'ToolSet: {0}\n\n', toolSet.referenceName));
		if (toolSet.description) {
			lines.push(toolSet.description);
		}
		for (const tool of toolSet.getTools()) {
			lines.push(`- ${tool.toolReferenceName ?? tool.displayName}`);
		}
		return this.createHover(lines.join('\n'), range);
	}

	private getModelHover(node: PromptModelMetadata, range: Range, baseMessage: string): Hover | undefined {
		const modelName = node.value;
		if (modelName) {
			for (const id of this.languageModelsService.getLanguageModelIds()) {
				const meta = this.languageModelsService.lookupLanguageModel(id);
				if (meta && ILanguageModelChatMetadata.asQualifiedName(meta) === modelName) {
					const lines: string[] = [];
					lines.push(baseMessage + '\n');
					lines.push(localize('modelName', '- Name: {0}', meta.name));
					lines.push(localize('modelFamily', '- Family: {0}', meta.family));
					lines.push(localize('modelVendor', '- Vendor: {0}', meta.vendor));
					if (meta.description) {
						lines.push('', '', meta.description);
					}
					return this.createHover(lines.join('\n'), range);
				}
			}
		}
		return this.createHover(baseMessage, range);
	}

}
