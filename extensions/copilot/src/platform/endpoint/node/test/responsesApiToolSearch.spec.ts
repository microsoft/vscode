/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';
import { beforeEach, describe, expect, it } from 'vitest';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { ChatLocation } from '../../../chat/common/commonTypes';
import { IResponseDelta, OpenAiFunctionTool } from '../../../networking/common/fetch';
import { IChatEndpoint, ICreateEndpointBodyOptions } from '../../../networking/common/networking';
import { IToolDeferralService } from '../../../networking/common/toolDeferralService';
import { TelemetryData } from '../../../telemetry/common/telemetryData';
import { SpyingTelemetryService } from '../../../telemetry/node/spyingTelemetryService';
import { createPlatformServices } from '../../../test/node/services';
import { createResponsesRequestBody, OpenAIResponsesProcessor } from '../responsesApi';

function createMockEndpoint(model: string): IChatEndpoint {
	return {
		model,
		family: model,
		modelProvider: 'openai',
		supportsToolCalls: true,
		supportsToolSearch: model === 'gpt-5.4' || model === 'gpt-5.5',
		supportsVision: false,
		supportsPrediction: false,
		showInModelPicker: true,
		isFallback: false,
		maxOutputTokens: 4096,
		modelMaxPromptTokens: 128000,
		urlOrRequestMetadata: 'https://test',
		name: model,
		version: '1',
		tokenizer: 'cl100k_base' as any,
		acquireTokenizer: () => { throw new Error('Not implemented'); },
		processResponseFromChatEndpoint: () => { throw new Error('Not implemented'); },
		makeChatRequest: () => { throw new Error('Not implemented'); },
		makeChatRequest2: () => { throw new Error('Not implemented'); },
		createRequestBody: () => { throw new Error('Not implemented'); },
		cloneWithTokenOverride() { return this; },
	} as unknown as IChatEndpoint;
}

function createMockOptions(overrides: Partial<ICreateEndpointBodyOptions> = {}): ICreateEndpointBodyOptions {
	return {
		debugName: 'test',
		messages: [{ role: Raw.ChatRole.User, content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'Hello' }] }],
		location: ChatLocation.Agent,
		finishedCb: undefined,
		requestId: 'test-req-1',
		postOptions: { max_tokens: 4096 },
		requestOptions: {
			tools: [
				{ type: 'function', function: { name: 'read_file', description: 'Read a file', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } } },
				{ type: 'function', function: { name: 'grep_search', description: 'Search for text', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } } },
				{ type: 'function', function: { name: 'some_mcp_tool', description: 'An MCP tool', parameters: { type: 'object', properties: { input: { type: 'string' } }, required: ['input'] } } },
				{ type: 'function', function: { name: 'another_deferred_tool', description: 'Another tool', parameters: { type: 'object', properties: {} } } },
				{ type: 'function', function: { name: 'tool_search', description: 'Search tools', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } } },
			]
		},
		...overrides,
	} as ICreateEndpointBodyOptions;
}

function createFunctionTool(name: string, description: string, properties: Record<string, object>, required: string[] = []): OpenAiFunctionTool {
	return {
		type: 'function',
		function: {
			name,
			description,
			parameters: { type: 'object', properties, ...(required.length ? { required } : {}) }
		}
	};
}

