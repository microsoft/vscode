/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CancellationToken, ChatRequest } from 'vscode';
import { IChatHookService } from '../../../../platform/chat/common/chatHookService';
import { ChatFetchResponseType, ChatLocation, ChatResponse } from '../../../../platform/chat/common/commonTypes';
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
