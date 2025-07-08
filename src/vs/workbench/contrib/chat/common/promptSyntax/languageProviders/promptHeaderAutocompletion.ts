/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { CharCode } from '../../../../../../base/common/charCode.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { Position } from '../../../../../../editor/common/core/position.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { CompletionContext, CompletionItem, CompletionItemInsertTextRule, CompletionItemKind, CompletionItemProvider, CompletionList } from '../../../../../../editor/common/languages.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { ILanguageFeaturesService } from '../../../../../../editor/common/services/languageFeatures.js';
import { ILanguageModelChatMetadata, ILanguageModelsService } from '../../languageModels.js';
import { ILanguageModelToolsService } from '../../languageModelToolsService.js';
import { InstructionsHeader } from '../parsers/promptHeader/instructionsHeader.js';
import { PromptToolsMetadata } from '../parsers/promptHeader/metadata/tools.js';
import { ModeHeader } from '../parsers/promptHeader/modeHeader.js';
import { PromptHeader } from '../parsers/promptHeader/promptHeader.js';
import { ALL_PROMPTS_LANGUAGE_SELECTOR, getPromptsTypeForLanguageId, PromptsType } from '../promptTypes.js';
import { IPromptsService } from '../service/promptsService.js';

export class PromptHeaderAutocompletion extends Disposable implements CompletionItemProvider {
	/**
	 * Debug display name for this provider.
	 */
	public readonly _debugDisplayName: string = 'PromptHeaderAutocompletion';

	/**
	 * List of trigger characters handled by this provider.
	 */
	public readonly triggerCharacters = [':'];

	constructor(
		@IPromptsService private readonly promptsService: IPromptsService,
		@ILanguageFeaturesService private readonly languageService: ILanguageFeaturesService,
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@ILanguageModelToolsService private readonly languageModelToolsService: ILanguageModelToolsService,
	) {
		super();

		this._register(this.languageService.completionProvider.register(ALL_PROMPTS_LANGUAGE_SELECTOR, this));
	}

	/**
	 * The main function of this provider that calculates
	 * completion items based on the provided arguments.
	 */
	public async provideCompletionItems(
		model: ITextModel,
		position: Position,
		context: CompletionContext,
		token: CancellationToken,
	): Promise<CompletionList | undefined> {

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

		const fullHeaderRange = parser.header.range;
		const headerRange = new Range(fullHeaderRange.startLineNumber + 1, 0, fullHeaderRange.endLineNumber - 1, model.getLineMaxColumn(fullHeaderRange.endLineNumber - 1),);

		if (!headerRange.containsPosition(position)) {
			// if the position is not inside the header, we don't provide any completions
			return undefined;
		}

		const lineText = model.getLineContent(position.lineNumber);
		const colonIndex = lineText.indexOf(':');
		const colonPosition = colonIndex !== -1 ? new Position(position.lineNumber, colonIndex + 1) : undefined;

		if (!colonPosition || position.isBeforeOrEqual(colonPosition)) {
			return this.providePropertyCompletions(model, position, headerRange, colonPosition, promptType);
		} else if (colonPosition && colonPosition.isBefore(position)) {
			return this.provideValueCompletions(model, position, header, colonPosition, promptType);
		}
		return undefined;
	}
	private async providePropertyCompletions(
		model: ITextModel,
		position: Position,
		headerRange: Range,
		colonPosition: Position | undefined,
		promptType: string,
	): Promise<CompletionList | undefined> {

		const suggestions: CompletionItem[] = [];
		const supportedProperties = this.getSupportedProperties(promptType);
		this.removeUsedProperties(supportedProperties, model, headerRange, position);

		const getInsertText = (property: string): string => {
			if (colonPosition) {
				return property;
			}
			const valueSuggestions = this.getValueSuggestions(promptType, property);
			if (valueSuggestions.length > 0) {
				return `${property}: \${0:${valueSuggestions[0]}}`;
			} else {
				return `${property}: \$0`;
			}
		};


		for (const property of supportedProperties) {
			const item: CompletionItem = {
				label: property,
				kind: CompletionItemKind.Property,
				insertText: getInsertText(property),
				insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
				range: new Range(position.lineNumber, 1, position.lineNumber, !colonPosition ? model.getLineMaxColumn(position.lineNumber) : colonPosition.column),
			};
			suggestions.push(item);
		}

		return { suggestions };
	}

