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
import { AnthropicMessagesTool, CUSTOM_TOOL_SEARCH_NAME, isExtendedCacheTtlEnabled, isExtendedCacheTtlMessagesEnabled, modelSupportsExtendedCacheTtl, modelSupportsMemory } from '../../../networking/common/anthropic';
import { IChatEndpoint, ICreateEndpointBodyOptions } from '../../../networking/common/networking';
import { FinishedCallback, IResponseDelta } from '../../../networking/common/fetch';
import { IToolDeferralService } from '../../../networking/common/toolDeferralService';
import { createPlatformServices } from '../../../test/node/services';
import { addMessagesApiCacheControl, addToolsAndSystemCacheControl, AnthropicMessagesProcessor, buildToolInputSchema, clearAllCacheControl, createMessagesRequestBody, processNonStreamingResponseFromMessagesEndpoint, processResponseFromMessagesEndpoint, rawMessagesToMessagesAPI } from '../../node/messagesApi';
import { HeadersImpl, Response } from '../../../networking/common/fetcherService';
import { TelemetryData } from '../../../telemetry/common/telemetryData';
import { TestLogService } from '../../../testing/common/testLogService';
import { NullTelemetryService } from '../../../telemetry/common/nullTelemetryService';
import { ConfigKey, IConfigurationService } from '../../../configuration/common/configurationService';
import { IExperimentationService } from '../../../telemetry/common/nullExperimentationService';
import { InMemoryConfigurationService } from '../../../configuration/test/common/inMemoryConfigurationService';

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

	suite('thinking blocks', function () {
		function assistantWithThinking(thinking: { id: string; text?: string | string[]; encrypted?: string; redacted?: boolean }): Raw.ChatMessage[] {
			return [
				{
					role: Raw.ChatRole.Assistant,
					content: [
						{ type: Raw.ChatCompletionContentPartKind.Opaque, value: { type: 'thinking', thinking } },
						{ type: Raw.ChatCompletionContentPartKind.Text, text: 'answer' },
					],
				},
			];
		}

		test('regular thinking block with text + signature emits a thinking block', function () {
			const result = rawMessagesToMessagesAPI(assistantWithThinking({ id: 't1', text: 'reasoning', encrypted: 'sig123' }));
			const content = assertContentArray(result.messages[0].content);
			expect(content[0]).toEqual({ type: 'thinking', thinking: 'reasoning', signature: 'sig123' });
		});

		test('empty-text block with a signature stays a thinking block (never redacted_thinking)', function () {
			// Regression: `display: "omitted"` or budget-pruned thinking has an empty `thinking`
			// field but a valid signature. Previously this was misclassified as a redacted_thinking
			// block and shipped the signature as `data`, which the Anthropic API rejects with
			// "Invalid 'data' in 'redacted_thinking' block".
			const result = rawMessagesToMessagesAPI(assistantWithThinking({ id: 't1', text: '', encrypted: 'sig123' }));
			const content = assertContentArray(result.messages[0].content);
			expect(content[0]).toEqual({ type: 'thinking', thinking: '', signature: 'sig123' });
			expect(content.some(b => b.type === 'redacted_thinking')).toBe(false);
		});

		test('genuine redacted block (redacted=true) emits a redacted_thinking block with data', function () {
			const result = rawMessagesToMessagesAPI(assistantWithThinking({ id: 't1', text: '', encrypted: 'blob123', redacted: true }));
			const content = assertContentArray(result.messages[0].content);
			expect(content[0]).toEqual({ type: 'redacted_thinking', data: 'blob123' });
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

	test('applies extended 1h ttl to tools and system when cacheTtl is "1h"', function () {
		const tools = [makeTool('read_file'), makeTool('edit_file'), makeTool('deferred_a', true)];
		const system: TextBlockParam[] = [makeSystemBlock('System A'), makeSystemBlock('System B')];
		const messagesResult = { messages: makeMessages(), system };

		addToolsAndSystemCacheControl(tools, messagesResult, '1h');

		expect(tools[0].cache_control).toBeUndefined();
		expect(tools[1].cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });
		expect(tools[2].cache_control).toBeUndefined();
		expect(system[0].cache_control).toBeUndefined();
		expect(system[1].cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });
	});

	test('omits ttl when cacheTtl is undefined (default 5m)', function () {
		const tools = [makeTool('read_file')];
		const system: TextBlockParam[] = [makeSystemBlock('System')];
		const messagesResult = { messages: makeMessages(), system };

		addToolsAndSystemCacheControl(tools, messagesResult, undefined);

		expect(tools[0].cache_control).toEqual({ type: 'ephemeral' });
		expect(system[0].cache_control).toEqual({ type: 'ephemeral' });
	});
});

