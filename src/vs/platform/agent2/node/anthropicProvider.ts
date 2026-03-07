/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Anthropic Messages API model provider.
 *
 * Translates between the internal conversation format and the Anthropic
 * Messages API wire format, handles SSE streaming, and manages auth
 * via the {@link CopilotApiService}.
 *
 * Wire format types are imported from the `@anthropic-ai/sdk` package.
 */

import type {
	ContentBlockParam,
	MessageCreateParams,
	MessageParam,
	RawMessageStreamEvent,
	Tool,
	ToolResultBlockParam,
} from '@anthropic-ai/sdk/resources/messages/messages.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { CancellationError } from '../../../base/common/errors.js';
import { timeout } from '../../../base/common/async.js';
import { ISSEEvent, SSEParser } from '../../../base/common/sseParser.js';
import { IAssistantMessage, IConversationMessage, IToolResultMessage } from '../common/conversation.js';
import { IModelInfo, IModelProvider, IModelRequestConfig, ModelResponseChunk } from '../common/modelProvider.js';
import { IAgentToolDefinition } from '../common/tools.js';
import { CAPIRequestType, ICopilotApiService } from './copilotToken.js';
import { ILogService } from '../../log/common/log.js';

// -- Configuration ------------------------------------------------------------

const ANTHROPIC_BETA_HEADERS = 'interleaved-thinking-2025-05-14';
const DEFAULT_MAX_TOKENS = 16384;
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 529]);

// -- Provider -----------------------------------------------------------------

export class AnthropicModelProvider implements IModelProvider {
	readonly providerId = 'anthropic';

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
		const body = this._buildRequestBody(systemPrompt, messages, tools, config);

		this._logService.debug('[Anthropic] Sending request', { model: this._modelId, messageCount: messages.length, toolCount: tools.length });

