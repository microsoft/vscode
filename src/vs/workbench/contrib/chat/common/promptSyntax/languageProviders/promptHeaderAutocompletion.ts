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
import { getPromptsTypeForLanguageId, PromptsType, Target } from '../promptTypes.js';
import { IPromptsService } from '../service/promptsService.js';
import { Iterable } from '../../../../../../base/common/iterator.js';
import { IMapValue, ISequenceValue, IValue, IHeaderAttribute, parseCommaSeparatedList, PromptHeader, PromptHeaderAttributes } from '../promptFileParser.js';
import { getAttributeDefinition, getTarget, getValidAttributeNames, githubCopilotGithubProperties, GithubPromptHeaderAttributes, githubCopilotMcpLocalServerProperties, githubCopilotMcpRemoteServerProperties, IAttributeDefinition, knownClaudeTools, knownGithubCopilotToolNamespaces, knownGithubCopilotTools, IValueEntry, ClaudeHeaderAttributes, } from './promptFileAttributes.js';
import { localize } from '../../../../../../nls.js';
import { formatArrayValue, getQuotePreference } from '../utils/promptEditHelper.js';
import { getAgentHookMetadata, getCanonicalAgentHookName, getValidAgentHookNames } from '../hookTypes.js';
import { HOOK_COMMAND_FIELD_DESCRIPTIONS } from '../hookSchema.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { ICustomizationHarnessService } from '../../customizationHarnessService.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { getAgentFileModelReasoningEfforts, resolveAgentFileModelIdentifiers, resolveAgentFileModels } from './promptModelResolver.js';
import { getEffectiveAgentFileToolAvailability, resolveAgentFileTools, type IAgentFileTool } from './promptToolResolver.js';

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
		@ICustomizationHarnessService private readonly customizationHarnessService: ICustomizationHarnessService,
		@ILogService private readonly logService: ILogService,
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
					const target = this.getTarget(promptType, header);
					const definition = getAttributeDefinition(attr.key, promptType, target);
					const acceptedTypes = definition && (typeof definition.type === 'string' ? [definition.type] : definition.type);
					if (attr.range.endLineNumber < position.lineNumber && (attr.value.type === 'map' || acceptedTypes?.includes('map'))) {
						const nextAttr = header.attributes[i + 1];
						const nextStartLine = nextAttr ? nextAttr.range.startLineNumber : headerRange.endLineNumber;
						const currentIndent = this.getLineIndent(model.getLineContent(position.lineNumber), position);
						if (position.lineNumber < nextStartLine && currentIndent > attr.range.startColumn - 1) {
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
					return this.provideValueCompletions(model, position, header, new Position(containingAttribute.range.startLineNumber, attrColonIndex + 1), promptType, token, containingAttribute);
				}
			}


			return this.provideAttributeNameCompletions(model, position, header, colonPosition, promptType);
		} else if (colonPosition && colonPosition.isBefore(position)) {
			return this.provideValueCompletions(model, position, header, colonPosition, promptType, token);
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

		const target = this.getTarget(promptType, header);
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
				const hookNames = getValidAgentHookNames(target, false);
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
		token: CancellationToken,
		preFoundAttribute?: IHeaderAttribute,
	): Promise<CompletionList | undefined> {
		const suggestions: CompletionItem[] = [];
		const posLineNumber = position.lineNumber;
		const attribute = preFoundAttribute ?? header.attributes.find(({ range }) => range.startLineNumber <= posLineNumber && posLineNumber <= range.endLineNumber);
		if (!attribute) {
			return undefined;
		}
		const target = this.getTarget(promptType, header);
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
							return this.getModelNames(promptType === PromptsType.agent, target);
						}
					};
					return this.provideArrayCompletions(model, position, attribute.value, getValues);
				}
			}
			if (attribute.key === PromptHeaderAttributes.reasoningEffort && promptType === PromptsType.agent && target === Target.GitHubCopilot) {
				const catalogue = resolveAgentFileModels(target, this.customizationHarnessService, this.languageModelsService);
				const selectedModels = (header.model ?? [])
					.flatMap(model => resolveAgentFileModelIdentifiers(model, catalogue.models));
				const efforts = new Set(selectedModels.flatMap(model => getAgentFileModelReasoningEfforts(model)));
				return this.provideSimpleValueCompletions(model, position, colonPosition, Array.from(efforts));
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
							const catalogue = await resolveAgentFileTools(target, this.customizationHarnessService, this.logService, token);
							const suggestions = new Map<string, IValueEntry>();
							const toolsByName = new Map<string, IAgentFileTool[]>();
							for (const tool of catalogue.tools) {
								const matches = toolsByName.get(tool.name) ?? [];
								matches.push(tool);
								toolsByName.set(tool.name, matches);
							}
							for (const [name, matches] of toolsByName) {
								const availability = getEffectiveAgentFileToolAvailability(matches);
								const availabilityLabel = availability === 'disabled'
									? localize('promptHeaderAutocompletion.toolDisabled', "Disabled")
									: availability === 'unavailable'
										? localize('promptHeaderAutocompletion.toolUnavailable', "Unavailable")
										: undefined;
								const description = [matches.find(tool => tool.description)?.description, availabilityLabel].filter(Boolean).join(' — ');
								suggestions.set(name, { name, ...(description ? { description } : {}) });
							}
							for (const namespace of knownGithubCopilotToolNamespaces) {
								if (!suggestions.has(namespace.name)) {
									suggestions.set(namespace.name, namespace);
								}
							}
							return [...suggestions.values()];
						} else if (this.environmentService.isSessionsWindow) {
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
		if (target === Target.GitHubCopilot && attribute.key === GithubPromptHeaderAttributes.github) {
			const value = attribute.value.type === 'map' ? attribute.value : { type: 'map', properties: [], range: attribute.value.range } satisfies IMapValue;
			return this.provideMapPropertyCompletions(model, position, value, githubCopilotGithubProperties);
		}
		if (target === Target.GitHubCopilot && attribute.key === GithubPromptHeaderAttributes.mcpServers) {
			const value = attribute.value.type === 'map' ? attribute.value : { type: 'map', properties: [], range: attribute.value.range } satisfies IMapValue;
			return this.provideMcpServerCompletions(model, position, value);
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
				'  ${1|' + getValidAgentHookNames(target, false).join(',') + '|}:',
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

	private provideMcpServerCompletions(model: ITextModel, position: Position, servers: IMapValue): CompletionList | undefined {
		for (let index = 0; index < servers.properties.length; index++) {
			const server = servers.properties[index];
			const nextServer = servers.properties[index + 1];
			const serverValue = server.value.type === 'map'
				? server.value
				: { type: 'map', properties: [], range: server.value.range } satisfies IMapValue;
			const isInServer = serverValue.range.containsPosition(position);
			const isTrailingServer = !isInServer
				&& serverValue.range.endLineNumber < position.lineNumber
				&& (!nextServer || nextServer.key.range.startLineNumber > position.lineNumber);
			if (!isInServer && !isTrailingServer) {
				continue;
			}

			const currentIndent = this.getLineIndent(model.getLineContent(position.lineNumber), position);
			if (currentIndent <= server.key.range.startColumn - 1) {
				continue;
			}
			const typeProperty = serverValue.properties.find(property => property.key.value === 'type');
			const type = typeProperty?.value.type === 'scalar' ? typeProperty.value.value : undefined;
			const isRemote = serverValue.properties.some(property => property.key.value === 'url') || type === 'http' || type === 'sse';
			const isLocal = serverValue.properties.some(property => property.key.value === 'command') || type === 'local' || type === 'stdio';
			let definitions: Record<string, IAttributeDefinition>;
			if (isRemote) {
				definitions = githubCopilotMcpRemoteServerProperties;
			} else if (isLocal) {
				definitions = githubCopilotMcpLocalServerProperties;
			} else {
				definitions = {
					...githubCopilotMcpLocalServerProperties,
					...githubCopilotMcpRemoteServerProperties,
					type: {
						...githubCopilotMcpLocalServerProperties.type,
						enums: [
							...(githubCopilotMcpLocalServerProperties.type.enums ?? []),
							...(githubCopilotMcpRemoteServerProperties.type.enums ?? []),
						],
					},
				};
			}
			return this.provideMapPropertyCompletions(model, position, serverValue, definitions);
		}
		return undefined;
	}

	private provideMapPropertyCompletions(
		model: ITextModel,
		position: Position,
		map: IMapValue,
		definitions: Record<string, IAttributeDefinition>,
	): CompletionList | undefined {
		const currentProperty = map.properties.find(property => property.key.range.startLineNumber === position.lineNumber);
		const lineText = model.getLineContent(position.lineNumber);
		const colonIndex = lineText.indexOf(':');
		if (currentProperty && colonIndex !== -1 && position.column > colonIndex + 1) {
			const definition = definitions[currentProperty.key.value];
			if (!definition?.enums) {
				return undefined;
			}
			const valueStartColumn = colonIndex + 2 + (lineText.substring(colonIndex + 1).match(/^\s*/)?.[0].length ?? 0);
			const insertPrefix = valueStartColumn === colonIndex + 2 ? ' ' : '';
			return {
				suggestions: definition.enums.map(entry => ({
					label: entry.name,
					documentation: entry.description,
					kind: CompletionItemKind.Value,
					insertText: insertPrefix + entry.name,
					range: new Range(position.lineNumber, valueStartColumn, position.lineNumber, model.getLineMaxColumn(position.lineNumber)),
				}))
			};
		}

		const propertyIndent = map.properties[0]?.key.range.startColumn - 1;
		const currentIndent = this.getLineIndent(lineText, position);
		if (propertyIndent !== undefined && currentIndent > propertyIndent) {
			return undefined;
		}
		const existingProperties = new Set(
			map.properties
				.filter(property => property.key.range.startLineNumber !== position.lineNumber)
				.map(property => property.key.value)
		);
		const firstNonWhitespace = lineText.search(/\S/);
		const rangeStartColumn = firstNonWhitespace === -1 ? position.column : firstNonWhitespace + 1;
		const rangeEndColumn = colonIndex === -1 ? model.getLineMaxColumn(position.lineNumber) : colonIndex + 1;
		const suggestions: CompletionItem[] = [];
		for (const [name, definition] of Object.entries(definitions)) {
			if (existingProperties.has(name)) {
				continue;
			}
			const defaultValue = definition.enums?.[0]?.name;
			suggestions.push({
				label: name,
				documentation: definition.description,
				kind: CompletionItemKind.Property,
				insertText: colonIndex === -1 ? `${name}: ${defaultValue ? `\${0:${defaultValue}}` : '$0'}` : name,
				insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
				range: new Range(position.lineNumber, rangeStartColumn, position.lineNumber, rangeEndColumn),
			});
		}
		return suggestions.length > 0 ? { suggestions } : undefined;
	}

	private getLineIndent(lineText: string, position: Position): number {
		const firstNonWhitespace = lineText.search(/\S/);
		return firstNonWhitespace === -1 ? position.column - 1 : firstNonWhitespace;
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
				const range = new Range(position.lineNumber, colonIdx + 1 + whilespaceAfterColon + 1, position.lineNumber, model.getLineMaxColumn(position.lineNumber));
				const suggestions: CompletionItem[] = [{
					label: localize('promptHeaderAutocompletion.newCommand', "New Command"),
					documentation: localize('promptHeaderAutocompletion.newCommand.description', "Add a new command action to this hook."),
					kind: CompletionItemKind.Snippet,
					insertText: whilespaceAfterColon === 0 ? ` ${commandSnippet}` : commandSnippet,
					insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
					range,
				}];
				if (target === Target.GitHubCopilot) {
					const httpSnippet = [
						'',
						'  - type: http',
						'    url: "$1"',
					].join('\n');
					suggestions.push({
						label: localize('promptHeaderAutocompletion.newHttpHook', "New HTTP Action"),
						documentation: localize('promptHeaderAutocompletion.newHttpHook.description', "Add a new HTTP action to this hook."),
						kind: CompletionItemKind.Snippet,
						insertText: whilespaceAfterColon === 0 ? ` ${httpSnippet}` : httpSnippet,
						insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
						range,
					});
					if (hookEventOnLine.key.value === 'sessionStart' || hookEventOnLine.key.value === 'SessionStart') {
						const promptSnippet = [
							'',
							'  - type: prompt',
							'    prompt: "$1"',
						].join('\n');
						suggestions.push({
							label: localize('promptHeaderAutocompletion.newPromptHook', "New Prompt Action"),
							documentation: localize('promptHeaderAutocompletion.newPromptHook.description', "Add a startup prompt action to this hook."),
							kind: CompletionItemKind.Snippet,
							insertText: whilespaceAfterColon === 0 ? ` ${promptSnippet}` : promptSnippet,
							insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
							range,
						});
					}
				}
				return {
					suggestions
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
		const hookNames = getValidAgentHookNames(target, false);

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

		for (const hookName of hookNames) {
			if (existingKeys.has(hookName)) {
				continue;
			}
			const meta = getAgentHookMetadata(target, hookName);
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
		const containingAction = this.findContainingCommandMap(model, position, hooksMap);
		if (!containingAction) {
			return undefined;
		}
		const { action, eventName } = containingAction;

		const isCopilotCli = target === Target.GitHubCopilot;
		const currentProperty = action.properties.find(property => property.key.range.startLineNumber === position.lineNumber);
		if (isCopilotCli && currentProperty?.key.value === 'type') {
			const lineText = model.getLineContent(position.lineNumber);
			const colonIndex = lineText.indexOf(':');
			if (colonIndex !== -1 && position.column > colonIndex + 1) {
				const values = getCanonicalAgentHookName(target, eventName) === 'sessionStart'
					? ['command', 'http', 'prompt']
					: ['command', 'http'];
				const valueStartColumn = colonIndex + 2 + (lineText.substring(colonIndex + 1).match(/^\s*/)?.[0].length ?? 0);
				const insertPrefix = valueStartColumn === colonIndex + 2 ? ' ' : '';
				return {
					suggestions: values.map(value => ({
						label: value,
						kind: CompletionItemKind.Value,
						insertText: insertPrefix + value,
						range: new Range(position.lineNumber, valueStartColumn, position.lineNumber, model.getLineMaxColumn(position.lineNumber)),
					}))
				};
			}
		}

		let validFields: readonly string[];
		if (isCopilotCli) {
			const type = action.properties.find(property => property.key.value === 'type')?.value;
			const actionType = type?.type === 'scalar' ? type.value : 'command';
			switch (actionType) {
				case 'http':
					validFields = ['type', 'url', 'headers', 'allowedEnvVars', 'timeoutSec', 'timeout', 'matcher'];
					break;
				case 'prompt':
					validFields = getCanonicalAgentHookName(target, eventName) === 'sessionStart' ? ['type', 'prompt'] : ['type'];
					break;
				default:
					validFields = ['type', 'bash', 'powershell', 'command', 'windows', 'linux', 'osx', 'exec', 'args', 'cwd', 'env', 'timeoutSec', 'timeout', 'matcher'];
			}
		} else {
			validFields = ['type', 'command', 'windows', 'linux', 'osx', 'bash', 'powershell', 'cwd', 'env', 'timeout'];
		}

		const existingFields = new Set(
			action.properties
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
	private findContainingCommandMap(model: ITextModel, position: Position, hooksMap: IMapValue): { readonly action: IMapValue; readonly eventName: string } | undefined {
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
					return { action: result, eventName: prop.key.value };
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
					const agents = await this.chatModeService.getLocalModes();
					const suggestions: IValueEntry[] = [];
					for (const agent of Iterable.concat(agents.builtin, agents.custom)) {
						suggestions.push({ name: agent.name.get(), description: agent.label.get() });
					}
					return suggestions;
				}
				break;
			case PromptHeaderAttributes.model:
				if (promptType === PromptsType.prompt || promptType === PromptsType.agent) {
					return this.getModelNames(promptType === PromptsType.agent, target);
				}
				break;

		}
		return [];
	}

	private getTarget(promptType: PromptsType, header: PromptHeader): Target {
		return getTarget(promptType, header, this.customizationHarnessService.getActiveDescriptor().customAgentTarget);
	}

	private getModelNames(agentModeOnly: boolean, target: Target): IValueEntry[] {
		if (agentModeOnly && target === Target.GitHubCopilot) {
			const suggestions = new Map<string, IValueEntry>();
			for (const model of resolveAgentFileModels(target, this.customizationHarnessService, this.languageModelsService).models) {
				if (!suggestions.has(model.id)) {
					suggestions.set(model.id, {
						name: model.id,
						description: model.metadata.tooltip ?? model.metadata.name,
					});
				}
			}
			return Array.from(suggestions.values());
		}
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

	private provideSimpleValueCompletions(model: ITextModel, position: Position, colonPosition: Position, values: readonly string[]): CompletionList | undefined {
		if (values.length === 0) {
			return undefined;
		}
		const lineContent = model.getLineContent(position.lineNumber);
		const whitespaceAfterColon = lineContent.substring(colonPosition.column).match(/^\s*/)?.[0].length ?? 0;
		return {
			suggestions: values.map(value => ({
				label: value,
				kind: CompletionItemKind.Value,
				insertText: whitespaceAfterColon === 0 ? ` ${value}` : value,
				range: new Range(position.lineNumber, colonPosition.column + whitespaceAfterColon + 1, position.lineNumber, model.getLineMaxColumn(position.lineNumber)),
			}))
		};
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
