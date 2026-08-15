/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as http from 'http';
import { describe, expect, it } from 'vitest';
import { OpenAIAdapterFactoryForSTests } from '../adapters/openaiAdapterForSTests';
import { Raw } from '@vscode/prompt-tsx';

describe('OpenAIAdapterFactory', () => {
	it('should create an OpenAI adapter instance', () => {
		const factory = new OpenAIAdapterFactoryForSTests();
		const adapter = factory.createAdapter();

		// Verify the adapter has the correct name
		expect(adapter.name).toBe('openai');
	});

	it('should parse a basic OpenAI request', () => {
		const factory = new OpenAIAdapterFactoryForSTests();
		const adapter = factory.createAdapter();

		const requestBody = {
			model: 'gpt-4o',
			messages: [
				{ role: 'user', content: 'Hello' }
			],
			temperature: 0.7
		};

		const parsedRequest = adapter.parseRequest(JSON.stringify(requestBody));

		expect(parsedRequest.model).toBe('gpt-4o');
		expect(parsedRequest.messages).toHaveLength(1);
		expect(parsedRequest.messages[0]).toEqual({ role: Raw.ChatRole.User, content: [{ text: 'Hello', type: Raw.ChatCompletionContentPartKind.Text }] } satisfies Raw.UserChatMessage);
		expect(parsedRequest.options?.temperature).toBe(0.7);
	});

	it('should parse an OpenAI request with tools', () => {
		const factory = new OpenAIAdapterFactoryForSTests();
		const adapter = factory.createAdapter();

		const requestBody = {
			model: 'gpt-4o',
			messages: [
				{ role: 'user', content: 'What is the weather?' }
			],
			tools: [
				{
					type: 'function',
					function: {
						name: 'get_weather',
						description: 'Get the current weather',
						parameters: {
							type: 'object',
							properties: {
								location: { type: 'string' }
							}
						}
					}
				}
			]
		};

		const parsedRequest = adapter.parseRequest(JSON.stringify(requestBody));

		expect(parsedRequest.model).toBe('gpt-4o');
		expect(parsedRequest.messages).toHaveLength(1);
		expect(parsedRequest.options?.tools).toBeDefined();
		expect(parsedRequest.options?.tools).toHaveLength(1);
	});

	it('should extract auth key from headers', () => {
		const factory = new OpenAIAdapterFactoryForSTests();
		const adapter = factory.createAdapter();

		const headers: http.IncomingHttpHeaders = {
			'authorization': 'Bearer test-key-123'
		};

		const authKey = adapter.extractAuthKey(headers);

		expect(authKey).toBe('test-key-123');
	});

	it('should format text stream response', () => {
		const factory = new OpenAIAdapterFactoryForSTests();
		const adapter = factory.createAdapter();

		const context = {
			requestId: 'test-request-id',
			endpoint: {
				modelId: 'gpt-4o',
				modelMaxPromptTokens: 128000
			}
		};

		const streamData = {
			type: 'text' as const,
			content: 'Hello, world!'
		};

		let events = adapter.formatStreamResponse(streamData, context);

		expect(events).toHaveLength(0);

		events = adapter.generateFinalEvents(context);
		expect(events).toHaveLength(2);
		expect(events[0].event).toBe('message');
		expect(events[0].data).toContain('Hello, world!');

		expect(events[1].event).toBe('message');
		expect(JSON.parse(events[1].data).choices).toEqual([{ 'index': 0, 'delta': { 'content': null }, 'finish_reason': 'stop' }]);
	});

	it('should format tool call stream response', () => {
		const factory = new OpenAIAdapterFactoryForSTests();
		const adapter = factory.createAdapter();

		const context = {
			requestId: 'test-request-id',
			endpoint: {
				modelId: 'gpt-4o',
				modelMaxPromptTokens: 128000
			}
		};

		const streamData = {
			type: 'tool_call' as const,
			callId: 'call_123',
			name: 'get_weather',
			input: { location: 'Boston' }
		};

		const events = adapter.formatStreamResponse(streamData, context);

		expect(events).toHaveLength(1);
		expect(events[0].event).toBe('message');
		expect(events[0].data).toContain('get_weather');
		expect(events[0].data).toContain('Boston');
	});

	it('should generate final events with usage', () => {
		const factory = new OpenAIAdapterFactoryForSTests();
		const adapter = factory.createAdapter();

		const context = {
			requestId: 'test-request-id',
			endpoint: {
				modelId: 'gpt-4o',
				modelMaxPromptTokens: 128000
			}
		};

		const usage = {
			prompt_tokens: 10,
			completion_tokens: 20,
			total_tokens: 30
		};

		const events = adapter.generateFinalEvents(context, usage);

		expect(events).toHaveLength(1);
		expect(events[0].event).toBe('message');
		expect(events[0].data).toContain('"prompt_tokens":10');
		expect(events[0].data).toContain('"completion_tokens":20');
	});
});