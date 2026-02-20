/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IPhononCliService } from '../../../../platform/phonon/common/phononCliService.js';
import { IPhononService, PHONON_CLAUDE_VENDOR, PHONON_MODELS } from '../common/phonon.js';
import {
	ChatAgentLocation,
} from '../../chat/common/constants.js';
import {
	IChatMessage,
	IChatResponsePart,
	ILanguageModelChatInfoOptions,
	ILanguageModelChatMetadata,
	ILanguageModelChatMetadataAndIdentifier,
	ILanguageModelChatProvider,
	ILanguageModelChatResponse,
} from '../../chat/common/languageModels.js';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_API_VERSION = '2023-06-01';
const PHONON_EXTENSION_ID = new ExtensionIdentifier('phonon.claude');

export class PhononLanguageModelProvider extends Disposable implements ILanguageModelChatProvider {

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;

	private _cliService: IPhononCliService | undefined;

	// Permanent request dispatch map - avoids per-request IPC subscribe/unsubscribe race
	private readonly _cliHandlers = new Map<string, {
		onText: (text: string) => void;
		onComplete: (e: { error?: string; costUsd?: number; numTurns?: number }) => void;
	}>();

	constructor(
		@IPhononService private readonly phononService: IPhononService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		this._register(this.phononService.onDidChangeConfiguration(() => {
			this._onDidChange.fire();
		}));
	}

	/**
	 * Set the CLI service for subprocess-based requests.
	 * Registers permanent IPC event listeners that dispatch by requestId.
	 */
	setCliService(cliService: IPhononCliService): void {
		this._cliService = cliService;

		// Single permanent listener for text events - dispatches to per-request handlers
		this._register(cliService.onDidReceiveText(e => {
			const handler = this._cliHandlers.get(e.requestId);
			if (handler) {
				handler.onText(e.text);
			}
		}));

		// Single permanent listener for complete events
		this._register(cliService.onDidComplete(e => {
			const handler = this._cliHandlers.get(e.requestId);
			if (handler) {
				this._cliHandlers.delete(e.requestId);
				handler.onComplete({ error: e.error, costUsd: e.costUsd, numTurns: e.numTurns });
			}
		}));
	}

	/**
	 * Trigger model resolution after the provider has been registered.
	 * Without this, the model cache stays empty on first run because
	 * ILanguageModelsService only auto-resolves when stored preferences exist.
	 */
	triggerInitialModelResolution(): void {
		this._onDidChange.fire();
	}

	async provideLanguageModelChatInfo(
		_options: ILanguageModelChatInfoOptions,
		_token: CancellationToken
	): Promise<ILanguageModelChatMetadataAndIdentifier[]> {
		const defaultModelId = this.phononService.defaultModelId;

		return PHONON_MODELS.map(model => ({
			identifier: `phonon/${model.id}`,
			metadata: {
				extension: PHONON_EXTENSION_ID,
				name: model.name,
				id: model.id,
				vendor: PHONON_CLAUDE_VENDOR,
				version: '1.0.0',
				family: model.family,
				maxInputTokens: model.maxInputTokens,
				maxOutputTokens: model.maxOutputTokens,
				isDefaultForLocation: model.id === defaultModelId
					? {
						[ChatAgentLocation.Chat]: true,
						[ChatAgentLocation.Terminal]: true,
						[ChatAgentLocation.EditorInline]: true,
						[ChatAgentLocation.Notebook]: true,
					}
					: {},
				isUserSelectable: true,
				modelPickerCategory: { label: 'Phonon (Claude)', order: 0 },
				capabilities: {
					vision: model.supportsVision,
					toolCalling: model.supportsToolCalling,
					agentMode: true,
				},
			} satisfies ILanguageModelChatMetadata,
		}));
	}

	async sendChatRequest(
		modelId: string,
		messages: IChatMessage[],
		_from: ExtensionIdentifier,
		options: { [name: string]: unknown },
		token: CancellationToken
	): Promise<ILanguageModelChatResponse> {
		// Prefer CLI (uses Max subscription, no API key needed)
		if (this._cliService && this.phononService.cliAvailable) {
			return this._sendViaCli(modelId, messages, options, token);
		}

		// Fallback: direct HTTP (requires API key)
		return this._sendViaHttp(modelId, messages, options, token);
	}

