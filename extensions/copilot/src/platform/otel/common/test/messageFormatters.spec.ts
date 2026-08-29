/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, vi } from 'vitest';
import { collectSystemTextsFromRequestBody, extractTextFromContent, normalizeProviderMessages, stringifyToolDefinitionsForOTel, stringifyToolsRawForTelemetry, toInputMessages, toOutputMessages, toSystemInstructions, toToolDefinitions, truncateForOTel } from '../messageFormatters';

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

	it('converts OpenAI tool-result messages to tool_call_response', () => {
		const result = toInputMessages([{
			role: 'tool',
			content: 'file contents here',
			tool_call_id: 'call_abc123',
		}]);
		expect(result).toEqual([{
			role: 'tool',
			parts: [{ type: 'tool_call_response', id: 'call_abc123', response: 'file contents here' }],
		}]);
	});
});

describe('normalizeProviderMessages', () => {
	it('converts Anthropic tool_use blocks to tool_call', () => {
		const result = normalizeProviderMessages([{
			role: 'assistant',
			content: [
				{ type: 'text', text: 'Let me read that file' },
				{ type: 'tool_use', id: 'toolu_123', name: 'readFile', input: { path: 'foo.ts' } },
			],
		}]);
		expect(result).toEqual([{
			role: 'assistant',
			parts: [
				{ type: 'text', content: 'Let me read that file' },
				{ type: 'tool_call', id: 'toolu_123', name: 'readFile', arguments: { path: 'foo.ts' } },
			],
		}]);
	});

	it('converts Anthropic tool_result blocks to tool_call_response', () => {
		const result = normalizeProviderMessages([{
			role: 'user',
			content: [
				{ type: 'tool_result', tool_use_id: 'toolu_123', content: 'file contents' },
			],
		}]);
		expect(result).toEqual([{
			role: 'user',
			parts: [
				{ type: 'tool_call_response', id: 'toolu_123', response: 'file contents' },
			],
		}]);
	});

	it('converts OpenAI tool-result messages', () => {
		const result = normalizeProviderMessages([{
			role: 'tool',
			tool_call_id: 'call_abc',
			content: 'result text',
		}]);
		expect(result).toEqual([{
			role: 'tool',
			parts: [{ type: 'tool_call_response', id: 'call_abc', response: 'result text' }],
		}]);
	});

	it('converts OpenAI tool_calls array', () => {
		const result = normalizeProviderMessages([{
			role: 'assistant',
			content: 'thinking...',
			tool_calls: [{ id: 'call_1', function: { name: 'search', arguments: '{"q":"test"}' } }],
		}]);
		expect(result).toEqual([{
			role: 'assistant',
			parts: [
				{ type: 'text', content: 'thinking...' },
				{ type: 'tool_call', id: 'call_1', name: 'search', arguments: { q: 'test' } },
			],
		}]);
	});

	it('handles plain string content', () => {
		const result = normalizeProviderMessages([{ role: 'user', content: 'hello' }]);
		expect(result).toEqual([{ role: 'user', parts: [{ type: 'text', content: 'hello' }] }]);
	});

	it('handles Anthropic thinking blocks', () => {
		const result = normalizeProviderMessages([{
			role: 'assistant',
			content: [{ type: 'thinking', thinking: 'Let me consider...' }],
		}]);
		expect(result).toEqual([{
			role: 'assistant',
			parts: [{ type: 'reasoning', content: 'Let me consider...' }],
		}]);
	});

	it('converts OpenAI Responses API tool_search_output items', () => {
		const result = normalizeProviderMessages([{
			type: 'tool_search_output',
			call_id: 'call_123',
			status: 'completed',
			tools: [{ type: 'function', name: 'read_file' }],
		}]);
		expect(result).toEqual([{
			role: 'tool_search',
			parts: [{
				type: 'tool_search_output',
				id: 'call_123',
				status: 'completed',
				tools: [{ type: 'function', name: 'read_file' }],
			}],
		}]);
	});

	it('preserves the absent-vs-empty tools distinction on tool_search_output', () => {
		// Absent `tools` field is meaningfully different from `tools: []` for
		// cache-key purposes; the normalizer must not coerce the two together.
		const absent = normalizeProviderMessages([{ type: 'tool_search_output', call_id: 'a' }]);
		const empty = normalizeProviderMessages([{ type: 'tool_search_output', call_id: 'a', tools: [] }]);
		expect(absent[0].parts[0]).not.toHaveProperty('tools');
		expect(empty[0].parts[0]).toHaveProperty('tools', []);
	});

	it('converts OpenAI Responses API function_call items into synthetic assistant tool_call', () => {
		const result = normalizeProviderMessages([{
			type: 'function_call',
			call_id: 'call_abc',
			name: 'apply_patch',
			arguments: '{"path":"foo.ts"}',
		}]);
		expect(result).toEqual([{
			role: 'assistant',
			parts: [{
				type: 'tool_call',
				id: 'call_abc',
				name: 'apply_patch',
				arguments: { path: 'foo.ts' },
			}],
		}]);
	});

	it('falls back to id when function_call has no call_id and keeps raw arguments on parse failure', () => {
		const result = normalizeProviderMessages([{
			type: 'function_call',
			id: 'fc_1',
			name: 'run',
			arguments: 'not-json',
		}]);
		expect(result).toEqual([{
			role: 'assistant',
			parts: [{ type: 'tool_call', id: 'fc_1', name: 'run', arguments: 'not-json' }],
		}]);
	});

	it('converts OpenAI Responses API function_call_output (string and array output)', () => {
		const result = normalizeProviderMessages([
			{ type: 'function_call_output', call_id: 'call_1', output: 'plain result' },
			{
				type: 'function_call_output',
				call_id: 'call_2',
				output: [{ type: 'output_text', text: 'a' }, { type: 'output_text', text: 'b' }],
			},
		]);
		expect(result).toEqual([
			{ role: 'tool', parts: [{ type: 'tool_call_response', id: 'call_1', response: 'plain result' }] },
			{ role: 'tool', parts: [{ type: 'tool_call_response', id: 'call_2', response: 'ab' }] },
		]);
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

	it('returns multiple blocks for multiple system messages', () => {
		expect(toSystemInstructions(['You are helpful', 'Always be concise'])).toEqual([
			{ type: 'text', content: 'You are helpful' },
			{ type: 'text', content: 'Always be concise' },
		]);
	});

	it('filters empty strings from array input', () => {
		expect(toSystemInstructions(['', 'real', ''])).toEqual([
			{ type: 'text', content: 'real' },
		]);
	});

	it('returns undefined for array containing only empty strings', () => {
		expect(toSystemInstructions(['', ''])).toBeUndefined();
	});

	it('returns undefined for empty array', () => {
		expect(toSystemInstructions([])).toBeUndefined();
	});
});

describe('extractTextFromContent', () => {
	it('returns string content as-is', () => {
		expect(extractTextFromContent('hello world')).toBe('hello world');
	});

	it('returns empty string for undefined/null', () => {
		expect(extractTextFromContent(undefined)).toBe('');
		expect(extractTextFromContent(null)).toBe('');
	});

	it('joins text blocks from Anthropic-style content array', () => {
		expect(extractTextFromContent([
			{ type: 'text', text: 'first' },
			{ type: 'text', text: 'second' },
		])).toBe('first\nsecond');
	});

	it('handles cache_control and other metadata gracefully', () => {
		expect(extractTextFromContent([
			{ type: 'text', text: 'system prompt', cache_control: { type: 'ephemeral' } },
		])).toBe('system prompt');
	});

	it('treats plain strings inside arrays as text', () => {
		expect(extractTextFromContent(['a', 'b'])).toBe('a\nb');
	});

	it('returns empty string for unknown shapes', () => {
		expect(extractTextFromContent(42)).toBe('');
		expect(extractTextFromContent({ foo: 'bar' })).toBe('');
	});
});

describe('collectSystemTextsFromRequestBody', () => {
	it('collects a single system message from OpenAI Chat Completions `messages`', () => {
		expect(collectSystemTextsFromRequestBody({
			messages: [
				{ role: 'system', content: 'You are helpful' },
				{ role: 'user', content: 'hi' },
			],
		})).toEqual(['You are helpful']);
	});

	it('collects multiple system messages in order (e.g. personality + instructions)', () => {
		expect(collectSystemTextsFromRequestBody({
			messages: [
				{ role: 'system', content: 'You are helpful' },
				{ role: 'system', content: 'Always be concise' },
				{ role: 'user', content: 'hi' },
			],
		})).toEqual(['You are helpful', 'Always be concise']);
	});

	it('falls back to top-level `system` (Anthropic) when no messages-level system exists', () => {
		expect(collectSystemTextsFromRequestBody({
			messages: [{ role: 'user', content: 'hi' }],
			system: 'Anthropic system prompt',
		})).toEqual(['Anthropic system prompt']);
	});

	it('falls back to top-level `instructions` (Responses API) when no messages-level system exists', () => {
		expect(collectSystemTextsFromRequestBody({
			input: [{ role: 'user', content: 'hi' }],
			instructions: 'Responses API instructions',
		})).toEqual(['Responses API instructions']);
	});

	it('extracts text from Anthropic-style content-block arrays in top-level system', () => {
		expect(collectSystemTextsFromRequestBody({
			messages: [],
			system: [
				{ type: 'text', text: 'block one', cache_control: { type: 'ephemeral' } },
				{ type: 'text', text: 'block two' },
			],
		})).toEqual(['block one\nblock two']);
	});

	it('prefers messages-level system over top-level fields to avoid duplication', () => {
		expect(collectSystemTextsFromRequestBody({
			messages: [{ role: 'system', content: 'from messages' }],
			system: 'from top-level',
			instructions: 'from instructions',
		})).toEqual(['from messages']);
	});

	it('returns empty array when no system content exists anywhere', () => {
		expect(collectSystemTextsFromRequestBody({
			messages: [{ role: 'user', content: 'hi' }],
		})).toEqual([]);
		expect(collectSystemTextsFromRequestBody({})).toEqual([]);
	});

	it('skips system entries whose content extracts to empty text', () => {
		expect(collectSystemTextsFromRequestBody({
			messages: [
				{ role: 'system', content: '' },
				{ role: 'system', content: 'real' },
			],
		})).toEqual(['real']);
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
			{ type: 'function' }, // no function and no top-level name → skipped
		]);
		expect(result).toHaveLength(1);
		expect(result![0].name).toBe('a');
	});

	it('flattens OpenAI Responses API tools (top-level name/parameters)', () => {
		const result = toToolDefinitions([{
			type: 'function',
			name: 'searchCode',
			description: 'Search the codebase',
			parameters: { type: 'object', properties: { query: { type: 'string' } } },
		}]);
		expect(result).toEqual([{
			type: 'function',
			name: 'searchCode',
			description: 'Search the codebase',
			parameters: { type: 'object', properties: { query: { type: 'string' } } },
		}]);
	});

	it('maps Anthropic input_schema → parameters', () => {
		const result = toToolDefinitions([{
			name: 'editFile',
			description: 'Edit a file',
			input_schema: { type: 'object', properties: { path: { type: 'string' } } },
		}]);
		expect(result).toEqual([{
			type: 'function',
			name: 'editFile',
			description: 'Edit a file',
			parameters: { type: 'object', properties: { path: { type: 'string' } } },
		}]);
	});

	it('maps VS Code inputSchema → parameters', () => {
		const result = toToolDefinitions([{
			name: 'runInTerminal',
			description: 'Run a command',
			inputSchema: { type: 'object', properties: { command: { type: 'string' } } },
		}]);
		expect(result).toEqual([{
			type: 'function',
			name: 'runInTerminal',
			description: 'Run a command',
			parameters: { type: 'object', properties: { command: { type: 'string' } } },
		}]);
	});

	it('returns undefined for empty array', () => {
		expect(toToolDefinitions([])).toBeUndefined();
	});

	it('returns undefined for undefined input', () => {
		expect(toToolDefinitions(undefined)).toBeUndefined();
	});
});

