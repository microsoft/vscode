/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Uniform agent-event shape for the IDE renderer layer (§4.3 of AGENTIC_PLATFORM_PLAN.md).
 *
 * These types mirror `services/_shared/agent-events/index.ts` but are declared
 * independently here to avoid a cross-layer import from renderer code into the
 * Node.js service layer. Both definitions must be kept structurally in sync.
 *
 * Provider adapters in model-router emit this shape; the IDE consumes only this
 * shape, making the rest of the system provider-agnostic.
 */

export type StopReason = 'end_turn' | 'tool_use' | 'max_tokens' | 'error';

export interface MessageStartEvent {
	readonly type: 'message_start';
	readonly requestId: string;
	readonly provider: string;
	readonly model: string;
}

export interface TextDeltaEvent {
	readonly type: 'text_delta';
	readonly text: string;
}

export interface ToolUseStartEvent {
	readonly type: 'tool_use_start';
	readonly toolUseId: string;
	readonly name: string;
	readonly input?: unknown;
}

export interface ToolUseDeltaEvent {
	readonly type: 'tool_use_delta';
	readonly toolUseId: string;
	readonly partialInput: string;
}

export interface ToolUseStopEvent {
	readonly type: 'tool_use_stop';
	readonly toolUseId: string;
}

export interface ThinkingDeltaEvent {
	readonly type: 'thinking_delta';
	readonly text: string;
	readonly signature?: string;
}

export interface UsageEvent {
	readonly type: 'usage';
	readonly inputTokens: number;
	readonly outputTokens: number;
	readonly cacheCreationInputTokens?: number;
	readonly cacheReadInputTokens?: number;
}

export interface MessageStopEvent {
	readonly type: 'message_stop';
	readonly stopReason: StopReason;
}

export interface ErrorEvent {
	readonly type: 'error';
	readonly code: string;
	readonly message: string;
	readonly retryable: boolean;
}

export type AgentEvent =
	| MessageStartEvent
	| TextDeltaEvent
	| ToolUseStartEvent
	| ToolUseDeltaEvent
	| ToolUseStopEvent
	| ThinkingDeltaEvent
	| UsageEvent
	| MessageStopEvent
	| ErrorEvent;

export function addUsage(a: UsageEvent, b: UsageEvent): UsageEvent {
	return {
		type: 'usage',
		inputTokens: a.inputTokens + b.inputTokens,
		outputTokens: a.outputTokens + b.outputTokens,
		cacheCreationInputTokens: (a.cacheCreationInputTokens ?? 0) + (b.cacheCreationInputTokens ?? 0),
		cacheReadInputTokens: (a.cacheReadInputTokens ?? 0) + (b.cacheReadInputTokens ?? 0),
	};
}

export function emptyUsage(): UsageEvent {
	return { type: 'usage', inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 };
}
