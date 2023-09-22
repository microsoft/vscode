/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OffsetRange } from 'vs/editor/common/core/offsetRange';
import { IRange } from 'vs/editor/common/core/range';
import { IChatAgentData, IChatAgentCommand } from 'vs/workbench/contrib/chat/common/chatAgents';
import { ISlashCommand } from 'vs/workbench/contrib/chat/common/chatService';

// These are in a separate file to avoid circular dependencies with the dependencies of the parser

export interface IParsedChatRequest {
	readonly parts: ReadonlyArray<IParsedChatRequestPart>;
	readonly text: string;
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
