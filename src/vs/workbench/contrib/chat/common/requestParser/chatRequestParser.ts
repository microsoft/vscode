/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { IPosition, Position } from '../../../../../editor/common/core/position.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { OffsetRange } from '../../../../../editor/common/core/ranges/offsetRange.js';
import { IChatAgentData, IChatAgentService } from '../participants/chatAgents.js';
import { ChatRequestAgentPart, ChatRequestAgentSubcommandPart, ChatRequestDynamicVariablePart, ChatRequestSlashCommandPart, ChatRequestSlashPromptPart, ChatRequestTextPart, ChatRequestToolPart, ChatRequestToolSetPart, IParsedChatRequest, IParsedChatRequestPart, chatAgentLeader, chatSubcommandLeader, chatVariableLeader } from './chatParserTypes.js';
import { IChatSlashCommandService } from '../participants/chatSlashCommands.js';
import { IChatVariablesService, IDynamicVariable } from '../attachments/chatVariables.js';
import { ChatAgentLocation, ChatModeKind } from '../constants.js';
import { IToolData, ToolSet } from '../tools/languageModelToolsService.js';
import { IPromptsService } from '../promptSyntax/service/promptsService.js';

const agentReg = /^@([\w_\-\.]+)(?=(\s|$|\b))/i; // An @-agent
const variableReg = /^#([\w_\-]+)(:\d+)?(?=(\s|$|\b))/i; // A #-variable with an optional numeric : arg (@response:2)
const slashReg = /^\/([\p{L}\d_\-\.:]+)(?=(\s|$|\b))/iu; // A / command

export interface IChatParserContext {
	/** Used only as a disambiguator, when the query references an agent that has a duplicate with the same name. */
	selectedAgent?: IChatAgentData;
	mode?: ChatModeKind;
	/** Parse as this agent, even when it does not appear in the query text */
	forcedAgent?: IChatAgentData;
}

export class ChatRequestParser {
	constructor(
		@IChatAgentService private readonly agentService: IChatAgentService,
		@IChatVariablesService private readonly variableService: IChatVariablesService,
		@IChatSlashCommandService private readonly slashCommandService: IChatSlashCommandService,
		@IPromptsService private readonly promptsService: IPromptsService,
	) { }

	parseChatRequest(sessionResource: URI, message: string, location: ChatAgentLocation = ChatAgentLocation.Chat, context?: IChatParserContext): IParsedChatRequest {
		const parts: IParsedChatRequestPart[] = [];
		const references = this.variableService.getDynamicVariables(sessionResource); // must access this list before any async calls
		const toolsByName = new Map<string, IToolData>();
		const toolSetsByName = new Map<string, ToolSet>();
		for (const [entry, enabled] of this.variableService.getSelectedToolAndToolSets(sessionResource)) {
			if (enabled) {
				if (entry instanceof ToolSet) {
					toolSetsByName.set(entry.referenceName, entry);
				} else {
					toolsByName.set(entry.toolReferenceName ?? entry.displayName, entry);
				}
			}
		}

		let lineNumber = 1;
		let column = 1;
		for (let i = 0; i < message.length; i++) {
			const previousChar = message.charAt(i - 1);
			const char = message.charAt(i);
			let newPart: IParsedChatRequestPart | undefined;
			if (previousChar.match(/\s/) || i === 0) {
				if (char === chatVariableLeader) {
					newPart = this.tryToParseVariable(message.slice(i), i, new Position(lineNumber, column), parts, toolsByName, toolSetsByName);
				} else if (char === chatAgentLeader) {
					newPart = this.tryToParseAgent(message.slice(i), message, i, new Position(lineNumber, column), parts, location, context);
				} else if (char === chatSubcommandLeader) {
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
					parts.push(new ChatRequestTextPart(
						new OffsetRange(previousPartEnd, i),
						new Range(previousPartEditorRangeEndLine, previousPartEditorRangeEndCol, lineNumber, column),
						message.slice(previousPartEnd, i)));
				}

				parts.push(newPart);
			}

			if (char === '\n') {
				lineNumber++;
				column = 1;
			} else {
				column++;
			}
		}

		const lastPart = parts.at(-1);
		const lastPartEnd = lastPart?.range.endExclusive ?? 0;
		if (lastPartEnd < message.length) {
			parts.push(new ChatRequestTextPart(
				new OffsetRange(lastPartEnd, message.length),
				new Range(lastPart?.editorRange.endLineNumber ?? 1, lastPart?.editorRange.endColumn ?? 1, lineNumber, column),
				message.slice(lastPartEnd, message.length)));
		}

		return {
			parts,
			text: message,
		};
	}

