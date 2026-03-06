/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The core agent loop.
 *
 * This is a stateless function: you give it a conversation, tools, and a model
 * configuration, and it runs the model-call / tool-execution / re-sample cycle
 * until the model produces a final response with no tool calls. It yields
 * events as it goes.
 *
 * The loop does not own the conversation history, session state, or tool
 * implementations. It receives them and produces a stream of events describing
 * what happened. The caller decides what to persist, what to show the user,
 * and when to stop.
 */

import { CancellationToken } from '../../../base/common/cancellation.js';
import { CancellationError } from '../../../base/common/errors.js';
import {
	createAssistantMessage,
	createToolResultMessage,
	IAssistantContentPart,
	IConversationMessage,
	IModelIdentity,
	IThinkingPart,
	IToolCallPart,
} from './conversation.js';
import { AgentLoopEvent } from './events.js';
import { IMiddleware, runPostResponseMiddleware, runPostToolMiddleware, runPreRequestMiddleware, runPreToolMiddleware } from './middleware.js';
import { IModelProvider, IModelRequestConfig } from './modelProvider.js';
import { IAgentTool, IAgentToolDefinition } from './tools.js';

// -- Configuration ------------------------------------------------------------

/** Maximum number of model-call/tool-execution iterations per invocation. */
const DEFAULT_MAX_ITERATIONS = 40;

/** Maximum number of post-response retries (e.g., requested by middleware). */
const DEFAULT_MAX_RETRIES = 3;

export interface IAgentLoopConfig {
	/** The model provider to use. */
	readonly modelProvider: IModelProvider;
	/** The model identity (provider + model ID) for tagging messages. */
	readonly modelIdentity: IModelIdentity;
	/** System-level instructions. */
	readonly systemPrompt: string;
	/** Available tools. */
	readonly tools: readonly IAgentTool[];
	/** Request configuration for the model. */
	readonly requestConfig?: IModelRequestConfig;
	/** Middleware chain (applied in order). */
	readonly middleware?: readonly IMiddleware[];
	/** Maximum number of model-call/tool-execution iterations. */
	readonly maxIterations?: number;
}

// -- Core loop ----------------------------------------------------------------

/**
 * Runs the agent loop: call the model, execute tool calls, feed results back,
 * repeat until the model produces a final response with no tool calls.
 *
 * @param messages - The conversation messages to start from (user message(s)
 *   at the end). The loop appends to this array internally but does not
 *   modify the original.
 * @param config - Loop configuration (model, tools, middleware, etc.).
 * @param token - Cancellation token for aborting the loop.
 * @yields {@link AgentLoopEvent} instances describing everything that happens.
 */
export async function* runAgentLoop(
	messages: readonly IConversationMessage[],
	config: IAgentLoopConfig,
	token: CancellationToken,
): AsyncGenerator<AgentLoopEvent> {
	const maxIterations = config.maxIterations ?? DEFAULT_MAX_ITERATIONS;
	const middleware = config.middleware ?? [];
	const toolMap = buildToolMap(config.tools);
	const toolDefinitions = config.tools.map(t => toToolDefinition(t));
	let currentMessages = [...messages];
	let turn = 0;

	for (let iteration = 0; iteration < maxIterations; iteration++) {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}

		turn++;

		// -- Pre-request middleware --------------------------------------------
		const preResult = await runPreRequestMiddleware(middleware, {
			messages: currentMessages,
			tools: toolDefinitions,
		});
		const requestMessages = preResult.messages;
		const requestTools = preResult.tools;

		// -- Model call -------------------------------------------------------
		yield { type: 'model-call-start', modelIdentity: config.modelIdentity, turn };
		const startTime = Date.now();

		let retryCount = 0;
		let assistantParts: IAssistantContentPart[];
		let responseText: string;

		// Retry loop for post-response middleware requesting retries
		while (true) {
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}

			const accumulated = await accumulateResponse(
				config.modelProvider,
				config.systemPrompt,
				requestMessages,
				requestTools,
				config.requestConfig ?? {},
				token,
				turn,
			);

			// Yield all streaming events
			for (const event of accumulated.events) {
				yield event;
			}

			assistantParts = accumulated.parts;
			responseText = accumulated.text;

			// -- Post-response middleware -----------------------------------------
			const hasToolCalls = assistantParts.some(p => p.type === 'tool-call');
			const postResult = await runPostResponseMiddleware(middleware, {
				responseText,
				hasToolCalls,
			});

			if (postResult.retry && retryCount < DEFAULT_MAX_RETRIES) {
				retryCount++;
				continue;
			}
			break;
		}

		const durationMs = Date.now() - startTime;
		yield { type: 'model-call-complete', modelIdentity: config.modelIdentity, turn, durationMs };

		// -- Build assistant message -------------------------------------------
		const providerMetadata = extractProviderMetadata(assistantParts);
		const assistantMessage = createAssistantMessage(
			assistantParts,
			config.modelIdentity,
			providerMetadata,
		);

		yield { type: 'assistant-message', message: assistantMessage, turn };

		currentMessages = [...currentMessages, assistantMessage];

		// -- Extract tool calls -----------------------------------------------
		const toolCalls = assistantParts.filter((p): p is IToolCallPart => p.type === 'tool-call');

		if (toolCalls.length === 0) {
			// No tool calls -- the model produced a final response.
			yield { type: 'turn-boundary', turn };
			return;
		}

		// -- Execute tool calls -----------------------------------------------
		const toolResults = yield* executeToolCalls(toolCalls, toolMap, middleware, config, token, turn);
		currentMessages = [...currentMessages, ...toolResults];
	}

	// Exceeded max iterations
	yield {
		type: 'error',
		error: new Error(`Agent loop exceeded maximum iterations (${maxIterations})`),
		fatal: true,
		turn,
	};
}