describe('stringifyToolDefinitionsForOTel', () => {
	it('returns undefined for empty / undefined input', () => {
		expect(stringifyToolDefinitionsForOTel(undefined)).toBeUndefined();
		expect(stringifyToolDefinitionsForOTel([])).toBeUndefined();
	});

	it('skips re-stringification on repeated calls with the same array reference', () => {
		const tools = [{ name: 'readFile_byref_' + Math.random(), description: 'd', inputSchema: { type: 'object' } }];
		stringifyToolDefinitionsForOTel(tools); // prime the WeakMap
		const spy = vi.spyOn(JSON, 'stringify');
		try {
			const a = stringifyToolDefinitionsForOTel(tools);
			const b = stringifyToolDefinitionsForOTel(tools);
			expect(spy).not.toHaveBeenCalled();
			expect(a).toBe(b);
			expect(JSON.parse(a!)).toEqual([{ type: 'function', name: tools[0].name, description: 'd', parameters: { type: 'object' } }]);
		} finally {
			spy.mockRestore();
		}
	});

	it('content-interns across distinct references (one stringify per new ref, same instance returned)', () => {
		const unique = 'readFile_intern_' + Math.random();
		const t1 = [{ name: unique, description: 'd', inputSchema: { type: 'object' } }];
		const t2 = [{ name: unique, description: 'd', inputSchema: { type: 'object' } }];
		const a = stringifyToolDefinitionsForOTel(t1);
		const spy = vi.spyOn(JSON, 'stringify');
		try {
			const b = stringifyToolDefinitionsForOTel(t2);
			// Distinct ref forces one new JSON.stringify; intern then collapses the result.
			expect(spy).toHaveBeenCalledTimes(1);
			expect(Object.is(a, b)).toBe(true);
		} finally {
			spy.mockRestore();
		}
	});
});

