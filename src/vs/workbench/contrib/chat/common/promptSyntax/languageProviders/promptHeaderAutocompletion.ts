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
import { ILanguageModelToolsService } from '../../tools/languageModelToolsService.js';
import { IChatModeService } from '../../chatModes.js';
import { getPromptsTypeForLanguageId, PromptsType } from '../promptTypes.js';
import { IPromptsService } from '../service/promptsService.js';
import { Iterable } from '../../../../../../base/common/iterator.js';
import { IHeaderAttribute, PromptHeader, PromptHeaderAttributes } from '../promptFileParser.js';
import { getAttributeDescription, getValidAttributeNames, isGithubTarget, knownGithubCopilotTools } from './promptValidator.js';
import { localize } from '../../../../../../nls.js';

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

		if (/^\s*$/.test(model.getValue())) {
			return {
				suggestions: [{
					label: localize('promptHeaderAutocompletion.addHeader', "Add Prompt Header"),
					kind: CompletionItemKind.Snippet,
					insertText: [
						`---`,
						`description: $1`,
						`---`,
						`$0`
					].join('\n'),
					insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
					range: model.getFullModelRange(),
				}]
			};
		}


		const parsedAST = this.promptsService.getParsedPromptFile(model);
		const header = parsedAST.header;
		if (!header) {
			return undefined;
		}

		const headerRange = parsedAST.header.range;
		if (position.lineNumber < headerRange.startLineNumber || position.lineNumber >= headerRange.endLineNumber) {
			// if the position is not inside the header, we don't provide any completions
			return undefined;
		}

		const lineText = model.getLineContent(position.lineNumber);
		const colonIndex = lineText.indexOf(':');
		const colonPosition = colonIndex !== -1 ? new Position(position.lineNumber, colonIndex + 1) : undefined;

		if (!colonPosition || position.isBeforeOrEqual(colonPosition)) {
			return this.provideAttributeNameCompletions(model, position, header, colonPosition, promptType);
		} else if (colonPosition && colonPosition.isBefore(position)) {
			return this.provideValueCompletions(model, position, header, colonPosition, promptType);
		}
		return undefined;
	}
	private async provideAttributeNameCompletions(
		model: ITextModel,
		position: Position,
		header: PromptHeader,
		colonPosition: Position | undefined,
		promptType: PromptsType,
	): Promise<CompletionList | undefined> {

		const suggestions: CompletionItem[] = [];

		const isGitHubTarget = isGithubTarget(promptType, header.target);
		const attributesToPropose = new Set(getValidAttributeNames(promptType, false, isGitHubTarget));
		for (const attr of header.attributes) {
			attributesToPropose.delete(attr.key);
		}
		const getInsertText = (key: string): string => {
			if (colonPosition) {
				return key;
			}
			const valueSuggestions = this.getValueSuggestions(promptType, key);
			if (valueSuggestions.length > 0) {
				return `${key}: \${0:${valueSuggestions[0]}}`;
			} else {
				return `${key}: \$0`;
			}
		};


		for (const attribute of attributesToPropose) {
			const item: CompletionItem = {
				label: attribute,
				documentation: getAttributeDescription(attribute, promptType),
				kind: CompletionItemKind.Property,
				insertText: getInsertText(attribute),
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
		const attribute = header.attributes.find(attr => attr.range.containsPosition(position));
		if (!attribute) {
			return undefined;
		}

		const isGitHubTarget = isGithubTarget(promptType, header.target);
		if (!getValidAttributeNames(promptType, true, isGitHubTarget).includes(attribute.key)) {
			return undefined;
		}

		if (promptType === PromptsType.prompt || promptType === PromptsType.agent) {
			if (attribute.key === PromptHeaderAttributes.model) {
				if (attribute.value.type === 'array') {
					// if the position is inside the tools metadata, we provide tool name completions
					const getValues = async () => this.getModelNames(promptType === PromptsType.agent);
					return this.provideArrayCompletions(model, position, attribute, getValues);
				}
			}
			if (attribute.key === PromptHeaderAttributes.tools) {
				if (attribute.value.type === 'array') {
					// if the position is inside the tools metadata, we provide tool name completions
					const getValues = async () => isGitHubTarget ? knownGithubCopilotTools : Array.from(this.languageModelToolsService.getFullReferenceNames());
					return this.provideArrayCompletions(model, position, attribute, getValues);
				}
			}
		}
		if (promptType === PromptsType.agent) {
			if (attribute.key === PromptHeaderAttributes.agents && !isGitHubTarget) {
				if (attribute.value.type === 'array') {
					return this.provideArrayCompletions(model, position, attribute, async () => (await this.promptsService.getCustomAgents(CancellationToken.None)).map(agent => agent.name));
				}
			}
		}
		const lineContent = model.getLineContent(attribute.range.startLineNumber);
		const whilespaceAfterColon = (lineContent.substring(colonPosition.column).match(/^\s*/)?.[0].length) ?? 0;
		const values = this.getValueSuggestions(promptType, attribute.key);
		for (const value of values) {
			const item: CompletionItem = {
				label: value,
				kind: CompletionItemKind.Value,
				insertText: whilespaceAfterColon === 0 ? ` ${value}` : value,
				range: new Range(position.lineNumber, colonPosition.column + whilespaceAfterColon + 1, position.lineNumber, model.getLineMaxColumn(position.lineNumber)),
			};
			suggestions.push(item);
		}
		if (attribute.key === PromptHeaderAttributes.handOffs && (promptType === PromptsType.agent)) {
			const value = [
				'',
				'  - label: Start Implementation',
				'    agent: agent',
				'    prompt: Implement the plan',
				'    send: true'
			].join('\n');
			const item: CompletionItem = {
				label: localize('promptHeaderAutocompletion.handoffsExample', "Handoff Example"),
				kind: CompletionItemKind.Value,
				insertText: whilespaceAfterColon === 0 ? ` ${value}` : value,
				range: new Range(position.lineNumber, colonPosition.column + whilespaceAfterColon + 1, position.lineNumber, model.getLineMaxColumn(position.lineNumber)),
			};
			suggestions.push(item);
		}
		return { suggestions };
	}

	private getValueSuggestions(promptType: string, attribute: string): string[] {
		switch (attribute) {
			case PromptHeaderAttributes.applyTo:
				if (promptType === PromptsType.instructions) {
					return [`'**'`, `'**/*.ts, **/*.js'`, `'**/*.php'`, `'**/*.py'`];
				}
				break;
			case PromptHeaderAttributes.agent:
			case PromptHeaderAttributes.mode:
				if (promptType === PromptsType.prompt) {
					// Get all available agents (builtin + custom)
					const agents = this.chatModeService.getModes();
					const suggestions: string[] = [];
					for (const agent of Iterable.concat(agents.builtin, agents.custom)) {
						suggestions.push(agent.name.get());
					}
					return suggestions;
				}
				break;
			case PromptHeaderAttributes.target:
				if (promptType === PromptsType.agent) {
					return ['vscode', 'github-copilot'];
				}
				break;
			case PromptHeaderAttributes.tools:
				if (promptType === PromptsType.prompt || promptType === PromptsType.agent) {
					return ['[]', `['search', 'edit', 'fetch']`];
				}
				break;
			case PromptHeaderAttributes.model:
				if (promptType === PromptsType.prompt || promptType === PromptsType.agent) {
					return this.getModelNames(promptType === PromptsType.agent);
				}
				break;
			case PromptHeaderAttributes.infer:
				if (promptType === PromptsType.agent) {
					return ['true', 'false'];
				}
				break;
			case PromptHeaderAttributes.agents:
				if (promptType === PromptsType.agent) {
					return ['["*"]'];
				}
				break;
			case PromptHeaderAttributes.userInvokable:
				if (promptType === PromptsType.agent) {
					return ['true', 'false'];
				}
				break;
			case PromptHeaderAttributes.disableModelInvocation:
				if (promptType === PromptsType.agent) {
					return ['true', 'false'];
				}
				break;
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

	private async provideArrayCompletions(model: ITextModel, position: Position, agentsAttr: IHeaderAttribute, getValues: () => Promise<string[]>): Promise<CompletionList | undefined> {
		if (agentsAttr.value.type !== 'array') {
			return undefined;
		}
		const getSuggestions = async (toolRange: Range) => {
			const suggestions: CompletionItem[] = [];
			const toolNames = await getValues();
			for (const toolName of toolNames) {
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

		for (const toolNameNode of agentsAttr.value.items) {
			if (toolNameNode.range.containsPosition(position)) {
				// if the position is inside a tool range, we provide tool name completions
				return await getSuggestions(toolNameNode.range);
			}
		}
		const prefix = model.getValueInRange(new Range(position.lineNumber, 1, position.lineNumber, position.column));
		if (prefix.match(/[,[]\s*$/)) {
			// if the position is after a comma or bracket
			return await getSuggestions(new Range(position.lineNumber, position.column, position.lineNumber, position.column));
		}
		return undefined;
	}

}
