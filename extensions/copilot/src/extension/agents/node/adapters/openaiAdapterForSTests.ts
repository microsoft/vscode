/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';
import { ChatCompletionContentPartKind } from '@vscode/prompt-tsx/dist/base/output/rawTypes';
import * as http from 'http';
import { ChatCompletionChunk, ChatCompletionCreateParamsBase, ChatCompletionMessageParam } from 'openai/resources/chat/completions.js';
import type { OpenAiFunctionTool } from '../../../../platform/networking/common/fetch';
import { IMakeChatRequestOptions } from '../../../../platform/networking/common/networking';
import { APIUsage } from '../../../../platform/networking/common/openai';
import { coalesce } from '../../../../util/vs/base/common/arrays';
import { IAgentStreamBlock, IParsedRequest, IProtocolAdapter, IProtocolAdapterFactory, IStreamEventData, IStreamingContext } from './types';

export class OpenAIAdapterFactoryForSTests implements IProtocolAdapterFactory {
	private readonly requestHooks: ((body: string) => string)[] = [];
	private readonly responseHooks: ((body: string) => string)[] = [];
	createAdapter(): IProtocolAdapter {
		return new OpenAIAdapterForSTests(this.requestHooks, this.responseHooks);
	}
	public addHooks(requestHook?: (body: string) => string, responseHook?: (body: string) => string): void {
		if (requestHook) {
			this.requestHooks.push(requestHook);
		}
		if (responseHook) {
			this.responseHooks.push(responseHook);
		}
	}
}

class OpenAIAdapterForSTests implements IProtocolAdapter {
	readonly name = 'openai';

	// Per-request state
	private currentBlockIndex = 0;
	private hasTextBlock = false;
	private hadToolCalls = false;
	constructor(private readonly requestHooks: ((body: string) => string)[], private readonly responseHooks: ((body: string) => string)[] = []) {
		// No-op for test adapter
	}

	parseRequest(body: string): IParsedRequest {
		body = this.requestHooks.reduce((b, hook) => hook(b), body);
		const requestBody: ChatCompletionCreateParamsBase = JSON.parse(body);

		// Extract model information
		const model = requestBody.model;

		// Convert messages format if needed
		const runHooks = (msg: string) => {
			return this.requestHooks.reduce((b, hook) => hook(b), msg);
		};
		const messages = responseApiInputToRawMessages(requestBody.messages);
		messages.forEach(msg => {
			msg.content.forEach(part => {
				switch (part.type) {
					case ChatCompletionContentPartKind.Image: {
						part.imageUrl.url = runHooks(part.imageUrl.url);
						break;
					}
					case ChatCompletionContentPartKind.Opaque: {
						if (typeof part.value === 'string') {
							part.value = runHooks(part.value);
						}
						break;
					}
					case ChatCompletionContentPartKind.Text: {
						part.text = runHooks(part.text);
						break;
					}
				}
			});
		});

		const options: IMakeChatRequestOptions['requestOptions'] = {
			temperature: (requestBody.temperature ?? undefined),
			max_tokens: (requestBody.max_tokens ?? requestBody.max_completion_tokens) ?? undefined,
		};

		if (requestBody.tools && Array.isArray(requestBody.tools) && requestBody.tools.length > 0) {
			// Map OpenAI tools to VS Code chat tools
			const tools = coalesce(requestBody.tools.map((tool) => {
				if (tool.type === 'function' && tool.function) {
					const chatTool: OpenAiFunctionTool = {
						type: 'function',
						function: {
							name: tool.function.name,
							description: tool.function.description || '',
							parameters: tool.function.parameters || {},
						}
					};
					return chatTool;
				}
				return undefined;
			}));
			if (tools.length) {
				options.tools = tools;
			}
		}

		return {
			model,
			messages,
			options
		};
	}


	private readonly textMessages = new Map<string, string>();

