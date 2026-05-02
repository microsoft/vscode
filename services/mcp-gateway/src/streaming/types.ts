// Copyright (c) Son of Anton Contributors. All rights reserved.
// Licensed under the MIT License.

/**
 * Streaming tool-result chunk types (§7.2 of AGENTIC_PLATFORM_PLAN.md).
 *
 * Tool handlers that wrap their work as async generators yield these chunks
 * to communicate incremental progress to the calling agent. The MCP gateway
 * translates them into MCP `notifications/progress` and a final tool result
 * via the wrapStreamingTool() helper.
 */

/**
 * A free-form progress message emitted before or between batches of partial
 * results. Mapped to MCP's `notifications/progress` so the IDE can render a
 * live status line ("Embedding query...", "Searching repository...").
 */
export interface ProgressChunk {
	readonly kind: 'progress';
	readonly message: string;
	readonly percent?: number;
}

/**
 * A batch of partial results. Multiple `partial` chunks are concatenated
 * by the wrapper into the final result. Splitting into batches lets long
 * tools surface progress to the agent without buffering everything.
 */
export interface PartialChunk {
	readonly kind: 'partial';
	readonly items: readonly unknown[];
}

/**
 * Final marker indicating the tool finished its work successfully. The
 * optional `summary` is merged into the wrapped tool's response so callers
 * can see top-level totals or metadata alongside the streamed items.
 */
export interface DoneChunk {
	readonly kind: 'done';
	readonly summary?: unknown;
}

export type ToolResultChunk = ProgressChunk | PartialChunk | DoneChunk;

/** A streaming tool handler — exactly the shape §7.2 of the plan describes. */
export type StreamingToolHandler<TArgs> = (
	args: TArgs,
	signal: AbortSignal,
) => AsyncIterable<ToolResultChunk>;

/**
 * Minimal interface for the parts of MCP's RequestHandlerExtra the wrapper
 * actually uses. Letting the wrapper depend on this narrower shape rather
 * than the SDK's full RequestHandlerExtra makes it trivially unit-testable.
 */
export interface NotificationSink {
	sendNotification(notification: {
		method: 'notifications/progress';
		params: {
			progressToken: string | number;
			progress: number;
			total?: number;
			message?: string;
		};
	}): Promise<void>;
}

/** The shape returned by the MCP SDK's tool callbacks. */
export interface McpToolResult {
	[x: string]: unknown;
	content: Array<{ type: 'text'; text: string }>;
	isError?: boolean;
}
