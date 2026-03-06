/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Middleware system for the agent loop.
 *
 * Middleware units are composable interceptors that can observe or transform
 * data flowing through the loop at defined points. This is how cross-cutting
 * concerns (context compaction, permissions, telemetry, content filtering) are
 * implemented without polluting the core loop.
 *
 * Middleware is composed in order: the first middleware in the chain runs first
 * for pre-hooks and last for post-hooks (onion model).
 */

import { IConversationMessage } from './conversation.js';
import { IAgentToolDefinition } from './tools.js';

// -- Pre-request --------------------------------------------------------------

/**
 * Context passed to pre-request middleware. The middleware can modify the
 * messages and tools before they are sent to the model.
 */
export interface IPreRequestContext {
	readonly messages: readonly IConversationMessage[];
	readonly tools: readonly IAgentToolDefinition[];
}

export interface IPreRequestResult {
	readonly messages: readonly IConversationMessage[];
	readonly tools: readonly IAgentToolDefinition[];
}

// -- Post-response ------------------------------------------------------------

/**
 * Context passed to post-response middleware after the model returns.
 */
export interface IPostResponseContext {
	/** The raw text produced by the model in this response. */
	readonly responseText: string;
	/** Whether the model requested tool calls. */
	readonly hasToolCalls: boolean;
}

export interface IPostResponseResult {
	/** If true, the loop discards this response and retries the model call. */
	readonly retry?: boolean;
}

// -- Pre-tool -----------------------------------------------------------------

/**
 * Context passed to pre-tool middleware before a tool is executed.
 */
export interface IPreToolContext {
	readonly toolCallId: string;
	readonly toolName: string;
	readonly arguments: Record<string, unknown>;
}

export interface IPreToolResult {
	/** Modified arguments to pass to the tool. */
	readonly arguments: Record<string, unknown>;
	/**
	 * If true, skip execution entirely and use the provided
	 * {@link cannedResult} instead.
	 */
	readonly skip?: boolean;
	/** Result to use if {@link skip} is true. */
	readonly cannedResult?: string;
}

// -- Post-tool ----------------------------------------------------------------

/**
 * Context passed to post-tool middleware after a tool has executed.
 */
export interface IPostToolContext {
	readonly toolCallId: string;
	readonly toolName: string;
	readonly arguments: Record<string, unknown>;
	readonly result: string;
	readonly isError: boolean;
}

export interface IPostToolResult {
	/** Modified result to feed back to the model. */
	readonly result: string;
	readonly isError: boolean;
}

// -- Middleware interface ------------------------------------------------------

/**
 * A composable middleware unit. All hooks are optional -- implement only
 * the ones you need.
 */
export interface IMiddleware {
	/**
	 * Runs before each model call. Can modify the messages and tools
	 * (e.g., for compaction, truncation, injecting context).
	 */
	preRequest?(context: IPreRequestContext): Promise<IPreRequestResult> | IPreRequestResult;

	/**
	 * Runs after each model response. Can inspect the response, emit
	 * additional events, or signal that a retry is needed.
	 */
	postResponse?(context: IPostResponseContext): Promise<IPostResponseResult> | IPostResponseResult;

	/**
	 * Runs before each tool call. Can modify tool arguments, skip execution
	 * (returning a canned result), or deny the call.
	 */
	preTool?(context: IPreToolContext): Promise<IPreToolResult> | IPreToolResult;

	/**
	 * Runs after each tool call. Can modify the result before it's fed
	 * back to the model.
	 */
	postTool?(context: IPostToolContext): Promise<IPostToolResult> | IPostToolResult;
}

/**
 * Runs pre-request middleware chain in order. Returns the final messages and tools.
 */
export async function runPreRequestMiddleware(
	middlewares: readonly IMiddleware[],
	context: IPreRequestContext,
): Promise<IPreRequestResult> {
	let result: IPreRequestResult = { messages: context.messages, tools: context.tools };
	for (const mw of middlewares) {
		if (mw.preRequest) {
			result = await mw.preRequest({ messages: result.messages, tools: result.tools });
		}
	}
	return result;
}

/**
 * Runs post-response middleware chain in order. Returns the combined result.
 */
export async function runPostResponseMiddleware(
	middlewares: readonly IMiddleware[],
	context: IPostResponseContext,
): Promise<IPostResponseResult> {
	let result: IPostResponseResult = {};
	for (const mw of middlewares) {
		if (mw.postResponse) {
			const r = await mw.postResponse(context);
			if (r.retry) {
				result = { retry: true };
			}
		}
	}
	return result;
}

/**
 * Runs pre-tool middleware chain in order. Returns the final arguments and skip info.
 */
export async function runPreToolMiddleware(
	middlewares: readonly IMiddleware[],
	context: IPreToolContext,
): Promise<IPreToolResult> {
	let result: IPreToolResult = { arguments: context.arguments };
	for (const mw of middlewares) {
		if (mw.preTool) {
			result = await mw.preTool({
				toolCallId: context.toolCallId,
				toolName: context.toolName,
				arguments: result.arguments,
			});
			if (result.skip) {
				return result;
			}
		}
	}
	return result;
}

/**
 * Runs post-tool middleware chain in order. Returns the final result.
 */
export async function runPostToolMiddleware(
	middlewares: readonly IMiddleware[],
	context: IPostToolContext,
): Promise<IPostToolResult> {
	let result: IPostToolResult = { result: context.result, isError: context.isError };
	for (const mw of middlewares) {
		if (mw.postTool) {
			result = await mw.postTool({
				toolCallId: context.toolCallId,
				toolName: context.toolName,
				arguments: context.arguments,
				result: result.result,
				isError: result.isError,
			});
		}
	}
	return result;
}
