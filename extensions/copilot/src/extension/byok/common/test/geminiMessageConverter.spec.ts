/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';
import { describe, expect, it } from 'vitest';
import type { LanguageModelChatMessage } from 'vscode';
import { CustomDataPartMimeTypes } from '../../../../platform/endpoint/common/endpointTypes';
import { LanguageModelChatMessageRole, LanguageModelDataPart, LanguageModelTextPart, LanguageModelToolResultPart, LanguageModelTextPart as LMText } from '../../../../vscodeTypes';
import { apiMessageToGeminiMessage } from '../geminiMessageConverter';

describe('GeminiMessageConverter', () => {
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

	it('should extract functionResponse parts from model message into subsequent user message and prune empty model', () => {
		// Simulate a model message that (incorrectly) contains only a tool result part
		const toolResult = new LanguageModelToolResultPart('myTool_12345', [new LanguageModelTextPart('{"foo":"bar"}')]);
		const messages: LanguageModelChatMessage[] = [
			{
				role: LanguageModelChatMessageRole.Assistant,
				content: [toolResult],
				name: undefined
			}
		];

		const { contents } = apiMessageToGeminiMessage(messages);

		// The original (empty) model message should be pruned; we expect a single user message with functionResponse
		expect(contents).toHaveLength(1);
		expect(contents[0].role).toBe('user');
		expect(contents[0].parts![0]).toHaveProperty('functionResponse');
		const fr: any = contents[0].parts![0];
		expect(fr.functionResponse.name).toBe('myTool'); // extracted from callId prefix
		expect(fr.functionResponse.response).toEqual({ foo: 'bar' });
	});

	it('should wrap array responses in an object', () => {
		const toolResult = new LanguageModelToolResultPart('listRepos_12345', [new LanguageModelTextPart('["repo1", "repo2"]')]);
		const messages: LanguageModelChatMessage[] = [
			{
				role: LanguageModelChatMessageRole.Assistant,
				content: [toolResult],
				name: undefined
			}
		];

		const result = apiMessageToGeminiMessage(messages);

		expect(result.contents).toHaveLength(1);
		expect(result.contents[0].role).toBe('user');
		const fr: any = result.contents[0].parts![0];
		expect(fr.functionResponse.response).toEqual({ result: ['repo1', 'repo2'] });
	});

	it('should be idempotent when called multiple times (no duplication)', () => {
		const toolResult = new LanguageModelToolResultPart('doThing_12345', [new LMText('{"value":42}')]);
		const messages: LanguageModelChatMessage[] = [
			{ role: LanguageModelChatMessageRole.Assistant, content: [new LMText('Result:'), toolResult], name: undefined }
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

			const toolResult = new LanguageModelToolResultPart('processImage_12345', [textPart, imagePart as any]);
			const messages: LanguageModelChatMessage[] = [
				{
					role: LanguageModelChatMessageRole.Assistant,
					content: [toolResult],
					name: undefined
				}
			];

			const result = apiMessageToGeminiMessage(messages);

			// Should have a user message with function response
			expect(result.contents).toHaveLength(1);
			expect(result.contents[0].role).toBe('user');
			expect(result.contents[0].parts![0]).toHaveProperty('functionResponse');

			const fr: any = result.contents[0].parts![0];
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

			const toolResult = new LanguageModelToolResultPart('generateImages_12345', [imagePart1 as any, imagePart2 as any]);
			const messages: LanguageModelChatMessage[] = [
				{
					role: LanguageModelChatMessageRole.Assistant,
					content: [toolResult],
					name: undefined
				}
			];

			const result = apiMessageToGeminiMessage(messages);

			expect(result.contents).toHaveLength(1);
			expect(result.contents[0].role).toBe('user');

			const fr: any = result.contents[0].parts![0];
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

			const toolResult = new LanguageModelToolResultPart('mixedContent_12345', [textPart, validImage as any, statefulMarker as any]);
			const messages: LanguageModelChatMessage[] = [
				{
					role: LanguageModelChatMessageRole.Assistant,
					content: [toolResult],
					name: undefined
				}
			];

			const result = apiMessageToGeminiMessage(messages);

			const fr: any = result.contents[0].parts![0];
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