describe('stringifyToolsRawForTelemetry', () => {
	it('mirrors JSON.stringify for empty / undefined input', () => {
		expect(stringifyToolsRawForTelemetry(undefined)).toBeUndefined();
		expect(stringifyToolsRawForTelemetry([])).toBe('[]');
	});

	it('skips re-stringification on repeated calls with the same array reference', () => {
		const tools = [{ type: 'function', name: 'raw_byref_' + Math.random() }];
		const expected = JSON.stringify(tools);
		stringifyToolsRawForTelemetry(tools); // prime the WeakMap
		const spy = vi.spyOn(JSON, 'stringify');
		try {
			const a = stringifyToolsRawForTelemetry(tools);
			const b = stringifyToolsRawForTelemetry(tools);
			expect(spy).not.toHaveBeenCalled();
			expect(a).toBe(expected);
			expect(a).toBe(b);
		} finally {
			spy.mockRestore();
		}
	});

	it('content-interns across distinct references (one stringify per new ref, same instance returned)', () => {
		const unique = 'raw_intern_' + Math.random();
		const t1 = [{ type: 'function', name: unique }];
		const t2 = [{ type: 'function', name: unique }];
		const a = stringifyToolsRawForTelemetry(t1);
		const spy = vi.spyOn(JSON, 'stringify');
		try {
			const b = stringifyToolsRawForTelemetry(t2);
			expect(spy).toHaveBeenCalledTimes(1);
			expect(Object.is(a, b)).toBe(true);
		} finally {
			spy.mockRestore();
		}
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

	it('default (no maxLength) is unlimited', () => {
		const s = 'x'.repeat(200_000);
		expect(truncateForOTel(s)).toBe(s);
	});

	it('returns string unchanged when maxLength is 0 (unlimited)', () => {
		const s = 'a'.repeat(200_000);
		expect(truncateForOTel(s, 0)).toBe(s);
	});

	it('returns string unchanged when maxLength is negative (unlimited)', () => {
		const s = 'a'.repeat(200_000);
		expect(truncateForOTel(s, -1)).toBe(s);
	});

	it('falls back to a hard cut when maxLength is too small to fit the suffix', () => {
		const s = 'a'.repeat(200);
		const result = truncateForOTel(s, 5);
		expect(result.length).toBeLessThanOrEqual(5);
		expect(result).toBe('aaaaa');
	});
});
