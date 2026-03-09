// Copyright (c) Son-Of-Anton. All rights reserved.
// Licensed under the MIT License.

import type { UnifiedResponse } from './types.js';

interface OpenAIMessage {
	role: string;
	content: string;
	cache_control?: { type: string };
}

interface AnthropicContentBlock {
	type: string;
	text?: string;
	cache_control?: { type: string };
}

interface AnthropicMessage {
	role: string;
	content: string | AnthropicContentBlock[];
	cache_control?: { type: string };
}

interface AnthropicRequest {
	model: string;
	max_tokens: number;
	system?: string | AnthropicContentBlock[];
	messages: AnthropicMessage[];
	stream?: boolean;
}

interface OpenAIRequest {
	model: string;
	max_tokens: number;
	messages: OpenAIMessage[];
	stream?: boolean;
}

export function toAnthropicFormat(
	messages: OpenAIMessage[],
	systemPrompt: string | undefined,
	maxTokens: number,
	model: string,
	stream?: boolean
): AnthropicRequest {
	const anthropicMessages: AnthropicMessage[] = [];
	let system: string | AnthropicContentBlock[] | undefined = systemPrompt;

	for (const msg of messages) {
		if (msg.role === 'system') {
			// Extract system messages separately for Anthropic format
			if (msg.cache_control) {
				const block: AnthropicContentBlock = {
					type: 'text',
					text: msg.content,
					cache_control: msg.cache_control,
				};
				if (typeof system === 'string' && system) {
					system = [{ type: 'text', text: system }, block];
				} else if (Array.isArray(system)) {
					system = [...system, block];
				} else {
					system = [block];
				}
			} else {
				if (typeof system === 'string') {
					system = system ? `${system}\n${msg.content}` : msg.content;
				} else if (Array.isArray(system)) {
					system = [...system, { type: 'text', text: msg.content }];
				} else {
					system = msg.content;
				}
			}
			continue;
		}

		const anthropicMsg: AnthropicMessage = {
			role: msg.role,
			content: msg.content,
		};

		if (msg.cache_control) {
			anthropicMsg.content = [{
				type: 'text',
				text: msg.content,
				cache_control: msg.cache_control,
			}];
		}

		anthropicMessages.push(anthropicMsg);
	}

	const request: AnthropicRequest = {
		model,
		max_tokens: maxTokens,
		messages: anthropicMessages,
	};

	if (system) {
		request.system = system;
	}

	if (stream !== undefined) {
		request.stream = stream;
	}

	return request;
}

export function toOpenAIFormat(
	messages: OpenAIMessage[],
	systemPrompt: string | undefined,
	maxTokens: number,
	model: string,
	stream?: boolean
): OpenAIRequest {
	const openaiMessages: OpenAIMessage[] = [];

	if (systemPrompt) {
		openaiMessages.push({ role: 'system', content: systemPrompt });
	}

	for (const msg of messages) {
		openaiMessages.push({
			role: msg.role,
			content: msg.content,
		});
	}

	const request: OpenAIRequest = {
		model,
		max_tokens: maxTokens,
		messages: openaiMessages,
	};

	if (stream !== undefined) {
		request.stream = stream;
	}

	return request;
}

export function fromAnthropicResponse(response: Record<string, unknown>): UnifiedResponse {
	const content = response.content as Array<{ type: string; text?: string }>;
	const textContent = content
		?.filter(block => block.type === 'text')
		.map(block => block.text ?? '')
		.join('') ?? '';

	const usage = response.usage as { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number } | undefined;

	return {
		content: textContent,
		model: response.model as string ?? '',
		inputTokens: usage?.input_tokens ?? 0,
		outputTokens: usage?.output_tokens ?? 0,
		cachedTokens: usage?.cache_read_input_tokens ?? 0,
		finishReason: response.stop_reason as string ?? 'unknown',
	};
}

export function fromOpenAIResponse(response: Record<string, unknown>): UnifiedResponse {
	const choices = response.choices as Array<{ message?: { content?: string }; finish_reason?: string }>;
	const firstChoice = choices?.[0];

	const usage = response.usage as { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } } | undefined;

	return {
		content: firstChoice?.message?.content ?? '',
		model: response.model as string ?? '',
		inputTokens: usage?.prompt_tokens ?? 0,
		outputTokens: usage?.completion_tokens ?? 0,
		cachedTokens: usage?.prompt_tokens_details?.cached_tokens ?? 0,
		finishReason: firstChoice?.finish_reason ?? 'unknown',
	};
}
