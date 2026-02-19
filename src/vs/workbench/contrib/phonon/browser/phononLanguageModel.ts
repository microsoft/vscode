/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
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
		const apiKey = await this.phononService.getApiKey();
		if (!apiKey) {
			throw new Error('Anthropic API key not configured. Set it via Phonon: Set API Key command.');
		}

		const anthropicMessages = this._convertMessages(messages);
		const systemMessage = this._extractSystemMessage(messages);

		// Strip the "phonon/" prefix - the Anthropic API expects bare model IDs
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

		// Add tools if provided
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
				this.logService.error('[Phonon] Request failed:', err);
				throw err;
			}
		}).finally(() => {
			cancelListener.dispose();
		});

		return { stream, result };
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

	private _convertMessages(messages: IChatMessage[]): Array<{ role: string; content: unknown }> {
		const result: Array<{ role: string; content: unknown }> = [];

		for (const msg of messages) {
			if (msg.role === 0) { // System - handled separately
				continue;
			}

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

			// If only one text part, simplify to string content
			if (contentParts.length === 1 && (contentParts[0] as { type: string }).type === 'text') {
				result.push({ role, content: (contentParts[0] as { text: string }).text });
			} else {
				result.push({ role, content: contentParts });
			}
		}

		return result;
	}

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
							// Process buffered SSE events first
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

							// Read more data
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
				// Tool use input streaming - accumulate, don't emit yet
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
