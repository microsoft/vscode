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
	EasyInputMessage,
	FunctionTool,
	ResponseCompletedEvent,
	ResponseFunctionCallArgumentsDeltaEvent,
	ResponseFunctionCallArgumentsDoneEvent,
	ResponseFunctionToolCall,
	ResponseFunctionToolCallOutputItem,
	ResponseInputItem,
	ResponseOutputItemAddedEvent,
	ResponseReasoningSummaryTextDeltaEvent,
	ResponseStreamEvent,
	ResponseTextDeltaEvent,
} from 'openai/resources/responses/responses.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { CancellationError } from '../../../base/common/errors.js';
import { ISSEEvent, SSEParser } from '../../../base/common/sseParser.js';
import { IAssistantMessage, IConversationMessage, IToolResultMessage } from '../common/conversation.js';
import { IModelInfo, IModelProvider, IModelRequestConfig, ModelResponseChunk } from '../common/modelProvider.js';
import { IAgentToolDefinition } from '../common/tools.js';
import { CAPIRequestType, CopilotApiService } from './copilotToken.js';
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

	for (const msg of messages) {
		switch (msg.role) {
			case 'user': {
				items.push({
					role: 'user',
					content: msg.content,
					type: 'message',
				} satisfies EasyInputMessage as ResponseInputItem);
				break;
			}
			case 'assistant': {
				const assistantMsg = msg as IAssistantMessage;

				// Build output items from the assistant's content parts.
				// First add any text as a message.
				const textParts = assistantMsg.content.filter(p => p.type === 'text');
				if (textParts.length > 0) {
					items.push({
						role: 'assistant',
						content: textParts.map(p => p.text).join(''),
						type: 'message',
					} satisfies EasyInputMessage as ResponseInputItem);
				}

				// Add tool calls as function_call items
				for (const part of assistantMsg.content) {
					if (part.type === 'tool-call') {
						items.push({
							type: 'function_call',
							call_id: part.toolCallId,
							name: part.toolName,
							arguments: JSON.stringify(part.arguments),
						} satisfies ResponseFunctionToolCall as ResponseInputItem);
					}
				}
				break;
			}
			case 'tool-result': {
				const toolResult = msg as IToolResultMessage;
				const outputItem: ResponseFunctionToolCallOutputItem = {
					type: 'function_call_output',
					call_id: toolResult.toolCallId,
					output: toolResult.content,
					id: toolResult.toolCallId,
				};
				items.push(outputItem as ResponseInputItem);
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
		private readonly _apiService: CopilotApiService,
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
				await new Promise(resolve => setTimeout(resolve, delay));
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

		// Track function call arguments being accumulated
		const pendingArgs = new Map<string, string[]>();
		const pendingNames = new Map<string, string>();

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
						const fc = itemAdded.item as ResponseFunctionToolCall;
						pendingArgs.set(fc.call_id, []);
						pendingNames.set(fc.call_id, fc.name);
						pushEvent({
							type: 'tool-call-start',
							toolCallId: fc.call_id,
							toolName: fc.name,
						});
					}
					break;
				}

				case 'response.function_call_arguments.delta': {
					const argsDelta = parsed as ResponseFunctionCallArgumentsDeltaEvent;
					const pending = pendingArgs.get(argsDelta.item_id);
					if (pending) {
						pending.push(argsDelta.delta);
						pushEvent({
							type: 'tool-call-delta',
							toolCallId: argsDelta.item_id,
							argumentsDelta: argsDelta.delta,
						});
					}
					break;
				}

				case 'response.function_call_arguments.done': {
					const argsDone = parsed as ResponseFunctionCallArgumentsDoneEvent;
					const name = pendingNames.get(argsDone.item_id) ?? argsDone.name;
					pendingArgs.delete(argsDone.item_id);
					pendingNames.delete(argsDone.item_id);
					pushEvent({
						type: 'tool-call-complete',
						toolCallId: argsDone.item_id,
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
