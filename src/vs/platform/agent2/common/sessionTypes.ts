/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Session entry types -- the single source of truth for session state.
 *
 * Used both in memory (by {@link LocalSession}) and for JSONL serialization
 * (by {@link SessionStorage}). Every entry contains the complete data needed
 * for both display and conversation reconstruction (including thinking
 * blocks, provider metadata, tool-call parts, etc.).
 */

import { IAssistantContentPart, IModelIdentity } from './conversation.js';

export interface ISessionUserMessage {
	readonly type: 'user-message';
	readonly messageId: string;
	readonly content: string;
}

export interface ISessionAssistantMessage {
	readonly type: 'assistant-message';
	readonly messageId: string;
	/** The full content parts: text, tool-calls, thinking, redacted-thinking. */
	readonly contentParts: readonly IAssistantContentPart[];
	/** Which model produced this message. */
	readonly modelIdentity: IModelIdentity;
	/** Opaque provider metadata (encrypted reasoning state, cache hints, etc.). */
	readonly providerMetadata?: Record<string, unknown>;
}

export interface ISessionToolStart {
	readonly type: 'tool-start';
	readonly toolCallId: string;
	readonly toolName: string;
	readonly displayName: string;
	readonly invocationMessage: string;
	readonly toolInput?: string;
	readonly toolKind?: 'terminal';
	readonly language?: string;
}

export interface ISessionToolComplete {
	readonly type: 'tool-complete';
	readonly toolCallId: string;
	readonly toolName: string;
	readonly success: boolean;
	readonly pastTenseMessage: string;
	readonly toolOutput: string;
}

export type SessionEntry =
	| ISessionUserMessage
	| ISessionAssistantMessage
	| ISessionToolStart
	| ISessionToolComplete;
