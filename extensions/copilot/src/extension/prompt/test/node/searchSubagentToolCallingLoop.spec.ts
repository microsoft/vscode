/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CancellationToken, ChatRequest } from 'vscode';
import { IChatHookService } from '../../../../platform/chat/common/chatHookService';
import { ChatFetchResponseType, ChatLocation, ChatResponse } from '../../../../platform/chat/common/commonTypes';
import { ConfigKey, IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { IChatModelInformation } from '../../../../platform/endpoint/common/endpointProvider';
import { ChatEndpoint } from '../../../../platform/endpoint/node/chatEndpoint';
import { SEARCH_AGENT_FAMILY, SearchAgentChatEndpoint } from '../../../../platform/endpoint/node/searchAgentChatEndpoint';
import { IChatEndpoint } from '../../../../platform/networking/common/networking';
import { CancellationTokenSource } from '../../../../util/vs/base/common/cancellation';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { generateUuid } from '../../../../util/vs/base/common/uuid';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { MockChatHookService } from '../../../intents/test/node/mockChatHookService';
import { Conversation, Turn } from '../../../prompt/common/conversation';
import { IBuildPromptContext } from '../../../prompt/common/intents';
import { nullRenderPromptResult } from '../../../prompt/node/intents';
import {
	ISearchSubagentToolCallingLoopOptions,
	SearchSubagentToolCallingLoop,
	isContextOverflowBadRequest,
} from '../../../prompt/node/searchSubagentToolCallingLoop';
import { createExtensionUnitTestingServices } from '../../../test/node/services';

class TestSearchSubagentToolCallingLoop extends SearchSubagentToolCallingLoop {
	public buildPromptCalls = 0;
	public makeChatRequestCalls = 0;
	public readonly responseQueue: ChatResponse[] = [];

	public readonly fakeEndpoint = {
		modelMaxPromptTokens: 100_000,
		acquireTokenizer: () => ({ countToolTokens: async () => 0 }),
		cloneWithTokenOverride: () => this.fakeEndpoint,
		makeChatRequest2: async (): Promise<ChatResponse> => {
			this.makeChatRequestCalls++;
			const next = this.responseQueue.shift();
			if (!next) {
				throw new Error('responseQueue exhausted');
			}
			return next;
		},
	};

	protected override async buildPrompt(buildPromptContext: IBuildPromptContext) {
		this.buildPromptCalls++;
		(this as any)._lastBuildPromptContext = buildPromptContext;
		return nullRenderPromptResult();
	}

	public get didRetryAfterOverflow(): boolean {
		return (this as any)._didRetryAfterOverflow;
	}

	public primeBuildPromptContext(): void {
		(this as any)._lastBuildPromptContext = {} as IBuildPromptContext;
	}

	public callFetch(token: CancellationToken): Promise<ChatResponse> {
		return (this as any).fetch(
			{
				messages: [],
				finishedCb: undefined,
				requestOptions: {},
				userInitiatedRequest: false,
				turnId: 'turn-1',
				modelCapabilities: {},
				iterationNumber: 0,
			},
			token,
		);
	}
}

function createMockChatRequest(): ChatRequest {
	return {
		prompt: 'find things',
		command: undefined,
		references: [],
		location: 1,
		location2: undefined,
		attempt: 0,
		enableCommandDetection: false,
		isParticipantDetected: false,
		toolReferences: [],
		toolInvocationToken: {} as ChatRequest['toolInvocationToken'],
		model: null!,
		tools: new Map(),
		id: generateUuid(),
		sessionId: generateUuid(),
	} as unknown as ChatRequest;
}

function createTestConversation(): Conversation {
	return new Conversation(generateUuid(), [
		new Turn(generateUuid(), { message: 'test message', type: 'user' }),
	]);
}

function overflowResponse(): ChatResponse {
	return {
		type: ChatFetchResponseType.BadRequest,
		reason: 'context_length_exceeded',
		reasonDetail: 'prompt is too long',
		requestId: 'req-overflow',
		serverRequestId: undefined,
	} as ChatResponse;
}

function badRequest(reason: string): ChatResponse {
	return {
		type: ChatFetchResponseType.BadRequest,
		reason,
		reasonDetail: undefined,
		requestId: 'req-bad',
		serverRequestId: undefined,
	} as ChatResponse;
}

function successResponse(): ChatResponse {
	return {
		type: ChatFetchResponseType.Success,
		value: 'ok',
		requestId: 'req-ok',
		serverRequestId: undefined,
	} as unknown as ChatResponse;
}

describe('isContextOverflowBadRequest', () => {
	it('returns true for BadRequest with context_length_exceeded reason', () => {
		expect(isContextOverflowBadRequest(badRequest('context_length_exceeded'))).toBe(true);
	});

	it('matches case-insensitively', () => {
		expect(isContextOverflowBadRequest(badRequest('Context_Length_Exceeded'))).toBe(true);
	});

	it('matches when pattern is in reasonDetail', () => {
		expect(isContextOverflowBadRequest({
			type: ChatFetchResponseType.BadRequest,
			reason: 'invalid_request_error',
			reasonDetail: 'This model has a maximum context length of 200000 tokens',
			requestId: 'r',
			serverRequestId: undefined,
		} as ChatResponse)).toBe(true);
	});

	it('matches the "prompt is too long" pattern', () => {
		expect(isContextOverflowBadRequest(badRequest('prompt is too long: 250000 > 200000'))).toBe(true);
	});

	it('matches the "request too large" pattern', () => {
		expect(isContextOverflowBadRequest(badRequest('Request too large for model'))).toBe(true);
	});

	it('returns false for BadRequest with unrelated reason', () => {
		expect(isContextOverflowBadRequest(badRequest('invalid_tool_schema'))).toBe(false);
	});

	it('returns false for non-BadRequest response types', () => {
		expect(isContextOverflowBadRequest(successResponse())).toBe(false);
		expect(isContextOverflowBadRequest({
			type: ChatFetchResponseType.Length,
			reason: 'context_length_exceeded',
			requestId: 'r',
			serverRequestId: undefined,
		} as ChatResponse)).toBe(false);
		expect(isContextOverflowBadRequest({
			type: ChatFetchResponseType.RateLimited,
			reason: 'r',
			requestId: 'r',
			serverRequestId: undefined,
		} as ChatResponse)).toBe(false);
	});
});

describe('SearchSubagentToolCallingLoop.fetch context-overflow retry', () => {
	let disposables: DisposableStore;
	let instantiationService: IInstantiationService;
	let tokenSource: CancellationTokenSource;

	beforeEach(() => {
		disposables = new DisposableStore();
		const serviceCollection = disposables.add(createExtensionUnitTestingServices());
		serviceCollection.define(IChatHookService, new MockChatHookService());
		const accessor = serviceCollection.createTestingAccessor();
		instantiationService = accessor.get(IInstantiationService);
		tokenSource = new CancellationTokenSource();
		disposables.add(tokenSource);
	});

	afterEach(() => {
		disposables.dispose();
	});

	function createLoop(): TestSearchSubagentToolCallingLoop {
		const options: ISearchSubagentToolCallingLoopOptions = {
			conversation: createTestConversation(),
			toolCallLimit: 10,
			request: createMockChatRequest(),
			location: ChatLocation.Panel,
			promptText: 'find things',
		};
		const loop = instantiationService.createInstance(TestSearchSubagentToolCallingLoop, options);
		(loop as any).getEndpoint = async () => loop.fakeEndpoint;
		loop.primeBuildPromptContext();
		disposables.add(loop);
		return loop;
	}

	it('returns success immediately when first attempt succeeds', async () => {
		const loop = createLoop();
		loop.responseQueue.push(successResponse());

		const response = await loop.callFetch(tokenSource.token);

		expect(response.type).toBe(ChatFetchResponseType.Success);
		expect(loop.makeChatRequestCalls).toBe(1);
		expect(loop.buildPromptCalls).toBe(0);
		expect(loop.didRetryAfterOverflow).toBe(false);
	});

	it('retries once on context overflow and succeeds with shrunk budget', async () => {
		const loop = createLoop();
		loop.responseQueue.push(overflowResponse(), successResponse());

		const response = await loop.callFetch(tokenSource.token);

		expect(response.type).toBe(ChatFetchResponseType.Success);
		expect(loop.makeChatRequestCalls).toBe(2);
		expect(loop.buildPromptCalls).toBe(1);
		expect(loop.didRetryAfterOverflow).toBe(true);
	});

	it('returns the final BadRequest when the single retry also overflows', async () => {
		const loop = createLoop();
		loop.responseQueue.push(overflowResponse(), overflowResponse());

		const response = await loop.callFetch(tokenSource.token);

		expect(response.type).toBe(ChatFetchResponseType.BadRequest);
		expect(loop.makeChatRequestCalls).toBe(2);
		expect(loop.buildPromptCalls).toBe(1);
		expect(loop.didRetryAfterOverflow).toBe(true);
	});

	it('returns non-overflow BadRequest immediately without retry', async () => {
		const loop = createLoop();
		loop.responseQueue.push(badRequest('invalid_tool_schema'));

		const response = await loop.callFetch(tokenSource.token);

		expect(response.type).toBe(ChatFetchResponseType.BadRequest);
		expect(loop.makeChatRequestCalls).toBe(1);
		expect(loop.buildPromptCalls).toBe(0);
		expect(loop.didRetryAfterOverflow).toBe(false);
	});

	it('stops retrying when cancellation is requested', async () => {
		const loop = createLoop();
		loop.responseQueue.push(overflowResponse(), successResponse());
		tokenSource.cancel();

		const response = await loop.callFetch(tokenSource.token);

		expect(response.type).toBe(ChatFetchResponseType.BadRequest);
		expect(loop.makeChatRequestCalls).toBe(1);
		expect(loop.buildPromptCalls).toBe(0);
	});
});

describe('SearchSubagentToolCallingLoop.shouldAutoRetry', () => {
	let disposables: DisposableStore;
	let instantiationService: IInstantiationService;

	beforeEach(() => {
		disposables = new DisposableStore();
		const serviceCollection = disposables.add(createExtensionUnitTestingServices());
		serviceCollection.define(IChatHookService, new MockChatHookService());
		const accessor = serviceCollection.createTestingAccessor();
		instantiationService = accessor.get(IInstantiationService);
	});

	afterEach(() => {
		disposables.dispose();
	});

	function createAutopilotLoop(): TestSearchSubagentToolCallingLoop {
		const request = createMockChatRequest();
		(request as any).permissionLevel = 'autopilot';
		const options: ISearchSubagentToolCallingLoopOptions = {
			conversation: createTestConversation(),
			toolCallLimit: 10,
			request,
			location: ChatLocation.Panel,
			promptText: 'find things',
		};
		const loop = instantiationService.createInstance(TestSearchSubagentToolCallingLoop, options);
		disposables.add(loop);
		return loop;
	}

	it('does not auto-retry on context-overflow BadRequest in autopilot mode', () => {
		const loop = createAutopilotLoop();
		expect((loop as any).shouldAutoRetry(overflowResponse())).toBe(false);
	});

	it('still auto-retries on unrelated BadRequest in autopilot mode', () => {
		const loop = createAutopilotLoop();
		expect((loop as any).shouldAutoRetry(badRequest('invalid_tool_schema'))).toBe(true);
	});
});

describe('SearchSubagentToolCallingLoop.getEndpoint (agentic proxy)', () => {
	let disposables: DisposableStore;
	let instantiationService: IInstantiationService;
	let configurationService: IConfigurationService;

	beforeEach(() => {
		disposables = new DisposableStore();
		const serviceCollection = disposables.add(createExtensionUnitTestingServices());
		serviceCollection.define(IChatHookService, new MockChatHookService());
		const accessor = serviceCollection.createTestingAccessor();
		instantiationService = accessor.get(IInstantiationService);
		configurationService = accessor.get(IConfigurationService);
	});

	afterEach(() => {
		disposables.dispose();
	});

	function createEndpointMetadata(id: string, family: string): IChatModelInformation {
		return {
			id,
			vendor: 'test-vendor',
			name: id,
			version: '1.0',
			model_picker_enabled: true,
			is_chat_default: false,
			is_chat_fallback: false,
			capabilities: {
				type: 'chat',
				family,
				tokenizer: 'o200k_base' as any,
				supports: {
					streaming: true,
					tool_calls: true,
					vision: false,
					prediction: false,
				},
				limits: {
					max_prompt_tokens: 8192,
					max_output_tokens: 4096,
				},
			},
		} as IChatModelInformation;
	}

	function createChatEndpoint(id: string, family: string): ChatEndpoint {
		return instantiationService.createInstance(ChatEndpoint, createEndpointMetadata(id, family));
	}

	function createLoop(allEndpoints: IChatEndpoint[], mainEndpoint: IChatEndpoint): SearchSubagentToolCallingLoop {
		const options: ISearchSubagentToolCallingLoopOptions = {
			conversation: createTestConversation(),
			toolCallLimit: 10,
			request: createMockChatRequest(),
			location: ChatLocation.Panel,
			promptText: 'find things',
		};
		const loop = instantiationService.createInstance(SearchSubagentToolCallingLoop, options);
		disposables.add(loop);
		(loop as any).endpointProvider = {
			getAllChatEndpoints: async () => allEndpoints,
			getChatEndpoint: async () => mainEndpoint,
		};
		return loop;
	}

	it('selects the search-agent endpoint matching the configured model', async () => {
		await configurationService.setConfig(ConfigKey.Advanced.SearchSubagentUseAgenticProxy, true);
		await configurationService.setConfig(ConfigKey.Advanced.SearchSubagentModel, 'search-model-b');
		const mainEndpoint = { model: 'main-agent' } as IChatEndpoint;
		const loop = createLoop([
			createChatEndpoint('main-agent', 'gpt-4o'),
			createChatEndpoint('search-model-a', SEARCH_AGENT_FAMILY),
			createChatEndpoint('search-model-b', SEARCH_AGENT_FAMILY),
		], mainEndpoint);

		const endpoint = await (loop as any).getEndpoint();

		expect(endpoint).toBeInstanceOf(SearchAgentChatEndpoint);
		expect(endpoint.model).toBe('search-model-b');
	});

	it('falls back to the first search-agent endpoint when the configured model is missing', async () => {
		await configurationService.setConfig(ConfigKey.Advanced.SearchSubagentUseAgenticProxy, true);
		await configurationService.setConfig(ConfigKey.Advanced.SearchSubagentModel, 'does-not-exist');
		const mainEndpoint = { model: 'main-agent' } as IChatEndpoint;
		const loop = createLoop([
			createChatEndpoint('search-model-a', SEARCH_AGENT_FAMILY),
			createChatEndpoint('search-model-b', SEARCH_AGENT_FAMILY),
		], mainEndpoint);

		const endpoint = await (loop as any).getEndpoint();

		expect(endpoint).toBeInstanceOf(SearchAgentChatEndpoint);
		expect(endpoint.model).toBe('search-model-a');
	});

	it('falls back to the main agent endpoint when no search-agent endpoint is available', async () => {
		await configurationService.setConfig(ConfigKey.Advanced.SearchSubagentUseAgenticProxy, true);
		await configurationService.setConfig(ConfigKey.Advanced.SearchSubagentModel, 'does-not-exist');
		const mainEndpoint = { model: 'main-agent' } as IChatEndpoint;
		const loop = createLoop([
			createChatEndpoint('main-agent', 'gpt-4o'),
		], mainEndpoint);

		const endpoint = await (loop as any).getEndpoint();

		expect(endpoint).toBe(mainEndpoint);
	});

	it('selects the first search-agent endpoint when no model is configured', async () => {
		await configurationService.setConfig(ConfigKey.Advanced.SearchSubagentUseAgenticProxy, true);
		await configurationService.setConfig(ConfigKey.Advanced.SearchSubagentModel, '');
		const mainEndpoint = { model: 'main-agent' } as IChatEndpoint;
		const loop = createLoop([
			createChatEndpoint('search-model-a', SEARCH_AGENT_FAMILY),
			createChatEndpoint('search-model-b', SEARCH_AGENT_FAMILY),
		], mainEndpoint);

		const endpoint = await (loop as any).getEndpoint();

		expect(endpoint).toBeInstanceOf(SearchAgentChatEndpoint);
		expect(endpoint.model).toBe('search-model-a');
	});
});

describe('SearchSubagentToolCallingLoop.getEndpoint (non-proxy resolution)', () => {
	let disposables: DisposableStore;
	let instantiationService: IInstantiationService;
	let configurationService: IConfigurationService;

	beforeEach(() => {
		disposables = new DisposableStore();
		const serviceCollection = disposables.add(createExtensionUnitTestingServices());
		serviceCollection.define(IChatHookService, new MockChatHookService());
		const accessor = serviceCollection.createTestingAccessor();
		instantiationService = accessor.get(IInstantiationService);
		configurationService = accessor.get(IConfigurationService);
	});

	afterEach(() => {
		disposables.dispose();
	});

	const mainEndpoint = { model: 'main-agent' } as IChatEndpoint;

	function endpoint(model: string, family: string, supportsToolCalls: boolean): IChatEndpoint {
		return { model, name: `${model} display name`, family, supportsToolCalls } as IChatEndpoint;
	}

	/** Records how the mock endpoint provider was called so tests can assert the resolution path. */
	interface IEndpointProviderProbe {
		getAllCalls: number;
		familyCalls: string[];
		mainCalls: number;
	}

	function createLoop(options: {
		allEndpoints?: IChatEndpoint[];
		familyEndpoint?: IChatEndpoint;
		familyThrows?: boolean;
	}): { loop: SearchSubagentToolCallingLoop; probe: IEndpointProviderProbe } {
		const loopOptions: ISearchSubagentToolCallingLoopOptions = {
			conversation: createTestConversation(),
			toolCallLimit: 10,
			request: createMockChatRequest(),
			location: ChatLocation.Panel,
			promptText: 'find things',
		};
		const loop = instantiationService.createInstance(SearchSubagentToolCallingLoop, loopOptions);
		disposables.add(loop);
		const probe: IEndpointProviderProbe = { getAllCalls: 0, familyCalls: [], mainCalls: 0 };
		(loop as any).endpointProvider = {
			getAllChatEndpoints: async () => {
				probe.getAllCalls++;
				return options.allEndpoints ?? [];
			},
			getChatEndpoint: async (arg: unknown) => {
				if (typeof arg === 'string') {
					probe.familyCalls.push(arg);
					if (options.familyThrows) {
						throw new Error(`Unable to resolve chat model with CAPI family selection: ${arg}`);
					}
					return options.familyEndpoint;
				}
				probe.mainCalls++;
				return mainEndpoint;
			},
		};
		return { loop, probe };
	}

	it('uses the exact model-id endpoint when it resolves and supports tool calls', async () => {
		await configurationService.setConfig(ConfigKey.Advanced.SearchSubagentUseAgenticProxy, false);
		await configurationService.setConfig(ConfigKey.Advanced.SearchSubagentModel, 'mai-code-1-flash-picker');
		const { loop, probe } = createLoop({
			allEndpoints: [
				endpoint('lark-debug-picker', 'oswe-vscode-modelD', true),
				endpoint('mai-code-1-flash-picker', 'oswe-vscode-modelD', true),
			],
		});

		const resolved = await (loop as any).getEndpoint();

		expect(resolved.model).toBe('mai-code-1-flash-picker');
		expect(await loop.getModelName()).toBe('mai-code-1-flash-picker display name');
		expect(await (loop as any).getEndpoint()).toBe(resolved);
		expect(probe.getAllCalls).toBe(1);
		expect(probe.familyCalls).toEqual([]);
		expect(probe.mainCalls).toBe(0);
	});

	it('falls back to the main agent endpoint when the exact model-id endpoint does not support tool calls', async () => {
		await configurationService.setConfig(ConfigKey.Advanced.SearchSubagentUseAgenticProxy, false);
		await configurationService.setConfig(ConfigKey.Advanced.SearchSubagentModel, 'mai-code-1-flash-picker');
		const { loop, probe } = createLoop({
			allEndpoints: [
				endpoint('mai-code-1-flash-picker', 'oswe-vscode-modelD', false),
			],
		});

		const resolved = await (loop as any).getEndpoint();

		expect(resolved.model).toBe('main-agent');
		expect(probe.getAllCalls).toBe(1);
		expect(probe.familyCalls).toEqual([]);
		expect(probe.mainCalls).toBe(1);
	});

	it('falls back to family resolution when there is no exact model-id match', async () => {
		await configurationService.setConfig(ConfigKey.Advanced.SearchSubagentUseAgenticProxy, false);
		await configurationService.setConfig(ConfigKey.Advanced.SearchSubagentModel, 'oswe-vscode-modelD');
		const { loop, probe } = createLoop({
			allEndpoints: [endpoint('lark-debug-picker', 'oswe-vscode-modelD', true)],
			familyEndpoint: endpoint('lark-debug-picker', 'oswe-vscode-modelD', true),
		});

		const resolved = await (loop as any).getEndpoint();

		expect(resolved.model).toBe('lark-debug-picker');
		expect(probe.getAllCalls).toBe(1);
		expect(probe.familyCalls).toEqual(['oswe-vscode-modelD']);
		expect(probe.mainCalls).toBe(0);
	});

	it('falls back to the main agent endpoint when the family-resolved model does not support tool calls', async () => {
		await configurationService.setConfig(ConfigKey.Advanced.SearchSubagentUseAgenticProxy, false);
		await configurationService.setConfig(ConfigKey.Advanced.SearchSubagentModel, 'oswe-vscode-modelD');
		const { loop, probe } = createLoop({
			allEndpoints: [],
			familyEndpoint: endpoint('lark-debug-picker', 'oswe-vscode-modelD', false),
		});

		const resolved = await (loop as any).getEndpoint();

		expect(resolved.model).toBe('main-agent');
		expect(probe.familyCalls).toEqual(['oswe-vscode-modelD']);
		expect(probe.mainCalls).toBe(1);
	});

	it('falls back to the main agent endpoint when neither id nor family resolution succeeds', async () => {
		await configurationService.setConfig(ConfigKey.Advanced.SearchSubagentUseAgenticProxy, false);
		await configurationService.setConfig(ConfigKey.Advanced.SearchSubagentModel, 'does-not-exist');
		const { loop, probe } = createLoop({ allEndpoints: [], familyThrows: true });

		const resolved = await (loop as any).getEndpoint();

		expect(resolved.model).toBe('main-agent');
		expect(probe.getAllCalls).toBe(1);
		expect(probe.familyCalls).toEqual(['does-not-exist']);
		expect(probe.mainCalls).toBe(1);
	});

	it('uses the main agent endpoint without any lookups when no model is configured', async () => {
		await configurationService.setConfig(ConfigKey.Advanced.SearchSubagentUseAgenticProxy, false);
		await configurationService.setConfig(ConfigKey.Advanced.SearchSubagentModel, '');
		const { loop, probe } = createLoop({
			allEndpoints: [endpoint('should-not-be-used', 'oswe-vscode-modelD', true)],
		});

		const resolved = await (loop as any).getEndpoint();

		expect(resolved.model).toBe('main-agent');
		expect(probe.getAllCalls).toBe(0);
		expect(probe.familyCalls).toEqual([]);
		expect(probe.mainCalls).toBe(1);
	});
});
