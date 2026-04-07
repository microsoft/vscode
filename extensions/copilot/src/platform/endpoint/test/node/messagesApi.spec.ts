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
import { addToolsAndSystemCacheControl, buildToolInputSchema, createMessagesRequestBody, rawMessagesToMessagesAPI } from '../../node/messagesApi';

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
			enableThinking: true,
			reasoningEffort: 'high',
		});

		const body = instantiationService.invokeFunction(createMessagesRequestBody, options, endpoint.model, endpoint);

		expect(body.thinking).toEqual({ type: 'adaptive' });
		expect(body.output_config).toEqual({ effort: 'high' });
	});

	test('omits effort when model does not declare supportsReasoningEffort', () => {
		const endpoint = createMockEndpoint({
			supportsAdaptiveThinking: true,
			// supportsReasoningEffort is undefined
		});
		const options = createMinimalOptions({
			enableThinking: true,
			reasoningEffort: 'high',
		});

		const body = instantiationService.invokeFunction(createMessagesRequestBody, options, endpoint.model, endpoint);

		expect(body.thinking).toEqual({ type: 'adaptive' });
		expect(body.output_config).toBeUndefined();
	});

	test('omits effort when supportsReasoningEffort is an empty array', () => {
		const endpoint = createMockEndpoint({
			supportsAdaptiveThinking: true,
			supportsReasoningEffort: [],
		});
		const options = createMinimalOptions({
			enableThinking: true,
			reasoningEffort: 'medium',
		});

		const body = instantiationService.invokeFunction(createMessagesRequestBody, options, endpoint.model, endpoint);

		expect(body.thinking).toEqual({ type: 'adaptive' });
		expect(body.output_config).toBeUndefined();
	});

	test('omits effort when thinking is not enabled', () => {
		const endpoint = createMockEndpoint({
			supportsAdaptiveThinking: true,
			supportsReasoningEffort: ['low', 'medium', 'high'],
		});
		const options = createMinimalOptions({
			enableThinking: false,
			reasoningEffort: 'high',
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
			enableThinking: true,
			reasoningEffort: 'xhigh' as any,
		});

		const body = instantiationService.invokeFunction(createMessagesRequestBody, options, endpoint.model, endpoint);

		expect(body.thinking).toEqual({ type: 'adaptive' });
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
			enableThinking: true,
			reasoningEffort: 'low',
		});

		const body = instantiationService.invokeFunction(createMessagesRequestBody, options, endpoint.model, endpoint);

		expect(body.thinking).toEqual({ type: 'enabled', budget_tokens: 8191 });
		expect(body.output_config).toEqual({ effort: 'low' });
	});
});
