/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { OffsetRange } from 'vs/editor/common/core/offsetRange';
import { IPosition, Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { IChatAgentData, IChatAgentService } from 'vs/workbench/contrib/chat/common/chatAgents';
import { ChatRequestAgentPart, ChatRequestAgentSubcommandPart, ChatRequestSlashCommandPart, ChatRequestTextPart, ChatRequestVariablePart, IParsedChatRequest, IParsedChatRequestPart, chatVariableLeader } from 'vs/workbench/contrib/chat/common/chatParserTypes';
import { IChatService } from 'vs/workbench/contrib/chat/common/chatService';
import { IChatVariablesService } from 'vs/workbench/contrib/chat/common/chatVariables';

const agentReg = /^@([\w_\-]+)(?=(\s|$|\b))/i; // An @-agent
const variableReg = /^#([\w_\-]+)(:\d+)?(?=(\s|$|\b))/i; // A #-variable with an optional numeric : arg (@response:2)
const slashReg = /\/([\w_-]+)(?=(\s|$|\b))/i; // A / command

export class ChatRequestParser {
	constructor(
		@IChatAgentService private readonly agentService: IChatAgentService,
		@IChatVariablesService private readonly variableService: IChatVariablesService,
		@IChatService private readonly chatService: IChatService,
	) { }

	async parseChatRequest(sessionId: string, message: string): Promise<IParsedChatRequest> {
		const parts: IParsedChatRequestPart[] = [];

		let lineNumber = 1;
		let column = 1;
		for (let i = 0; i < message.length; i++) {
			const previousChar = message.charAt(i - 1);
			const char = message.charAt(i);
			let newPart: IParsedChatRequestPart | undefined;
			if (char === chatVariableLeader && (previousChar === ' ' || i === 0)) {
				newPart = this.tryToParseVariable(message.slice(i), i, new Position(lineNumber, column), parts);
			} else if (char === '@' && (previousChar === ' ' || i === 0)) {
				newPart = this.tryToParseAgent(message.slice(i), i, new Position(lineNumber, column), parts);
			} else if (char === '/' && (previousChar === ' ' || i === 0)) {
				// TODO try to make this sync
				newPart = await this.tryToParseSlashCommand(sessionId, message.slice(i), i, new Position(lineNumber, column), parts);
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

	private tryToParseAgent(message: string, offset: number, position: IPosition, parts: ReadonlyArray<IParsedChatRequestPart>): ChatRequestAgentPart | ChatRequestVariablePart | undefined {
		const nextVariableMatch = message.match(agentReg);
		if (!nextVariableMatch) {
			return;
		}

		const [full, name] = nextVariableMatch;
		const varRange = new OffsetRange(offset, offset + full.length);
		const varEditorRange = new Range(position.lineNumber, position.column, position.lineNumber, position.column + full.length);

		let agent: IChatAgentData | undefined;
		if ((agent = this.agentService.getAgent(name))) {
			if (parts.some(p => p instanceof ChatRequestAgentPart)) {
				// Only one agent allowed
				return;
			} else {
				return new ChatRequestAgentPart(varRange, varEditorRange, agent);
			}
		}

		return;
	}

	private tryToParseVariable(message: string, offset: number, position: IPosition, parts: ReadonlyArray<IParsedChatRequestPart>): ChatRequestAgentPart | ChatRequestVariablePart | undefined {
		const nextVariableMatch = message.match(variableReg);
		if (!nextVariableMatch) {
			return;
		}

		const [full, name] = nextVariableMatch;
		const variableArg = nextVariableMatch[2] ?? '';
		const varRange = new OffsetRange(offset, offset + full.length);
		const varEditorRange = new Range(position.lineNumber, position.column, position.lineNumber, position.column + full.length);

		if (this.variableService.hasVariable(name)) {
			return new ChatRequestVariablePart(varRange, varEditorRange, name, variableArg);
		}

		return;
	}

	private async tryToParseSlashCommand(sessionId: string, message: string, offset: number, position: IPosition, parts: ReadonlyArray<IParsedChatRequestPart>): Promise<ChatRequestSlashCommandPart | ChatRequestAgentSubcommandPart | undefined> {
		const nextSlashMatch = message.match(slashReg);
		if (!nextSlashMatch) {
			return;
		}

		if (parts.some(p => p instanceof ChatRequestSlashCommandPart)) {
			// Only one slash command allowed
			return;
		}

		const [full, command] = nextSlashMatch;
		const slashRange = new OffsetRange(offset, offset + full.length);
		const slashEditorRange = new Range(position.lineNumber, position.column, position.lineNumber, position.column + full.length);

		const usedAgent = parts.find((p): p is ChatRequestAgentPart => p instanceof ChatRequestAgentPart);
		if (usedAgent) {
			const subCommand = usedAgent.agent.metadata.subCommands.find(c => c.name === command);
			if (subCommand) {
				// Valid agent subcommand
				return new ChatRequestAgentSubcommandPart(slashRange, slashEditorRange, subCommand);
			}
		} else {
			const slashCommands = await this.chatService.getSlashCommands(sessionId, CancellationToken.None);
			const slashCommand = slashCommands.find(c => c.command === command);
			if (slashCommand) {
				// Valid standalone slash command
				return new ChatRequestSlashCommandPart(slashRange, slashEditorRange, slashCommand);
			}
		}

		return;
	}
}
