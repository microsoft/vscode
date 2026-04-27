/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ContentBlockParam, DocumentBlockParam, ImageBlockParam, MessageParam, TextBlockParam, ToolReferenceBlockParam, ToolResultBlockParam } from '@anthropic-ai/sdk/resources';
import { Raw } from '@vscode/prompt-tsx';
import { beforeEach, describe, expect, suite, test } from 'vitest';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { ChatLocation } from '../../../chat/common/commonTypes';
import { ConfigKey, IConfigurationService } from '../../../configuration/common/configurationService';
import { InMemoryConfigurationService } from '../../../configuration/test/common/inMemoryConfigurationService';
import { AnthropicMessagesTool, CUSTOM_TOOL_SEARCH_NAME } from '../../../networking/common/anthropic';
import { IChatEndpoint, ICreateEndpointBodyOptions } from '../../../networking/common/networking';
import { IToolDeferralService } from '../../../networking/common/toolDeferralService';
import { createPlatformServices } from '../../../test/node/services';
import { addLastTwoMessagesCacheControl, addToolsAndSystemCacheControl, buildToolInputSchema, createMessagesRequestBody, rawMessagesToMessagesAPI } from '../../node/messagesApi';

function assertContentArray(content: MessageParam['content']): ContentBlockParam[] {
	expect(Array.isArray(content)).toBe(true);
	return content as ContentBlockParam[];
}

function findBlock<T extends ContentBlockParam>(blocks: ContentBlockParam[], type: T['type']): T | undefined {
	return blocks.find(b => b.type === type) as T | undefined;
}

function findToolResult(messages: MessageParam[]): ToolResultBlockParam | undefined {
	for (const msg of messages.filter(m => m.role === 'user')) {
		const content = msg.content;
		if (Array.isArray(content)) {
			const result = content.find((c): c is ToolResultBlockParam => c.type === 'tool_result');
			if (result) {
				return result;
			}
		}
	}
	return undefined;
}

