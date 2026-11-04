/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';
import { afterEach, describe, expect, it } from 'vitest';
import * as vscode from 'vscode';
import { BlockedExtensionService, IBlockedExtensionService } from '../../../../platform/chat/common/blockedExtensionService';
import { IChatMLFetcher } from '../../../../platform/chat/common/chatMLFetcher';
import { ChatFetchResponseType, ChatLocation } from '../../../../platform/chat/common/commonTypes';
import { IEndpointProvider } from '../../../../platform/endpoint/common/endpointProvider';
import { ExtensionContributedChatEndpoint } from '../../../../platform/endpoint/vscode-node/extChatEndpoint';
import { FetchOptions, IFetcherService } from '../../../../platform/networking/common/fetcherService';
import { IChatEndpoint } from '../../../../platform/networking/common/networking';
import { createFakeStreamResponse } from '../../../../platform/test/node/fetcher';
import { mock } from '../../../../util/common/test/simpleMock';
import { AsyncIterableObject } from '../../../../util/vs/base/common/async';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { Event } from '../../../../util/vs/base/common/event';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { URI } from '../../../../util/vs/base/common/uri';
import { SyncDescriptor } from '../../../../util/vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { IToolCallingLoopOptions, ToolCallingLoop, ToolCallingLoopFetchOptions } from '../../../intents/node/toolCallingLoop';
import { Conversation, Turn } from '../../../prompt/common/conversation';
import { IBuildPromptContext } from '../../../prompt/common/intents';
import { ChatMLFetcherImpl } from '../../../prompt/node/chatMLFetcher';
import { IBuildPromptResult, nullRenderPromptResult } from '../../../prompt/node/intents';
import { PromptRenderer } from '../../../prompts/node/base/promptRenderer';
import { ChatToolCalls } from '../../../prompts/node/panel/toolCalling';
import { createExtensionUnitTestingServices } from '../../../test/node/services';
import { IBYOKStorageService } from '../byokStorageService';
import { CustomOAIBYOKModelProvider } from '../customOAIProvider';

interface ReplayCase {
	readonly name: string;
	readonly id?: string;
	readonly lateId?: boolean;
	readonly thinking: boolean;
	readonly emitReasoning: boolean;
}

interface WireMessage {
	readonly role: string;
	readonly tool_calls?: readonly { id: string }[];
	readonly tool_call_id?: string;
	readonly reasoning_content?: string;
	readonly reasoning?: string;
	readonly cot_id?: string;
}

class StreamingFetcher extends mock<IFetcherService>() {
	override readonly onDidFetch = Event.None;
	override readonly onDidCompleteFetch = Event.None;
	readonly requests: { messages: WireMessage[] }[] = [];

	constructor(private readonly scenario: ReplayCase) {
		super();
	}

	override getUserAgentLibrary() {
		return 'test';
	}
	override makeAbortController() {
		return new AbortController();
	}
	override isAbortError() {
		return false;
	}
	override isInternetDisconnectedError() {
		return false;
	}
	override isFetcherError() {
		return false;
	}
	override isNetworkProcessCrashedError() {
		return false;
	}

	override async fetch(url: string, options: FetchOptions) {
		expect(url).toBe('https://example.test/v1/chat/completions');
		const round = this.requests.length;
		this.requests.push(options.json as { messages: WireMessage[] });
		const chunk = (delta: object, finishReason: string | null = null) => `data: ${JSON.stringify({
			id: `chatcmpl-${round}`, object: 'chat.completion.chunk', created: 1, model: 'custom-reasoner',
			choices: [{ index: 0, delta, finish_reason: finishReason }]
		})}\n\n`;
		const chunks = [chunk({ role: 'assistant' })];
		if (this.scenario.emitReasoning) {
			for (const [index, reasoning_content] of reasoningParts(round).entries()) {
				chunks.push(chunk({
					reasoning_content,
					...(index === (this.scenario.lateId ? 2 : 0) && this.scenario.id !== undefined ? { cot_id: this.scenario.id && `${this.scenario.id}-${round}` } : {}),
				}));
			}
		}
		if (round < 3) {
			chunks.push(chunk({ tool_calls: [{ index: 0, id: `call-${round}`, type: 'function', function: { name: 'read_file', arguments: '{}' } }] }));
		} else {
			chunks.push(chunk({ content: 'Done.' }));
		}
		chunks.push(chunk({}, round < 3 ? 'tool_calls' : 'stop'), 'data: [DONE]\n\n');
		return createFakeStreamResponse(chunks);
	}
}

