/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';
import { describe, expect, it } from 'vitest';
import { filterHistoryImages } from '../imageLimits';

const createUserImageMessage = (imageCount: number = 1): Raw.ChatMessage => ({
	role: Raw.ChatRole.User,
	content: [
		{ type: Raw.ChatCompletionContentPartKind.Text, text: 'What is in this image?' },
		...Array.from({ length: imageCount }, () => ({
			type: Raw.ChatCompletionContentPartKind.Image as const,
			imageUrl: { url: 'data:image/png;base64,test' }
		}))
	]
});

const createAssistantMessage = (): Raw.ChatMessage => ({
	role: Raw.ChatRole.Assistant,
	content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'I see an image.' }]
});

const createToolImageMessage = (): Raw.ChatMessage => ({
	role: Raw.ChatRole.Tool,
	toolCallId: 'tool-1',
	content: [
		{ type: Raw.ChatCompletionContentPartKind.Image, imageUrl: { url: 'https://example.com/tool.png' } }
	]
});

const countImages = (messages: Raw.ChatMessage[]): number => {
	let count = 0;
	for (const msg of messages) {
		if (Array.isArray(msg.content)) {
			for (const part of msg.content) {
				if (part.type === Raw.ChatCompletionContentPartKind.Image) {
					count++;
				}
			}
		}
	}
	return count;
};

describe('filterHistoryImages', () => {
	it('returns the original array by reference when within the limit', () => {
		const messages = [createUserImageMessage(), createUserImageMessage()];
		expect(filterHistoryImages(messages, 5)).toBe(messages);
	});

	it('silently filters oldest history images when total exceeds the limit', () => {
		// 2 history user messages with 1 image each + current user message with 2 images = 4 total > 3 limit
		const messages = [
			createUserImageMessage(),
			createAssistantMessage(),
			createUserImageMessage(),
			createAssistantMessage(),
			createUserImageMessage(2),
		];
		const filtered = filterHistoryImages(messages, 3);
		expect(countImages(filtered)).toBeLessThanOrEqual(3);
		// Current user message (last) must retain all 2 of its images.
		expect(countImages([filtered[filtered.length - 1]])).toBe(2);
		// Original messages must not be mutated.
		expect(countImages(messages)).toBe(4);
	});

	it('replaces dropped images with a text placeholder', () => {
		const messages = [
			createUserImageMessage(),
			createAssistantMessage(),
			createUserImageMessage(1),
		];
		const filtered = filterHistoryImages(messages, 1);
		const droppedMessage = filtered[0];
		if (!Array.isArray(droppedMessage.content)) {
			throw new Error('expected array content');
		}
		const placeholder = droppedMessage.content.find(p => p.type === Raw.ChatCompletionContentPartKind.Text && p.text.includes('Image omitted'));
		expect(placeholder).toBeDefined();
	});

	it('filters tool-result images in history the same as user images', () => {
		// 2 tool-result images in history + 1 current user image = 3 total > 2 limit
		const messages: Raw.ChatMessage[] = [
			createToolImageMessage(),
			createAssistantMessage(),
			createToolImageMessage(),
			createAssistantMessage(),
			createUserImageMessage(1),
		];
		const filtered = filterHistoryImages(messages, 2);
		expect(countImages(filtered)).toBeLessThanOrEqual(2);
		// Original messages must not be mutated.
		expect(countImages(messages)).toBe(3);
	});

	it('throws a clear error including the per-model limit when the current turn alone exceeds it', () => {
		// Current user message has 11 images. The error must mention the exact
		// model-scoped limit (10 for Gemini, 20 for Anthropic Messages API).
		const messages = [createUserImageMessage(11)];
		expect(() => filterHistoryImages(messages, 10)).toThrow(/11 images provided.*maximum of 10 images/);

		const many = [createUserImageMessage(25)];
		expect(() => filterHistoryImages(many, 20)).toThrow(/25 images provided.*maximum of 20 images/);
	});

	it('handles conversations with no user message by treating the last message as current', () => {
		const messages: Raw.ChatMessage[] = [
			createToolImageMessage(),
			createToolImageMessage(),
			createToolImageMessage(),
		];
		const filtered = filterHistoryImages(messages, 1);
		// Last message preserved; earlier tool-result images filtered.
		expect(countImages(filtered)).toBeLessThanOrEqual(1);
		expect(countImages([filtered[filtered.length - 1]])).toBe(1);
	});

	it('does not mutate the original messages array or its contents', () => {
		// History has 2 images, current turn has 1, limit is 1 → history filters silently.
		const messages = [
			createUserImageMessage(),
			createAssistantMessage(),
			createUserImageMessage(),
			createAssistantMessage(),
			createUserImageMessage(1),
		];
		const snapshot = JSON.stringify(messages);
		filterHistoryImages(messages, 1);
		expect(JSON.stringify(messages)).toBe(snapshot);
	});

	it('passes through messages with non-array content', () => {
		const messages: Raw.ChatMessage[] = [
			{ role: Raw.ChatRole.System, content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'system' }] },
			createUserImageMessage(2),
		];
		// Total = 2 images, within limit of 2 → returned unchanged.
		const filtered = filterHistoryImages(messages, 2);
		expect(filtered).toBe(messages);
	});
});