suite('modelSupportsExtendedCacheTtl', function () {

	test('matches Fable 5, Opus 4.5/4.6/4.7/4.8, Sonnet 4.5/4.6, and Haiku 4.5 variants and rejects everything else', function () {
		expect({
			'claude-fable-5': modelSupportsExtendedCacheTtl('claude-fable-5'),
			'claude-opus-4.8': modelSupportsExtendedCacheTtl('claude-opus-4.8'),
			'claude-opus-4-8': modelSupportsExtendedCacheTtl('claude-opus-4-8'),
			'claude-opus-4-8-1m': modelSupportsExtendedCacheTtl('claude-opus-4-8-1m'),
			'claude-opus-4.6-1m': modelSupportsExtendedCacheTtl('claude-opus-4.6-1m'),
			'claude-opus-4-6-1m': modelSupportsExtendedCacheTtl('claude-opus-4-6-1m'),
			'claude-opus-4.7-1m-internal': modelSupportsExtendedCacheTtl('claude-opus-4.7-1m-internal'),
			'claude-opus-4-7-1m-internal': modelSupportsExtendedCacheTtl('claude-opus-4-7-1m-internal'),
			'CLAUDE-OPUS-4.6-1M': modelSupportsExtendedCacheTtl('CLAUDE-OPUS-4.6-1M'),
			'claude-opus-4.6': modelSupportsExtendedCacheTtl('claude-opus-4.6'),
			'claude-opus-4.7': modelSupportsExtendedCacheTtl('claude-opus-4.7'),
			'claude-opus-4.5': modelSupportsExtendedCacheTtl('claude-opus-4.5'),
			'claude-sonnet-4.6': modelSupportsExtendedCacheTtl('claude-sonnet-4.6'),
			'claude-sonnet-4.5': modelSupportsExtendedCacheTtl('claude-sonnet-4.5'),
			'claude-opus-4-1': modelSupportsExtendedCacheTtl('claude-opus-4-1'),
			'claude-sonnet-4': modelSupportsExtendedCacheTtl('claude-sonnet-4'),
			'claude-haiku-4-5': modelSupportsExtendedCacheTtl('claude-haiku-4-5'),
			'gpt-5': modelSupportsExtendedCacheTtl('gpt-5'),
		}).toEqual({
			'claude-fable-5': true,
			'claude-opus-4.8': true,
			'claude-opus-4-8': true,
			'claude-opus-4-8-1m': true,
			'claude-opus-4.6-1m': true,
			'claude-opus-4-6-1m': true,
			'claude-opus-4.7-1m-internal': true,
			'claude-opus-4-7-1m-internal': true,
			'CLAUDE-OPUS-4.6-1M': true,
			'claude-opus-4.6': true,
			'claude-opus-4.7': true,
			'claude-opus-4.5': true,
			'claude-sonnet-4.6': true,
			'claude-sonnet-4.5': true,
			'claude-opus-4-1': false,
			'claude-sonnet-4': false,
			'claude-haiku-4-5': true,
			'gpt-5': false,
		});
	});

	test('matches via endpoint.family when the model id is unknown', function () {
		const fake = (family: string, model: string): IChatEndpoint => ({ family, model } as unknown as IChatEndpoint);
		expect({
			'preview-id + family=claude-opus-4.7': modelSupportsExtendedCacheTtl(fake('claude-opus-4.7', 'preview-opus-internal')),
			'preview-id + family=claude-sonnet-4.5': modelSupportsExtendedCacheTtl(fake('claude-sonnet-4.5', 'preview-sonnet-internal')),
			'preview-id + family=claude-opus-4 (unsupported)': modelSupportsExtendedCacheTtl(fake('claude-opus-4', 'preview-opus-old')),
			'preview-id + family=mystery': modelSupportsExtendedCacheTtl(fake('mystery-family', 'preview-anything')),
		}).toEqual({
			'preview-id + family=claude-opus-4.7': true,
			'preview-id + family=claude-sonnet-4.5': true,
			'preview-id + family=claude-opus-4 (unsupported)': false,
			'preview-id + family=mystery': false,
		});
	});
});

suite('modelSupportsMemory', function () {
	test('matches Claude id strings', function () {
		expect({
			'claude-fable-5': modelSupportsMemory('claude-fable-5'),
			'claude-opus-4.7': modelSupportsMemory('claude-opus-4.7'),
			'claude-opus-4.8': modelSupportsMemory('claude-opus-4.8'),
			'claude-opus-4-8': modelSupportsMemory('claude-opus-4-8'),
			'claude-haiku-4-5': modelSupportsMemory('claude-haiku-4-5'),
			'claude-opus-4-1': modelSupportsMemory('claude-opus-4-1'),
			'gpt-5': modelSupportsMemory('gpt-5'),
		}).toEqual({
			'claude-fable-5': true,
			'claude-opus-4.7': true,
			'claude-opus-4.8': true,
			'claude-opus-4-8': true,
			'claude-haiku-4-5': true,
			'claude-opus-4-1': true,
			'gpt-5': false,
		});
	});

	test('matches via endpoint.family when the model id is unknown', function () {
		const fake = (family: string, model: string): IChatEndpoint => ({ family, model } as unknown as IChatEndpoint);
		expect({
			'preview-id + family=claude-opus-4.6': modelSupportsMemory(fake('claude-opus-4.6', 'preview-opus-internal')),
			'preview-id + family=claude-haiku-4-5': modelSupportsMemory(fake('claude-haiku-4-5', 'preview-haiku-internal')),
			'preview-id + family=mystery': modelSupportsMemory(fake('mystery-family', 'preview-anything')),
		}).toEqual({
			'preview-id + family=claude-opus-4.6': true,
			'preview-id + family=claude-haiku-4-5': true,
			'preview-id + family=mystery': false,
		});
	});
});

suite('isExtendedCacheTtlEnabled', function () {

	const ELIGIBLE_MODEL = 'claude-opus-4-7-1m';

	let disposables: DisposableStore;
	let configurationService: InMemoryConfigurationService;
	let experimentationService: IExperimentationService;

	beforeEach(() => {
		disposables = new DisposableStore();
		const services = disposables.add(createPlatformServices(disposables));
		const accessor = services.createTestingAccessor();
		// All callers of `isExtendedCacheTtlEnabled` resolve `IConfigurationService` through DI to
		// an `InMemoryConfigurationService` instance (see `createPlatformServices`). Re-narrowing it
		// here lets the tests use `setConfig` to flip the experiment-based gate without going
		// through experimentation infrastructure.
		configurationService = accessor.get(IConfigurationService) as InMemoryConfigurationService;
		experimentationService = accessor.get(IExperimentationService);
	});

	function enableConfig(): void {
		configurationService.setConfig(ConfigKey.Advanced.AnthropicExtendedCacheTtl, true);
	}

	test('returns false when the config is disabled, even for eligible models', function () {
		expect(isExtendedCacheTtlEnabled(ELIGIBLE_MODEL, configurationService, experimentationService, ChatLocation.Agent, false)).toBe(false);
	});

	test('composes all four gates: returns true only when model + config + Agent location + non-subagent all align', function () {
		// Positive composition + negative on each axis. If a future refactor short-circuits
		// before reading any single gate (e.g. drops the config check), one of these flips.
		enableConfig();
		const probe = (model: string, location: ChatLocation | undefined, sub: boolean) =>
			isExtendedCacheTtlEnabled(model, configurationService, experimentationService, location, sub);

		expect({
			allPass: probe(ELIGIBLE_MODEL, ChatLocation.Agent, false),
			badModel: probe('gpt-5', ChatLocation.Agent, false),
			badLocation: probe(ELIGIBLE_MODEL, ChatLocation.Panel, false),
			subagent: probe(ELIGIBLE_MODEL, ChatLocation.Agent, true),
		}).toEqual({
			allPass: true,
			badModel: false,
			badLocation: false,
			subagent: false,
		});
	});

	test('returns false when location is undefined', function () {
		// The gate requires an explicit `ChatLocation.Agent`. Callers that route through
		// subclass overrides which drop the `location` argument (e.g. `super.getExtraHeaders()`
		// without arguments — see `OpenRouterEndpoint`, `AzureOpenAIEndpoint`, etc.) are
		// correctly excluded so the beta header is never sent for non-Agent paths.
		enableConfig();
		expect(isExtendedCacheTtlEnabled(ELIGIBLE_MODEL, configurationService, experimentationService, undefined, false)).toBe(false);
	});

	test('returns false when isSubagent is true', function () {
		enableConfig();
		expect(isExtendedCacheTtlEnabled(ELIGIBLE_MODEL, configurationService, experimentationService, ChatLocation.Agent, true)).toBe(false);
	});

	test('delegates model gate to modelSupportsExtendedCacheTtl', function () {
		// Full model boundaries are covered by the `modelSupportsExtendedCacheTtl` suite.
		// Here we only verify the delegation is wired up.
		enableConfig();
		expect(isExtendedCacheTtlEnabled('gpt-5', configurationService, experimentationService, ChatLocation.Agent, false)).toBe(false);
	});

	test('returns false for non-Agent chat locations', function () {
		// Inline chat, terminal chat, notebook chat, and the Claude CLI proxy passthrough are all
		// out of scope for extended cache TTL — only the main agent conversation qualifies.
		enableConfig();
		expect({
			Panel: isExtendedCacheTtlEnabled(ELIGIBLE_MODEL, configurationService, experimentationService, ChatLocation.Panel, false),
			Editor: isExtendedCacheTtlEnabled(ELIGIBLE_MODEL, configurationService, experimentationService, ChatLocation.Editor, false),
			Terminal: isExtendedCacheTtlEnabled(ELIGIBLE_MODEL, configurationService, experimentationService, ChatLocation.Terminal, false),
			Notebook: isExtendedCacheTtlEnabled(ELIGIBLE_MODEL, configurationService, experimentationService, ChatLocation.Notebook, false),
			EditingSession: isExtendedCacheTtlEnabled(ELIGIBLE_MODEL, configurationService, experimentationService, ChatLocation.EditingSession, false),
			Other: isExtendedCacheTtlEnabled(ELIGIBLE_MODEL, configurationService, experimentationService, ChatLocation.Other, false),
			MessagesProxy: isExtendedCacheTtlEnabled(ELIGIBLE_MODEL, configurationService, experimentationService, ChatLocation.MessagesProxy, false),
			ResponsesProxy: isExtendedCacheTtlEnabled(ELIGIBLE_MODEL, configurationService, experimentationService, ChatLocation.ResponsesProxy, false),
		}).toEqual({
			Panel: false,
			Editor: false,
			Terminal: false,
			Notebook: false,
			EditingSession: false,
			Other: false,
			MessagesProxy: false,
			ResponsesProxy: false,
		});
	});
});

