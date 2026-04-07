/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { toInputMessages, toOutputMessages, toSystemInstructions, toToolDefinitions, truncateForOTel } from '../messageFormatters';

describe('toInputMessages', () => {
	it('converts a simple text message', () => {
		const result = toInputMessages([{ role: 'user', content: 'Hello' }]);
		expect(result).toEqual([{
			role: 'user',
			parts: [{ type: 'text', content: 'Hello' }],
		}]);
	});

	it('converts messages with tool calls', () => {
		const result = toInputMessages([{
			role: 'assistant',
			content: '',
			tool_calls: [{
				id: 'tc_1',
				function: { name: 'readFile', arguments: '{"path":"foo.ts"}' },
			}],
		}]);
		expect(result).toEqual([{
			role: 'assistant',
			parts: [{
				type: 'tool_call',
				id: 'tc_1',
				name: 'readFile',
				arguments: { path: 'foo.ts' },
			}],
		}]);
	});

	it('handles invalid JSON in tool call arguments gracefully', () => {
		const result = toInputMessages([{
			role: 'assistant',
			tool_calls: [{
				id: 'tc_2',
				function: { name: 'run', arguments: 'not-json' },
			}],
		}]);
		expect(result[0].parts[0]).toEqual({
			type: 'tool_call',
			id: 'tc_2',
			name: 'run',
			arguments: 'not-json',
		});
	});

	it('includes both text and tool calls in parts', () => {
		const result = toInputMessages([{
			role: 'assistant',
			content: 'Here is the result',
			tool_calls: [{ id: 'tc', function: { name: 'search', arguments: '{}' } }],
		}]);
		expect(result[0].parts).toHaveLength(2);
		expect(result[0].parts[0]).toEqual({ type: 'text', content: 'Here is the result' });
		expect(result[0].parts[1]).toMatchObject({ type: 'tool_call', name: 'search' });
	});

	it('handles empty messages array', () => {
		expect(toInputMessages([])).toEqual([]);
	});

	it('preserves undefined role', () => {
		const result = toInputMessages([{ content: 'no role' }]);
		expect(result[0].role).toBeUndefined();
	});
});

describe('toOutputMessages', () => {
	it('converts successful text response', () => {
		const result = toOutputMessages([{
			message: { role: 'assistant', content: 'Hello!' },
			finish_reason: 'stop',
		}]);
		expect(result).toEqual([{
			role: 'assistant',
			parts: [{ type: 'text', content: 'Hello!' }],
			finish_reason: 'stop',
		}]);
	});

	it('converts response with tool calls', () => {
		const result = toOutputMessages([{
			message: {
				content: '',
				tool_calls: [{
					id: 'tc_1',
					function: { name: 'readFile', arguments: '{"path":"a.ts"}' },
				}],
			},
			finish_reason: 'tool_calls',
		}]);
		expect(result[0].parts).toHaveLength(1);
		expect(result[0].parts[0]).toMatchObject({ type: 'tool_call', name: 'readFile' });
		expect(result[0].finish_reason).toBe('tool_calls');
	});

	it('defaults role to assistant when message has no role', () => {
		const result = toOutputMessages([{ message: { content: 'text' }, finish_reason: 'stop' }]);
		expect(result[0].role).toBe('assistant');
	});

	it('defaults role to assistant when message is undefined', () => {
		const result = toOutputMessages([{ finish_reason: 'stop' }]);
		expect(result[0].role).toBe('assistant');
		expect(result[0].parts).toEqual([]);
	});

	it('handles empty choices array', () => {
		expect(toOutputMessages([])).toEqual([]);
	});
});

describe('toSystemInstructions', () => {
	it('converts a system message string', () => {
		expect(toSystemInstructions('You are a helpful assistant')).toEqual([
			{ type: 'text', content: 'You are a helpful assistant' },
		]);
	});

	it('returns undefined for empty string', () => {
		expect(toSystemInstructions('')).toBeUndefined();
	});

	it('returns undefined for undefined input', () => {
		expect(toSystemInstructions(undefined)).toBeUndefined();
	});
});

describe('toToolDefinitions', () => {
	it('converts tool definitions', () => {
		const result = toToolDefinitions([{
			type: 'function',
			function: {
				name: 'readFile',
				description: 'Read a file',
				parameters: { type: 'object', properties: { path: { type: 'string' } } },
			},
		}]);
		expect(result).toEqual([{
			type: 'function',
			name: 'readFile',
			description: 'Read a file',
			parameters: { type: 'object', properties: { path: { type: 'string' } } },
		}]);
	});

	it('filters out tools without a function property', () => {
		const result = toToolDefinitions([
			{ type: 'function', function: { name: 'a' } },
			{ type: 'function' }, // no function
		]);
		expect(result).toHaveLength(1);
		expect(result![0].name).toBe('a');
	});

	it('returns undefined for empty array', () => {
		expect(toToolDefinitions([])).toBeUndefined();
	});

	it('returns undefined for undefined input', () => {
		expect(toToolDefinitions(undefined)).toBeUndefined();
	});
});

describe('truncateForOTel', () => {
	it('returns short strings unchanged', () => {
		expect(truncateForOTel('hello')).toBe('hello');
	});

	it('returns empty string unchanged', () => {
		expect(truncateForOTel('')).toBe('');
	});

	it('returns string at exact limit unchanged', () => {
		const s = 'a'.repeat(100);
		expect(truncateForOTel(s, 100)).toBe(s);
	});

	it('truncates strings over the limit with suffix', () => {
		const s = 'a'.repeat(200);
		const result = truncateForOTel(s, 100);
		expect(result.length).toBeLessThanOrEqual(100);
		expect(result).toContain('...[truncated, original 200 chars]');
	});

	it('uses default 64000 limit', () => {
		const s = 'x'.repeat(64_001);
		const result = truncateForOTel(s);
		expect(result.length).toBeLessThanOrEqual(64_000);
		expect(result).toContain('...[truncated');
	});

	it('does not truncate at exactly 64000', () => {
		const s = 'x'.repeat(64_000);
		expect(truncateForOTel(s)).toBe(s);
	});
});
