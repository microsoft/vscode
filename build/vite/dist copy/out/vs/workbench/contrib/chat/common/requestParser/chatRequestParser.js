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
import { Position } from '../../../../../editor/common/core/position.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { OffsetRange } from '../../../../../editor/common/core/ranges/offsetRange.js';
import { IChatVariablesService } from '../attachments/chatVariables.js';
import { ChatAgentLocation, ChatModeKind } from '../constants.js';
import { IChatAgentService } from '../participants/chatAgents.js';
import { IChatSlashCommandService } from '../participants/chatSlashCommands.js';
import { IPromptsService } from '../promptSyntax/service/promptsService.js';
import { isToolSet } from '../tools/languageModelToolsService.js';
import { ChatRequestAgentPart, ChatRequestAgentSubcommandPart, ChatRequestDynamicVariablePart, ChatRequestSlashCommandPart, ChatRequestSlashPromptPart, ChatRequestTextPart, ChatRequestToolPart, ChatRequestToolSetPart, chatAgentLeader, chatSubcommandLeader, chatVariableLeader } from './chatParserTypes.js';
export const agentReg = /^@([\w_\-\.]+)(?=(\s|$|\b))/i; // An @-agent
export const variableReg = /^#([\w_\-]+)(:\d+)?(?=(\s|$|\b))/i; // A #-variable with an optional numeric : arg (@response:2)
export const slashReg = /^\/([\p{L}\d_\-\.:]+)(?=(\s|$|\b))/iu; // A / command
let ChatRequestParser = class ChatRequestParser {
    constructor(agentService, variableService, slashCommandService, promptsService) {
        this.agentService = agentService;
        this.variableService = variableService;
        this.slashCommandService = slashCommandService;
        this.promptsService = promptsService;
    }
    parseChatRequest(sessionResource, message, location = ChatAgentLocation.Chat, context) {
        const references = this.variableService.getDynamicVariables(sessionResource); // must access this list before any async calls
        const selectedToolAndToolSets = this.variableService.getSelectedToolAndToolSets(sessionResource);
        return this.parseChatRequestWithReferences(references, selectedToolAndToolSets, message, location, context);
    }
    parseChatRequestWithReferences(references, selectedToolAndToolSets, message, location = ChatAgentLocation.Chat, context) {
        const parts = [];
        const toolsByName = new Map();
        const toolSetsByName = new Map();
        for (const [entry, enabled] of selectedToolAndToolSets) {
            if (enabled) {
                if (isToolSet(entry)) {
                    toolSetsByName.set(entry.referenceName, entry);
                }
                else {
                    toolsByName.set(entry.toolReferenceName ?? entry.displayName, entry);
                }
            }
        }
        let lineNumber = 1;
        let column = 1;
        for (let i = 0; i < message.length; i++) {
            const previousChar = message.charAt(i - 1);
            const char = message.charAt(i);
            let newPart;
            if (previousChar.match(/\s/) || i === 0) {
                if (char === chatVariableLeader) {
                    newPart = this.tryToParseVariable(message.slice(i), i, new Position(lineNumber, column), parts, toolsByName, toolSetsByName);
                }
                else if (char === chatAgentLeader) {
                    newPart = this.tryToParseAgent(message.slice(i), message, i, new Position(lineNumber, column), parts, location, context);
                }
                else if (char === chatSubcommandLeader) {
                    newPart = this.tryToParseSlashCommand(message.slice(i), message, i, new Position(lineNumber, column), parts, location, context);
                }
                if (!newPart) {
                    newPart = this.tryToParseDynamicVariable(message.slice(i), i, new Position(lineNumber, column), references);
                }
            }
            if (newPart) {
                if (i !== 0) {
                    // Insert a part for all the text we passed over, then insert the new parsed part
                    const previousPart = parts.at(-1);
                    const previousPartEnd = previousPart?.range.endExclusive ?? 0;
                    const previousPartEditorRangeEndLine = previousPart?.editorRange.endLineNumber ?? 1;
                    const previousPartEditorRangeEndCol = previousPart?.editorRange.endColumn ?? 1;
                    parts.push(new ChatRequestTextPart(new OffsetRange(previousPartEnd, i), new Range(previousPartEditorRangeEndLine, previousPartEditorRangeEndCol, lineNumber, column), message.slice(previousPartEnd, i)));
                }
                parts.push(newPart);
            }
            if (char === '\n') {
                lineNumber++;
                column = 1;
            }
            else {
                column++;
            }
        }
        const lastPart = parts.at(-1);
        const lastPartEnd = lastPart?.range.endExclusive ?? 0;
        if (lastPartEnd < message.length) {
            parts.push(new ChatRequestTextPart(new OffsetRange(lastPartEnd, message.length), new Range(lastPart?.editorRange.endLineNumber ?? 1, lastPart?.editorRange.endColumn ?? 1, lineNumber, column), message.slice(lastPartEnd, message.length)));
        }
        return {
            parts,
            text: message,
        };
    }
    tryToParseAgent(message, fullMessage, offset, position, parts, location, context) {
        const nextAgentMatch = message.match(agentReg);
        if (!nextAgentMatch) {
            return;
        }
        const [full, name] = nextAgentMatch;
        const agentRange = new OffsetRange(offset, offset + full.length);
        const agentEditorRange = new Range(position.lineNumber, position.column, position.lineNumber, position.column + full.length);
        let agents = this.agentService.getAgentsByName(name);
        if (!agents.length) {
            const fqAgent = this.agentService.getAgentByFullyQualifiedId(name);
            if (fqAgent) {
                agents = [fqAgent];
            }
        }
        // If there is more than one agent with this name, and the user picked it from the suggest widget, then the selected agent should be in the
        // context and we use that one.
        const agent = agents.length > 1 && context?.selectedAgent ?
            context.selectedAgent :
            agents.find((a) => a.locations.includes(location));
        if (!agent) {
            return;
        }
        if (context?.mode && !agent.modes.includes(context.mode)) {
            return;
        }
        if (parts.some(p => p instanceof ChatRequestAgentPart)) {
            // Only one agent allowed
            return;
        }
        // The agent must come first
        if (parts.some(p => (p instanceof ChatRequestTextPart && p.text.trim() !== '') || !(p instanceof ChatRequestAgentPart))) {
            return;
        }
        const previousPart = parts.at(-1);
        const previousPartEnd = previousPart?.range.endExclusive ?? 0;
        const textSincePreviousPart = fullMessage.slice(previousPartEnd, offset);
        if (textSincePreviousPart.trim() !== '') {
            return;
        }
        return new ChatRequestAgentPart(agentRange, agentEditorRange, agent);
    }
    tryToParseVariable(message, offset, position, parts, toolsByName, toolSetsByName) {
        const nextVariableMatch = message.match(variableReg);
        if (!nextVariableMatch) {
            return;
        }
        const [full, name] = nextVariableMatch;
        const varRange = new OffsetRange(offset, offset + full.length);
        const varEditorRange = new Range(position.lineNumber, position.column, position.lineNumber, position.column + full.length);
        const tool = toolsByName.get(name);
        if (tool) {
            return new ChatRequestToolPart(varRange, varEditorRange, name, tool.id, tool.displayName, tool.icon);
        }
        const toolset = toolSetsByName.get(name);
        if (toolset) {
            const value = Array.from(toolset.getTools()).map(t => new ChatRequestToolPart(varRange, varEditorRange, t.toolReferenceName ?? t.displayName, t.id, t.displayName, t.icon).toVariableEntry());
            return new ChatRequestToolSetPart(varRange, varEditorRange, toolset.id, toolset.referenceName, toolset.icon, value);
        }
        return;
    }
    tryToParseSlashCommand(remainingMessage, fullMessage, offset, position, parts, location, context) {
        const nextSlashMatch = remainingMessage.match(slashReg);
        if (!nextSlashMatch) {
            return;
        }
        if (parts.some(p => !(p instanceof ChatRequestAgentPart) && !(p instanceof ChatRequestTextPart && p.text.trim() === ''))) {
            // no other part than agent or non-whitespace text allowed: that also means no other slash command
            return;
        }
        // only whitespace after the last part
        const previousPart = parts.at(-1);
        const previousPartEnd = previousPart?.range.endExclusive ?? 0;
        const textSincePreviousPart = fullMessage.slice(previousPartEnd, offset);
        if (textSincePreviousPart.trim() !== '') {
            return;
        }
        const [full, command] = nextSlashMatch;
        const slashRange = new OffsetRange(offset, offset + full.length);
        const slashEditorRange = new Range(position.lineNumber, position.column, position.lineNumber, position.column + full.length);
        const usedAgent = parts.find((p) => p instanceof ChatRequestAgentPart)?.agent ??
            (context?.forcedAgent ? context.forcedAgent : undefined);
        if (usedAgent) {
            const subCommand = usedAgent.slashCommands.find(c => c.name === command);
            if (subCommand) {
                // Valid agent subcommand
                return new ChatRequestAgentSubcommandPart(slashRange, slashEditorRange, subCommand);
            }
        }
        const capabilities = context?.attachmentCapabilities ?? usedAgent?.capabilities;
        const slashCommands = this.slashCommandService.getCommands(location, context?.mode ?? ChatModeKind.Ask);
        const slashCommand = slashCommands.find(c => c.command === command);
        // If there is no agent, we allow any slash command.
        // If there is an agent, we let
        // * silent ones go through since they are only UI-facing and don't influence chat history
        // * slash commands that support prompt attachments, since those are meant to be used in conjunction with an agent and we can assume the agent can handle them.
        if (!usedAgent || slashCommand?.silent || capabilities?.supportsPromptAttachments) {
            if (slashCommand) {
                // Valid standalone slash command
                return new ChatRequestSlashCommandPart(slashRange, slashEditorRange, slashCommand);
            }
            else {
                // check for with default agent for this location
                const defaultAgent = this.agentService.getDefaultAgent(location, context?.mode);
                const subCommand = defaultAgent?.slashCommands.find(c => c.name === command);
                if (subCommand) {
                    // Valid default agent subcommand
                    return new ChatRequestAgentSubcommandPart(slashRange, slashEditorRange, subCommand);
                }
            }
            // if there's no agent or attachments are supported, asume it is a prompt slash command
            const isPromptCommand = this.promptsService.isValidSlashCommandName(command);
            if (isPromptCommand) {
                return new ChatRequestSlashPromptPart(slashRange, slashEditorRange, command);
            }
        }
        return;
    }
    tryToParseDynamicVariable(message, offset, position, references) {
        const refAtThisPosition = references.find(r => r.range.startLineNumber === position.lineNumber &&
            r.range.startColumn === position.column);
        if (refAtThisPosition) {
            const length = refAtThisPosition.range.endColumn - refAtThisPosition.range.startColumn;
            const text = message.substring(0, length);
            const range = new OffsetRange(offset, offset + length);
            return new ChatRequestDynamicVariablePart(range, refAtThisPosition.range, text, refAtThisPosition.id, refAtThisPosition.modelDescription, refAtThisPosition.data, refAtThisPosition.fullName, refAtThisPosition.icon, refAtThisPosition.isFile, refAtThisPosition.isDirectory);
        }
        return;
    }
};
ChatRequestParser = __decorate([
    __param(0, IChatAgentService),
    __param(1, IChatVariablesService),
    __param(2, IChatSlashCommandService),
    __param(3, IPromptsService)
], ChatRequestParser);
export { ChatRequestParser };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFJlcXVlc3RQYXJzZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9yZXF1ZXN0UGFyc2VyL2NoYXRSZXF1ZXN0UGFyc2VyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBR2hHLE9BQU8sRUFBYSxRQUFRLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUNwRixPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDbkUsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxxQkFBcUIsRUFBb0IsTUFBTSxpQ0FBaUMsQ0FBQztBQUMxRixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsWUFBWSxFQUFFLE1BQU0saUJBQWlCLENBQUM7QUFDbEUsT0FBTyxFQUFvRCxpQkFBaUIsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3BILE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2hGLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUM1RSxPQUFPLEVBQXFELFNBQVMsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ3JILE9BQU8sRUFBRSxvQkFBb0IsRUFBRSw4QkFBOEIsRUFBRSw4QkFBOEIsRUFBRSwyQkFBMkIsRUFBRSwwQkFBMEIsRUFBRSxtQkFBbUIsRUFBRSxtQkFBbUIsRUFBRSxzQkFBc0IsRUFBOEMsZUFBZSxFQUFFLG9CQUFvQixFQUFFLGtCQUFrQixFQUFFLE1BQU0sc0JBQXNCLENBQUM7QUFFOVYsTUFBTSxDQUFDLE1BQU0sUUFBUSxHQUFHLDhCQUE4QixDQUFDLENBQUMsYUFBYTtBQUNyRSxNQUFNLENBQUMsTUFBTSxXQUFXLEdBQUcsbUNBQW1DLENBQUMsQ0FBQyw0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