		// Retry loop with exponential backoff for transient errors
		let lastError: Error | undefined;
		for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}

			if (attempt > 0) {
				const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
				this._logService.info(`[Anthropic] Retrying after ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES + 1})`);
				await timeout(delay, token);
			}

			// Auth, URL routing, and cancellation are handled by CopilotApiService.
			const response = await this._apiService.sendModelRequest(
				body,
				{ type: CAPIRequestType.ChatMessages },
				{ 'anthropic-beta': ANTHROPIC_BETA_HEADERS },
				token,
			);

			if (!response.ok) {
				const errorBody = await response.text().catch(() => '');
				const statusCode = response.status;

				if (RETRYABLE_STATUS_CODES.has(statusCode) && attempt < MAX_RETRIES) {
					const retryAfter = response.headers?.get?.('retry-after');
					if (retryAfter) {
						const retryAfterMs = parseInt(retryAfter, 10) * 1000;
						if (!isNaN(retryAfterMs) && retryAfterMs > 0) {
							this._logService.info(`[Anthropic] Rate limited, waiting ${retryAfterMs}ms (Retry-After header)`);
							await timeout(retryAfterMs, token);
						}
					}
					lastError = new Error(`Anthropic API error: ${statusCode} ${response.statusText}${errorBody ? ` - ${errorBody}` : ''}`);
					continue;
				}

				throw new Error(`Anthropic API error: ${statusCode} ${response.statusText}${errorBody ? ` - ${errorBody}` : ''}`);
			}

			if (!response.body) {
				throw new Error('Anthropic API returned no response body');
			}

			yield* this._parseSSEStream(response.body, token);
			return; // Success -- exit retry loop
		}

		// All retries exhausted
		throw lastError ?? new Error('Anthropic API request failed after retries');
	}

	async listModels(): Promise<readonly IModelInfo[]> {
		// For now, return the configured model as the only available model.
		// Full model discovery via GET /models can be added later.
		return [{
			identity: { provider: 'anthropic', modelId: this._modelId },
			displayName: this._modelId,
			maxContextWindow: 200000,
			maxOutputTokens: DEFAULT_MAX_TOKENS,
			supportsVision: true,
			supportsReasoning: true,
			supportedReasoningEfforts: ['low', 'medium', 'high'],
			defaultReasoningEffort: 'medium',
		}];
	}

	// -- Request building -----------------------------------------------------

	private _buildRequestBody(
		systemPrompt: string,
		messages: readonly IConversationMessage[],
		tools: readonly IAgentToolDefinition[],
		config: IModelRequestConfig,
	): MessageCreateParams {
		const body: MessageCreateParams = {
			model: this._modelId,
			messages: this._translateMessages(messages),
			system: [{ type: 'text', text: systemPrompt }],
			stream: true,
			max_tokens: config.maxOutputTokens ?? DEFAULT_MAX_TOKENS,
			...(tools.length > 0 ? { tools: tools.map(t => this._translateTool(t)) } : {}),
			...(config.temperature !== undefined ? { temperature: config.temperature } : {}),
			...(this._buildThinkingConfig(config)),
		};
		return body;
	}

	private _buildThinkingConfig(config: IModelRequestConfig): { thinking?: MessageCreateParams['thinking'] } {
		const effort = config.reasoningEffort;
		if (!effort) {
			return {};
		}

		const budgetMap: Record<string, number> = {
			low: 2048,
			medium: 8192,
			high: 32768,
		};

		return {
			thinking: {
				type: 'enabled',
				budget_tokens: budgetMap[effort] ?? 8192,
			},
		};
	}

	private _translateMessages(messages: readonly IConversationMessage[]): MessageParam[] {
		const result: MessageParam[] = [];

		for (const msg of messages) {
			switch (msg.role) {
				case 'system':
					// System messages go to the top-level system field, not here
					break;
				case 'user':
					result.push({
						role: 'user',
						content: [{ type: 'text', text: msg.content }],
					});
					break;
				case 'assistant':
					result.push(this._translateAssistantMessage(msg));
					break;
				case 'tool-result':
					this._appendToolResult(result, msg);
					break;
			}
		}

		return result;
	}

	private _translateAssistantMessage(msg: IAssistantMessage): MessageParam {
		const content: ContentBlockParam[] = [];
		for (const part of msg.content) {
			switch (part.type) {
				case 'text':
					content.push({ type: 'text', text: part.text });
					break;
				case 'tool-call':
					content.push({
						type: 'tool_use',
						id: part.toolCallId,
						name: part.toolName,
						input: part.arguments,
					});
					break;
				case 'thinking':
					content.push({
						type: 'thinking',
						thinking: part.text,
						signature: part.signature ?? '',
					});
					break;
				case 'redacted-thinking':
					content.push({
						type: 'redacted_thinking',
						data: part.data,
					});
					break;
			}
		}
		return { role: 'assistant', content };
	}

	private _appendToolResult(result: MessageParam[], msg: IToolResultMessage): void {
		// Anthropic expects tool results as user messages with tool_result content blocks.
		// If the previous message is already a user message, append to it;
		// otherwise create a new user message.
		const toolResultBlock: ToolResultBlockParam = {
			type: 'tool_result',
			tool_use_id: msg.toolCallId,
			content: msg.content,
			...(msg.isError ? { is_error: true } : {}),
		};

		const last = result[result.length - 1];
		if (last && last.role === 'user') {
			// Append to existing user message (mutable cast in translation layer)
			(last.content as ContentBlockParam[]).push(toolResultBlock);
		} else {
			result.push({
				role: 'user',
				content: [toolResultBlock],
			});
		}
	}

	private _translateTool(tool: IAgentToolDefinition): Tool {
		return {
			name: tool.name,
			description: tool.description,
			input_schema: {
				type: 'object',
				...tool.parametersSchema,
			},
		};
	}

	// -- SSE stream parsing ---------------------------------------------------

	private async *_parseSSEStream(
		body: ReadableStream<Uint8Array>,
		token: CancellationToken,
	): AsyncGenerator<ModelResponseChunk> {
		// We use a channel pattern: the SSEParser pushes events into a queue,
		// and we yield them from the async generator.
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

		// State for tracking content blocks
		const blockTypes = new Map<number, string>();
		const blockToolIds = new Map<number, string>();
		const blockToolNames = new Map<number, string>();
		const blockArgChunks = new Map<number, string[]>();

		const parser = new SSEParser((sseEvent: ISSEEvent) => {
			if (sseEvent.data === '[DONE]') {
				pushEvent(null);
				return;
			}

			let parsed: { type: string };
			try {
				parsed = JSON.parse(sseEvent.data) as { type: string };
			} catch {
				return; // Skip malformed events
			}

			// Handle non-standard events that aren't in the SDK's RawMessageStreamEvent union
			if (parsed.type === 'error') {
				const errorPayload = parsed as { type: 'error'; error: { message: string } };
				pushEvent(new Error(`Anthropic stream error: ${errorPayload.error.message}`));
				return;
			}
			if (parsed.type === 'ping') {
				return; // Ignore keepalive
			}

			const payload = parsed as RawMessageStreamEvent;

			switch (payload.type) {
				case 'message_start': {
					const usage = payload.message.usage;
					pushEvent({
						type: 'usage',
						inputTokens: usage.input_tokens,
						outputTokens: usage.output_tokens,
						cacheReadTokens: usage.cache_read_input_tokens ?? undefined,
						cacheCreationTokens: usage.cache_creation_input_tokens ?? undefined,
					});
					break;
				}
				case 'content_block_start': {
					const block = payload.content_block;
					blockTypes.set(payload.index, block.type);
					if (block.type === 'tool_use' && block.id && block.name) {
						blockToolIds.set(payload.index, block.id);
						blockToolNames.set(payload.index, block.name);
						blockArgChunks.set(payload.index, []);
						pushEvent({
							type: 'tool-call-start',
							toolCallId: block.id,
							toolName: block.name,
						});
					} else if (block.type === 'redacted_thinking') {
						// Emit immediately - redacted thinking blocks carry all
						// data in the start event and have no deltas.
						pushEvent({
							type: 'redacted-thinking',
							data: (block as { data: string }).data,
						});
					}
					break;
				}
				case 'content_block_delta': {
					const delta = payload.delta;
					switch (delta.type) {
						case 'text_delta':
							if (delta.text) {
								pushEvent({ type: 'text-delta', text: delta.text });
							}
							break;
						case 'input_json_delta': {
							if (delta.partial_json) {
								const chunks = blockArgChunks.get(payload.index);
								if (chunks) {
									chunks.push(delta.partial_json);
								}
								const toolCallId = blockToolIds.get(payload.index);
								if (toolCallId) {
									pushEvent({
										type: 'tool-call-delta',
										toolCallId,
										argumentsDelta: delta.partial_json,
									});
								}
							}
							break;
						}
						case 'thinking_delta':
							if (delta.thinking) {
								pushEvent({ type: 'thinking-delta', text: delta.thinking });
							}
							break;
						case 'signature_delta':
							if (delta.signature) {
								pushEvent({ type: 'thinking-signature', signature: delta.signature });
							}
							break;
					}
					break;
				}
				case 'content_block_stop': {
					const blockType = blockTypes.get(payload.index);
					if (blockType === 'tool_use') {
						const toolCallId = blockToolIds.get(payload.index);
						const toolName = blockToolNames.get(payload.index);
						if (toolCallId && toolName) {
							const chunks = blockArgChunks.get(payload.index) ?? [];
							const argsJson = chunks.join('');
							pushEvent({
								type: 'tool-call-complete',
								toolCallId,
								toolName,
								arguments: argsJson || '{}',
							});
						}
						blockToolIds.delete(payload.index);
						blockToolNames.delete(payload.index);
						blockArgChunks.delete(payload.index);
					}
					blockTypes.delete(payload.index);
					break;
				}
				case 'message_delta': {
					pushEvent({
						type: 'usage',
						inputTokens: 0,
						outputTokens: payload.usage.output_tokens,
					});
					break;
				}
				case 'message_stop': {
					pushEvent(null); // End of stream
					break;
				}
			}
		});

		const reader = body.getReader();
		// Wake the consumer loop on cancellation so it doesn't block forever
		const cancellationListener = token.onCancellationRequested(() => {
			pushEvent(new CancellationError());
		});

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
						return; // Stream ended
					}
					if (event instanceof Error) {
						throw event;
					}
					yield event;
				}
			}
		} finally {
			cancellationListener.dispose();
			reader.cancel().catch(() => { });
			await readPromise.catch(() => { });
		}
	}
}
