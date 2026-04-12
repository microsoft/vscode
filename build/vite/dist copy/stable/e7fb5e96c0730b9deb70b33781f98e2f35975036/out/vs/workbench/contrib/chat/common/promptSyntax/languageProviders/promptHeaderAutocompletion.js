/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Position } from '../../../../../../editor/common/core/position.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { ILanguageModelChatMetadata, ILanguageModelsService } from '../../languageModels.js';
import { ILanguageModelToolsService } from '../../tools/languageModelToolsService.js';
import { IChatModeService } from '../../chatModes.js';
import { getPromptsTypeForLanguageId, PromptsType, Target } from '../promptTypes.js';
import { IPromptsService } from '../service/promptsService.js';
import { Iterable } from '../../../../../../base/common/iterator.js';
import { parseCommaSeparatedList, PromptHeaderAttributes } from '../promptFileParser.js';
import { getAttributeDefinition, getTarget, getValidAttributeNames, knownClaudeTools, knownGithubCopilotTools, ClaudeHeaderAttributes, } from './promptFileAttributes.js';
import { localize } from '../../../../../../nls.js';
import { formatArrayValue, getQuotePreference } from '../utils/promptEditHelper.js';
import { HOOKS_BY_TARGET, HOOK_METADATA } from '../hookTypes.js';
import { HOOK_COMMAND_FIELD_DESCRIPTIONS } from '../hookSchema.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { PromptsConfig } from '../config/config.js';
let PromptHeaderAutocompletion = class PromptHeaderAutocompletion {
    constructor(promptsService, languageModelsService, languageModelToolsService, chatModeService, environmentService, configurationService) {
        this.promptsService = promptsService;
        this.languageModelsService = languageModelsService;
        this.languageModelToolsService = languageModelToolsService;
        this.chatModeService = chatModeService;
        this.environmentService = environmentService;
        this.configurationService = configurationService;
        /**
         * Debug display name for this provider.
         */
        this._debugDisplayName = 'PromptHeaderAutocompletion';
        /**
         * List of trigger characters handled by this provider.
         */
        this.triggerCharacters = [':'];
    }
    /**
     * The main function of this provider that calculates
     * completion items based on the provided arguments.
     */
    async provideCompletionItems(model, position, context, token) {
        const promptType = getPromptsTypeForLanguageId(model.getLanguageId());
        if (!promptType) {
            // if the model is not a prompt, we don't provide any completions
            return undefined;
        }
        if (/^\s*$/.test(model.getValue())) {
            return {
                suggestions: [{
                        label: localize('promptHeaderAutocompletion.addHeader', "Add Prompt Header"),
                        kind: 28 /* CompletionItemKind.Snippet */,
                        insertText: [
                            `---`,
                            `description: $1`,
                            `---`,
                            `$0`
                        ].join('\n'),
                        insertTextRules: 4 /* CompletionItemInsertTextRule.InsertAsSnippet */,
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
            let containingAttribute = header.attributes.find(({ range }) => range.startLineNumber < position.lineNumber && position.lineNumber <= range.endLineNumber);
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
        }
        else if (colonPosition && colonPosition.isBefore(position)) {
            return this.provideValueCompletions(model, position, header, colonPosition, promptType);
        }
        return undefined;
    }
    async provideAttributeNameCompletions(model, position, header, colonPosition, promptType) {
        const suggestions = [];
        const target = getTarget(promptType, header);
        const attributesToPropose = new Set(getValidAttributeNames(promptType, false, target));
        if (!this.configurationService.getValue(PromptsConfig.USE_CUSTOM_AGENT_HOOKS)) {
            attributesToPropose.delete(PromptHeaderAttributes.hooks);
        }
        for (const attr of header.attributes) {
            attributesToPropose.delete(attr.key);
        }
        const getInsertText = (key) => {
            if (colonPosition) {
                return key;
            }
            // For map-valued attributes, insert a snippet with the nested structure
            if (key === PromptHeaderAttributes.hooks && promptType === PromptsType.agent && target !== Target.Claude) {
                const hookNames = Object.keys(HOOKS_BY_TARGET[target] ?? HOOKS_BY_TARGET[Target.Undefined]);
                return `${key}:\n  \${1|${hookNames.join(',')}|}:\n    - type: command\n      command: "$2"`;
            }
            const valueSuggestions = this.getValueSuggestions(promptType, key, target);
            if (valueSuggestions.length > 0) {
                return `${key}: \${0:${valueSuggestions[0].name}}`;
            }
            else {
                return `${key}: \$0`;
            }
        };
        for (const attribute of attributesToPropose) {
            const item = {
                label: attribute,
                documentation: getAttributeDefinition(attribute, promptType, target)?.description,
                kind: 9 /* CompletionItemKind.Property */,
                insertText: getInsertText(attribute),
                insertTextRules: 4 /* CompletionItemInsertTextRule.InsertAsSnippet */,
                range: new Range(position.lineNumber, 1, position.lineNumber, !colonPosition ? model.getLineMaxColumn(position.lineNumber) : colonPosition.column),
            };
            suggestions.push(item);
        }
        return { suggestions };
    }
    async provideValueCompletions(model, position, header, colonPosition, promptType, preFoundAttribute) {
        const suggestions = [];
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
                        }
                        else {
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
                        }
                        else if (target === Target.Claude) {
                            return knownClaudeTools;
                        }
                        else {
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
        if (attribute.key === PromptHeaderAttributes.hooks) {
            if (attribute.value.type === 'map') {
                // Inside the hooks map — suggest hook event type names as sub-keys
                return this.provideHookEventCompletions(model, position, attribute.value, target);
            }
            // When hooks value is not yet a map (e.g., user is mid-edit on a nested line),
            // still provide hook event completions with no existing keys.
            if (position.lineNumber !== attribute.range.startLineNumber) {
                const emptyMap = { type: 'map', properties: [], range: attribute.value.range };
                return this.provideHookEventCompletions(model, position, emptyMap, target);
            }
        }
        const lineContent = model.getLineContent(attribute.range.startLineNumber);
        const whilespaceAfterColon = (lineContent.substring(colonPosition.column).match(/^\s*/)?.[0].length) ?? 0;
        const entries = this.getValueSuggestions(promptType, attribute.key, target);
        for (const entry of entries) {
            const item = {
                label: entry.name,
                documentation: entry.description,
                kind: 13 /* CompletionItemKind.Value */,
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
            const item = {
                label: localize('promptHeaderAutocompletion.handoffsExample', "Handoff Example"),
                kind: 13 /* CompletionItemKind.Value */,
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
            const item = {
                label: localize('promptHeaderAutocompletion.newHook', "New Hook"),
                kind: 28 /* CompletionItemKind.Snippet */,
                insertText: whilespaceAfterColon === 0 ? ` ${hookSnippet}` : hookSnippet,
                insertTextRules: 4 /* CompletionItemInsertTextRule.InsertAsSnippet */,
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
    provideHookEventCompletions(model, position, hooksMap, target) {
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
                            kind: 28 /* CompletionItemKind.Snippet */,
                            insertText: whilespaceAfterColon === 0 ? ` ${commandSnippet}` : commandSnippet,
                            insertTextRules: 4 /* CompletionItemInsertTextRule.InsertAsSnippet */,
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
        const suggestions = [];
        const hooksByTarget = HOOKS_BY_TARGET[target] ?? HOOKS_BY_TARGET[Target.Undefined];
        const lineText = model.getLineContent(position.lineNumber);
        const firstNonWhitespace = lineText.search(/\S/);
        const isEmptyLine = firstNonWhitespace === -1;
        // Start the range after leading whitespace so VS Code's completion
        // filtering matches the hook name prefix the user has typed.
        const rangeStartColumn = isEmptyLine ? position.column : firstNonWhitespace + 1;
        // Exclude hook keys on the current line so the user sees all options while editing a key
        const existingKeys = new Set(hooksMap.properties
            .filter(p => p.key.range.startLineNumber !== position.lineNumber)
            .map(p => p.key.value));
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
            let insertText;
            if (isEmptyLine) {
                // On empty lines, insert a full hook snippet with command placeholder
                insertText = [
                    `${hookName}:`,
                    `  - type: command`,
                    `    command: "$1"`,
                ].join('\n');
            }
            else if (lineHasColon) {
                // On existing key lines, only replace the key name to preserve nested content
                insertText = `${hookName}:`;
            }
            else {
                // Typing a new event name — omit the colon so the user can
                // trigger the next completion (e.g., New Command snippet) by typing ':'
                insertText = hookName;
            }
            suggestions.push({
                label: hookName,
                documentation: meta?.description,
                kind: 9 /* CompletionItemKind.Property */,
                insertText,
                insertTextRules: 4 /* CompletionItemInsertTextRule.InsertAsSnippet */,
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
    provideHookCommandFieldCompletions(model, position, hooksMap, target) {
        // Find which hook event's command list the cursor is in
        const containingCommandMap = this.findContainingCommandMap(model, position, hooksMap);
        if (!containingCommandMap) {
            return undefined;
        }
        const isCopilotCli = target === Target.GitHubCopilot;
        const validFields = isCopilotCli
            ? ['type', 'bash', 'powershell', 'cwd', 'env', 'timeoutSec']
            : ['type', 'command', 'windows', 'linux', 'osx', 'bash', 'powershell', 'cwd', 'env', 'timeout'];
        const existingFields = new Set(containingCommandMap.properties
            .filter(p => p.key.range.startLineNumber !== position.lineNumber)
            .map(p => p.key.value));
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
        const suggestions = [];
        for (const fieldName of validFields) {
            if (existingFields.has(fieldName)) {
                continue;
            }
            const desc = HOOK_COMMAND_FIELD_DESCRIPTIONS[fieldName];
            const insertText = colonIndex !== -1 ? fieldName : `${fieldName}: $0`;
            suggestions.push({
                label: fieldName,
                documentation: desc,
                kind: 9 /* CompletionItemKind.Property */,
                insertText,
                insertTextRules: 4 /* CompletionItemInsertTextRule.InsertAsSnippet */,
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
    findContainingCommandMap(model, position, hooksMap) {
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
    findCommandMapInSequence(position, sequence) {
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
    getValueSuggestions(promptType, attribute, target) {
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
                    const agents = this.chatModeService.getModes();
                    const suggestions = [];
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
    getModelNames(agentModeOnly) {
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
    async provideArrayCompletions(model, position, arrayValue, getValues) {
        const getSuggestions = async (toolRange, currentItem) => {
            const suggestions = [];
            const entries = await getValues();
            const quotePreference = getQuotePreference(arrayValue, model);
            const existingValues = new Set(arrayValue.items.filter(item => item !== currentItem).filter(item => item.type === 'scalar').map(item => item.value));
            for (const entry of entries) {
                const entryName = entry.name;
                if (existingValues.has(entryName)) {
                    continue;
                }
                let insertText;
                if (!toolRange.isEmpty()) {
                    const firstChar = model.getValueInRange(toolRange).charCodeAt(0);
                    insertText = firstChar === 39 /* CharCode.SingleQuote */ ? `'${entryName}'` : firstChar === 34 /* CharCode.DoubleQuote */ ? `"${entryName}"` : entryName;
                }
                else {
                    insertText = formatArrayValue(entryName, quotePreference);
                }
                suggestions.push({
                    label: entryName,
                    documentation: entry.description,
                    kind: 13 /* CompletionItemKind.Value */,
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
};
PromptHeaderAutocompletion = __decorate([
    __param(0, IPromptsService),
    __param(1, ILanguageModelsService),
    __param(2, ILanguageModelToolsService),
    __param(3, IChatModeService),
    __param(4, IWorkbenchEnvironmentService),
    __param(5, IConfigurationService)
], PromptHeaderAutocompletion);
export { PromptHeaderAutocompletion };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvbXB0SGVhZGVyQXV0b2NvbXBsZXRpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9wcm9tcHRTeW50YXgvbGFuZ3VhZ2VQcm92aWRlcnMvcHJvbXB0SGVhZGVyQXV0b2NvbXBsZXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFFbEYsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQzVFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUd0RSxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUM3RixPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUN0RixPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUN0RCxPQUFPLEVBQUUsMkJBQTJCLEVBQUUsV0FBVyxFQUFFLE1BQU0sRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBQ3JGLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUMvRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDckUsT0FBTyxFQUF1RCx1QkFBdUIsRUFBZ0Isc0JBQXNCLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUM1SixPQUFPLEVBQUUsc0JBQXNCLEVBQUUsU0FBUyxFQUFFLHNCQUFzQixFQUFFLGdCQUFnQixFQUFFLHVCQUF1QixFQUFlLHNCQUFzQixHQUFHLE1BQU0sMkJBQTJCLENBQUM7QUFDdkwsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQ3BE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