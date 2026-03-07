/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Provider-neutral conversation format.
 *
 * This is the internal representation of a conversation. It does not use any
 * specific provider's types. Translation to/from wire formats happens at the
 * model-provider boundary (see {@link IModelProvider}).
 *
 * Key design decisions:
 * - Each message carries an {@link IModelIdentity} recording which model produced it.
 * - Each message carries an opaque {@link providerMetadata} bag that round-trips
 *   through the system without inspection. Providers populate it on responses and
 *   read it back on subsequent requests.
 * - The format is rich enough for lossless translation to both OpenAI and Anthropic
 *   wire formats.
 */

// -- Model identity -----------------------------------------------------------

/**
 * Identifies a specific model from a specific provider. Stored on every message
 * so that conversations are inherently heterogeneous -- model switching mid-
 * conversation is a first-class concept.
 */
export interface IModelIdentity {
	/** Provider identifier (e.g., 'anthropic', 'openai'). */
	readonly provider: string;
	/** Model identifier within the provider (e.g., 'claude-sonnet-4-20250514'). */
	readonly modelId: string;
}

// -- Content parts ------------------------------------------------------------

export interface ITextPart {
	readonly type: 'text';
	readonly text: string;
}

export interface IToolCallPart {
	readonly type: 'tool-call';
	readonly toolCallId: string;
	readonly toolName: string;
	/** Parsed arguments (the model's JSON output, already parsed). */
	readonly arguments: Record<string, unknown>;
}

export interface IThinkingPart {
	readonly type: 'thinking';
	readonly text: string;
	/**
	 * Opaque signature data for reasoning continuity across turns.
	 * Populated by the provider, passed back on subsequent requests.
	 */
	readonly signature?: string;
}

/**
 * Opaque redacted thinking block from the provider. The content is
 * encrypted and must be echoed back unchanged on the next turn to
 * maintain reasoning continuity. Dropping these causes API errors.
 */
export interface IRedactedThinkingPart {
	readonly type: 'redacted-thinking';
	readonly data: string;
}

export type IAssistantContentPart = ITextPart | IToolCallPart | IThinkingPart | IRedactedThinkingPart;

// -- Messages -----------------------------------------------------------------

interface IMessageBase {
	/**
	 * Opaque provider-specific metadata that round-trips through the system.
	 * The core loop never inspects this; the provider populates it on responses
	 * and reads it back when building the next request.
	 *
	 * Examples: encrypted reasoning state, cache control hints, annotations.
	 */
	readonly providerMetadata?: Record<string, unknown>;
}

export interface ISystemMessage extends IMessageBase {
	readonly role: 'system';
	readonly content: string;
}

export interface IUserMessage extends IMessageBase {
	readonly role: 'user';
	readonly content: string;
	/** Which model this message is targeting (set by the caller). */
	readonly modelIdentity?: IModelIdentity;
}

export interface IAssistantMessage extends IMessageBase {
	readonly role: 'assistant';
	readonly content: readonly IAssistantContentPart[];
	/** Which model produced this message. */
	readonly modelIdentity: IModelIdentity;
}

export interface IToolResultMessage extends IMessageBase {
	readonly role: 'tool-result';
	readonly toolCallId: string;
	readonly toolName: string;
	readonly content: string;
	readonly isError?: boolean;
}

export type IConversationMessage = ISystemMessage | IUserMessage | IAssistantMessage | IToolResultMessage;

// -- Conversation -------------------------------------------------------------

/**
 * A flat, ordered list of messages representing a conversation.
 * This is the input to the agent loop.
 */
export type Conversation = readonly IConversationMessage[];

// -- Helpers ------------------------------------------------------------------

export function createSystemMessage(content: string): ISystemMessage {
	return { role: 'system', content };
}

export function createUserMessage(content: string, modelIdentity?: IModelIdentity): IUserMessage {
	return { role: 'user', content, modelIdentity };
}

export function createAssistantMessage(
	content: readonly IAssistantContentPart[],
	modelIdentity: IModelIdentity,
	providerMetadata?: Record<string, unknown>,
): IAssistantMessage {
	return { role: 'assistant', content, modelIdentity, providerMetadata };
}

export function createToolResultMessage(
	toolCallId: string,
	toolName: string,
	content: string,
	isError?: boolean,
): IToolResultMessage {
	return { role: 'tool-result', toolCallId, toolName, content, isError };
}

/**
 * Extracts only the text parts from an assistant message's content.
 */
export function getAssistantText(message: IAssistantMessage): string {
	return message.content
		.filter((p): p is ITextPart => p.type === 'text')
		.map(p => p.text)
		.join('');
}

/**
 * Extracts tool call parts from an assistant message's content.
 */
export function getToolCalls(message: IAssistantMessage): readonly IToolCallPart[] {
	return message.content.filter((p): p is IToolCallPart => p.type === 'tool-call');
}
