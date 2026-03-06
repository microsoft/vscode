/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Anthropic Messages API model provider.
 *
 * Translates between the internal conversation format and the Anthropic
 * Messages API wire format, handles SSE streaming, and manages auth
 * via the {@link CopilotTokenService}.
 *
 * Wire format reference: https://docs.anthropic.com/en/api/messages
 */

import { CancellationToken } from '../../../base/common/cancellation.js';
import { CancellationError } from '../../../base/common/errors.js';
import { ISSEEvent, SSEParser } from '../../../base/common/sseParser.js';
import { IAssistantMessage, IConversationMessage, IToolResultMessage } from '../common/conversation.js';
import { IModelInfo, IModelProvider, IModelRequestConfig, ModelResponseChunk } from '../common/modelProvider.js';
import { IAgentToolDefinition } from '../common/tools.js';
import { CopilotTokenService } from './copilotToken.js';
import { ILogService } from '../../log/common/log.js';

// -- Configuration ------------------------------------------------------------

const ANTHROPIC_BETA_HEADERS = 'interleaved-thinking-2025-05-14,context-management-2025-06-27,advanced-tool-use-2025-11-20';
const DEFAULT_MAX_TOKENS = 16384;

// -- Wire format types --------------------------------------------------------

interface IAnthropicTextBlock {
	readonly type: 'text';
	readonly text: string;
}

interface IAnthropicThinkingBlock {
	readonly type: 'thinking';
	readonly thinking: string;
	readonly signature: string;
}

interface IAnthropicRedactedThinkingBlock {
	readonly type: 'redacted_thinking';
	readonly data: string;
}

interface IAnthropicToolUseBlock {
	readonly type: 'tool_use';
	readonly id: string;
	readonly name: string;
	readonly input: Record<string, unknown>;
}

interface IAnthropicToolResultBlock {
	readonly type: 'tool_result';
	readonly tool_use_id: string;
	readonly content: string;
	readonly is_error?: boolean;
}

type IAnthropicContentBlock =
	| IAnthropicTextBlock
	| IAnthropicThinkingBlock
	| IAnthropicRedactedThinkingBlock
	| IAnthropicToolUseBlock
	| IAnthropicToolResultBlock;

interface IAnthropicMessage {
	readonly role: 'user' | 'assistant';
	readonly content: readonly IAnthropicContentBlock[];
}

interface IAnthropicTool {
	readonly name: string;
	readonly description: string;
	readonly input_schema: Record<string, unknown>;
}

interface IAnthropicRequestBody {
	readonly model: string;
	readonly messages: readonly IAnthropicMessage[];
	readonly system?: readonly IAnthropicTextBlock[];
	readonly stream: true;
	readonly max_tokens: number;
	readonly tools?: readonly IAnthropicTool[];
	readonly temperature?: number;
	readonly top_p?: number;
	readonly thinking?: {
		readonly type: 'enabled' | 'adaptive';
		readonly budget_tokens?: number;
	};
}

// -- SSE event payloads -------------------------------------------------------

interface IMessageStartPayload {
	readonly type: 'message_start';
	readonly message: {
		readonly id: string;
		readonly model: string;
		readonly usage: {
			readonly input_tokens: number;
			readonly output_tokens: number;
			readonly cache_read_input_tokens?: number;
			readonly cache_creation_input_tokens?: number;
		};
	};
}

interface IContentBlockStartPayload {
	readonly type: 'content_block_start';
	readonly index: number;
	readonly content_block: {
		readonly type: 'text' | 'tool_use' | 'thinking';
		readonly text?: string;
		readonly id?: string;
		readonly name?: string;
	};
}

interface IContentBlockDeltaPayload {
	readonly type: 'content_block_delta';
	readonly index: number;
	readonly delta: {
		readonly type: 'text_delta' | 'input_json_delta' | 'thinking_delta' | 'signature_delta';
		readonly text?: string;
		readonly partial_json?: string;
		readonly thinking?: string;
		readonly signature?: string;
	};
}

interface IContentBlockStopPayload {
	readonly type: 'content_block_stop';
	readonly index: number;
}

interface IMessageDeltaPayload {
	readonly type: 'message_delta';
	readonly delta: {
		readonly stop_reason: string;
	};
	readonly usage: {
		readonly output_tokens: number;
	};
}

type IAnthropicSSEPayload =
	| IMessageStartPayload
	| IContentBlockStartPayload
	| IContentBlockDeltaPayload
	| IContentBlockStopPayload
	| IMessageDeltaPayload
	| { readonly type: 'message_stop' }
	| { readonly type: 'ping' }
	| { readonly type: 'error'; readonly error: { readonly message: string } };

// -- Provider -----------------------------------------------------------------

export class AnthropicModelProvider implements IModelProvider {
	readonly providerId = 'anthropic';

