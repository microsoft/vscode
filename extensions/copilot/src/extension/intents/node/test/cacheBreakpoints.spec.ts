/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';
import { describe, expect, it } from 'vitest';
import { addCacheBreakpoints } from '../cacheBreakpoints';

const text = (value = 'text'): Raw.ChatCompletionContentPart => ({ type: Raw.ChatCompletionContentPartKind.Text, text: value });
const image = (): Raw.ChatCompletionContentPart => ({ type: Raw.ChatCompletionContentPartKind.Image, imageUrl: { url: 'image' } });
const document = (): Raw.ChatCompletionContentPart => ({ type: Raw.ChatCompletionContentPartKind.Document, documentData: { data: 'file', mediaType: 'application/pdf' } });
const opaque = (type: string): Raw.ChatCompletionContentPart => ({ type: Raw.ChatCompletionContentPartKind.Opaque, value: { type } });
const cacheBreakpoint = (): Raw.ChatCompletionContentPart => ({ type: Raw.ChatCompletionContentPartKind.CacheBreakpoint });
const hasBreakpoint = (message: Raw.ChatMessage) => message.content.some(part => part.type === Raw.ChatCompletionContentPartKind.CacheBreakpoint);

describe('addCacheBreakpoints', () => {
	it('only marks messages that produce supported Responses API input blocks', () => {
		const system: Raw.ChatMessage = { role: Raw.ChatRole.System, content: [text()] };
		const assistant: Raw.ChatMessage = { role: Raw.ChatRole.Assistant, content: [text()] };
		const textTool: Raw.ChatMessage = { role: Raw.ChatRole.Tool, toolCallId: 'text', content: [text()] };
		const imageTool: Raw.ChatMessage = { role: Raw.ChatRole.Tool, toolCallId: 'image', content: [image()] };
		const user: Raw.ChatMessage = { role: Raw.ChatRole.User, content: [document()] };

		addCacheBreakpoints([system, user, imageTool, assistant, textTool], 'responses');

		expect(hasBreakpoint(system)).toBe(true);
		expect(hasBreakpoint(assistant)).toBe(false);
		expect(hasBreakpoint(textTool)).toBe(true);
		expect(hasBreakpoint(imageTool)).toBe(true);
		expect(hasBreakpoint(user)).toBe(true);
	});

	it('removes prompt-rendered markers from unsupported Responses API messages', () => {
		const assistant: Raw.ChatMessage = { role: Raw.ChatRole.Assistant, content: [text(), cacheBreakpoint()] };

		addCacheBreakpoints([assistant], 'responses');

		expect(hasBreakpoint(assistant)).toBe(false);
	});

	it('preserves prompt-rendered markers on Responses function call outputs', () => {
		const textTool: Raw.ChatMessage = { role: Raw.ChatRole.Tool, toolCallId: 'text', content: [text(), cacheBreakpoint()] };

		addCacheBreakpoints([textTool], 'responses');

		expect(hasBreakpoint(textTool)).toBe(true);
	});

	it.each(['text', 'image_url', 'input_audio', 'file', 'refusal'])('supports Chat Completions %s blocks', type => {
		const message: Raw.ChatMessage = { role: Raw.ChatRole.Assistant, content: [opaque(type)] };

		addCacheBreakpoints([message], 'chatCompletions');

		expect(hasBreakpoint(message)).toBe(true);
	});

	it('does not mark unsupported Chat Completions blocks', () => {
		const message: Raw.ChatMessage = { role: Raw.ChatRole.Assistant, content: [opaque('unsupported')] };

		addCacheBreakpoints([message], 'chatCompletions');

		expect(hasBreakpoint(message)).toBe(false);
	});
});