	async provideTokenCount(
		_modelId: string,
		message: string | IChatMessage,
		_token: CancellationToken
	): Promise<number> {
		// Approximate token count: ~4 chars per token for English
		const text = typeof message === 'string'
			? message
			: message.content.map(p => {
				if (p.type === 'text') { return p.value; }
				if (p.type === 'tool_result') { return JSON.stringify(p.value); }
				return '';
			}).join('');
		return Math.ceil(text.length / 4);
	}

	// --- CLI path (subprocess via main process IPC) ---

	private _sendViaCli(
		modelId: string,
		messages: IChatMessage[],
		options: { [name: string]: unknown },
		token: CancellationToken
	): ILanguageModelChatResponse {
		const cliService = this._cliService!;
		const requestId = generateUuid();
		const anthropicModelId = modelId.startsWith('phonon/') ? modelId.slice('phonon/'.length) : modelId;
		const prompt = this._serializeMessagesForCli(messages);
		const systemMessage = this._extractSystemMessage(messages) || '';
		const maxTokens = (options['maxTokens'] as number) || 8192;

		this.logService.info(`[Phonon] CLI request ${requestId}, model=${anthropicModelId}`);

		// Event→AsyncIterable bridge
		const textQueue: Array<string | null> = []; // null = stream end
		let streamError: string | undefined;
		let resolveNext: (() => void) | undefined;

		let resolveResult: () => void;
		let rejectResult: (err: Error) => void;
		const resultPromise = new Promise<void>((resolve, reject) => {
			resolveResult = resolve;
			rejectResult = reject;
		});

		// Register handlers in the permanent dispatch map (no per-request IPC listeners)
		this._cliHandlers.set(requestId, {
			onText: (text) => {
				textQueue.push(text);
				resolveNext?.();
			},
			onComplete: (e) => {
				streamError = e.error;
				textQueue.push(null); // signal end
				resolveNext?.();

				cancelListener.dispose();

				if (e.error && e.error !== 'Request cancelled') {
					rejectResult(new Error(e.error));
				} else {
					resolveResult();
				}

				if (e.costUsd !== undefined) {
					this.logService.info(`[Phonon] CLI request ${requestId} cost: $${e.costUsd.toFixed(4)}`);
				}
			},
		});

		const cancelListener = token.onCancellationRequested(() => {
			cliService.cancelRequest(requestId);
		});

		// Fire-and-forget: start the CLI process
		cliService.sendPrompt(requestId, prompt, anthropicModelId, systemMessage, maxTokens).catch(err => {
			this.logService.error(`[Phonon] CLI sendPrompt failed:`, err);
			this._cliHandlers.delete(requestId);
			streamError = err.message;
			textQueue.push(null);
			resolveNext?.();
			cancelListener.dispose();
			rejectResult(err);
		});

		const cliHandlers = this._cliHandlers;
		const cleanup = () => {
			cliHandlers.delete(requestId);
			cancelListener.dispose();
		};

		const stream: AsyncIterable<IChatResponsePart | IChatResponsePart[]> = {
			[Symbol.asyncIterator]: () => ({
				async next(): Promise<IteratorResult<IChatResponsePart | IChatResponsePart[]>> {
					while (true) {
						if (textQueue.length > 0) {
							const item = textQueue.shift()!;
							if (item === null) {
								if (streamError && streamError !== 'Request cancelled') {
									throw new Error(streamError);
								}
								return { done: true, value: undefined };
							}
							return { done: false, value: { type: 'text', value: item } };
						}
						await new Promise<void>(resolve => { resolveNext = resolve; });
					}
				},
				async return(): Promise<IteratorResult<IChatResponsePart | IChatResponsePart[]>> {
					cleanup();
					return { done: true, value: undefined };
				},
				async throw(): Promise<IteratorResult<IChatResponsePart | IChatResponsePart[]>> {
					cleanup();
					return { done: true, value: undefined };
				}
			})
		};

		return { stream, result: resultPromise };
	}

