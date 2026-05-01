// Copyright (c) Son-Of-Anton. All rights reserved.
// Licensed under the MIT License.

/**
 * Provider adapter contract and the uniform-event shape consumed by the router.
 *
 * The canonical definitions of AgentEvent / UniformRequest / ModelDescriptor
 * live in services/_shared/agent-events/index.ts (§4.3 of the plan). They are
 * mirrored here because this service does not yet have a TypeScript project
 * reference to the shared package — adding one requires engineering-system
 * changes that are out of scope for this PR. Keep the two files in sync
 * until the consolidation lands as its own engineering-system change.
 */

export type StopReason = 'end_turn' | 'tool_use' | 'max_tokens' | 'error';

export type AgentEvent =
	| { readonly type: 'message_start'; readonly requestId: string; readonly provider: string; readonly model: string }
	| { readonly type: 'text_delta'; readonly text: string }
	| { readonly type: 'tool_use_start'; readonly toolUseId: string; readonly name: string; readonly input?: unknown }
	| { readonly type: 'tool_use_delta'; readonly toolUseId: string; readonly partialInput: string }
	| { readonly type: 'tool_use_stop'; readonly toolUseId: string }
	| { readonly type: 'thinking_delta'; readonly text: string; readonly signature?: string }
	| {
		readonly type: 'usage';
		readonly inputTokens: number;
		readonly outputTokens: number;
		readonly cacheCreationInputTokens?: number;
		readonly cacheReadInputTokens?: number;
	}
	| { readonly type: 'message_stop'; readonly stopReason: StopReason }
	| { readonly type: 'error'; readonly code: string; readonly message: string; readonly retryable: boolean };

export type MessageRole = 'user' | 'assistant' | 'system';

export type MessageContent =
	| { readonly type: 'text'; readonly text: string }
	| {
		readonly type: 'tool_result';
		readonly toolUseId: string;
		readonly content: string;
		readonly isError?: boolean;
	};

export interface UniformMessage {
	readonly role: MessageRole;
	readonly content: string | readonly MessageContent[];
}

export interface UniformTool {
	readonly name: string;
	readonly description: string;
	readonly inputSchema: Record<string, unknown>;
}

export interface CacheBreakpoint {
	readonly atMessageIndex: number;
	readonly type: 'ephemeral';
}

export interface UniformRequest {
	readonly model: string;
	readonly messages: readonly UniformMessage[];
	readonly system?: string;
	readonly tools?: readonly UniformTool[];
	readonly maxTokens?: number;
	readonly temperature?: number;
	readonly cacheBreakpoints?: readonly CacheBreakpoint[];
	readonly requestId: string;
	readonly agentRole?: string;
	readonly taskType?: string;
}

export interface ModelDescriptor {
	readonly id: string;
	readonly displayName: string;
	readonly contextWindow?: number;
	readonly supportsTools?: boolean;
	readonly supportsThinking?: boolean;
	readonly supportsCaching?: boolean;
}

/**
 * Every provider adapter implements this interface (§5.7 of the plan).
 * `send()` is an async generator so backpressure flows naturally up through
 * the router, IDE, and chat UI.
 */
export interface ProviderAdapter {
	readonly id: string;
	readonly displayName: string;
	isAvailable(): Promise<boolean>;
	listModels(): Promise<ModelDescriptor[]>;
	send(req: UniformRequest, signal: AbortSignal): AsyncIterable<AgentEvent>;
}

/** Rate-limit headers Anthropic exposes; surfaced to the IDE for the quota chip. */
export interface RateLimitInfo {
	readonly requestsLimit?: number;
	readonly requestsRemaining?: number;
	readonly requestsReset?: string;
	readonly tokensLimit?: number;
	readonly tokensRemaining?: number;
	readonly tokensReset?: string;
}
