/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * LLM Service - 智谱 AI GLM-4.7 模型接入
 * 文档：https://docs.bigmodel.cn/cn/api/introduction
 */

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';

export const ILLMService = createDecorator<ILLMService>('ILLMService');

// ============================================================================
// Types
// ============================================================================

export interface LLMMessage {
	role: 'system' | 'user' | 'assistant';
	content: string;
}

export interface LLMRequestOptions {
	model?: string;
	messages: LLMMessage[];
	temperature?: number;
	maxTokens?: number;
	stream?: boolean;
	/** 是否启用深度思考 */
	thinking?: boolean;
}

export interface LLMResponse {
	content: string;
	reasoning?: string;
	model: string;
	usage?: {
		promptTokens: number;
		completionTokens: number;
		totalTokens: number;
	};
}

export interface LLMStreamChunk {
	content?: string;
	reasoning?: string;
	done: boolean;
}

export interface ILLMService {
	readonly _serviceBrand: undefined;

	/** 流式输出事件 */
	readonly onDidReceiveChunk: Event<LLMStreamChunk>;

	/** 发送请求（非流式） */
	chat(options: LLMRequestOptions, token?: CancellationToken): Promise<LLMResponse>;

	/** 发送请求（流式） */
	chatStream(options: LLMRequestOptions, token?: CancellationToken): Promise<void>;

	/** 快速对话（单轮） */
	quickChat(prompt: string, systemPrompt?: string): Promise<string>;

	/** 检查服务是否可用 */
	isAvailable(): Promise<boolean>;
}

// ============================================================================
// 智谱 AI 配置
// ============================================================================

const ZHIPU_CONFIG = {
	baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
	apiKey: '20cca2b90c8c4348aaab3d4f6814c33b.Ow4WJfqfc06uB4KI',
	defaultModel: 'glm-4.7',
	defaultTemperature: 0.7,
	defaultMaxTokens: 4096
};

// ============================================================================
// Implementation
// ============================================================================

export class LLMService extends Disposable implements ILLMService {
	readonly _serviceBrand: undefined;

	private readonly _onDidReceiveChunk = this._register(new Emitter<LLMStreamChunk>());
	readonly onDidReceiveChunk = this._onDidReceiveChunk.event;

	constructor(
		@ILogService private readonly logService: ILogService
	) {
		super();
		this.logService.info('[LLMService]: Initialized with GLM-4.7');
	}

	async chat(options: LLMRequestOptions, token?: CancellationToken): Promise<LLMResponse> {
		const startTime = Date.now();
		const model = options.model ?? ZHIPU_CONFIG.defaultModel;

		this.logService.info(`[LLMService]: Chat request - model=${model}, messages=${options.messages.length}`);

		try {
			const requestBody = this.buildRequestBody(options, false);
			const response = await this.makeRequest('/chat/completions', requestBody, token);
			const data = await response.json();

			if (!response.ok) {
				throw new Error(`API Error: ${data.error?.message ?? response.statusText}`);
			}

			const result: LLMResponse = {
				content: data.choices?.[0]?.message?.content ?? '',
				reasoning: data.choices?.[0]?.message?.reasoning_content,
				model: data.model ?? model,
				usage: data.usage ? {
					promptTokens: data.usage.prompt_tokens,
					completionTokens: data.usage.completion_tokens,
					totalTokens: data.usage.total_tokens
				} : undefined
			};

			const duration = Date.now() - startTime;
			this.logService.info(`[LLMService]: Chat completed in ${duration}ms, tokens=${result.usage?.totalTokens ?? 'unknown'}`);

			return result;
		} catch (error) {
			this.logService.error(`[LLMService]: Chat failed: ${String(error)}`);
			throw error;
		}
	}

	async chatStream(options: LLMRequestOptions, token?: CancellationToken): Promise<void> {
		const model = options.model ?? ZHIPU_CONFIG.defaultModel;

		this.logService.info(`[LLMService]: Stream request - model=${model}`);

		try {
			const requestBody = this.buildRequestBody(options, true);
			const response = await this.makeRequest('/chat/completions', requestBody, token);

			if (!response.ok) {
				const data = await response.json();
				throw new Error(`API Error: ${data.error?.message ?? response.statusText}`);
			}

			const reader = response.body?.getReader();
			if (!reader) {
				throw new Error('No response body');
			}

			const decoder = new TextDecoder();
			let buffer = '';

			while (true) {
				if (token?.isCancellationRequested) {
					reader.cancel();
					break;
				}

				const { done, value } = await reader.read();
				if (done) {
					this._onDidReceiveChunk.fire({ done: true });
					break;
				}

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() ?? '';

				for (const line of lines) {
					if (line.startsWith('data: ')) {
						const data = line.slice(6).trim();
						if (data === '[DONE]') {
							this._onDidReceiveChunk.fire({ done: true });
							continue;
						}

						try {
							const parsed = JSON.parse(data);
							const delta = parsed.choices?.[0]?.delta;
							if (delta) {
								this._onDidReceiveChunk.fire({
									content: delta.content,
									reasoning: delta.reasoning_content,
									done: false
								});
							}
						} catch {
							// 忽略解析错误
						}
					}
				}
			}

			this.logService.info('[LLMService]: Stream completed');
		} catch (error) {
			this.logService.error(`[LLMService]: Stream failed: ${String(error)}`);
			throw error;
		}
	}

	async quickChat(prompt: string, systemPrompt?: string): Promise<string> {
		const messages: LLMMessage[] = [];

		if (systemPrompt) {
			messages.push({ role: 'system', content: systemPrompt });
		}
		messages.push({ role: 'user', content: prompt });

		const response = await this.chat({ messages });
		return response.content;
	}

	async isAvailable(): Promise<boolean> {
		try {
			const response = await this.chat({
				messages: [{ role: 'user', content: 'ping' }],
				maxTokens: 10
			});
			return !!response.content;
		} catch {
			return false;
		}
	}

	private buildRequestBody(options: LLMRequestOptions, stream: boolean): Record<string, unknown> {
		const body: Record<string, unknown> = {
			model: options.model ?? ZHIPU_CONFIG.defaultModel,
			messages: options.messages,
			temperature: options.temperature ?? ZHIPU_CONFIG.defaultTemperature,
			max_tokens: options.maxTokens ?? ZHIPU_CONFIG.defaultMaxTokens,
			stream
		};

		// 启用深度思考
		if (options.thinking) {
			body.thinking = { type: 'enabled' };
			body.max_tokens = 65536; // 思考模式需要更大的 token 限制
			body.temperature = 1.0; // 官方推荐
		}

		return body;
	}

	private async makeRequest(
		endpoint: string,
		body: Record<string, unknown>,
		_token?: CancellationToken
	): Promise<Response> {
		const url = `${ZHIPU_CONFIG.baseUrl}${endpoint}`;

		const response = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${ZHIPU_CONFIG.apiKey}`
			},
			body: JSON.stringify(body)
		});

		return response;
	}
}

registerSingleton(ILLMService, LLMService, InstantiationType.Delayed);
