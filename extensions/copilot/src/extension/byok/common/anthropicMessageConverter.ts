/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ContentBlockParam, ImageBlockParam, MessageParam, RedactedThinkingBlockParam, TextBlockParam, ThinkingBlockParam } from '@anthropic-ai/sdk/resources';
import { Raw } from '@vscode/prompt-tsx';
import type { LanguageModelChatMessage } from 'vscode';
import { CustomDataPartMimeTypes } from '../../../platform/endpoint/common/endpointTypes';
import { isDefined } from '../../../util/vs/base/common/types';
import { LanguageModelChatMessageRole, LanguageModelDataPart, LanguageModelTextPart, LanguageModelThinkingPart, LanguageModelToolCallPart, LanguageModelToolResultPart, LanguageModelToolResultPart2 } from '../../../vscodeTypes';

function apiContentToAnthropicContent(content: (LanguageModelTextPart | LanguageModelToolResultPart | LanguageModelToolCallPart | LanguageModelDataPart | LanguageModelThinkingPart)[]): ContentBlockParam[] {
	const convertedContent: ContentBlockParam[] = [];

	for (const part of content) {
		if (part instanceof LanguageModelThinkingPart) {
			// Check if this is a redacted thinking block
			if (part.metadata?.redactedData) {
				convertedContent.push({
					type: 'redacted_thinking',
					data: part.metadata.redactedData,
				});
			} else if (part.metadata?._completeThinking) {
				// Only push thinking block when we have the complete thinking marker
				convertedContent.push({
					type: 'thinking',
					thinking: part.metadata._completeThinking,
					signature: part.metadata.signature || '',
				});
			}
			// Skip incremental thinking parts - we only care about the complete one
		} else if (part instanceof LanguageModelToolCallPart) {
			convertedContent.push({
				type: 'tool_use',
				id: part.callId,
				input: part.input,
				name: part.name,
			});
		} else if (part instanceof LanguageModelDataPart && part.mimeType === CustomDataPartMimeTypes.CacheControl && part.data.toString() === 'ephemeral') {
			const previousBlock = convertedContent.at(-1);
			if (previousBlock && contentBlockSupportsCacheControl(previousBlock)) {
				previousBlock.cache_control = { type: 'ephemeral' };
			} else {
				// Empty string is invalid
				convertedContent.push({
					type: 'text',
					text: ' ',
					cache_control: { type: 'ephemeral' }
				});
			}
		} else if (part instanceof LanguageModelDataPart) {
			if (part.mimeType !== CustomDataPartMimeTypes.StatefulMarker) {
				convertedContent.push({
					type: 'image',
					source: {
						type: 'base64',
						data: Buffer.from(part.data).toString('base64'),
						media_type: part.mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
					}
				});
			}
		} else if (part instanceof LanguageModelToolResultPart || part instanceof LanguageModelToolResultPart2) {
			convertedContent.push({
				type: 'tool_result',
				tool_use_id: part.callId,
				content: part.content.map((p): TextBlockParam | ImageBlockParam | undefined => {
					if (p instanceof LanguageModelTextPart) {
						return { type: 'text', text: p.value };
					} else if (p instanceof LanguageModelDataPart && p.mimeType === CustomDataPartMimeTypes.CacheControl && p.data.toString() === 'ephemeral') {
						// Empty string is invalid
						return { type: 'text', text: ' ', cache_control: { type: 'ephemeral' } };
					} else if (p instanceof LanguageModelDataPart) {
						return { type: 'image', source: { type: 'base64', media_type: p.mimeType as any, data: Buffer.from(p.data).toString('base64') } };
					}
				}).filter(isDefined),
			});
		} else {
			// Anthropic errors if we have text parts with empty string text content
			if (part.value === '') {
				continue;
			}
			convertedContent.push({
				type: 'text',
				text: part.value
			});
		}
	}
	return convertedContent;
}

