/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Typed event stream for the agent loop.
 *
 * Every action inside the loop produces a typed event. Events are the only
 * output channel -- the caller iterates the stream and reacts. Events carry
 * enough information to reconstruct the full conversation state, render a UI,
 * compute costs, or write a transcript.
 */

import { IAssistantMessage, IModelIdentity } from './conversation.js';

// -- Events -------------------------------------------------------------------

/** A model request has been initiated. */
export interface IModelCallStartEvent {
	readonly type: 'model-call-start';
	readonly modelIdentity: IModelIdentity;
	readonly turn: number;
}

/** A model request has completed (successfully or not). */
export interface IModelCallCompleteEvent {
	readonly type: 'model-call-complete';
	readonly modelIdentity: IModelIdentity;
	readonly turn: number;
	readonly durationMs: number;
}

/** A streaming text delta from the model. */
export interface IAssistantDeltaEvent {
	readonly type: 'assistant-delta';
	readonly text: string;
	readonly turn: number;
}

/** The complete assistant message after all deltas have been received. */
export interface IAssistantMessageEvent {
	readonly type: 'assistant-message';
	readonly message: IAssistantMessage;
	readonly turn: number;
}

/** A streaming reasoning/thinking delta from the model. */
export interface IReasoningDeltaEvent {
	readonly type: 'reasoning-delta';
	readonly text: string;
	readonly turn: number;
}

/** A tool has started executing. */
export interface IToolStartEvent {
	readonly type: 'tool-start';
	readonly toolCallId: string;
	readonly toolName: string;
	readonly arguments: Record<string, unknown>;
	readonly turn: number;
}

/** A tool has finished executing. */
export interface IToolCompleteEvent {
	readonly type: 'tool-complete';
	readonly toolCallId: string;
	readonly toolName: string;
	readonly result: string;
	readonly isError: boolean;
	readonly durationMs: number;
	readonly turn: number;
}

/** Token usage information for a model call. */
export interface IUsageEvent {
	readonly type: 'usage';
	readonly inputTokens: number;
	readonly outputTokens: number;
	readonly reasoningTokens?: number;
	readonly cacheReadTokens?: number;
	readonly cacheCreationTokens?: number;
	readonly modelIdentity: IModelIdentity;
	readonly turn: number;
}

/** An error occurred during loop execution. */
export interface IErrorEvent {
	readonly type: 'error';
	readonly error: Error;
	readonly fatal: boolean;
	readonly turn: number;
}

/** Marks the end of a complete model-call/tool-execution cycle within a turn. */
export interface ITurnBoundaryEvent {
	readonly type: 'turn-boundary';
	readonly turn: number;
}

export type AgentLoopEvent =
	| IModelCallStartEvent
	| IModelCallCompleteEvent
	| IAssistantDeltaEvent
	| IAssistantMessageEvent
	| IReasoningDeltaEvent
	| IToolStartEvent
	| IToolCompleteEvent
	| IUsageEvent
	| IErrorEvent
	| ITurnBoundaryEvent;

/** Maps event type discriminant strings to their corresponding event interface. */
export interface IAgentLoopEventMap {
	'model-call-start': IModelCallStartEvent;
	'model-call-complete': IModelCallCompleteEvent;
	'assistant-delta': IAssistantDeltaEvent;
	'assistant-message': IAssistantMessageEvent;
	'reasoning-delta': IReasoningDeltaEvent;
	'tool-start': IToolStartEvent;
	'tool-complete': IToolCompleteEvent;
	'usage': IUsageEvent;
	'error': IErrorEvent;
	'turn-boundary': ITurnBoundaryEvent;
}