	private _serializeMessagesForCli(messages: IChatMessage[]): string {
		// Flatten conversation into a single prompt for claude -p.
		// System messages handled via --append-system-prompt.
		// For single-turn (most common), just extract the last user message text.
		// For multi-turn history, concatenate with role labels so Claude understands context.
		const nonSystemMessages = messages.filter(m => m.role !== 0);

		if (nonSystemMessages.length === 1) {
			// Single user message - pass raw text
			return nonSystemMessages[0].content
				.filter(p => p.type === 'text')
				.map(p => p.value)
				.join('\n');
		}

		// Multi-turn: include role labels for context
		const parts: string[] = [];
		for (const msg of nonSystemMessages) {
			const role = msg.role === 1 ? 'Human' : 'Assistant';
			const textParts = msg.content
				.filter(p => p.type === 'text')
				.map(p => p.value);
			if (textParts.length > 0) {
				parts.push(`${role}: ${textParts.join('\n')}`);
			}
		}
		return parts.join('\n\n');
	}

	// --- HTTP path (direct Anthropic API) ---

	private async _sendViaHttp(
		modelId: string,
		messages: IChatMessage[],
		options: { [name: string]: unknown },
		token: CancellationToken
	): Promise<ILanguageModelChatResponse> {
		const apiKey = await this.phononService.getApiKey();
		if (!apiKey) {
			throw new Error('No Claude CLI found and no API key configured. Install Claude CLI or run "Phonon: Set API Key".');
		}

		const anthropicMessages = this._convertMessages(messages);
		const systemMessage = this._extractSystemMessage(messages);
		const anthropicModelId = modelId.startsWith('phonon/') ? modelId.slice('phonon/'.length) : modelId;

		const body: Record<string, unknown> = {
			model: anthropicModelId,
			max_tokens: (options['maxTokens'] as number) || 8192,
			messages: anthropicMessages,
			stream: true,
		};

		if (systemMessage) {
			body['system'] = systemMessage;
		}

		if (options['tools'] && Array.isArray(options['tools'])) {
			body['tools'] = options['tools'];
		}

		const abortController = new AbortController();
		const cancelListener = token.onCancellationRequested(() => {
			abortController.abort();
		});

		const responsePromise = this._makeStreamingRequest(apiKey, body, abortController.signal);
		const stream = this._createResponseStream(responsePromise, abortController.signal);

		const result = responsePromise.then(() => undefined).catch(err => {
			if (!token.isCancellationRequested) {
				this.logService.error('[Phonon] HTTP request failed:', err);
				throw err;
			}
		}).finally(() => {
			cancelListener.dispose();
		});

		return { stream, result };
	}

	// --- Shared helpers ---

	private _extractSystemMessage(messages: IChatMessage[]): string | undefined {
		const systemParts: string[] = [];
		for (const msg of messages) {
			if (msg.role === 0) { // System
				for (const part of msg.content) {
					if (part.type === 'text') {
						systemParts.push(part.value);
					}
				}
			}
		}
		return systemParts.length > 0 ? systemParts.join('\n') : undefined;
	}

	// --- HTTP-specific helpers ---

	private _convertMessages(messages: IChatMessage[]): Array<{ role: string; content: unknown }> {
		const result: Array<{ role: string; content: unknown }> = [];

		for (const msg of messages) {
			if (msg.role === 0) { continue; } // System

			const role = msg.role === 1 ? 'user' : 'assistant';
			const contentParts: unknown[] = [];

			for (const part of msg.content) {
				switch (part.type) {
					case 'text':
						contentParts.push({ type: 'text', text: part.value });
						break;
					case 'image_url':
						contentParts.push({
							type: 'image',
							source: {
								type: 'base64',
								media_type: part.value.mimeType,
								data: part.value.data.toString(),
							},
						});
						break;
					case 'tool_use':
						contentParts.push({
							type: 'tool_use',
							id: part.toolCallId,
							name: part.name,
							input: part.parameters,
						});
						break;
					case 'tool_result':
						contentParts.push({
							type: 'tool_result',
							tool_use_id: part.toolCallId,
							content: part.value.map(v => {
								if (v.type === 'text') { return { type: 'text', text: v.value }; }
								return { type: 'text', text: JSON.stringify(v) };
							}),
							is_error: part.isError,
						});
						break;
					case 'thinking':
						contentParts.push({
							type: 'thinking',
							thinking: Array.isArray(part.value) ? part.value.join('') : part.value,
						});
						break;
				}
			}

			if (contentParts.length === 1 && (contentParts[0] as { type: string }).type === 'text') {
				result.push({ role, content: (contentParts[0] as { text: string }).text });
			} else {
				result.push({ role, content: contentParts });
			}
		}

		return result;
	}

