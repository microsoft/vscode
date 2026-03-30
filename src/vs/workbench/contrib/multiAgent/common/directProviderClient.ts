/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IRequestService } from '../../../../../platform/request/common/request.js';
import { ISecretStorageService } from '../../../../../platform/secrets/common/secrets.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { ChatMessageRole, IChatMessage } from '../../chat/common/languageModels.js';
import { ApiFormat, IMultiAgentProviderService, IProviderAccount } from './multiAgentProviderService.js';
import { ApiFormatTranslator, IProviderStreamChunk } from './apiFormatTranslator.js';
import { IProviderRotationService } from './providerRotationService.js';

export const IDirectProviderClient = createDecorator<IDirectProviderClient>('IDirectProviderClient');

export interface IDirectProviderClient {
	readonly _serviceBrand: undefined;

	/**
	 * Send an LLM request directly to a provider API via HTTP.
	 * Handles format translation, SSE streaming, and quota extraction.
	 */
	sendRequest(
		account: IProviderAccount,
		messages: IChatMessage[],
		modelId: string,
		token: CancellationToken,
		onChunk?: (text: string) => void,
	): Promise<string>;
}

const SECRET_KEY_PREFIX = 'multiAgent.credential.';

export class DirectProviderClientImpl extends Disposable implements IDirectProviderClient {
	declare readonly _serviceBrand: undefined;

	private readonly _translator = new ApiFormatTranslator();

	constructor(
		@IRequestService private readonly _requestService: IRequestService,
		@ISecretStorageService private readonly _secretStorageService: ISecretStorageService,
		@IMultiAgentProviderService private readonly _providerService: IMultiAgentProviderService,
		@IProviderRotationService private readonly _rotationService: IProviderRotationService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	async sendRequest(
		account: IProviderAccount,
		messages: IChatMessage[],
		modelId: string,
		token: CancellationToken,
		onChunk?: (text: string) => void,
	): Promise<string> {
		const provider = this._providerService.getProvider(account.providerId);
		if (!provider) {
			throw new Error(`Provider not found: ${account.providerId}`);
		}

		// Get API key from secure storage
		const apiKey = await this._secretStorageService.get(`${SECRET_KEY_PREFIX}${account.id}`);
		if (!apiKey) {
			throw new Error(`No API key found for account: ${account.label}`);
		}

		const format = provider.apiFormat;

		// Build provider-specific request via translator
		const providerRequest = this._translator.toProviderRequest(
			messages, modelId, apiKey, format, provider.baseUrl,
		);

		this._logService.info(`[DirectClient] Sending request: provider=${provider.name}, model=${modelId}, format=${format}`);

		// Execute HTTP request
		const response = await this._requestService.request({
			type: 'POST',
			url: providerRequest.url,
			headers: providerRequest.headers,
			data: providerRequest.body,
		}, token);

		// Check for error status
		if (response.res.statusCode && response.res.statusCode >= 400) {
			if (response.res.statusCode === 429) {
				throw new Error('429: Rate limit exceeded');
			}
			throw new Error(`HTTP ${response.res.statusCode} from ${provider.name}`);
		}

		// Extract quota from response headers
		const quotaInfo = this._translator.extractQuota(
			response.res.headers as Record<string, string>,
			format,
		);
		if (Object.keys(quotaInfo).length > 0) {
			this._providerService.updateAccountQuota(account.id, quotaInfo);
		}

		// Parse SSE stream
		const responseText = await this._parseSSEStream(response.stream, format, onChunk);

		// Report usage
		const inputLength = messages.reduce((sum, m) => sum + this._messageLength(m), 0);
		const inputTokens = Math.ceil(inputLength / 4);
		const outputTokens = Math.ceil(responseText.length / 4);
		this._rotationService.reportUsage(account.id, {
			inputTokens,
			outputTokens,
			totalTokens: inputTokens + outputTokens,
			estimatedCost: (inputTokens + outputTokens) * (account.costPer1MTokens ?? 0) / 1_000_000,
			timestamp: Date.now(),
		});

		return responseText;
	}

	/**
	 * Parse an SSE stream from a VSBufferReadableStream.
	 * SSE format: lines starting with "data: " followed by JSON.
	 */
	private async _parseSSEStream(
		stream: import('../../../../../base/common/buffer.js').VSBufferReadableStream,
		format: ApiFormat,
		onChunk?: (text: string) => void,
	): Promise<string> {
		return new Promise<string>((resolve, reject) => {
			let responseText = '';
			let buffer = '';

			stream.on('data', (chunk) => {
				buffer += chunk.toString();

				// Process complete SSE lines
				const lines = buffer.split('\n');
				buffer = lines.pop() ?? ''; // Keep incomplete last line in buffer

				for (const line of lines) {
					const trimmed = line.trim();
					if (!trimmed || trimmed.startsWith(':')) {
						continue; // Skip empty lines and comments
					}

					if (trimmed.startsWith('data: ')) {
						const dataContent = trimmed.slice(6);
						const parsed: IProviderStreamChunk = this._translator.parseStreamChunk(dataContent, format);

						if (parsed.text) {
							responseText += parsed.text;
							onChunk?.(parsed.text);
						}

						if (parsed.done) {
							resolve(responseText);
							return;
						}
					}
				}
			});

			stream.on('error', (err) => {
				reject(err);
			});

			stream.on('end', () => {
				resolve(responseText);
			});
		});
	}

	private _messageLength(message: IChatMessage): number {
		if (!message.content) {
			return 0;
		}
		return message.content.reduce((sum, part) => {
			if (part.type === 'text') {
				return sum + (part as { type: 'text'; value: string }).value.length;
			}
			return sum;
		}, 0);
	}
}
