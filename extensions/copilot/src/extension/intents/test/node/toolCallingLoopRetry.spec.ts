/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';
import { setImmediate } from 'timers/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ChatRequest, LanguageModelChat, LanguageModelToolInvocationOptions } from 'vscode';
import { IAuthenticationService } from '../../../../platform/authentication/common/authentication';
import { CopilotToken, createTestExtendedTokenInfo } from '../../../../platform/authentication/common/copilotToken';
import { IChatMLFetcher } from '../../../../platform/chat/common/chatMLFetcher';
import { ChatFetchResponseType, ChatLocation } from '../../../../platform/chat/common/commonTypes';
import { toTextPart } from '../../../../platform/chat/common/globalStringUtils';
import { ConfigKey, IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { InMemoryConfigurationService } from '../../../../platform/configuration/test/common/inMemoryConfigurationService';
import { IEndpointProvider, ModelSupportedEndpoint } from '../../../../platform/endpoint/common/endpointProvider';
import { CopilotChatEndpoint } from '../../../../platform/endpoint/node/copilotChatEndpoint';
import { MockAuthenticationService } from '../../../../platform/ignore/node/test/mockAuthenticationService';
import { FetchOptions, HeadersImpl, IFetcherService, Response } from '../../../../platform/networking/common/fetcherService';
import { IChatEndpoint } from '../../../../platform/networking/common/networking';
import { CAPIChatMessage } from '../../../../platform/networking/common/openai';
import { NodeFetcherService } from '../../../../platform/networking/node/test/nodeFetcherService';
import { ChatResponseStreamImpl } from '../../../../util/common/chatResponseStreamImpl';
import { mock } from '../../../../util/common/test/simpleMock';
import { TokenizerType } from '../../../../util/common/tokenizer';
import { CancellationToken, CancellationTokenSource } from '../../../../util/vs/base/common/cancellation';
import { Event } from '../../../../util/vs/base/common/event';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { URI } from '../../../../util/vs/base/common/uri';
import { SyncDescriptor } from '../../../../util/vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { LanguageModelTextPart, LanguageModelToolResult } from '../../../../vscodeTypes';
import { Conversation, Turn } from '../../../prompt/common/conversation';
import { IBuildPromptContext } from '../../../prompt/common/intents';
import { ChatMLFetcherImpl } from '../../../prompt/node/chatMLFetcher';
import { IBuildPromptResult, nullRenderPromptResult } from '../../../prompt/node/intents';
import { renderPromptElement } from '../../../prompts/node/base/promptRenderer';
import { ChatToolCalls } from '../../../prompts/node/panel/toolCalling';
import { createExtensionUnitTestingServices } from '../../../test/node/services';
import { ToolName } from '../../../tools/common/toolNames';
import { IToolsService } from '../../../tools/common/toolsService';
import { TestToolsService } from '../../../tools/node/test/testToolsService';
import { IToolCallingLoopOptions, ToolCallingLoop, ToolCallingLoopFetchOptions } from '../../node/toolCallingLoop';

class RetryAuthenticationService extends MockAuthenticationService {
	override async getCopilotToken(): Promise<CopilotToken> {
		return new CopilotToken(createTestExtendedTokenInfo({ token: 'synthetic-token' }));
	}
}

class RetryEndpointProvider extends mock<IEndpointProvider>() {
	override readonly onDidModelsRefresh = Event.None;
	endpoint: CopilotChatEndpoint;

	constructor(@IInstantiationService private readonly instantiationService: IInstantiationService) {
		super();
		this.endpoint = instantiationService.createInstance(CopilotChatEndpoint, {
			id: 'retry-test', name: 'retry-test', vendor: 'test', version: '1',
			model_picker_enabled: false, is_chat_default: false, is_chat_fallback: false,
			urlOrRequestMetadata: 'https://retry.test/chat/completions',
			capabilities: {
				type: 'chat', family: 'retry-test', tokenizer: TokenizerType.O200K,
				limits: { max_prompt_tokens: 8192, max_output_tokens: 4096 },
				supports: { streaming: true, tool_calls: true },
			},
		});
	}

	useResponsesApi(): void {
		this.endpoint = this.instantiationService.createInstance(CopilotChatEndpoint, {
			...this.endpoint.modelMetadata,
			supported_endpoints: [ModelSupportedEndpoint.Responses],
		});
	}

	override async getChatEndpoint(): Promise<IChatEndpoint> {
		return this.endpoint;
	}
}

/** Replaces only HTTP I/O; parsing, retry callbacks and request serialization stay real. */
class RetryFetcherService extends NodeFetcherService {
	readonly responses: (Response | (() => Response))[] = [];
	readonly requests: { messages?: CAPIChatMessage[] }[] = [];
	connectivityChecks = 0;

	override async fetch(url: string, options: FetchOptions): Promise<Response> {
		if (options.callSite === 'capi-ping') {
			this.connectivityChecks++;
			return Response.fromText(200, 'OK', new HeadersImpl({}), '{}', 'test-stub');
		}
		expect(url).toBe('https://retry.test/chat/completions');
		this.requests.push(JSON.parse(options.body ?? JSON.stringify(options.json)));
		const response = this.responses.shift();
		if (!response) {
			throw new Error('Unexpected model request');
		}
		return typeof response === 'function' ? response() : response;
	}

	override isFetcherError(error: Error): boolean {
		return 'code' in error;
	}
}

class RecordingToolsService extends TestToolsService {
	readonly calls: string[] = [];

	override async invokeTool(_name: string, options: LanguageModelToolInvocationOptions<object>): Promise<LanguageModelToolResult> {
		this.calls.push(options.chatStreamToolCallId!.split('__vscode-')[0]);
		return new LanguageModelToolResult([new LanguageModelTextPart('synthetic tool result')]);
	}
}

interface RetryLoopOptions extends IToolCallingLoopOptions {
	readonly endpoint: IChatEndpoint;
	readonly tools: RecordingToolsService;
	readonly renderPrompt: (context: IBuildPromptContext) => Promise<IBuildPromptResult>;
}

class RetryToolCallingLoop extends ToolCallingLoop<RetryLoopOptions> {
	protected override buildPrompt(context: IBuildPromptContext): Promise<IBuildPromptResult> {
		return this.options.renderPrompt(context);
	}

	protected override async getAvailableTools() {
		return this.options.tools.tools.filter(tool => tool.name === ToolName.ReadFile);
	}

	protected override fetch(options: ToolCallingLoopFetchOptions, token: CancellationToken) {
		return this.options.endpoint.makeChatRequest2({
			...options,
			debugName: 'retry-test',
			location: ChatLocation.Agent,
			enableRetryOnError: true,
			enableRetryOnFilter: true,
		}, token);
	}
}

/** Can disconnect during reasoning or after tool calls but before the final [DONE]. */
function completion(thinking: string | undefined, calls: string[] = [], interrupted: boolean | 'reasoning' = false, finishReason = calls.length ? 'tool_calls' : 'stop'): Response {
	const chunk = (delta: object, finishReason: string | null = null) => `data: ${JSON.stringify({
		id: 'completion', model: 'retry-test', choices: [{ index: 0, delta, finish_reason: finishReason }],
	})}\n\n`;
	const chunks = [
		chunk({ role: 'assistant', ...(thinking === undefined ? {} : { reasoning_text: thinking.slice(0, 10), reasoning_opaque: 'synthetic-opaque' }) }),
		...(thinking === undefined ? [] : [chunk({ reasoning_text: thinking.slice(10) })]),
		...(calls.length ? [chunk({ tool_calls: calls.map((id, index) => ({
			index, id, type: 'function', function: { name: ToolName.ReadFile, arguments: JSON.stringify({ filePath: `/fixture/${id}.txt`, startLine: 1, endLine: 1 }) },
		})) })] : [chunk({ content: 'done' })]),
		chunk({}, finishReason),
		...(interrupted ? [] : ['data: [DONE]\n\n']),
	];
	return streamResponse(interrupted === 'reasoning' ? chunks.slice(0, 2) : chunks, !!interrupted);
}

function streamResponse(chunks: string[], interrupted: boolean): Response {
	return new Response(200, 'OK', new HeadersImpl({ 'content-type': 'text/event-stream' }), new ReadableStream<Uint8Array>({
		async pull(controller) {
			// Let the consumer process each chunk before the synthetic connection fails.
			await setImmediate();
			const next = chunks.shift();
			if (next !== undefined) {
				controller.enqueue(new TextEncoder().encode(next));
			} else if (interrupted) {
				controller.error(Object.assign(new Error('Synthetic stream disconnect'), { code: 'ECONNRESET' }));
			} else {
				controller.close();
			}
		},
	}), 'test-stub', () => { }, 'retry-test', 'retry.test');
}

function responsesCompletion(id: string, withMetadata: boolean, interrupted = false): Response {
	const toolCall = { type: 'function_call', id: `item-${id}`, call_id: id, name: ToolName.ReadFile, arguments: JSON.stringify({ filePath: `/fixture/${id}.txt`, startLine: 1, endLine: 1 }) };
	const output: object[] = [toolCall];
	const events: object[] = [
		{ type: 'response.output_item.added', output_index: 0, item: { ...toolCall, arguments: '' } },
		{ type: 'response.function_call_arguments.delta', output_index: 0, delta: toolCall.arguments },
		{ type: 'response.output_item.done', output_index: 0, item: { ...toolCall, ...(withMetadata ? { phase: 'commentary' } : {}) } },
	];
	if (withMetadata) {
		const compaction = { type: 'compaction', id: `compaction-${id}`, encrypted_content: `encrypted-${id}` };
		output.push(compaction);
		events.push({ type: 'response.output_item.done', output_index: 1, item: compaction });
	}
	events.push({ type: 'response.completed', response: { id, model: 'retry-test', created_at: 1, output, usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 } } });
	return streamResponse(events.map(event => `data: ${JSON.stringify(event)}\n\n`), interrupted);
}