suite('rawMessagesToMessagesAPI', function () {

	test('places cache_control on tool_result block, not inside content', function () {
		const messages: Raw.ChatMessage[] = [
			{
				role: Raw.ChatRole.User,
				content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'Read my file' }],
			},
			{
				role: Raw.ChatRole.Assistant,
				content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'I will read the file.' }],
				toolCalls: [{
					id: 'toolu_test123',
					type: 'function',
					function: { name: 'read_file', arguments: '{"path":"/tmp/test.txt"}' },
				}],
			},
			{
				role: Raw.ChatRole.Tool,
				toolCallId: 'toolu_test123',
				content: [
					{ type: Raw.ChatCompletionContentPartKind.Text, text: 'Hello world' },
					{ type: Raw.ChatCompletionContentPartKind.CacheBreakpoint, cacheType: 'ephemeral' },
				],
			},
		];

		const result = rawMessagesToMessagesAPI(messages);

		const toolResult = findToolResult(result.messages);
		expect(toolResult).toBeDefined();

		// cache_control should be on the tool_result block itself
		expect(toolResult!.cache_control).toEqual({ type: 'ephemeral' });

		// cache_control should NOT be on inner content blocks
		if (Array.isArray(toolResult!.content)) {
			for (const inner of toolResult!.content) {
				expect(('cache_control' in inner) ? inner.cache_control : undefined).toBeUndefined();
			}
		}
	});

	test('tool_result without cache_control has no cache_control property', function () {
		const messages: Raw.ChatMessage[] = [
			{
				role: Raw.ChatRole.Tool,
				toolCallId: 'toolu_no_cache',
				content: [
					{ type: Raw.ChatCompletionContentPartKind.Text, text: 'result text' },
				],
			},
		];

		const result = rawMessagesToMessagesAPI(messages);

		const toolResult = findToolResult(result.messages);
		expect(toolResult).toBeDefined();
		expect(toolResult!.cache_control).toBeUndefined();
	});

	test('converts base64 data URL image to Anthropic base64 image source', function () {
		const base64Data = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk';
		const messages: Raw.ChatMessage[] = [
			{
				role: Raw.ChatRole.User,
				content: [{
					type: Raw.ChatCompletionContentPartKind.Image,
					imageUrl: { url: `data:image/png;base64,${base64Data}` },
				}],
			},
		];

		const result = rawMessagesToMessagesAPI(messages);
		const content = assertContentArray(result.messages[0].content);
		const imageBlock = findBlock<ImageBlockParam>(content, 'image');
		expect(imageBlock).toBeDefined();
		expect(imageBlock!.source).toEqual({
			type: 'base64',
			media_type: 'image/png',
			data: base64Data,
		});
	});

	test('converts https URL image to Anthropic url image source', function () {
		const imageUrl = 'https://example.com/image.png';
		const messages: Raw.ChatMessage[] = [
			{
				role: Raw.ChatRole.User,
				content: [{
					type: Raw.ChatCompletionContentPartKind.Image,
					imageUrl: { url: imageUrl },
				}],
			},
		];

		const result = rawMessagesToMessagesAPI(messages);
		const content = assertContentArray(result.messages[0].content);
		const imageBlock = findBlock<ImageBlockParam>(content, 'image');
		expect(imageBlock).toBeDefined();
		expect(imageBlock!.source).toEqual({
			type: 'url',
			url: imageUrl,
		});
	});

	test('drops image with unsupported URL scheme', function () {
		const messages: Raw.ChatMessage[] = [
			{
				role: Raw.ChatRole.User,
				content: [
					{ type: Raw.ChatCompletionContentPartKind.Text, text: 'look at this' },
					{
						type: Raw.ChatCompletionContentPartKind.Image,
						imageUrl: { url: 'http://insecure.example.com/image.png' },
					},
				],
			},
		];

		const result = rawMessagesToMessagesAPI(messages);
		const content = assertContentArray(result.messages[0].content);
		expect(findBlock<ImageBlockParam>(content, 'image')).toBeUndefined();
		expect(findBlock(content, 'text')).toBeDefined();
	});

	suite('custom tool search tool_reference conversion', function () {

		function makeToolSearchMessages(toolNames: string[]): Raw.ChatMessage[] {
			return [
				{
					role: Raw.ChatRole.User,
					content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'find github tools' }],
				},
				{
					role: Raw.ChatRole.Assistant,
					content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'Searching for tools.' }],
					toolCalls: [{
						id: 'toolu_search1',
						type: 'function',
						function: { name: CUSTOM_TOOL_SEARCH_NAME, arguments: '{"query":"github"}' },
					}],
				},
				{
					role: Raw.ChatRole.Tool,
					toolCallId: 'toolu_search1',
					content: [
						{ type: Raw.ChatCompletionContentPartKind.Text, text: JSON.stringify(toolNames) },
					],
				},
			];
		}

		test('converts tool search results into tool_reference blocks', function () {
			const messages = makeToolSearchMessages(['mcp__github__list_issues', 'mcp__github__create_pull_request']);
			const validToolNames = new Set(['mcp__github__list_issues', 'mcp__github__create_pull_request']);

			const result = rawMessagesToMessagesAPI(messages, validToolNames);

			const toolResult = findToolResult(result.messages);
			expect(toolResult).toBeDefined();
			const content = toolResult!.content as ToolReferenceBlockParam[];
			expect(content).toHaveLength(2);
			expect(content[0]).toEqual({ type: 'tool_reference', tool_name: 'mcp__github__list_issues' });
			expect(content[1]).toEqual({ type: 'tool_reference', tool_name: 'mcp__github__create_pull_request' });
		});

		test('filters tool_reference blocks against validToolNames', function () {
			const messages = makeToolSearchMessages(['mcp__github__list_issues', 'mcp__github__unknown_tool', 'read_file']);
			const validToolNames = new Set(['mcp__github__list_issues', 'read_file', 'edit_file']);

			const result = rawMessagesToMessagesAPI(messages, validToolNames);

			const toolResult = findToolResult(result.messages);
			expect(toolResult).toBeDefined();
			const content = toolResult!.content as ToolReferenceBlockParam[];
			expect(content).toHaveLength(2);
			expect(content.map(c => c.tool_name)).toEqual(['mcp__github__list_issues', 'read_file']);
		});

		test('filters out all tool names when none are valid', function () {
			const messages = makeToolSearchMessages(['unknown_tool_a', 'unknown_tool_b']);
			const validToolNames = new Set(['read_file']);

			const result = rawMessagesToMessagesAPI(messages, validToolNames);

			const toolResult = findToolResult(result.messages);
			expect(toolResult).toBeDefined();
			// No valid tool references, content should be undefined (empty filtered)
			expect(toolResult!.content).toBeUndefined();
		});

		test('falls back to text content when validToolNames is undefined (tool search disabled)', function () {
			const messages = makeToolSearchMessages(['any_tool', 'another_tool']);

			const result = rawMessagesToMessagesAPI(messages);

			const toolResult = findToolResult(result.messages);
			expect(toolResult).toBeDefined();
			// When validToolNames is undefined, tool_reference conversion is skipped
			// and the original text content is preserved as a fallback
			const content = toolResult!.content as TextBlockParam[];
			expect(content).toHaveLength(1);
			expect(content[0].type).toBe('text');
		});

		test('returns undefined for non-JSON tool search results', function () {
			const messages: Raw.ChatMessage[] = [
				{
					role: Raw.ChatRole.Assistant,
					content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: '' }],
					toolCalls: [{
						id: 'toolu_bad',
						type: 'function',
						function: { name: CUSTOM_TOOL_SEARCH_NAME, arguments: '{"query":"test"}' },
					}],
				},
				{
					role: Raw.ChatRole.Tool,
					toolCallId: 'toolu_bad',
					content: [
						{ type: Raw.ChatCompletionContentPartKind.Text, text: 'not valid json' },
					],
				},
			];

			const result = rawMessagesToMessagesAPI(messages);

			// Falls back to normal text content since JSON parse fails
			const toolResult = findToolResult(result.messages);
			expect(toolResult).toBeDefined();
			const content = toolResult!.content as ContentBlockParam[];
			expect(content).toHaveLength(1);
			expect(content[0]).toEqual(expect.objectContaining({ type: 'text', text: 'not valid json' }));
		});

		test('does not convert tool results for non-tool-search tools', function () {
			const messages: Raw.ChatMessage[] = [
				{
					role: Raw.ChatRole.Assistant,
					content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: '' }],
					toolCalls: [{
						id: 'toolu_read',
						type: 'function',
						function: { name: 'read_file', arguments: '{"path":"/tmp/test.txt"}' },
					}],
				},
				{
					role: Raw.ChatRole.Tool,
					toolCallId: 'toolu_read',
					content: [
						{ type: Raw.ChatCompletionContentPartKind.Text, text: '["mcp__github__list_issues"]' },
					],
				},
			];

			const result = rawMessagesToMessagesAPI(messages);

			const toolResult = findToolResult(result.messages);
			expect(toolResult).toBeDefined();
			// Should be normal text, not tool_reference blocks
			const content = toolResult!.content as ContentBlockParam[];
			expect(content).toHaveLength(1);
			expect(content[0]).toEqual(expect.objectContaining({ type: 'text', text: '["mcp__github__list_issues"]' }));
		});
	});

	test('converts document content part to Anthropic document block', function () {
		const base64Data = 'JVBERi0xLjQKMSAwIG9iago8PC9UeXBlIC9DYXRhbG9n';
		const messages: Raw.ChatMessage[] = [
			{
				role: Raw.ChatRole.User,
				content: [{
					type: Raw.ChatCompletionContentPartKind.Document,
					documentData: { data: base64Data, mediaType: 'application/pdf' },
				}],
			},
		];

		const result = rawMessagesToMessagesAPI(messages);
		const content = assertContentArray(result.messages[0].content);
		const docBlock = findBlock<DocumentBlockParam>(content, 'document');
		expect(docBlock).toBeDefined();
		expect(docBlock!.source).toEqual({
			type: 'base64',
			media_type: 'application/pdf',
			data: base64Data,
		});
	});

	test('document content part in tool result is preserved', function () {
		const base64Data = 'JVBERi0xLjQK';
		const messages: Raw.ChatMessage[] = [
			{
				role: Raw.ChatRole.Assistant,
				content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: '' }],
				toolCalls: [{
					id: 'toolu_pdf',
					type: 'function',
					function: { name: 'read_file', arguments: '{"path":"/tmp/doc.pdf"}' },
				}],
			},
			{
				role: Raw.ChatRole.Tool,
				toolCallId: 'toolu_pdf',
				content: [
					{ type: Raw.ChatCompletionContentPartKind.Document, documentData: { data: base64Data, mediaType: 'application/pdf' } },
				],
			},
		];

		const result = rawMessagesToMessagesAPI(messages);
		const toolResult = findToolResult(result.messages);
		expect(toolResult).toBeDefined();
		const content = toolResult!.content as DocumentBlockParam[];
		expect(content).toHaveLength(1);
		expect(content[0].type).toBe('document');
		expect(content[0].source).toEqual({
			type: 'base64',
			media_type: 'application/pdf',
			data: base64Data,
		});
	});

	test('cache_control-only tool content does not produce empty inner content', function () {
		const messages: Raw.ChatMessage[] = [
			{
				role: Raw.ChatRole.Tool,
				toolCallId: 'toolu_cache_only',
				content: [
					{ type: Raw.ChatCompletionContentPartKind.CacheBreakpoint, cacheType: 'ephemeral' },
				],
			},
		];

		const result = rawMessagesToMessagesAPI(messages);

		const toolResult = findToolResult(result.messages);
		expect(toolResult).toBeDefined();
		// Orphaned cache breakpoint with no content to attach to is silently dropped
		expect(toolResult!.cache_control).toBeUndefined();
		expect(toolResult!.content).toBeUndefined();
	});

	test('cache breakpoint before content defers cache_control to next block', function () {
		const messages: Raw.ChatMessage[] = [
			{
				role: Raw.ChatRole.User,
				content: [
					{ type: Raw.ChatCompletionContentPartKind.CacheBreakpoint, cacheType: 'ephemeral' },
					{ type: Raw.ChatCompletionContentPartKind.Text, text: 'hello world' },
				],
			},
		];

		const result = rawMessagesToMessagesAPI(messages);

		expect(result.messages).toHaveLength(1);
		const content = assertContentArray(result.messages[0].content);
		expect(content).toHaveLength(1);
		expect(content[0]).toEqual({
			type: 'text',
			text: 'hello world',
			cache_control: { type: 'ephemeral' },
		});
	});
});

