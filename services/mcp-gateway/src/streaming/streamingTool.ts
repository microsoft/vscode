// Copyright (c) Son of Anton Contributors. All rights reserved.
// Licensed under the MIT License.

import type {
	McpToolResult,
	NotificationSink,
	StreamingToolHandler,
	ToolResultChunk,
} from './types';

/**
 * Optional `extra` shape — matches MCP's RequestHandlerExtra closely enough
 * that this can be passed straight into `server.tool(name, schema, handler)`,
 * but the only properties we touch are `signal`, `requestId`, and
 * `sendNotification`. Tests pass a stub that exposes just those.
 */
export interface StreamingToolExtra extends NotificationSink {
	readonly signal: AbortSignal;
	readonly requestId: string | number;
}

/**
 * Wraps an async-generator-style streaming tool handler into a callback the
 * MCP SDK accepts. Behaviour:
 *
 *   - `progress` chunks → sent as MCP `notifications/progress` against the
 *     current request's ID. Counter increments on every progress event so
 *     clients can render "1/2", "2/2" without explicit totals.
 *   - `partial` chunks → accumulated into a single `items` array for the
 *     final response.
 *   - `done` chunks → optional `summary` merged into the final response.
 *
 * The wrapper preserves the AbortSignal flow — if the caller cancels mid-
 * stream the generator's signal is aborted; tools that respect it return
 * promptly and the wrapper surfaces a structured error response.
 *
 * Errors are caught and converted to a tool error response so the MCP layer
 * doesn't tear down the connection.
 */
export function wrapStreamingTool<TArgs>(
	toolName: string,
	handler: StreamingToolHandler<TArgs>,
): (args: TArgs, extra: StreamingToolExtra) => Promise<McpToolResult> {
	return async (args, extra) => {
		const collected: unknown[] = [];
		let summary: unknown = undefined;
		let progressCount = 0;

		try {
			for await (const chunk of handler(args, extra.signal)) {
				processChunk(chunk, collected, () => ++progressCount, extra);
				const maybePromise = maybeSendProgress(chunk, progressCount, extra);
				if (maybePromise) {
					await maybePromise;
				}
				// Cooperative cancellation check between chunks.
				if (extra.signal.aborted) {
					throw new AbortedError();
				}
				// Track the summary if this chunk supplied one.
				if (chunk.kind === 'done' && chunk.summary !== undefined) {
					summary = chunk.summary;
				}
			}
		} catch (err) {
			return errorResponse(toolName, err);
		}

		const payload: { items: unknown[]; summary?: unknown } = { items: collected };
		if (summary !== undefined) {
			payload.summary = summary;
		}

		return {
			content: [
				{
					type: 'text',
					text: JSON.stringify(payload, null, 2),
				},
			],
		};
	};
}

class AbortedError extends Error {
	readonly aborted = true;
	constructor() {
		super('Tool execution was cancelled');
	}
}

function processChunk(
	chunk: ToolResultChunk,
	collected: unknown[],
	bumpProgress: () => number,
	_extra: StreamingToolExtra,
): void {
	if (chunk.kind === 'partial') {
		for (const item of chunk.items) {
			collected.push(item);
		}
	} else if (chunk.kind === 'progress') {
		bumpProgress();
	}
}

function maybeSendProgress(
	chunk: ToolResultChunk,
	progressCount: number,
	extra: StreamingToolExtra,
): Promise<void> | undefined {
	if (chunk.kind !== 'progress') {
		return undefined;
	}
	return extra.sendNotification({
		method: 'notifications/progress',
		params: {
			progressToken: extra.requestId,
			progress: progressCount,
			...(chunk.percent !== undefined ? { total: 100 } : {}),
			message: chunk.message,
		},
	});
}

function errorResponse(toolName: string, error: unknown): McpToolResult {
	const aborted = error instanceof AbortedError || (error instanceof Error && error.name === 'AbortError');
	const message = error instanceof Error ? error.message : String(error);
	return {
		content: [
			{
				type: 'text',
				text: JSON.stringify(
					{
						error: true,
						tool: toolName,
						cancelled: aborted,
						message: aborted ? `${toolName} cancelled` : `${toolName} failed: ${message}`,
					},
					null,
					2,
				),
			},
		],
		isError: true,
	};
}

/**
 * Convenience for testing — buffers an entire stream into an array. Useful
 * when a unit test wants to assert exactly which chunks a generator emits.
 */
export async function collectChunks<TArgs>(
	handler: StreamingToolHandler<TArgs>,
	args: TArgs,
	signal: AbortSignal = new AbortController().signal,
): Promise<ToolResultChunk[]> {
	const out: ToolResultChunk[] = [];
	for await (const chunk of handler(args, signal)) {
		out.push(chunk);
	}
	return out;
}