export function apiMessageToAnthropicMessage(messages: LanguageModelChatMessage[]): { messages: MessageParam[]; system: TextBlockParam } {
	const unmergedMessages: MessageParam[] = [];
	const systemMessage: TextBlockParam = {
		type: 'text',
		text: ''
	};
	for (const message of messages) {
		if (message.role === LanguageModelChatMessageRole.Assistant) {
			unmergedMessages.push({
				role: 'assistant',
				content: apiContentToAnthropicContent(message.content),
			});
		} else if (message.role === LanguageModelChatMessageRole.User) {
			unmergedMessages.push({
				role: 'user',
				content: apiContentToAnthropicContent(message.content),
			});
		} else {
			systemMessage.text += message.content.map(p => {
				// For some reason instance of doesn't work
				if (p instanceof LanguageModelTextPart) {
					return p.value;
				} else if (p instanceof LanguageModelDataPart && p.mimeType === CustomDataPartMimeTypes.CacheControl && p.data.toString() === 'ephemeral') {
					systemMessage.cache_control = { type: 'ephemeral' };
				}
				return '';
			}).join('');
		}
	}

	// Merge messages of the same type that are adjacent together, this is what anthropic expects
	const mergedMessages: MessageParam[] = [];
	for (const message of unmergedMessages) {
		if (mergedMessages.length === 0 || mergedMessages[mergedMessages.length - 1].role !== message.role) {
			mergedMessages.push(message);
		} else {
			// Merge with the previous message of the same role
			const prevMessage = mergedMessages[mergedMessages.length - 1];
			// Concat the content arrays if they're both arrays - They always will be due to the way apiContentToAnthropicContent works
			if (Array.isArray(prevMessage.content) && Array.isArray(message.content)) {
				(prevMessage.content as ContentBlockParam[]).push(...(message.content as ContentBlockParam[]));
			}
		}
	}
	return { messages: mergedMessages, system: systemMessage };
}

function contentBlockSupportsCacheControl(block: ContentBlockParam): block is Exclude<ContentBlockParam, | ThinkingBlockParam | RedactedThinkingBlockParam> {
	return block.type !== 'thinking' && block.type !== 'redacted_thinking';
}

export function anthropicMessagesToRawMessagesForLogging(messages: MessageParam[], system: TextBlockParam): Raw.ChatMessage[] {
	// Start with full-fidelity conversion, then sanitize for logging
	const fullMessages = anthropicMessagesToRawMessages(messages, system);

	// Replace bulky content with placeholders
	return fullMessages.map(message => {
		const content = message.content.map(part => {
			if (part.type === Raw.ChatCompletionContentPartKind.Image) {
				// Replace actual image URLs with placeholder for logging
				return {
					...part,
					imageUrl: { url: '(image)' }
				};
			}
			return part;
		});

		if (message.role === Raw.ChatRole.Tool) {
			// Replace tool result content with placeholder for logging
			return {
				...message,
				content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: '(tool result)' }]
			};
		}

		return {
			...message,
			content
		};
	});
}

/**
 * Full-fidelity conversion of Anthropic MessageParam[] + system to Raw.ChatMessage[] suitable for sending to endpoints.
 * Compared to the logging variant, this preserves tool_result content and image data (as data URLs when possible).
 */
