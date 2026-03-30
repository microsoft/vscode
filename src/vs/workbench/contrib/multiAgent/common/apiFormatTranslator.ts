/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChatMessageRole, IChatMessage } from '../../chat/common/languageModels.js';
import { ApiFormat, IQuotaStatus } from './multiAgentProviderService.js';

// --- Provider request/response types ---

export interface IProviderRequest {
	readonly url: string;
	readonly headers: Record<string, string>;
	readonly body: string;
}

export interface IProviderStreamChunk {
	readonly text: string;
	readonly done: boolean;
}

/**
 * Bidirectional format translator between VS Code's internal IChatMessage format
 * and provider-specific API formats (Anthropic, OpenAI, Google).
 *
 * Pure functions — no IO, no state, fully unit-testable.
 */
export class ApiFormatTranslator {

	// --- Request building ---

	/**
	 * Convert internal messages to a provider-specific HTTP request.
	 */
	toProviderRequest(
		messages: IChatMessage[],
		modelId: string,
		apiKey: string,
		format: ApiFormat,
		baseUrl: string,
	): IProviderRequest {
		switch (format) {
			case 'anthropic': return this._toAnthropicRequest(messages, modelId, apiKey, baseUrl);
			case 'openai': return this._toOpenAIRequest(messages, modelId, apiKey, baseUrl);
			case 'google': return this._toGoogleRequest(messages, modelId, apiKey, baseUrl);
		}
	}

	private _toAnthropicRequest(messages: IChatMessage[], modelId: string, apiKey: string, baseUrl: string): IProviderRequest {
		// Extract system message (Anthropic uses top-level `system` field)
		const systemMsg = messages.find(m => m.role === ChatMessageRole.System);
		const systemText = systemMsg ? this._extractText(systemMsg) : undefined;

		// Convert non-system messages
		const apiMessages = messages
			.filter(m => m.role !== ChatMessageRole.System)
			.map(m => ({
				role: m.role === ChatMessageRole.User ? 'user' : 'assistant',
				content: this._extractText(m),
			}));

		const body: Record<string, unknown> = {
			model: modelId,
			max_tokens: 4096,
			messages: apiMessages,
			stream: true,
		};
		if (systemText) {
			body.system = systemText;
		}

		return {
			url: `${baseUrl}/v1/messages`,
			headers: {
				'Content-Type': 'application/json',
				'x-api-key': apiKey,
				'anthropic-version': '2023-06-01',
			},
			body: JSON.stringify(body),
		};
	}

