/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { IRequestService, asText } from '../../../../../../platform/request/common/request.js';
import {
	DSpaceModelId,
	IDSpaceMessage,
	IDSpaceModelProvider,
	IDSpaceStreamChunk,
	IDSpaceTool,
	IDSpaceToolCall,
} from './modelProvider.js';

interface IDSpaceChatConfig {
	backendUrl?: string;
	apiKey?: string;
}

interface IProductServiceWithDSpace extends IProductService {
	dSpaceChat?: IDSpaceChatConfig;
}

/**
 * Online model provider that calls the DSpace backend server
 * The server proxies requests to OpenAI or other cloud providers
 */
export class OnlineModelProvider implements IDSpaceModelProvider {
	readonly id = DSpaceModelId.Online;
	readonly name = 'DSpace Online';

	constructor(
		@ILogService private readonly logService: ILogService,
		@IRequestService private readonly requestService: IRequestService,
		@IProductService private readonly productService: IProductService
	) { }

	/**
	 * Check if the online provider is available
	 * Uses navigator.onLine for quick check
	 */
	async isAvailable(): Promise<boolean> {
		// Check browser online status
		if (typeof navigator !== 'undefined' && !navigator.onLine) {
			return false;
		}

		// Optionally could do a health check to the backend
		// For now, just trust navigator.onLine
		return true;
	}

	/**
	 * Get the backend URL from product configuration or default
	 */
	private getBackendUrl(): string {
		const config = (this.productService as IProductServiceWithDSpace).dSpaceChat;

		if (config?.backendUrl && config.backendUrl !== '__DSPACE_CHAT_BACKEND_URL__') {
			return config.backendUrl;
		}

		return 'https://api.dspace.writefull.com';
	}

	/**
	 * Get the API key from product configuration
	 */
	private getApiKey(): string {
		const config = (this.productService as IProductServiceWithDSpace).dSpaceChat;

		if (config?.apiKey && config.apiKey !== '__DSPACE_CHAT_API_KEY__') {
			return config.apiKey;
		}

		throw new Error('DSpace Chat API key is not configured. Please set dSpaceChat.apiKey in product.json or product.overrides.json');
	}

	/**
	 * Generate streaming response from the backend
	 */
	async *generateStream(
		messages: IDSpaceMessage[],
		tools: IDSpaceTool[],
		token: CancellationToken
	): AsyncIterable<IDSpaceStreamChunk> {
		const requestBody = {
			messages,
			tools,
		};

		const backendUrl = this.getBackendUrl();
		const apiKey = this.getApiKey();

		this.logService.info('[OnlineModelProvider] Starting request to backend');

		const response = await this.requestService.request(
			{
				type: 'POST',
				url: `${backendUrl}/v1/chat/completions`,
				data: JSON.stringify(requestBody),
				headers: {
					'Content-Type': 'application/json',
					'x-api-key': apiKey,
				},
				timeout: 120000,
			},
			token
		);

		if (response.res.statusCode !== 200) {
			const errorText = await asText(response);
			throw new Error(`Backend returned ${response.res.statusCode}: ${errorText}`);
		}

		// Create a queue-based async iterator for the SSE stream
		const chunkQueue: IDSpaceStreamChunk[] = [];
		let streamEnded = false;
		let streamError: Error | undefined;
		let resolveNext: (() => void) | undefined;

		// Tool calls accumulator
		const toolCallsBuffer = new Map<number, { id?: string; name?: string; arguments?: string }>();

		const processSSELine = (line: string) => {
			if (!line.startsWith('data: ')) {
				return;
			}

			const data = line.slice(6);
			if (data === '[DONE]') {
				return;
			}

			try {
				const parsed = JSON.parse(data);
				const choice = parsed.choices?.[0];
				if (!choice) {
					return;
				}

				const delta = choice.delta;
				const finishReason = choice.finish_reason;

				// Handle text content
				if (delta?.content) {
					chunkQueue.push({
						type: 'text',
						content: delta.content,
					});
					resolveNext?.();
				}

				// Accumulate tool calls
				if (delta?.tool_calls) {
					for (const toolCall of delta.tool_calls) {
						const index = toolCall.index ?? 0;

						if (!toolCallsBuffer.has(index)) {
							toolCallsBuffer.set(index, {
								id: toolCall.id,
								name: toolCall.function?.name,
								arguments: toolCall.function?.arguments || '',
							});
						} else {
							const existing = toolCallsBuffer.get(index)!;
							if (toolCall.id) {
								existing.id = toolCall.id;
							}
							if (toolCall.function?.name) {
								existing.name = toolCall.function.name;
							}
							if (toolCall.function?.arguments) {
								existing.arguments += toolCall.function.arguments;
							}
						}
					}
				}

				// Handle finish reason
				if (finishReason) {
					if (finishReason === 'tool_calls' && toolCallsBuffer.size > 0) {
						// Emit tool calls
						const toolCalls: IDSpaceToolCall[] = [];
						for (const tc of toolCallsBuffer.values()) {
							if (tc.id && tc.name && tc.arguments !== undefined) {
								toolCalls.push({
									id: tc.id,
									type: 'function',
									function: {
										name: tc.name,
										arguments: tc.arguments,
									},
								});
							}
						}
						if (toolCalls.length > 0) {
							chunkQueue.push({
								type: 'tool_calls',
								toolCalls,
								finishReason,
							});
						}
						toolCallsBuffer.clear();
					}

					chunkQueue.push({
						type: 'done',
						finishReason,
					});
					resolveNext?.();
				}
			} catch (e) {
				this.logService.warn('[OnlineModelProvider] Failed to parse SSE chunk:', e);
			}
		};

		// Set up stream processing
		const streamPromise = new Promise<void>((resolve, reject) => {
			const disposables = new DisposableStore();
			let buffer = '';
			const decoder = new TextDecoder();

			disposables.add(token.onCancellationRequested(() => {
				streamError = new CancellationError();
				streamEnded = true;
				resolveNext?.();
				disposables.dispose();
				reject(streamError);
			}));

			response.stream.on('data', (chunk) => {
				if (token.isCancellationRequested) {
					return;
				}

				buffer += decoder.decode(chunk.buffer, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() || '';

				for (const line of lines) {
					processSSELine(line);
				}
			});

			response.stream.on('end', () => {
				// Process any remaining buffer
				if (buffer) {
					processSSELine(buffer);
				}
				streamEnded = true;
				resolveNext?.();
				disposables.dispose();
				resolve();
			});

			response.stream.on('error', (error) => {
				streamError = error instanceof Error ? error : new Error(String(error));
				streamEnded = true;
				resolveNext?.();
				disposables.dispose();
				reject(streamError);
			});
		});

		// Don't await here - let it run in the background
		streamPromise.catch(() => { /* Error will be thrown from the iterator */ });

		// Yield chunks as they arrive
		while (true) {
			if (chunkQueue.length > 0) {
				yield chunkQueue.shift()!;
			} else if (streamEnded) {
				if (streamError) {
					throw streamError;
				}
				break;
			} else {
				// Wait for next chunk
				await new Promise<void>(resolve => {
					resolveNext = resolve;
					setTimeout(resolve, 50); // Timeout to prevent infinite waiting
				});
			}
		}

		this.logService.info('[OnlineModelProvider] Stream completed');
	}
}

