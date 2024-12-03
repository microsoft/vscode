/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { revive } from '../../../../base/common/marshalling.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { IOffsetRange, OffsetRange } from '../../../../editor/common/core/offsetRange.js';
import { IRange } from '../../../../editor/common/core/range.js';
import { ChatAgentLocation, IChatAgentCommand, IChatAgentData, IChatAgentService, reviveSerializedAgent } from './chatAgents.js';
import { IChatSlashData } from './chatSlashCommands.js';
import { IChatRequestVariableValue, IDynamicVariable } from './chatVariables.js';
import { IToolData } from './languageModelToolsService.js';

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
	/** How this part is represented in the prompt going to the agent */
	readonly promptText: string;
}

export function getPromptText(request: IParsedChatRequest): { message: string; diff: number } {
	const message = request.parts.map(r => r.promptText).join('').trimStart();
	const diff = request.text.length - message.length;

	return { message, diff };
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
	constructor(readonly range: OffsetRange, readonly editorRange: IRange, readonly variableName: string, readonly variableArg: string, readonly variableId: string) { }

	get text(): string {
		const argPart = this.variableArg ? `:${this.variableArg}` : '';
		return `${chatVariableLeader}${this.variableName}${argPart}`;
	}

	get promptText(): string {
		return this.text;
	}
}

/**
 * An invocation of a tool
 */
export class ChatRequestToolPart implements IParsedChatRequestPart {
	static readonly Kind = 'tool';
	readonly kind = ChatRequestToolPart.Kind;
	constructor(readonly range: OffsetRange, readonly editorRange: IRange, readonly toolName: string, readonly toolId: string, readonly displayName?: string, readonly icon?: IToolData['icon']) { }

	get text(): string {
		return `${chatVariableLeader}${this.toolName}`;
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
	constructor(readonly range: OffsetRange, readonly editorRange: IRange, readonly agent: IChatAgentData) { }

	get text(): string {
		return `${chatAgentLeader}${this.agent.name}`;
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
	constructor(readonly range: OffsetRange, readonly editorRange: IRange, readonly slashCommand: IChatSlashData) { }

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
export class ChatRequestDynamicVariablePart implements IParsedChatRequestPart {
	static readonly Kind = 'dynamic';
	readonly kind = ChatRequestDynamicVariablePart.Kind;
	constructor(readonly range: OffsetRange, readonly text: string, private readonly variable: IDynamicVariable) { }

	/**
	 * The nested child file references of this variable, if any.
	 */
	public get childReferences(): ReadonlyArray<URI> | undefined {
		return this.variable.validFileReferenceUris;
	}

	public get id(): string {
		return this.variable.id;
	}

	public get editorRange(): IRange {
		return this.variable.range;
	}

	public get modelDescription(): string | undefined {
		return this.variable.modelDescription;
	}

	public get data(): IChatRequestVariableValue {
		return this.variable.data;
	}

	public get fullName(): string | undefined {
		return this.variable.fullName;
	}

	public get icon(): ThemeIcon | undefined {
		return this.variable.icon;
	}

	public get isFile(): boolean | undefined {
		return this.variable.isFile;
	}

	get referenceText(): string {
		return this.text.replace(chatVariableLeader, '');
	}

	get promptText(): string {
		return this.text;
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
					(part as ChatRequestVariablePart).variableArg,
					(part as ChatRequestVariablePart).variableId || '',
				);
			} else if (part.kind === ChatRequestToolPart.Kind) {
				return new ChatRequestToolPart(
					new OffsetRange(part.range.start, part.range.endExclusive),
					part.editorRange,
					(part as ChatRequestToolPart).toolName,
					(part as ChatRequestToolPart).toolId,
					(part as ChatRequestToolPart).displayName,
					(part as ChatRequestToolPart).icon,
				);
			} else if (part.kind === ChatRequestAgentPart.Kind) {
				let agent = (part as ChatRequestAgentPart).agent;
				agent = reviveSerializedAgent(agent);

				return new ChatRequestAgentPart(
					new OffsetRange(part.range.start, part.range.endExclusive),
					part.editorRange,
					agent
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
			} else if (part.kind === ChatRequestDynamicVariablePart.Kind) {
				const variable: IDynamicVariable = {
					range: part.editorRange,
					id: (part as ChatRequestDynamicVariablePart).id,
					modelDescription: (part as ChatRequestDynamicVariablePart).modelDescription,
					fullName: (part as ChatRequestDynamicVariablePart).fullName,
					icon: (part as ChatRequestDynamicVariablePart).icon,
					isFile: (part as ChatRequestDynamicVariablePart).isFile,
					data: revive((part as ChatRequestDynamicVariablePart).data),
				};

				return new ChatRequestDynamicVariablePart(
					new OffsetRange(part.range.start, part.range.endExclusive),
					(part as ChatRequestDynamicVariablePart).text,
					variable,
				);
			} else {
				throw new Error(`Unknown chat request part '${part.kind}'.`);
			}
		})
	};
}

export function extractAgentAndCommand(parsed: IParsedChatRequest): { agentPart: ChatRequestAgentPart | undefined; commandPart: ChatRequestAgentSubcommandPart | undefined } {
	const agentPart = parsed.parts.find((r): r is ChatRequestAgentPart => r instanceof ChatRequestAgentPart);
	const commandPart = parsed.parts.find((r): r is ChatRequestAgentSubcommandPart => r instanceof ChatRequestAgentSubcommandPart);
	return { agentPart, commandPart };
}

export function formatChatQuestion(chatAgentService: IChatAgentService, location: ChatAgentLocation, prompt: string, participant: string | null = null, command: string | null = null): string | undefined {
	let question = '';
	if (participant && participant !== chatAgentService.getDefaultAgent(location)?.id) {
		const agent = chatAgentService.getAgent(participant);
		if (!agent) {
			// Refers to agent that doesn't exist
			return undefined;
		}

		question += `${chatAgentLeader}${agent.name} `;
		if (command) {
			question += `${chatSubcommandLeader}${command} `;
		}
	}
	return question + prompt;
}