describe('createResponsesRequestBody tools', () => {
	let disposables: DisposableStore;
	let services: ReturnType<typeof createPlatformServices>;
	let accessor: ReturnType<ReturnType<typeof createPlatformServices>['createTestingAccessor']>;

	beforeEach(() => {
		disposables = new DisposableStore();
		services = createPlatformServices(disposables);
		const coreNonDeferred = new Set(['read_file', 'list_dir', 'grep_search', 'semantic_search', 'file_search',
			'replace_string_in_file', 'create_file', 'run_in_terminal', 'get_terminal_output',
			'get_errors', 'manage_todo_list', 'runSubagent', 'search_subagent', 'execution_subagent',
			'runTests', 'tool_search', 'view_image', 'fetch_webpage']);
		services.define(IToolDeferralService, { _serviceBrand: undefined, isNonDeferredTool: (name: string) => coreNonDeferred.has(name) });
		accessor = services.createTestingAccessor();
	});

	function createToolSearchScenario(messages: Raw.ChatMessage[]) {
		const endpoint = createMockEndpoint('gpt-5.4');

		const options = createMockOptions({
			messages,
			requestOptions: {
				tools: [
					createFunctionTool('file_search', 'Find files', { query: { type: 'string' } }, ['query']),
					createFunctionTool('read_file', 'Read a file', { path: { type: 'string' } }, ['path']),
					createFunctionTool('some_mcp_tool', 'An MCP tool', { input: { type: 'string' } }, ['input']),
					createFunctionTool('tool_search', 'Search tools', { query: { type: 'string' } }, ['query']),
				]
			}
		});

		return accessor.get(IInstantiationService).invokeFunction(
			createResponsesRequestBody, options, endpoint.model, endpoint
		);
	}

	it('passes tools through without defer_loading for unsupported models', () => {
		const endpoint = createMockEndpoint('gpt-4o');

		const body = accessor.get(IInstantiationService).invokeFunction(
			createResponsesRequestBody, createMockOptions(), endpoint.model, endpoint
		);

		const tools = body.tools as any[];
		expect(tools).toBeDefined();
		expect(tools.find(t => t.type === 'tool_search')).toBeUndefined();
		expect(tools.every(t => !t.defer_loading)).toBe(true);
	});

	it('adds client tool_search and defer_loading for supported models', () => {
		const endpoint = createMockEndpoint('gpt-5.4');

		const body = accessor.get(IInstantiationService).invokeFunction(
			createResponsesRequestBody, createMockOptions(), endpoint.model, endpoint
		);

		const tools = body.tools as any[];
		expect(tools).toBeDefined();

		// Should have client-executed tool_search
		const toolSearchTool = tools.find(t => t.type === 'tool_search');
		expect(toolSearchTool).toBeDefined();
		expect(toolSearchTool.execution).toBe('client');

		// Non-deferred tools should be present without defer_loading
		expect(tools.find(t => t.name === 'read_file')?.defer_loading).toBeUndefined();
		expect(tools.find(t => t.name === 'grep_search')?.defer_loading).toBeUndefined();

		// Deferred tools should NOT be in the request (client-executed mode excludes them entirely)
		expect(tools.find(t => t.name === 'some_mcp_tool')).toBeUndefined();
		expect(tools.find(t => t.name === 'another_deferred_tool')).toBeUndefined();
	});

	it('does not defer tools for unsupported models', () => {
		const endpoint = createMockEndpoint('gpt-4o');

		const body = accessor.get(IInstantiationService).invokeFunction(
			createResponsesRequestBody, createMockOptions(), endpoint.model, endpoint
		);

		const tools = body.tools as any[];
		expect(tools.find(t => t.type === 'tool_search')).toBeUndefined();
		expect(tools.every(t => !t.defer_loading)).toBe(true);
	});

	it('does not defer tools for non-Agent locations', () => {
		const endpoint = createMockEndpoint('gpt-5.4');

		const options = createMockOptions({ location: ChatLocation.Panel });
		const body = accessor.get(IInstantiationService).invokeFunction(
			createResponsesRequestBody, options, endpoint.model, endpoint
		);

		const tools = body.tools as any[];
		expect(tools.find(t => t.type === 'tool_search')).toBeUndefined();
		expect(tools.every(t => !t.defer_loading)).toBe(true);
	});

	it('does not defer tools when tool_search is not in the request tool list', () => {
		// Repro for https://github.com/microsoft/vscode/issues/311946: a custom agent with
		// `tools: ['my-mcp-server/*']` filters out tool_search. Without this gate, every
		// MCP tool would be marked deferred and stripped from the request, leaving the
		// agent with nothing to call.
		const endpoint = createMockEndpoint('gpt-5.4');

		const options = createMockOptions({
			requestOptions: {
				tools: [
					{ type: 'function', function: { name: 'some_mcp_tool', description: 'An MCP tool', parameters: { type: 'object', properties: {} } } },
					{ type: 'function', function: { name: 'another_mcp_tool', description: 'Another MCP tool', parameters: { type: 'object', properties: {} } } },
				]
			}
		});
		const body = accessor.get(IInstantiationService).invokeFunction(
			createResponsesRequestBody, options, endpoint.model, endpoint
		);

		const tools = body.tools as any[];
		// No client tool_search should be added.
		expect(tools.find(t => t.type === 'tool_search')).toBeUndefined();
		// All user-listed tools should be sent to the model, not stripped.
		expect(tools.find(t => t.name === 'some_mcp_tool')).toBeDefined();
		expect(tools.find(t => t.name === 'another_mcp_tool')).toBeDefined();
	});

	it('always filters tool_search function tool from tools array', () => {
		const endpoint = createMockEndpoint('gpt-4o');

		const options = createMockOptions({
			requestOptions: {
				tools: [
					{ type: 'function', function: { name: 'read_file', description: 'Read a file', parameters: { type: 'object', properties: {} } } },
					{ type: 'function', function: { name: 'tool_search', description: 'Search tools', parameters: { type: 'object', properties: {} } } },
				]
			}
		});
		const body = accessor.get(IInstantiationService).invokeFunction(
			createResponsesRequestBody, options, endpoint.model, endpoint
		);

		const tools = body.tools as any[];
		expect(tools.find(t => t.name === 'tool_search')).toBeUndefined();
		expect(tools.find(t => t.name === 'read_file')).toBeDefined();
	});

	it('converts tool_search history for unsupported models', () => {
		const endpoint = createMockEndpoint('gpt-4o');

		const messages: Raw.ChatMessage[] = [
			{ role: Raw.ChatRole.User, content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'Hello' }] },
			{
				role: Raw.ChatRole.Assistant,
				content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'Let me search for tools.' }],
				toolCalls: [{ id: 'call_ts1', type: 'function', function: { name: 'tool_search', arguments: '{"query":"file tools"}' } }],
			},
			{
				role: Raw.ChatRole.Tool,
				toolCallId: 'call_ts1',
				content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: '["read_file","grep_search"]' }],
			},
		];

		const options = createMockOptions({ messages });
		const body = accessor.get(IInstantiationService).invokeFunction(
			createResponsesRequestBody, options, endpoint.model, endpoint
		);

		const input = body.input as any[];
		// tool_search tool call should be converted to tool_search_call, not function_call
		const toolSearchCall = input.find(i => i.type === 'tool_search_call');
		expect(toolSearchCall).toBeDefined();
		expect(toolSearchCall.execution).toBe('client');
		expect(toolSearchCall.call_id).toBe('call_ts1');

		// tool_search result should be converted to tool_search_output, not function_call_output
		const toolSearchOutput = input.find(i => i.type === 'tool_search_output');
		expect(toolSearchOutput).toBeDefined();
		expect(toolSearchOutput.execution).toBe('client');
		expect(toolSearchOutput.call_id).toBe('call_ts1');

		// No tools are currently deferred, so historical tool_search_output should not redeclare them.
		const loadedToolNames = (toolSearchOutput.tools as any[]).map((t: any) => t.name);
		expect(loadedToolNames).toEqual([]);

		// Should not have any function_call with name tool_search
		const badFunctionCall = input.find(i => i.type === 'function_call' && i.name === 'tool_search');
		expect(badFunctionCall).toBeUndefined();
	});

	it('converts tool_search history when current request has no tools', () => {
		const endpoint = createMockEndpoint('gpt-5.4');
		const messages: Raw.ChatMessage[] = [
			{ role: Raw.ChatRole.User, content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'Hello' }] },
			{
				role: Raw.ChatRole.Assistant,
				content: [],
				toolCalls: [{ id: 'call_ts_no_tools', type: 'function', function: { name: 'tool_search', arguments: '{"query":"file tools"}' } }],
			},
			{
				role: Raw.ChatRole.Tool,
				toolCallId: 'call_ts_no_tools',
				content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: '["read_file"]' }],
			},
		];

		const options = createMockOptions({ messages, requestOptions: undefined });
		const body = accessor.get(IInstantiationService).invokeFunction(
			createResponsesRequestBody, options, endpoint.model, endpoint
		);

		const input = body.input as Array<{ type?: string; name?: string; execution?: string; call_id?: string; tools?: unknown[] }>;
		expect(input.find(i => i.type === 'tool_search_call')).toMatchObject({
			type: 'tool_search_call',
			execution: 'client',
			call_id: 'call_ts_no_tools',
		});
		expect(input.find(i => i.type === 'tool_search_output')).toMatchObject({
			type: 'tool_search_output',
			execution: 'client',
			call_id: 'call_ts_no_tools',
			tools: [],
		});
		expect(input.find(i => i.type === 'function_call' && i.name === 'tool_search')).toBeUndefined();
	});

	it('excludes non-deferred tools from tool_search_output history', () => {
		const messages: Raw.ChatMessage[] = [
			{ role: Raw.ChatRole.User, content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'Find file tools' }] },
			{
				role: Raw.ChatRole.Assistant,
				content: [],
				toolCalls: [{ id: 'call_ts_file', type: 'function', function: { name: 'tool_search', arguments: '{"query":"file tools"}' } }],
			},
			{
				role: Raw.ChatRole.Tool,
				toolCallId: 'call_ts_file',
				content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: '["file_search","some_mcp_tool"]' }],
			},
			{
				role: Raw.ChatRole.Assistant,
				content: [],
				toolCalls: [
					{ id: 'call_file', type: 'function', function: { name: 'file_search', arguments: '{"query":"*.ts"}' } },
					{ id: 'call_mcp', type: 'function', function: { name: 'some_mcp_tool', arguments: '{"input":"x"}' } },
				],
			},
		];

		const body = createToolSearchScenario(messages);

		const input = body.input as Array<{ type?: string; name?: string; namespace?: string; tools?: Array<{ name: string }> }>;
		const toolSearchOutput = input.find(i => i.type === 'tool_search_output');
		const fileSearchCall = input.find(i => i.type === 'function_call' && i.name === 'file_search');
		const mcpToolCall = input.find(i => i.type === 'function_call' && i.name === 'some_mcp_tool');

		expect({
			loadedToolNames: toolSearchOutput?.tools?.map(t => t.name),
			fileSearchNamespace: fileSearchCall?.namespace,
			mcpToolNamespace: mcpToolCall?.namespace,
		}).toEqual({
			loadedToolNames: ['some_mcp_tool'],
			fileSearchNamespace: undefined,
			mcpToolNamespace: 'some_mcp_tool',
		});
	});

	it('does not load tools from tool_search_output when only non-deferred tools are returned', () => {
		const messages: Raw.ChatMessage[] = [
			{ role: Raw.ChatRole.User, content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'Find core tools' }] },
			{
				role: Raw.ChatRole.Assistant,
				content: [],
				toolCalls: [{ id: 'call_ts_core', type: 'function', function: { name: 'tool_search', arguments: '{"query":"core tools"}' } }],
			},
			{
				role: Raw.ChatRole.Tool,
				toolCallId: 'call_ts_core',
				content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: '["file_search","read_file"]' }],
			},
		];

		const body = createToolSearchScenario(messages);

		const input = body.input as Array<{ type?: string; tools?: Array<{ name: string }> }>;
		const toolSearchOutput = input.find(i => i.type === 'tool_search_output');

		expect(toolSearchOutput?.tools?.map(t => t.name)).toEqual([]);
	});

	it('still emits tool_search_output and namespaces deferred-tool calls when the stateful marker drops the tool_search_call from the post-marker slice (issue #313899)', () => {
		// Repro for https://github.com/microsoft/vscode/issues/313899: when the Responses API
		// resumes from a previous_response_id, the assistant message carrying the marker (and
		// the tool_search_call it emitted) is sliced out of the input. Without scanning the
		// full history first, the tool_search bookkeeping would be empty and the subsequent
		// tool result would be incorrectly serialized as `function_call_output` instead of
		// `tool_search_output`, leaving the deferred MCP tool definitions unloaded on the
		// server and the model unable to invoke the tool it just discovered.
		const modelId = 'gpt-5.4';
		const statefulMarker = 'marker-abc';
		const messages: Raw.ChatMessage[] = [
			{ role: Raw.ChatRole.User, content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'Use the MCP tool' }] },
			{
				role: Raw.ChatRole.Assistant,
				// Marker lives on the same assistant turn that emitted the tool_search call.
				content: [{
					type: Raw.ChatCompletionContentPartKind.Opaque,
					value: { type: 'stateful_marker', value: { modelId, marker: statefulMarker } },
				}],
				toolCalls: [{ id: 'call_ts_resume', type: 'function', function: { name: 'tool_search', arguments: '{"query":"mcp"}' } }],
			},
			{
				role: Raw.ChatRole.Tool,
				toolCallId: 'call_ts_resume',
				content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: '["some_mcp_tool"]' }],
			},
			{
				role: Raw.ChatRole.Assistant,
				content: [],
				toolCalls: [{ id: 'call_mcp_resume', type: 'function', function: { name: 'some_mcp_tool', arguments: '{"input":"x"}' } }],
			},
		];

		const body = createToolSearchScenario(messages);

		const input = body.input as Array<{ type?: string; name?: string; namespace?: string; call_id?: string; tools?: Array<{ name: string }> }>;

		expect({
			previous_response_id: body.previous_response_id,
			// The tool result must round-trip as a tool_search_output (not function_call_output)
			toolSearchOutput: input.find(i => i.type === 'tool_search_output'),
			// Any function_call_output for the tool_search call_id would be the bug
			badFunctionCallOutput: input.find((i: any) => i.type === 'function_call_output' && i.call_id === 'call_ts_resume'),
			// The follow-up MCP tool call must carry the namespace so the server can match
			// it against the deferred tool loaded via tool_search_output.
			mcpToolNamespace: input.find(i => i.type === 'function_call' && i.name === 'some_mcp_tool')?.namespace,
		}).toEqual({
			previous_response_id: statefulMarker,
			toolSearchOutput: {
				type: 'tool_search_output',
				execution: 'client',
				call_id: 'call_ts_resume',
				status: 'completed',
				tools: [expect.objectContaining({ name: 'some_mcp_tool', defer_loading: true })],
			},
			badFunctionCallOutput: undefined,
			mcpToolNamespace: 'some_mcp_tool',
		});
	});

	it('preserves rich JSON Schema keywords and emits strict: false on both the inline and deferred paths (issue #315526)', () => {
		// Extension-contributed tools (e.g. agent-helper-kit's `run_in_shell`) use JSON Schema
		// keywords outside OpenAI's strict-mode subset — `allOf`, `not`, `anyOf`, `if`/`then`,
		// numeric bounds — to express mutually-exclusive arguments. The Responses API defaults
		// `strict` to `true` when omitted, which silently strips those keywords. Both the
		// inline (non-deferred) and the tool_search_output (deferred) paths must explicitly
		// emit `strict: false` and round-trip the schema verbatim, otherwise the model invokes
		// the tool with all the mutually-exclusive fields populated at once.
		const richSchema = {
			type: 'object',
			required: ['command'],
			properties: {
				command: { type: 'string' },
				full_output: { type: 'boolean' },
				last_lines: { type: 'number', minimum: 0 },
				regex: { type: 'string' },
			},
			allOf: [
				{ not: { required: ['last_lines', 'regex'] } },
				{ not: { required: ['full_output', 'last_lines'] } },
				{ not: { required: ['full_output', 'regex'] } },
			],
		};
		const endpoint = createMockEndpoint('gpt-5.4');

		// Inline path: non-deferred tools are sent in the initial request body.
		const inlineBody = accessor.get(IInstantiationService).invokeFunction(
			createResponsesRequestBody,
			createMockOptions({
				requestOptions: {
					tools: [
						{ type: 'function', function: { name: 'read_file', description: 'Read a file', parameters: richSchema } },
						{ type: 'function', function: { name: 'tool_search', description: 'Search tools', parameters: { type: 'object', properties: {} } } },
					]
				}
			}),
			endpoint.model,
			endpoint,
		);

		// Deferred path: the same schema must come back via tool_search_output unchanged.
		const deferredBody = accessor.get(IInstantiationService).invokeFunction(
			createResponsesRequestBody,
			createMockOptions({
				messages: [
					{ role: Raw.ChatRole.User, content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'Run a shell command' }] },
					{
						role: Raw.ChatRole.Assistant,
						content: [],
						toolCalls: [{ id: 'call_ts_strict', type: 'function', function: { name: 'tool_search', arguments: '{"query":"shell"}' } }],
					},
					{
						role: Raw.ChatRole.Tool,
						toolCallId: 'call_ts_strict',
						content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: '["run_in_shell"]' }],
					},
				],
				requestOptions: {
					tools: [
						{ type: 'function', function: { name: 'run_in_shell', description: 'Run a shell command', parameters: richSchema } },
						{ type: 'function', function: { name: 'tool_search', description: 'Search tools', parameters: { type: 'object', properties: {} } } },
					]
				},
			}),
			endpoint.model,
			endpoint,
		);

		const inlineReadFile = (inlineBody.tools as Array<{ name?: string; strict?: unknown; parameters?: unknown }>).find(t => t.name === 'read_file');
		const deferredToolSearchOutput = (deferredBody.input as Array<{ type?: string; tools?: Array<{ name: string; strict?: unknown; defer_loading?: unknown; parameters?: unknown }> }>).find(i => i.type === 'tool_search_output');
		const deferredRunInShell = deferredToolSearchOutput?.tools?.find(t => t.name === 'run_in_shell');

		expect({
			inline: { strict: inlineReadFile?.strict, parameters: inlineReadFile?.parameters },
			deferred: {
				strict: deferredRunInShell?.strict,
				defer_loading: deferredRunInShell?.defer_loading,
				parameters: deferredRunInShell?.parameters,
			},
		}).toEqual({
			inline: { strict: false, parameters: richSchema },
			deferred: { strict: false, defer_loading: true, parameters: richSchema },
		});
	});
});

