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

class UsageCapturingStream extends ChatResponseStreamImpl {
	public readonly usages: Array<{ promptTokens: number; completionTokens: number }>;

	constructor() {
		const usages: Array<{ promptTokens: number; completionTokens: number }> = [];
		super(
			() => { },
			() => { },
			undefined,
			undefined,
			undefined,
			() => Promise.resolve(undefined),
			(usage) => {
				usages.push({
					promptTokens: usage.promptTokens,
					completionTokens: usage.completionTokens
				});
			}
		);
		this.usages = usages;
	}
}

class UsageTestToolCallingLoop extends ToolCallingLoop<IToolCallingLoopOptions> {
	protected override async buildPrompt(_buildPromptContext: IBuildPromptContext): Promise<IBuildPromptResult> {
		return {
			...nullRenderPromptResult(),
			messages: [{ role: Raw.ChatRole.User, content: [toTextPart('hello world')] }],
		};
	}

	protected override async getAvailableTools(): Promise<LanguageModelToolInformation[]> {
		return [];
	}

	protected override async fetch(): Promise<ChatResponse> {
		return {
			type: ChatFetchResponseType.Success,
			value: 'test-response',
			requestId: 'request-id',
			serverRequestId: undefined,
			usage: {
				prompt_tokens: 100,
				completion_tokens: 20,
				total_tokens: 120
			},
			resolvedModel: 'gpt-4.1'
		};
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

function createConversation(prompt: string): Conversation {
	return new Conversation(generateUuid(), [
		new Turn(generateUuid(), { type: 'user', message: prompt })
	]);
}

describe('ToolCallingLoop usage reporting', () => {
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

	it('reports usage for regular requests', async () => {
		const request = createMockChatRequest();
		const loop = instantiationService.createInstance(
			UsageTestToolCallingLoop,
			{
				conversation: createConversation(request.prompt),
				toolCallLimit: 1,
				request,
			}
		);
		disposables.add(loop);
		const stream = new UsageCapturingStream();

		await loop.runOne(stream, 0, tokenSource.token);

		expect(stream.usages).toEqual([{ promptTokens: 100, completionTokens: 20 }]);
	});

	it('does not report usage for subagent requests', async () => {
		const request = createMockChatRequest({
			subAgentInvocationId: 'subagent-usage-test',
			subAgentName: 'search'
		});
		const loop = instantiationService.createInstance(
			UsageTestToolCallingLoop,
			{
				conversation: createConversation(request.prompt),
				toolCallLimit: 1,
				request,
			}
		);
		disposables.add(loop);
		const stream = new UsageCapturingStream();

		await loop.runOne(stream, 0, tokenSource.token);

		expect(stream.usages).toHaveLength(0);
	});
});