suite('addToolsAndSystemCacheControl', function () {

	function makeTool(name: string, deferred = false): AnthropicMessagesTool {
		return {
			name,
			description: `${name} tool`,
			input_schema: { type: 'object', properties: {}, required: [] },
			...(deferred ? { defer_loading: true } : {}),
		};
	}

	function makeSystemBlock(text: string, cached = false): TextBlockParam {
		return {
			type: 'text',
			text,
			...(cached ? { cache_control: { type: 'ephemeral' as const } } : {}),
		};
	}

	function makeMessages(...msgs: MessageParam[]): MessageParam[] {
		return msgs;
	}

	function countCacheControl(tools: AnthropicMessagesTool[], system: TextBlockParam[] | undefined, messages: MessageParam[]): number {
		let count = 0;
		for (const tool of tools) {
			if (tool.cache_control) {
				count++;
			}
		}
		if (system) {
			for (const block of system) {
				if (block.cache_control) {
					count++;
				}
			}
		}
		for (const msg of messages) {
			if (Array.isArray(msg.content)) {
				for (const block of msg.content) {
					if (typeof block === 'object' && 'cache_control' in block && block.cache_control) {
						count++;
					}
				}
			}
		}
		return count;
	}

	test('adds cache_control to last non-deferred tool and last system block', function () {
		const tools = [makeTool('read_file'), makeTool('edit_file')];
		const system: TextBlockParam[] = [makeSystemBlock('You are a helpful assistant.')];
		const messagesResult = { messages: makeMessages(), system };

		addToolsAndSystemCacheControl(tools, messagesResult);

		expect(tools[0].cache_control).toBeUndefined();
		expect(tools[1].cache_control).toEqual({ type: 'ephemeral' });
		expect(system[0].cache_control).toEqual({ type: 'ephemeral' });
	});

	test('skips deferred tools and marks last non-deferred tool', function () {
		const tools = [makeTool('read_file'), makeTool('edit_file'), makeTool('deferred_a', true), makeTool('deferred_b', true)];
		const system: TextBlockParam[] = [makeSystemBlock('System prompt')];
		const messagesResult = { messages: makeMessages(), system };

		addToolsAndSystemCacheControl(tools, messagesResult);

		expect(tools[0].cache_control).toBeUndefined();
		expect(tools[1].cache_control).toEqual({ type: 'ephemeral' });
		expect(tools[2].cache_control).toBeUndefined();
		expect(tools[3].cache_control).toBeUndefined();
	});

	test('does nothing when all tools are deferred and system already has cache_control', function () {
		const tools = [makeTool('deferred_a', true)];
		const system: TextBlockParam[] = [makeSystemBlock('System prompt', true)];
		const messagesResult = { messages: makeMessages(), system };

		addToolsAndSystemCacheControl(tools, messagesResult);

		expect(tools[0].cache_control).toBeUndefined();
		expect(system[0].cache_control).toEqual({ type: 'ephemeral' });
	});

	test('does nothing when no tools and no system', function () {
		const tools: AnthropicMessagesTool[] = [];
		const messagesResult = { messages: makeMessages() };

		addToolsAndSystemCacheControl(tools, messagesResult);

		expect(tools).toHaveLength(0);
	});

	test('uses spare slot for tool when messages leave one slot available', function () {
		const tools = [makeTool('read_file')];
		const system: TextBlockParam[] = [makeSystemBlock('System prompt')];
		const msg1Content: ContentBlockParam[] = [
			{ type: 'text', text: 'msg1', cache_control: { type: 'ephemeral' } },
		];
		const msg2Content: ContentBlockParam[] = [
			{ type: 'text', text: 'msg2', cache_control: { type: 'ephemeral' } },
		];
		const msg3Content: ContentBlockParam[] = [
			{ type: 'text', text: 'msg3', cache_control: { type: 'ephemeral' } },
		];
		const messages = makeMessages(
			{ role: 'user', content: msg1Content },
			{ role: 'assistant', content: msg2Content },
			{ role: 'user', content: msg3Content },
		);
		const messagesResult = { messages, system };

		// 3 existing in messages, 1 spare slot → tool gets it, system does not
		addToolsAndSystemCacheControl(tools, messagesResult);

		expect(countCacheControl(tools, system, messages)).toBeLessThanOrEqual(4);
		// Tool gets the spare slot
		expect(tools[0].cache_control).toEqual({ type: 'ephemeral' });
		// System does not — no spare slot left
		expect(system[0].cache_control).toBeUndefined();
		// Message breakpoints are preserved (no eviction)
		expect(msg1Content[0]).toHaveProperty('cache_control');
		expect(msg2Content[0]).toHaveProperty('cache_control');
		expect(msg3Content[0]).toHaveProperty('cache_control');
	});

	test('skips adding breakpoints when all slots are occupied', function () {
		// All 4 breakpoints on system blocks — no spare slots
		const tools = [makeTool('read_file')];
		const system: TextBlockParam[] = [
			makeSystemBlock('block1', true),
			makeSystemBlock('block2', true),
			makeSystemBlock('block3', true),
			makeSystemBlock('block4', true),
		];
		const messagesResult = { messages: makeMessages(), system };

		addToolsAndSystemCacheControl(tools, messagesResult);

		expect(tools[0].cache_control).toBeUndefined();
		expect(countCacheControl(tools, system, messagesResult.messages)).toBeLessThanOrEqual(4);
	});

	test('skips adding breakpoints when all slots are occupied by messages', function () {
		const tools = [makeTool('read_file')];
		const system: TextBlockParam[] = [makeSystemBlock('System prompt')];
		const messages = makeMessages(
			{ role: 'user', content: [{ type: 'text', text: 'a', cache_control: { type: 'ephemeral' } }] as ContentBlockParam[] },
			{ role: 'assistant', content: [{ type: 'text', text: 'b', cache_control: { type: 'ephemeral' } }] as ContentBlockParam[] },
			{ role: 'user', content: [{ type: 'text', text: 'c', cache_control: { type: 'ephemeral' } }] as ContentBlockParam[] },
			{ role: 'assistant', content: [{ type: 'text', text: 'd', cache_control: { type: 'ephemeral' } }] as ContentBlockParam[] },
		);
		const messagesResult = { messages, system };

		addToolsAndSystemCacheControl(tools, messagesResult);

		// All 4 slots occupied by messages — tool and system should not get cache_control
		expect(tools[0].cache_control).toBeUndefined();
		expect(system[0].cache_control).toBeUndefined();
		expect(countCacheControl(tools, system, messages)).toBe(4);
	});

	test('prioritizes tool breakpoint over system when only one spare slot', function () {
		const tools = [makeTool('read_file')];
		const system: TextBlockParam[] = [makeSystemBlock('System prompt')];
		const messages = makeMessages(
			{ role: 'user', content: [{ type: 'text', text: 'a', cache_control: { type: 'ephemeral' } }] as ContentBlockParam[] },
			{ role: 'assistant', content: [{ type: 'text', text: 'b', cache_control: { type: 'ephemeral' } }] as ContentBlockParam[] },
			{ role: 'user', content: [{ type: 'text', text: 'c', cache_control: { type: 'ephemeral' } }] as ContentBlockParam[] },
		);
		const messagesResult = { messages, system };

		// 3 existing message breakpoints, 1 spare slot → tool gets it
		addToolsAndSystemCacheControl(tools, messagesResult);

		expect(countCacheControl(tools, system, messages)).toBeLessThanOrEqual(4);
		expect(tools[0].cache_control).toEqual({ type: 'ephemeral' });
		expect(system[0].cache_control).toBeUndefined();
	});

	test('handles only tools, no system blocks', function () {
		const tools = [makeTool('read_file'), makeTool('edit_file')];
		const messagesResult = { messages: makeMessages() };

		addToolsAndSystemCacheControl(tools, messagesResult);

		expect(tools[1].cache_control).toEqual({ type: 'ephemeral' });
		expect(tools[0].cache_control).toBeUndefined();
	});

	test('handles only system, no tools', function () {
		const tools: AnthropicMessagesTool[] = [];
		const system: TextBlockParam[] = [makeSystemBlock('System prompt')];
		const messagesResult = { messages: makeMessages(), system };

		addToolsAndSystemCacheControl(tools, messagesResult);

		expect(system[0].cache_control).toEqual({ type: 'ephemeral' });
	});
});

