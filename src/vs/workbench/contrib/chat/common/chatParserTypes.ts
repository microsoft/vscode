/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { IOffsetRange, OffsetRange } from 'vs/editor/common/core/offsetRange';
import { IRange } from 'vs/editor/common/core/range';
import { IChatAgent, IChatAgentCommand } from 'vs/workbench/contrib/chat/common/chatAgents';
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
	readonly promptText: string;
}

export class ChatRequestTextPart implements IParsedChatRequestPart {
	static readonly Kind = 'text';
	readonly kind = ChatRequestTextPart.Kind;
	constructor(readonly range: OffsetRange, readonly editorRange: IRange, readonly text: string) { }

	get promptText(): string {
		return this.text;
	}
}

// warning, these also show up in a regex in the parser
export const chatVariableLeader = '#';
export const chatAgentLeader = '@';
export const chatSubcommandLeader = '/';

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

	get promptText(): string {
		return this.text;
	}
}

/**
 * An invocation of an agent that can be resolved by the agent service
 */
export class ChatRequestAgentPart implements IParsedChatRequestPart {
	static readonly Kind = 'agent';
	readonly kind = ChatRequestAgentPart.Kind;
	constructor(readonly range: OffsetRange, readonly editorRange: IRange, readonly agent: IChatAgent) { }

	get text(): string {
		return `${chatAgentLeader}${this.agent.id}`;
	}

	get promptText(): string {
		return '';
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
		return `${chatSubcommandLeader}${this.command.name}`;
	}

	get promptText(): string {
		return '';
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
		return `${chatSubcommandLeader}${this.slashCommand.command}`;
	}

	get promptText(): string {
		return `${chatSubcommandLeader}${this.slashCommand.command}`;
	}
}

/**
 * An invocation of a dynamic reference like '#file:'
 */
export class ChatRequestDynamicReferencePart implements IParsedChatRequestPart {
	static readonly Kind = 'dynamic';
	readonly kind = ChatRequestDynamicReferencePart.Kind;
	constructor(readonly range: OffsetRange, readonly editorRange: IRange, readonly name: string, readonly arg: string, readonly data: URI) { }

	get referenceText(): string {
		return `${this.name}:${this.arg}`;
	}

	get text(): string {
		return `${chatVariableLeader}${this.referenceText}`;
	}

	get promptText(): string {
		return `[${this.text}](values:${this.referenceText})`;
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
			} else if (part.kind === ChatRequestDynamicReferencePart.Kind) {
				return new ChatRequestDynamicReferencePart(
					new OffsetRange(part.range.start, part.range.endExclusive),
					part.editorRange,
					(part as ChatRequestDynamicReferencePart).name,
					(part as ChatRequestDynamicReferencePart).arg,
					URI.revive((part as ChatRequestDynamicReferencePart).data)
				);
			} else {
				throw new Error(`Unknown chat request part: ${part.kind}`);
			}
		})
	};
}
