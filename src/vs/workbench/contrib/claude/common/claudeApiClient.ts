/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IClaudeConfiguration, IClaudeMessage, IClaudeResponse, IClaudeStreamResponse, ClaudeModelId } from './claudeTypes.js';

export const IClaudeApiClient = createDecorator<IClaudeApiClient>('claudeApiClient');

export interface IClaudeApiClient {
	readonly _serviceBrand: undefined;

	/**
	 * Event fired when the API client configuration changes
	 */
	readonly onDidChangeConfiguration: Event<void>;

	/**
	 * Configure the API client with API key and other settings
	 */
	configure(config: IClaudeConfiguration): void;

	/**
	 * Check if the API client is properly configured
	 */
	isConfigured(): boolean;

	/**
	 * Send a message to Claude and get a streaming response
	 */
	sendMessage(
		messages: IClaudeMessage[],
		model: ClaudeModelId,
		options?: {
			maxTokens?: number;
			temperature?: number;
			tools?: any[];
			toolChoice?: any;
		},
		onProgress?: (chunk: IClaudeStreamResponse) => void,
		token?: CancellationToken
	): Promise<IClaudeResponse>;

	/**
	 * Count tokens in a message (estimation)
	 */
	estimateTokens(text: string): number;

	/**
	 * Test the API connection
	 */
	testConnection(token?: CancellationToken): Promise<boolean>;
}

export class ClaudeApiClient implements IClaudeApiClient {
	readonly _serviceBrand: undefined;

	private _configuration: IClaudeConfiguration | undefined;
	private readonly _onDidChangeConfiguration = new Event<void>();
	readonly onDidChangeConfiguration = this._onDidChangeConfiguration.event;

	constructor() {
	}

	configure(config: IClaudeConfiguration): void {
		this._configuration = { ...config };
		this._onDidChangeConfiguration.fire();
	}

	isConfigured(): boolean {
		return !!this._configuration?.apiKey;
	}

	async sendMessage(
		messages: IClaudeMessage[],
		model: ClaudeModelId,
		options: {
			maxTokens?: number;
			temperature?: number;
			tools?: any[];
			toolChoice?: any;
		} = {},
		onProgress?: (chunk: IClaudeStreamResponse) => void,
		token?: CancellationToken
	): Promise<IClaudeResponse> {
		if (!this._configuration) {
			throw new Error('Claude API client is not configured');
		}

		const requestBody = {
			model,
			max_tokens: options.maxTokens || this._configuration.maxTokens || 4096,
			temperature: options.temperature ?? this._configuration.temperature ?? 0.7,
			messages: messages.filter(m => m.role !== 'system'),
			system: messages.find(m => m.role === 'system')?.content,
			stream: !!onProgress,
			...(options.tools && { tools: options.tools }),
			...(options.toolChoice && { tool_choice: options.toolChoice })
		};

		const baseUrl = this._configuration.baseUrl || 'https://api.anthropic.com';
		const url = `${baseUrl}/v1/messages`;

		const headers = {
			'Content-Type': 'application/json',
			'x-api-key': this._configuration.apiKey,
			'anthropic-version': '2023-06-01'
		};

		try {
			const response = await fetch(url, {
				method: 'POST',
				headers,
				body: JSON.stringify(requestBody),
				signal: token?.onCancellationRequested ? AbortSignal.timeout(30000) : undefined
			});

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`Claude API error: ${response.status} ${response.statusText} - ${errorText}`);
			}

			if (onProgress) {
				return this._handleStreamingResponse(response, onProgress, token);
			} else {
				return await response.json() as IClaudeResponse;
			}
		} catch (error) {
			if (token?.isCancellationRequested) {
				throw new Error('Request was cancelled');
			}
			throw error;
		}
	}

	private async _handleStreamingResponse(
		response: Response,
		onProgress: (chunk: IClaudeStreamResponse) => void,
		token?: CancellationToken
	): Promise<IClaudeResponse> {
		const reader = response.body?.getReader();
		if (!reader) {
			throw new Error('No response body');
		}

		const decoder = new TextDecoder();
		let buffer = '';
		let finalResponse: IClaudeResponse | undefined;

		try {
			while (true) {
				if (token?.isCancellationRequested) {
					throw new Error('Request was cancelled');
				}

				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() || '';

				for (const line of lines) {
					if (line.startsWith('data: ')) {
						const data = line.slice(6);
						if (data === '[DONE]') continue;

						try {
							const chunk = JSON.parse(data) as IClaudeStreamResponse;
							onProgress(chunk);

							// Build final response from chunks
							if (chunk.type === 'message_start' && chunk.message) {
								finalResponse = chunk.message as IClaudeResponse;
							} else if (chunk.type === 'content_block_delta' && chunk.delta && finalResponse) {
								if (!finalResponse.content) {
									finalResponse.content = [{ type: 'text', text: '' }];
								}
								if (finalResponse.content[0]) {
									finalResponse.content[0].text += chunk.delta.text;
								}
							} else if (chunk.type === 'message_delta' && chunk.usage && finalResponse) {
								finalResponse.usage = chunk.usage;
							}
						} catch (e) {
							// Skip invalid JSON chunks
						}
					}
				}
			}
		} finally {
			reader.releaseLock();
		}

		if (!finalResponse) {
			throw new Error('No valid response received from Claude API');
		}

		return finalResponse;
	}

	estimateTokens(text: string): number {
		// Rough estimation: ~4 characters per token for English text
		return Math.ceil(text.length / 4);
	}

	async testConnection(token?: CancellationToken): Promise<boolean> {
		try {
			const testMessage: IClaudeMessage = {
				role: 'user',
				content: 'Hello'
			};

			await this.sendMessage([testMessage], 'claude-3-5-haiku-20241022', { maxTokens: 10 }, undefined, token);
			return true;
		} catch (error) {
			return false;
		}
	}
}