suite('buildToolInputSchema', function () {

	test('returns default schema when input is undefined', function () {
		const result = buildToolInputSchema(undefined);
		expect(result).toEqual({ type: 'object', properties: {} });
	});

	test('strips $schema from the input', function () {
		const result = buildToolInputSchema({
			$schema: 'https://json-schema.org/draft/2020-12/schema',
			type: 'object',
			properties: { query: { type: 'string' } },
			required: ['query'],
		});
		expect(result).toEqual({
			type: 'object',
			properties: { query: { type: 'string' } },
			required: ['query'],
		});
		expect(result).not.toHaveProperty('$schema');
	});

	test('preserves $defs and additionalProperties', function () {
		const defs = { Foo: { type: 'object', properties: { x: { type: 'number' } } } };
		const result = buildToolInputSchema({
			type: 'object',
			properties: { foo: { $ref: '#/$defs/Foo' } },
			$defs: defs,
			additionalProperties: false,
		});
		expect(result.$defs).toEqual(defs);
		expect(result.additionalProperties).toBe(false);
	});

	test('defaults properties to empty object when not provided', function () {
		const result = buildToolInputSchema({ type: 'object' });
		expect(result.properties).toEqual({});
	});

	test('overrides default properties when provided in schema', function () {
		const props = { name: { type: 'string' } };
		const result = buildToolInputSchema({ type: 'object', properties: props });
		expect(result.properties).toEqual(props);
	});

	test('passes through a plain schema without $schema unchanged', function () {
		const schema = {
			type: 'object',
			properties: { id: { type: 'number' } },
			required: ['id'],
		};
		const result = buildToolInputSchema(schema);
		expect(result).toEqual(schema);
	});
});

