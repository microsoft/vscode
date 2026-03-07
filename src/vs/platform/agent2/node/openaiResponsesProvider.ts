/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * OpenAI Responses API model provider.
 *
 * Translates between the internal conversation format and the OpenAI
 * Responses API wire format, handles SSE streaming, and manages auth
 * via the {@link CopilotApiService}.
 *
 * Wire format types are imported from the `openai` package.
 */

import type {
	FunctionTool,
	ResponseCompletedEvent,
	ResponseErrorEvent,
	ResponseFailedEvent,
	ResponseFunctionCallArgumentsDeltaEvent,
	ResponseFunctionCallArgumentsDoneEvent,
	ResponseFunctionToolCall,
	ResponseInputItem,
	ResponseOutputItemAddedEvent,
	ResponseOutputMessage,
	ResponseReasoningSummaryTextDeltaEvent,
	ResponseStreamEvent,
	ResponseTextDeltaEvent,
} from 'openai/resources/responses/responses.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { CancellationError } from '../../../base/common/errors.js';
import { timeout } from '../../../base/common/async.js';
import { ISSEEvent, SSEParser } from '../../../base/common/sseParser.js';
import { IConversationMessage } from '../common/conversation.js';
import { IModelInfo, IModelProvider, IModelRequestConfig, ModelResponseChunk } from '../common/modelProvider.js';
import { IAgentToolDefinition } from '../common/tools.js';
import { CAPIRequestType, ICopilotApiService } from './copilotToken.js';
import { ILogService } from '../../log/common/log.js';

// -- Constants ----------------------------------------------------------------

const DEFAULT_MAX_TOKENS = 16384;

const MAX_RETRIES = 3;

/** HTTP status codes that are retryable. */
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 529]);

/** Initial base delay for exponential backoff (ms). */
const INITIAL_RETRY_DELAY_MS = 1000;

// -- Message translation ------------------------------------------------------

/**
 * Translates internal conversation messages to Responses API input items.
 */
function translateMessages(
	messages: readonly IConversationMessage[],
): ResponseInputItem[] {
	const items: ResponseInputItem[] = [];
	let replayMsgIdx = 0;

	for (const msg of messages) {
		switch (msg.role) {
			case 'user': {
				const userItem: ResponseInputItem.Message = {
					role: 'user',
					content: [{ type: 'input_text', text: msg.content }],
					type: 'message',
				};
				items.push(userItem);
				break;
			}
			case 'assistant': {
				// Build output items from the assistant's content parts.
				// Add text as a ResponseOutputMessage (required format for replaying
				// assistant turns in the Responses API).
				const textParts = msg.content.filter(p => p.type === 'text');
				if (textParts.length > 0) {
					const replayMsg: ResponseOutputMessage = {
						role: 'assistant',
						content: textParts.map(p => ({
							type: 'output_text' as const,
							text: p.text,
							annotations: [],
						})),
						id: `msg_replay_${replayMsgIdx++}`,
						status: 'completed',
						type: 'message',
					};
					items.push(replayMsg);
				}

				// Add tool calls as function_call items
				for (const part of msg.content) {
					if (part.type === 'tool-call') {
						const toolCall: ResponseFunctionToolCall = {
							type: 'function_call',
							call_id: part.toolCallId,
							name: part.toolName,
							arguments: JSON.stringify(part.arguments),
						};
						items.push(toolCall);
					}
				}
				break;
			}
			case 'tool-result': {
				const callOutput: ResponseInputItem.FunctionCallOutput = {
					type: 'function_call_output',
					call_id: msg.toolCallId,
					output: msg.content,
				};
				items.push(callOutput);
				break;
			}
			// system messages are passed via the `instructions` field, not in input
		}
	}

	return items;
}

/**
 * Translates internal tool definitions to Responses API function tools.
 */
function translateTools(tools: readonly IAgentToolDefinition[]): FunctionTool[] {
	return tools.map(tool => ({
		type: 'function' as const,
		name: tool.name,
		description: tool.description,
		parameters: tool.parametersSchema as Record<string, unknown>,
		strict: false,
	}));
}

// -- Provider -----------------------------------------------------------------

