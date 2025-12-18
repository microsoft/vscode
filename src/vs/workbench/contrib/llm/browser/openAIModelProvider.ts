/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import {
	IChatMessage,
	IChatResponseTextPart,
	ILanguageModelChatMetadataAndIdentifier,
	ILanguageModelChatProvider,
	ILanguageModelChatResponse
} from '../../../contrib/chat/common/languageModels.js';

/**
 * Language model provider for OpenAI (ChatGPT) via server API
 */
export class OpenAIModelProvider extends Disposable implements ILanguageModelChatProvider {
	private readonly _onDidChange = new Emitter<void>();
	readonly onDidChange: Event<void> = this._onDidChange.event;

	private readonly serverUrl: string;

	constructor(
		@ILogService private readonly logService: ILogService
	) {
		super();
		// Point to backend server on port 9888
		this.serverUrl = 'http://localhost:9888/api/chat';
		this.logService.info('[OpenAI] OpenAIModelProvider initialized');
	}

	/**
	 * Provide information about available OpenAI models
	 */
	async provideLanguageModelChatInfo(
		options: { silent: boolean },
		token: CancellationToken
	): Promise<ILanguageModelChatMetadataAndIdentifier[]> {
		this.logService.info('[OpenAI] provideLanguageModelChatInfo called');
		const models: ILanguageModelChatMetadataAndIdentifier[] = [
			{
				identifier: 'openai-gpt-4o',
				metadata: {
					extension: new ExtensionIdentifier('vscode.openai'),
					name: 'GPT-4o',
					id: 'gpt-4o',
					vendor: 'OpenAI',
					version: '1.0.0',
					family: 'gpt-4',
					maxInputTokens: 128000,
					maxOutputTokens: 4096,
					tooltip: 'OpenAI GPT-4o - Most capable model',
					detail: 'Powered by OpenAI API',
					isUserSelectable: true,
					isDefault: true,
					modelPickerCategory: {
						label: 'Remote Models',
						order: 1
					},
					statusIcon: ThemeIcon.fromId('cloud'),
					capabilities: {
						vision: true,
						toolCalling: true,
					}
				}
			},
			{
				identifier: 'openai-gpt-4o-mini',
				metadata: {
					extension: new ExtensionIdentifier('vscode.openai'),
					name: 'GPT-4o Mini',
					id: 'gpt-4o-mini',
					vendor: 'OpenAI',
					version: '1.0.0',
					family: 'gpt-4',
					maxInputTokens: 128000,
					maxOutputTokens: 4096,
					tooltip: 'OpenAI GPT-4o Mini - Faster and cheaper',
					detail: 'Powered by OpenAI API',
					isUserSelectable: true,
					modelPickerCategory: {
						label: 'Remote Models',
						order: 1
					},
					statusIcon: ThemeIcon.fromId('cloud'),
					capabilities: {
						vision: true,
						toolCalling: true,
					}
				}
			}
		];

		this.logService.info(`[OpenAI] Returning ${models.length} models:`, models.map(m => m.identifier));
		return models;
	}

	/**
	 * Send a chat request to OpenAI via server
	 */
	async sendChatRequest(
		modelId: string,
		messages: IChatMessage[],
		from: ExtensionIdentifier,
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		options: { [name: string]: any },
		token: CancellationToken
	): Promise<ILanguageModelChatResponse> {
		this.logService.info(`[OpenAI] Sending request with model ${modelId}`);

		// Extract actual OpenAI model name (remove 'openai-' prefix)
		const actualModel = modelId.replace('openai-', '');

		// Create the response stream
		const stream = this.createResponseStream(actualModel, messages, options, token);

		return {
			stream,
			result: Promise.resolve({})
		};
	}

	/**
	 * Create an async iterable stream of response parts
	 */
	private async *createResponseStream(
		model: string,
		messages: IChatMessage[],
		options: Record<string, unknown>,
		token: CancellationToken
	): AsyncIterable<IChatResponseTextPart> {
		try {
			// Convert messages to simple format for server
			const simplifiedMessages = messages.map(msg => ({
				role: this.convertRole(msg.role),
				content: this.extractTextContent(msg)
			}));

			const request = {
				provider: 'openai',
				model,
				messages: simplifiedMessages,
				temperature: options.temperature ?? 0.7,
				maxTokens: options.maxTokens ?? 4096,
				stream: true
			};

			this.logService.info(`[OpenAI] Calling server at ${this.serverUrl}`);

			const response = await fetch(this.serverUrl, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(request)
			});

			if (!response.ok) {
				throw new Error(`Server error: ${response.status} ${response.statusText}`);
			}

			if (!response.body) {
				throw new Error('No response body');
			}

			// Read SSE stream
			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';

			while (true) {
				if (token.isCancellationRequested) {
					reader.cancel();
					break;
				}

				const { done, value } = await reader.read();
				if (done) {
					break;
				}

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() || '';

				for (const line of lines) {
					if (line.startsWith('data: ')) {
						try {
							const data = JSON.parse(line.substring(6));

							if (data.type === 'text' && data.content) {
								yield {
									type: 'text',
									value: data.content
								};
							} else if (data.type === 'error') {
								throw new Error(data.error || 'Unknown error');
							}
							// 'done' type is just ignored
						} catch (e) {
							this.logService.error(`[OpenAI] Error parsing SSE: ${e}`);
						}
					}
				}
			}
		} catch (error) {
			this.logService.error(`[OpenAI] Error during text generation: ${error}`);
			throw error;
		}
	}

	/**
	 * Convert chat message role to server format
	 */
	private convertRole(role: number): 'system' | 'user' | 'assistant' {
		// ChatMessageRole enum: System=0, User=1, Assistant=2
		switch (role) {
			case 0: return 'system';
			case 1: return 'user';
			case 2: return 'assistant';
			default: return 'user';
		}
	}

	/**
	 * Extract text content from chat message
	 */
	private extractTextContent(message: IChatMessage): string {
		if (!message.content || !Array.isArray(message.content)) {
			return '';
		}

		return message.content
			.filter(part => part.type === 'text')
			.map(part => (part as { value?: string }).value || '')
			.join('\n');
	}

	/**
	 * Provide token count estimation
	 */
	async provideTokenCount(
		modelId: string,
		message: string | IChatMessage,
		token: CancellationToken
	): Promise<number> {
		let text: string;

		if (typeof message === 'string') {
			text = message;
		} else {
			text = this.extractTextContent(message);
		}

		// Simple estimation: ~4 characters per token
		return Math.ceil(text.length / 4);
	}

	override dispose(): void {
		this._onDidChange.dispose();
		super.dispose();
	}
}
