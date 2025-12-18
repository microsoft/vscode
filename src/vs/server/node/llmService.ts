/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../platform/log/common/log.js';

export interface IChatMessage {
	role: 'system' | 'user' | 'assistant';
	content: string;
}

export interface IChatRequest {
	provider: 'openai' | 'claude';
	model?: string;
	messages: IChatMessage[];
	temperature?: number;
	maxTokens?: number;
	stream?: boolean;
}

export interface IChatStreamChunk {
	type: 'text' | 'done' | 'error';
	content?: string;
	error?: string;
}

export const ILLMService = createDecorator<ILLMService>('llmService');

export interface ILLMService {
	/**
	 * Send a chat request to an LLM provider
	 */
	sendChatRequest(request: IChatRequest): AsyncIterable<IChatStreamChunk>;

	/**
	 * Check if a provider is configured
	 */
	isProviderAvailable(provider: 'openai' | 'claude'): boolean;

	/**
	 * Get available models for a provider
	 */
	getAvailableModels(provider: 'openai' | 'claude'): string[];
}

/**
 * Server-side service for LLM provider integration
 * Supports OpenAI and Claude (Anthropic) APIs
 */
export class LLMService implements ILLMService {
	private readonly openaiApiKey: string | undefined;
	private readonly openaiBaseUrl: string;
	private readonly openaiModel: string;

	private readonly claudeApiKey: string | undefined;
	private readonly claudeBaseUrl: string;
	private readonly claudeModel: string;

	constructor(
		@ILogService private readonly logService: ILogService
	) {
		// Load configuration from environment variables
		this.openaiApiKey = process.env.OPENAI_API_KEY;
		this.openaiBaseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
		this.openaiModel = process.env.OPENAI_MODEL || 'gpt-4o';

		this.claudeApiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
		this.claudeBaseUrl = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1';
		this.claudeModel = process.env.ANTHROPIC_MODEL || process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022';

		this.logService.info('[LLMService] Initialized');
		this.logService.info(`[LLMService] OpenAI available: ${!!this.openaiApiKey}`);
		this.logService.info(`[LLMService] Claude available: ${!!this.claudeApiKey}`);
	}

	isProviderAvailable(provider: 'openai' | 'claude'): boolean {
		switch (provider) {
			case 'openai':
				return !!this.openaiApiKey;
			case 'claude':
				return !!this.claudeApiKey;
			default:
				return false;
		}
	}

	getAvailableModels(provider: 'openai' | 'claude'): string[] {
		switch (provider) {
			case 'openai':
				return ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'];
			case 'claude':
				return ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'];
			default:
				return [];
		}
	}

	async *sendChatRequest(request: IChatRequest): AsyncIterable<IChatStreamChunk> {
		this.logService.info(`[LLMService] Sending ${request.provider} request with ${request.messages.length} messages`);

		try {
			if (request.provider === 'openai') {
				yield* this.sendOpenAIRequest(request);
			} else if (request.provider === 'claude') {
				yield* this.sendClaudeRequest(request);
			} else {
				yield {
					type: 'error',
					error: `Unknown provider: ${request.provider}`
				};
			}
		} catch (error) {
			this.logService.error(`[LLMService] Error: ${error}`);
			yield {
				type: 'error',
				error: String(error)
			};
		}
	}

	private async *sendOpenAIRequest(request: IChatRequest): AsyncIterable<IChatStreamChunk> {
		if (!this.openaiApiKey) {
			yield { type: 'error', error: 'OpenAI API key not configured' };
			return;
		}

		const model = request.model || this.openaiModel;
		const url = `${this.openaiBaseUrl}/chat/completions`;

		const body = {
			model,
			messages: request.messages,
			temperature: request.temperature ?? 0.7,
			max_tokens: request.maxTokens ?? 4096,
			stream: request.stream !== false
		};

		this.logService.info(`[LLMService] OpenAI request to ${url} with model ${model}`);

		const response = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${this.openaiApiKey}`
			},
			body: JSON.stringify(body)
		});

		if (!response.ok) {
			const errorText = await response.text();
			this.logService.error(`[LLMService] OpenAI error: ${response.status} ${errorText}`);
			yield {
				type: 'error',
				error: `OpenAI API error: ${response.status} ${errorText}`
			};
			return;
		}

		if (!body.stream) {
			const data = await response.json();
			yield {
				type: 'text',
				content: data.choices[0]?.message?.content || ''
			};
			yield { type: 'done' };
			return;
		}

		// Stream response
		const reader = response.body?.getReader();
		if (!reader) {
			yield { type: 'error', error: 'No response body' };
			return;
		}

		const decoder = new TextDecoder();
		let buffer = '';

		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) {
					break;
				}

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() || '';

				for (const line of lines) {
					if (line.startsWith('data: ')) {
						const data = line.substring(6).trim();
						if (data === '[DONE]') {
							yield { type: 'done' };
							continue;
						}

						try {
							const parsed = JSON.parse(data);
							const content = parsed.choices?.[0]?.delta?.content;
							if (content) {
								yield { type: 'text', content };
							}
						} catch (e) {
							// Skip invalid JSON
						}
					}
				}
			}
		} finally {
			reader.releaseLock();
		}

		yield { type: 'done' };
	}

	private async *sendClaudeRequest(request: IChatRequest): AsyncIterable<IChatStreamChunk> {
		if (!this.claudeApiKey) {
			yield { type: 'error', error: 'Claude API key not configured' };
			return;
		}

		const model = request.model || this.claudeModel;
		const url = `${this.claudeBaseUrl}/messages`;

		// Convert messages to Claude format
		// Claude requires system messages to be separate
		const systemMessage = request.messages.find(m => m.role === 'system');
		const messages = request.messages
			.filter(m => m.role !== 'system')
			.map(m => ({
				role: m.role === 'assistant' ? 'assistant' : 'user',
				content: m.content
			}));

		const body = {
			model,
			messages,
			...(systemMessage && { system: systemMessage.content }),
			temperature: request.temperature ?? 0.7,
			max_tokens: request.maxTokens ?? 4096,
			stream: request.stream !== false
		};

		this.logService.info(`[LLMService] Claude request to ${url} with model ${model}`);

		const response = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-api-key': this.claudeApiKey,
				'anthropic-version': '2023-06-01'
			},
			body: JSON.stringify(body)
		});

		if (!response.ok) {
			const errorText = await response.text();
			this.logService.error(`[LLMService] Claude error: ${response.status} ${errorText}`);
			yield {
				type: 'error',
				error: `Claude API error: ${response.status} ${errorText}`
			};
			return;
		}

		if (!body.stream) {
			const data = await response.json();
			const content = data.content?.[0]?.text || '';
			yield { type: 'text', content };
			yield { type: 'done' };
			return;
		}

		// Stream response
		const reader = response.body?.getReader();
		if (!reader) {
			yield { type: 'error', error: 'No response body' };
			return;
		}

		const decoder = new TextDecoder();
		let buffer = '';

		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) {
					break;
				}

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() || '';

				for (const line of lines) {
					if (line.startsWith('data: ')) {
						const data = line.substring(6).trim();

						try {
							const parsed = JSON.parse(data);

							if (parsed.type === 'content_block_delta') {
								const content = parsed.delta?.text;
								if (content) {
									yield { type: 'text', content };
								}
							} else if (parsed.type === 'message_stop') {
								yield { type: 'done' };
							}
						} catch (e) {
							// Skip invalid JSON
						}
					}
				}
			}
		} finally {
			reader.releaseLock();
		}

		yield { type: 'done' };
	}
}