export function anthropicMessagesToRawMessages(messages: MessageParam[], system: TextBlockParam): Raw.ChatMessage[] {
	const rawMessages: Raw.ChatMessage[] = [];

	if (system) {
		const systemContent: Raw.ChatCompletionContentPart[] = [];
		if (system.text) {
			systemContent.push({ type: Raw.ChatCompletionContentPartKind.Text, text: system.text });
		}
		if (system.cache_control) {
			systemContent.push({ type: Raw.ChatCompletionContentPartKind.CacheBreakpoint, cacheType: system.cache_control.type });
		}
		if (systemContent.length) {
			rawMessages.push({ role: Raw.ChatRole.System, content: systemContent });
		}
	}

	for (const message of messages) {
		const content: Raw.ChatCompletionContentPart[] = [];
		let toolCalls: Raw.ChatMessageToolCall[] | undefined;
		let toolCallId: string | undefined;

		const toRawImage = (img: ImageBlockParam): Raw.ChatCompletionContentPartImage | undefined => {
			if (img.source.type === 'base64') {
				return { type: Raw.ChatCompletionContentPartKind.Image, imageUrl: { url: `data:${img.source.media_type};base64,${img.source.data}` } };
			} else if (img.source.type === 'url') {
				return { type: Raw.ChatCompletionContentPartKind.Image, imageUrl: { url: img.source.url } };
			}
		};

		const pushImage = (img: ImageBlockParam) => {
			const imagePart = toRawImage(img);
			if (imagePart) {
				content.push(imagePart);
			}
		};

		const pushCache = (block?: ContentBlockParam) => {
			if (block && contentBlockSupportsCacheControl(block) && block.cache_control) {
				content.push({ type: Raw.ChatCompletionContentPartKind.CacheBreakpoint, cacheType: block.cache_control.type });
			}
		};

		if (Array.isArray(message.content)) {
			for (const block of message.content) {
				if (block.type === 'text') {
					content.push({ type: Raw.ChatCompletionContentPartKind.Text, text: block.text });
					pushCache(block);
				} else if (block.type === 'image') {
					pushImage(block);
					pushCache(block);
				} else if (block.type === 'thinking') {
					// Include thinking content for logging
					content.push({
						type: Raw.ChatCompletionContentPartKind.Text,
						text: `[THINKING: ${block.thinking}]`
					});
				} else if (block.type === 'redacted_thinking') {
					content.push({
						type: Raw.ChatCompletionContentPartKind.Text,
						text: '[REDACTED THINKING]'
					});
				} else if (block.type === 'tool_use') {
					// tool_use appears in assistant messages; represent as toolCalls on assistant message
					toolCalls ??= [];
					toolCalls.push({
						id: block.id,
						type: 'function',
						function: { name: block.name, arguments: JSON.stringify(block.input ?? {}) }
					});
					// no content part, tool call is separate
					pushCache(block);
				} else if (block.type === 'tool_result') {
					// tool_result appears in user role; we'll emit a Raw.Tool message later with this toolCallId and content
					toolCallId = block.tool_use_id;
					// Translate tool result content to raw parts
					const toolContent: Raw.ChatCompletionContentPart[] = [];
					if (typeof block.content === 'string') {
						toolContent.push({ type: Raw.ChatCompletionContentPartKind.Text, text: block.content });
					} else {
						for (const c of block.content ?? []) {
							if (c.type === 'text') {
								toolContent.push({ type: Raw.ChatCompletionContentPartKind.Text, text: c.text });
							} else if (c.type === 'image') {
								const imagePart = toRawImage(c);
								if (imagePart) {
									toolContent.push(imagePart);
								}
							}
						}
					}
					// Emit the tool result message now and continue to next message
					rawMessages.push({ role: Raw.ChatRole.Tool, content: toolContent.length ? toolContent : [{ type: Raw.ChatCompletionContentPartKind.Text, text: '' }], toolCallId });
					toolCallId = undefined;
				} else {
					// thinking or unsupported types are ignored
				}
			}
		} else if (typeof message.content === 'string') {
			content.push({ type: Raw.ChatCompletionContentPartKind.Text, text: message.content });
		}

		if (message.role === 'assistant') {
			const msg: Raw.AssistantChatMessage = { role: Raw.ChatRole.Assistant, content };
			if (toolCalls && toolCalls.length > 0) {
				msg.toolCalls = toolCalls;
			}
			rawMessages.push(msg);
		} else if (message.role === 'user') {
			// note: tool_result handled earlier; here we push standard user content if any
			if (content.length) {
				rawMessages.push({ role: Raw.ChatRole.User, content });
			}
		}
	}

	return rawMessages;
}
