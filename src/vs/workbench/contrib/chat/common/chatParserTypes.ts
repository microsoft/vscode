/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IOffsetRange, OffsetRange } from 'vs/editor/common/core/offsetRange';
import { IRange } from 'vs/editor/common/core/range';
import { IChatAgentData, IChatAgentCommand } from 'vs/workbench/contrib/chat/common/chatAgents';
import { ISlashCommand } from 'vs/workbench/contrib/chat/common/chatService';

// These are in a separate file to avoid circular dependencies with the dependencies of the parser

export interface IParsedChatRequest {
	readonly parts: ReadonlyArray<IParsedChatRequestPart>;
	readonly text: string;
}

export interface IParsedChatRequestPart {
	readonly kind: string; // for serialization
	readonly range: IOffsetRange;
	readonly editorRange: IRange;
	readonly text: string;
}

// TODO rename to tokens

export class ChatRequestTextPart implements IParsedChatRequestPart {
	static readonly Kind = 'text';
	readonly kind = ChatRequestTextPart.Kind;
	constructor(readonly range: OffsetRange, readonly editorRange: IRange, readonly text: string) { }
}

export const chatVariableLeader = '#'; // warning, this also shows up in a regex in the parser

/**
 * An invocation of a static variable that can be resolved by the variable service
 */
export class ChatRequestVariablePart implements IParsedChatRequestPart {
	static readonly Kind = 'var';
	readonly kind = ChatRequestVariablePart.Kind;
	constructor(readonly range: OffsetRange, readonly editorRange: IRange, readonly variableName: string, readonly variableArg: string) { }

	get text(): string {
		const argPart = this.variableArg ? `:${this.variableArg}` : '';
		return `${chatVariableLeader}${this.variableName}${argPart}`;
	}
}

/**
 * An invocation of an agent that can be resolved by the agent service
 */
export class ChatRequestAgentPart implements IParsedChatRequestPart {
	static readonly Kind = 'agent';
	readonly kind = ChatRequestAgentPart.Kind;
	constructor(readonly range: OffsetRange, readonly editorRange: IRange, readonly agent: IChatAgentData) { }

	get text(): string {
		return `@${this.agent.id}`;
	}
}

/**
 * An invocation of an agent's subcommand
 */
export class ChatRequestAgentSubcommandPart implements IParsedChatRequestPart {
	static readonly Kind = 'subcommand';
	readonly kind = ChatRequestAgentSubcommandPart.Kind;
	constructor(readonly range: OffsetRange, readonly editorRange: IRange, readonly command: IChatAgentCommand) { }

	get text(): string {
		return `/${this.command.name}`;
	}
}

/**
 * An invocation of a standalone slash command
 */
export class ChatRequestSlashCommandPart implements IParsedChatRequestPart {
	static readonly Kind = 'slash';
	readonly kind = ChatRequestSlashCommandPart.Kind;
	constructor(readonly range: OffsetRange, readonly editorRange: IRange, readonly slashCommand: ISlashCommand) { }

	get text(): string {
		return `/${this.slashCommand.command}`;
	}
}

export function reviveParsedChatRequest(serialized: IParsedChatRequest): IParsedChatRequest {
	return {
		text: serialized.text,
		parts: serialized.parts.map(part => {
			if (part.kind === ChatRequestTextPart.Kind) {
				return new ChatRequestTextPart(
					new OffsetRange(part.range.start, part.range.endExclusive),
					part.editorRange,
					part.text
				);
			} else if (part.kind === ChatRequestVariablePart.Kind) {
				return new ChatRequestVariablePart(
					new OffsetRange(part.range.start, part.range.endExclusive),
					part.editorRange,
					(part as ChatRequestVariablePart).variableName,
					(part as ChatRequestVariablePart).variableArg
				);
			} else if (part.kind === ChatRequestAgentPart.Kind) {
				return new ChatRequestAgentPart(
					new OffsetRange(part.range.start, part.range.endExclusive),
					part.editorRange,
					(part as ChatRequestAgentPart).agent
				);
			} else if (part.kind === ChatRequestAgentSubcommandPart.Kind) {
				return new ChatRequestAgentSubcommandPart(
					new OffsetRange(part.range.start, part.range.endExclusive),
					part.editorRange,
					(part as ChatRequestAgentSubcommandPart).command
				);
			} else if (part.kind === ChatRequestSlashCommandPart.Kind) {
				return new ChatRequestSlashCommandPart(
					new OffsetRange(part.range.start, part.range.endExclusive),
					part.editorRange,
					(part as ChatRequestSlashCommandPart).slashCommand
				);
			} else {
				throw new Error(`Unknown chat request part: ${part.kind}`);
			}
		})
	};
}