// -- Internal helpers ---------------------------------------------------------

interface IAccumulatedResponse {
	readonly parts: IAssistantContentPart[];
	readonly text: string;
	readonly events: AgentLoopEvent[];
}

/**
 * Calls the model and accumulates the streaming response into parts.
 * Also collects the streaming events to be yielded by the caller.
 */
async function accumulateResponse(
	provider: IModelProvider,
	systemPrompt: string,
	messages: readonly IConversationMessage[],
	tools: readonly IAgentToolDefinition[],
	config: IModelRequestConfig,
	token: CancellationToken,
	turn: number,
): Promise<IAccumulatedResponse> {
	const parts: IAssistantContentPart[] = [];
	const events: AgentLoopEvent[] = [];
	let fullText = '';

	// Track in-progress tool calls for argument accumulation
	const pendingToolCalls = new Map<string, { toolName: string; argumentChunks: string[] }>();

	// Track in-progress thinking blocks
	let currentThinking: { text: string; signature?: string } | undefined;

	for await (const chunk of provider.sendRequest(systemPrompt, messages, tools, config, token)) {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}

		switch (chunk.type) {
			case 'text-delta': {
				fullText += chunk.text;
				events.push({ type: 'assistant-delta', text: chunk.text, turn });
				break;
			}
			case 'tool-call-start': {
				pendingToolCalls.set(chunk.toolCallId, {
					toolName: chunk.toolName,
					argumentChunks: [],
				});
				break;
			}
			case 'tool-call-delta': {
				const pending = pendingToolCalls.get(chunk.toolCallId);
				if (pending) {
					pending.argumentChunks.push(chunk.argumentsDelta);
				}
				break;
			}
			case 'tool-call-complete': {
				pendingToolCalls.delete(chunk.toolCallId);
				const parsedArgs = parseToolArguments(chunk.arguments);
				parts.push({
					type: 'tool-call',
					toolCallId: chunk.toolCallId,
					toolName: chunk.toolName,
					arguments: parsedArgs,
				});
				break;
			}
			case 'thinking-delta': {
				if (!currentThinking) {
					currentThinking = { text: '' };
				}
				currentThinking.text += chunk.text;
				events.push({ type: 'reasoning-delta', text: chunk.text, turn });
				break;
			}
			case 'thinking-signature': {
				if (currentThinking) {
					currentThinking.signature = chunk.signature;
				}
				break;
			}
			case 'usage': {
				events.push({
					type: 'usage',
					inputTokens: chunk.inputTokens,
					outputTokens: chunk.outputTokens,
					reasoningTokens: chunk.reasoningTokens,
					cacheReadTokens: chunk.cacheReadTokens,
					cacheCreationTokens: chunk.cacheCreationTokens,
					modelIdentity: { provider: '', modelId: '' }, // Will be set by caller
					turn,
				});
				break;
			}
			case 'provider-metadata': {
				// Provider metadata is attached to the assistant message
				break;
			}
		}
	}

	// Finalize thinking part
	if (currentThinking) {
		parts.unshift({
			type: 'thinking',
			text: currentThinking.text,
			signature: currentThinking.signature,
		});
	}

	// Add text part if any text was accumulated
	if (fullText) {
		parts.push({ type: 'text', text: fullText });
	}

	return { parts, text: fullText, events };
}

/**
 * Executes tool calls, respecting readOnly flags for parallelism.
 * Read-only tools run in parallel; mutating tools run sequentially.
 */
async function* executeToolCalls(
	toolCalls: readonly IToolCallPart[],
	toolMap: ReadonlyMap<string, IAgentTool>,
	middleware: readonly IMiddleware[],
	config: IAgentLoopConfig,
	token: CancellationToken,
	turn: number,
): AsyncGenerator<AgentLoopEvent, IConversationMessage[]> {
	const results: IConversationMessage[] = [];

	// Separate read-only and mutating tool calls
	const readOnlyCalls: IToolCallPart[] = [];
	const mutatingCalls: IToolCallPart[] = [];
	for (const tc of toolCalls) {
		const tool = toolMap.get(tc.toolName);
		if (tool?.readOnly) {
			readOnlyCalls.push(tc);
		} else {
			mutatingCalls.push(tc);
		}
	}

	// Execute read-only tools in parallel
	if (readOnlyCalls.length > 0) {
		const parallelResults = await Promise.all(
			readOnlyCalls.map(tc => executeSingleTool(tc, toolMap, middleware, config, token, turn)),
		);
		for (const pr of parallelResults) {
			for (const evt of pr.events) {
				yield evt;
			}
			results.push(pr.result);
		}
	}

	// Execute mutating tools sequentially
	for (const tc of mutatingCalls) {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		const tr = await executeSingleTool(tc, toolMap, middleware, config, token, turn);
		for (const evt of tr.events) {
			yield evt;
		}
		results.push(tr.result);
	}

	return results;
}

