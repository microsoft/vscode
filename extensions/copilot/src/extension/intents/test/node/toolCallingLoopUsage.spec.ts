/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ChatRequest, LanguageModelChat, LanguageModelToolInformation } from 'vscode';
import { ChatFetchResponseType, ChatResponse } from '../../../../platform/chat/common/commonTypes';
import { IChatQuotaService } from '../../../../platform/chat/common/chatQuotaService';
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
	public readonly usages: Array<{ promptTokens: number; completionTokens: number; copilotCredits: number | undefined }>;

	constructor() {
		const usages: Array<{ promptTokens: number; completionTokens: number; copilotCredits: number | undefined }> = [];
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
					completionTokens: usage.completionTokens,
					copilotCredits: usage.copilotCredits
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

class CreditsTestToolCallingLoop extends ToolCallingLoop<IToolCallingLoopOptions> {
	// The quota service that, in production, chatMLFetcher records every call into.
	// The test wires the same singleton here so the fake fetch can mirror that.
	private _quota: IChatQuotaService | undefined;

	public setQuota(quota: IChatQuotaService): void {
		this._quota = quota;
	}

	protected override async buildPrompt(_buildPromptContext: IBuildPromptContext): Promise<IBuildPromptResult> {
		return {
			...nullRenderPromptResult(),
			messages: [{ role: Raw.ChatRole.User, content: [toTextPart('hello world')] }],
		};
	}

	protected override async getAvailableTools(): Promise<LanguageModelToolInformation[]> {
		return [];
	}

	// Each model call bills 5 credits (5 * 1e9 nano-AIU). Record it into the quota
	// service under the top-level turn id, exactly as chatMLFetcher does in production.
	protected override async fetch(): Promise<ChatResponse> {
		const topLevelTurnId = this.options.request.parentRequestId ?? this.options.conversation.getLatestTurn().id;
		this._quota?.setLastCopilotUsage(5_000_000_000, topLevelTurnId);
		return {
			type: ChatFetchResponseType.Success,
			value: 'test-response',
			requestId: 'request-id',
			serverRequestId: undefined,
			usage: {
				prompt_tokens: 100,
				completion_tokens: 20,
				total_tokens: 120,
				copilot_usage: { total_nano_aiu: 5_000_000_000 }
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

		expect(stream.usages).toEqual([{ promptTokens: 100, completionTokens: 20, copilotCredits: undefined }]);
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

	it('accumulates copilot credits across iterations within a turn', async () => {
		const request = createMockChatRequest();
		const loop = instantiationService.createInstance(
			CreditsTestToolCallingLoop,
			{
				conversation: createConversation(request.prompt),
				toolCallLimit: 5,
				request,
			}
		);
		loop.setQuota(accessor.get(IChatQuotaService));
		disposables.add(loop);
		const stream = new UsageCapturingStream();

		// Two model calls in the same turn: the per-request credits must be the
		// running total (5, then 10), not just the final call's 5.
		await loop.runOne(stream, 0, tokenSource.token);
		await loop.runOne(stream, 1, tokenSource.token);

		expect(stream.usages.map(u => u.copilotCredits)).toEqual([5, 10]);
	});

	it('includes subagent credits recorded under the same turn in the running total', async () => {
		const request = createMockChatRequest();
		const conversation = createConversation(request.prompt);
		const quota = accessor.get(IChatQuotaService);
		// A subagent invoked during this turn records its spend under the parent turn
		// id (chatMLFetcher keys subagent calls by the top-level turn id).
		quota.setLastCopilotUsage(3_000_000_000, conversation.getLatestTurn().id);

		const loop = instantiationService.createInstance(
			CreditsTestToolCallingLoop,
			{
				conversation,
				toolCallLimit: 1,
				request,
			}
		);
		loop.setQuota(quota);
		disposables.add(loop);
		const stream = new UsageCapturingStream();

		await loop.runOne(stream, 0, tokenSource.token);

		// The parent's own call bills 5, plus the subagent's 3 = 8.
		expect(stream.usages.map(u => u.copilotCredits)).toEqual([8]);
	});
});
