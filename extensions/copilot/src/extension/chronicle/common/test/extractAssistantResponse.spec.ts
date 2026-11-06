/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { extractAssistantResponse } from '../sessionStoreTracking';

describe('extractAssistantResponse', () => {
	it('returns assistant text from valid JSON', () => {
		const raw = JSON.stringify([
			{ role: 'assistant', parts: [{ type: 'text', content: 'Hello, world!' }] },
		]);

		expect(extractAssistantResponse(raw)).toBe('Hello, world!');
	});

	it('returns undefined when input is undefined', () => {
		expect(extractAssistantResponse(undefined)).toBeUndefined();
	});

	it('returns undefined for empty string', () => {
		expect(extractAssistantResponse('')).toBeUndefined();
	});

	it('joins multiple text parts with newline', () => {
		const raw = JSON.stringify([
			{
				role: 'assistant',
				parts: [
					{ type: 'text', content: 'Part one.' },
					{ type: 'text', content: 'Part two.' },
				],
			},
		]);

		expect(extractAssistantResponse(raw)).toBe('Part one.\nPart two.');
	});

	it('ignores non-assistant roles', () => {
		const raw = JSON.stringify([
			{ role: 'system', parts: [{ type: 'text', content: 'System message' }] },
			{ role: 'assistant', parts: [{ type: 'text', content: 'Assistant reply' }] },
		]);

		expect(extractAssistantResponse(raw)).toBe('Assistant reply');
	});

	it('ignores non-text parts (tool_call)', () => {
		const raw = JSON.stringify([
			{
				role: 'assistant',
				parts: [
					{ type: 'tool_call', id: 'tc-1', name: 'some_tool', arguments: '{}' },
					{ type: 'text', content: 'After tool call.' },
				],
			},
		]);

		expect(extractAssistantResponse(raw)).toBe('After tool call.');
	});

	it('returns undefined for empty parts array', () => {
		const raw = JSON.stringify([
			{ role: 'assistant', parts: [] },
		]);

		expect(extractAssistantResponse(raw)).toBeUndefined();
	});

	it('handles truncated JSON from truncateForOTel', () => {
		// Simulate what truncateForOTel does: slices JSON mid-string and appends suffix
		const longContent = 'A'.repeat(100_000);
		const fullJson = JSON.stringify([
			{ role: 'assistant', parts: [{ type: 'text', content: longContent }] },
		]);
		const truncated = fullJson.substring(0, 500) + '...[truncated, original 100123 chars]';

		const result = extractAssistantResponse(truncated);
		expect(result).toBeDefined();
		expect(result!.startsWith('AAAA')).toBe(true);
		expect(result!).not.toContain('...[truncated');
	});

	it('unescapes JSON escapes in truncated fallback path', () => {
		// Content with characters that get JSON-escaped: newlines, quotes, backslashes
		const content = 'Hello "world"\nLine two\tTabbed\\end';
		const fullJson = JSON.stringify([
			{ role: 'assistant', parts: [{ type: 'text', content: content + 'A'.repeat(100_000) }] },
		]);
		const truncated = fullJson.substring(0, 200) + '...[truncated, original 100050 chars]';

		const result = extractAssistantResponse(truncated);
		expect(result).toBeDefined();
		// Should be unescaped — actual newlines and quotes, not \\n and \\"
		expect(result!).toContain('Hello "world"');
		expect(result!).toContain('\n');
	});

	it('returns undefined for malformed non-truncated JSON', () => {
		expect(extractAssistantResponse('{not valid json at all}')).toBeUndefined();
	});

	it('skips tool_call content and extracts text part in truncated JSON', () => {
		// Simulate JSON with a tool_call part (which has a "content" field) before the text part
		const fullJson = JSON.stringify([
			{
				role: 'assistant',
				parts: [
					{ type: 'tool_call', id: 'tc-1', content: 'should be skipped' },
					{ type: 'text', content: 'The real answer' + 'B'.repeat(100_000) },
				],
			},
		]);
		const truncated = fullJson.substring(0, 500) + '...[truncated, original 100050 chars]';

		const result = extractAssistantResponse(truncated);
		expect(result).toBeDefined();
		expect(result!).toContain('The real answer');
		expect(result!).not.toContain('should be skipped');
	});
});