interface IToolExecutionResult {
	readonly events: AgentLoopEvent[];
	readonly result: IConversationMessage;
}

async function executeSingleTool(
	toolCall: IToolCallPart,
	toolMap: ReadonlyMap<string, IAgentTool>,
	middleware: readonly IMiddleware[],
	config: IAgentLoopConfig,
	token: CancellationToken,
	turn: number,
): Promise<IToolExecutionResult> {
	const events: AgentLoopEvent[] = [];
	const startTime = Date.now();

	// Pre-tool middleware
	const preResult = await runPreToolMiddleware(middleware, {
		toolCallId: toolCall.toolCallId,
		toolName: toolCall.toolName,
		arguments: toolCall.arguments,
	});

	if (preResult.skip) {
		const content = preResult.cannedResult ?? 'Tool execution was skipped.';
		events.push({
			type: 'tool-start',
			toolCallId: toolCall.toolCallId,
			toolName: toolCall.toolName,
			arguments: toolCall.arguments,
			turn,
		});
		events.push({
			type: 'tool-complete',
			toolCallId: toolCall.toolCallId,
			toolName: toolCall.toolName,
			result: content,
			isError: false,
			durationMs: Date.now() - startTime,
			turn,
		});
		return {
			events,
			result: createToolResultMessage(toolCall.toolCallId, toolCall.toolName, content),
		};
	}

	const tool = toolMap.get(toolCall.toolName);
	let resultContent: string;
	let isError = false;

	events.push({
		type: 'tool-start',
		toolCallId: toolCall.toolCallId,
		toolName: toolCall.toolName,
		arguments: preResult.arguments,
		turn,
	});

	if (!tool) {
		resultContent = `Error: Unknown tool "${toolCall.toolName}". Available tools: ${[...toolMap.keys()].join(', ')}`;
		isError = true;
	} else {
		try {
			const toolResult = await tool.execute(preResult.arguments, {
				token,
				workingDirectory: config.requestConfig?.providerOptions?.['workingDirectory'] as string ?? '',
				scratchpad: new Map(),
			});
			resultContent = toolResult.content;
			isError = toolResult.isError ?? false;
		} catch (err) {
			if (err instanceof CancellationError || token.isCancellationRequested) {
				throw new CancellationError();
			}
			resultContent = `Error executing tool "${toolCall.toolName}": ${err instanceof Error ? err.message : String(err)}`;
			isError = true;
		}
	}

	// Post-tool middleware
	const postResult = await runPostToolMiddleware(middleware, {
		toolCallId: toolCall.toolCallId,
		toolName: toolCall.toolName,
		arguments: preResult.arguments,
		result: resultContent,
		isError,
	});

	const durationMs = Date.now() - startTime;
	events.push({
		type: 'tool-complete',
		toolCallId: toolCall.toolCallId,
		toolName: toolCall.toolName,
		result: postResult.result,
		isError: postResult.isError,
		durationMs,
		turn,
	});

	return {
		events,
		result: createToolResultMessage(toolCall.toolCallId, toolCall.toolName, postResult.result, postResult.isError),
	};
}

function buildToolMap(tools: readonly IAgentTool[]): Map<string, IAgentTool> {
	const map = new Map<string, IAgentTool>();
	for (const tool of tools) {
		map.set(tool.name, tool);
	}
	return map;
}

function toToolDefinition(tool: IAgentTool): IAgentToolDefinition {
	return {
		name: tool.name,
		description: tool.description,
		parametersSchema: tool.parametersSchema,
	};
}

function parseToolArguments(argsJson: string): Record<string, unknown> {
	try {
		const parsed = JSON.parse(argsJson);
		if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
			return parsed as Record<string, unknown>;
		}
		return {};
	} catch {
		return {};
	}
}

/**
 * For now, provider metadata is extracted from thinking parts' signatures
 * and stored in the message-level providerMetadata bag.
 */
function extractProviderMetadata(
	parts: readonly IAssistantContentPart[],
): Record<string, unknown> | undefined {
	const thinkingParts = parts.filter((p): p is IThinkingPart => p.type === 'thinking');
	if (thinkingParts.length === 0) {
		return undefined;
	}

	const signatures = thinkingParts
		.filter(p => p.signature)
		.map(p => p.signature!);

	if (signatures.length === 0) {
		return undefined;
	}

	return { thinkingSignatures: signatures };
}
