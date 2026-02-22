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
import { IPromptsService, Target } from '../service/promptsService.js';
import { Iterable } from '../../../../../../base/common/iterator.js';
import { ClaudeHeaderAttributes, ISequenceValue, IValue, parseCommaSeparatedList, PromptHeader, PromptHeaderAttributes } from '../promptFileParser.js';
import { getAttributeDescription, getTarget, getValidAttributeNames, claudeAgentAttributes, claudeRulesAttributes, knownClaudeTools, knownGithubCopilotTools, IValueEntry } from './promptValidator.js';
import { localize } from '../../../../../../nls.js';
import { formatArrayValue, getQuotePreference } from '../utils/promptEditHelper.js';


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

		const target = getTarget(promptType, header);
		const attributesToPropose = new Set(getValidAttributeNames(promptType, false, target));
		for (const attr of header.attributes) {
			attributesToPropose.delete(attr.key);
		}
		const getInsertText = (key: string): string => {
			if (colonPosition) {
				return key;
			}
			const valueSuggestions = this.getValueSuggestions(promptType, key, target);
			if (valueSuggestions.length > 0) {
				return `${key}: \${0:${valueSuggestions[0].name}}`;
			} else {
				return `${key}: \$0`;
			}
		};


		for (const attribute of attributesToPropose) {
			const item: CompletionItem = {
				label: attribute,
				documentation: getAttributeDescription(attribute, promptType, target),
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
		const posLineNumber = position.lineNumber;
		const attribute = header.attributes.find(({ range }) => range.startLineNumber <= posLineNumber && posLineNumber <= range.endLineNumber);
		if (!attribute) {
			return undefined;
		}
		const target = getTarget(promptType, header);
		if (!getValidAttributeNames(promptType, true, target).includes(attribute.key)) {
			return undefined;
		}

		if (promptType === PromptsType.prompt || promptType === PromptsType.agent) {
			if (attribute.key === PromptHeaderAttributes.model) {
				if (attribute.value.type === 'sequence') {
					// if the position is inside the tools metadata, we provide tool name completions
					const getValues = async () => {
						if (target === Target.Claude) {
							return knownClaudeTools;
						} else {
							return this.getModelNames(promptType === PromptsType.agent);
						}
					};
					return this.provideArrayCompletions(model, position, attribute.value, getValues);
				}
			}
			if (attribute.key === PromptHeaderAttributes.tools || attribute.key === ClaudeHeaderAttributes.disallowedTools) {
				let value = attribute.value;
				if (value.type === 'scalar') {
					value = parseCommaSeparatedList(value);
				}
				if (value.type === 'sequence') {
					// if the position is inside the tools metadata, we provide tool name completions
					const getValues = async () => {
						if (target === Target.GitHubCopilot) {
							// for GitHub Copilot agent files, we only suggest the known set of tools that are supported by GitHub Copilot, instead of all tools that the user has defined, because many tools won't work with GitHub Copilot and it would be frustrating for users to select a tool that doesn't work
							return knownGithubCopilotTools;
						} else if (target === Target.Claude) {
							return knownClaudeTools;
						} else {
							return Array.from(this.languageModelToolsService.getFullReferenceNames()).map(name => ({ name }));
						}
					};
					return this.provideArrayCompletions(model, position, value, getValues);
				}
			}
		}
		if (attribute.key === PromptHeaderAttributes.agents) {
			if (attribute.value.type === 'sequence') {
				return this.provideArrayCompletions(model, position, attribute.value, async () => {
					return await this.promptsService.getCustomAgents(CancellationToken.None);
				});
			}
		}
		const lineContent = model.getLineContent(attribute.range.startLineNumber);
		const whilespaceAfterColon = (lineContent.substring(colonPosition.column).match(/^\s*/)?.[0].length) ?? 0;
		const entries = this.getValueSuggestions(promptType, attribute.key, target);
		for (const entry of entries) {
			const item: CompletionItem = {
				label: entry.name,
				documentation: entry.description,
				kind: CompletionItemKind.Value,
				insertText: whilespaceAfterColon === 0 ? ` ${entry.name}` : entry.name,
				range: new Range(position.lineNumber, colonPosition.column + whilespaceAfterColon + 1, position.lineNumber, model.getLineMaxColumn(position.lineNumber)),
			};
			suggestions.push(item);
		}
		if (attribute.key === PromptHeaderAttributes.handOffs) {
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

	private getValueSuggestions(promptType: PromptsType, attribute: string, target: Target): IValueEntry[] {
		if (target === Target.Claude) {
			const attributeDesc = promptType === PromptsType.instructions ? claudeRulesAttributes[attribute] : claudeAgentAttributes[attribute];
			if (attributeDesc) {
				if (attributeDesc.enums) {
					return attributeDesc.enums;
				} else if (attributeDesc.defaults) {
					return attributeDesc.defaults.map(value => ({ name: value }));
				}
			}
			return [];
		}
		switch (attribute) {
			case PromptHeaderAttributes.applyTo:
				if (promptType === PromptsType.instructions) {
					return [
						{ name: `'**'` },
						{ name: `'**/*.ts, **/*.js'` },
						{ name: `'**/*.php'` },
						{ name: `'**/*.py'` }
					];
				}
				break;
			case PromptHeaderAttributes.agent:
			case PromptHeaderAttributes.mode:
				if (promptType === PromptsType.prompt) {
					// Get all available agents (builtin + custom)
					const agents = this.chatModeService.getModes();
					const suggestions: IValueEntry[] = [];
					for (const agent of Iterable.concat(agents.builtin, agents.custom)) {
						suggestions.push({ name: agent.name.get(), description: agent.label.get() });
					}
					return suggestions;
				}
				break;
			case PromptHeaderAttributes.target:
				if (promptType === PromptsType.agent) {
					return [{ name: 'vscode' }, { name: 'github-copilot' }];
				}
				break;
			case PromptHeaderAttributes.tools:
				if (promptType === PromptsType.prompt || promptType === PromptsType.agent) {
					return [
						{ name: '[]' },
						{ name: `['search', 'edit', 'web']` }
					];
				}
				break;
			case PromptHeaderAttributes.model:
				if (promptType === PromptsType.prompt || promptType === PromptsType.agent) {
					return this.getModelNames(promptType === PromptsType.agent);
				}
				break;
			case PromptHeaderAttributes.infer:
				if (promptType === PromptsType.agent) {
					return [
						{ name: 'true' },
						{ name: 'false' }
					];
				}
				break;
			case PromptHeaderAttributes.agents:
				if (promptType === PromptsType.agent) {
					return [{ name: '["*"]' }];
				}
				break;
			case PromptHeaderAttributes.userInvocable:
				if (promptType === PromptsType.agent || promptType === PromptsType.skill) {
					return [{ name: 'true' }, { name: 'false' }];
				}
				break;
			case PromptHeaderAttributes.disableModelInvocation:
				if (promptType === PromptsType.agent || promptType === PromptsType.skill) {
					return [{ name: 'true' }, { name: 'false' }];
				}
				break;
		}
		return [];
	}

	private getModelNames(agentModeOnly: boolean): IValueEntry[] {
		const result = [];
		for (const model of this.languageModelsService.getLanguageModelIds()) {
			const metadata = this.languageModelsService.lookupLanguageModel(model);
			if (metadata && metadata.isUserSelectable !== false && !metadata.targetChatSessionType) {
				if (!agentModeOnly || ILanguageModelChatMetadata.suitableForAgentMode(metadata)) {
					result.push({
						name: ILanguageModelChatMetadata.asQualifiedName(metadata),
						description: metadata.tooltip
					});
				}
			}
		}
		return result;
	}

	private async provideArrayCompletions(model: ITextModel, position: Position, arrayValue: ISequenceValue, getValues: () => Promise<ReadonlyArray<IValueEntry>>): Promise<CompletionList | undefined> {
		const getSuggestions = async (toolRange: Range, currentItem?: IValue) => {
			const suggestions: CompletionItem[] = [];
			const entries = await getValues();
			const quotePreference = getQuotePreference(arrayValue, model);
			const existingValues = new Set<string>(arrayValue.items.filter(item => item !== currentItem).filter(item => item.type === 'scalar').map(item => item.value));
			for (const entry of entries) {
				const entryName = entry.name;
				if (existingValues.has(entryName)) {
					continue;
				}
				let insertText: string;
				if (!toolRange.isEmpty()) {
					const firstChar = model.getValueInRange(toolRange).charCodeAt(0);
					insertText = firstChar === CharCode.SingleQuote ? `'${entryName}'` : firstChar === CharCode.DoubleQuote ? `"${entryName}"` : entryName;
				} else {
					insertText = formatArrayValue(entryName, quotePreference);
				}
				suggestions.push({
					label: entryName,
					documentation: entry.description,
					kind: CompletionItemKind.Value,
					filterText: insertText,
					insertText: insertText,
					range: toolRange,
				});
			}
			return { suggestions };
		};

		for (const item of arrayValue.items) {
			if (item.range.containsPosition(position)) {
				// if the position is inside a item range, we provide item completions
				return await getSuggestions(item.range, item);
			}
		}
		const prefix = model.getValueInRange(new Range(position.lineNumber, 1, position.lineNumber, position.column));
		if (prefix.match(/[:,[]\s*$/)) {
			// if the position is after a comma or bracket
			return await getSuggestions(new Range(position.lineNumber, position.column, position.lineNumber, position.column));
		}
		return undefined;

	}
}
