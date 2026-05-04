// Copyright (c) Son-Of-Anton. All rights reserved.
// Licensed under the MIT License.

/**
 * Uniform agent-event shape (§4.3 of AGENTIC_PLATFORM_PLAN.md).
 *
 * Every provider adapter (Anthropic OAuth, ChatGPT OAuth, Copilot, OpenAI key,
 * Anthropic key, OpenRouter, …) emits exactly this discriminated union.
 * Everything above the adapter — router, IDE, agents — consumes only this
 * shape, which makes the rest of the system provider-agnostic.
 *
 * The shape is intentionally close to Anthropic's event model: it has the
 * most expressive set of variants (cache tokens, thinking deltas, fine-grained
 * tool-use deltas). OpenAI / Copilot adapters synthesise events to fit;
 * missing data is `undefined`, not invented.
 */

/** Reasons a model can stop generating tokens. */
export type StopReason = 'end_turn' | 'tool_use' | 'max_tokens' | 'error';

/** Fired once at the start of every response, before any deltas. */
export interface MessageStartEvent {
	readonly type: 'message_start';
	readonly requestId: string;
	readonly provider: string;
	readonly model: string;
}

/** Streaming text fragment from the assistant turn. */
export interface TextDeltaEvent {
	readonly type: 'text_delta';
	readonly text: string;
}

/** A new tool call has begun; arguments may stream in via tool_use_delta. */
export interface ToolUseStartEvent {
	readonly type: 'tool_use_start';
	readonly toolUseId: string;
	readonly name: string;
	/**
	 * Initial input snapshot, if the provider sends arguments in one chunk.
	 * Subsequent partial input arrives via tool_use_delta.
	 */
	readonly input?: unknown;
}

/** Streaming tool-argument fragment (raw JSON characters). */
export interface ToolUseDeltaEvent {
	readonly type: 'tool_use_delta';
	readonly toolUseId: string;
	readonly partialInput: string;
}

/** A tool call has finished receiving arguments and is ready to execute. */
export interface ToolUseStopEvent {
	readonly type: 'tool_use_stop';
	readonly toolUseId: string;
}

/**
 * Streaming "extended thinking" / chain-of-thought fragment.
 * Anthropic-only today; other providers omit.
 */
export interface ThinkingDeltaEvent {
	readonly type: 'thinking_delta';
	readonly text: string;
	/** Provider-supplied verification signature (Anthropic encrypted thinking). */
	readonly signature?: string;
}

/** Token / cost accounting. May fire mid-stream and again at the end. */
export interface UsageEvent {
	readonly type: 'usage';
	readonly inputTokens: number;
	readonly outputTokens: number;
	readonly cacheCreationInputTokens?: number;
	readonly cacheReadInputTokens?: number;
}

/** Fired exactly once when the response is complete. */
export interface MessageStopEvent {
	readonly type: 'message_stop';
	readonly stopReason: StopReason;
}

/** A terminal error. The stream MUST emit at most one error event and then end. */
export interface ErrorEvent {
	readonly type: 'error';
	readonly code: string;
	readonly message: string;
	readonly retryable: boolean;
	/** Provider that emitted this error, if known. Populated by adapters and forwarded to the IDE for provider-aware retry UI. */
	readonly provider?: string;
}

/**
 * The complete uniform event union. Every provider adapter's `send()` method
 * yields values of this type and only this type.
 */
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

/** A role attached to each message turn in a uniform request. */
export type MessageRole = 'user' | 'assistant' | 'system';

/** A single content block (text or tool result) in a uniform message. */
export type MessageContent =
	| { readonly type: 'text'; readonly text: string }
	| {
		readonly type: 'tool_result';
		readonly toolUseId: string;
		readonly content: string;
		readonly isError?: boolean;
	};

/** A turn in the conversation passed into adapter.send(). */
export interface UniformMessage {
	readonly role: MessageRole;
	readonly content: string | readonly MessageContent[];
}

/** Tool definition exposed to the model in a uniform request. */
export interface UniformTool {
	readonly name: string;
	readonly description: string;
	readonly inputSchema: Record<string, unknown>;
}

