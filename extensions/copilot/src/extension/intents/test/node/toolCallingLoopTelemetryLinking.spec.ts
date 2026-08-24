/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ChatRequest, LanguageModelChat, LanguageModelToolInformation } from 'vscode';
import { ChatFetchResponseType, ChatResponse } from '../../../../platform/chat/common/commonTypes';
import { toTextPart } from '../../../../platform/chat/common/globalStringUtils';
import { ITestingServicesAccessor } from '../../../../platform/test/node/services';
import { ChatResponseStreamImpl } from '../../../../util/common/chatResponseStreamImpl';
import { CancellationTokenSource } from '../../../../util/vs/base/common/cancellation';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { generateUuid } from '../../../../util/vs/base/common/uuid';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { Conversation, Turn } from '../../../prompt/common/conversation';
import { IBuildPromptContext } from '../../../prompt/common/intents';
import { IBuildPromptResult, nullRenderPromptResult } from '../../../prompt/node/intents';
import { createExtensionUnitTestingServices } from '../../../test/node/services';
import { IToolCallingLoopOptions, ToolCallingLoop } from '../../node/toolCallingLoop';

class TelemetryLinkingTestLoop extends ToolCallingLoop<IToolCallingLoopOptions> {
	public capturedContexts: IBuildPromptContext[] = [];
	public fetchResponses: ChatResponse[] = [];
	private fetchIndex = 0;

	protected override async buildPrompt(buildPromptContext: IBuildPromptContext): Promise<IBuildPromptResult> {
		this.capturedContexts.push(buildPromptContext);
		return {
			...nullRenderPromptResult(),
			messages: [{ role: Raw.ChatRole.User, content: [toTextPart('hello')] }],
		};
	}

	protected override async getAvailableTools(): Promise<LanguageModelToolInformation[]> {
		return [];
	}

	protected override async fetch(): Promise<ChatResponse> {
		return this.fetchResponses[this.fetchIndex++];
	}
}

const chatPanelLocation: ChatRequest['location'] = 1;

function createMockChatRequest(overrides: Partial<ChatRequest> = {}): ChatRequest {
	return {
		prompt: 'test prompt',
		command: undefined,
		references: [],
		location: chatPanelLocation,
		location2: undefined,
		attempt: 0,
		enableCommandDetection: false,
		isParticipantDetected: false,
		toolReferences: [],
		toolInvocationToken: {} as ChatRequest['toolInvocationToken'],
		model: { family: 'test' } as LanguageModelChat,
		tools: new Map(),
		id: generateUuid(),
		sessionId: generateUuid(),
		sessionResource: {} as ChatRequest['sessionResource'],
		hasHooksEnabled: false,
		...overrides,
	} satisfies ChatRequest;
}

function createStream(): ChatResponseStreamImpl {
	return new ChatResponseStreamImpl(
		() => { },
		() => { },
		undefined,
		undefined,
		undefined,
		() => Promise.resolve(undefined),
	);
}