	private collectTextContent(context: IStreamingContext, content: string): void {
		const existing = this.textMessages.get(context.requestId) || '';
		this.textMessages.set(context.requestId, existing + content);
	}
	private getCollectedTextContent(context: IStreamingContext): IStreamEventData | undefined {
		let content = this.textMessages.get(context.requestId);
		if (typeof content !== 'string') {
			return undefined;
		}
		this.textMessages.delete(context.requestId);
		content = this.responseHooks.reduce((b, hook) => hook(b), content);

		// Send text delta events
		const event = {
			id: context.requestId,
			object: 'chat.completion.chunk',
			created: Math.floor(Date.now() / 1000),
			model: context.endpoint.modelId,
			choices: [{
				index: this.currentBlockIndex,
				delta: {
					content,
					role: 'assistant'
				},
				finish_reason: null
			}]
		} satisfies ChatCompletionChunk;

		return {
			event: 'message',
			data: this.formatEventData(event)
		};
	}
	formatStreamResponse(
		streamData: IAgentStreamBlock,
		context: IStreamingContext
	): IStreamEventData[] {
		const events: IStreamEventData[] = [];

		if (streamData.type === 'text') {
			if (!this.hasTextBlock) {
				this.hasTextBlock = true;
			}

			// Collect all of the strings, as there could be references to file paths.
			// At the end of the stream, we will send a single event with the full text & have file paths replaced.
			this.collectTextContent(context, streamData.content);
		} else if (streamData.type === 'tool_call') {
			// End current text block if it exists
			if (this.hasTextBlock) {
				const event = this.getCollectedTextContent(context);
				if (event) {
					events.push(event);
				}
				this.currentBlockIndex++;
				this.hasTextBlock = false;
			}

			this.hadToolCalls = true;

			// Arguments can contain file paths.
			const toolArguments = this.responseHooks.reduce((b, hook) => hook(b), JSON.stringify(streamData.input || {}));

			// Send tool call events
			const toolCallDelta: ChatCompletionChunk = {
				id: context.requestId,
				object: 'chat.completion.chunk',
				created: Math.floor(Date.now() / 1000),
				model: context.endpoint.modelId,
				choices: [{
					index: this.currentBlockIndex,
					delta: {
						tool_calls: [{
							index: this.currentBlockIndex,
							id: streamData.callId,
							type: 'function',
							function: {
								name: streamData.name,
								arguments: toolArguments
							}
						}]
					},
					finish_reason: null
				}]
			};
			events.push({
				event: 'message',
				data: this.formatEventData(toolCallDelta)
			});

			this.currentBlockIndex++;
		}

		return events;
	}

	generateFinalEvents(context: IStreamingContext, usage?: APIUsage): IStreamEventData[] {
		const events: IStreamEventData[] = [];

		const event = this.getCollectedTextContent(context);
		if (event) {
			events.push(event);
		}

		// Send final completion event with usage information
		const finalCompletion = {
			id: context.requestId,
			object: 'chat.completion.chunk',
			created: Math.floor(Date.now() / 1000),
			model: context.endpoint.modelId,
			choices: [{
				index: 0,
				delta: { content: null },
				finish_reason: this.hadToolCalls ? 'tool_calls' : 'stop'
			}],
			usage: usage ? {
				prompt_tokens: usage.prompt_tokens,
				completion_tokens: usage.completion_tokens,
				total_tokens: usage.total_tokens
			} : {
				prompt_tokens: 0,
				completion_tokens: 0,
				total_tokens: 0
			}
		} satisfies ChatCompletionChunk;

		events.push({
			event: 'message',
			data: this.formatEventData(finalCompletion)
		});

		return events;
	}

	generateInitialEvents(context: IStreamingContext): IStreamEventData[] {
		// OpenAI doesn't typically send initial events, but we can send an empty one if needed
		return [];
	}

	getContentType(): string {
		return 'text/event-stream';
	}

	extractAuthKey(headers: http.IncomingHttpHeaders): string | undefined {
		const authHeader = headers.authorization;
		const bearerSpace = 'Bearer ';
		return authHeader?.startsWith(bearerSpace) ? authHeader.substring(bearerSpace.length) : undefined;
	}