suite('isExtendedCacheTtlMessagesEnabled', function () {

	let disposables: DisposableStore;
	let configurationService: InMemoryConfigurationService;
	let experimentationService: IExperimentationService;

	beforeEach(() => {
		disposables = new DisposableStore();
		const services = disposables.add(createPlatformServices(disposables));
		const accessor = services.createTestingAccessor();
		configurationService = accessor.get(IConfigurationService) as InMemoryConfigurationService;
		experimentationService = accessor.get(IExperimentationService);
	});

	test('parent on/off x sub on/off matrix', function () {
		// [parentEnabled, sub, expected]
		const cases: ReadonlyArray<readonly [boolean, boolean, boolean]> = [
			[false, false, false],
			[true, false, false],
			[false, true, false],
			[true, true, true],
		];
		const actual = cases.map(([parent, sub]) => {
			configurationService.setConfig(ConfigKey.Advanced.AnthropicExtendedCacheTtlMessages, sub);
			return [parent, sub, isExtendedCacheTtlMessagesEnabled(parent, configurationService, experimentationService)] as const;
		});
		// Only "both on" produces true — sub is a strict sub-toggle of parent.
		// Model/location/subagent gates are inherited via the parent and covered in its suite.
		expect(actual).toEqual(cases);
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

suite('addMessagesApiCacheControl', function () {

	function ccPositions(args: { messages: MessageParam[]; system?: TextBlockParam[]; tools?: AnthropicMessagesTool[] }): string[] {
		const out: string[] = [];
		args.tools?.forEach((t, i) => { if (t.cache_control) { out.push(`tools[${i}]`); } });
		args.system?.forEach((b, i) => { if (b.cache_control) { out.push(`system[${i}]`); } });
		args.messages.forEach((m, i) => {
			if (Array.isArray(m.content)) {
				m.content.forEach((b, j) => {
					if (typeof b === 'object' && 'cache_control' in b && b.cache_control) {
						out.push(`messages[${i}].block[${j}]`);
					}
				});
			}
		});
		return out;
	}

	test('marks the last cacheable block of the two most recent cacheable messages', function () {
		const messages: MessageParam[] = [
			{ role: 'user', content: [{ type: 'text', text: 'do stuff' }] },
			{ role: 'assistant', content: [{ type: 'text', text: 'calling tools' }, { type: 'tool_use', id: 'a', name: 't', input: {} }, { type: 'tool_use', id: 'b', name: 't', input: {} }] },
			{ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'a', content: 'ra' }, { type: 'tool_result', tool_use_id: 'b', content: 'rb' }] },
		];
		addMessagesApiCacheControl({ messages });
		expect(ccPositions({ messages })).toEqual(['messages[1].block[2]', 'messages[2].block[1]']);
	});

	test('skips thinking-only blocks within recent messages', function () {
		const messages: MessageParam[] = [
			{ role: 'user', content: [{ type: 'text', text: 'hello' }] },
			{ role: 'assistant', content: [{ type: 'thinking', thinking: 'hmm', signature: 'sig' }, { type: 'text', text: 'response' }] },
		];
		addMessagesApiCacheControl({ messages });
		expect(ccPositions({ messages })).toEqual(['messages[0].block[0]', 'messages[1].block[1]']);
	});

	test('walks past trailing messages with no cacheable blocks', function () {
		const messages: MessageParam[] = [
			{ role: 'user', content: [{ type: 'text', text: 'hello' }] },
			{ role: 'assistant', content: [{ type: 'text', text: 'response' }] },
			{ role: 'assistant', content: [{ type: 'thinking', thinking: 'hmm', signature: 'sig' }] },
			{ role: 'user', content: [] },
		];
		addMessagesApiCacheControl({ messages });
		expect(ccPositions({ messages })).toEqual(['messages[0].block[0]', 'messages[1].block[0]']);
	});

	test('handles single message and empty array', function () {
		const single: MessageParam[] = [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }];
		addMessagesApiCacheControl({ messages: single });
		expect(ccPositions({ messages: single })).toEqual(['messages[0].block[0]']);

		const empty: MessageParam[] = [];
		addMessagesApiCacheControl({ messages: empty });
		expect(empty).toHaveLength(0);
	});

	test('combined with addToolsAndSystemCacheControl produces the 4-cc layout', function () {
		const tools: AnthropicMessagesTool[] = [
			{ name: 'read_file', description: '', input_schema: { type: 'object', properties: {}, required: [] } },
			{ name: 'edit_file', description: '', input_schema: { type: 'object', properties: {}, required: [] } },
		];
		const system: TextBlockParam[] = [{ type: 'text', text: 'You are helpful.' }];
		const messages: MessageParam[] = [
			{ role: 'user', content: [{ type: 'text', text: 'edit my file' }] },
			{ role: 'assistant', content: [{ type: 'tool_use', id: '1', name: 'read_file', input: {} }] },
			{ role: 'user', content: [{ type: 'tool_result', tool_use_id: '1', content: 'contents' }] },
		];
		addMessagesApiCacheControl({ messages, system });
		addToolsAndSystemCacheControl(tools, { messages, system });
		expect(ccPositions({ messages, system, tools })).toEqual([
			'tools[1]', 'system[0]', 'messages[1].block[0]', 'messages[2].block[0]',
		]);
	});

	test('cc anchors shift forward each iteration of an agent loop', function () {
		const query: ContentBlockParam = { type: 'text', text: 'do work' };
		const r1Use: ContentBlockParam = { type: 'tool_use', id: 'a', name: 't', input: {} };
		const r1Res: ContentBlockParam = { type: 'tool_result', tool_use_id: 'a', content: 'r1' };
		const r2Use: ContentBlockParam = { type: 'tool_use', id: 'b', name: 't', input: {} };
		const r2Res: ContentBlockParam = { type: 'tool_result', tool_use_id: 'b', content: 'r2' };

		const iterA: MessageParam[] = [
			{ role: 'user', content: [query] },
			{ role: 'assistant', content: [r1Use] },
			{ role: 'user', content: [r1Res] },
		];
		addMessagesApiCacheControl({ messages: iterA });
		expect(ccPositions({ messages: iterA })).toEqual(['messages[1].block[0]', 'messages[2].block[0]']);
		(r1Use as { cache_control?: unknown }).cache_control = undefined;
		(r1Res as ToolResultBlockParam).cache_control = undefined;

		const iterB: MessageParam[] = [
			{ role: 'user', content: [query] },
			{ role: 'assistant', content: [r1Use] },
			{ role: 'user', content: [r1Res] },
			{ role: 'assistant', content: [r2Use] },
			{ role: 'user', content: [r2Res] },
		];
		addMessagesApiCacheControl({ messages: iterB });
		expect(ccPositions({ messages: iterB })).toEqual(['messages[3].block[0]', 'messages[4].block[0]']);
	});

	test('propagates cacheTtl to the emitted cache_control blocks', function () {
		const makeMessages = (): MessageParam[] => [
			{ role: 'user', content: [{ type: 'text', text: 'hello' }] },
			{ role: 'assistant', content: [{ type: 'text', text: 'response' }] },
		];

		const collect = (messages: MessageParam[]): unknown[] => {
			const out: unknown[] = [];
			messages.forEach(m => Array.isArray(m.content) && m.content.forEach(b => {
				if (typeof b === 'object' && 'cache_control' in b && b.cache_control) {
					out.push(b.cache_control);
				}
			}));
			return out;
		};

		const withTtl = makeMessages();
		addMessagesApiCacheControl({ messages: withTtl }, '1h');

		const withoutTtl = makeMessages();
		addMessagesApiCacheControl({ messages: withoutTtl });

		expect({ withTtl: collect(withTtl), withoutTtl: collect(withoutTtl) }).toEqual({
			withTtl: [{ type: 'ephemeral', ttl: '1h' }, { type: 'ephemeral', ttl: '1h' }],
			withoutTtl: [{ type: 'ephemeral' }, { type: 'ephemeral' }],
		});
	});
});

suite('clearAllCacheControl', function () {

	function ccPositions(args: { messages: MessageParam[]; system?: TextBlockParam[] }): string[] {
		const out: string[] = [];
		args.system?.forEach((b, i) => { if (b.cache_control) { out.push(`system[${i}]`); } });
		args.messages.forEach((m, i) => {
			if (Array.isArray(m.content)) {
				m.content.forEach((b, j) => {
					if (typeof b === 'object' && 'cache_control' in b && b.cache_control) {
						out.push(`messages[${i}].block[${j}]`);
					}
				});
			}
		});
		return out;
	}

	test('strips cache_control from messages and system blocks', function () {
		const messages: MessageParam[] = [
			{ role: 'user', content: [{ type: 'text', text: 'a', cache_control: { type: 'ephemeral' } }] },
			{ role: 'assistant', content: [{ type: 'text', text: 'b', cache_control: { type: 'ephemeral' } }] },
		];
		const system: TextBlockParam[] = [{ type: 'text', text: 's', cache_control: { type: 'ephemeral' } }];

		clearAllCacheControl({ messages, system });

		expect(ccPositions({ messages, system })).toEqual([]);
	});

	test('caps total cc count at 4 even when upstream loaded markers', function () {
		// Repro: a prompt-tsx prompt (e.g. inlineChatPrompt) emits multiple
		// <cacheBreakpoint> parts that rawContentToAnthropicContent translates
		// into cache_control fields. Without clearAllCacheControl we'd add
		// our own on top → exceed Anthropic's 4-cc limit → 400.
		const tools: AnthropicMessagesTool[] = [
			{ name: 't', description: '', input_schema: { type: 'object', properties: {}, required: [] } },
		];
		const system: TextBlockParam[] = [{ type: 'text', text: 's', cache_control: { type: 'ephemeral' } }];
		const messages: MessageParam[] = [
			{ role: 'user', content: [{ type: 'text', text: 'a', cache_control: { type: 'ephemeral' } }] },
			{ role: 'assistant', content: [{ type: 'text', text: 'b', cache_control: { type: 'ephemeral' } }] },
			{ role: 'user', content: [{ type: 'text', text: 'c', cache_control: { type: 'ephemeral' } }] },
		];

		clearAllCacheControl({ messages, system });
		addMessagesApiCacheControl({ messages, system });
		addToolsAndSystemCacheControl(tools, { messages, system });

		// Exactly 4 ccs, all in the deterministic positions we own.
		expect([
			...tools.flatMap((t, i) => t.cache_control ? [`tools[${i}]`] : []),
			...ccPositions({ messages, system }),
		]).toEqual([
			'tools[0]', 'system[0]', 'messages[1].block[0]', 'messages[2].block[0]',
		]);
	});

	test('is a no-op when no cache_control is present', function () {
		const messages: MessageParam[] = [
			{ role: 'user', content: [{ type: 'text', text: 'a' }] },
		];
		const system: TextBlockParam[] = [{ type: 'text', text: 's' }];

		clearAllCacheControl({ messages, system });

		expect(ccPositions({ messages, system })).toEqual([]);
	});
});

describe('createMessagesRequestBody reasoning effort', () => {
	let disposables: DisposableStore;
	let instantiationService: IInstantiationService;

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

	test('falls back to the requested effort when adaptive model declares no supportsReasoningEffort', () => {
		// Every adaptive-thinking Claude model accepts output_config.effort even
		// when the endpoint metadata doesn't declare it — a user-selected effort
		// must not be silently dropped (#cacheExplorer effort visibility).
		const endpoint = createMockEndpoint({
			supportsAdaptiveThinking: true,
			// supportsReasoningEffort is undefined
		});
		const options = createMinimalOptions({
			modelCapabilities: { enableThinking: true, reasoningEffort: 'high' },
		});

		const body = instantiationService.invokeFunction(createMessagesRequestBody, options, endpoint.model, endpoint);

		expect(body.thinking).toEqual({ type: 'adaptive', display: 'summarized' });
		expect(body.output_config).toEqual({ effort: 'high' });
	});

	test('defaults to high effort (the provider default) when adaptive model declares no supportsReasoningEffort and none is requested', () => {
		const endpoint = createMockEndpoint({
			supportsAdaptiveThinking: true,
			// supportsReasoningEffort is absent — the capability is not declared
		});
		const options = createMinimalOptions({
			modelCapabilities: { enableThinking: true },
		});

		const body = instantiationService.invokeFunction(createMessagesRequestBody, options, endpoint.model, endpoint);

		expect(body.thinking).toEqual({ type: 'adaptive', display: 'summarized' });
		expect(body.output_config).toEqual({ effort: 'high' });
	});

	test('omits effort when supportsReasoningEffort is explicitly empty', () => {
		// An empty list is a declaration that the model supports no effort
		// levels — distinct from the capability being absent, which falls
		// back to the adaptive default.
		const endpoint = createMockEndpoint({
			supportsAdaptiveThinking: true,
			supportsReasoningEffort: [],
		});
		const options = createMinimalOptions({
			modelCapabilities: { enableThinking: true, reasoningEffort: 'high' },
		});

		const body = instantiationService.invokeFunction(createMessagesRequestBody, options, endpoint.model, endpoint);

		expect(body.thinking).toEqual({ type: 'adaptive', display: 'summarized' });
		expect(body.output_config).toBeUndefined();
	});

	test('omits effort when model is not adaptive and declares no supportsReasoningEffort', () => {
		const endpoint = createMockEndpoint({
			supportsAdaptiveThinking: false,
			maxThinkingBudget: 32000,
			minThinkingBudget: 1024,
			// supportsReasoningEffort is undefined
		});
		const options = createMinimalOptions({
			modelCapabilities: { enableThinking: true, reasoningEffort: 'medium' },
		});

		const body = instantiationService.invokeFunction(createMessagesRequestBody, options, endpoint.model, endpoint);

		expect(body.thinking).toEqual({ type: 'enabled', budget_tokens: 8191 });
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

	test('sends xhigh when the endpoint declares it (Opus 4.8 metadata)', () => {
		// Opus 4.7+ metadata declares xhigh/max and the Opus 4.8 picker
		// defaults to xhigh — a hardcoded low|medium|high validator used to
		// silently drop it, so no effort reached the wire at all.
		const endpoint = createMockEndpoint({
			supportsAdaptiveThinking: true,
			supportsReasoningEffort: ['low', 'medium', 'high', 'xhigh', 'max'],
		});
		const options = createMinimalOptions({
			modelCapabilities: { enableThinking: true, reasoningEffort: 'xhigh' },
		});

		const body = instantiationService.invokeFunction(createMessagesRequestBody, options, endpoint.model, endpoint);

		expect(body.thinking).toEqual({ type: 'adaptive', display: 'summarized' });
		expect(body.output_config).toEqual({ effort: 'xhigh' });
	});

	test('accepts any level the endpoint declares, including unknown future ones', () => {
		// Validation is purely metadata-driven — a new level (as xhigh/max
		// once were) must work without a client change.
		const endpoint = createMockEndpoint({
			supportsAdaptiveThinking: true,
			supportsReasoningEffort: ['low', 'ultra'],
		});
		const options = createMinimalOptions({
			modelCapabilities: { enableThinking: true, reasoningEffort: 'ultra' },
		});

		const body = instantiationService.invokeFunction(createMessagesRequestBody, options, endpoint.model, endpoint);

		expect(body.output_config).toEqual({ effort: 'ultra' });
	});

	test('defaults to a declared level when the list does not include medium', () => {
		const endpoint = createMockEndpoint({
			supportsAdaptiveThinking: true,
			supportsReasoningEffort: ['high', 'max'],
		});
		const options = createMinimalOptions({
			modelCapabilities: { enableThinking: true },
		});

		const body = instantiationService.invokeFunction(createMessagesRequestBody, options, endpoint.model, endpoint);

		// Middle of the declared list — never a level the endpoint rejects.
		expect(body.output_config).toEqual({ effort: 'high' });
	});

	test('omits effort when the requested level is not declared by the endpoint', () => {
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

function createNonStreamingHeaders(contentType = 'application/json'): HeadersImpl {
	return HeadersImpl.fromMap(new Map([
		['content-type', contentType],
		['x-request-id', 'test-req-id'],
		['x-github-request-id', 'gh-req-id'],
	]));
}

function createNonStreamingResponse(body: object, contentType = 'application/json'): Response {
	return Response.fromText(200, 'OK', createNonStreamingHeaders(contentType), JSON.stringify(body), 'node-fetch');
}

suite('processNonStreamingResponseFromMessagesEndpoint', () => {
	test('parses text content from non-streaming response', async () => {
		const response = createNonStreamingResponse({
			id: 'msg_123',
			type: 'message',
			role: 'assistant',
			content: [{ type: 'text', text: 'Hello world' }],
			model: 'claude-sonnet-4-20250514',
			stop_reason: 'end_turn',
			usage: { input_tokens: 100, output_tokens: 20 },
		});

		const telemetryData = TelemetryData.createAndMarkAsIssued();
		const completions = await processNonStreamingResponseFromMessagesEndpoint(
			new NullTelemetryService(),
			new TestLogService(),
			response,
			async () => undefined,
			telemetryData,
		);

		const results = [];
		for await (const c of completions) {
			results.push(c);
		}

		expect(results).toHaveLength(1);
		expect(results[0].model).toBe('claude-sonnet-4-20250514');
		expect(results[0].message.content).toHaveLength(1);
		expect(results[0].message.content[0]).toEqual({ type: Raw.ChatCompletionContentPartKind.Text, text: 'Hello world' });
		expect(results[0].usage?.prompt_tokens).toBe(100);
		expect(results[0].usage?.completion_tokens).toBe(20);
	});

	test('parses tool_use content from non-streaming response', async () => {
		const response = createNonStreamingResponse({
			id: 'msg_456',
			type: 'message',
			role: 'assistant',
			content: [
				{ type: 'text', text: 'Let me read that file.' },
				{ type: 'tool_use', id: 'tc_1', name: 'read_file', input: { path: 'foo.ts' } },
			],
			model: 'claude-sonnet-4-20250514',
			stop_reason: 'tool_use',
			usage: { input_tokens: 50, output_tokens: 30 },
		});

		const telemetryData = TelemetryData.createAndMarkAsIssued();
		const completions = await processNonStreamingResponseFromMessagesEndpoint(
			new NullTelemetryService(),
			new TestLogService(),
			response,
			async () => undefined,
			telemetryData,
		);

		const results = [];
		for await (const c of completions) {
			results.push(c);
		}

		expect(results).toHaveLength(1);
		const msg = results[0].message as Raw.AssistantChatMessage;
		expect(msg.toolCalls).toHaveLength(1);
		expect(msg.toolCalls![0].function.name).toBe('read_file');
		expect(msg.toolCalls![0].function.arguments).toBe('{"path":"foo.ts"}');
		expect(msg.toolCalls![0].id).toBe('tc_1');
	});

	test('handles error responses gracefully', async () => {
		const response = createNonStreamingResponse({
			type: 'error',
			error: { type: 'invalid_request_error', message: 'Bad request' },
		});

		const telemetryData = TelemetryData.createAndMarkAsIssued();
		const completions = await processNonStreamingResponseFromMessagesEndpoint(
			new NullTelemetryService(),
			new TestLogService(),
			response,
			async () => undefined,
			telemetryData,
		);

		await expect(async () => {
			for await (const _c of completions) { /* consume */ }
		}).rejects.toThrow('Anthropic API error: Bad request');
	});

	test('maps stop_reason to correct finish reason', async () => {
		const response = createNonStreamingResponse({
			id: 'msg_789',
			type: 'message',
			role: 'assistant',
			content: [{ type: 'text', text: 'truncated' }],
			model: 'claude-sonnet-4-20250514',
			stop_reason: 'max_tokens',
			usage: { input_tokens: 100, output_tokens: 4096 },
		});

		const telemetryData = TelemetryData.createAndMarkAsIssued();
		const completions = await processNonStreamingResponseFromMessagesEndpoint(
			new NullTelemetryService(),
			new TestLogService(),
			response,
			async () => undefined,
			telemetryData,
		);

		const results = [];
		for await (const c of completions) {
			results.push(c);
		}

		expect(results[0].finishReason).toBe('length');
	});

	test('includes cache token details in usage', async () => {
		const response = createNonStreamingResponse({
			id: 'msg_cache',
			type: 'message',
			role: 'assistant',
			content: [{ type: 'text', text: 'cached' }],
			model: 'claude-sonnet-4-20250514',
			stop_reason: 'end_turn',
			usage: {
				input_tokens: 50,
				output_tokens: 10,
				cache_creation_input_tokens: 20,
				cache_read_input_tokens: 30,
			},
		});

		const telemetryData = TelemetryData.createAndMarkAsIssued();
		const completions = await processNonStreamingResponseFromMessagesEndpoint(
			new NullTelemetryService(),
			new TestLogService(),
			response,
			async () => undefined,
			telemetryData,
		);

		const results = [];
		for await (const c of completions) {
			results.push(c);
		}

		// prompt_tokens = input_tokens + cache_creation + cache_read = 50 + 20 + 30 = 100
		expect(results[0].usage?.prompt_tokens).toBe(100);
		expect(results[0].usage?.prompt_tokens_details?.cached_tokens).toBe(30);
	});

	test('surfaces 1h/5m cache_creation split when present', async () => {
		const response = createNonStreamingResponse({
			id: 'msg_cache_ttl',
			type: 'message',
			role: 'assistant',
			content: [{ type: 'text', text: 'cached' }],
			model: 'claude-sonnet-4-20250514',
			stop_reason: 'end_turn',
			usage: {
				input_tokens: 50,
				output_tokens: 10,
				cache_creation_input_tokens: 25,
				cache_read_input_tokens: 0,
				cache_creation: {
					ephemeral_1h_input_tokens: 17,
					ephemeral_5m_input_tokens: 8,
				},
			},
		});

		const telemetryData = TelemetryData.createAndMarkAsIssued();
		const completions = await processNonStreamingResponseFromMessagesEndpoint(
			new NullTelemetryService(),
			new TestLogService(),
			response,
			async () => undefined,
			telemetryData,
		);

		const results = [];
		for await (const c of completions) {
			results.push(c);
		}

		const details = results[0].usage?.prompt_tokens_details;
		expect(details?.cache_creation_input_tokens).toBe(25);
		expect(details?.anthropic_cache_creation?.ephemeral_1h_input_tokens).toBe(17);
		expect(details?.anthropic_cache_creation?.ephemeral_5m_input_tokens).toBe(8);
	});

	test('omits 1h/5m split fields when Anthropic does not report them', async () => {
		const response = createNonStreamingResponse({
			id: 'msg_cache_no_split',
			type: 'message',
			role: 'assistant',
			content: [{ type: 'text', text: 'cached' }],
			model: 'claude-sonnet-4-20250514',
			stop_reason: 'end_turn',
			usage: {
				input_tokens: 50,
				output_tokens: 10,
				cache_creation_input_tokens: 20,
				cache_read_input_tokens: 30,
			},
		});

		const telemetryData = TelemetryData.createAndMarkAsIssued();
		const completions = await processNonStreamingResponseFromMessagesEndpoint(
			new NullTelemetryService(),
			new TestLogService(),
			response,
			async () => undefined,
			telemetryData,
		);

		const results = [];
		for await (const c of completions) {
			results.push(c);
		}

		const details = results[0].usage?.prompt_tokens_details;
		expect(details?.cache_creation_input_tokens).toBe(20);
		expect(details?.anthropic_cache_creation).toBeUndefined();
	});

	test('surfaces thinking_tokens as completion_tokens_details.reasoning_tokens', async () => {
		const response = createNonStreamingResponse({
			id: 'msg_thinking',
			type: 'message',
			role: 'assistant',
			content: [{ type: 'text', text: 'thought' }],
			model: 'claude-sonnet-4-20250514',
			stop_reason: 'end_turn',
			usage: {
				input_tokens: 10,
				output_tokens: 1140,
				output_tokens_details: { thinking_tokens: 580 },
			},
		});

		const telemetryData = TelemetryData.createAndMarkAsIssued();
		const completions = await processNonStreamingResponseFromMessagesEndpoint(
			new NullTelemetryService(),
			new TestLogService(),
			response,
			async () => undefined,
			telemetryData,
		);

		const results = [];
		for await (const c of completions) {
			results.push(c);
		}

		expect(results[0].usage?.completion_tokens).toBe(1140);
		expect(results[0].usage?.completion_tokens_details?.reasoning_tokens).toBe(580);
	});

	test('reasoning_tokens defaults to 0 when output_tokens_details is absent', async () => {
		const response = createNonStreamingResponse({
			id: 'msg_no_thinking',
			type: 'message',
			role: 'assistant',
			content: [{ type: 'text', text: 'no thinking' }],
			model: 'claude-sonnet-4-20250514',
			stop_reason: 'end_turn',
			usage: { input_tokens: 10, output_tokens: 50 },
		});

		const telemetryData = TelemetryData.createAndMarkAsIssued();
		const completions = await processNonStreamingResponseFromMessagesEndpoint(
			new NullTelemetryService(),
			new TestLogService(),
			response,
			async () => undefined,
			telemetryData,
		);

		const results = [];
		for await (const c of completions) {
			results.push(c);
		}

		expect(results[0].usage?.completion_tokens_details?.reasoning_tokens).toBe(0);
	});

	test('rejects on malformed JSON', async () => {
		const response = Response.fromText(200, 'OK', createNonStreamingHeaders(), 'not json at all', 'node-fetch');
		const telemetryData = TelemetryData.createAndMarkAsIssued();
		const completions = await processNonStreamingResponseFromMessagesEndpoint(
			new NullTelemetryService(),
			new TestLogService(),
			response,
			async () => undefined,
			telemetryData,
		);
		await expect(async () => {
			for await (const _c of completions) { /* consume */ }
		}).rejects.toThrow('Failed to parse non-streaming Anthropic response');
	});

	test('handles empty content array', async () => {
		const response = createNonStreamingResponse({
			id: 'msg_empty',
			type: 'message',
			role: 'assistant',
			content: [],
			model: 'claude-sonnet-4-20250514',
			stop_reason: 'end_turn',
			usage: { input_tokens: 10, output_tokens: 0 },
		});
		const telemetryData = TelemetryData.createAndMarkAsIssued();
		const completions = await processNonStreamingResponseFromMessagesEndpoint(
			new NullTelemetryService(),
			new TestLogService(),
			response,
			async () => undefined,
			telemetryData,
		);
		const results = [];
		for await (const c of completions) {
			results.push(c);
		}
		expect(results).toHaveLength(1);
		expect(results[0].message.content).toHaveLength(0);
	});

	test('maps refusal stop_reason to ClientDone', async () => {
		const response = createNonStreamingResponse({
			id: 'msg_refusal',
			type: 'message',
			role: 'assistant',
			content: [{ type: 'text', text: 'refused' }],
			model: 'claude-sonnet-4-20250514',
			stop_reason: 'refusal',
			usage: { input_tokens: 10, output_tokens: 5 },
		});
		const telemetryData = TelemetryData.createAndMarkAsIssued();
		const completions = await processNonStreamingResponseFromMessagesEndpoint(
			new NullTelemetryService(),
			new TestLogService(),
			response,
			async () => undefined,
			telemetryData,
		);
		const results = [];
		for await (const c of completions) {
			results.push(c);
		}
		expect(results[0].finishReason).toBe('DONE');
	});

	test('reports tool calls through finishCallback delta', async () => {
		const response = createNonStreamingResponse({
			id: 'msg_tc',
			type: 'message',
			role: 'assistant',
			content: [
				{ type: 'text', text: '' },
				{ type: 'tool_use', id: 'tc_1', name: 'read_file', input: { path: 'a.ts' } },
			],
			model: 'claude-sonnet-4-20250514',
			stop_reason: 'tool_use',
			usage: { input_tokens: 10, output_tokens: 20 },
		});
		const telemetryData = TelemetryData.createAndMarkAsIssued();
		const deltas: { copilotToolCalls?: unknown[] }[] = [];
		const completions = await processNonStreamingResponseFromMessagesEndpoint(
			new NullTelemetryService(),
			new TestLogService(),
			response,
			async (_text, _idx, delta) => { deltas.push(delta); return undefined; },
			telemetryData,
		);
		for await (const _c of completions) { /* consume */ }
		expect(deltas).toHaveLength(1);
		expect(deltas[0].copilotToolCalls).toHaveLength(1);
	});

	test('handles response with missing usage object', async () => {
		const response = createNonStreamingResponse({
			id: 'msg_nousage',
			type: 'message',
			role: 'assistant',
			content: [{ type: 'text', text: 'no usage' }],
			model: 'claude-sonnet-4-20250514',
			stop_reason: 'end_turn',
		});
		const telemetryData = TelemetryData.createAndMarkAsIssued();
		const completions = await processNonStreamingResponseFromMessagesEndpoint(
			new NullTelemetryService(),
			new TestLogService(),
			response,
			async () => undefined,
			telemetryData,
		);
		const results = [];
		for await (const c of completions) {
			results.push(c);
		}
		expect(results).toHaveLength(1);
		// All token counts should default to 0
		expect(results[0].usage?.prompt_tokens).toBe(0);
		expect(results[0].usage?.completion_tokens).toBe(0);
	});
});

suite('processResponseFromMessagesEndpoint routing', () => {
	test('routes non-streaming content-type to non-streaming handler', async () => {
		const body = {
			id: 'msg_route',
			type: 'message',
			role: 'assistant',
			content: [{ type: 'text', text: 'routed' }],
			model: 'claude-sonnet-4-20250514',
			stop_reason: 'end_turn',
			usage: { input_tokens: 10, output_tokens: 5 },
		};
		const response = Response.fromText(200, 'OK', createNonStreamingHeaders('application/json'), JSON.stringify(body), 'node-fetch');
		const telemetryData = TelemetryData.createAndMarkAsIssued();
		const services = createPlatformServices().createTestingAccessor();
		const completions = await processResponseFromMessagesEndpoint(
			services.get(IInstantiationService),
			new NullTelemetryService(),
			new TestLogService(),
			response,
			async () => undefined,
			telemetryData,
		);
		const results = [];
		for await (const c of completions) {
			results.push(c);
		}
		expect(results).toHaveLength(1);
		expect(results[0].message.content).toHaveLength(1);
	});
});

suite('AnthropicMessagesProcessor streaming cache_creation', () => {
	function makeProcessor(): AnthropicMessagesProcessor {
		return new AnthropicMessagesProcessor(
			TelemetryData.createAndMarkAsIssued(),
			'req-1',
			'gh-req-1',
			'',
			new TestLogService(),
			new NullTelemetryService(),
		);
	}

	test('redacted_thinking content block propagates redacted:true on the thinking delta', () => {
		// Regression: the converter relies on an explicit `redacted` flag (not empty text)
		// to decide redacted_thinking vs thinking. The streaming accumulator must set it.
		const processor = makeProcessor();
		const deltas: IResponseDelta[] = [];
		const capture: FinishedCallback = async (_text, _idx, delta) => { deltas.push(delta); return undefined; };

		processor.push({
			type: 'content_block_start',
			index: 0,
			content_block: { type: 'redacted_thinking', data: 'blob123' },
		} as Parameters<typeof processor.push>[0], capture);

		const thinkingDeltas = deltas.filter(d => d.thinking).map(d => d.thinking);
		expect(thinkingDeltas).toHaveLength(1);
		expect(thinkingDeltas[0]).toEqual({ id: 'thinking_0', encrypted: 'blob123', redacted: true });
	});

	test('regular thinking content block emits a signature without the redacted flag', () => {
		const processor = makeProcessor();
		const deltas: IResponseDelta[] = [];
		const capture: FinishedCallback = async (_text, _idx, delta) => { deltas.push(delta); return undefined; };

		processor.push({ type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } } as Parameters<typeof processor.push>[0], capture);
		processor.push({ type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'sig123' } } as Parameters<typeof processor.push>[0], capture);
		processor.push({ type: 'content_block_stop', index: 0 } as Parameters<typeof processor.push>[0], capture);

		const thinkingDeltas = deltas.filter(d => d.thinking).map(d => d.thinking);
		expect(thinkingDeltas).toHaveLength(1);
		expect(thinkingDeltas[0]).toEqual({ id: 'thinking_0', encrypted: 'sig123' });
		expect((thinkingDeltas[0] as { redacted?: boolean }).redacted).toBeUndefined();
	});

	test('message_start cache_creation survives a message_delta that omits the breakdown', () => {
		// Production happy path: Anthropic only emits the cache_creation breakdown
		// in message_start. message_delta updates other usage fields but typically
		// has no cache_creation. The ?? fallback in the processor must preserve
		// the values seen in message_start — including 0 (a common control-arm
		// value) which would be wiped out by a `||` regression.
		const processor = makeProcessor();
		const noop = async () => undefined;

		processor.push({
			type: 'message_start',
			message: {
				id: 'msg_stream',
				type: 'message',
				role: 'assistant',
				content: [],
				model: 'claude-sonnet-4-20250514',
				stop_reason: null,
				stop_sequence: null,
				usage: {
					input_tokens: 5,
					output_tokens: 0,
					cache_creation_input_tokens: 12336,
					cache_read_input_tokens: 391352,
					cache_creation: {
						ephemeral_1h_input_tokens: 0,
						ephemeral_5m_input_tokens: 12336,
					},
				},
			},
		}, noop);

		// message_delta with usage but no cache_creation breakdown — mirrors
		// what every observed backend (Anthropic 1P, Bedrock, Vertex) emits in
		// the final delta of a stream.
		processor.push({
			type: 'message_delta',
			delta: { type: 'message_delta', stop_reason: 'end_turn' },
			usage: {
				output_tokens: 42,
				input_tokens: 5,
				cache_creation_input_tokens: 12336,
				cache_read_input_tokens: 391352,
			},
		}, noop);

		const completion = processor.push({ type: 'message_stop' }, noop);
		expect(completion).toBeDefined();

		const details = completion!.usage?.prompt_tokens_details;
		expect(details?.anthropic_cache_creation?.ephemeral_1h_input_tokens).toBe(0);
		expect(details?.anthropic_cache_creation?.ephemeral_5m_input_tokens).toBe(12336);
	});

	test('message_delta cache_creation overrides message_start values', () => {
		// Defensive: if a backend ever did emit the breakdown in message_delta,
		// the later values should win (matches the existing overwrite pattern
		// for cache_creation_input_tokens / cache_read_input_tokens).
		const processor = makeProcessor();
		const noop = async () => undefined;

		processor.push({
			type: 'message_start',
			message: {
				id: 'msg_stream_override',
				type: 'message',
				role: 'assistant',
				content: [],
				model: 'claude-sonnet-4-20250514',
				stop_reason: null,
				stop_sequence: null,
				usage: {
					input_tokens: 5,
					output_tokens: 0,
					cache_creation_input_tokens: 10000,
					cache_read_input_tokens: 0,
					cache_creation: {
						ephemeral_1h_input_tokens: 0,
						ephemeral_5m_input_tokens: 10000,
					},
				},
			},
		}, noop);

		processor.push({
			type: 'message_delta',
			delta: { type: 'message_delta', stop_reason: 'end_turn' },
			usage: {
				output_tokens: 10,
				input_tokens: 5,
				cache_creation_input_tokens: 15000,
				cache_read_input_tokens: 0,
				cache_creation: {
					ephemeral_1h_input_tokens: 5000,
					ephemeral_5m_input_tokens: 10000,
				},
			},
		}, noop);

		const completion = processor.push({ type: 'message_stop' }, noop);
		const details = completion!.usage?.prompt_tokens_details;
		expect(details?.anthropic_cache_creation?.ephemeral_1h_input_tokens).toBe(5000);
		expect(details?.anthropic_cache_creation?.ephemeral_5m_input_tokens).toBe(10000);
	});

	test('streaming thinking_tokens from message_delta surfaces as reasoning_tokens', () => {
		// Anthropic typically reports thinking_tokens in the final message_delta
		// (after the cumulative output_tokens count is known). Matches the
		// observed payload shape from CAPI/Anthropic 1P/Bedrock/Vertex.
		const processor = makeProcessor();
		const noop = async () => undefined;

		processor.push({
			type: 'message_start',
			message: {
				id: 'msg_thinking_stream',
				type: 'message',
				role: 'assistant',
				content: [],
				model: 'claude-sonnet-4-20250514',
				stop_reason: null,
				stop_sequence: null,
				usage: {
					input_tokens: 5,
					output_tokens: 1,
				},
			},
		}, noop);

		processor.push({
			type: 'message_delta',
			delta: { type: 'message_delta', stop_reason: 'end_turn' },
			usage: {
				output_tokens: 2024,
				input_tokens: 5,
				output_tokens_details: { thinking_tokens: 639 },
			},
		}, noop);

		const completion = processor.push({ type: 'message_stop' }, noop);
		expect(completion!.usage?.completion_tokens).toBe(2024);
		expect(completion!.usage?.completion_tokens_details?.reasoning_tokens).toBe(639);
	});
});