	private _toOpenAIRequest(messages: IChatMessage[], modelId: string, apiKey: string, baseUrl: string): IProviderRequest {
		// OpenAI keeps system as a regular message with role "system"
		const apiMessages = messages.map(m => ({
			role: m.role === ChatMessageRole.System ? 'system'
				: m.role === ChatMessageRole.User ? 'user'
					: 'assistant',
			content: this._extractText(m),
		}));

		return {
			url: `${baseUrl}/chat/completions`,
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${apiKey}`,
			},
			body: JSON.stringify({
				model: modelId,
				messages: apiMessages,
				stream: true,
			}),
		};
	}

	private _toGoogleRequest(messages: IChatMessage[], modelId: string, apiKey: string, baseUrl: string): IProviderRequest {
		// Google: system goes to systemInstruction, assistant→"model"
		const systemMsg = messages.find(m => m.role === ChatMessageRole.System);
		const contents = messages
			.filter(m => m.role !== ChatMessageRole.System)
			.map(m => ({
				role: m.role === ChatMessageRole.User ? 'user' : 'model',
				parts: [{ text: this._extractText(m) }],
			}));

		const body: Record<string, unknown> = { contents };
		if (systemMsg) {
			body.systemInstruction = { parts: [{ text: this._extractText(systemMsg) }] };
		}

		return {
			url: `${baseUrl}/v1beta/models/${modelId}:streamGenerateContent?key=${apiKey}&alt=sse`,
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
		};
	}

	// --- SSE Stream parsing ---

	/**
	 * Parse a single SSE data line into a text chunk.
	 */
	parseStreamChunk(dataLine: string, format: ApiFormat): IProviderStreamChunk {
		switch (format) {
			case 'anthropic': return this._parseAnthropicChunk(dataLine);
			case 'openai': return this._parseOpenAIChunk(dataLine);
			case 'google': return this._parseGoogleChunk(dataLine);
		}
	}

	private _parseAnthropicChunk(dataLine: string): IProviderStreamChunk {
		try {
			const json = JSON.parse(dataLine);
			if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') {
				return { text: json.delta.text, done: false };
			}
			if (json.type === 'message_stop') {
				return { text: '', done: true };
			}
		} catch { /* non-JSON line */ }
		return { text: '', done: false };
	}

	private _parseOpenAIChunk(dataLine: string): IProviderStreamChunk {
		if (dataLine === '[DONE]') {
			return { text: '', done: true };
		}
		try {
			const json = JSON.parse(dataLine);
			const content = json.choices?.[0]?.delta?.content;
			if (content) {
				return { text: content, done: false };
			}
			if (json.choices?.[0]?.finish_reason) {
				return { text: '', done: true };
			}
		} catch { /* non-JSON line */ }
		return { text: '', done: false };
	}

	private _parseGoogleChunk(dataLine: string): IProviderStreamChunk {
		try {
			const json = JSON.parse(dataLine);
			const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
			if (text) {
				return { text, done: false };
			}
			if (json.candidates?.[0]?.finishReason) {
				return { text: '', done: true };
			}
		} catch { /* non-JSON line */ }
		return { text: '', done: false };
	}

	// --- Quota header extraction ---

	/**
	 * Extract rate-limit quota info from HTTP response headers.
	 */
	extractQuota(headers: Record<string, string>, format: ApiFormat): Partial<IQuotaStatus> {
		switch (format) {
			case 'anthropic': return this._extractAnthropicQuota(headers);
			case 'openai': return this._extractOpenAIQuota(headers);
			case 'google': return {};  // Google doesn't expose quota in headers
		}
	}

	private _extractAnthropicQuota(headers: Record<string, string>): Partial<IQuotaStatus> {
		const remaining = this._parseHeader(headers, 'anthropic-ratelimit-tokens-remaining');
		const limit = this._parseHeader(headers, 'anthropic-ratelimit-tokens-limit');
		const resetStr = headers['anthropic-ratelimit-tokens-reset'];
		const resetAt = resetStr ? new Date(resetStr).getTime() : undefined;

		return {
			...(remaining !== undefined && { remaining }),
			...(limit !== undefined && { limit }),
			...(resetAt !== undefined && { resetAt }),
		};
	}

	private _extractOpenAIQuota(headers: Record<string, string>): Partial<IQuotaStatus> {
		const remaining = this._parseHeader(headers, 'x-ratelimit-remaining-tokens');
		const limit = this._parseHeader(headers, 'x-ratelimit-limit-tokens');
		const resetMs = this._parseHeader(headers, 'x-ratelimit-reset-tokens');
		const resetAt = resetMs !== undefined ? Date.now() + resetMs * 1000 : undefined;

		return {
			...(remaining !== undefined && { remaining }),
			...(limit !== undefined && { limit }),
			...(resetAt !== undefined && { resetAt }),
		};
	}

	// --- Helpers ---

	private _extractText(message: IChatMessage): string {
		if (!message.content) {
			return '';
		}
		return message.content
			.filter(part => part.type === 'text')
			.map(part => (part as { type: 'text'; value: string }).value)
			.join('');
	}

	private _parseHeader(headers: Record<string, string>, key: string): number | undefined {
		const value = headers[key];
		if (value === undefined) {
			return undefined;
		}
		const num = parseInt(value, 10);
		return isNaN(num) ? undefined : num;
	}
}