suite('addLastTwoMessagesCacheControl', function () {

	function makeMessages(...msgs: MessageParam[]): MessageParam[] {
		return msgs;
	}

	function makeTool(name: string, deferred = false): AnthropicMessagesTool {
		return {
			name,
			description: `${name} tool`,
			input_schema: { type: 'object', properties: {}, required: [] },
			...(deferred ? { defer_loading: true } : {}),
		};
	}

	function getCacheControl(block: ContentBlockParam): { type: string } | undefined {
		return 'cache_control' in block ? (block as { cache_control?: { type: string } }).cache_control : undefined;
	}

	function countAllCacheControl(messages: MessageParam[], system?: TextBlockParam[]): number {
		let count = 0;
		if (system) {
			for (const block of system) {
				if (block.cache_control) {
					count++;
				}
			}
		}
		for (const msg of messages) {
			if (Array.isArray(msg.content)) {
				for (const block of msg.content) {
					if (typeof block === 'object' && 'cache_control' in block && block.cache_control) {
						count++;
					}
				}
			}
		}
		return count;
	}

	test('marks last two messages in a normal agentic loop', function () {
		const messages = makeMessages(
			{ role: 'user', content: [{ type: 'text', text: 'edit my file' }] as ContentBlockParam[] },
			{ role: 'assistant', content: [{ type: 'text', text: 'calling tool' }, { type: 'tool_use', id: 'toolu_1', name: 'read_file', input: {} }] as ContentBlockParam[] },
			{ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: [{ type: 'text', text: 'file contents' }] }] as ContentBlockParam[] },
		);
		const messagesResult = { messages };

		addLastTwoMessagesCacheControl(messagesResult);

		const assistantContent = messages[1].content as ContentBlockParam[];
		expect(getCacheControl(assistantContent[assistantContent.length - 1])).toEqual({ type: 'ephemeral' });

		const toolResult = (messages[2].content as ContentBlockParam[])[0] as ToolResultBlockParam;
		expect(toolResult.cache_control).toEqual({ type: 'ephemeral' });

		expect(getCacheControl((messages[0].content as ContentBlockParam[])[0])).toBeUndefined();
		expect(countAllCacheControl(messages)).toBe(2);
	});

	test('marks last two messages in plain chat', function () {
		const messages = makeMessages(
			{ role: 'user', content: [{ type: 'text', text: 'hello' }] as ContentBlockParam[] },
			{ role: 'assistant', content: [{ type: 'text', text: 'hi there' }] as ContentBlockParam[] },
		);
		const messagesResult = { messages };

		addLastTwoMessagesCacheControl(messagesResult);

		expect(getCacheControl((messages[0].content as ContentBlockParam[])[0])).toEqual({ type: 'ephemeral' });
		expect(getCacheControl((messages[1].content as ContentBlockParam[])[0])).toEqual({ type: 'ephemeral' });
		expect(countAllCacheControl(messages)).toBe(2);
	});

	test('handles single message', function () {
		const messages = makeMessages(
			{ role: 'user', content: [{ type: 'text', text: 'hello' }] as ContentBlockParam[] },
		);
		const messagesResult = { messages };

		addLastTwoMessagesCacheControl(messagesResult);

		expect(getCacheControl((messages[0].content as ContentBlockParam[])[0])).toEqual({ type: 'ephemeral' });
		expect(countAllCacheControl(messages)).toBe(1);
	});

	test('handles empty messages array', function () {
		const messagesResult = { messages: [] as MessageParam[] };

		addLastTwoMessagesCacheControl(messagesResult);

		expect(messagesResult.messages).toHaveLength(0);
	});

	test('skips thinking and redacted_thinking blocks', function () {
		const messages = makeMessages(
			{ role: 'user', content: [{ type: 'text', text: 'hello' }] as ContentBlockParam[] },
			{
				role: 'assistant', content: [
					{ type: 'thinking', thinking: 'hmm', signature: 'sig' },
					{ type: 'text', text: 'response' },
				] as ContentBlockParam[]
			},
		);
		const messagesResult = { messages };

		addLastTwoMessagesCacheControl(messagesResult);

		const assistantContent = messages[1].content as ContentBlockParam[];
		expect(getCacheControl(assistantContent[0])).toBeUndefined();
		expect(getCacheControl(assistantContent[1])).toEqual({ type: 'ephemeral' });
		expect(countAllCacheControl(messages)).toBe(2);
	});

	test('respects max breakpoint count when some already exist', function () {
		const messages = makeMessages(
			{ role: 'user', content: [{ type: 'text', text: 'a', cache_control: { type: 'ephemeral' } }] as ContentBlockParam[] },
			{ role: 'assistant', content: [{ type: 'text', text: 'b', cache_control: { type: 'ephemeral' } }] as ContentBlockParam[] },
			{ role: 'user', content: [{ type: 'text', text: 'c', cache_control: { type: 'ephemeral' } }] as ContentBlockParam[] },
			{ role: 'assistant', content: [{ type: 'text', text: 'd' }] as ContentBlockParam[] },
			{ role: 'user', content: [{ type: 'text', text: 'e' }] as ContentBlockParam[] },
		);
		const messagesResult = { messages };

		addLastTwoMessagesCacheControl(messagesResult);

		// 3 existing + 1 new = 4 total
		expect(countAllCacheControl(messages)).toBe(4);
		expect(getCacheControl((messages[4].content as ContentBlockParam[])[0])).toEqual({ type: 'ephemeral' });
		// Second-to-last should NOT get one — would exceed 4
		expect(getCacheControl((messages[3].content as ContentBlockParam[])[0])).toBeUndefined();
	});

	test('does nothing when all 4 slots are occupied', function () {
		const messages = makeMessages(
			{ role: 'user', content: [{ type: 'text', text: 'a', cache_control: { type: 'ephemeral' } }] as ContentBlockParam[] },
			{ role: 'assistant', content: [{ type: 'text', text: 'b', cache_control: { type: 'ephemeral' } }] as ContentBlockParam[] },
			{ role: 'user', content: [{ type: 'text', text: 'c', cache_control: { type: 'ephemeral' } }] as ContentBlockParam[] },
			{ role: 'assistant', content: [{ type: 'text', text: 'd', cache_control: { type: 'ephemeral' } }] as ContentBlockParam[] },
			{ role: 'user', content: [{ type: 'text', text: 'e' }] as ContentBlockParam[] },
		);
		const messagesResult = { messages };

		addLastTwoMessagesCacheControl(messagesResult);

		expect(getCacheControl((messages[4].content as ContentBlockParam[])[0])).toBeUndefined();
		expect(countAllCacheControl(messages)).toBe(4);
	});

	test('treats trailing message with existing cache_control as already marked', function () {
		// Regression: prior code would walk past a pre-marked tail message and
		// add two new markers to earlier messages, ending up with 3 distinct
		// marked messages instead of 2.
		const messages = makeMessages(
			{ role: 'user', content: [{ type: 'text', text: 'a' }] as ContentBlockParam[] },
			{ role: 'assistant', content: [{ type: 'text', text: 'b' }] as ContentBlockParam[] },
			{ role: 'user', content: [{ type: 'text', text: 'c' }] as ContentBlockParam[] },
			{ role: 'assistant', content: [{ type: 'text', text: 'd', cache_control: { type: 'ephemeral' } }] as ContentBlockParam[] },
		);
		const messagesResult = { messages };

		const added = addLastTwoMessagesCacheControl(messagesResult);

		expect(added).toBe(1);
		expect(getCacheControl((messages[3].content as ContentBlockParam[])[0])).toEqual({ type: 'ephemeral' });
		expect(getCacheControl((messages[2].content as ContentBlockParam[])[0])).toEqual({ type: 'ephemeral' });
		expect(getCacheControl((messages[1].content as ContentBlockParam[])[0])).toBeUndefined();
		expect(getCacheControl((messages[0].content as ContentBlockParam[])[0])).toBeUndefined();
		expect(countAllCacheControl(messages)).toBe(2);
	});

	test('does not add a second marker to a message that already has one on a non-last block', function () {
		const messages = makeMessages(
			{ role: 'user', content: [{ type: 'text', text: 'a' }] as ContentBlockParam[] },
			{
				role: 'assistant', content: [
					{ type: 'text', text: 'first', cache_control: { type: 'ephemeral' } },
					{ type: 'text', text: 'second' },
				] as ContentBlockParam[]
			},
		);
		const messagesResult = { messages };

		const added = addLastTwoMessagesCacheControl(messagesResult);

		// Last message already counts as marked; only the prior message gets a new marker.
		expect(added).toBe(1);
		const assistantContent = messages[1].content as ContentBlockParam[];
		expect(getCacheControl(assistantContent[0])).toEqual({ type: 'ephemeral' });
		expect(getCacheControl(assistantContent[1])).toBeUndefined();
		expect(getCacheControl((messages[0].content as ContentBlockParam[])[0])).toEqual({ type: 'ephemeral' });
		expect(countAllCacheControl(messages)).toBe(2);
	});

	test('marks assistant-with-tool-calls as fork point', function () {
		const messages = makeMessages(
			{ role: 'user', content: [{ type: 'text', text: 'do stuff' }] as ContentBlockParam[] },
			{
				role: 'assistant', content: [
					{ type: 'text', text: 'I will call tools' },
					{ type: 'tool_use', id: 'toolu_a', name: 'tool_a', input: {} },
					{ type: 'tool_use', id: 'toolu_b', name: 'tool_b', input: {} },
				] as ContentBlockParam[]
			},
			{
				role: 'user', content: [
					{ type: 'tool_result', tool_use_id: 'toolu_a', content: [{ type: 'text', text: 'result a' }] },
					{ type: 'tool_result', tool_use_id: 'toolu_b', content: [{ type: 'text', text: 'result b' }] },
				] as ContentBlockParam[]
			},
		);
		const messagesResult = { messages };

		addLastTwoMessagesCacheControl(messagesResult);

		const assistantContent = messages[1].content as ContentBlockParam[];
		expect(getCacheControl(assistantContent[2])).toEqual({ type: 'ephemeral' });

		const userContent = messages[2].content as ContentBlockParam[];
		expect(getCacheControl(userContent[1])).toEqual({ type: 'ephemeral' });

		expect(countAllCacheControl(messages)).toBe(2);
	});

	test('counts system block breakpoints toward the limit', function () {
		const system: TextBlockParam[] = [
			{ type: 'text', text: 'system', cache_control: { type: 'ephemeral' } },
		];
		const messages = makeMessages(
			{ role: 'user', content: [{ type: 'text', text: 'a' }] as ContentBlockParam[] },
			{ role: 'assistant', content: [{ type: 'text', text: 'b' }] as ContentBlockParam[] },
			{ role: 'user', content: [{ type: 'text', text: 'c' }] as ContentBlockParam[] },
		);
		const messagesResult = { messages, system };

		addLastTwoMessagesCacheControl(messagesResult);

		// 1 system + 2 message breakpoints = 3 total
		expect(countAllCacheControl(messages, system)).toBe(3);
		expect(getCacheControl((messages[1].content as ContentBlockParam[])[0])).toEqual({ type: 'ephemeral' });
		expect(getCacheControl((messages[2].content as ContentBlockParam[])[0])).toEqual({ type: 'ephemeral' });
	});

	test('skips tail message with empty content and marks two prior', function () {
		const messages = makeMessages(
			{ role: 'user', content: [{ type: 'text', text: 'hello' }] as ContentBlockParam[] },
			{ role: 'assistant', content: [{ type: 'text', text: 'response' }] as ContentBlockParam[] },
			{ role: 'user', content: [] as ContentBlockParam[] },
		);
		const messagesResult = { messages };

		addLastTwoMessagesCacheControl(messagesResult);

		expect(getCacheControl((messages[0].content as ContentBlockParam[])[0])).toEqual({ type: 'ephemeral' });
		expect(getCacheControl((messages[1].content as ContentBlockParam[])[0])).toEqual({ type: 'ephemeral' });
		expect(countAllCacheControl(messages)).toBe(2);
	});

	test('skips thinking-only tail message and marks two prior', function () {
		const messages = makeMessages(
			{ role: 'user', content: [{ type: 'text', text: 'hello' }] as ContentBlockParam[] },
			{ role: 'assistant', content: [{ type: 'text', text: 'first response' }] as ContentBlockParam[] },
			{
				role: 'assistant', content: [
					{ type: 'thinking', thinking: 'deep thought', signature: 'sig' },
					{ type: 'redacted_thinking', data: 'redacted' },
				] as ContentBlockParam[]
			},
		);
		const messagesResult = { messages };

		addLastTwoMessagesCacheControl(messagesResult);

		// Thinking-only message has no cacheable blocks — skip it
		expect(getCacheControl((messages[0].content as ContentBlockParam[])[0])).toEqual({ type: 'ephemeral' });
		expect(getCacheControl((messages[1].content as ContentBlockParam[])[0])).toEqual({ type: 'ephemeral' });
		expect(countAllCacheControl(messages)).toBe(2);
	});

	test('skips empty middle message and still finds two cacheable', function () {
		const messages = makeMessages(
			{ role: 'user', content: [{ type: 'text', text: 'hello' }] as ContentBlockParam[] },
			{ role: 'assistant', content: [] as ContentBlockParam[] },
			{ role: 'user', content: [{ type: 'text', text: 'follow up' }] as ContentBlockParam[] },
		);
		const messagesResult = { messages };

		addLastTwoMessagesCacheControl(messagesResult);

		// Last message + first message (middle is empty, skipped)
		expect(getCacheControl((messages[2].content as ContentBlockParam[])[0])).toEqual({ type: 'ephemeral' });
		expect(getCacheControl((messages[0].content as ContentBlockParam[])[0])).toEqual({ type: 'ephemeral' });
		expect(countAllCacheControl(messages)).toBe(2);
	});

	test('round-trip with addToolsAndSystemCacheControl produces exactly 4 markers', function () {
		const tools = [makeTool('read_file'), makeTool('edit_file')];
		const system: TextBlockParam[] = [{ type: 'text', text: 'You are a helpful assistant.' }];
		const messages = makeMessages(
			{ role: 'user', content: [{ type: 'text', text: 'edit my file' }] as ContentBlockParam[] },
			{ role: 'assistant', content: [{ type: 'text', text: 'calling tool' }, { type: 'tool_use', id: 'toolu_1', name: 'read_file', input: {} }] as ContentBlockParam[] },
			{ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: [{ type: 'text', text: 'file contents' }] }] as ContentBlockParam[] },
		);
		const messagesResult = { messages, system };

		// Call both in the same order as createMessagesRequestBody
		addLastTwoMessagesCacheControl(messagesResult);
		addToolsAndSystemCacheControl(tools, messagesResult);

		// 2 message breakpoints + 1 tool + 1 system = 4
		let totalCount = countAllCacheControl(messages, system);
		for (const tool of tools) {
			if (tool.cache_control) {
				totalCount++;
			}
		}
		expect(totalCount).toBe(4);

		// Verify positions
		const assistantContent = messages[1].content as ContentBlockParam[];
		expect(getCacheControl(assistantContent[assistantContent.length - 1])).toEqual({ type: 'ephemeral' });
		expect(((messages[2].content as ContentBlockParam[])[0] as ToolResultBlockParam).cache_control).toEqual({ type: 'ephemeral' });
		expect(tools[1].cache_control).toEqual({ type: 'ephemeral' });
		expect(system[0].cache_control).toEqual({ type: 'ephemeral' });
	});
});