/**
 * A cache breakpoint hint. Adapters that support prompt caching (Anthropic
 * direct, Anthropic OAuth) emit `cache_control` markers at these positions;
 * adapters that don't (Copilot, OpenAI) silently strip them.
 */
export interface CacheBreakpoint {
	/** Index into the messages array where the breakpoint sits. */
	readonly atMessageIndex: number;
	/** Cache lifetime; only `ephemeral` is supported today. */
	readonly type: 'ephemeral';
}

/**
 * A request handed to a provider adapter's `send()` method.
 *
 * Per §5.7 of the plan, every adapter implements:
 *   send(req: UniformRequest, signal: AbortSignal): AsyncIterable<AgentEvent>
 */
export interface UniformRequest {
	readonly model: string;
	readonly messages: readonly UniformMessage[];
	readonly system?: string;
	readonly tools?: readonly UniformTool[];
	readonly maxTokens?: number;
	readonly temperature?: number;
	readonly cacheBreakpoints?: readonly CacheBreakpoint[];
	/** Correlation ID propagated from the IDE through the router. */
	readonly requestId: string;
	/** Routing context (agent role, task type) for observability. */
	readonly agentRole?: string;
	readonly taskType?: string;
}

/** A model surfaced by an adapter's listModels() method. */
export interface ModelDescriptor {
	readonly id: string;
	readonly displayName: string;
	readonly contextWindow?: number;
	readonly supportsTools?: boolean;
	readonly supportsThinking?: boolean;
	readonly supportsCaching?: boolean;
}

// ── Type guards ──────────────────────────────────────────────────────────────

export function isMessageStart(event: AgentEvent): event is MessageStartEvent {
	return event.type === 'message_start';
}

export function isTextDelta(event: AgentEvent): event is TextDeltaEvent {
	return event.type === 'text_delta';
}

export function isToolUseStart(event: AgentEvent): event is ToolUseStartEvent {
	return event.type === 'tool_use_start';
}

export function isToolUseDelta(event: AgentEvent): event is ToolUseDeltaEvent {
	return event.type === 'tool_use_delta';
}

export function isToolUseStop(event: AgentEvent): event is ToolUseStopEvent {
	return event.type === 'tool_use_stop';
}

export function isThinkingDelta(event: AgentEvent): event is ThinkingDeltaEvent {
	return event.type === 'thinking_delta';
}

export function isUsage(event: AgentEvent): event is UsageEvent {
	return event.type === 'usage';
}

export function isMessageStop(event: AgentEvent): event is MessageStopEvent {
	return event.type === 'message_stop';
}

export function isError(event: AgentEvent): event is ErrorEvent {
	return event.type === 'error';
}

/**
 * True when an event carries the final usage totals (i.e. fired alongside
 * or after the message_stop event). Lets consumers avoid double-counting
 * mid-stream usage events that some providers emit incrementally.
 */
export function isTerminal(event: AgentEvent): event is MessageStopEvent | ErrorEvent {
	return event.type === 'message_stop' || event.type === 'error';
}

/**
 * Aggregates a stream of usage events into a single running total.
 * Caller seeds with `emptyUsage()` and folds each UsageEvent through this.
 */
export function emptyUsage(): UsageEvent {
	return {
		type: 'usage',
		inputTokens: 0,
		outputTokens: 0,
		cacheCreationInputTokens: 0,
		cacheReadInputTokens: 0,
	};
}

export function addUsage(a: UsageEvent, b: UsageEvent): UsageEvent {
	return {
		type: 'usage',
		inputTokens: a.inputTokens + b.inputTokens,
		outputTokens: a.outputTokens + b.outputTokens,
		cacheCreationInputTokens:
			(a.cacheCreationInputTokens ?? 0) + (b.cacheCreationInputTokens ?? 0),
		cacheReadInputTokens:
			(a.cacheReadInputTokens ?? 0) + (b.cacheReadInputTokens ?? 0),
	};
}
