/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';

export type ModelId = 'opus' | 'sonnet' | 'haiku';

export interface LlmMessage {
	role: 'user' | 'assistant';
	content: string;
}

export interface LlmRequestOptions {
	model: ModelId;
	messages: LlmMessage[];
	maxTokens?: number;
	systemPrompt?: string;
	signal?: AbortSignal;
	/** Enable prompt caching for the system prompt. */
	enableCaching?: boolean;
	/** Agent handle for cache metrics tracking. */
	agentHandle?: string;
}

export interface LlmStreamToken {
	type: 'token';
	token: string;
}

export interface LlmStreamComplete {
	type: 'complete';
	fullText: string;
	inputTokens: number;
	outputTokens: number;
	cachedTokens: number;
	cacheCreationTokens: number;
	cacheReadTokens: number;
}

export interface LlmStreamError {
	type: 'error';
	error: string;
}

export type LlmStreamEvent = LlmStreamToken | LlmStreamComplete | LlmStreamError;

/**
 * Routes requests to Claude models based on task complexity.
 * In Phase 1, this is a stub that will be connected to the Anthropic API.
 */
export class LlmClient {
	private totalInputTokens = 0;
	private totalOutputTokens = 0;
	private totalCachedTokens = 0;

	constructor(_context: vscode.ExtensionContext) {
		// Context reserved for future use (e.g., secrets storage)
	}

	/**
	 * Get the API key from configuration or environment.
	 */
	private getApiKey(): string | undefined {
		const config = vscode.workspace.getConfiguration('sota');
		const configKey = config.get<string>('apiKey');
		if (configKey) {
			return configKey;
		}
		return process.env['ANTHROPIC_API_KEY'];
	}

	/**
	 * Map our model shorthand to the full model ID.
	 */
	getModelId(model: ModelId): string {
		switch (model) {
			case 'opus': return 'claude-3-opus-20240229';
			case 'sonnet': return 'claude-3-sonnet-20240229';
			case 'haiku': return 'claude-3-haiku-20240307';
		}

	}

	/**
	 * Stream a request to the LLM. Returns an async iterable of stream events.
	 * In Phase 1, this returns a simulated response. Replace with actual API calls.
	 */
	async *streamRequest(options: LlmRequestOptions): AsyncGenerator<LlmStreamEvent> {
		const apiKey = this.getApiKey();

		if (!apiKey) {
			yield {
				type: 'error',
				error: 'No API key configured. Set sota.apiKey in settings or ANTHROPIC_API_KEY environment variable.'
			};
			return;
		}

		const modelId = this.getModelId(options.model);

		// Build system prompt with cache control for prompt caching
		const systemContent = options.enableCaching
			? [{ type: 'text', text: options.systemPrompt ?? 'You are a helpful coding assistant.', cache_control: { type: 'ephemeral' } }]
			: options.systemPrompt ?? 'You are a helpful coding assistant.';

		const body = {
			model: modelId,
			max_tokens: options.maxTokens ?? 4096,
			system: systemContent,
			messages: options.messages.map(m => ({
				role: m.role,
				content: m.content,
			})),
			stream: true,
		};

		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			'x-api-key': apiKey,
			'anthropic-version': '2023-06-01',
		};

		// Enable prompt caching beta header
		if (options.enableCaching) {
			headers['anthropic-beta'] = 'prompt-caching-2024-07-31';
		}

		try {
			const response = await fetch('https://api.anthropic.com/v1/messages', {
				method: 'POST',
				headers,
				body: JSON.stringify(body),
				signal: options.signal,
			});

			if (!response.ok) {
				const errorText = await response.text();
				yield { type: 'error', error: `API error ${response.status}: ${errorText}` };
				return;
			}

			const reader = response.body?.getReader();
			if (!reader) {
				yield { type: 'error', error: 'No response body' };
				return;
			}

			const decoder = new TextDecoder();
			let fullText = '';
			let inputTokens = 0;
			let outputTokens = 0;
			let cacheCreationTokens = 0;
			let cacheReadTokens = 0;
			let buffer = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) {
					break;
				}

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() ?? '';

				for (const line of lines) {
					if (!line.startsWith('data: ')) {
						continue;
					}
					const data = line.slice(6).trim();
					if (data === '[DONE]') {
						continue;
					}

					try {
						const event = JSON.parse(data);

						if (event.type === 'content_block_delta' && event.delta?.text) {
							const token = event.delta.text;
							fullText += token;
							yield { type: 'token', token };
						} else if (event.type === 'message_start' && event.message?.usage) {
							inputTokens = event.message.usage.input_tokens ?? 0;
							cacheCreationTokens = event.message.usage.cache_creation_input_tokens ?? 0;
							cacheReadTokens = event.message.usage.cache_read_input_tokens ?? 0;
						} else if (event.type === 'message_delta' && event.usage) {
							outputTokens = event.usage.output_tokens ?? 0;
						}
					} catch {
						// Skip malformed JSON lines in the stream
					}
				}
			}

			this.totalInputTokens += inputTokens;
			this.totalOutputTokens += outputTokens;
			this.totalCachedTokens += cacheReadTokens;

			yield {
				type: 'complete',
				fullText,
				inputTokens,
				outputTokens,
				cachedTokens: cacheReadTokens,
				cacheCreationTokens,
				cacheReadTokens,
			};
		} catch (err) {
			if (options.signal?.aborted) {
				yield { type: 'error', error: 'Request cancelled' };
			} else {
				yield { type: 'error', error: `Request failed: ${err}` };
			}
		}
	}

	/**
	 * Non-streaming request. Collects all tokens and returns the full response.
	 */
	async request(options: LlmRequestOptions): Promise<string> {
		let result = '';
		for await (const event of this.streamRequest(options)) {
			if (event.type === 'token') {
				result += event.token;
			} else if (event.type === 'error') {
				throw new Error(event.error);
			}
		}
		return result;
	}

	getTokenUsage(): { input: number; output: number; cached: number } {
		return {
			input: this.totalInputTokens,
			output: this.totalOutputTokens,
			cached: this.totalCachedTokens,
		};
	}

	/**
	 * Estimate cost based on token usage (approximate Claude pricing).
	 */
	estimateCost(): number {
		// Approximate pricing per 1M tokens (blended across models)
		const inputCostPer1M = 3.0;
		const outputCostPer1M = 15.0;
		return (this.totalInputTokens / 1_000_000) * inputCostPer1M +
			(this.totalOutputTokens / 1_000_000) * outputCostPer1M;
	}
}