describe('ToolCallingLoop automatic stream retry', () => {
	const disposables = new DisposableStore();
	let instantiationService: IInstantiationService;
	let endpoint: IChatEndpoint;
	let endpointProvider: RetryEndpointProvider;
	let fetcher: RetryFetcherService;
	let tools: RecordingToolsService;

	beforeEach(async () => {
		const services = disposables.add(createExtensionUnitTestingServices());
		services.define(IAuthenticationService, new SyncDescriptor(RetryAuthenticationService));
		services.define(IChatMLFetcher, new SyncDescriptor(ChatMLFetcherImpl));
		services.define(IFetcherService, new SyncDescriptor(RetryFetcherService));
		services.define(IEndpointProvider, new SyncDescriptor(RetryEndpointProvider));
		services.define(IToolsService, new SyncDescriptor(RecordingToolsService, [new Set()]));
		const accessor = disposables.add(services.createTestingAccessor());
		instantiationService = accessor.get(IInstantiationService);
		fetcher = accessor.get(IFetcherService) as RetryFetcherService;
		tools = accessor.get(IToolsService) as RecordingToolsService;
		const configuration = accessor.get(IConfigurationService) as InMemoryConfigurationService;
		configuration.setConfig(ConfigKey.TeamInternal.RetryNetworkErrors, true);
		const chatFetcher = accessor.get(IChatMLFetcher) as ChatMLFetcherImpl;
		chatFetcher.connectivityCheckDelays = [0];
		endpointProvider = accessor.get(IEndpointProvider) as RetryEndpointProvider;
		endpoint = await endpointProvider.getChatEndpoint();
	});

	afterEach(() => disposables.clear());

	function createLoop(): RetryToolCallingLoop {
		const request: ChatRequest = {
			prompt: 'Run the synthetic retry fixture.', command: undefined, references: [], location: 1, location2: undefined,
			attempt: 0, enableCommandDetection: false, isParticipantDetected: false, toolReferences: [],
			toolInvocationToken: {} as ChatRequest['toolInvocationToken'], model: { id: endpoint.model, family: endpoint.family } as LanguageModelChat,
			tools: new Map(), id: 'turn', sessionId: 'session', sessionResource: URI.parse('vscode-chat://session/retry-test'), hasHooksEnabled: false,
		};
		return disposables.add(instantiationService.createInstance(RetryToolCallingLoop, {
			request,
			conversation: new Conversation('session', [new Turn('turn', { type: 'user', message: request.prompt })]),
			toolCallLimit: 5,
			endpoint,
			tools,
			renderPrompt: async context => {
				const rendered = await renderPromptElement(instantiationService, endpoint, ChatToolCalls, {
					promptContext: context, toolCallRounds: context.toolCallRounds, toolCallResults: context.toolCallResults,
				});
				return {
					...nullRenderPromptResult(), ...rendered,
					metadata: rendered.metadatas,
					messages: [{ role: Raw.ChatRole.User, content: [toTextPart(request.prompt)] }, ...rendered.messages],
				};
			},
		}));
	}

	it('replaces partial reasoning from a disconnected stream', async () => {
		fetcher.responses.push(
			completion('A'.repeat(41), [], 'reasoning'),
			completion('R'.repeat(68), ['retry']),
			completion(undefined),
		);
		await createLoop().run(undefined, CancellationToken.None);
		expect(fetcher.requests.at(-1)!.messages!.filter(message => message.role === 'assistant').map(message => message.reasoning_text)).toEqual(['R'.repeat(68)]);
	});

	it.each([false, true])('executes and resends only successful attempts while preserving completed rounds (retry=%s)', async retry => {
		fetcher.responses.push(
			completion('Completed prior round.', ['prior']),
			...(retry ? [completion('Abandoned reasoning.', ['abandoned', 'reused'], true)] : []),
			completion('Successful retry reasoning.', ['reused', 'retry']),
			completion('Final answer.'),
		);
		const stream = new ChatResponseStreamImpl(() => { }, () => { }, undefined, undefined, undefined, async () => undefined);
		const result = await createLoop().run(stream, CancellationToken.None);
		expect(result.response.type, JSON.stringify(result.response)).toBe(ChatFetchResponseType.Success);
		const messages = fetcher.requests.at(-1)!.messages!;
		expect({
			result: result.response.type,
			connectivityChecks: fetcher.connectivityChecks,
			calls: tools.calls,
			assistantMessages: messages.filter(message => message.role === 'assistant').map(message => ({
				thinking: message.reasoning_text,
				calls: message.tool_calls?.map(call => call.id),
			})),
		}).toEqual({
			result: ChatFetchResponseType.Success,
			connectivityChecks: retry ? 1 : 0,
			calls: ['prior', 'reused', 'retry'],
			assistantMessages: [
				{ thinking: 'Completed prior round.', calls: ['prior'] },
				{ thinking: 'Successful retry reasoning.', calls: ['reused', 'retry'] },
			],
		});
	});

	it('clears each abandoned attempt when a filtered retry is followed by a network retry', async () => {
		fetcher.responses.push(
			completion('Filtered reasoning.', [], false, 'content_filter'),
			completion('Disconnected reasoning.', ['abandoned'], true),
			completion('Successful reasoning.', ['retry']),
			completion('Final answer.'),
		);
		await createLoop().run(undefined, CancellationToken.None);
		expect({
			requests: fetcher.requests.length,
			calls: tools.calls,
			thinking: fetcher.requests.at(-1)!.messages!.filter(message => message.role === 'assistant').map(message => message.reasoning_text),
		}).toEqual({ requests: 4, calls: ['retry'], thinking: ['Successful reasoning.'] });
	});

	it('does not retain reasoning or tools when the successful retry omits them', async () => {
		fetcher.responses.push(completion('Abandoned reasoning.', ['abandoned'], true), completion(undefined));
		const result = await createLoop().run(undefined, CancellationToken.None);
		expect({
			result: result.response.type,
			requests: fetcher.requests.length,
			calls: tools.calls,
			rounds: result.toolCallRounds.map(round => ({ calls: round.toolCalls, thinking: round.thinking, response: round.response })),
		}).toEqual({ result: ChatFetchResponseType.Success, requests: 2, calls: [], rounds: [{ calls: [], thinking: undefined, response: 'done' }] });
	});

	it.each([false, true])('does not execute abandoned calls if the retry fails or is cancelled (cancel=%s)', async cancel => {
		const tokenSource = disposables.add(new CancellationTokenSource());
		fetcher.responses.push(completion('Abandoned reasoning.', ['abandoned'], true), () => {
			if (cancel) {
				tokenSource.cancel();
			}
			return Response.fromText(400, 'Bad Request', new HeadersImpl({}), '{"error":{"message":"Synthetic failure"}}', 'test-stub');
		});
		const result = await createLoop().run(undefined, tokenSource.token);
		expect({
			result: result.response.type,
			requests: fetcher.requests.length,
			calls: tools.calls,
			recordedCalls: result.toolCallRounds.flatMap(round => round.toolCalls),
		}).toEqual({ result: cancel ? ChatFetchResponseType.Canceled : ChatFetchResponseType.Failed, requests: 2, calls: [], recordedCalls: [] });
	});

	it.each([false, true])('records only retry Responses metadata (retry metadata=%s)', async retryHasMetadata => {
		endpointProvider.useResponsesApi();
		endpoint = await endpointProvider.getChatEndpoint();
		fetcher.responses.push(responsesCompletion('abandoned', true, true), responsesCompletion('retry', retryHasMetadata));
		const result = await createLoop().runOne(undefined, 0, CancellationToken.None);
		expect(result.response.type, JSON.stringify(result.response)).toBe(ChatFetchResponseType.Success);
		expect({
			marker: result.round.statefulMarker,
			phase: result.round.phase,
			compaction: result.round.compaction,
			calls: result.round.toolCalls.map(call => call.id.split('__vscode-')[0]),
		}).toEqual({
			marker: 'retry',
			phase: retryHasMetadata ? 'commentary' : undefined,
			compaction: retryHasMetadata ? { type: 'compaction', id: 'compaction-retry', encrypted_content: 'encrypted-retry' } : undefined,
			calls: ['retry'],
		});
	});
});