	constructor(
		private readonly _modelId: string,
		private readonly _tokenService: CopilotTokenService,
		private readonly _logService: ILogService,
		private readonly _fetch: typeof globalThis.fetch = globalThis.fetch.bind(globalThis),
	) { }

	async *sendRequest(
		systemPrompt: string,
		messages: readonly IConversationMessage[],
		tools: readonly IAgentToolDefinition[],
		config: IModelRequestConfig,
		token: CancellationToken,
	): AsyncIterable<ModelResponseChunk> {
		const copilotToken = await this._tokenService.getToken(token);
		const body = this._buildRequestBody(systemPrompt, messages, tools, config);

		this._logService.debug('[Anthropic] Sending request', { model: this._modelId, messageCount: messages.length, toolCount: tools.length });

		const abortController = new AbortController();
		const disposable = token.onCancellationRequested(() => abortController.abort());

		try {
			const response = await this._fetch(
				`${copilotToken.apiBaseUrl}/v1/messages`,
				{
					method: 'POST',
					headers: {
						'Authorization': `Bearer ${copilotToken.token}`,
						'Content-Type': 'application/json',
						'anthropic-beta': ANTHROPIC_BETA_HEADERS,
						'X-GitHub-Api-Version': '2025-10-01',
					},
					body: JSON.stringify(body),
					signal: abortController.signal,
				},
			);

			if (!response.ok) {
				const errorBody = await response.text().catch(() => '');
				throw new Error(`Anthropic API error: ${response.status} ${response.statusText}${errorBody ? ` - ${errorBody}` : ''}`);
			}

			if (!response.body) {
				throw new Error('Anthropic API returned no response body');
			}

			yield* this._parseSSEStream(response.body, token);
		} finally {
			disposable.dispose();
		}
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
	): IAnthropicRequestBody {
		const body: IAnthropicRequestBody = {
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

	private _buildThinkingConfig(config: IModelRequestConfig): { thinking?: IAnthropicRequestBody['thinking'] } {
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

	private _translateMessages(messages: readonly IConversationMessage[]): readonly IAnthropicMessage[] {
		const result: IAnthropicMessage[] = [];

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

	private _translateAssistantMessage(msg: IAssistantMessage): IAnthropicMessage {
		const content: IAnthropicContentBlock[] = [];
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
			}
		}
		return { role: 'assistant', content };
	}

	private _appendToolResult(result: IAnthropicMessage[], msg: IToolResultMessage): void {
		// Anthropic expects tool results as user messages with tool_result content blocks.
		// If the previous message is already a user message, append to it;
		// otherwise create a new user message.
		const toolResultBlock: IAnthropicToolResultBlock = {
			type: 'tool_result',
			tool_use_id: msg.toolCallId,
			content: msg.content,
			...(msg.isError ? { is_error: true } : {}),
		};

		const last = result[result.length - 1];
		if (last && last.role === 'user') {
			// Append to existing user message (mutable cast in translation layer)
			(last.content as IAnthropicContentBlock[]).push(toolResultBlock);
		} else {
			result.push({
				role: 'user',
				content: [toolResultBlock],
			});
		}
	}

	private _translateTool(tool: IAgentToolDefinition): IAnthropicTool {
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
		const blockTypes = new Map<number, 'text' | 'tool_use' | 'thinking'>();
		const blockToolIds = new Map<number, string>();
		const blockToolNames = new Map<number, string>();
		const blockArgChunks = new Map<number, string[]>();

		const parser = new SSEParser((sseEvent: ISSEEvent) => {
			if (sseEvent.data === '[DONE]') {
				pushEvent(null);
				return;
			}

			let payload: IAnthropicSSEPayload;
			try {
				payload = JSON.parse(sseEvent.data) as IAnthropicSSEPayload;
			} catch {
				return; // Skip malformed events
			}

			switch (payload.type) {
				case 'message_start': {
					const usage = payload.message.usage;
					pushEvent({
						type: 'usage',
						inputTokens: usage.input_tokens,
						outputTokens: usage.output_tokens,
						cacheReadTokens: usage.cache_read_input_tokens,
						cacheCreationTokens: usage.cache_creation_input_tokens,
					});
					break;
				}
				case 'content_block_start': {
					const block = payload.content_block;
					blockTypes.set(payload.index, block.type as 'text' | 'tool_use' | 'thinking');
					if (block.type === 'tool_use' && block.id && block.name) {
						blockToolIds.set(payload.index, block.id);
						blockToolNames.set(payload.index, block.name);
						blockArgChunks.set(payload.index, []);
						pushEvent({
							type: 'tool-call-start',
							toolCallId: block.id,
							toolName: block.name,
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
				case 'error': {
					pushEvent(new Error(`Anthropic stream error: ${payload.error.message}`));
					break;
				}
				case 'ping':
					break; // Ignore keepalive
			}
		});

		const reader = body.getReader();
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
			reader.cancel().catch(() => { });
			await readPromise.catch(() => { });
		}
	}
}