function reasoningParts(round: number): string[] {
	return [`Round ${round}: `, 'read the next file.\n', 'Keep café 中文 and whitespace.'];
}

class TestEndpointProvider extends mock<IEndpointProvider>() {
	override readonly onDidModelsRefresh = Event.None;
	endpoint!: IChatEndpoint;
	override async getChatEndpoint() {
		return this.endpoint;
	}
}

class TestCustomOAIProvider extends CustomOAIBYOKModelProvider {
	dispose(): void {
		this._lmWrapper.dispose();
	}
}

interface ReplayLoopOptions extends IToolCallingLoopOptions {
	readonly endpoint: IChatEndpoint;
	readonly renderPrompt: (context: IBuildPromptContext) => Promise<IBuildPromptResult>;
}

class ReplayToolCallingLoop extends ToolCallingLoop<ReplayLoopOptions> {
	protected override buildPrompt(context: IBuildPromptContext) {
		return this.options.renderPrompt(context);
	}
	protected override async getAvailableTools(): Promise<vscode.LanguageModelToolInformation[]> {
		return [{ name: 'read_file', description: 'Read a fixture file', inputSchema: { type: 'object', properties: {} }, tags: [], source: undefined }];
	}
	protected override fetch(options: ToolCallingLoopFetchOptions, token: CancellationToken) {
		return this.options.endpoint.makeChatRequest2({ ...options, debugName: 'reasoning-replay-test', location: ChatLocation.Agent }, token);
	}
}