	private async _makeStreamingRequest(
		apiKey: string,
		body: Record<string, unknown>,
		signal: AbortSignal
	): Promise<Response> {
		const response = await fetch(ANTHROPIC_API_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-api-key': apiKey,
				'anthropic-version': ANTHROPIC_API_VERSION,
				'anthropic-dangerous-direct-browser-access': 'true',
			},
			body: JSON.stringify(body),
			signal,
		});

		if (!response.ok) {
			const errorBody = await response.text();
			throw new Error(`Anthropic API error ${response.status}: ${errorBody}`);
		}

		return response;
	}

	private _createResponseStream(
		responsePromise: Promise<Response>,
		signal: AbortSignal
	): AsyncIterable<IChatResponsePart | IChatResponsePart[]> {
		return {
			[Symbol.asyncIterator]: () => {
				let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
				let buffer = '';
				let done = false;

				return {
					async next(): Promise<IteratorResult<IChatResponsePart | IChatResponsePart[]>> {
						if (done || signal.aborted) {
							return { done: true, value: undefined };
						}

						if (!reader) {
							try {
								const response = await responsePromise;
								const body = response.body;
								if (!body) {
									done = true;
									return { done: true, value: undefined };
								}
								reader = body.getReader();
							} catch {
								done = true;
								return { done: true, value: undefined };
							}
						}

						while (true) {
							const eventEnd = buffer.indexOf('\n\n');
							if (eventEnd !== -1) {
								const event = buffer.substring(0, eventEnd);
								buffer = buffer.substring(eventEnd + 2);

								const parts = parseSSEEvent(event);
								if (parts) {
									if (parts === 'done') {
										done = true;
										return { done: true, value: undefined };
									}
									return { done: false, value: parts };
								}
								continue;
							}

							const { done: streamDone, value } = await reader.read();
							if (streamDone) {
								done = true;
								return { done: true, value: undefined };
							}

							buffer += new TextDecoder().decode(value);
						}
					},
					async return(): Promise<IteratorResult<IChatResponsePart | IChatResponsePart[]>> {
						done = true;
						reader?.cancel();
						return { done: true, value: undefined };
					},
					async throw(): Promise<IteratorResult<IChatResponsePart | IChatResponsePart[]>> {
						done = true;
						reader?.cancel();
						return { done: true, value: undefined };
					}
				};
			}
		};
	}
}

function parseSSEEvent(event: string): IChatResponsePart | IChatResponsePart[] | 'done' | undefined {
	const lines = event.split('\n');
	let eventType = '';
	let data = '';

	for (const line of lines) {
		if (line.startsWith('event: ')) {
			eventType = line.substring(7).trim();
		} else if (line.startsWith('data: ')) {
			data = line.substring(6);
		}
	}

	if (eventType === 'message_stop') {
		return 'done';
	}

	if (!data || data === '[DONE]') {
		return undefined;
	}

	try {
		const parsed = JSON.parse(data);

		if (eventType === 'content_block_delta') {
			const delta = parsed.delta;
			if (delta?.type === 'text_delta' && delta.text) {
				return { type: 'text', value: delta.text };
			}
			if (delta?.type === 'thinking_delta' && delta.thinking) {
				return { type: 'thinking', value: delta.thinking };
			}
			if (delta?.type === 'input_json_delta' && delta.partial_json) {
				return undefined;
			}
		}

		if (eventType === 'content_block_start') {
			const contentBlock = parsed.content_block;
			if (contentBlock?.type === 'tool_use') {
				return {
					type: 'tool_use',
					name: contentBlock.name,
					toolCallId: contentBlock.id,
					parameters: contentBlock.input || {},
				};
			}
			if (contentBlock?.type === 'thinking' && contentBlock.thinking) {
				return { type: 'thinking', value: contentBlock.thinking };
			}
		}

	} catch {
		// Ignore malformed JSON
	}

	return undefined;
}