	private tryToParseAgent(message: string, fullMessage: string, offset: number, position: IPosition, parts: Array<IParsedChatRequestPart>, location: ChatAgentLocation, context: IChatParserContext | undefined): ChatRequestAgentPart | undefined {
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

	private tryToParseVariable(message: string, offset: number, position: IPosition, parts: ReadonlyArray<IParsedChatRequestPart>, toolsByName: ReadonlyMap<string, IToolData>, toolSetsByName: ReadonlyMap<string, ToolSet>): ChatRequestToolPart | ChatRequestToolSetPart | undefined {
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

	private tryToParseSlashCommand(remainingMessage: string, fullMessage: string, offset: number, position: IPosition, parts: ReadonlyArray<IParsedChatRequestPart>, location: ChatAgentLocation, context?: IChatParserContext): ChatRequestSlashCommandPart | ChatRequestAgentSubcommandPart | ChatRequestSlashPromptPart | undefined {
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

		const usedAgent = parts.find((p): p is ChatRequestAgentPart => p instanceof ChatRequestAgentPart)?.agent ??
			(context?.forcedAgent ? context.forcedAgent : undefined);
		if (usedAgent) {
			const subCommand = usedAgent.slashCommands.find(c => c.name === command);
			if (subCommand) {
				// Valid agent subcommand
				return new ChatRequestAgentSubcommandPart(slashRange, slashEditorRange, subCommand);
			}
		} else {
			const slashCommands = this.slashCommandService.getCommands(location, context?.mode ?? ChatModeKind.Ask);
			const slashCommand = slashCommands.find(c => c.command === command);
			if (slashCommand) {
				// Valid standalone slash command
				return new ChatRequestSlashCommandPart(slashRange, slashEditorRange, slashCommand);
			} else {
				// check for with default agent for this location
				const defaultAgent = this.agentService.getDefaultAgent(location, context?.mode);
				const subCommand = defaultAgent?.slashCommands.find(c => c.name === command);
				if (subCommand) {
					// Valid default agent subcommand
					return new ChatRequestAgentSubcommandPart(slashRange, slashEditorRange, subCommand);
				}
			}

			// if there's no agent, asume it is a prompt slash command
			const isPromptCommand = this.promptsService.isValidSlashCommandName(command);
			if (isPromptCommand) {
				return new ChatRequestSlashPromptPart(slashRange, slashEditorRange, command);
			}
		}
		return;
	}

	private tryToParseDynamicVariable(message: string, offset: number, position: IPosition, references: ReadonlyArray<IDynamicVariable>): ChatRequestDynamicVariablePart | undefined {
		const refAtThisPosition = references.find(r =>
			r.range.startLineNumber === position.lineNumber &&
			r.range.startColumn === position.column);
		if (refAtThisPosition) {
			const length = refAtThisPosition.range.endColumn - refAtThisPosition.range.startColumn;
			const text = message.substring(0, length);
			const range = new OffsetRange(offset, offset + length);
			return new ChatRequestDynamicVariablePart(range, refAtThisPosition.range, text, refAtThisPosition.id, refAtThisPosition.modelDescription, refAtThisPosition.data, refAtThisPosition.fullName, refAtThisPosition.icon, refAtThisPosition.isFile, refAtThisPosition.isDirectory);
		}

		return;
	}
}