	private formatEventData(data: unknown): string {
		return JSON.stringify(data).replace(/\n/g, '\\n');
	}
}
function responseApiInputToRawMessages(messages: ChatCompletionMessageParam[]): Raw.ChatMessage[] {
	const raw: Raw.ChatMessage[] = [];

	// Helper to push or merge consecutive messages of same role
	const pushOrMerge = (msg: Raw.ChatMessage) => {
		const last = raw[raw.length - 1];
		if (last && last.role === msg.role && last.role !== Raw.ChatRole.Tool) {
			// Merge content arrays
			last.content.push(...msg.content);
			// Merge tool calls if assistant
			if (last.role === Raw.ChatRole.Assistant && msg.role === Raw.ChatRole.Assistant && msg.toolCalls) {
				const l = last as Raw.AssistantChatMessage;
				l.toolCalls = [...(l.toolCalls || []), ...((msg as Raw.AssistantChatMessage).toolCalls || [])];
			}
		} else {
			raw.push(msg);
		}
	};

	messages.forEach(m => {
		// Collect content parts
		const contentParts: Raw.ChatCompletionContentPart[] = [];

		// OpenAI message content can be string or ChatCompletionContentPart[]
		(Array.isArray(m.content) ? m.content : []).forEach(part => {
			switch (part.type) {
				case 'text': {
					contentParts.push({ type: Raw.ChatCompletionContentPartKind.Text, text: part.text });
					break;
				}
				case 'image_url': {
					contentParts.push({ imageUrl: { url: part.image_url.url, detail: part.image_url.detail as unknown as ('low' | 'high' | undefined) }, type: ChatCompletionContentPartKind.Image });
					break;
				}
				case 'file': {
					contentParts.push({ type: ChatCompletionContentPartKind.Opaque, value: `[File Input - Filename: ${part.file.filename}]` });
					break;
				}
				case 'refusal': {
					// Refusal parts contain a 'refusal' field; access defensively
					contentParts.push({ type: Raw.ChatCompletionContentPartKind.Text, text: `[Refusal: ${part.refusal || ''}]` });
					break;
				}
				case 'input_audio':
				default: {
					// Unknown part
				}
			}
		});
		if (typeof m.content === 'string') {
			contentParts.push({ type: Raw.ChatCompletionContentPartKind.Text, text: m.content });
		}

		switch (m.role) {
			case 'user': {
				pushOrMerge({ role: Raw.ChatRole.User, content: contentParts });
				return;
			}
			case 'tool': {
				// contentParts.splice(0, contentParts.length);
				raw.push({ role: Raw.ChatRole.Tool, content: contentParts, toolCallId: m.tool_call_id || '' });
				return;

			}
			case 'assistant': {
				const toolCalls: Raw.ChatMessageToolCall[] = (m.tool_calls || []).map(tc => {
					try {
						if (tc.type === 'function') {
							return {
								id: tc.id || tc.function.name || 'tool_call',
								type: 'function',
								function: {
									name: tc.function.name || 'unknown_function',
									arguments: typeof tc.function.arguments === 'string' ? tc.function.arguments : JSON.stringify(tc.function.arguments ?? {})
								}
							} satisfies Raw.ChatMessageToolCall;
						}
					} catch { }
					// Fallback minimal tool call
					return { id: 'tool_call', type: 'function', function: { name: 'unknown_function', arguments: '{}' } } satisfies Raw.ChatMessageToolCall;
				});
				const message: Raw.AssistantChatMessage = { role: Raw.ChatRole.Assistant, content: contentParts };
				if (toolCalls.length) {
					message.toolCalls = toolCalls;
				}
				pushOrMerge(message);
				return;
			}
			case 'system':
			case 'developer': {
				// System (and any unexpected) messages
				pushOrMerge({ role: Raw.ChatRole.System, content: contentParts, name: m.name });
				return;
			}
			default: {
				return;
			}
		}
	});

	return raw;
}