describe('createMessagesRequestBody reasoning effort', () => {
	let disposables: DisposableStore;
	let instantiationService: IInstantiationService;
	let mockConfig: InMemoryConfigurationService;

	function createMockEndpoint(overrides: Partial<IChatEndpoint> = {}): IChatEndpoint {
		return {
			model: 'claude-sonnet-4.5',
			family: 'claude-sonnet-4.5',
			modelProvider: 'Anthropic',
			maxOutputTokens: 8192,
			modelMaxPromptTokens: 200000,
			supportsToolCalls: true,
			supportsVision: true,
			supportsPrediction: false,
			showInModelPicker: true,
			isFallback: false,
			name: 'test',
			version: '1.0',
			policy: 'enabled',
			urlOrRequestMetadata: 'https://test.com',
			tokenizer: 0,
			isDefault: false,
			processResponseFromChatEndpoint: () => { throw new Error('not implemented'); },
			acceptChatPolicy: () => { throw new Error('not implemented'); },
			makeChatRequest2: () => { throw new Error('not implemented'); },
			createRequestBody: () => { throw new Error('not implemented'); },
			cloneWithTokenOverride: () => { throw new Error('not implemented'); },
			interceptBody: () => { },
			getExtraHeaders: () => ({}),
			...overrides,
		} as IChatEndpoint;
	}

	function createMinimalOptions(overrides: Partial<ICreateEndpointBodyOptions> = {}): ICreateEndpointBodyOptions {
		return {
			debugName: 'test',
			requestId: 'test-request-id',
			finishedCb: undefined,
			messages: [{
				role: Raw.ChatRole.User,
				content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'Hello' }],
			}],
			postOptions: { max_tokens: 8192 },
			location: ChatLocation.Panel,
			...overrides,
		};
	}

	beforeEach(() => {
		disposables = new DisposableStore();
		const services = disposables.add(createPlatformServices(disposables));
		services.define(IToolDeferralService, {
			_serviceBrand: undefined,
			isNonDeferredTool: () => true,
		});
		const accessor = services.createTestingAccessor();
		instantiationService = accessor.get(IInstantiationService);
		mockConfig = accessor.get(IConfigurationService) as InMemoryConfigurationService;
	});

	test('includes effort in output_config when model supports reasoning effort and thinking is adaptive', () => {
		const endpoint = createMockEndpoint({
			supportsAdaptiveThinking: true,
			supportsReasoningEffort: ['low', 'medium', 'high'],
		});
		const options = createMinimalOptions({
			modelCapabilities: { enableThinking: true, reasoningEffort: 'high' },
		});

		const body = instantiationService.invokeFunction(createMessagesRequestBody, options, endpoint.model, endpoint);

		expect(body.thinking).toEqual({ type: 'adaptive', display: 'summarized' });
		expect(body.output_config).toEqual({ effort: 'high' });
	});

	test('omits effort when model does not declare supportsReasoningEffort', () => {
		const endpoint = createMockEndpoint({
			supportsAdaptiveThinking: true,
			// supportsReasoningEffort is undefined
		});
		const options = createMinimalOptions({
			modelCapabilities: { enableThinking: true, reasoningEffort: 'high' },
		});

		const body = instantiationService.invokeFunction(createMessagesRequestBody, options, endpoint.model, endpoint);

		expect(body.thinking).toEqual({ type: 'adaptive', display: 'summarized' });
		expect(body.output_config).toBeUndefined();
	});

	test('omits effort when supportsReasoningEffort is an empty array', () => {
		const endpoint = createMockEndpoint({
			supportsAdaptiveThinking: true,
			supportsReasoningEffort: [],
		});
		const options = createMinimalOptions({
			modelCapabilities: { enableThinking: true, reasoningEffort: 'medium' },
		});

		const body = instantiationService.invokeFunction(createMessagesRequestBody, options, endpoint.model, endpoint);

		expect(body.thinking).toEqual({ type: 'adaptive', display: 'summarized' });
		expect(body.output_config).toBeUndefined();
	});

	test('omits effort when thinking is not enabled', () => {
		const endpoint = createMockEndpoint({
			supportsAdaptiveThinking: true,
			supportsReasoningEffort: ['low', 'medium', 'high'],
		});
		const options = createMinimalOptions({
			modelCapabilities: { enableThinking: false, reasoningEffort: 'high' },
		});

		const body = instantiationService.invokeFunction(createMessagesRequestBody, options, endpoint.model, endpoint);

		expect(body.thinking).toBeUndefined();
		expect(body.output_config).toBeUndefined();
	});

	test('omits effort when reasoningEffort is an invalid value', () => {
		const endpoint = createMockEndpoint({
			supportsAdaptiveThinking: true,
			supportsReasoningEffort: ['low', 'medium', 'high'],
		});
		const options = createMinimalOptions({
			modelCapabilities: { enableThinking: true, reasoningEffort: 'xhigh' as any },
		});

		const body = instantiationService.invokeFunction(createMessagesRequestBody, options, endpoint.model, endpoint);

		expect(body.thinking).toEqual({ type: 'adaptive', display: 'summarized' });
		expect(body.output_config).toBeUndefined();
	});

	test('uses budget_tokens thinking when model has maxThinkingBudget but not adaptive', () => {
		const endpoint = createMockEndpoint({
			supportsAdaptiveThinking: false,
			maxThinkingBudget: 32000,
			minThinkingBudget: 1024,
			supportsReasoningEffort: ['low', 'medium', 'high'],
		});
		mockConfig.setConfig(ConfigKey.AnthropicThinkingBudget, 10000);
		const options = createMinimalOptions({
			modelCapabilities: { enableThinking: true, reasoningEffort: 'low' },
		});

		const body = instantiationService.invokeFunction(createMessagesRequestBody, options, endpoint.model, endpoint);

		expect(body.thinking).toEqual({ type: 'enabled', budget_tokens: 8191 });
		expect(body.output_config).toEqual({ effort: 'low' });
	});
});