describe('OpenAIResponsesProcessor tool search events', () => {
	function createProcessor() {
		const telemetryData = TelemetryData.createAndMarkAsIssued({}, {});
		const telemetryService = new SpyingTelemetryService();
		const ds = new DisposableStore();
		const services = createPlatformServices(ds);
		const accessor = services.createTestingAccessor();
		return accessor.get(IInstantiationService).createInstance(OpenAIResponsesProcessor, telemetryData, telemetryService, 'req-123', 'gh-req-456', '', undefined);
	}

	function collectDeltas(processor: OpenAIResponsesProcessor, events: any[]): IResponseDelta[] {
		const deltas: IResponseDelta[] = [];
		const finishedCb = async (_text: string, _index: number, delta: IResponseDelta) => {
			deltas.push(delta);
			return undefined;
		};
		for (const event of events) {
			processor.push({ sequence_number: 0, ...event }, finishedCb);
		}
		return deltas;
	}

	it('handles client tool_search_call as copilotToolCall', () => {
		const processor = createProcessor();
		const deltas = collectDeltas(processor, [
			{
				type: 'response.output_item.added',
				output_index: 0,
				item: {
					type: 'tool_search_call' as any,
					id: 'ts_002',
					execution: 'client',
					call_id: 'call_abc',
					status: 'in_progress',
					arguments: {},
				} as any,
			},
			{
				type: 'response.output_item.done',
				output_index: 0,
				item: {
					type: 'tool_search_call' as any,
					id: 'ts_002',
					execution: 'client',
					call_id: 'call_abc',
					status: 'completed',
					arguments: { query: 'Find shipping tools' },
				} as any,
			}
		]);

		// First delta: beginToolCalls for tool_search
		expect(deltas[0].beginToolCalls).toBeDefined();
		expect(deltas[0].beginToolCalls![0].name).toBe('tool_search');
		expect(deltas[0].beginToolCalls![0].id).toBe('call_abc');

		// Second delta: completed copilotToolCall
		expect(deltas[1].copilotToolCalls).toBeDefined();
		expect(deltas[1].copilotToolCalls![0]).toMatchObject({
			id: 'call_abc',
			name: 'tool_search',
			arguments: '{"query":"Find shipping tools"}',
		});
	});
});
