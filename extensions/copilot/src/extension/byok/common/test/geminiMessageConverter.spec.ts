/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';
import { describe, expect, it } from 'vitest';
import type { LanguageModelChatMessage, LanguageModelChatMessage2 } from 'vscode';
import { CustomDataPartMimeTypes } from '../../../../platform/endpoint/common/endpointTypes';
import { LanguageModelChatMessageRole, LanguageModelDataPart, LanguageModelTextPart, LanguageModelThinkingPart, LanguageModelToolCallPart, LanguageModelToolResultPart, LanguageModelTextPart as LMText } from '../../../../vscodeTypes';
import { apiMessageToGeminiMessage } from '../geminiMessageConverter';

describe('GeminiMessageConverter', () => {
	it('matches UUID results to their calls in reverse result order', () => {
		const first = 'e865f38a-86e4-425d-851c-d2472e357f30';
		const second = '903750bb-4593-43ab-91f6-a39fe4a7a31b';
		const { contents } = apiMessageToGeminiMessage([
			{ role: LanguageModelChatMessageRole.Assistant, name: undefined, content: [
				new LanguageModelToolCallPart(first, 'read_file', { path: 'a.ts' }),
				new LanguageModelToolCallPart(second, 'read_file', { path: 'b.ts' }),
			] },
			{ role: LanguageModelChatMessageRole.User, name: undefined, content: [
				new LanguageModelToolResultPart(second, [new LanguageModelTextPart('{"file":"b"}')]),
				new LanguageModelToolResultPart(first, [new LanguageModelTextPart('{"file":"a"}')]),
			] },
		]);
		expect(contents[1].parts).toEqual([
			{ functionResponse: { name: 'read_file', response: { file: 'b' } } },
			{ functionResponse: { name: 'read_file', response: { file: 'a' } } },
		]);
	});

	it('rejects orphan results and conflicting names without including tool data', () => {
		expect(() => apiMessageToGeminiMessage([
			{ role: LanguageModelChatMessageRole.User, name: undefined, content: [new LanguageModelToolResultPart('orphan', [new LanguageModelTextPart('private result')])] },
		])).toThrow('Missing Gemini function call for tool result.');
		expect(() => apiMessageToGeminiMessage([
			{ role: LanguageModelChatMessageRole.Assistant, name: undefined, content: [new LanguageModelToolCallPart('same', 'read_file', {}), new LanguageModelToolCallPart('same', 'write_file', {})] },
		])).toThrow('Conflicting Gemini tool call names for the same call ID.');
		const { contents } = apiMessageToGeminiMessage([
			{ role: LanguageModelChatMessageRole.Assistant, name: undefined, content: [new LanguageModelToolCallPart('same', 'read_file', {}), new LanguageModelToolCallPart('same', 'read_file', {})] },
			{ role: LanguageModelChatMessageRole.User, name: undefined, content: [new LanguageModelToolResultPart('same', [new LanguageModelTextPart('result')])] },
		]);
		expect(contents[1].parts).toEqual([{ functionResponse: { name: 'read_file', response: { result: 'result' } } }]);
	});

	it('preserves separate system instructions in order and skips whitespace', () => {
		const system = (text: string): LanguageModelChatMessage => ({ role: LanguageModelChatMessageRole.System, name: undefined, content: [new LanguageModelTextPart(text)] });
		const user: LanguageModelChatMessage = { role: LanguageModelChatMessageRole.User, name: undefined, content: [new LanguageModelTextPart('question')] };
		const result = apiMessageToGeminiMessage([system('A'), user, system(' \n '), system('B')]);
		expect(result.systemInstruction?.parts).toEqual([{ text: 'A' }, { text: 'B' }]);
		expect(result.contents).toEqual([{ role: 'user', parts: [{ text: 'question' }] }]);
		expect(apiMessageToGeminiMessage([system(' \n ')]).systemInstruction).toBeUndefined();
	});

	it('should convert basic user and assistant messages', () => {
		const messages: LanguageModelChatMessage[] = [
			{
				role: LanguageModelChatMessageRole.User,
				content: [new LanguageModelTextPart('Hello, how are you?')],
				name: undefined
			},
			{
				role: LanguageModelChatMessageRole.Assistant,
				content: [new LanguageModelTextPart('I am doing well, thank you!')],
				name: undefined
			}
		];

		const result = apiMessageToGeminiMessage(messages);

		expect(result.contents).toHaveLength(2);
		expect(result.contents[0].role).toBe('user');
		expect(result.contents[0].parts).toBeDefined();
		expect(result.contents[0].parts![0].text).toBe('Hello, how are you?');
		expect(result.contents[1].role).toBe('model');
		expect(result.contents[1].parts).toBeDefined();
		expect(result.contents[1].parts![0].text).toBe('I am doing well, thank you!');
	});

	it('should handle system messages as system instruction', () => {
		const messages: LanguageModelChatMessage[] = [
			{
				role: LanguageModelChatMessageRole.System,
				content: [new LanguageModelTextPart('You are a helpful assistant.')],
				name: undefined
			},
			{
				role: LanguageModelChatMessageRole.User,
				content: [new LanguageModelTextPart('Hello!')],
				name: undefined
			}
		];

		const result = apiMessageToGeminiMessage(messages);

		expect(result.systemInstruction).toBeDefined();
		expect(result.systemInstruction!.parts).toBeDefined();
		expect(result.systemInstruction!.parts![0].text).toBe('You are a helpful assistant.');
		expect(result.contents).toHaveLength(1);
		expect(result.contents[0].role).toBe('user');
	});

	it('should filter out empty text parts', () => {
		const messages: LanguageModelChatMessage[] = [
			{
				role: LanguageModelChatMessageRole.User,
				content: [
					new LanguageModelTextPart(''),
					new LanguageModelTextPart('  '),
					new LanguageModelTextPart('Hello!')
				],
				name: undefined
			}
		];

		const result = apiMessageToGeminiMessage(messages);

		expect(result.contents[0].parts).toBeDefined();
		expect(result.contents[0].parts!).toHaveLength(2); // Empty string filtered out, whitespace kept
		expect(result.contents[0].parts![0].text).toBe('  ');
		expect(result.contents[0].parts![1].text).toBe('Hello!');
	});

	it('should attach a thought signature to the following function call', () => {
		const messages: Array<LanguageModelChatMessage | LanguageModelChatMessage2> = [{
			role: LanguageModelChatMessageRole.Assistant,
			content: [
				new LanguageModelThinkingPart('', undefined, { signature: 'thought-signature' }),
				new LanguageModelToolCallPart('call-1', 'default_api:view', { path: 'README.md' }),
			],
			name: undefined,
		}];

		const result = apiMessageToGeminiMessage(messages);

		expect(result.contents[0].parts).toEqual([{
			functionCall: {
				name: 'default_api:view',
				args: { path: 'README.md' },
			},
			thoughtSignature: 'thought-signature',
		}]);
	});

	it('should extract functionResponse parts from model message into subsequent user message and prune empty model', () => {
		// Paired history: assistant issues the call, tool result follows in the same message
		const messages: LanguageModelChatMessage[] = [
			{
				role: LanguageModelChatMessageRole.Assistant,
				content: [
					new LanguageModelToolCallPart('myTool_12345', 'myTool', { target: 'file.ts' }),
					new LanguageModelToolResultPart('myTool_12345', [new LanguageModelTextPart('{"foo":"bar"}')])
				],
				name: undefined
			}
		];

		const { contents } = apiMessageToGeminiMessage(messages);

		// Model message keeps the functionCall; functionResponse is split into a subsequent user message
		expect(contents).toHaveLength(2);
		expect(contents[0].role).toBe('model');
		expect(contents[1].role).toBe('user');
		expect(contents[1].parts![0]).toHaveProperty('functionResponse');
		const fr: any = contents[1].parts![0];
		expect(fr.functionResponse.name).toBe('myTool');
		expect(fr.functionResponse.response).toEqual({ foo: 'bar' });
	});

	it('should wrap array responses in an object', () => {
		const messages: LanguageModelChatMessage[] = [
			{
				role: LanguageModelChatMessageRole.Assistant,
				content: [
					new LanguageModelToolCallPart('listRepos_12345', 'listRepos', {}),
					new LanguageModelToolResultPart('listRepos_12345', [new LanguageModelTextPart('["repo1", "repo2"]')])
				],
				name: undefined
			}
		];

		const result = apiMessageToGeminiMessage(messages);

		expect(result.contents).toHaveLength(2);
		expect(result.contents[0].role).toBe('model');
		expect(result.contents[1].role).toBe('user');
		const fr: any = result.contents[1].parts![0];
		expect(fr.functionResponse.response).toEqual({ result: ['repo1', 'repo2'] });
	});

	it('should be idempotent when called multiple times (no duplication)', () => {
		const messages: LanguageModelChatMessage[] = [
			{
				role: LanguageModelChatMessageRole.Assistant,
				content: [
					new LMText('Result:'),
					new LanguageModelToolCallPart('doThing_12345', 'doThing', {}),
					new LanguageModelToolResultPart('doThing_12345', [new LMText('{"value":42}')])
				],
				name: undefined
			}
		];
		const first = apiMessageToGeminiMessage(messages);
		const second = apiMessageToGeminiMessage(messages); // Re-run with same original messages

		// Both runs should yield identical normalized structure (model text + user tool response) without growth
		expect(first.contents.length).toBe(2);
		expect(second.contents.length).toBe(2);
		expect(first.contents[0].role).toBe('model');
		expect(first.contents[1].role).toBe('user');
		expect(second.contents[0].role).toBe('model');
		expect(second.contents[1].role).toBe('user');
	});

	describe('Image handling', () => {
		it('should handle LanguageModelDataPart as inline image data', () => {
			const imageData = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]); // PNG header
			const imagePart = new LanguageModelDataPart(imageData, 'image/png');

			const messages: LanguageModelChatMessage[] = [
				{
					role: LanguageModelChatMessageRole.User,
					content: [new LanguageModelTextPart('Here is an image:'), imagePart as any],
					name: undefined
				}
			];

			const result = apiMessageToGeminiMessage(messages);

			expect(result.contents).toHaveLength(1);
			expect(result.contents[0].parts).toHaveLength(2);
			expect(result.contents[0].parts![0].text).toBe('Here is an image:');
			expect(result.contents[0].parts![1]).toHaveProperty('inlineData');
			const inlineData: any = result.contents[0].parts![1];
			expect(inlineData.inlineData.mimeType).toBe('image/png');
			expect(inlineData.inlineData.data).toBe(Buffer.from(imageData).toString('base64'));
		});

		it('should filter out StatefulMarker and CacheControl data parts', () => {
			const imageData = new Uint8Array([137, 80, 78, 71]);
			const validImage = new LanguageModelDataPart(imageData, 'image/jpeg');
			const statefulMarker = new LanguageModelDataPart(new Uint8Array([1, 2, 3]), CustomDataPartMimeTypes.StatefulMarker);
			const cacheControl = new LanguageModelDataPart(new TextEncoder().encode('ephemeral'), CustomDataPartMimeTypes.CacheControl);

			const messages: LanguageModelChatMessage[] = [
				{
					role: LanguageModelChatMessageRole.User,
					content: [validImage as any, statefulMarker as any, cacheControl as any],
					name: undefined
				}
			];

			const result = apiMessageToGeminiMessage(messages);

			// Should only include the valid image, not the stateful marker or cache control
			expect(result.contents[0].parts).toHaveLength(1);
			expect(result.contents[0].parts![0]).toHaveProperty('inlineData');
			const inlineData: any = result.contents[0].parts![0];
			expect(inlineData.inlineData.mimeType).toBe('image/jpeg');
		});

		it('should handle images in tool result content with text', () => {
			const imageData = new Uint8Array([255, 216, 255, 224]); // JPEG header
			const imagePart = new LanguageModelDataPart(imageData, 'image/jpeg');
			const textPart = new LanguageModelTextPart('{"success": true}');

			const messages: LanguageModelChatMessage[] = [
				{
					role: LanguageModelChatMessageRole.Assistant,
					content: [
						new LanguageModelToolCallPart('processImage_12345', 'processImage', {}),
						new LanguageModelToolResultPart('processImage_12345', [textPart, imagePart as any])
					],
					name: undefined
				}
			];

			const result = apiMessageToGeminiMessage(messages);

			// Should have a user message with function response
			expect(result.contents).toHaveLength(2);
			expect(result.contents[1].role).toBe('user');
			expect(result.contents[1].parts![0]).toHaveProperty('functionResponse');

			const fr: any = result.contents[1].parts![0];
			expect(fr.functionResponse.name).toBe('processImage');
			expect(fr.functionResponse.response.success).toBe(true);
			expect(fr.functionResponse.response.images).toBeDefined();
			expect(fr.functionResponse.response.images).toHaveLength(1);
			expect(fr.functionResponse.response.images[0].mimeType).toBe('image/jpeg');
			expect(fr.functionResponse.response.images[0].size).toBe(imageData.length);
		});

		it('should handle images in tool result content without text', () => {
			const imageData1 = new Uint8Array([255, 216, 255, 224]); // JPEG header
			const imageData2 = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]); // PNG header
			const imagePart1 = new LanguageModelDataPart(imageData1, 'image/jpeg');
			const imagePart2 = new LanguageModelDataPart(imageData2, 'image/png');

			const messages: LanguageModelChatMessage[] = [
				{
					role: LanguageModelChatMessageRole.Assistant,
					content: [
						new LanguageModelToolCallPart('generateImages_12345', 'generateImages', {}),
						new LanguageModelToolResultPart('generateImages_12345', [imagePart1 as any, imagePart2 as any])
					],
					name: undefined
				}
			];

			const result = apiMessageToGeminiMessage(messages);

			expect(result.contents).toHaveLength(2);
			expect(result.contents[1].role).toBe('user');

			const fr: any = result.contents[1].parts![0];
			expect(fr.functionResponse.name).toBe('generateImages');
			expect(fr.functionResponse.response.images).toHaveLength(2);

			// First image
			expect(fr.functionResponse.response.images[0].mimeType).toBe('image/jpeg');
			expect(fr.functionResponse.response.images[0].size).toBe(imageData1.length);
			expect(fr.functionResponse.response.images[0].data).toBe(Buffer.from(imageData1).toString('base64'));

			// Second image
			expect(fr.functionResponse.response.images[1].mimeType).toBe('image/png');
			expect(fr.functionResponse.response.images[1].size).toBe(imageData2.length);
			expect(fr.functionResponse.response.images[1].data).toBe(Buffer.from(imageData2).toString('base64'));
		});

		it('should handle mixed text and filtered data parts in tool results', () => {
			const validImageData = new Uint8Array([255, 216]);
			const validImage = new LanguageModelDataPart(validImageData, 'image/jpeg');
			const statefulMarker = new LanguageModelDataPart(new Uint8Array([1, 2, 3]), CustomDataPartMimeTypes.StatefulMarker);
			const textPart = new LanguageModelTextPart('Result text');

			const messages: LanguageModelChatMessage[] = [
				{
					role: LanguageModelChatMessageRole.Assistant,
					content: [
						new LanguageModelToolCallPart('mixedContent_12345', 'mixedContent', {}),
						new LanguageModelToolResultPart('mixedContent_12345', [textPart, validImage as any, statefulMarker as any])
					],
					name: undefined
				}
			];

			const result = apiMessageToGeminiMessage(messages);

			const fr: any = result.contents[1].parts![0];
			expect(fr.functionResponse.name).toBe('mixedContent');
			// Should include text and valid image, but not stateful marker
			expect(fr.functionResponse.response.result).toContain('Result text');
			expect(fr.functionResponse.response.result).toContain('[Contains 1 image(s) with types: image/jpeg]');
			expect(fr.functionResponse.response.images).toHaveLength(1);
			expect(fr.functionResponse.response.images[0].mimeType).toBe('image/jpeg');
		});
	});

	describe('geminiMessagesToRawMessages', () => {
		it('should convert function response with images to Raw format with image content parts', async () => {
			const { geminiMessagesToRawMessages } = await import('../geminiMessageConverter');

			// Simulate a Gemini Content with function response containing images
			const contents = [{
				role: 'user',
				parts: [{
					functionResponse: {
						name: 'generateImages',
						response: {
							success: true,
							images: [
								{
									mimeType: 'image/jpeg',
									size: 1024,
									data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
								},
								{
									mimeType: 'image/png',
									size: 512,
									data: '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAYEBAQFBAYFBQYJBgUGCQsIBgYICwwKCgsKCgwQDAwMDAwMEAwODxAPDgwTExQUExMcGxsbHB8fHx8fHx8fHx//2wBDAQcHBw0MDRgQEBgaFREVGh8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx//wAARCAABAAEDAREAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k='
								}
							]
						}
					}
				}]
			}];

			const rawMessages = geminiMessagesToRawMessages(contents);

			expect(rawMessages).toHaveLength(1);
			// Check the role - should be Raw.ChatRole.Tool enum value
			expect(rawMessages[0].role).toBe(Raw.ChatRole.Tool);

			// Type assertion for tool message
			const toolMessage = rawMessages[0] as any;
			expect(toolMessage.toolCallId).toBe('generateImages');
			expect(rawMessages[0].content).toHaveLength(3); // 2 images + 1 text part

			// Check first image
			expect(rawMessages[0].content[0].type).toBe(Raw.ChatCompletionContentPartKind.Image);
			const firstImage = rawMessages[0].content[0] as any;
			expect(firstImage.imageUrl?.url).toBe('data:image/jpeg;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==');

			// Check second image
			expect(rawMessages[0].content[1].type).toBe(Raw.ChatCompletionContentPartKind.Image);
			const secondImage = rawMessages[0].content[1] as any;
			expect(secondImage.imageUrl?.url).toBe('data:image/png;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAYEBAQFBAYFBQYJBgUGCQsIBgYICwwKCgsKCgwQDAwMDAwMEAwODxAPDgwTExQUExMcGxsbHB8fHx8fHx8fHx//2wBDAQcHBw0MDRgQEBgaFREVGh8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx//wAARCAABAAEDAREAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=');

			// Check text content with cleaned response
			expect(rawMessages[0].content[2].type).toBe(Raw.ChatCompletionContentPartKind.Text);
			const textPart = rawMessages[0].content[2] as any;
			const textContent = JSON.parse(textPart.text);
			expect(textContent.success).toBe(true);
			expect(textContent.images).toHaveLength(2);
			expect(textContent.images[0].mimeType).toBe('image/jpeg');
			expect(textContent.images[0].size).toBe(1024);
			expect(textContent.images[1].mimeType).toBe('image/png');
			expect(textContent.images[1].size).toBe(512);
			// Should not contain raw base64 data in text content
			expect(textContent.images[0]).not.toHaveProperty('data');
			expect(textContent.images[1]).not.toHaveProperty('data');
		});

		it('should handle function response without images normally', async () => {
			const { geminiMessagesToRawMessages } = await import('../geminiMessageConverter');

			const contents = [{
				role: 'user',
				parts: [{
					functionResponse: {
						name: 'textFunction',
						response: { result: 'success', value: 42 }
					}
				}]
			}];

			const rawMessages = geminiMessagesToRawMessages(contents);

			expect(rawMessages).toHaveLength(1);
			expect(rawMessages[0].role).toBe(Raw.ChatRole.Tool);
			expect(rawMessages[0].content).toHaveLength(1);
			expect(rawMessages[0].content[0].type).toBe(Raw.ChatCompletionContentPartKind.Text);
			const textPart = rawMessages[0].content[0] as any;
			expect(JSON.parse(textPart.text)).toEqual({ result: 'success', value: 42 });
		});
	});
});