describe('createMessagesRequestBody tool search deferral', () => {
	let disposables: DisposableStore;
	let instantiationService: IInstantiationService;

	function createMockEndpoint(supportsToolSearch: boolean): IChatEndpoint {
		return {
			model: 'claude-sonnet-4.6',
			family: 'claude-sonnet-4.6',
			modelProvider: 'Anthropic',
			maxOutputTokens: 8192,
			modelMaxPromptTokens: 200000,
			supportsToolCalls: true,
			supportsVision: true,
			supportsPrediction: false,
			supportsToolSearch,
			showInModelPicker: true,
			isFallback: false,
			name: 'test',
			version: '1.0',
			policy: 'enabled',
			urlOrRequestMetadata: 'https://test.com',
			tokenizer: 0,
			isDefault: false,
			processResponseFromChatEndpoint: () => { throw new Error('not implemented'); },
			acceptChatPolicy: () => { throw new Error('not implemented'); },
			makeChatRequest2: () => { throw new Error('not implemented'); },
			createRequestBody: () => { throw new Error('not implemented'); },
			cloneWithTokenOverride: () => { throw new Error('not implemented'); },
			interceptBody: () => { },
			getExtraHeaders: () => ({}),
		} as unknown as IChatEndpoint;
	}

	function makeTool(name: string) {
		return { type: 'function' as const, function: { name, description: `${name} tool`, parameters: { type: 'object', properties: {} } } };
	}

	function createOptions(tools: ReturnType<typeof makeTool>[]): ICreateEndpointBodyOptions {
		return {
			debugName: 'test',
			requestId: 'test-request-id',
			finishedCb: undefined,
			messages: [{
				role: Raw.ChatRole.User,
				content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'Hello' }],
			}],
			postOptions: { max_tokens: 8192 },
			location: ChatLocation.Agent,
			modelCapabilities: { enableToolSearch: true },
			requestOptions: { tools },
		} as ICreateEndpointBodyOptions;
	}

	beforeEach(() => {
		disposables = new DisposableStore();
		const services = disposables.add(createPlatformServices(disposables));
		// Non-deferred allowlist matches production: core tools + tool_search itself.
		const nonDeferred = new Set(['read_file', 'grep_search', CUSTOM_TOOL_SEARCH_NAME]);
		services.define(IToolDeferralService, {
			_serviceBrand: undefined,
			isNonDeferredTool: (name: string) => nonDeferred.has(name),
		});
		const accessor = services.createTestingAccessor();
		instantiationService = accessor.get(IInstantiationService);
	});

	test('does not set defer_loading when tool_search is not in the request tool list', () => {
		// Repro for https://github.com/microsoft/vscode/issues/311946: a custom agent
		// with `tools: ['my-mcp-server/*']` filters out tool_search. Without this gate,
		// every MCP tool gets defer_loading=true and Anthropic rejects the request with
		// "At least one tool must have defer_loading=false."
		const endpoint = createMockEndpoint(true);
		const options = createOptions([makeTool('some_mcp_tool'), makeTool('another_mcp_tool')]);

		const body = instantiationService.invokeFunction(createMessagesRequestBody, options, endpoint.model, endpoint);

		const tools = body.tools as AnthropicMessagesTool[];
		expect(tools.every(t => !t.defer_loading)).toBe(true);
		expect(tools.find(t => t.name === 'some_mcp_tool')).toBeDefined();
		expect(tools.find(t => t.name === 'another_mcp_tool')).toBeDefined();
	});

	test('defers MCP tools when tool_search is in the request tool list', () => {
		const endpoint = createMockEndpoint(true);
		const options = createOptions([
			makeTool('read_file'),
			makeTool('some_mcp_tool'),
			makeTool(CUSTOM_TOOL_SEARCH_NAME),
		]);

		const body = instantiationService.invokeFunction(createMessagesRequestBody, options, endpoint.model, endpoint);

		const tools = body.tools as AnthropicMessagesTool[];
		expect(tools.find(t => t.name === 'read_file')?.defer_loading).toBeUndefined();
		expect(tools.find(t => t.name === CUSTOM_TOOL_SEARCH_NAME)?.defer_loading).toBeUndefined();
		expect(tools.find(t => t.name === 'some_mcp_tool')?.defer_loading).toBe(true);
	});

	test('does not defer when endpoint does not support tool search', () => {
		const endpoint = createMockEndpoint(false);
		const options = createOptions([makeTool('read_file'), makeTool('some_mcp_tool'), makeTool(CUSTOM_TOOL_SEARCH_NAME)]);

		const body = instantiationService.invokeFunction(createMessagesRequestBody, options, endpoint.model, endpoint);

		const tools = body.tools as AnthropicMessagesTool[];
		expect(tools.every(t => !t.defer_loading)).toBe(true);
	});
});