	private async provideValueCompletions(
		model: ITextModel,
		position: Position,
		header: PromptHeader | ModeHeader | InstructionsHeader,
		colonPosition: Position,
		promptType: string,
	): Promise<CompletionList | undefined> {

		const suggestions: CompletionItem[] = [];
		const lineContent = model.getLineContent(position.lineNumber);
		const property = lineContent.substring(0, colonPosition.column - 1).trim();

		if (!this.getSupportedProperties(promptType).has(property)) {
			return undefined;
		}

		if (header instanceof PromptHeader || header instanceof ModeHeader) {
			const tools = header.metadataUtility.tools;
			if (tools) {
				// if the position is inside the tools metadata, we provide tool name completions
				const result = this.provideToolCompletions(model, position, tools);
				if (result) {
					return result;
				}
			}
		}


		const bracketIndex = lineContent.indexOf('[');
		if (bracketIndex !== -1 && bracketIndex <= position.column - 1) {
			// if the property is already inside a bracket, we don't provide value completions
			return undefined;
		}

		const whilespaceAfterColon = (lineContent.substring(colonPosition.column).match(/^\s*/)?.[0].length) ?? 0;
		const values = this.getValueSuggestions(promptType, property);
		for (const value of values) {
			const item: CompletionItem = {
				label: value,
				kind: CompletionItemKind.Value,
				insertText: whilespaceAfterColon === 0 ? ` ${value}` : value,
				range: new Range(position.lineNumber, colonPosition.column + whilespaceAfterColon + 1, position.lineNumber, model.getLineMaxColumn(position.lineNumber)),
			};
			suggestions.push(item);
		}
		return { suggestions };
	}

	private getSupportedProperties(promptType: string): Set<string> {
		switch (promptType) {
			case PromptsType.instructions:
				return new Set(['applyTo', 'description']);
			case PromptsType.prompt:
				return new Set(['mode', 'tools', 'description', 'model']);
			default:
				return new Set(['tools', 'description', 'model']);
		}
	}

	private removeUsedProperties(properties: Set<string>, model: ITextModel, headerRange: Range, position: Position): void {
		for (let i = headerRange.startLineNumber; i <= headerRange.endLineNumber; i++) {
			if (i !== position.lineNumber) {
				const lineText = model.getLineContent(i);
				const colonIndex = lineText.indexOf(':');
				if (colonIndex !== -1) {
					const property = lineText.substring(0, colonIndex).trim();
					properties.delete(property);
				}
			}
		}
	}

	private getValueSuggestions(promptType: string, property: string): string[] {
		if (promptType === PromptsType.instructions && property === 'applyTo') {
			return ['**', '**/*.ts, **/*.js', '**/*.php', '**/*.py'];
		}
		if (promptType === PromptsType.prompt && property === 'mode') {
			return ['agent', 'edit', 'ask'];
		}
		if (property === 'tools' && (promptType === PromptsType.prompt || promptType === PromptsType.mode)) {
			return ['[]', `['codebase', 'editFiles', 'fetch']`];
		}
		if (property === 'model' && (promptType === PromptsType.prompt || promptType === PromptsType.mode)) {
			return this.getModelNames(promptType === PromptsType.mode);
		}
		return [];
	}

	private getModelNames(agentModeOnly: boolean): string[] {
		const result = [];
		for (const model of this.languageModelsService.getLanguageModelIds()) {
			const metadata = this.languageModelsService.lookupLanguageModel(model);
			if (metadata && metadata.isUserSelectable !== false) {
				if (!agentModeOnly || ILanguageModelChatMetadata.suitableForAgentMode(metadata)) {
					result.push(ILanguageModelChatMetadata.asQualifiedName(metadata));
				}
			}
		}
		return result;
	}

	private provideToolCompletions(model: ITextModel, position: Position, node: PromptToolsMetadata): CompletionList | undefined {
		const tools = node.value;
		if (!tools || !node.range.containsPosition(position)) {
			return undefined;
		}
		const getSuggestions = (toolRange: Range) => {
			const suggestions: CompletionItem[] = [];
			const addSuggestion = (toolName: string, toolRange: Range) => {
				let insertText: string;
				if (!toolRange.isEmpty()) {
					const firstChar = model.getValueInRange(toolRange).charCodeAt(0);
					insertText = firstChar === CharCode.SingleQuote ? `'${toolName}'` : firstChar === CharCode.DoubleQuote ? `"${toolName}"` : toolName;
				} else {
					insertText = `'${toolName}'`;
				}
				suggestions.push({
					label: toolName,
					kind: CompletionItemKind.Value,
					filterText: insertText,
					insertText: insertText,
					range: toolRange,
				});
			};
			for (const tool of this.languageModelToolsService.getTools()) {
				if (tool.canBeReferencedInPrompt) {
					addSuggestion(tool.toolReferenceName ?? tool.displayName, toolRange);
				}
			}
			for (const toolSet of this.languageModelToolsService.toolSets.get()) {
				addSuggestion(toolSet.referenceName, toolRange);
			}
			return { suggestions };
		};

		for (const tool of tools) {
			const toolRange = node.getToolRange(tool);
			if (toolRange?.containsPosition(position)) {
				// if the position is inside a tool range, we provide tool name completions
				return getSuggestions(toolRange);
			}
		}
		const prefix = model.getValueInRange(new Range(position.lineNumber, 1, position.lineNumber, position.column));
		if (prefix.match(/[,[]\s*$/)) {
			// if the position is after a comma or bracket
			return getSuggestions(new Range(position.lineNumber, position.column, position.lineNumber, position.column));
		}
		return undefined;
	}

}