describe('Custom OpenAI reasoning replay through the tool loop', () => {
	const disposables = new DisposableStore();
	afterEach(() => disposables.clear());

	it.each<ReplayCase>([
		{ name: 'no provider ID', thinking: true, emitReasoning: true },
		{ name: 'empty provider ID', id: '', thinking: true, emitReasoning: true },
		{ name: 'provider ID', id: 'reasoning', thinking: true, emitReasoning: true },
		{ name: 'provider ID on the final delta', id: 'reasoning', lateId: true, thinking: true, emitReasoning: true },
		{ name: 'no reasoning', thinking: true, emitReasoning: false },
		{ name: 'thinking disabled without an ID', thinking: false, emitReasoning: true },
		{ name: 'thinking disabled with an ID', id: 'reasoning', thinking: false, emitReasoning: true },
	])('replays successive assistant reasoning with $name', async scenario => {
		const services = disposables.add(createExtensionUnitTestingServices());
		const fetcher = new StreamingFetcher(scenario);
		const endpointProvider = new TestEndpointProvider();
		services.set(IFetcherService, fetcher);
		services.set(IEndpointProvider, endpointProvider);
		services.define(IChatMLFetcher, new SyncDescriptor(ChatMLFetcherImpl));
		services.define(IBlockedExtensionService, new SyncDescriptor(BlockedExtensionService));
		const accessor = disposables.add(services.createTestingAccessor());
		const instantiation = accessor.get(IInstantiationService);
		const storage: IBYOKStorageService = {
			getAPIKey: async () => undefined,
			storeAPIKey: async () => { },
			deleteAPIKey: async () => { },
			getStoredModelConfigs: async () => ({}),
			saveModelConfig: async () => { },
			removeModelConfig: async () => { },
		};
		const provider = disposables.add(instantiation.createInstance(TestCustomOAIProvider, storage));
		const [info] = await provider.provideLanguageModelChatInformation({
			silent: true,
			configuration: {
				models: [{ id: 'custom-reasoner', name: 'Custom reasoner', url: 'https://example.test', maxInputTokens: 128000, maxOutputTokens: 8192, toolCalling: true, vision: false, thinking: scenario.thinking, streaming: true }],
			},
		}, CancellationToken.None);
		const model: vscode.LanguageModelChat = {
			id: info.id,
			name: info.name,
			vendor: 'customoai',
			family: info.family,
			version: info.version,
			maxInputTokens: info.maxInputTokens,
			capabilities: { supportsToolCalling: !!info.capabilities?.toolCalling, supportsImageToText: !!info.capabilities?.imageInput },
			countTokens: async () => 1,
			sendRequest: async (messages, options, token) => ({
				stream: new AsyncIterableObject<vscode.LanguageModelResponsePart2>(async emitter => {
					await provider.provideLanguageModelChatResponse(info, [...messages], { ...options, toolMode: options?.toolMode ?? vscode.LanguageModelChatToolMode.Auto, requestInitiator: 'core' }, { report: part => emitter.emitOne(part) }, token ?? CancellationToken.None);
				}),
				text: AsyncIterableObject.fromArray<string>([]),
			}),
		};
		const endpoint = instantiation.createInstance(ExtensionContributedChatEndpoint, model);
		endpointProvider.endpoint = endpoint;
		const request: vscode.ChatRequest = {
			prompt: 'Read three files, then finish.', command: undefined, references: [], location: 1, location2: undefined,
			attempt: 0, enableCommandDetection: false, isParticipantDetected: false, toolReferences: [],
			toolInvocationToken: {} as vscode.ChatParticipantToolToken, model, tools: new Map(),
			id: 'request', sessionId: 'session', sessionResource: URI.parse('test://session'), hasHooksEnabled: false,
		};
		const loop = disposables.add(instantiation.createInstance(ReplayToolCallingLoop, {
			request, endpoint, toolCallLimit: 5,
			conversation: new Conversation('session', [new Turn('request', { type: 'user', message: request.prompt })]),
			renderPrompt: async context => {
				for (const round of context.toolCallRounds ?? []) {
					for (const call of round.toolCalls) {
						context.toolCallResults![call.id] = new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart('File contents')]);
					}
				}
				const rendered = await PromptRenderer.create(instantiation, endpoint, ChatToolCalls, {
					promptContext: context, toolCallRounds: context.toolCallRounds, toolCallResults: context.toolCallResults,
				}).render();
				return {
					...nullRenderPromptResult(), ...rendered,
					messages: [{ role: Raw.ChatRole.User, content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: request.prompt }] }, ...rendered.messages],
				};
			},
		}));
		const result = await loop.run(undefined, CancellationToken.None);
		expect(result.response.type).toBe(ChatFetchResponseType.Success);
		expect(result.toolCallRounds.map(round => round.thinking?.text)).toEqual([0, 1, 2, 3].map(round => scenario.emitReasoning ? reasoningParts(round).join('') : undefined));
		expect(fetcher.requests).toHaveLength(4);
		expect(fetcher.requests.map(({ messages }) => ({
			assistant: messages.filter(message => message.role === 'assistant').map(message => ({
				calls: message.tool_calls?.map(call => call.id), reasoning: message.reasoning_content, alias: message.reasoning,
				id: message.cot_id,
			})),
			results: messages.filter(message => message.role === 'tool').map(message => message.tool_call_id),
		}))).toEqual([0, 1, 2, 3].map(count => ({
			assistant: Array.from({ length: count }, (_, round) => ({
				calls: [`call-${round}`],
				reasoning: scenario.thinking && scenario.emitReasoning ? reasoningParts(round).join('') : undefined,
				alias: scenario.thinking && scenario.emitReasoning ? reasoningParts(round).join('') : undefined,
				id: scenario.id && scenario.emitReasoning ? `${scenario.id}-${round}` : undefined,
			})),
			results: Array.from({ length: count }, (_, round) => `call-${round}`),
		})));
	});
});
