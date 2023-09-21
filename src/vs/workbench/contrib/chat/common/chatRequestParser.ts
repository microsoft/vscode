/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { OffsetRange } from 'vs/editor/common/core/offsetRange';
import { IPosition, Position } from 'vs/editor/common/core/position';
import { IRange, Range } from 'vs/editor/common/core/range';
import { IChatAgentCommand, IChatAgentData, IChatAgentService } from 'vs/workbench/contrib/chat/common/chatAgents';
import { IChatService, ISlashCommand } from 'vs/workbench/contrib/chat/common/chatService';
import { IChatVariablesService } from 'vs/workbench/contrib/chat/common/chatVariables';

export interface IParsedChatRequest {
	readonly parts: ReadonlyArray<IParsedChatRequestPart>;
	readonly text: string;
}

const variableOrAgentReg = /^@([\w_\-]+)(:\d+)?(?=(\s|$))/i; // An @-variable with an optional numeric : arg (@response:2)
const slashReg = /\/([\w_-]+)(?=(\s|$))/i; // A / command

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
			if (char === '@' && (previousChar === ' ' || i === 0)) {
				newPart = this.tryToParseVariableOrAgent(message.slice(i), i, new Position(lineNumber, column), parts);
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
		parts.push(new ChatRequestTextPart(
			new OffsetRange(lastPartEnd, message.length),
			new Range(lastPart?.editorRange.endLineNumber ?? 1, lastPart?.editorRange.endColumn ?? 1, lineNumber, column),
			message.slice(lastPartEnd, message.length)));

		return {
			parts,
			text: message,
		};
	}

	private tryToParseVariableOrAgent(message: string, offset: number, position: IPosition, parts: ReadonlyArray<IParsedChatRequestPart>): ChatRequestAgentPart | ChatRequestVariablePart | undefined {
		const nextVariableMatch = message.match(variableOrAgentReg);
		if (!nextVariableMatch) {
			return;
		}

		const [full, name] = nextVariableMatch;
		const variableArg = nextVariableMatch[2] ?? '';
		const varRange = new OffsetRange(offset, offset + full.length);
		const varEditorRange = new Range(position.lineNumber, position.column, position.lineNumber, position.column + full.length);

		let agent: IChatAgentData | undefined;
		if ((agent = this.agentService.getAgent(name)) && !variableArg) {
			if (parts.some(p => p instanceof ChatRequestAgentPart)) {
				// Only one agent allowed
				return;
			} else {
				return new ChatRequestAgentPart(varRange, varEditorRange, agent);
			}
		} else if (this.variableService.hasVariable(name)) {
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

export interface IParsedChatRequestPart {
	readonly range: OffsetRange;
	readonly editorRange: IRange;
	readonly text: string;
}

// TODO rename to tokens

export class ChatRequestTextPart implements IParsedChatRequestPart {
	constructor(readonly range: OffsetRange, readonly editorRange: IRange, readonly text: string) { }
}

/**
 * An invocation of a static variable that can be resolved by the variable service
 */
export class ChatRequestVariablePart implements IParsedChatRequestPart {
	constructor(readonly range: OffsetRange, readonly editorRange: IRange, readonly variableName: string, readonly variableArg: string) { }

	get text(): string {
		const argPart = this.variableArg ? `:${this.variableArg}` : '';
		return `@${this.variableName}${argPart}`;
	}
}

/**
 * An invocation of an agent that can be resolved by the agent service
 */
export class ChatRequestAgentPart implements IParsedChatRequestPart {
	constructor(readonly range: OffsetRange, readonly editorRange: IRange, readonly agent: IChatAgentData) { }

	get text(): string {
		return `@${this.agent.id}`;
	}
}

/**
 * An invocation of an agent's subcommand
 */
export class ChatRequestAgentSubcommandPart implements IParsedChatRequestPart {
	constructor(readonly range: OffsetRange, readonly editorRange: IRange, readonly command: IChatAgentCommand) { }

	get text(): string {
		return `/${this.command.name}`;
	}
}

/**
 * An invocation of a standalone slash command
 */
export class ChatRequestSlashCommandPart implements IParsedChatRequestPart {
	constructor(readonly range: OffsetRange, readonly editorRange: IRange, readonly slashCommand: ISlashCommand) { }

	get text(): string {
		return `/${this.slashCommand.command}`;
	}
}
