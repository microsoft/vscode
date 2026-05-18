/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * A single context item that was included in a prompt.
 */
export interface GlassBoxContextItem {
	/** Display label (e.g. file path, symbol name) */
	readonly label: string;
	/** Type of context (file, symbol, snippet, selection, history, tool-result, etc.) */
	readonly kind: ContextItemKind;
	/** Token count consumed by this item */
	readonly tokens: number;
	/** Max tokens allocated to this item */
	readonly maxTokens: number;
	/** Relevance score: ratio of tokens used vs. max (0-1) */
	readonly relevance: number;
	/** Optional preview of the content (already sanitized) */
	readonly preview?: string;
}

export const enum ContextItemKind {
	File = 'file',
	Symbol = 'symbol',
	Selection = 'selection',
	History = 'history',
	ToolResult = 'tool-result',
	SystemMessage = 'system-message',
	UserMessage = 'user-message',
	Custom = 'custom',
}

/**
 * Snapshot of token budget for a single request.
 */
export interface TokenBudgetSnapshot {
	/** Model's maximum context window in tokens */
	readonly modelMaxTokens: number;
	/** Tokens consumed by the prompt */
	readonly promptTokens: number;
	/** Tokens consumed by completion */
	readonly completionTokens: number;
	/** Total tokens used */
	readonly totalTokens: number;
	/** Cached prompt tokens (if available) */
	readonly cachedTokens?: number;
	/** Reasoning/thinking tokens (if available) */
	readonly reasoningTokens?: number;
	/** Remaining budget */
	readonly remainingTokens: number;
	/** Breakdown by prompt element */
	readonly elementBreakdown: readonly TokenElementBreakdown[];
}

export interface TokenElementBreakdown {
	readonly name: string;
	readonly tokens: number;
	readonly maxTokens: number;
}

/**
 * Reasoning trace for a request (chain of thought).
 */
export interface ReasoningTrace {
	/** Thinking block ID */
	readonly id: string;
	/** Visible reasoning text (may be partial if encrypted) */
	readonly text: string;
	/** Number of reasoning tokens */
	readonly tokens?: number;
	/** Whether the thinking was encrypted (opaque) */
	readonly isEncrypted: boolean;
}

/**
 * Performance metrics for a single request.
 */
export interface PerformanceMetrics {
	/** Time from request start to first token (ms) */
	readonly timeToFirstTokenMs?: number;
	/** Total request duration (ms) */
	readonly totalDurationMs: number;
	/** Number of tool calls in this request */
	readonly toolCallCount: number;
	/** Tool call details */
	readonly toolCalls: readonly ToolCallMetric[];
	/** Whether the prompt hit a cache */
	readonly cacheHit: boolean;
	/** Cached token count (indicator of cache utilization) */
	readonly cachedTokens: number;
}

export interface ToolCallMetric {
	readonly name: string;
	/** Duration in ms, or undefined when the logger does not record start/end times per tool call. */
	readonly durationMs: number | undefined;
}

/**
 * Aggregate of all Glass Box data for a single request/response cycle.
 * Keyed by a stable correlation ID established at request start.
 */
export interface GlassBoxRequestAggregate {
	/** Stable correlation ID */
	readonly id: string;
	/** Human-readable label (e.g. intent name or debug name) */
	readonly label: string;
	/** Timestamp when the request started */
	readonly timestamp: number;
	/** Model used */
	readonly model: string;
	/** Context items included in the prompt */
	readonly contextItems: readonly GlassBoxContextItem[];
	/** Token budget snapshot */
	readonly tokenBudget: TokenBudgetSnapshot;
	/** Reasoning traces (may be empty if model doesn't think) */
	readonly reasoningTraces: readonly ReasoningTrace[];
	/** Performance metrics */
	readonly performance: PerformanceMetrics;
	/** Whether the request was successful */
	readonly success: boolean;
	/** Error message if failed */
	readonly errorMessage?: string;
	/** Response text from the model (sanitized, may be truncated) */
	readonly responseText?: string;
}

/**
 * Message types for communication between extension host and webview.
 */
export type GlassBoxWebviewMessage =
	| { type: 'requestsUpdated'; requests: GlassBoxRequestAggregate[] }
	| { type: 'focusRequest'; requestId: string }
	| { type: 'activeTabChanged'; tab: GlassBoxTab }
	| { type: 'availableModels'; models: Array<{ id: string; name: string; family: string }> }
	| { type: 'replayStarted'; requestId: string }
	| { type: 'replayResult'; requestId: string; responseText: string; latencyMs: number; promptTokens: number; completionTokens: number; model: string; error?: string };

export type GlassBoxHostMessage =
	| { type: 'switchTab'; tab: GlassBoxTab }
	| { type: 'focusRequest'; requestId: string }
	| { type: 'refresh' }
	| { type: 'getAvailableModels' }
	| { type: 'runReplay'; requestId: string; userQuery: string; modelId: string };

export const enum GlassBoxTab {
	Context = 'context',
	TokenBudget = 'tokenBudget',
	Reasoning = 'reasoning',
	Performance = 'performance',
	Replay = 'replay',
}
