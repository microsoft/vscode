/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';
import { describe, expect, it } from 'vitest';
import { IChatMLFetcher } from '../../../../platform/chat/common/chatMLFetcher';
import { ChatLocation } from '../../../../platform/chat/common/commonTypes';
import { StaticChatMLFetcher } from '../../../../platform/chat/test/common/staticChatMLFetcher';
import { ConfigKey, IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { createResponsesRequestBody } from '../../../../platform/endpoint/node/responsesApi';
import { MockEndpoint } from '../../../../platform/endpoint/test/node/mockEndpoint';
import { CUSTOM_TOOL_SEARCH_NAME } from '../../../../platform/networking/common/anthropic';
import { createPlatformServices } from '../../../../platform/test/node/services';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
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

	it('reconstructs the latest 20 Responses conversation boundaries in addition to two prefix anchors', () => {
		const messages: Raw.ChatMessage[] = [
			{ role: Raw.ChatRole.System, content: [text('system')] },
			{ role: Raw.ChatRole.System, content: [text('instructions')] },
			{ role: Raw.ChatRole.User, content: [text('global context'), cacheBreakpoint()] },
		];
		for (let turn = 0; turn < 12; turn++) {
			messages.push(
				{ role: Raw.ChatRole.User, content: [text(`user-${turn}`)] },
				{
					role: Raw.ChatRole.Assistant, content: [],
					toolCalls: ['a', 'b'].map(id => ({ id: `${turn}-${id}`, type: 'function', function: { name: 'read_file', arguments: '{}' } })),
				},
				{ role: Raw.ChatRole.Tool, toolCallId: `${turn}-a`, content: [text(`result-${turn}-a`)] },
				{ role: Raw.ChatRole.Tool, toolCallId: `${turn}-b`, content: [text(`result-${turn}-b`)] },
				{ role: Raw.ChatRole.Assistant, content: [text(`answer-${turn}`)] },
			);
		}

		addCacheBreakpoints(messages, 'responses');

		const markedText = () => messages.filter(hasBreakpoint).map(message => message.content[0]);
		const expected = [
			text('instructions'),
			text('global context'),
			...Array.from({ length: 10 }, (_, index) => [text(`user-${index + 2}`), text(`result-${index + 2}-b`)]).flat(),
		];
		expect(markedText()).toEqual(expected);

		// Rebuilt prompts and repeated placement must produce the same bounded markers.
		addCacheBreakpoints(messages, 'responses');
		expect(markedText()).toEqual(expected);
		expect(messages.flatMap(message => message.content).filter(part => part.type === Raw.ChatCompletionContentPartKind.CacheBreakpoint)).toHaveLength(22);
	});

	it('removes stale and duplicate Responses markers without counting the latest user as a prefix', () => {
		const messages = Array.from({ length: 25 }, (_, index): Raw.ChatMessage[] => [
			{ role: Raw.ChatRole.User, content: [text(`user-${index}`), cacheBreakpoint(), cacheBreakpoint()] },
			{ role: Raw.ChatRole.Assistant, content: [text(`answer-${index}`), cacheBreakpoint()] },
		]).flat();

		addCacheBreakpoints(messages, 'responses');

		expect(messages.filter(hasBreakpoint).map(message => message.content[0])).toEqual(
			Array.from({ length: 20 }, (_, index) => text(`user-${index + 5}`)),
		);
		expect(messages.flatMap(message => message.content).filter(part => part.type === Raw.ChatCompletionContentPartKind.CacheBreakpoint)).toHaveLength(20);
	});

	it('anchors global context after user-role custom instructions without spending the conversation budget on the prefix', () => {
		const messages: Raw.ChatMessage[] = [
			{ role: Raw.ChatRole.System, content: [text('system')] },
			{ role: Raw.ChatRole.User, content: [text('custom instructions')] },
			{ role: Raw.ChatRole.User, content: [text('global context')] },
			{ role: Raw.ChatRole.User, content: [text('query')] },
		];

		addCacheBreakpoints(messages, 'responses');

		expect(messages.filter(hasBreakpoint).map(message => message.content[0])).toEqual([
			text('system'), text('global context'), text('query'),
		]);
	});

	it('uses the last eligible tool result in each batch and excludes native tool-search results', () => {
		const messages: Raw.ChatMessage[] = [
			{ role: Raw.ChatRole.User, content: [text('request')] },
			{
				role: Raw.ChatRole.Assistant, content: [],
				toolCalls: [
					{ id: 'read', type: 'function', function: { name: 'read_file', arguments: '{}' } },
					{ id: 'search', type: 'function', function: { name: CUSTOM_TOOL_SEARCH_NAME, arguments: '{}' } },
				],
			},
			{ role: Raw.ChatRole.Tool, toolCallId: 'read', content: [text('result')] },
			{ role: Raw.ChatRole.Tool, toolCallId: 'search', content: [text('["read_file"]'), cacheBreakpoint()] },
		];

		addCacheBreakpoints(messages, 'responses');

		expect(messages.filter(hasBreakpoint).map(message => message.content[0])).toEqual([text('request'), text('result')]);
	});

	it('places Responses markers immediately after the last serializable block', () => {
		const unsupportedDocument: Raw.ChatCompletionContentPart = {
			type: Raw.ChatCompletionContentPartKind.Document,
			documentData: { data: 'file', mediaType: 'text/plain' },
		};
		const messages: Raw.ChatMessage[] = [
			{ role: Raw.ChatRole.User, content: [text(), image(), opaque('unsupported')] },
			{ role: Raw.ChatRole.Assistant, content: [text()] },
			{ role: Raw.ChatRole.User, content: [document(), unsupportedDocument] },
			{ role: Raw.ChatRole.Assistant, content: [text()] },
			{ role: Raw.ChatRole.User, content: [unsupportedDocument, cacheBreakpoint()] },
		];

		addCacheBreakpoints(messages, 'responses');

		expect(messages[0].content.map(part => part.type)).toEqual([
			Raw.ChatCompletionContentPartKind.Text,
			Raw.ChatCompletionContentPartKind.Image,
			Raw.ChatCompletionContentPartKind.CacheBreakpoint,
			Raw.ChatCompletionContentPartKind.Opaque,
		]);
		expect(messages[2].content.map(part => part.type)).toEqual([
			Raw.ChatCompletionContentPartKind.Document,
			Raw.ChatCompletionContentPartKind.CacheBreakpoint,
			Raw.ChatCompletionContentPartKind.Document,
		]);
		expect(hasBreakpoint(messages[4])).toBe(false);
	});

	it('keeps the four-breakpoint budget for Chat Completions', () => {
		const messages: Raw.ChatMessage[] = Array.from({ length: 10 }, () => ({
			role: Raw.ChatRole.Assistant,
			content: [text()],
		}));

		addCacheBreakpoints(messages, 'chatCompletions');

		expect(messages.filter(hasBreakpoint)).toHaveLength(4);
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

describe('Responses cache breakpoint request integration', () => {
	const buildBody = (messages: Raw.ChatMessage[], model = 'gpt-5.6-sol', enabled = true) => {
		const services = createPlatformServices();
		services.define(IChatMLFetcher, new StaticChatMLFetcher([]));
		const accessor = services.createTestingAccessor();
		try {
			accessor.get(IConfigurationService).setConfig(ConfigKey.ResponsesApiPromptCacheBreakpointEnabled, enabled);
			const instantiationService = accessor.get(IInstantiationService);
			const endpoint = instantiationService.createInstance(MockEndpoint, model);
			addCacheBreakpoints(messages, 'responses');
			return instantiationService.invokeFunction(servicesAccessor => createResponsesRequestBody(servicesAccessor, {
				debugName: 'cache-breakpoint-test',
				messages,
				requestId: 'cache-breakpoint-request',
				postOptions: {},
				finishedCb: undefined,
				location: ChatLocation.Agent,
			}, model, endpoint));
		} finally {
			accessor.dispose();
			services.dispose();
		}
	};

	it.each(['gpt-5.6-sol', 'gpt-6-astra'])('serializes exactly two prefix and twenty conversation markers for %s', model => {
		const messages: Raw.ChatMessage[] = [
			{ role: Raw.ChatRole.System, content: [text('system')] },
			{ role: Raw.ChatRole.User, content: [text('global context')] },
		];
		for (let turn = 0; turn < 25; turn++) {
			messages.push(
				{ role: Raw.ChatRole.User, content: [text(`user-${turn}`)] },
				{ role: Raw.ChatRole.Assistant, content: [text(`answer-${turn}`)] },
			);
		}

		const body = buildBody(messages, model);
		const marker = { prompt_cache_breakpoint: { mode: 'explicit' } };

		expect(body.prompt_cache_options).toEqual({ mode: 'explicit' });
		expect(body.input).toEqual([
			{ type: 'message', role: 'system', content: [{ type: 'input_text', text: 'system', ...marker }] },
			{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'global context', ...marker }] },
			...Array.from({ length: 25 }, (_, turn) => [
				{ type: 'message', role: 'user', content: [{ type: 'input_text', text: `user-${turn}`, ...(turn >= 5 ? marker : {}) }] },
				{ type: 'message', role: 'assistant', phase: undefined, content: [{ type: 'output_text', text: `answer-${turn}` }] },
			]).flat(),
		]);
	});

	it.each([
		{ model: 'gpt-5.6-sol', enabled: false, options: { mode: 'implicit' } },
		{ model: 'gpt-5-mini', enabled: true, options: undefined },
	])('preserves the unmarked request shape for $model with enabled=$enabled', ({ model, enabled, options }) => {
		const messages: Raw.ChatMessage[] = [
			{ role: Raw.ChatRole.User, content: [text('query')] },
			{
				role: Raw.ChatRole.Assistant, content: [],
				toolCalls: [{ id: 'read', type: 'function', function: { name: 'read_file', arguments: '{}' } }],
			},
			{ role: Raw.ChatRole.Tool, toolCallId: 'read', content: [text('result')] },
		];

		const body = buildBody(messages, model, enabled);

		expect(body.prompt_cache_options).toEqual(options);
		expect(body.input).toEqual([
			{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'query' }] },
			{ type: 'function_call', name: 'read_file', arguments: '{}', call_id: 'read' },
			{ type: 'function_call_output', call_id: 'read', output: 'result' },
		]);
	});

	it('serializes the eligible tool boundary before a native tool-search result', () => {
		const messages: Raw.ChatMessage[] = [
			{ role: Raw.ChatRole.User, content: [text('query')] },
			{
				role: Raw.ChatRole.Assistant, content: [],
				toolCalls: [
					{ id: 'read', type: 'function', function: { name: 'read_file', arguments: '{}' } },
					{ id: 'search', type: 'function', function: { name: CUSTOM_TOOL_SEARCH_NAME, arguments: '{}' } },
				],
			},
			{ role: Raw.ChatRole.Tool, toolCallId: 'read', content: [text('result'), image(), opaque('unsupported')] },
			{ role: Raw.ChatRole.Tool, toolCallId: 'search', content: [text('[]')] },
		];

		const body = buildBody(messages);

		expect(body.input?.[3]).toEqual({
			type: 'function_call_output',
			call_id: 'read',
			output: [
				{ type: 'input_text', text: 'result' },
				{ type: 'input_image', detail: 'auto', image_url: 'image', prompt_cache_breakpoint: { mode: 'explicit' } },
			],
		});
		expect(body.input?.[4]).toEqual({
			type: 'tool_search_output', execution: 'client', call_id: 'search', status: 'completed', tools: [],
		});
	});
});