describe('ToolCallingLoop telemetry linking', () => {
	let disposables: DisposableStore;
	let accessor: ITestingServicesAccessor;
	let instantiationService: IInstantiationService;
	let tokenSource: CancellationTokenSource;

	beforeEach(() => {
		disposables = new DisposableStore();
		const serviceCollection = disposables.add(createExtensionUnitTestingServices());
		accessor = serviceCollection.createTestingAccessor();
		instantiationService = accessor.get(IInstantiationService);
		tokenSource = new CancellationTokenSource();
		disposables.add(tokenSource);
	});

	afterEach(() => {
		accessor.dispose();
		disposables.dispose();
	});

	it('exposes parentHeaderRequestId and parentModelCallId from previous fetch in createPromptContext', async () => {
		const request = createMockChatRequest();
		const loop = instantiationService.createInstance(
			TelemetryLinkingTestLoop,
			{
				conversation: new Conversation(generateUuid(), [
					new Turn(generateUuid(), { type: 'user', message: request.prompt })
				]),
				toolCallLimit: 2,
				request,
			}
		);
		disposables.add(loop);

		loop.fetchResponses = [
			{
				type: ChatFetchResponseType.Success,
				value: 'first response',
				requestId: 'client-uuid-1',
				serverRequestId: 'server-echoed-1',
				modelCallId: 'model-call-1',
				usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
				resolvedModel: 'gpt-4.1',
			},
			{
				type: ChatFetchResponseType.Success,
				value: 'second response',
				requestId: 'client-uuid-2',
				serverRequestId: 'server-echoed-2',
				modelCallId: 'model-call-2',
				usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
				resolvedModel: 'gpt-4.1',
			},
		];

		await loop.runOne(createStream(), 0, tokenSource.token);
		await loop.runOne(createStream(), 0, tokenSource.token);

		expect(loop.capturedContexts).toHaveLength(2);
		// First iteration: no parent context yet
		expect(loop.capturedContexts[0].parentHeaderRequestId).toBeUndefined();
		expect(loop.capturedContexts[0].parentModelCallId).toBeUndefined();
		// Second iteration: should have values from first fetch
		expect(loop.capturedContexts[1].parentHeaderRequestId).toBe('server-echoed-1');
		expect(loop.capturedContexts[1].parentModelCallId).toBe('model-call-1');
	});

	it('falls back to client requestId when serverRequestId is empty', async () => {
		const request = createMockChatRequest();
		const loop = instantiationService.createInstance(
			TelemetryLinkingTestLoop,
			{
				conversation: new Conversation(generateUuid(), [
					new Turn(generateUuid(), { type: 'user', message: request.prompt })
				]),
				toolCallLimit: 2,
				request,
			}
		);
		disposables.add(loop);

		loop.fetchResponses = [
			{
				type: ChatFetchResponseType.Success,
				value: 'first response',
				requestId: 'client-uuid-1',
				serverRequestId: '',
				modelCallId: 'model-call-1',
				usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
				resolvedModel: 'gpt-4.1',
			},
			{
				type: ChatFetchResponseType.Success,
				value: 'second response',
				requestId: 'client-uuid-2',
				serverRequestId: 'server-echoed-2',
				modelCallId: 'model-call-2',
				usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
				resolvedModel: 'gpt-4.1',
			},
		];

		await loop.runOne(createStream(), 0, tokenSource.token);
		await loop.runOne(createStream(), 0, tokenSource.token);

		// serverRequestId was '' so should fall back to client requestId
		expect(loop.capturedContexts[1].parentHeaderRequestId).toBe('client-uuid-1');
		expect(loop.capturedContexts[1].parentModelCallId).toBe('model-call-1');
	});

	it('falls back to client requestId when serverRequestId is undefined', async () => {
		const request = createMockChatRequest();
		const loop = instantiationService.createInstance(
			TelemetryLinkingTestLoop,
			{
				conversation: new Conversation(generateUuid(), [
					new Turn(generateUuid(), { type: 'user', message: request.prompt })
				]),
				toolCallLimit: 2,
				request,
			}
		);
		disposables.add(loop);

		loop.fetchResponses = [
			{
				type: ChatFetchResponseType.Success,
				value: 'first response',
				requestId: 'client-uuid-1',
				serverRequestId: undefined,
				modelCallId: 'model-call-1',
				usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
				resolvedModel: 'gpt-4.1',
			},
			{
				type: ChatFetchResponseType.Success,
				value: 'second response',
				requestId: 'client-uuid-2',
				serverRequestId: 'server-echoed-2',
				modelCallId: 'model-call-2',
				usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
				resolvedModel: 'gpt-4.1',
			},
		];

		await loop.runOne(createStream(), 0, tokenSource.token);
		await loop.runOne(createStream(), 0, tokenSource.token);

		// serverRequestId was undefined so should fall back to client requestId
		expect(loop.capturedContexts[1].parentHeaderRequestId).toBe('client-uuid-1');
		expect(loop.capturedContexts[1].parentModelCallId).toBe('model-call-1');
	});
});
