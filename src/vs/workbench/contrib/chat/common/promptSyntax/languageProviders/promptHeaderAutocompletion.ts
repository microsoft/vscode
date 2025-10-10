/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { CharCode } from '../../../../../../base/common/charCode.js';
import { Position } from '../../../../../../editor/common/core/position.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { CompletionContext, CompletionItem, CompletionItemInsertTextRule, CompletionItemKind, CompletionItemProvider, CompletionList } from '../../../../../../editor/common/languages.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { ILanguageModelChatMetadata, ILanguageModelsService } from '../../languageModels.js';
import { ILanguageModelToolsService } from '../../languageModelToolsService.js';
import { IChatModeService } from '../../chatModes.js';
import { getPromptsTypeForLanguageId, PromptsType } from '../promptTypes.js';
import { IPromptsService } from '../service/promptsService.js';
import { Iterable } from '../../../../../../base/common/iterator.js';
import { PromptHeader } from '../service/newPromptsParser.js';
import { getValidAttributeNames } from './promptValidator.js';

export class PromptHeaderAutocompletion implements CompletionItemProvider {
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
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@ILanguageModelToolsService private readonly languageModelToolsService: ILanguageModelToolsService,
		@IChatModeService private readonly chatModeService: IChatModeService,
	) {
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

		const parser = this.promptsService.getParsedPromptFile(model);
		const header = parser.header;
		if (!header) {
			return undefined;
		}

		const headerRange = parser.header.range;
		if (position.lineNumber < headerRange.startLineNumber || position.lineNumber >= headerRange.endLineNumber) {
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
		promptType: PromptsType,
	): Promise<CompletionList | undefined> {

		const suggestions: CompletionItem[] = [];
		const supportedProperties = new Set(getValidAttributeNames(promptType, false));
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
		header: PromptHeader,
		colonPosition: Position,
		promptType: PromptsType,
	): Promise<CompletionList | undefined> {

		const suggestions: CompletionItem[] = [];
		const lineContent = model.getLineContent(position.lineNumber);
		const property = lineContent.substring(0, colonPosition.column - 1).trim();

		if (!getValidAttributeNames(promptType, true).includes(property)) {
			return undefined;
		}

		if (promptType === PromptsType.prompt || promptType === PromptsType.mode) {
			// if the position is inside the tools metadata, we provide tool name completions
			const result = this.provideToolCompletions(model, position, header);
			if (result) {
				return result;
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
			return [`'**'`, `'**/*.ts, **/*.js'`, `'**/*.php'`, `'**/*.py'`];
		}
		if (promptType === PromptsType.prompt && property === 'mode') {
			// Get all available modes (builtin + custom)
			const modes = this.chatModeService.getModes();
			const suggestions: string[] = [];
			for (const mode of Iterable.concat(modes.builtin, modes.custom)) {
				suggestions.push(mode.name);
			}
			return suggestions;
		}
		if (property === 'tools' && (promptType === PromptsType.prompt || promptType === PromptsType.mode)) {
			return ['[]', `['search', 'edit', 'fetch']`];
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

	private provideToolCompletions(model: ITextModel, position: Position, header: PromptHeader): CompletionList | undefined {
		const toolsAttr = header.getAttribute('tools');
		if (!toolsAttr || toolsAttr.value.type !== 'array' || !toolsAttr.range.containsPosition(position)) {
			return undefined;
		}
		const getSuggestions = (toolRange: Range) => {
			const suggestions: CompletionItem[] = [];
			for (const toolName of this.languageModelToolsService.getQualifiedToolNames()) {
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
			}
			return { suggestions };
		};

		for (const toolNameNode of toolsAttr.value.items) {
			if (toolNameNode.range.containsPosition(position)) {
				// if the position is inside a tool range, we provide tool name completions
				return getSuggestions(toolNameNode.range);
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