export class OpenAIResponsesProvider implements IModelProvider {
	readonly providerId = 'openai';

	constructor(
		private readonly _modelId: string,
		private readonly _apiService: ICopilotApiService,
		private readonly _logService: ILogService,
	) { }

	async *sendRequest(
		systemPrompt: string,
		messages: readonly IConversationMessage[],
		tools: readonly IAgentToolDefinition[],
		config: IModelRequestConfig,
		token: CancellationToken,
	): AsyncIterable<ModelResponseChunk> {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}

		const input = translateMessages(messages);
		const functionTools = translateTools(tools);

		const body = {
			model: this._modelId,
			input,
			instructions: systemPrompt,
			tools: functionTools.length > 0 ? functionTools : undefined,
			stream: true,
			store: false,
			max_output_tokens: config.maxOutputTokens ?? DEFAULT_MAX_TOKENS,
		};

		this._logService.debug('[OpenAI] Sending request', {
			model: this._modelId,
			inputItemCount: input.length,
			toolCount: functionTools.length,
		});

		let lastError: Error | undefined;

		for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}

			if (attempt > 0) {
				const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
				this._logService.info(`[OpenAI] Retry attempt ${attempt}/${MAX_RETRIES} after ${delay}ms`);
				await timeout(delay, token);
			}

			const response = await this._apiService.sendModelRequest(
				body,
				{ type: CAPIRequestType.ChatResponses },
				undefined,
				token,
			);

			if (!response.ok) {
				const responseText = await response.text().catch(() => '');
				lastError = new Error(`OpenAI Responses API error: ${response.status} ${response.statusText} - ${responseText}`);

				if (RETRYABLE_STATUS_CODES.has(response.status) && attempt < MAX_RETRIES) {
					this._logService.warn(`[OpenAI] Retryable error (${response.status}), will retry`, responseText);
					continue;
				}

				throw lastError;
			}

			// Stream SSE events
			yield* this._parseSSEStream(response, token);
			return;
		}

		throw lastError ?? new Error('OpenAI Responses API request failed after retries');
	}

	async listModels(): Promise<readonly IModelInfo[]> {
		return [{
			identity: { provider: 'openai', modelId: this._modelId },
			displayName: this._modelId,
			maxContextWindow: 128000,
			maxOutputTokens: DEFAULT_MAX_TOKENS,
			supportsVision: true,
			supportsReasoning: true,
		}];
	}

	// -- SSE parsing ----------------------------------------------------------

	private async *_parseSSEStream(
		response: Response,
		token: CancellationToken,
	): AsyncIterable<ModelResponseChunk> {
		const body = response.body;
		if (!body) {
			throw new Error('Response body is null');
		}

		// Use the same channel pattern as AnthropicModelProvider:
		// SSEParser pushes events into a queue via callback, we yield from it.
		const eventQueue: (ModelResponseChunk | Error | null)[] = [];
		let resolve: (() => void) | undefined;

		const waitForEvent = (): Promise<void> => {
			if (eventQueue.length > 0) {
				return Promise.resolve();
			}
			return new Promise<void>(r => { resolve = r; });
		};

		const pushEvent = (event: ModelResponseChunk | Error | null): void => {
			eventQueue.push(event);
			if (resolve) {
				const r = resolve;
				resolve = undefined;
				r();
			}
		};

		// Track function call state: key by output_index (stable across events
		// even when item IDs are obfuscated, e.g., by GPT-5 models via CAPI).
		const pendingArgs = new Map<number, string[]>();
		const pendingCallIds = new Map<number, string>();
		const pendingNames = new Map<number, string>();

		const parser = new SSEParser((sseEvent: ISSEEvent) => {
			if (sseEvent.data === '[DONE]') {
				pushEvent(null);
				return;
			}

			let parsed: unknown;
			try {
				parsed = JSON.parse(sseEvent.data);
			} catch {
				return; // Skip malformed events
			}

			const event = parsed as { type: string };
			if (!event || typeof event.type !== 'string') {
				return;
			}

			switch (event.type as ResponseStreamEvent['type']) {
				case 'response.output_text.delta': {
					const textDelta = parsed as ResponseTextDeltaEvent;
					pushEvent({ type: 'text-delta', text: textDelta.delta });
					break;
				}

				case 'response.output_item.added': {
					const itemAdded = parsed as ResponseOutputItemAddedEvent;
					if (itemAdded.item.type === 'function_call') {
						const idx = itemAdded.output_index;
						pendingArgs.set(idx, []);
						pendingCallIds.set(idx, itemAdded.item.call_id);
						pendingNames.set(idx, itemAdded.item.name);
						pushEvent({
							type: 'tool-call-start',
							toolCallId: itemAdded.item.call_id,
							toolName: itemAdded.item.name,
						});
					}
					break;
				}

				case 'response.function_call_arguments.delta': {
					const argsDelta = parsed as ResponseFunctionCallArgumentsDeltaEvent;
					const pending = pendingArgs.get(argsDelta.output_index);
					if (pending) {
						pending.push(argsDelta.delta);
						const callId = pendingCallIds.get(argsDelta.output_index) ?? argsDelta.item_id;
						pushEvent({
							type: 'tool-call-delta',
							toolCallId: callId,
							argumentsDelta: argsDelta.delta,
						});
					}
					break;
				}

				case 'response.function_call_arguments.done': {
					const argsDone = parsed as ResponseFunctionCallArgumentsDoneEvent;
					const callId = pendingCallIds.get(argsDone.output_index) ?? argsDone.item_id;
					const name = pendingNames.get(argsDone.output_index) ?? argsDone.name;
					pendingArgs.delete(argsDone.output_index);
					pendingCallIds.delete(argsDone.output_index);
					pendingNames.delete(argsDone.output_index);
					pushEvent({
						type: 'tool-call-complete',
						toolCallId: callId,
						toolName: name,
						arguments: argsDone.arguments,
					});
					break;
				}

				case 'response.reasoning_summary_text.delta': {
					const reasoningDelta = parsed as ResponseReasoningSummaryTextDeltaEvent;
					pushEvent({ type: 'thinking-delta', text: reasoningDelta.delta });
					break;
				}

				case 'response.completed': {
					const completed = parsed as ResponseCompletedEvent;
					const usage = completed.response?.usage;
					if (usage) {
						pushEvent({
							type: 'usage',
							inputTokens: usage.input_tokens,
							outputTokens: usage.output_tokens,
							reasoningTokens: usage.output_tokens_details?.reasoning_tokens,
							cacheReadTokens: usage.input_tokens_details?.cached_tokens,
							cacheCreationTokens: undefined,
						});
					}
					pushEvent(null); // End of stream
					break;
				}

				case 'error': {
					const errorEvent = parsed as ResponseErrorEvent;
					pushEvent(new Error(`OpenAI stream error: ${errorEvent.message}`));
					break;
				}

				case 'response.failed': {
					const failedEvent = parsed as ResponseFailedEvent;
					const errorDetails = failedEvent.response?.error;
					const message = errorDetails
						? `${(errorDetails as { message?: string }).message ?? 'Unknown error'}`
						: 'Response failed';
					pushEvent(new Error(`OpenAI response failed: ${message}`));
					break;
				}
			}
		});

		const reader = (body as ReadableStream<Uint8Array>).getReader();
		// Start reading in the background
		const readPromise = (async () => {
			try {
				while (true) {
					const { done, value } = await reader.read();
					if (done) {
						pushEvent(null);
						break;
					}
					parser.feed(value);
				}
			} catch (err) {
				if (token.isCancellationRequested) {
					pushEvent(new CancellationError());
				} else {
					pushEvent(err instanceof Error ? err : new Error(String(err)));
				}
			}
		})();

		try {
			while (true) {
				if (token.isCancellationRequested) {
					throw new CancellationError();
				}

				await waitForEvent();

				while (eventQueue.length > 0) {
					const event = eventQueue.shift()!;
					if (event === null) {
						return;
					}
					if (event instanceof Error) {
						throw event;
					}
					yield event;
				}
			}
		} finally {
			reader.cancel().catch(() => { });
			await readPromise.catch(() => { });
		}
	}
}
