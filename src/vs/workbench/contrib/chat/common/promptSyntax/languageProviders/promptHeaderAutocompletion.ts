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
import { localChatSessionType } from '../../chatSessionsService.js';
import { getPromptsTypeForLanguageId, PromptsType, Target } from '../promptTypes.js';
import { IPromptsService } from '../service/promptsService.js';
import { Iterable } from '../../../../../../base/common/iterator.js';
import { IMapValue, ISequenceValue, IValue, IHeaderAttribute, parseCommaSeparatedList, PromptHeader, PromptHeaderAttributes } from '../promptFileParser.js';
import { getAttributeDefinition, getTarget, getValidAttributeNames, knownClaudeTools, knownGithubCopilotTools, IValueEntry, ClaudeHeaderAttributes, } from './promptFileAttributes.js';
import { localize } from '../../../../../../nls.js';
import { formatArrayValue, getQuotePreference } from '../utils/promptEditHelper.js';
import { HOOKS_BY_TARGET, HOOK_METADATA } from '../hookTypes.js';
import { HOOK_COMMAND_FIELD_DESCRIPTIONS } from '../hookSchema.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';

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
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
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
			// Check if the position is inside a multi-line attribute (e.g., hooks map).
			// In that case, provide value completions for that attribute instead of attribute name completions.
			let containingAttribute = header.attributes.find(({ range }) =>
				range.startLineNumber < position.lineNumber && position.lineNumber <= range.endLineNumber);
			if (!containingAttribute) {
				// Handle trailing empty lines after a map-valued attribute:
				// The YAML parser's range ends at the last parsed child, but logically
				// an empty line before the next attribute still belongs to the map.
				for (let i = header.attributes.length - 1; i >= 0; i--) {
					const attr = header.attributes[i];
					if (attr.range.endLineNumber < position.lineNumber && attr.value.type === 'map') {
						const nextAttr = header.attributes[i + 1];
						const nextStartLine = nextAttr ? nextAttr.range.startLineNumber : headerRange.endLineNumber;
						if (position.lineNumber < nextStartLine) {
							containingAttribute = attr;
						}
						break;
					}
				}
			}
			if (containingAttribute) {
				const attrLineText = model.getLineContent(containingAttribute.range.startLineNumber);
				const attrColonIndex = attrLineText.indexOf(':');
				if (attrColonIndex !== -1) {
					return this.provideValueCompletions(model, position, header, new Position(containingAttribute.range.startLineNumber, attrColonIndex + 1), promptType, containingAttribute);
				}
			}
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
		const getInsertText = async (key: string): Promise<string> => {
			if (colonPosition) {
				return key;
			}
			// For map-valued attributes, insert a snippet with the nested structure
			if (key === PromptHeaderAttributes.hooks && promptType === PromptsType.agent && target !== Target.Claude) {
				const hookNames = Object.keys(HOOKS_BY_TARGET[target] ?? HOOKS_BY_TARGET[Target.Undefined]);
				return `${key}:\n  \${1|${hookNames.join(',')}|}:\n    - type: command\n      command: "$2"`;
			}
			const valueSuggestions = await this.getValueSuggestions(promptType, key, target);
			if (valueSuggestions.length > 0) {
				return `${key}: \${0:${valueSuggestions[0].name}}`;
			} else {
				return `${key}: \$0`;
			}
		};


		for (const attribute of attributesToPropose) {
			const item: CompletionItem = {
				label: attribute,
				documentation: getAttributeDefinition(attribute, promptType, target)?.description,
				kind: CompletionItemKind.Property,
				insertText: await getInsertText(attribute),
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
		preFoundAttribute?: IHeaderAttribute,
	): Promise<CompletionList | undefined> {
		const suggestions: CompletionItem[] = [];
		const posLineNumber = position.lineNumber;
		const attribute = preFoundAttribute ?? header.attributes.find(({ range }) => range.startLineNumber <= posLineNumber && posLineNumber <= range.endLineNumber);
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
						if (target === Target.GitHubCopilot || this.environmentService.isSessionsWindow) {
							// for GitHub Copilot targets and the Sessions Window, we only suggest the known set of tools that are supported by GitHub Copilot, instead of all tools that the user has defined, because many tools won't work in these contexts and it would be frustrating for users to select a tool that doesn't work
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
					return (await this.promptsService.getCustomAgents(CancellationToken.None)).filter(a => a.enabled);
				});
			}
		}
		if (attribute.key === PromptHeaderAttributes.hooks) {
			if (attribute.value.type === 'map') {
				// Inside the hooks map — suggest hook event type names as sub-keys
				return this.provideHookEventCompletions(model, position, attribute.value, target);
			}
			// When hooks value is not yet a map (e.g., user is mid-edit on a nested line),
			// still provide hook event completions with no existing keys.
			if (position.lineNumber !== attribute.range.startLineNumber) {
				const emptyMap: IMapValue = { type: 'map', properties: [], range: attribute.value.range };
				return this.provideHookEventCompletions(model, position, emptyMap, target);
			}
		}
		const lineContent = model.getLineContent(attribute.range.startLineNumber);
		const whilespaceAfterColon = (lineContent.substring(colonPosition.column).match(/^\s*/)?.[0].length) ?? 0;
		const entries = await this.getValueSuggestions(promptType, attribute.key, target);
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
		if (attribute.key === PromptHeaderAttributes.hooks && promptType === PromptsType.agent) {
			const hookSnippet = [
				'',
				'  ${1|' + Object.keys(HOOKS_BY_TARGET[target] ?? HOOKS_BY_TARGET[Target.Undefined]).join(',') + '|}:',
				'    - type: command',
				'      command: "$2"'
			].join('\n');
			const item: CompletionItem = {
				label: localize('promptHeaderAutocompletion.newHook', "New Hook"),
				kind: CompletionItemKind.Snippet,
				insertText: whilespaceAfterColon === 0 ? ` ${hookSnippet}` : hookSnippet,
				insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
				range: new Range(position.lineNumber, colonPosition.column + whilespaceAfterColon + 1, position.lineNumber, model.getLineMaxColumn(position.lineNumber)),
			};
			suggestions.push(item);
		}
		return { suggestions };
	}

	/**
	 * Provides completions inside the `hooks:` map.
	 * Determines what to suggest based on nesting depth:
	 * - At hook event level: suggest event names (SessionStart, PreToolUse, etc.)
	 * - Inside a command object: suggest command fields (type, command, timeout, etc.)
	 */
	private provideHookEventCompletions(
		model: ITextModel,
		position: Position,
		hooksMap: IMapValue,
		target: Target,
	): CompletionList | undefined {
		// Check if the cursor is on the value side of an existing hook event key (e.g., "SessionEnd:|")
		// In that case, offer a command entry snippet instead of event name completions.
		const hookEventOnLine = hooksMap.properties.find(p => p.key.range.startLineNumber === position.lineNumber);
		if (hookEventOnLine) {
			const lineText = model.getLineContent(position.lineNumber);
			const colonIdx = lineText.indexOf(':');
			if (colonIdx !== -1 && position.column > colonIdx + 1) {
				const whilespaceAfterColon = (lineText.substring(colonIdx + 1).match(/^\s*/)?.[0].length) ?? 0;
				const commandSnippet = [
					'',
					'  - type: command',
					'    command: "$1"',
				].join('\n');
				return {
					suggestions: [{
						label: localize('promptHeaderAutocompletion.newCommand', "New Command"),
						documentation: localize('promptHeaderAutocompletion.newCommand.description', "Add a new command entry to this hook."),
						kind: CompletionItemKind.Snippet,
						insertText: whilespaceAfterColon === 0 ? ` ${commandSnippet}` : commandSnippet,
						insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
						range: new Range(position.lineNumber, colonIdx + 1 + whilespaceAfterColon + 1, position.lineNumber, model.getLineMaxColumn(position.lineNumber)),
					}]
				};
			}
		}

		// Try to provide command field completions if cursor is inside a command object
		const commandFieldCompletions = this.provideHookCommandFieldCompletions(model, position, hooksMap, target);
		if (commandFieldCompletions) {
			return commandFieldCompletions;
		}

		// Otherwise provide hook event name completions
		const suggestions: CompletionItem[] = [];
		const hooksByTarget = HOOKS_BY_TARGET[target] ?? HOOKS_BY_TARGET[Target.Undefined];

		const lineText = model.getLineContent(position.lineNumber);
		const firstNonWhitespace = lineText.search(/\S/);
		const isEmptyLine = firstNonWhitespace === -1;
		// Start the range after leading whitespace so VS Code's completion
		// filtering matches the hook name prefix the user has typed.
		const rangeStartColumn = isEmptyLine ? position.column : firstNonWhitespace + 1;

		// Exclude hook keys on the current line so the user sees all options while editing a key
		const existingKeys = new Set(
			hooksMap.properties
				.filter(p => p.key.range.startLineNumber !== position.lineNumber)
				.map(p => p.key.value)
		);

		// Supplement with text-based scanning: when incomplete YAML causes the
		// parser to drop subsequent keys, scan the model for lines that look
		// like hook event entries (e.g., "  UserPromptSubmit:") at the expected
		// indentation.
		const expectedIndent = hooksMap.properties.length > 0
			? hooksMap.properties[0].key.range.startColumn - 1
			: -1;
		if (expectedIndent >= 0) {
			const scanEnd = model.getLineCount();
			for (let lineNum = hooksMap.range.endLineNumber + 1; lineNum <= scanEnd; lineNum++) {
				if (lineNum === position.lineNumber) {
					continue;
				}
				const lt = model.getLineContent(lineNum);
				const lineIndent = lt.search(/\S/);
				if (lineIndent === -1) {
					continue;
				}
				if (lineIndent < expectedIndent) {
					break; // Left the hooks map scope
				}
				if (lineIndent === expectedIndent) {
					const match = lt.match(/^\s+(\S+)\s*:/);
					if (match) {
						existingKeys.add(match[1]);
					}
				}
			}
		}

		// Check whether the current line already has a colon (editing an existing key)
		const lineHasColon = lineText.indexOf(':') !== -1;

		for (const [hookName, hookType] of Object.entries(hooksByTarget)) {
			if (existingKeys.has(hookName)) {
				continue;
			}
			const meta = HOOK_METADATA[hookType];
			let insertText: string;
			if (isEmptyLine) {
				// On empty lines, insert a full hook snippet with command placeholder
				insertText = [
					`${hookName}:`,
					`  - type: command`,
					`    command: "$1"`,
				].join('\n');
			} else if (lineHasColon) {
				// On existing key lines, only replace the key name to preserve nested content
				insertText = `${hookName}:`;
			} else {
				// Typing a new event name — omit the colon so the user can
				// trigger the next completion (e.g., New Command snippet) by typing ':'
				insertText = hookName;
			}
			suggestions.push({
				label: hookName,
				documentation: meta?.description,
				kind: CompletionItemKind.Property,
				insertText,
				insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
				range: new Range(position.lineNumber, rangeStartColumn, position.lineNumber, model.getLineMaxColumn(position.lineNumber)),
			});
		}

		return { suggestions };
	}

	/**
	 * Provides completions for hook command fields (type, command, windows, etc.)
	 * when the cursor is inside a command object within the hooks map.
	 * Detects nesting by checking if the position falls within a sequence item
	 * of a hook event's value.
	 */
	private provideHookCommandFieldCompletions(
		model: ITextModel,
		position: Position,
		hooksMap: IMapValue,
		target: Target,
	): CompletionList | undefined {
		// Find which hook event's command list the cursor is in
		const containingCommandMap = this.findContainingCommandMap(model, position, hooksMap);
		if (!containingCommandMap) {
			return undefined;
		}

		const isCopilotCli = target === Target.GitHubCopilot;
		const validFields = isCopilotCli
			? ['type', 'bash', 'powershell', 'cwd', 'env', 'timeoutSec']
			: ['type', 'command', 'windows', 'linux', 'osx', 'bash', 'powershell', 'cwd', 'env', 'timeout'];

		const existingFields = new Set(
			containingCommandMap.properties
				.filter(p => p.key.range.startLineNumber !== position.lineNumber)
				.map(p => p.key.value)
		);

		const lineText = model.getLineContent(position.lineNumber);
		const firstNonWhitespace = lineText.search(/\S/);
		const isEmptyLine = firstNonWhitespace === -1;
		// Skip past the YAML sequence indicator `- ` so the range starts at the
		// actual field name; otherwise VS Code's completion filter would see the
		// `- ` prefix and reject valid field names.
		const dashPrefixMatch = lineText.match(/^(\s*-\s+)/);
		const fieldStart = dashPrefixMatch ? dashPrefixMatch[1].length : firstNonWhitespace;
		const rangeStartColumn = isEmptyLine ? position.column : fieldStart + 1;
		const colonIndex = lineText.indexOf(':');

		const suggestions: CompletionItem[] = [];
		for (const fieldName of validFields) {
			if (existingFields.has(fieldName)) {
				continue;
			}
			const desc = HOOK_COMMAND_FIELD_DESCRIPTIONS[fieldName];
			const insertText = colonIndex !== -1 ? fieldName : `${fieldName}: $0`;
			suggestions.push({
				label: fieldName,
				documentation: desc,
				kind: CompletionItemKind.Property,
				insertText,
				insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
				range: new Range(position.lineNumber, rangeStartColumn, position.lineNumber, colonIndex !== -1 ? colonIndex + 1 : model.getLineMaxColumn(position.lineNumber)),
			});
		}

		return suggestions.length > 0 ? { suggestions } : undefined;
	}

	/**
	 * Walks the hooks map AST to find the command map object containing the position.
	 * Handles both direct command objects and nested matcher format.
	 * Also handles trailing lines after the last parsed property of a command map.
	 */
	private findContainingCommandMap(model: ITextModel, position: Position, hooksMap: IMapValue): IMapValue | undefined {
		for (let i = 0; i < hooksMap.properties.length; i++) {
			const prop = hooksMap.properties[i];
			if (prop.value.type !== 'sequence') {
				continue;
			}
			// Check if cursor is within the sequence's range, or on a trailing line after it
			const seqRange = prop.value.range;
			const nextProp = hooksMap.properties[i + 1];
			const isInSeq = seqRange.containsPosition(position);
			const isTrailingSeq = !isInSeq
				&& seqRange.endLineNumber < position.lineNumber
				&& (!nextProp || nextProp.key.range.startLineNumber > position.lineNumber);

			if (isInSeq || isTrailingSeq) {
				// For trailing lines, verify the cursor is indented deeper than
				// the hook event key — otherwise it belongs to the parent map.
				if (isTrailingSeq) {
					const lineText = model.getLineContent(position.lineNumber);
					const firstNonWs = lineText.search(/\S/);
					const effectiveIndent = firstNonWs === -1 ? position.column - 1 : firstNonWs;
					const hookKeyIndent = prop.key.range.startColumn - 1;
					if (effectiveIndent <= hookKeyIndent) {
						continue;
					}
				}
				const result = this.findCommandMapInSequence(position, prop.value);
				if (result) {
					return result;
				}
			}
		}
		return undefined;
	}

	private findCommandMapInSequence(position: Position, sequence: ISequenceValue): IMapValue | undefined {
		for (let i = 0; i < sequence.items.length; i++) {
			const item = sequence.items[i];
			if (item.type !== 'map') {
				// Handle partial typing: a scalar on the cursor line means the user
				// is starting to type a command entry (e.g., "- t").
				if (item.type === 'scalar' && item.range.startLineNumber === position.lineNumber) {
					return { type: 'map', properties: [], range: item.range };
				}
				continue;
			}

			// Check if position is within or just after this map item's parsed range.
			// The parser's range may not include a trailing line being typed.
			const isInRange = item.range.containsPosition(position);
			const isTrailing = !isInRange
				&& item.range.endLineNumber < position.lineNumber
				&& (i + 1 >= sequence.items.length || sequence.items[i + 1].range.startLineNumber > position.lineNumber);

			if (!isInRange && !isTrailing) {
				continue;
			}

			// Check for nested matcher format: { hooks: [...] }
			const nestedHooks = item.properties.find(p => p.key.value === 'hooks');
			if (nestedHooks?.value.type === 'sequence') {
				const result = this.findCommandMapInSequence(position, nestedHooks.value);
				if (result) {
					return result;
				}
			}
			return item;
		}
		return undefined;
	}

	private async getValueSuggestions(promptType: PromptsType, attribute: string, target: Target): Promise<readonly IValueEntry[]> {
		const attributeDesc = getAttributeDefinition(attribute, promptType, target);
		if (attributeDesc?.enums) {
			return attributeDesc.enums;
		}
		if (attributeDesc?.defaults) {
			return attributeDesc.defaults.map(value => ({ name: value }));
		}
		switch (attribute) {
			case PromptHeaderAttributes.agent:
			case PromptHeaderAttributes.mode:
				if (promptType === PromptsType.prompt) {
					// Get all available agents (builtin + custom)
					const agents = await this.chatModeService.awaitModes(localChatSessionType);
					const suggestions: IValueEntry[] = [];
					for (const agent of Iterable.concat(agents.builtin, agents.custom)) {
						suggestions.push({ name: agent.name.get(), description: agent.label.get() });
					}
					return suggestions;
				}
				break;
			case PromptHeaderAttributes.model:
				if (promptType === PromptsType.prompt || promptType === PromptsType.agent) {
					return this.getModelNames(promptType === PromptsType.agent);
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
